import { useEffect, useRef, useState } from "react";

import type { BowlerMode } from "../types/biomechanics";
import type { AnalyzeOptions } from "./VideoDropzone";

interface WebcamRecorderModalProps {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onAnalyze: (file: File, options: AnalyzeOptions) => void | Promise<void>;
}

function extensionFor(type: string): string {
  return type.includes("mp4") ? "mp4" : "webm";
}

export default function WebcamRecorderModal({
  open,
  loading,
  onClose,
  onAnalyze,
}: WebcamRecorderModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<{ blob: Blob; url: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [bowlerType, setBowlerType] = useState<BowlerMode>("pace");
  const [bowlingArm, setBowlingArm] = useState<"left" | "right">("right");
  const [cameraView, setCameraView] = useState<"side" | "front">("side");

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setError(null);
    setRecorded(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((next) => {
        if (cancelled) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        if (videoRef.current) videoRef.current.srcObject = next;
      })
      .catch(() => setError("Camera access was denied."));
    return () => {
      cancelled = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (recorded) URL.revokeObjectURL(recorded.url);
    };
  }, [recorded]);

  const start = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (!stream) return;
    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "video/webm",
      });
      setRecorded({ blob, url: URL.createObjectURL(blob) });
      setRecording(false);
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecorded(null);
    setError(null);
    setRecording(true);
  };

  const stop = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  };

  const submit = () => {
    if (!recorded || loading) return;
    const type = recorded.blob.type || "video/webm";
    const file = new File(
      [recorded.blob],
      `live-delivery.${extensionFor(type)}`,
      { type },
    );
    void onAnalyze(file, { bowlerType, bowlingArm, cameraView });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Record live delivery</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-cyan-500"
          >
            Close
          </button>
        </header>

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`aspect-video w-full object-contain ${recorded ? "hidden" : ""}`}
          />
          {recorded && (
            <video
              src={recorded.url}
              controls
              playsInline
              className="aspect-video w-full object-contain"
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={recording ? stop : start}
            disabled={Boolean(recorded) || loading}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 ${
              recording
                ? "bg-rose-500 text-white hover:bg-rose-400"
                : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
            }`}
          >
            {recording ? "Stop recording" : "Start recording"}
          </button>
          {recorded && (
            <button
              type="button"
              onClick={() => {
                setRecorded(null);
                start();
              }}
              disabled={loading}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-cyan-500"
            >
              Record again
            </button>
          )}
          {recording && (
            <span className="flex items-center gap-2 text-sm text-rose-300">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
              Recording
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-slate-300">
              Bowler type
            </span>
            <select
              value={bowlerType}
              onChange={(event) =>
                setBowlerType(event.target.value as BowlerMode)
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            >
              <option value="pace">Pace</option>
              <option value="spin">Spin</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-slate-300">
              Bowling arm
            </span>
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
            <span className="mb-1.5 block font-medium text-slate-300">
              Camera view
            </span>
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

        {error && (
          <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!recorded || loading || recording}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {loading && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/40 border-t-slate-950" />
          )}
          {loading ? "Analyzing delivery…" : "Analyze recording"}
        </button>
      </section>
    </div>
  );
}
