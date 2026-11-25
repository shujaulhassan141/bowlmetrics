from __future__ import annotations

import json
import os
from typing import Literal

import httpx
from pydantic import BaseModel

from app.models.schemas import BowlerMode


class AICoachRequest(BaseModel):
    bowler_type: BowlerMode
    bowling_arm: Literal["left", "right"]
    elbow_delta: float
    front_knee_ffc_degrees: float
    front_knee_release_degrees: float
    hip_shoulder_separation_degrees: float
    trunk_tilt_degrees: float
    issues: list[str] = []


class AICoachResponse(BaseModel):
    ai_available: bool
    explanation_en: str = ""
    explanation_ur: str = ""
    drills_en: list[str] = []
    drills_ur: list[str] = []
    model: str = "llama-3.3-70b-versatile"


def _groq_api_key() -> str | None:
    return os.getenv("GROQ_API_KEY")


def _build_prompt(request: AICoachRequest) -> str:
    issues = "; ".join(request.issues) or "no specific issues detected"
    return f"""
You are a friendly cricket bowling coach. Answer in very simple everyday English.
Do not use medical or biomechanical jargon. Give 2-3 short actionable drills.

Context:
- Bowler type: {request.bowler_type.value}
- Bowling arm: {request.bowling_arm}
- Elbow extension delta: {request.elbow_delta:.1f} deg (limit is 15 deg)
- Front knee at front-foot contact: {request.front_knee_ffc_degrees:.1f} deg
- Front knee at release: {request.front_knee_release_degrees:.1f} deg
- Hip-shoulder separation: {request.hip_shoulder_separation_degrees:.1f} deg
- Trunk tilt at release: {request.trunk_tilt_degrees:.1f} deg
- Detected issues: {issues}

Respond with JSON only:
{{"explanation_en": "<simple English explanation>", "explanation_ur": "<natural Roman Urdu explanation>", "drills_en": ["<drill 1>", "<drill 2>"], "drills_ur": ["<drill 1>", "<drill 2>"]}}
""".strip()


def coach(request: AICoachRequest) -> AICoachResponse:
    api_key = _groq_api_key()
    if not api_key:
        return AICoachResponse(ai_available=False)

    try:
        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a friendly cricket bowling coach. Reply with plain, simple English and natural Roman Urdu. Avoid jargon.",
                    },
                    {"role": "user", "content": _build_prompt(request)},
                ],
                "temperature": 0.2,
                "max_tokens": 400,
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        return AICoachResponse(
            ai_available=True,
            explanation_en=str(parsed.get("explanation_en", "")),
            explanation_ur=str(parsed.get("explanation_ur", "")),
            drills_en=[str(item) for item in parsed.get("drills_en", [])],
            drills_ur=[str(item) for item in parsed.get("drills_ur", [])],
        )
    except Exception:
        return AICoachResponse(ai_available=False)
