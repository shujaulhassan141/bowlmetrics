from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from app.models.schemas import (
    AngleSample,
    AngleSeries,
    BowlerMode,
    BowlingPhase,
    JointKeypoint,
    KinematicAngle,
    PhaseSegment,
    PoseFrame,
)

BowlingArm = Literal["left", "right"]
EPSILON = 1e-9

ARM_JOINTS: dict[str, tuple[JointKeypoint, JointKeypoint, JointKeypoint]] = {
    "right": (
        JointKeypoint.RIGHT_SHOULDER,
        JointKeypoint.RIGHT_ELBOW,
        JointKeypoint.RIGHT_WRIST,
    ),
    "left": (
        JointKeypoint.LEFT_SHOULDER,
        JointKeypoint.LEFT_ELBOW,
        JointKeypoint.LEFT_WRIST,
    ),
}
FRONT_LEG_JOINTS: dict[str, tuple[JointKeypoint, JointKeypoint, JointKeypoint]] = {
    "right": (
        JointKeypoint.LEFT_HIP,
        JointKeypoint.LEFT_KNEE,
        JointKeypoint.LEFT_ANKLE,
    ),
    "left": (
        JointKeypoint.RIGHT_HIP,
        JointKeypoint.RIGHT_KNEE,
        JointKeypoint.RIGHT_ANKLE,
    ),
}


@dataclass(frozen=True)
class ModeThresholds:
    min_front_knee_ffc: float
    min_front_knee_release: float
    min_hip_shoulder_separation: float
    max_trunk_tilt: float
    max_elbow_extension: float = 15.0


MODE_THRESHOLDS: dict[BowlerMode, ModeThresholds] = {
    BowlerMode.PACE: ModeThresholds(
        min_front_knee_ffc=155.0,
        min_front_knee_release=160.0,
        min_hip_shoulder_separation=30.0,
        max_trunk_tilt=15.0,
    ),
    BowlerMode.SPIN: ModeThresholds(
        min_front_knee_ffc=130.0,
        min_front_knee_release=140.0,
        min_hip_shoulder_separation=40.0,
        max_trunk_tilt=20.0,
    ),
}


@dataclass(frozen=True)
class KinematicMetrics:
    mode: BowlerMode
    thresholds: ModeThresholds
    series: list[AngleSeries]
    elbow_extension_delta_degrees: float
    elbow_extension_horizontal_frame: int
    elbow_illegal: bool
    front_knee_ffc_degrees: float
    front_knee_release_degrees: float
    hip_shoulder_separation_degrees: float
    trunk_tilt_degrees: float


def angle_between(a: np.ndarray, b: np.ndarray, dimensions: int = 3) -> float:
    u = np.asarray(a, dtype=np.float64)[:dimensions]
    v = np.asarray(b, dtype=np.float64)[:dimensions]
    denominator = float(np.linalg.norm(u) * np.linalg.norm(v))
    if denominator < EPSILON:
        return 0.0
    cosine = float(np.dot(u, v) / denominator)
    return float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0))))


def joint_angle(
    a: np.ndarray, b: np.ndarray, c: np.ndarray, dimensions: int = 3
) -> float:
    return angle_between(
        np.asarray(a) - np.asarray(b), np.asarray(c) - np.asarray(b), dimensions
    )


def _track(frames: list[PoseFrame], keypoint: JointKeypoint) -> np.ndarray:
    return np.array(
        [
            [
                frame.keypoints[keypoint].x,
                frame.keypoints[keypoint].y,
                frame.keypoints[keypoint].z,
            ]
            for frame in frames
        ],
        dtype=np.float64,
    )


def _visibility(frames: list[PoseFrame], keypoint: JointKeypoint) -> np.ndarray:
    return np.array(
        [frame.keypoints[keypoint].visibility for frame in frames], dtype=np.float64
    )


def _row_angles(u: np.ndarray, v: np.ndarray, dimensions: int = 3) -> np.ndarray:
    left = u[:, :dimensions]
    right = v[:, :dimensions]
    denominator = np.linalg.norm(left, axis=1) * np.linalg.norm(right, axis=1)
    denominator = np.where(denominator < EPSILON, 1.0, denominator)
    cosine = np.einsum("ij,ij->i", left, right) / denominator
    return np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0)))


def _joint_series(
    frames: list[PoseFrame], joints: tuple[JointKeypoint, JointKeypoint, JointKeypoint]
) -> tuple[np.ndarray, np.ndarray]:
    first, middle, last = (_track(frames, keypoint) for keypoint in joints)
    values = _row_angles(first - middle, last - middle, 3)
    confidence = np.min([_visibility(frames, keypoint) for keypoint in joints], axis=0)
    return values, confidence


