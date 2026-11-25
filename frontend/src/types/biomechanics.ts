export type BowlingPhase = "run_up" | "bfc" | "ffc" | "release" | "follow_through";

export type BowlerMode = "pace" | "spin";

export type JointKeypoint =
  | "nose"
  | "left_eye_inner"
  | "left_eye"
  | "left_eye_outer"
  | "right_eye_inner"
  | "right_eye"
  | "right_eye_outer"
  | "left_ear"
  | "right_ear"
  | "mouth_left"
  | "mouth_right"
  | "left_shoulder"
  | "right_shoulder"
  | "left_elbow"
  | "right_elbow"
  | "left_wrist"
  | "right_wrist"
  | "left_pinky"
  | "right_pinky"
  | "left_index"
  | "right_index"
  | "left_thumb"
  | "right_thumb"
  | "left_hip"
  | "right_hip"
  | "left_knee"
  | "right_knee"
  | "left_ankle"
  | "right_ankle"
  | "left_heel"
  | "right_heel"
  | "left_foot_index"
  | "right_foot_index";

export type KinematicAngle =
  | "elbow_extension"
  | "front_knee_flexion"
  | "hip_shoulder_separation"
  | "trunk_tilt";

export interface Keypoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
  presence: number;
}

export interface PoseFrame {
  frame_index: number;
  timestamp_ms: number;
  keypoints: Partial<Record<JointKeypoint, Keypoint>>;
}

/**
 * Per-frame replay snapshot derived from the cached pose landmarks: the
 * phase and the three headline angles so the broadcast player can render a
 * live biomechanics overlay without re-running MediaPipe.
 */
export interface FrameAngles {
  frame_index: number;
  timestamp_ms: number;
  phase: BowlingPhase | null;
  elbowAngle: number;
  kneeAngle: number;
  trunkTilt: number;
}

export interface AngleSample {
  frame_index: number;
  timestamp_ms: number;
  value_degrees: number;
  confidence: number;
}

export interface AngleSeries {
  angle: KinematicAngle;
  samples: AngleSample[];
  peak_degrees: number | null;
  mean_degrees: number | null;
}

export interface PhaseSegment {
  phase: BowlingPhase;
  start_frame: number;
  end_frame: number;
  start_timestamp_ms: number;
  end_timestamp_ms: number;
  confidence: number;
}

export interface AnalysisDiagnostics {
  elbow_extension_delta_degrees: number;
  elbow_illegal: boolean;
  front_knee_ffc_degrees: number;
  front_knee_release_degrees: number;
  hip_shoulder_separation_degrees: number;
  trunk_tilt_degrees: number;
  thresholds: {
    min_front_knee_ffc: number;
    min_front_knee_release: number;
    min_hip_shoulder_separation: number;
    max_trunk_tilt: number;
    max_elbow_extension: number;
  };
}

export interface FeedbackItem {
  metric: KinematicAngle;
  severity: "info" | "warning" | "critical";
  title_en: string;
  message_en: string;
  message_ur: string;
}

export type AnalysisEngine = "on-device" | "remote";

export interface AnalysisResult {
  analysis_id: string;
  bowler_mode: BowlerMode;
  phases: PhaseSegment[];
  angles: AngleSeries[];
  frames: PoseFrame[];
  /** Per-frame angles and phase derived from the cached pose landmarks. */
  frameAngles?: FrameAngles[];
  created_at: string;
  engine?: AnalysisEngine;
  diagnostics?: AnalysisDiagnostics;
  feedback?: FeedbackItem[];
  elbow_extension_delta_degrees?: number;
  front_knee_ffc_degrees?: number;
  front_knee_release_degrees?: number;
  hip_shoulder_separation_degrees?: number;
  trunk_tilt_degrees?: number;
  is_legal_elbow?: boolean;
}

export interface AnalyzeOptions {
  bowlerType: BowlerMode;
  bowlingArm: "left" | "right";
  cameraView: "side" | "front";
}

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  timestamp: string;
}
