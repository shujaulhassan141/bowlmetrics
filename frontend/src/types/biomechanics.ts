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

export interface AnalysisResult {
  analysis_id: string;
  bowler_mode: BowlerMode;
  phases: PhaseSegment[];
  angles: AngleSeries[];
  frames: PoseFrame[];
  created_at: string;
}

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  timestamp: string;
}
