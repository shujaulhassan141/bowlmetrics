import type { RefObject } from "react";

import type { BowlingPhase, PhaseSegment } from "../types/biomechanics";

interface PhaseTimelineBarProps {
  phases: PhaseSegment[];
  videoRef: RefObject<HTMLVideoElement>;
  currentTime: number;
  duration: number;
}

const PHASE_META: Record<BowlingPhase, { label: string; color: string }> = {
  run_up: { label: "Run-up", color: "bg-sky-500" },
  bfc: { label: "BFC", color: "bg-indigo-500" },
  ffc: { label: "FFC", color: "bg-violet-500" },
  release: { label: "Ball Release", color: "bg-amber-500" },
  follow_through: { label: "Follow-Through", color: "bg-emerald-500" },
};

const PILL_LABELS: Record<BowlingPhase, string> = {
  run_up: "Run-up",
  bfc: "BFC",
  ffc: "FFC",
  release: "Release",
  follow_through: "Follow-Through",
};

const PILL_PHASES: BowlingPhase[] = ["run_up", "bfc", "ffc", "release", "follow_through"];

export default function PhaseTimelineBar({
  phases,
  videoRef,
  currentTime,
  duration,
}: PhaseTimelineBarProps) {
  const maxEnd = phases.reduce(
    (value, phase) => Math.max(value, phase.end_timestamp_ms),
    0,
  );
  const totalMs = Math.max(duration * 1000, maxEnd, 1);
  const currentMs = currentTime * 1000;
  const active = phases.find(
    (phase) =>
      currentMs >= phase.start_timestamp_ms &&
      currentMs <= phase.end_timestamp_ms,
  );
  const markers = [...phases].sort(
    (a, b) => a.start_timestamp_ms - b.start_timestamp_ms,
  );
  const progress = Math.min(100, Math.max(0, (currentMs / totalMs) * 100));

  const seek = (timestampMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(timestampMs / 1000, video.duration || Infinity);
  };

  return (
    <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between text-sm">
        <h2 className="font-semibold text-slate-200">Phase timeline</h2>
        <span className="text-xs font-medium uppercase tracking-wider text-cyan-300">
          {active ? PHASE_META[active.phase].label : "Idle"}
        </span>
      </div>

      <div className="relative mt-2 h-24">
        <div
          className="absolute inset-x-0 top-11 h-4 cursor-pointer overflow-hidden rounded-full bg-slate-800"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(
              1,
              Math.max(0, (event.clientX - rect.left) / rect.width),
            );
            seek(ratio * totalMs);
          }}
        >
          {phases.map((phase) => (
            <div
              key={`${phase.phase}-${phase.start_frame}`}
              className={`absolute inset-y-0 opacity-40 ${PHASE_META[phase.phase].color}`}
              style={{
                left: `${(phase.start_timestamp_ms / totalMs) * 100}%`,
                width: `${((phase.end_timestamp_ms - phase.start_timestamp_ms) / totalMs) * 100}%`,
              }}
            />
          ))}
          <div
            className="absolute inset-y-0 left-0 bg-cyan-400/80"
            style={{ width: `${progress}%` }}
          />
        </div>

        {markers.map((phase, index) => {
          const percent = (phase.start_timestamp_ms / totalMs) * 100;
          const align =
            index === 0
              ? "translate-x-0"
              : index === markers.length - 1
                ? "-translate-x-full"
                : "-translate-x-1/2";
          return (
            <button
              key={`${phase.phase}-marker`}
              type="button"
              onClick={() => seek(phase.start_timestamp_ms)}
              className={`absolute top-0 flex min-h-11 w-max flex-col items-center gap-1 ${align} text-[10px] text-slate-400 transition hover:text-cyan-300 sm:text-xs`}
              style={{ left: `${percent}%` }}
            >
              <span className="whitespace-nowrap font-medium">
                {PHASE_META[phase.phase].label}
              </span>
              <span
                className={`h-3 w-3 rounded-full border-2 border-slate-950 ${PHASE_META[phase.phase].color}`}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {PILL_PHASES.map((phase) => {
          const segment = markers.find((marker) => marker.phase === phase);
          return (
            <button
              key={`pill-${phase}`}
              type="button"
              onClick={() => segment && seek(segment.start_timestamp_ms)}
              disabled={!segment}
              aria-label={`Jump to ${PILL_LABELS[phase]}`}
              className="rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300 sm:text-xs"
            >
              {PILL_LABELS[phase]}
            </button>
          );
        })}
      </div>

      <label className="mt-1 block">
        <span className="sr-only">Scrub delivery timeline</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(totalMs))}
          step={10}
          value={Math.min(Math.round(currentMs), Math.round(totalMs))}
          onChange={(event) => seek(Number(event.target.value))}
          className="h-10 w-full cursor-pointer accent-cyan-400"
          style={{ touchAction: "pan-y" }}
        />
      </label>
    </section>
  );
}
