/**
 * Offline, on-device bowling analysis for Android.
 *
 * Pipeline (mirrors the FastAPI backend):
 *   video file -> MediaPipe PoseLandmarker (frame by frame)
 *   -> Butterworth smoothing -> phase detection -> kinematic metrics
 *   -> AnalysisResult consumed by the existing React UI.
 *
 * All runtime assets are bundled with the app:
 *   public/mediapipe/wasm/vision_wasm_internal.{js,wasm}
 *   public/models/pose_landmarker_lite.task
 */

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

import type {
  AnalysisResult,
  AnalyzeOptions,
  JointKeypoint,
  Keypoint,
  PoseFrame,
} from "../types/biomechanics";
import { computeMetrics } from "./kinematics";
import { smoothTrack } from "./math";
import { detectPhases } from "./phaseDetector";

export interface AnalysisProgress {
  stage: string;
  percent: number;
}

export type ProgressHandler = (progress: AnalysisProgress) => void;

const KEYPOINT_ORDER: JointKeypoint[] = [
  "nose",
  "left_eye_inner",
  "left_eye",
  "left_eye_outer",
  "right_eye_inner",
  "right_eye",
  "right_eye_outer",
  "left_ear",
  "right_ear",
  "mouth_left",
  "mouth_right",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_pinky",
  "right_pinky",
  "left_index",
  "right_index",
  "left_thumb",
  "right_thumb",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_heel",
  "right_heel",
  "left_foot_index",
  "right_foot_index",
];

const TARGET_FPS = 30;
const MAX_FRAMES = 320;
const MAX_ANALYSIS_WIDTH = 640;

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

function assetBase(): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}

async function createLandmarker(): Promise<PoseLandmarker> {
  const wasmFileset = await FilesetResolver.forVisionTasks(
    `${assetBase()}mediapipe/wasm`,
  );

  return PoseLandmarker.createFromOptions(wasmFileset, {
    baseOptions: {
      modelAssetPath: `${assetBase()}models/pose_landmarker_lite.task`,
      // CPU is the most reliable delegate inside Android WebViews and still
      // fast enough for a single delivery with the lite model.
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

function getLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker().catch((error) => {
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 1 && Number.isFinite(video.duration)) {
      resolve();
      return;
    }
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The selected video could not be opened."));
    };
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function waitForPlayable(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    video.addEventListener("canplay", () => resolve(), { once: true });
  });
}

/**
 * MediaRecorder WebM files can report `Infinity` duration. Seeking far ahead
 * forces the browser to resolve the real duration.
 */
async function resolveDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }
  await new Promise<void>((resolve) => {
    const done = () => {
      video.removeEventListener("durationchange", done);
      resolve();
    };
    video.addEventListener("durationchange", done);
    video.currentTime = 1e101;
    window.setTimeout(done, 1000);
  });
  const duration = video.duration;
  video.currentTime = 0;
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 1e-4) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, 1500);
    video.addEventListener("seeked", finish, { once: true });
    try {
      video.currentTime = Math.max(0, time);
    } catch {
      finish();
    }
  });
}

function analysisId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `offline-${Date.now().toString(16)}`;
}

