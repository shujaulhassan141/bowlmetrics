import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { PoseFrame } from "../types/biomechanics";
import { renderSkeleton } from "../utils/skeletonRenderer";
import type { TrailPoint, Viewport } from "../utils/skeletonRenderer";

interface BiomechanicsPlayerProps {
  videoRef: RefObject<HTMLVideoElement>;
  videoUrl: string;
  poseFrames: PoseFrame[];
  fps: number;
  bowlingArm: "left" | "right";
  onTimeUpdate: (time: number) => void;
  onDuration: (duration: number) => void;
}

const SPEEDS = [0.25, 0.5, 1];

function nearestFrameIndex(frames: PoseFrame[], timeMs: number): number {
  if (frames.length === 0) return -1;
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (frames[mid].timestamp_ms < timeMs) low = mid + 1;
    else high = mid;
  }
  if (low > 0) {
    const before = Math.abs(frames[low - 1].timestamp_ms - timeMs);
    const after = Math.abs(frames[low].timestamp_ms - timeMs);
    if (before < after) return low - 1;
  }
  return low;
}

export default function BiomechanicsPlayer({
  videoRef,
  videoUrl,
  poseFrames,
  fps,
  bowlingArm,
  onTimeUpdate,
  onDuration,
}: BiomechanicsPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<Viewport>({
    width: 0,
    height: 0,
    sourceWidth: 16,
    sourceHeight: 9,
  });
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showAngles, setShowAngles] = useState(true);
  const [showTrail, setShowTrail] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setViewport((current) => ({
        ...current,
        width: rect.width,
        height: rect.height,
      }));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(viewport.width * ratio));
    canvas.height = Math.max(1, Math.round(viewport.height * ratio));
  }, [viewport.width, viewport.height]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || viewport.width === 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const draw = () => {
      const ratio = canvas.width / Math.max(1, viewport.width);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const index = nearestFrameIndex(poseFrames, video.currentTime * 1000);
      const frame = index >= 0 ? poseFrames[index] : null;
      const wrist = bowlingArm === "right" ? "right_wrist" : "left_wrist";
      const trail: TrailPoint[] = [];
      if (index >= 0) {
        for (let i = Math.max(0, index - 29); i <= index; i += 1) {
          const keypoint = poseFrames[i].keypoints[wrist];
          if (keypoint && keypoint.visibility >= 0.35) {
            trail.push({ x: keypoint.x, y: keypoint.y });
          }
        }
      }
      renderSkeleton(context, frame, {
        viewport,
        bowlingArm,
        showSkeleton,
        showAngles,
        showTrail,
        trail,
      });
    };

    draw();
    let cancelled = false;
    let handle = 0;
    const frameVideo = video;
    const supportsFrameCallback =
      typeof frameVideo.requestVideoFrameCallback === "function";
    const requestFrame = supportsFrameCallback
      ? frameVideo.requestVideoFrameCallback.bind(frameVideo)
      : null;
    const cancelFrame = supportsFrameCallback
      ? frameVideo.cancelVideoFrameCallback.bind(frameVideo)
      : null;
    const loop = () => {
      draw();
      if (cancelled) return;
      if (requestFrame) handle = requestFrame(loop);
      else handle = requestAnimationFrame(loop);
    };
    loop();
    video.addEventListener("seeked", draw);
    video.addEventListener("loadeddata", draw);
    return () => {
      cancelled = true;
      if (cancelFrame) cancelFrame(handle);
      cancelAnimationFrame(handle);
      video.removeEventListener("seeked", draw);
      video.removeEventListener("loadeddata", draw);
    };
  }, [
    videoRef,
    poseFrames,
    viewport,
    bowlingArm,
    showSkeleton,
    showAngles,
    showTrail,
  ]);

  const syncTime = () => {
    const video = videoRef.current;
    if (!video) return;
    setTime(video.currentTime);
    onTimeUpdate(video.currentTime);
  };

  const step = (direction: -1 | 1) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const limit = Number.isFinite(video.duration) ? video.duration : 0;
    video.currentTime = Math.min(
      Math.max(video.currentTime + direction / fps, 0),
      limit,
    );
    syncTime();
  };

  const changeSpeed = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = value;
    setSpeed(value);
  };

  const currentFrame = Math.max(0, Math.round(time * fps));

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-2xl shadow-cyan-950/20">
      <div
        ref={containerRef}
        className="relative aspect-video w-full bg-black"
      >
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          className="h-full w-full object-contain"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            onDuration(Number.isFinite(video.duration) ? video.duration : 0);
            setViewport((current) => ({
              ...current,
              sourceWidth: video.videoWidth || current.sourceWidth,
              sourceHeight: video.videoHeight || current.sourceHeight,
            }));
          }}
          onTimeUpdate={syncTime}
          onSeeked={syncTime}
        />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 px-4 py-3">
        <div className="mr-auto flex items-center gap-2 text-xs font-medium text-slate-400">
          <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-slate-200">
            Frame {currentFrame}
          </span>
          <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-slate-200">
            {time.toFixed(2)}s
          </span>
        </div>
        <button
          type="button"
          onClick={() => step(-1)}
          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-sm text-slate-200 hover:border-cyan-500"
          aria-label="Previous frame"
        >
          −1
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-sm text-slate-200 hover:border-cyan-500"
          aria-label="Next frame"
        >
          +1
        </button>
        <div className="mx-1 h-5 w-px bg-slate-700" />
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => changeSpeed(value)}
            className={`rounded-lg px-2.5 py-1.5 text-sm transition ${
              speed === value
                ? "bg-cyan-500 font-semibold text-slate-950"
                : "border border-slate-700 text-slate-300 hover:border-cyan-500"
            }`}
          >
            {value}x
          </button>
        ))}
        <div className="mx-1 h-5 w-px bg-slate-700" />
        {[
          { label: "Skeleton", active: showSkeleton, toggle: setShowSkeleton },
          { label: "Angles", active: showAngles, toggle: setShowAngles },
          { label: "Trail", active: showTrail, toggle: setShowTrail },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => item.toggle((current) => !current)}
            aria-pressed={item.active}
            className={`rounded-lg px-2.5 py-1.5 text-sm transition ${
              item.active
                ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/50"
                : "border border-slate-700 text-slate-400"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
