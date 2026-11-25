import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

import AngleTimeChart from "./components/AngleTimeChart";
import BiomechanicsPlayer from "./components/BiomechanicsPlayer";
import FeedbackPanel from "./components/FeedbackPanel";
import PhaseTimelineBar from "./components/PhaseTimelineBar";
import SettingsModal from "./components/SettingsModal";
import SideBySideCompare from "./components/SideBySideCompare";
import VideoDropzone from "./components/VideoDropzone";
import WebcamRecorderModal from "./components/WebcamRecorderModal";
import type { AnalyzeOptions } from "./components/VideoDropzone";
import type { AnalysisProgress } from "./engine/offlineAnalyzer";
import { analyzeDelivery } from "./services/analysisService";
import { loadSettings, saveSettings } from "./services/settings";
import type { AppSettings } from "./services/settings";
import type { AnalysisResult, PoseFrame } from "./types/biomechanics";

interface Delivery {
  result: AnalysisResult;
  poseFrames: PoseFrame[];
  videoUrl: string;
  bowlingArm: "left" | "right";
}

function inferFps(result: AnalysisResult, frames: PoseFrame[]): number {
  const stamps =
    frames.length > 1
      ? frames.map((frame) => frame.timestamp_ms)
      : (result.angles.find((series) => series.samples.length > 1)?.samples.map(
          (sample) => sample.timestamp_ms,
        ) ?? []);
  if (stamps.length < 2) return 30;
  const deltas = stamps
    .slice(1)
    .map((stamp, index) => stamp - stamps[index])
    .filter((delta) => delta > 0)
    .sort((a, b) => a - b);
  if (deltas.length === 0) return 30;
  return Math.min(240, Math.max(1, Math.round(1000 / deltas[Math.floor(deltas.length / 2)])));
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const urlsRef = useRef<string[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [poseFrames, setPoseFrames] = useState<PoseFrame[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [previous, setPrevious] = useState<Delivery | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bowlingArm, setBowlingArm] = useState<"left" | "right">("right");

  const native = Capacitor.isNativePlatform();

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const fps = useMemo(
    () => (result ? inferFps(result, poseFrames) : 30),
    [result, poseFrames],
  );

  const trackUrl = (file: File): string => {
    const url = URL.createObjectURL(file);
    urlsRef.current.push(url);
    return url;
  };

  const analyze = async (file: File, options: AnalyzeOptions) => {
    setLoading(true);
    setError(null);
    setProgress({ stage: "Preparing analysis…", percent: 1 });
    try {
      const payload = await analyzeDelivery({
        file,
        options,
        settings,
        onProgress: setProgress,
      });
      if (result && videoUrl) {
        setPrevious({ result, poseFrames, videoUrl, bowlingArm });
      }
      setResult(payload);
      setPoseFrames(payload.frames ?? []);
      setVideoUrl(trackUrl(file));
      setCurrentTime(0);
      setDuration(0);
      setBowlingArm(options.bowlingArm);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : typeof (caught as { message?: unknown })?.message === "string"
            ? (caught as { message: string }).message
            : String(caught);
      setError(message);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const reset = () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = [];
    setResult(null);
    setPoseFrames([]);
    setVideoUrl(null);
    setPrevious(null);
    setCompareOpen(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  };

  const engineLabel =
    settings.engineMode === "on-device" ? "On-device offline" : "Remote FastAPI";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:py-8 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-400">
              Bowling Biomechanics
            </p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
              Delivery analysis studio
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Pose overlay, phase timing, joint angles, and ICC coaching checks.
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium text-slate-300">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  settings.engineMode === "on-device" ? "bg-emerald-400" : "bg-sky-400"
                }`}
                aria-hidden="true"
              />
              {engineLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="min-h-11 rounded-lg border border-slate-700 px-4 text-sm text-slate-300 transition hover:border-cyan-500 hover:text-cyan-300"
            >
              Settings
            </button>
            {result && (
              <>
                {previous && (
                  <button
                    type="button"
                    onClick={() => setCompareOpen((current) => !current)}
                    className="min-h-11 rounded-lg border border-slate-700 px-4 text-sm text-slate-300 transition hover:border-cyan-500 hover:text-cyan-300"
                  >
                    {compareOpen ? "Hide comparison" : "Compare deliveries"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="min-h-11 rounded-lg border border-slate-700 px-4 text-sm text-slate-300 transition hover:border-cyan-500 hover:text-cyan-300"
                >
                  New analysis
                </button>
              </>
            )}
          </div>
        </header>

        {!result ? (
          <div className="mx-auto max-w-2xl space-y-4">
            <VideoDropzone
              loading={loading}
              error={error}
              progress={progress}
              onAnalyze={analyze}
            />
            {!native && (
              <button
                type="button"
                onClick={() => setWebcamOpen(true)}
                className="min-h-12 w-full rounded-xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-cyan-500 hover:text-cyan-300"
              >
                Record a live delivery
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0">
                {videoUrl && (
                  <BiomechanicsPlayer
                    videoRef={videoRef}
                    videoUrl={videoUrl}
                    poseFrames={poseFrames}
                    frameAngles={result.frameAngles}
                    fps={fps}
                    bowlingArm={bowlingArm}
                    onTimeUpdate={setCurrentTime}
                    onDuration={setDuration}
                  />
                )}
                <PhaseTimelineBar
                  phases={result.phases}
                  videoRef={videoRef}
                  currentTime={currentTime}
                  duration={duration}
                />
              </div>
              <FeedbackPanel result={result} />
            </div>
            <AngleTimeChart result={result} videoRef={videoRef} />
            {compareOpen && previous && videoUrl && (
              <div className="mt-6">
                <SideBySideCompare
                  left={{
                    label: "Previous delivery",
                    result: previous.result,
                    videoUrl: previous.videoUrl,
                  }}
                  right={{
                    label: "Current delivery",
                    result,
                    videoUrl,
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => {
          setSettings(next);
          saveSettings(next);
        }}
      />

      <WebcamRecorderModal
        open={webcamOpen}
        loading={loading}
        onClose={() => setWebcamOpen(false)}
        onAnalyze={async (file, options) => {
          await analyze(file, options);
          setWebcamOpen(false);
        }}
      />
    </main>
  );
}
