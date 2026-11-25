import { useRef, useState } from "react";

import type { AnalysisProgress } from "../engine/offlineAnalyzer";
import { isMobileRuntime } from "../services/settings";
import { pickNativeVideo } from "../services/nativeVideo";
import { Capacitor } from "@capacitor/core";
import type { AnalyzeOptions, BowlerMode } from "../types/biomechanics";

export type { AnalyzeOptions };

interface VideoDropzoneProps {
  loading: boolean;
  error: string | null;
  progress?: AnalysisProgress | null;
  onAnalyze: (file: File, options: AnalyzeOptions) => void | Promise<void>;
}

const ACCEPTED = [".mp4", ".mov", ".webm", ".3gp", ".m4v"];

function isAccepted(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("video/") ||
    ACCEPTED.some((extension) => name.endsWith(extension))
  );
}

export default function VideoDropzone({
  loading,
  error,
  progress,
  onAnalyze,
}: VideoDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [nativeBusy, setNativeBusy] = useState(false);
  const [bowlerType, setBowlerType] = useState<BowlerMode>("pace");
  const [bowlingArm, setBowlingArm] = useState<"left" | "right">("right");
  const [cameraView, setCameraView] = useState<"side" | "front">("side");

  const native = Capacitor.isNativePlatform();
  const mobile = isMobileRuntime();
  const busy = loading || nativeBusy;

  const choose = (next: File | null) => {
    if (!next) return;
    if (!isAccepted(next)) {
      setLocalError("Use an MP4, MOV, WebM, or 3GP video.");
      return;
    }
    setLocalError(null);
    setFile(next);
  };

  const capture = async (source: "camera" | "gallery") => {
    setLocalError(null);
    setNativeBusy(true);
    try {
      const next = await pickNativeVideo(source);
      if (next) choose(next);
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : "Could not open the device.",
      );
    } finally {
      setNativeBusy(false);
    }
  };

  const submit = () => {
    if (!file || busy) return;
    void onAnalyze(file, { bowlerType, bowlingArm, cameraView });
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-2xl shadow-cyan-950/30 sm:p-6">
      {native && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void capture("camera")}
            disabled={busy}
            className="min-h-14 rounded-xl bg-cyan-500 px-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400"
          >
            Record delivery
          </button>
          <button
            type="button"
            onClick={() => void capture("gallery")}
            disabled={busy}
            className="min-h-14 rounded-xl border border-slate-700 px-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-500 disabled:text-slate-500"
          >
            Pick from gallery
          </button>
        </div>
      )}

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
        className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-8 text-center transition ${
          dragging
            ? "border-cyan-400 bg-cyan-400/10"
            : "border-slate-700 bg-slate-950/50 hover:border-cyan-500/70"
        }`}
      >
        <span className="text-3xl" aria-hidden="true">
          🎯
        </span>
        <p className="mt-3 text-base font-semibold text-slate-100 sm:text-lg">
          {file
            ? file.name
            : mobile
              ? "Tap to choose a bowling video"
              : "Drop a bowling delivery video"}
        </p>
        <p className="mt-2 text-xs text-slate-400 sm:text-sm">
          MP4, MOV, WebM, or 3GP · {mobile ? "browse files" : "drag and drop or browse"}
        </p>
        {file && (
          <p className="mt-1 text-xs text-slate-500">
            {(file.size / (1024 * 1024)).toFixed(1)} MB
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mp4,.mov,.webm,.3gp,.m4v"
          className="hidden"
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1.5 block font-medium text-slate-300">Bowler type</span>
          <select
            value={bowlerType}
            onChange={(event) => setBowlerType(event.target.value as BowlerMode)}
            className="min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base text-slate-100 outline-none focus:border-cyan-500"
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
            className="min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base text-slate-100 outline-none focus:border-cyan-500"
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
            className="min-h-12 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-base text-slate-100 outline-none focus:border-cyan-500"
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

      {loading && progress && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{progress.stage}</span>
            <span className="font-mono">{progress.percent}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-cyan-400 transition-[width] duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!file || busy}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950" />
        )}
        {loading ? "Analyzing delivery…" : "Analyze delivery"}
      </button>
    </section>
  );
}
