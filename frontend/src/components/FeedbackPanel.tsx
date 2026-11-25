import { useState } from "react";

import type {
  AnalysisResult,
  AngleSeries,
  KinematicAngle,
} from "../types/biomechanics";

interface FeedbackPanelProps {
  result: AnalysisResult;
}

interface Metric {
  key: string;
  title: string;
  value: number | null;
  good: boolean;
  status: string;
  english: string;
  urdu: string;
}

function maxSample(series: AngleSeries | undefined): number | null {
  if (!series || series.samples.length === 0) return null;
  return series.samples.reduce(
    (value, sample) => Math.max(value, sample.value_degrees),
    Number.NEGATIVE_INFINITY,
  );
}

function meanSample(series: AngleSeries | undefined): number | null {
  if (!series || series.samples.length === 0) return null;
  return (
    series.samples.reduce((sum, sample) => sum + sample.value_degrees, 0) /
    series.samples.length
  );
}

function format(value: number | null): string {
  return value === null ? "—" : `${Math.abs(value).toFixed(1)}°`;
}

export default function FeedbackPanel({ result }: FeedbackPanelProps) {
  const [language, setLanguage] = useState<"en" | "ur">("en");
  const find = (angle: KinematicAngle) =>
    result.angles.find((series) => series.angle === angle);

  const elbow = find("elbow_extension");
  const knee = find("front_knee_flexion");
  const separation = find("hip_shoulder_separation");
  const tilt = find("trunk_tilt");
  const diagnostics = result.diagnostics;

  const elbowValue = diagnostics
    ? Math.abs(diagnostics.elbow_extension_delta_degrees)
    : (elbow?.peak_degrees ?? maxSample(elbow));
  const kneeValue = diagnostics
    ? diagnostics.front_knee_ffc_degrees
    : (knee?.peak_degrees ?? maxSample(knee));
  const separationValue = diagnostics
    ? diagnostics.hip_shoulder_separation_degrees
    : (separation?.peak_degrees ?? maxSample(separation));
  const tiltValue = diagnostics
    ? diagnostics.trunk_tilt_degrees
    : meanSample(tilt);

  const elbowGood = diagnostics
    ? !diagnostics.elbow_illegal
    : elbowValue !== null && elbowValue <= 15;
  const kneeGood = diagnostics
    ? kneeValue !== null &&
      kneeValue >= diagnostics.thresholds.min_front_knee_ffc
    : kneeValue !== null && kneeValue >= 30;
  const separationGood = diagnostics
    ? separationValue !== null &&
      separationValue >= diagnostics.thresholds.min_hip_shoulder_separation
    : separationValue !== null && separationValue >= 30;
  const tiltGood = diagnostics
    ? tiltValue !== null &&
      Math.abs(tiltValue) <= diagnostics.thresholds.max_trunk_tilt
    : tiltValue !== null && Math.abs(tiltValue) <= 25;

  const metrics: Metric[] = [
    {
      key: "elbow",
      title: "Elbow extension",
      value: elbowValue,
      good: elbowGood,
      status: elbowGood ? "ICC pass" : "ICC review",
      english: elbowGood
        ? "Elbow extension stays inside the ICC 15° allowance."
        : "Elbow extension exceeds the ICC 15° allowance. Shorten the arm action.",
      urdu: elbowGood
        ? "Elbow extension ICC ki 15° hadd ke andar hai."
        : "Elbow extension 15° se zyada hai. Arm action chhota karein.",
    },
    {
      key: "knee",
      title: "Front knee brace",
      value: kneeValue,
      good: kneeGood,
      status: kneeGood ? "Braced" : "Shallow",
      english: kneeGood
        ? "Front knee is well braced at landing for stable force transfer."
        : "Front knee flexion is shallow. Bend more on landing to brace.",
      urdu: kneeGood
        ? "Landing par front knee achhi tarah braced hai."
        : "Front knee ka flexion kam hai. Landing par zyada moden.",
    },
    {
      key: "separation",
      title: "Hip-shoulder separation",
      value: separationValue,
      good: separationGood,
      status: separationGood ? "Strong" : "Low",
      english: separationGood
        ? "Strong hip-shoulder separation is driving the delivery."
        : "Separation is low. Rotate the torso later for more power.",
      urdu: separationGood
        ? "Hip-shoulder separation achi hai, power transfer behtar hai."
        : "Separation kam hai. Torso ko der se rotate karein.",
    },
    {
      key: "tilt",
      title: "Trunk tilt",
      value: tiltValue,
      good: tiltGood,
      status: tiltGood ? "Controlled" : "Excess",
      english: tiltGood
        ? "Trunk tilt is controlled through the delivery stride."
        : "Trunk tilt is excessive. Work on side-on balance and posture.",
      urdu: tiltGood
        ? "Trunk tilt delivery ke doran control mein hai."
        : "Trunk tilt zyada hai. Balance aur posture par kaam karein.",
    },
  ];

  return (
    <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Coaching report</h2>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">
            {result.bowler_mode} bowler · {result.analysis_id.slice(0, 8)}
            {result.engine === "on-device"
              ? " · on-device"
              : result.engine === "remote"
                ? " · server"
                : ""}
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-700 p-0.5 text-xs">
          {[
            { key: "en" as const, label: "EN" },
            { key: "ur" as const, label: "Roman Urdu" },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setLanguage(option.key)}
              className={`rounded-md px-2 py-1 transition ${
                language === option.key
                  ? "bg-cyan-500 font-semibold text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`mt-4 flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
          elbowGood
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : "border-amber-500/40 bg-amber-500/10 text-amber-300"
        }`}
      >
        <span className="font-medium">ICC 15° elbow check</span>
        <span className="rounded-full border border-current px-2 py-0.5 text-xs font-semibold uppercase">
          {elbowGood ? "Pass" : "Review"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {metrics.map((metric) => (
          <article
            key={metric.key}
            className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {metric.title}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  metric.good
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {metric.status}
              </span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              {format(metric.value)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {language === "en" ? metric.english : metric.urdu}
            </p>
          </article>
        ))}
      </div>
    </aside>
  );
}