export async function analyzeVideoOffline(
  file: File,
  options: AnalyzeOptions,
  onProgress?: ProgressHandler,
): Promise<AnalysisResult> {
  const report = (stage: string, percent: number) =>
    onProgress?.({ stage, percent: Math.round(percent) });

  report("Loading on-device pose model…", 2);
  const landmarker = await getLandmarker();

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  video.style.position = "fixed";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.left = "-9999px";
  document.body.appendChild(video);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: false });

  try {
    if (!context) throw new Error("Unable to create an analysis canvas.");
    report("Opening video…", 5);
    await waitForMetadata(video);
    await waitForPlayable(video);
    const duration = await resolveDuration(video);
    if (!duration) throw new Error("The selected video has no readable frames.");

    const step = Math.max(1 / TARGET_FPS, duration / MAX_FRAMES);
    const fps = 1 / step;
    const frameCount = Math.max(1, Math.floor(duration / step));

    const scale = Math.min(
      1,
      MAX_ANALYSIS_WIDTH / Math.max(1, video.videoWidth || MAX_ANALYSIS_WIDTH),
    );
    canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 360) * scale));

    const coordinates: number[][][] = [];
    const visibilities: number[][] = [];
    const presences: number[][] = [];
    let lastCoordinates = new Array(KEYPOINT_ORDER.length)
      .fill(null)
      .map(() => [0, 0, 0]);

    for (let index = 0; index < frameCount; index += 1) {
      const time = Math.min(index * step, Math.max(0, duration - 1e-3));
      await seekVideo(video, time);
      await nextFrame();
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const result = landmarker.detectForVideo(canvas, Math.round(index * (1000 / fps)));
      const landmarks = result.landmarks[0];

      if (!landmarks || landmarks.length === 0) {
        coordinates.push(lastCoordinates.map((point) => [...point]));
        visibilities.push(new Array(KEYPOINT_ORDER.length).fill(0));
        presences.push(new Array(KEYPOINT_ORDER.length).fill(0));
      } else {
        const current = landmarks.slice(0, KEYPOINT_ORDER.length).map((landmark) => [
          landmark.x,
          landmark.y,
          landmark.z,
        ]);
        lastCoordinates = current;
        coordinates.push(current.map((point) => [...point]));
        visibilities.push(
          landmarks
            .slice(0, KEYPOINT_ORDER.length)
            .map((landmark) => Math.min(1, Math.max(0, landmark.visibility ?? 0))),
        );
        presences.push(
          landmarks
            .slice(0, KEYPOINT_ORDER.length)
            .map((landmark) => Math.min(1, Math.max(0, landmark.presence ?? 1))),
        );
      }

      if (index % 5 === 0) {
        report(
          `Extracting pose ${index + 1}/${frameCount}`,
          8 + (72 * (index + 1)) / frameCount,
        );
      }
    }

    report("Smoothing joint trajectories…", 82);
    const smoothed = smoothTrack(coordinates, fps);

    const frames: PoseFrame[] = smoothed.map((frame, frameIndex) => {
      const keypoints: Partial<Record<JointKeypoint, Keypoint>> = {};
      KEYPOINT_ORDER.forEach((name, landmarkIndex) => {
        const [x, y, z] = frame[landmarkIndex];
        keypoints[name] = {
          x,
          y,
          z,
          visibility: visibilities[frameIndex][landmarkIndex],
          presence: presences[frameIndex][landmarkIndex],
        };
      });
      return {
        frame_index: frameIndex,
        timestamp_ms: (frameIndex * 1000) / fps,
        keypoints,
      };
    });

    report("Detecting bowling phases…", 88);
    const detection = detectPhases(frames, options.bowlingArm, fps);
    report("Computing biomechanics…", 94);
    const metrics = computeMetrics(
      frames,
      detection.phases,
      options.bowlingArm,
      options.bowlerType,
    );

    report("Analysis complete", 100);
    return {
      analysis_id: analysisId(),
      bowler_mode: options.bowlerType,
      phases: detection.phases,
      angles: metrics.series,
      frames,
      created_at: new Date().toISOString(),
      engine: "on-device",
      diagnostics: {
        elbow_extension_delta_degrees: metrics.elbowExtensionDeltaDegrees,
        elbow_illegal: metrics.elbowIllegal,
        front_knee_ffc_degrees: metrics.frontKneeFfcDegrees,
        front_knee_release_degrees: metrics.frontKneeReleaseDegrees,
        hip_shoulder_separation_degrees: metrics.hipShoulderSeparationDegrees,
        trunk_tilt_degrees: metrics.trunkTiltDegrees,
        thresholds: {
          min_front_knee_ffc: metrics.thresholds.minFrontKneeFfc,
          min_front_knee_release: metrics.thresholds.minFrontKneeRelease,
          min_hip_shoulder_separation: metrics.thresholds.minHipShoulderSeparation,
          max_trunk_tilt: metrics.thresholds.maxTrunkTilt,
          max_elbow_extension: metrics.thresholds.maxElbowExtension,
        },
      },
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}
