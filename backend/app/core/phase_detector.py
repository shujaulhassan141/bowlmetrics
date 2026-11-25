from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from app.models.schemas import BowlingPhase, JointKeypoint, PhaseSegment, PoseFrame

BowlingArm = Literal["left", "right"]

FRONT_ANKLE: dict[str, JointKeypoint] = {
    "right": JointKeypoint.LEFT_ANKLE,
    "left": JointKeypoint.RIGHT_ANKLE,
}
BACK_ANKLE: dict[str, JointKeypoint] = {
    "right": JointKeypoint.RIGHT_ANKLE,
    "left": JointKeypoint.LEFT_ANKLE,
}
BOWLING_WRIST: dict[str, JointKeypoint] = {
    "right": JointKeypoint.RIGHT_WRIST,
    "left": JointKeypoint.LEFT_WRIST,
}
HIP_CENTER: tuple[JointKeypoint, JointKeypoint] = (
    JointKeypoint.LEFT_HIP,
    JointKeypoint.RIGHT_HIP,
)


@dataclass(frozen=True)
class PhaseDetection:
    phases: list[PhaseSegment]
    bfc_frame: int
    ffc_frame: int
    release_frame: int


def _track(frames: list[PoseFrame], keypoint: JointKeypoint) -> np.ndarray:
    return np.array(
        [
            [frame.keypoints[keypoint].x, frame.keypoints[keypoint].y]
            for frame in frames
        ],
        dtype=np.float64,
    )


def _centroid(frames: list[PoseFrame]) -> np.ndarray:
    return np.mean([_track(frames, keypoint) for keypoint in HIP_CENTER], axis=0)


def _speed(track: np.ndarray, fps: float) -> np.ndarray:
    velocity = np.gradient(track, axis=0) * fps
    return np.linalg.norm(velocity, axis=1)


def _travel_axis(frames: list[PoseFrame]) -> tuple[int, float]:
    centroid = _centroid(frames)
    ranges = np.ptp(centroid, axis=0)
    axis = int(np.argmax(ranges))
    direction = float(np.sign(centroid[-1, axis] - centroid[0, axis])) or 1.0
    return axis, direction


def _first_planted(speed: np.ndarray, end: int, threshold: float) -> int | None:
    for index in range(max(1, end // 4), end):
        if np.all(speed[index:end] <= threshold):
            return index
    return None


def detect_phases(
    frames: list[PoseFrame], bowling_arm: BowlingArm = "right", fps: float = 30.0
) -> PhaseDetection:
    if not frames:
        raise ValueError("Pose sequence is empty")
    count = len(frames)
    if count < 4:
        segment = PhaseSegment(
            phase=BowlingPhase.FOLLOW_THROUGH,
            start_frame=0,
            end_frame=count - 1,
            start_timestamp_ms=frames[0].timestamp_ms,
            end_timestamp_ms=frames[-1].timestamp_ms,
            confidence=0.3,
        )
        return PhaseDetection(
            phases=[segment], bfc_frame=0, ffc_frame=0, release_frame=0
        )

    axis, direction = _travel_axis(frames)
    front = _track(frames, FRONT_ANKLE[bowling_arm])[:, axis] * direction
    back = _track(frames, BACK_ANKLE[bowling_arm])[:, axis] * direction
    wrist = _track(frames, BOWLING_WRIST[bowling_arm])

    search_start = max(1, count // 10)
    stride = front - back
    ffc = int(np.argmax(stride[search_start:]) + search_start)
    ffc = max(search_start, min(ffc, count - 2))

    back_speed = _speed(_track(frames, BACK_ANKLE[bowling_arm]), fps)
    back_peak = float(np.max(back_speed)) or 1.0
    bfc = _first_planted(back_speed, ffc, 0.2 * back_peak)
    bfc = max(0, min(bfc if bfc is not None else ffc - max(1, count // 8), ffc - 1))

    wrist_speed = _speed(wrist, fps)
    window = max(1, count // 20)
    wrist_speed = np.convolve(wrist_speed, np.ones(window) / window, mode="same")
    height = np.max(wrist[:, 1]) - wrist[:, 1]
    speed_norm = wrist_speed / (float(np.max(wrist_speed[ffc:])) or 1.0)
    height_norm = height / (float(np.max(height[ffc:])) or 1.0)
    release_score = 0.6 * speed_norm + 0.4 * height_norm
    release = int(np.argmax(release_score[ffc:]) + ffc)
    release = max(ffc, min(release, count - 1))

    release_end = min(count - 1, release + max(1, count // 33))

    phases: list[PhaseSegment] = []

    def add(phase: BowlingPhase, start: int, end: int, confidence: float) -> None:
        if start > end:
            return
        phases.append(
            PhaseSegment(
                phase=phase,
                start_frame=start,
                end_frame=end,
                start_timestamp_ms=frames[start].timestamp_ms,
                end_timestamp_ms=frames[end].timestamp_ms,
                confidence=confidence,
            )
        )

    add(BowlingPhase.RUN_UP, 0, bfc - 1, 0.6)
    add(BowlingPhase.BFC, bfc, ffc - 1, 0.7)
    add(BowlingPhase.FFC, ffc, release - 1, 0.75)
    add(BowlingPhase.RELEASE, release, release_end, 0.7)
    add(BowlingPhase.FOLLOW_THROUGH, release_end + 1, count - 1, 0.65)

    return PhaseDetection(
        phases=phases, bfc_frame=bfc, ffc_frame=ffc, release_frame=release
    )
