from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.core.kinematics import KinematicMetrics
from app.models.schemas import KinematicAngle

Severity = Literal["info", "warning", "critical"]


@dataclass(frozen=True)
class FeedbackTip:
    metric: KinematicAngle
    severity: Severity
    title_en: str
    message_en: str
    message_ur: str


def generate_feedback(metrics: KinematicMetrics) -> list[FeedbackTip]:
    thresholds = metrics.thresholds
    tips: list[FeedbackTip] = []

    if metrics.elbow_illegal:
        tips.append(
            FeedbackTip(
                metric=KinematicAngle.ELBOW_EXTENSION,
                severity="critical",
                title_en="Illegal elbow extension",
                message_en=(
                    f"Elbow extension is {metrics.elbow_extension_delta_degrees:.1f}°, above the 15° ICC limit. "
                    "Keep the bowling arm straighter through the upper-arm horizontal position and release."
                ),
                message_ur=(
                    f"Elbow {metrics.elbow_extension_delta_degrees:.1f}° extend ho raha hai jo 15° ICC limit se zyada hai. "
                    "Upper-arm horizontal position se release tak bowling arm ko seedha rakhein."
                ),
            )
        )
    else:
        tips.append(
            FeedbackTip(
                metric=KinematicAngle.ELBOW_EXTENSION,
                severity="info",
                title_en="Legal elbow action",
                message_en=(
                    f"Elbow extension is {metrics.elbow_extension_delta_degrees:.1f}°, within the 15° limit. "
                    "Maintain this arm path under match intensity."
                ),
                message_ur=(
                    f"Elbow extension {metrics.elbow_extension_delta_degrees:.1f}° hai jo 15° limit ke andar hai. "
                    "Match pressure mein bhi isi arm path ko barqarar rakhein."
                ),
            )
        )

    if metrics.front_knee_ffc_degrees < thresholds.min_front_knee_ffc:
        tips.append(
            FeedbackTip(
                metric=KinematicAngle.FRONT_KNEE_FLEXION,
                severity="warning",
                title_en="Front knee collapses at contact",
                message_en=(
                    f"Front knee is {metrics.front_knee_ffc_degrees:.1f}° at front-foot contact; "
                    f"target at least {thresholds.min_front_knee_ffc:.0f}° for a braced landing."
                ),
                message_ur=(
                    f"Front-foot contact par front knee {metrics.front_knee_ffc_degrees:.1f}° hai; "
                    f"braced landing ke liye kam az kam {thresholds.min_front_knee_ffc:.0f}° target karein."
                ),
            )
        )

    if metrics.front_knee_release_degrees < thresholds.min_front_knee_release:
        tips.append(
            FeedbackTip(
                metric=KinematicAngle.FRONT_KNEE_FLEXION,
                severity="warning",
                title_en="Front leg loses bracing at release",
                message_en=(
                    f"Front knee is {metrics.front_knee_release_degrees:.1f}° at release; "
                    f"hold it near {thresholds.min_front_knee_release:.0f}° to transfer run-up momentum upward."
                ),
                message_ur=(
                    f"Release par front knee {metrics.front_knee_release_degrees:.1f}° hai; "
                    f"run-up ki momentum upar transfer karne ke liye ise {thresholds.min_front_knee_release:.0f}° ke qareeb rakhein."
                ),
            )
        )

    if metrics.hip_shoulder_separation_degrees < thresholds.min_hip_shoulder_separation:
        tips.append(
            FeedbackTip(
                metric=KinematicAngle.HIP_SHOULDER_SEPARATION,
                severity="warning",
                title_en="Limited hip-shoulder separation",
                message_en=(
                    f"Hip-shoulder separation is {metrics.hip_shoulder_separation_degrees:.1f}° at front-foot contact; "
                    f"aim for {thresholds.min_hip_shoulder_separation:.0f}° or more by delaying the shoulders."
                ),
                message_ur=(
                    f"Front-foot contact par hip-shoulder separation {metrics.hip_shoulder_separation_degrees:.1f}° hai; "
                    f"shoulders ko thora rok kar {thresholds.min_hip_shoulder_separation:.0f}° ya zyada tak le jayein."
                ),
            )
        )

    if metrics.trunk_tilt_degrees > thresholds.max_trunk_tilt:
        tips.append(
            FeedbackTip(
                metric=KinematicAngle.TRUNK_TILT,
                severity="warning",
                title_en="Excessive trunk lateral tilt",
                message_en=(
                    f"Trunk tilt is {metrics.trunk_tilt_degrees:.1f}° at release; "
                    f"stay below {thresholds.max_trunk_tilt:.0f}° to keep the head and front shoulder aligned."
                ),
                message_ur=(
                    f"Release par trunk tilt {metrics.trunk_tilt_degrees:.1f}° hai; "
                    f"head aur front shoulder ko aligned rakhne ke liye {thresholds.max_trunk_tilt:.0f}° se neeche rakhein."
                ),
            )
        )

    return tips
