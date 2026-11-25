/**
 * On-device phase detection, ported from `backend/app/core/phase_detector.py`.
 *
 * The five bowling phases are derived from foot planting and wrist speed:
 * run-up, back-foot contact (BFC), front-foot contact (FFC), release and
 * follow-through.
 */

import type {
  BowlingPhase,
  JointKeypoint,
  PhaseSegment,
  PoseFrame,
} from "../types/biomechanics";
import { argmaxRange, convolveSame, gradient } from "./math";

export type BowlingArm = "left" | "right";

const FRONT_ANKLE: Record<BowlingArm, JointKeypoint> = {
  right: "left_ankle",
  left: "right_ankle",
};
const BACK_ANKLE: Record<BowlingArm, JointKeypoint> = {
  right: "right_ankle",
  left: "left_ankle",
};
const BOWLING_WRIST: Record<BowlingArm, JointKeypoint> = {
  right: "right_wrist",
  left: "left_wrist",
};

export interface PhaseDetection {
  phases: PhaseSegment[];
  bfcFrame: number;
  ffcFrame: number;
  releaseFrame: number;
}

function track(frames: PoseFrame[], keypoint: JointKeypoint): number[][] {
  return frames.map((frame) => {
    const point = frame.keypoints[keypoint];
    return point ? [point.x, point.y] : [0, 0];
  });
}

function centroid(frames: PoseFrame[]): number[][] {
  const left = track(frames, "left_hip");
  const right = track(frames, "right_hip");
  return left.map((point, index) => [
    (point[0] + right[index][0]) / 2,
    (point[1] + right[index][1]) / 2,
  ]);
}

function speed(trackPoints: number[][], fps: number): number[] {
  const vx = gradient(trackPoints.map((point) => point[0]));
  const vy = gradient(trackPoints.map((point) => point[1]));
  return vx.map((value, index) => Math.hypot(value, vy[index]) * fps);
}

function travelAxis(frames: PoseFrame[]): [number, number] {
  const center = centroid(frames);
  const ranges = [0, 1].map((axis) => {
    const values = center.map((point) => point[axis]);
    return Math.max(...values) - Math.min(...values);
  });
  const axis = ranges[0] >= ranges[1] ? 0 : 1;
  const first = center[0][axis];
  const last = center[center.length - 1][axis];
  const direction = Math.sign(last - first) || 1;
  return [axis, direction];
}

function firstPlanted(speedValues: number[], end: number, threshold: number): number | null {
  for (let index = Math.max(1, Math.floor(end / 4)); index < end; index += 1) {
    let planted = true;
    for (let cursor = index; cursor < end; cursor += 1) {
      if (speedValues[cursor] > threshold) {
        planted = false;
        break;
      }
    }
    if (planted) return index;
  }
  return null;
}

export function detectPhases(
  frames: PoseFrame[],
  bowlingArm: BowlingArm = "right",
  fps = 30,
): PhaseDetection {
  if (frames.length === 0) {
    throw new Error("Pose sequence is empty");
  }

  const count = frames.length;
  if (count < 4) {
    return {
      phases: [
        {
          phase: "follow_through",
          start_frame: 0,
          end_frame: count - 1,
          start_timestamp_ms: frames[0].timestamp_ms,
          end_timestamp_ms: frames[count - 1].timestamp_ms,
          confidence: 0.3,
        },
      ],
      bfcFrame: 0,
      ffcFrame: 0,
      releaseFrame: 0,
    };
  }

  const [axis, direction] = travelAxis(frames);
  const front = track(frames, FRONT_ANKLE[bowlingArm]).map(
    (point) => point[axis] * direction,
  );
  const back = track(frames, BACK_ANKLE[bowlingArm]).map(
    (point) => point[axis] * direction,
  );
  const wrist = track(frames, BOWLING_WRIST[bowlingArm]);

  const searchStart = Math.max(1, Math.floor(count / 10));
  const stride = front.map((value, index) => value - back[index]);
  let ffc = argmaxRange(stride, searchStart);
  ffc = Math.max(searchStart, Math.min(ffc, count - 2));

  const backSpeed = speed(track(frames, BACK_ANKLE[bowlingArm]), fps);
  const backPeak = Math.max(...backSpeed) || 1;
  const detectedBfc = firstPlanted(backSpeed, ffc, 0.2 * backPeak);
  const bfc = Math.max(
    0,
    Math.min(
      detectedBfc ?? ffc - Math.max(1, Math.floor(count / 8)),
      ffc - 1,
    ),
  );

  let wristSpeed = speed(wrist, fps);
  const window = Math.max(1, Math.floor(count / 20));
  wristSpeed = convolveSame(
    wristSpeed,
    new Array<number>(window).fill(1 / window),
  );

  const wristHeights = wrist.map((point) => point[1]);
  const maxHeight = Math.max(...wristHeights);
  const height = wristHeights.map((value) => maxHeight - value);
  const speedDenominator = Math.max(...wristSpeed.slice(ffc)) || 1;
  const heightDenominator = Math.max(...height.slice(ffc)) || 1;

  const releaseScore = wristSpeed.map(
    (value, index) =>
      0.6 * (value / speedDenominator) + 0.4 * (height[index] / heightDenominator),
  );
  let release = argmaxRange(releaseScore, ffc);
  release = Math.max(ffc, Math.min(release, count - 1));
  const releaseEnd = Math.min(count - 1, release + Math.max(1, Math.floor(count / 33)));

  const phases: PhaseSegment[] = [];
  const add = (
    phase: BowlingPhase,
    start: number,
    end: number,
    confidence: number,
  ) => {
    if (start > end) return;
    phases.push({
      phase,
      start_frame: start,
      end_frame: end,
      start_timestamp_ms: frames[start].timestamp_ms,
      end_timestamp_ms: frames[end].timestamp_ms,
      confidence,
    });
  };

  add("run_up", 0, bfc - 1, 0.6);
  add("bfc", bfc, ffc - 1, 0.7);
  add("ffc", ffc, release - 1, 0.75);
  add("release", release, releaseEnd, 0.7);
  add("follow_through", releaseEnd + 1, count - 1, 0.65);

  return { phases, bfcFrame: bfc, ffcFrame: ffc, releaseFrame: release };
}
