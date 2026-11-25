/**
 * On-device kinematic metrics, ported from `backend/app/core/kinematics.py`.
 *
 * Computes the elbow-extension delta used for the ICC 15° legality check, the
 * front-knee brace angle, hip-shoulder separation and trunk tilt, along with
 * the four angle time-series consumed by the charts.
 */

import type {
  AngleSample,
  AngleSeries,
  BowlerMode,
  BowlingPhase,
  JointKeypoint,
  KinematicAngle,
  PhaseSegment,
  PoseFrame,
} from "../types/biomechanics";
import { angleBetween, rowAngles } from "./math";
import type { BowlingArm } from "./phaseDetector";

export interface ModeThresholds {
  minFrontKneeFfc: number;
  minFrontKneeRelease: number;
  minHipShoulderSeparation: number;
  maxTrunkTilt: number;
  maxElbowExtension: number;
}

export const MODE_THRESHOLDS: Record<BowlerMode, ModeThresholds> = {
  pace: {
    minFrontKneeFfc: 155,
    minFrontKneeRelease: 160,
    minHipShoulderSeparation: 30,
    maxTrunkTilt: 15,
    maxElbowExtension: 15,
  },
  spin: {
    minFrontKneeFfc: 130,
    minFrontKneeRelease: 140,
    minHipShoulderSeparation: 40,
    maxTrunkTilt: 20,
    maxElbowExtension: 15,
  },
};

export interface KinematicMetrics {
  mode: BowlerMode;
  thresholds: ModeThresholds;
  series: AngleSeries[];
  elbowExtensionDeltaDegrees: number;
  elbowExtensionHorizontalFrame: number;
  elbowIllegal: boolean;
  frontKneeFfcDegrees: number;
  frontKneeReleaseDegrees: number;
  hipShoulderSeparationDegrees: number;
  trunkTiltDegrees: number;
}

const ARM_JOINTS: Record<BowlingArm, [JointKeypoint, JointKeypoint, JointKeypoint]> = {
  right: ["right_shoulder", "right_elbow", "right_wrist"],
  left: ["left_shoulder", "left_elbow", "left_wrist"],
};

const FRONT_LEG_JOINTS: Record<
  BowlingArm,
  [JointKeypoint, JointKeypoint, JointKeypoint]
> = {
  right: ["left_hip", "left_knee", "left_ankle"],
  left: ["right_hip", "right_knee", "right_ankle"],
};

type Track = number[][];

function track(frames: PoseFrame[], keypoint: JointKeypoint): Track {
  return frames.map((frame) => {
    const point = frame.keypoints[keypoint];
    return point ? [point.x, point.y, point.z] : [0, 0, 0];
  });
}

function visibility(frames: PoseFrame[], keypoint: JointKeypoint): number[] {
  return frames.map((frame) => frame.keypoints[keypoint]?.visibility ?? 0);
}

function minVisibility(
  frames: PoseFrame[],
  keypoints: JointKeypoint[],
): number[] {
  return frames.map((_, index) =>
    Math.min(...keypoints.map((keypoint) => visibility(frames, keypoint)[index])),
  );
}

function jointSeries(
  frames: PoseFrame[],
  joints: [JointKeypoint, JointKeypoint, JointKeypoint],
): [number[], number[]] {
  const [first, middle, last] = joints.map((keypoint) =>
    track(frames, keypoint),
  );
  const values = rowAngles(
    first.map((point, index) => [
      point[0] - middle[index][0],
      point[1] - middle[index][1],
      point[2] - middle[index][2],
    ]),
    last.map((point, index) => [
      point[0] - middle[index][0],
      point[1] - middle[index][1],
      point[2] - middle[index][2],
    ]),
    3,
  );
  return [values, minVisibility(frames, joints)];
}

function elbowSeries(
  frames: PoseFrame[],
  bowlingArm: BowlingArm,
): [number[], number[], number[]] {
  const joints = ARM_JOINTS[bowlingArm];
  const [shoulder, elbow, wrist] = joints.map((keypoint) =>
    track(frames, keypoint),
  );
  const values = rowAngles(
    shoulder.map((point, index) => [
      point[0] - elbow[index][0],
      point[1] - elbow[index][1],
      point[2] - elbow[index][2],
    ]),
    wrist.map((point, index) => [
      point[0] - elbow[index][0],
      point[1] - elbow[index][1],
      point[2] - elbow[index][2],
    ]),
    3,
  );
  const horizontal = shoulder.map((point, index) => {
    const upperArm = [
      point[0] - elbow[index][0],
      point[1] - elbow[index][1],
      point[2] - elbow[index][2],
    ];
    return Math.abs(upperArm[1]) / (Math.hypot(upperArm[0], upperArm[1]) + 1e-9);
  });
  return [values, minVisibility(frames, joints), horizontal];
}

