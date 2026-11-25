from __future__ import annotations

import math

import numpy as np
import pytest

from app.core.kinematics import compute_metrics, joint_angle
from app.core.phase_detector import detect_phases
from app.models.schemas import (
    BowlerMode,
    BowlingPhase,
    JointKeypoint,
    Keypoint,
    PhaseSegment,
    PoseFrame,
)

FPS = 30.0


def make_frame(index: int, overrides: dict[str, tuple[float, float]]) -> PoseFrame:
    keypoints = {
        name: Keypoint(x=0.5, y=0.5, z=0.0, visibility=0.9, presence=1.0)
        for name in JointKeypoint
    }
    for name, (x, y) in overrides.items():
        keypoints[JointKeypoint(name)] = Keypoint(
            x=x, y=y, z=0.0, visibility=0.95, presence=1.0
        )
    return PoseFrame(
        frame_index=index, timestamp_ms=index * 1000.0 / FPS, keypoints=keypoints
    )


def make_phases(count: int, ffc: int, release: int) -> list[PhaseSegment]:
    bounds = [
        (BowlingPhase.RUN_UP, 0, max(0, ffc - 1)),
        (BowlingPhase.BFC, ffc, max(ffc, release - 1)),
        (BowlingPhase.FFC, ffc, max(ffc, release - 1)),
        (BowlingPhase.RELEASE, release, min(count - 1, release + 2)),
        (BowlingPhase.FOLLOW_THROUGH, min(count - 1, release + 3), count - 1),
    ]
    return [
        PhaseSegment(
            phase=phase,
            start_frame=start,
            end_frame=end,
            start_timestamp_ms=start * 1000.0 / FPS,
            end_timestamp_ms=end * 1000.0 / FPS,
            confidence=0.8,
        )
        for phase, start, end in bounds
    ]


def wrist_for_elbow_angle(
    shoulder: tuple[float, float], elbow: tuple[float, float], angle_degrees: float
) -> tuple[float, float]:
    radians = math.radians(angle_degrees)
    length = 0.2
    return (
        elbow[0] - length * math.cos(radians),
        elbow[1] - length * math.sin(radians),
    )


def elbow_frames(
    count: int, start_angle: float, release_angle: float, release: int
) -> list[PoseFrame]:
    shoulder = (0.5, 0.5)
    elbow = (0.7, 0.5)
    frames = []
    for index in range(count):
        angle = start_angle if index == 0 else release_angle
        frames.append(
            make_frame(
                index,
                {
                    "right_shoulder": shoulder,
                    "right_elbow": elbow,
                    "right_wrist": wrist_for_elbow_angle(shoulder, elbow, angle),
                },
            )
        )
    return frames


def test_joint_angle_right_angle() -> None:
    assert joint_angle(
        np.array([0.0, 0.0]), np.array([0.0, -1.0]), np.array([1.0, -1.0])
    ) == pytest.approx(90.0)


def test_legal_elbow_extension_under_fifteen_degrees() -> None:
    frames = elbow_frames(60, 120.0, 133.0, release=40)
    metrics = compute_metrics(
        frames, make_phases(60, ffc=20, release=40), "right", BowlerMode.PACE
    )
    assert metrics.elbow_extension_delta_degrees == pytest.approx(13.0, abs=0.5)
    assert metrics.elbow_illegal is False


def test_illegal_elbow_extension_over_fifteen_degrees() -> None:
    frames = elbow_frames(60, 120.0, 152.0, release=40)
    metrics = compute_metrics(
        frames, make_phases(60, ffc=20, release=40), "right", BowlerMode.PACE
    )
    assert metrics.elbow_extension_delta_degrees == pytest.approx(32.0, abs=0.5)
    assert metrics.elbow_illegal is True


def test_front_knee_angle_math() -> None:
    frames = [
        make_frame(
            index,
            {
                "left_hip": (0.5, 0.3),
                "left_knee": (0.5, 0.5),
                "left_ankle": (0.7, 0.5),
            },
        )
        for index in range(60)
    ]
    metrics = compute_metrics(
        frames, make_phases(60, ffc=20, release=40), "right", BowlerMode.PACE
    )
    assert metrics.front_knee_ffc_degrees == pytest.approx(90.0)
    assert metrics.front_knee_release_degrees == pytest.approx(90.0)


def test_phase_detection_on_synthetic_trajectory() -> None:
    count = 120
    frames = []
    for index in range(count):
        back_x = 0.2 + 0.3 * min(index, 30) / 30.0
        front_x = 0.3 + 0.5 * min(max((index - 10) / 40.0, 0.0), 1.0)
        wrist_x = 0.3 + 0.4 * index / count
        if index <= 75:
            wrist_y = 0.9 - 0.7 * math.sin(math.pi * index / 75.0)
        else:
            wrist_y = 0.2 + 0.4 * (index - 75) / 10.0
        frames.append(
            make_frame(
                index,
                {
                    "left_ankle": (front_x, 0.5),
                    "right_ankle": (back_x, 0.5),
                    "left_hip": (0.2 + 0.6 * index / count, 0.4),
                    "right_hip": (0.2 + 0.6 * index / count, 0.4),
                    "right_wrist": (wrist_x, wrist_y),
                },
            )
        )

    detection = detect_phases(frames, "right", FPS)
    phases = [segment.phase for segment in detection.phases]
    assert phases == [
        BowlingPhase.RUN_UP,
        BowlingPhase.BFC,
        BowlingPhase.FFC,
        BowlingPhase.RELEASE,
        BowlingPhase.FOLLOW_THROUGH,
    ]
    assert 28 <= detection.bfc_frame <= 34
    assert 46 <= detection.ffc_frame <= 54
    assert 70 <= detection.release_frame <= 82
    assert detection.bfc_frame < detection.ffc_frame < detection.release_frame
    assert detection.phases[0].start_frame == 0
    assert detection.phases[-1].end_frame == count - 1