def _elbow_series(
    frames: list[PoseFrame], bowling_arm: BowlingArm
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    shoulder, elbow, wrist = (
        _track(frames, keypoint) for keypoint in ARM_JOINTS[bowling_arm]
    )
    upper_arm = shoulder - elbow
    values = _row_angles(shoulder - elbow, wrist - elbow, 3)
    confidence = np.min(
        [_visibility(frames, keypoint) for keypoint in ARM_JOINTS[bowling_arm]],
        axis=0,
    )
    horizontal = np.abs(upper_arm[:, 1]) / (
        np.linalg.norm(upper_arm[:, :2], axis=1) + EPSILON
    )
    return values, confidence, horizontal


def _hip_shoulder_series(frames: list[PoseFrame]) -> tuple[np.ndarray, np.ndarray]:
    left_hip = _track(frames, JointKeypoint.LEFT_HIP)[:, :2]
    right_hip = _track(frames, JointKeypoint.RIGHT_HIP)[:, :2]
    left_shoulder = _track(frames, JointKeypoint.LEFT_SHOULDER)[:, :2]
    right_shoulder = _track(frames, JointKeypoint.RIGHT_SHOULDER)[:, :2]
    separation = _row_angles(right_hip - left_hip, right_shoulder - left_shoulder, 2)
    separation = np.where(separation > 90.0, 180.0 - separation, separation)
    confidence = np.min(
        [
            _visibility(frames, JointKeypoint.LEFT_HIP),
            _visibility(frames, JointKeypoint.RIGHT_HIP),
            _visibility(frames, JointKeypoint.LEFT_SHOULDER),
            _visibility(frames, JointKeypoint.RIGHT_SHOULDER),
        ],
        axis=0,
    )
    return separation, confidence


def _trunk_tilt_series(frames: list[PoseFrame]) -> tuple[np.ndarray, np.ndarray]:
    hip_mid = (
        _track(frames, JointKeypoint.LEFT_HIP) + _track(frames, JointKeypoint.RIGHT_HIP)
    ) / 2.0
    shoulder_mid = (
        _track(frames, JointKeypoint.LEFT_SHOULDER)
        + _track(frames, JointKeypoint.RIGHT_SHOULDER)
    ) / 2.0
    trunk = shoulder_mid - hip_mid
    vertical = np.tile(np.array([0.0, -1.0, 0.0]), (len(frames), 1))
    tilt = _row_angles(trunk, vertical, 2)
    confidence = np.min(
        [
            _visibility(frames, JointKeypoint.LEFT_HIP),
            _visibility(frames, JointKeypoint.RIGHT_HIP),
            _visibility(frames, JointKeypoint.LEFT_SHOULDER),
            _visibility(frames, JointKeypoint.RIGHT_SHOULDER),
        ],
        axis=0,
    )
    return tilt, confidence


def _series(
    frames: list[PoseFrame],
    angle: KinematicAngle,
    values: np.ndarray,
    confidence: np.ndarray,
) -> AngleSeries:
    samples = [
        AngleSample(
            frame_index=index,
            timestamp_ms=frame.timestamp_ms,
            value_degrees=float(value),
            confidence=float(np.clip(confidence[index], 0.0, 1.0)),
        )
        for index, (frame, value) in enumerate(zip(frames, values, strict=True))
    ]
    return AngleSeries(
        angle=angle,
        samples=samples,
        peak_degrees=float(np.max(values)),
        mean_degrees=float(np.mean(values)),
    )


def _phase_frame(phases: list[PhaseSegment], phase: BowlingPhase, fallback: int) -> int:
    for segment in phases:
        if segment.phase == phase:
            return segment.start_frame
    return fallback


def elbow_extension_delta(
    frames: list[PoseFrame], release_frame: int, bowling_arm: BowlingArm = "right"
) -> tuple[float, int]:
    values, _, horizontal = _elbow_series(frames, bowling_arm)
    release = max(0, min(release_frame, len(frames) - 1))
    horizontal_frame = int(np.argmin(horizontal[: release + 1]))
    return float(values[release] - values[horizontal_frame]), horizontal_frame


def compute_metrics(
    frames: list[PoseFrame],
    phases: list[PhaseSegment],
    bowling_arm: BowlingArm = "right",
    mode: BowlerMode = BowlerMode.PACE,
) -> KinematicMetrics:
    if not frames:
        raise ValueError("Pose sequence is empty")

    thresholds = MODE_THRESHOLDS[mode]
    last = len(frames) - 1
    ffc = _phase_frame(phases, BowlingPhase.FFC, last // 2)
    release = _phase_frame(phases, BowlingPhase.RELEASE, last)

    elbow_values, elbow_confidence, _ = _elbow_series(frames, bowling_arm)
    elbow_delta, horizontal_frame = elbow_extension_delta(frames, release, bowling_arm)
    knee_values, knee_confidence = _joint_series(frames, FRONT_LEG_JOINTS[bowling_arm])
    separation_values, separation_confidence = _hip_shoulder_series(frames)
    tilt_values, tilt_confidence = _trunk_tilt_series(frames)

    return KinematicMetrics(
        mode=mode,
        thresholds=thresholds,
        series=[
            _series(
                frames, KinematicAngle.ELBOW_EXTENSION, elbow_values, elbow_confidence
            ),
            _series(
                frames, KinematicAngle.FRONT_KNEE_FLEXION, knee_values, knee_confidence
            ),
            _series(
                frames,
                KinematicAngle.HIP_SHOULDER_SEPARATION,
                separation_values,
                separation_confidence,
            ),
            _series(frames, KinematicAngle.TRUNK_TILT, tilt_values, tilt_confidence),
        ],
        elbow_extension_delta_degrees=elbow_delta,
        elbow_extension_horizontal_frame=horizontal_frame,
        elbow_illegal=elbow_delta > thresholds.max_elbow_extension,
        front_knee_ffc_degrees=float(knee_values[ffc]),
        front_knee_release_degrees=float(knee_values[release]),
        hip_shoulder_separation_degrees=float(separation_values[ffc]),
        trunk_tilt_degrees=float(tilt_values[release]),
    )