function hipShoulderSeries(frames: PoseFrame[]): [number[], number[]] {
  const leftHip = track(frames, "left_hip").map((point) => point.slice(0, 2));
  const rightHip = track(frames, "right_hip").map((point) => point.slice(0, 2));
  const leftShoulder = track(frames, "left_shoulder").map((point) =>
    point.slice(0, 2),
  );
  const rightShoulder = track(frames, "right_shoulder").map((point) =>
    point.slice(0, 2),
  );
  let separation = rowAngles(
    rightHip.map((point, index) => [
      point[0] - leftHip[index][0],
      point[1] - leftHip[index][1],
    ]),
    rightShoulder.map((point, index) => [
      point[0] - leftShoulder[index][0],
      point[1] - leftShoulder[index][1],
    ]),
    2,
  );
  separation = separation.map((value) => (value > 90 ? 180 - value : value));
  return [
    separation,
    minVisibility(frames, ["left_hip", "right_hip", "left_shoulder", "right_shoulder"]),
  ];
}

function trunkTiltSeries(frames: PoseFrame[]): [number[], number[]] {
  const leftHip = track(frames, "left_hip");
  const rightHip = track(frames, "right_hip");
  const leftShoulder = track(frames, "left_shoulder");
  const rightShoulder = track(frames, "right_shoulder");
  const trunk = leftHip.map((_, index) => [
    (leftShoulder[index][0] + rightShoulder[index][0]) / 2 -
      (leftHip[index][0] + rightHip[index][0]) / 2,
    (leftShoulder[index][1] + rightShoulder[index][1]) / 2 -
      (leftHip[index][1] + rightHip[index][1]) / 2,
  ]);
  const vertical = frames.map(() => [0, -1]);
  return [
    rowAngles(trunk, vertical, 2),
    minVisibility(frames, ["left_hip", "right_hip", "left_shoulder", "right_shoulder"]),
  ];
}

function series(
  frames: PoseFrame[],
  angle: KinematicAngle,
  values: number[],
  confidence: number[],
): AngleSeries {
  const samples: AngleSample[] = frames.map((frame, index) => ({
    frame_index: index,
    timestamp_ms: frame.timestamp_ms,
    value_degrees: values[index],
    confidence: Math.min(1, Math.max(0, confidence[index])),
  }));
  return {
    angle,
    samples,
    peak_degrees: Math.max(...values),
    mean_degrees: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

function phaseFrame(
  phases: PhaseSegment[],
  phase: BowlingPhase,
  fallback: number,
): number {
  return phases.find((segment) => segment.phase === phase)?.start_frame ?? fallback;
}

export function elbowExtensionDelta(
  frames: PoseFrame[],
  releaseFrame: number,
  bowlingArm: BowlingArm = "right",
): [number, number] {
  const [values, , horizontal] = elbowSeries(frames, bowlingArm);
  const release = Math.max(0, Math.min(releaseFrame, frames.length - 1));
  let horizontalFrame = 0;
  let smallest = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= release; index += 1) {
    if (horizontal[index] < smallest) {
      smallest = horizontal[index];
      horizontalFrame = index;
    }
  }
  return [values[release] - values[horizontalFrame], horizontalFrame];
}

export function computeMetrics(
  frames: PoseFrame[],
  phases: PhaseSegment[],
  bowlingArm: BowlingArm = "right",
  mode: BowlerMode = "pace",
): KinematicMetrics {
  if (frames.length === 0) {
    throw new Error("Pose sequence is empty");
  }

  const thresholds = MODE_THRESHOLDS[mode];
  const last = frames.length - 1;
  const ffc = phaseFrame(phases, "ffc", Math.floor(last / 2));
  const release = phaseFrame(phases, "release", last);

  const [elbowValues, elbowConfidence] = elbowSeries(frames, bowlingArm);
  const [elbowDelta, horizontalFrame] = elbowExtensionDelta(
    frames,
    release,
    bowlingArm,
  );
  const [kneeValues, kneeConfidence] = jointSeries(
    frames,
    FRONT_LEG_JOINTS[bowlingArm],
  );
  const [separationValues, separationConfidence] = hipShoulderSeries(frames);
  const [tiltValues, tiltConfidence] = trunkTiltSeries(frames);

  return {
    mode,
    thresholds,
    series: [
      series(frames, "elbow_extension", elbowValues, elbowConfidence),
      series(frames, "front_knee_flexion", kneeValues, kneeConfidence),
      series(frames, "hip_shoulder_separation", separationValues, separationConfidence),
      series(frames, "trunk_tilt", tiltValues, tiltConfidence),
    ],
    elbowExtensionDeltaDegrees: elbowDelta,
    elbowExtensionHorizontalFrame: horizontalFrame,
    elbowIllegal: elbowDelta > thresholds.maxElbowExtension,
    frontKneeFfcDegrees: kneeValues[ffc],
    frontKneeReleaseDegrees: kneeValues[release],
    hipShoulderSeparationDegrees: separationValues[ffc],
    trunkTiltDegrees: tiltValues[release],
  };
}

export { angleBetween };
