from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from scipy.signal import butter, sosfiltfilt

from app.models.schemas import JointKeypoint, Keypoint, PoseFrame

KEYPOINT_ORDER: tuple[JointKeypoint, ...] = tuple(JointKeypoint)
DEFAULT_FPS = 30.0
DEFAULT_CUTOFF_HZ = 6.0
FILTER_ORDER = 4


@dataclass(frozen=True)
class PoseSequence:
    frames: list[PoseFrame]
    fps: float
    frame_count: int
    duration_ms: float

    def coordinates(self) -> np.ndarray:
        return np.array(
            [
                [
                    [
                        frame.keypoints[name].x,
                        frame.keypoints[name].y,
                        frame.keypoints[name].z,
                    ]
                    for name in KEYPOINT_ORDER
                ]
                for frame in self.frames
            ],
            dtype=np.float64,
        )

    def visibilities(self) -> np.ndarray:
        return np.array(
            [
                [frame.keypoints[name].visibility for name in KEYPOINT_ORDER]
                for frame in self.frames
            ],
            dtype=np.float64,
        )


def smooth_track(
    track: np.ndarray, fps: float, cutoff_hz: float = DEFAULT_CUTOFF_HZ
) -> np.ndarray:
    samples = track.shape[0]
    nyquist = fps / 2.0
    cutoff = min(cutoff_hz, nyquist * 0.9)
    if samples < 3 * FILTER_ORDER + 3 or fps <= 0.0 or cutoff <= 0.0:
        return track
    sos = butter(FILTER_ORDER, cutoff / nyquist, btype="low", output="sos")
    padlen = min(samples - 1, 3 * (2 * FILTER_ORDER + 1))
    return sosfiltfilt(sos, track, axis=0, padlen=padlen)


def _read_video(video_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    import mediapipe as mp

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError(f"Unable to open video: {video_path.name}")

    fps = float(capture.get(cv2.CAP_PROP_FPS))
    if not np.isfinite(fps) or fps <= 1e-3:
        fps = DEFAULT_FPS

    coordinates: list[np.ndarray] = []
    visibilities: list[np.ndarray] = []
    presences: list[np.ndarray] = []
    last = np.zeros((len(KEYPOINT_ORDER), 3), dtype=np.float64)

    try:
        with mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            smooth_landmarks=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ) as pose:
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                result = pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                if result.pose_landmarks is None:
                    coordinates.append(last.copy())
                    visibilities.append(np.zeros(len(KEYPOINT_ORDER), dtype=np.float64))
                    presences.append(np.zeros(len(KEYPOINT_ORDER), dtype=np.float64))
                    continue
                landmarks = result.pose_landmarks.landmark
                current = np.array(
                    [[lm.x, lm.y, lm.z] for lm in landmarks], dtype=np.float64
                )
                coordinates.append(current)
                last = current
                visibilities.append(
                    np.array([lm.visibility for lm in landmarks], dtype=np.float64)
                )
                presences.append(
                    np.array(
                        [getattr(lm, "presence", 1.0) for lm in landmarks],
                        dtype=np.float64,
                    )
                )
    finally:
        capture.release()

    if not coordinates:
        raise ValueError("Video contains no readable frames")

    return (
        np.stack(coordinates),
        np.clip(np.stack(visibilities), 0.0, 1.0),
        np.clip(np.stack(presences), 0.0, 1.0),
        fps,
    )


def extract_pose(
    video_path: str | Path, cutoff_hz: float = DEFAULT_CUTOFF_HZ
) -> PoseSequence:
    path = Path(video_path)
    if not path.is_file():
        raise ValueError(f"Video file not found: {path.name}")

    coordinates, visibilities, presences, fps = _read_video(path)
    coordinates = smooth_track(coordinates, fps, cutoff_hz)

    frames: list[PoseFrame] = []
    for index, (xyz, visibility, presence) in enumerate(
        zip(coordinates, visibilities, presences, strict=True)
    ):
        frames.append(
            PoseFrame(
                frame_index=index,
                timestamp_ms=index * 1000.0 / fps,
                keypoints={
                    name: Keypoint(
                        x=float(xyz[i, 0]),
                        y=float(xyz[i, 1]),
                        z=float(xyz[i, 2]),
                        visibility=float(visibility[i]),
                        presence=float(presence[i]),
                    )
                    for i, name in enumerate(KEYPOINT_ORDER)
                },
            )
        )

    return PoseSequence(
        frames=frames,
        fps=fps,
        frame_count=len(frames),
        duration_ms=len(frames) * 1000.0 / fps,
    )
