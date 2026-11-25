import { useRef, useState } from "react";

import type { BowlerMode } from "../types/biomechanics";

export interface AnalyzeOptions {
  bowlerType: BowlerMode;
  bowlingArm: "left" | "right";
  cameraView: "side" | "front";
}

interface VideoDropzoneProps {
  loading: boolean;
  error: string | null;
  onAnalyze: (file: File, options: AnalyzeOptions) => void | Promise<void>;
}

const ACCEPTED = [".mp4", ".mov", ".webm"];

function isAccepted(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED.some((extension) => name.endsWith(extension));
}

export default function VideoDropzone({
  loading,
  error,
  onAnalyze,
}: VideoDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [bowlerType, setBowlerType] = useState<BowlerMode>("pace");
  const [bowlingArm, setBowlingArm] = useState<"left" | "right">("right");
  const [cameraView, setCameraView] = useState<"side" | "front">("side");

  const choose = (next: File | null) => {
    if (!next) return;
    if (!isAccepted(next)) {
      setLocalError("Use an MP4, MOV, or WebM video.");
      return;
    }
    setLocalError(null);
    setFile(next);
  };

  const submit = () => {
    if (!file || loading) return;
    void onAnalyze(file, { bowlerType, bowlingArm, cameraView });
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-cyan-950/30">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files[0] ?? null);
        }}
        className={`flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging
            ? "border-cyan-400 bg-cyan-400/10"
            : "border-slate-700 bg-slate-950/50 hover:border-cyan-500/70"
        }`}
      >
        <span className="text-4xl" aria-hidden="true">
          🎯
        </span>
        <p className="mt-4 text-lg font-semibold text-slate-100">
          {file ? file.name : "Drop a bowling delivery video"}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          MP4, MOV, or WebM · drag and drop or click to browse
        </p>
        {file && (
          <p className="mt-1 text-xs text-slate-500">
            {(file.size / (1024 * 1024)).toFixed(1)} MB
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-slate-300">Bowler type</span>
          <select
            value={bowlerType}
            onChange={(event) => setBowlerType(event.target.value as BowlerMode)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="pace">Pace</option>
            <option value="spin">Spin</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-slate-300">Bowling arm</span>
          <select
            value={bowlingArm}
            onChange={(event) =>
              setBowlingArm(event.target.value as "left" | "right")
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-slate-300">Camera view</span>
          <select
            value={cameraView}
            onChange={(event) =>
              setCameraView(event.target.value as "side" | "front")
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="side">Side</option>
            <option value="front">Front</option>
          </select>
        </label>
      </div>

      {(localError || error) && (
        <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {localError ?? error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!file || loading}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950" />
        )}
        {loading ? "Analyzing delivery…" : "Analyze delivery"}
      </button>
    </section>
  );
}
