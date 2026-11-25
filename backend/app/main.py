from __future__ import annotations

import logging
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.core.feedback import generate_feedback
from app.core.kinematics import compute_metrics
from app.core.phase_detector import detect_phases
from app.core.pose_extractor import extract_pose
from app.models.schemas import AnalysisResult, BowlerMode, HealthResponse

logger = logging.getLogger(__name__)

app = FastAPI(title="Bowling Biomechanics API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=app.title,
        version=app.version,
        timestamp=datetime.now(UTC),
    )


def _store_upload(video: UploadFile) -> Path:
    suffix = Path(video.filename or "delivery.mp4").suffix or ".mp4"
    with tempfile.NamedTemporaryFile(
        prefix="bowling-", suffix=suffix, delete=False
    ) as handle:
        while chunk := video.file.read(1024 * 1024):
            handle.write(chunk)
        return Path(handle.name)


@app.post("/api/analyze", response_model=AnalysisResult)
def analyze(
    video: Annotated[UploadFile, File()],
    bowler_type: Annotated[BowlerMode, Form()] = BowlerMode.PACE,
    bowling_arm: Annotated[Literal["left", "right"], Form()] = "right",
    camera_view: Annotated[
        Literal["front", "side", "rear", "diagonal"], Form()
    ] = "side",
) -> AnalysisResult:
    if not video.filename:
        raise HTTPException(status_code=422, detail="A video file is required")

    path = _store_upload(video)
    try:
        sequence = extract_pose(path)
        detection = detect_phases(sequence.frames, bowling_arm)
        metrics = compute_metrics(
            sequence.frames, detection.phases, bowling_arm, bowler_type
        )
        tips = generate_feedback(metrics)
        analysis_id = uuid.uuid4().hex
        logger.info(
            "analysis %s completed: %d frames at %.2f fps, %d coaching tips, view=%s",
            analysis_id,
            sequence.frame_count,
            sequence.fps,
            len(tips),
            camera_view,
        )
        return AnalysisResult(
            analysis_id=analysis_id,
            bowler_mode=bowler_type,
            phases=detection.phases,
            angles=metrics.series,
            frames=sequence.frames,
            created_at=datetime.now(UTC),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        path.unlink(missing_ok=True)
