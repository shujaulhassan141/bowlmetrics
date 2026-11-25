import { useRef } from "react";

import type { AnalysisResult, KinematicAngle } from "../types/biomechanics";

export interface CompareDelivery {
  label: string;
  result: AnalysisResult;
  videoUrl: string;
}

interface SideBySideCompareProps {
  left: CompareDelivery;
  right: CompareDelivery;
}

const ANGLE_LABELS: Record<KinematicAngle, string> = {
  elbow_extension: "Elbow extension",
  front_knee_flexion: "Front knee flexion",
  hip_shoulder_separation: "Hip-shoulder separation",
  trunk_tilt: "Trunk tilt",
};

function formatDegrees(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}°`;
}

export default function SideBySideCompare({
  left,
  right,
}: SideBySideCompareProps) {
  const leftVideoRef = useRef<HTMLVideoElement>(null);
  const rightVideoRef = useRef<HTMLVideoElement>(null);
  const angles = Array.from(
    new Set([
      ...left.result.angles.map((series) => series.angle),
      ...right.result.angles.map((series) => series.angle),
    ]),
  );

  const sync = (source: HTMLVideoElement, target: HTMLVideoElement | null) => {
    if (!target) return;
    if (Math.abs(target.currentTime - source.currentTime) > 0.05) {
      target.currentTime = source.currentTime;
    }
  };

  const playBoth = () => {
    void leftVideoRef.current?.play();
    void rightVideoRef.current?.play();
  };

  const pauseBoth = () => {
    leftVideoRef.current?.pause();
    rightVideoRef.current?.pause();
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-2xl shadow-cyan-950/20">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Delivery comparison</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={playBoth}
            className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Play both
          </button>
          <button
            type="button"
            onClick={pauseBoth}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-500"
          >
            Pause both
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { delivery: left, ref: leftVideoRef },
          { delivery: right, ref: rightVideoRef },
        ].map(({ delivery, ref }) => (
          <div key={delivery.label}>
            <p className="mb-2 text-sm font-medium text-slate-300">
              {delivery.label}
            </p>
            <video
              ref={ref}
              src={delivery.videoUrl}
              controls
              playsInline
              className="aspect-video w-full rounded-xl border border-slate-800 bg-black object-contain"
              onTimeUpdate={(event) =>
                sync(
                  event.currentTarget,
                  ref === leftVideoRef
                    ? rightVideoRef.current
                    : leftVideoRef.current,
                )
              }
              onPlay={() => {
                const other =
                  ref === leftVideoRef
                    ? rightVideoRef.current
                    : leftVideoRef.current;
                void other?.play();
              }}
              onPause={() => {
                const other =
                  ref === leftVideoRef
                    ? rightVideoRef.current
                    : leftVideoRef.current;
                other?.pause();
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-4 font-medium">Metric</th>
              <th className="py-2 pr-4 font-medium">{left.label}</th>
              <th className="py-2 font-medium">{right.label}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {angles.map((angle) => {
              const leftSeries = left.result.angles.find(
                (series) => series.angle === angle,
              );
              const rightSeries = right.result.angles.find(
                (series) => series.angle === angle,
              );
              return (
                <tr key={angle}>
                  <td className="py-2 pr-4 text-slate-300">
                    {ANGLE_LABELS[angle]} peak
                  </td>
                  <td className="py-2 pr-4 font-mono text-cyan-300">
                    {formatDegrees(leftSeries?.peak_degrees ?? null)}
                  </td>
                  <td className="py-2 font-mono text-fuchsia-300">
                    {formatDegrees(rightSeries?.peak_degrees ?? null)}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="py-2 pr-4 text-slate-300">Phases detected</td>
              <td className="py-2 pr-4 font-mono text-cyan-300">
                {left.result.phases.length}
              </td>
              <td className="py-2 font-mono text-fuchsia-300">
                {right.result.phases.length}
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-4 text-slate-300">Frames tracked</td>
              <td className="py-2 pr-4 font-mono text-cyan-300">
                {left.result.frames.length}
              </td>
              <td className="py-2 font-mono text-fuchsia-300">
                {right.result.frames.length}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
