from __future__ import annotations

import os
import shutil
import threading
import urllib.request
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

POSE_LANDMARKER_MODEL_PATH = (
    Path(__file__).resolve().parents[1] / "models_data" / "pose_landmarker_full.task"
)
POSE_LANDMARKER_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_full/float16/1/pose_landmarker_full.task"
)
_MODEL_LOCK = threading.Lock()


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


def _ensure_pose_model() -> Path:
    """Return the local PoseLandmarker model, downloading it on first use."""
    if (
        POSE_LANDMARKER_MODEL_PATH.is_file()
        and POSE_LANDMARKER_MODEL_PATH.stat().st_size > 0
    ):
        return POSE_LANDMARKER_MODEL_PATH

    with _MODEL_LOCK:
        if (
            POSE_LANDMARKER_MODEL_PATH.is_file()
            and POSE_LANDMARKER_MODEL_PATH.stat().st_size > 0
        ):
            return POSE_LANDMARKER_MODEL_PATH

        POSE_LANDMARKER_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        temp_path = POSE_LANDMARKER_MODEL_PATH.with_name(
            f"{POSE_LANDMARKER_MODEL_PATH.name}.tmp"
        )
        try:
            with urllib.request.urlopen(
                POSE_LANDMARKER_MODEL_URL, timeout=60
            ) as response:
                with temp_path.open("wb") as handle:
                    shutil.copyfileobj(response, handle)
            if temp_path.stat().st_size == 0:
                raise RuntimeError("Downloaded pose model is empty")
            os.replace(temp_path, POSE_LANDMARKER_MODEL_PATH)
        except Exception as exc:
            temp_path.unlink(missing_ok=True)
            raise RuntimeError(
                "Unable to download the MediaPipe pose landmarker model. "
                f"Place it at {POSE_LANDMARKER_MODEL_PATH} or check your "
                "network connection."
            ) from exc

    return POSE_LANDMARKER_MODEL_PATH


def _landmark_value(landmark: object, name: str, default: float) -> float:
    value = getattr(landmark, name, None)
    return default if value is None else float(value)


def _read_video(video_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

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
        model_path = _ensure_pose_model()
        options = vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        last_timestamp_ms = -1
        frame_index = 0

        with vision.PoseLandmarker.create_from_options(options) as landmarker:
            while True:
                ok, frame = capture.read()
                if not ok:
                    break

                rgb_frame = np.ascontiguousarray(
                    cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                )
                mp_image = mp.Image(
                    image_format=mp.ImageFormat.SRGB, data=rgb_frame
                )
                timestamp_ms = int(round(frame_index * 1000.0 / fps))
                if timestamp_ms <= last_timestamp_ms:
                    timestamp_ms = last_timestamp_ms + 1
                last_timestamp_ms = timestamp_ms
                frame_index += 1

                result = landmarker.detect_for_video(mp_image, timestamp_ms)
                landmarks = (
                    result.pose_landmarks[0] if result.pose_landmarks else []
                )
                if len(landmarks) != len(KEYPOINT_ORDER):
                    coordinates.append(last.copy())
                    visibilities.append(
                        np.zeros(len(KEYPOINT_ORDER), dtype=np.float64)
                    )
                    presences.append(
                        np.zeros(len(KEYPOINT_ORDER), dtype=np.float64)
                    )
                    continue

                current = np.array(
                    [
                        [
                            _landmark_value(landmark, "x", 0.0),
                            _landmark_value(landmark, "y", 0.0),
                            _landmark_value(landmark, "z", 0.0),
                        ]
                        for landmark in landmarks
                    ],
                    dtype=np.float64,
                )
                coordinates.append(current)
                last = current
                visibilities.append(
                    np.array(
                        [
                            _landmark_value(landmark, "visibility", 0.0)
                            for landmark in landmarks
                        ],
                        dtype=np.float64,
                    )
                )
                presences.append(
                    np.array(
                        [
                            _landmark_value(landmark, "presence", 1.0)
                            for landmark in landmarks
                        ],
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
