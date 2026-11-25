/**
 * Rule-based coaching tips ported from `backend/app/core/feedback.py`.
 *
 * This runs on the phone in on-device mode and returns the same English and
 * Roman Urdu tips the backend returns over the wire, so the Coaching report is
 * identical in both modes.
 */

import type { FeedbackItem } from "../types/biomechanics";
import type { KinematicMetrics } from "./kinematics";

export function generateFeedback(metrics: KinematicMetrics): FeedbackItem[] {
  const tips: FeedbackItem[] = [];
  const thresholds = metrics.thresholds;

  if (metrics.elbowIllegal) {
    tips.push({
      metric: "elbow_extension",
      severity: "critical",
      title_en: "Illegal elbow extension",
      message_en: `Elbow extension is ${metrics.elbowExtensionDeltaDegrees.toFixed(1)}°, above the 15° ICC limit. Keep the bowling arm straighter through the upper-arm horizontal position and release.`,
      message_ur: `Elbow ${metrics.elbowExtensionDeltaDegrees.toFixed(1)}° extend ho raha hai jo 15° ICC limit se zyada hai. Upper-arm horizontal position se release tak bowling arm ko seedha rakhein.`,
    });
  } else {
    tips.push({
      metric: "elbow_extension",
      severity: "info",
      title_en: "Legal elbow action",
      message_en: `Elbow extension is ${metrics.elbowExtensionDeltaDegrees.toFixed(1)}°, within the 15° limit. Maintain this arm path under match intensity.`,
      message_ur: `Elbow extension ${metrics.elbowExtensionDeltaDegrees.toFixed(1)}° hai jo 15° limit ke andar hai. Match pressure mein bhi isi arm path ko barqarar rakhein.`,
    });
  }

  if (metrics.frontKneeFfcDegrees < thresholds.minFrontKneeFfc) {
    tips.push({
      metric: "front_knee_flexion",
      severity: "warning",
      title_en: "Front knee collapses at contact",
      message_en: `Front knee is ${metrics.frontKneeFfcDegrees.toFixed(1)}° at front-foot contact; target at least ${thresholds.minFrontKneeFfc.toFixed(0)}° for a braced landing.`,
      message_ur: `Front-foot contact par front knee ${metrics.frontKneeFfcDegrees.toFixed(1)}° hai; braced landing ke liye kam az kam ${thresholds.minFrontKneeFfc.toFixed(0)}° target karein.`,
    });
  }

  if (metrics.frontKneeReleaseDegrees < thresholds.minFrontKneeRelease) {
    tips.push({
      metric: "front_knee_flexion",
      severity: "warning",
      title_en: "Front leg loses bracing at release",
      message_en: `Front knee is ${metrics.frontKneeReleaseDegrees.toFixed(1)}° at release; hold it near ${thresholds.minFrontKneeRelease.toFixed(0)}° to transfer run-up momentum upward.`,
      message_ur: `Release par front knee ${metrics.frontKneeReleaseDegrees.toFixed(1)}° hai; run-up ki momentum upar transfer karne ke liye ise ${thresholds.minFrontKneeRelease.toFixed(0)}° ke qareeb rakhein.`,
    });
  }

  if (metrics.hipShoulderSeparationDegrees < thresholds.minHipShoulderSeparation) {
    tips.push({
      metric: "hip_shoulder_separation",
      severity: "warning",
      title_en: "Limited hip-shoulder separation",
      message_en: `Hip-shoulder separation is ${metrics.hipShoulderSeparationDegrees.toFixed(1)}° at front-foot contact; aim for ${thresholds.minHipShoulderSeparation.toFixed(0)}° or more by delaying the shoulders.`,
      message_ur: `Front-foot contact par hip-shoulder separation ${metrics.hipShoulderSeparationDegrees.toFixed(1)}° hai; shoulders ko thora rok kar ${thresholds.minHipShoulderSeparation.toFixed(0)}° ya zyada tak le jayein.`,
    });
  }

  if (metrics.trunkTiltDegrees > thresholds.maxTrunkTilt) {
    tips.push({
      metric: "trunk_tilt",
      severity: "warning",
      title_en: "Excessive trunk lateral tilt",
      message_en: `Trunk tilt is ${metrics.trunkTiltDegrees.toFixed(1)}° at release; stay below ${thresholds.maxTrunkTilt.toFixed(0)}° to keep the head and front shoulder aligned.`,
      message_ur: `Release par trunk tilt ${metrics.trunkTiltDegrees.toFixed(1)}° hai; head aur front shoulder ko aligned rakhne ke liye ${thresholds.maxTrunkTilt.toFixed(0)}° se neeche rakhein.`,
    });
  }

  return tips;
}
