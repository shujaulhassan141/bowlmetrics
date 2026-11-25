import { useEffect, useMemo, useRef, useState } from "react";

import AngleTimeChart from "./components/AngleTimeChart";
import BiomechanicsPlayer from "./components/BiomechanicsPlayer";
import FeedbackPanel from "./components/FeedbackPanel";
import PhaseTimelineBar from "./components/PhaseTimelineBar";
import SideBySideCompare from "./components/SideBySideCompare";
import VideoDropzone from "./components/VideoDropzone";
import WebcamRecorderModal from "./components/WebcamRecorderModal";
import type { AnalyzeOptions } from "./components/VideoDropzone";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bowlingArm, setBowlingArm] = useState<"left" | "right">("right");

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
    const form = new FormData();
    form.append("video", file);
    form.append("bowler_type", options.bowlerType);
    form.append("bowling_arm", options.bowlingArm);
    form.append("camera_view", options.cameraView);
    try {
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          detail?: unknown;
        } | null;
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : `Analysis failed (${response.status})`,
        );
      }
      const payload = (await response.json()) as AnalysisResult;
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
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setLoading(false);
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">
              Bowling Biomechanics
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Delivery analysis studio</h1>
            <p className="mt-1 text-sm text-slate-400">
              Pose overlay, phase timing, joint angles, and ICC coaching checks.
            </p>
          </div>
          {result && (
            <div className="flex flex-wrap gap-2">
              {previous && (
                <button
                  type="button"
                  onClick={() => setCompareOpen((current) => !current)}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-500 hover:text-cyan-300"
                >
                  {compareOpen ? "Hide comparison" : "Compare deliveries"}
                </button>
              )}
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-500 hover:text-cyan-300"
              >
                New analysis
              </button>
            </div>
          )}
        </header>

        {!result ? (
          <div className="mx-auto max-w-2xl space-y-4">
            <VideoDropzone loading={loading} error={error} onAnalyze={analyze} />
            <button
              type="button"
              onClick={() => setWebcamOpen(true)}
              className="w-full rounded-xl border border-slate-700 px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-cyan-500 hover:text-cyan-300"
            >
              Record a live delivery
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                {videoUrl && (
                  <BiomechanicsPlayer
                    videoRef={videoRef}
                    videoUrl={videoUrl}
                    poseFrames={poseFrames}
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
