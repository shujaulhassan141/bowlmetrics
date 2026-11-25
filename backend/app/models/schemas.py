from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ContractModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid", allow_inf_nan=False, str_strip_whitespace=True
    )


class BowlingPhase(StrEnum):
    RUN_UP = "run_up"
    BFC = "bfc"
    FFC = "ffc"
    RELEASE = "release"
    FOLLOW_THROUGH = "follow_through"


class BowlerMode(StrEnum):
    PACE = "pace"
    SPIN = "spin"


class JointKeypoint(StrEnum):
    NOSE = "nose"
    LEFT_EYE_INNER = "left_eye_inner"
    LEFT_EYE = "left_eye"
    LEFT_EYE_OUTER = "left_eye_outer"
    RIGHT_EYE_INNER = "right_eye_inner"
    RIGHT_EYE = "right_eye"
    RIGHT_EYE_OUTER = "right_eye_outer"
    LEFT_EAR = "left_ear"
    RIGHT_EAR = "right_ear"
    MOUTH_LEFT = "mouth_left"
    MOUTH_RIGHT = "mouth_right"
    LEFT_SHOULDER = "left_shoulder"
    RIGHT_SHOULDER = "right_shoulder"
    LEFT_ELBOW = "left_elbow"
    RIGHT_ELBOW = "right_elbow"
    LEFT_WRIST = "left_wrist"
    RIGHT_WRIST = "right_wrist"
    LEFT_PINKY = "left_pinky"
    RIGHT_PINKY = "right_pinky"
    LEFT_INDEX = "left_index"
    RIGHT_INDEX = "right_index"
    LEFT_THUMB = "left_thumb"
    RIGHT_THUMB = "right_thumb"
    LEFT_HIP = "left_hip"
    RIGHT_HIP = "right_hip"
    LEFT_KNEE = "left_knee"
    RIGHT_KNEE = "right_knee"
    LEFT_ANKLE = "left_ankle"
    RIGHT_ANKLE = "right_ankle"
    LEFT_HEEL = "left_heel"
    RIGHT_HEEL = "right_heel"
    LEFT_FOOT_INDEX = "left_foot_index"
    RIGHT_FOOT_INDEX = "right_foot_index"


class KinematicAngle(StrEnum):
    ELBOW_EXTENSION = "elbow_extension"
    FRONT_KNEE_FLEXION = "front_knee_flexion"
    HIP_SHOULDER_SEPARATION = "hip_shoulder_separation"
    TRUNK_TILT = "trunk_tilt"


class Keypoint(ContractModel):
    x: float
    y: float
    z: float
    visibility: float = Field(ge=0.0, le=1.0)
    presence: float = Field(default=1.0, ge=0.0, le=1.0)


class PoseFrame(ContractModel):
    frame_index: int = Field(ge=0)
    timestamp_ms: float = Field(ge=0.0)
    keypoints: dict[JointKeypoint, Keypoint] = Field(default_factory=dict)


class AngleSample(ContractModel):
    frame_index: int = Field(ge=0)
    timestamp_ms: float = Field(ge=0.0)
    value_degrees: float
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class AngleSeries(ContractModel):
    angle: KinematicAngle
    samples: list[AngleSample] = Field(default_factory=list)
    peak_degrees: float | None = None
    mean_degrees: float | None = None


class PhaseSegment(ContractModel):
    phase: BowlingPhase
    start_frame: int = Field(ge=0)
    end_frame: int = Field(ge=0)
    start_timestamp_ms: float = Field(ge=0.0)
    end_timestamp_ms: float = Field(ge=0.0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class AnalysisResult(ContractModel):
    analysis_id: str
    bowler_mode: BowlerMode
    phases: list[PhaseSegment] = Field(default_factory=list)
    angles: list[AngleSeries] = Field(default_factory=list)
    frames: list[PoseFrame] = Field(default_factory=list)
    created_at: datetime


class HealthResponse(ContractModel):
    status: Literal["ok"] = "ok"
    service: str
    version: str
    timestamp: datetime
