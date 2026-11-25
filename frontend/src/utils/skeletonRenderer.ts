import type { JointKeypoint, PoseFrame } from "../types/biomechanics";

type Point = { x: number; y: number };

export interface Viewport {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

export interface TrailPoint {
  x: number;
  y: number;
}

export interface RenderOptions {
  viewport: Viewport;
  bowlingArm: "left" | "right";
  showSkeleton: boolean;
  showAngles: boolean;
  showTrail: boolean;
  trail: TrailPoint[];
}

const CONNECTIONS: ReadonlyArray<readonly [JointKeypoint, JointKeypoint]> = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["left_wrist", "left_pinky"],
  ["left_wrist", "left_index"],
  ["left_wrist", "left_thumb"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["right_wrist", "right_pinky"],
  ["right_wrist", "right_index"],
  ["right_wrist", "right_thumb"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["left_ankle", "left_heel"],
  ["left_heel", "left_foot_index"],
  ["left_ankle", "left_foot_index"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  ["right_ankle", "right_heel"],
  ["right_heel", "right_foot_index"],
  ["right_ankle", "right_foot_index"],
  ["left_ear", "left_eye_outer"],
  ["left_eye_outer", "left_eye"],
  ["left_eye", "left_eye_inner"],
  ["left_eye_inner", "nose"],
  ["nose", "right_eye_inner"],
  ["right_eye_inner", "right_eye"],
  ["right_eye", "right_eye_outer"],
  ["right_eye_outer", "right_ear"],
  ["mouth_left", "mouth_right"],
  ["nose", "mouth_left"],
  ["nose", "mouth_right"],
];

const MIN_VISIBILITY = 0.35;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toCanvas(
  keypoint: { x: number; y: number },
  viewport: Viewport,
): Point {
  const scale = Math.min(
    viewport.width / viewport.sourceWidth,
    viewport.height / viewport.sourceHeight,
  );
  const drawWidth = viewport.sourceWidth * scale;
  const drawHeight = viewport.sourceHeight * scale;
  const offsetX = (viewport.width - drawWidth) / 2;
  const offsetY = (viewport.height - drawHeight) / 2;
  return {
    x: offsetX + keypoint.x * drawWidth,
    y: offsetY + keypoint.y * drawHeight,
  };
}

function visiblePoint(
  frame: PoseFrame,
  name: JointKeypoint,
  viewport: Viewport,
): Point | null {
  const keypoint = frame.keypoints[name];
  if (!keypoint || keypoint.visibility < MIN_VISIBILITY) return null;
  return toCanvas(keypoint, viewport);
}

function jointAngle(a: Point, joint: Point, b: Point): number {
  const ux = a.x - joint.x;
  const uy = a.y - joint.y;
  const vx = b.x - joint.x;
  const vy = b.y - joint.y;
  const magnitude = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (magnitude === 0) return 0;
  return (Math.acos(clamp((ux * vx + uy * vy) / magnitude, -1, 1)) * 180) / Math.PI;
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  joint: Point,
  a: Point,
  b: Point,
  radius: number,
  label: string,
): void {
  const start = Math.atan2(a.y - joint.y, a.x - joint.x);
  const end = Math.atan2(b.y - joint.y, b.x - joint.x);
  let delta = end - start;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  ctx.beginPath();
  ctx.arc(joint.x, joint.y, radius, start, start + delta, delta < 0);
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2;
  ctx.stroke();
  const mid = start + delta / 2;
  const lx = joint.x + Math.cos(mid) * (radius + 16);
  const ly = joint.y + Math.sin(mid) * (radius + 16);
  ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.85)";
  ctx.strokeText(label, lx, ly);
  ctx.fillStyle = "#fde68a";
  ctx.fillText(label, lx, ly);
}

function drawAngle(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  viewport: Viewport,
  shoulder: JointKeypoint,
  joint: JointKeypoint,
  wrist: JointKeypoint,
  radius: number,
): void {
  const a = visiblePoint(frame, shoulder, viewport);
  const j = visiblePoint(frame, joint, viewport);
  const b = visiblePoint(frame, wrist, viewport);
  if (!a || !j || !b) return;
  drawArc(ctx, j, a, b, radius, `${Math.round(jointAngle(a, j, b))}°`);
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: TrailPoint[],
  viewport: Viewport,
): void {
  if (trail.length < 2) return;
  for (let index = 1; index < trail.length; index += 1) {
    const previous = toCanvas(trail[index - 1], viewport);
    const current = toCanvas(trail[index], viewport);
    const progress = index / trail.length;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(current.x, current.y);
    ctx.strokeStyle = `rgba(232, 121, 249, ${0.12 + progress * 0.7})`;
    ctx.lineWidth = 1 + progress * 3;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  const tip = toCanvas(trail[trail.length - 1], viewport);
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#e879f9";
  ctx.fill();
}

export function renderSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame | null,
  options: RenderOptions,
): void {
  const { viewport } = options;
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  if (!frame) return;

  if (options.showTrail) drawTrail(ctx, options.trail, viewport);

  if (options.showSkeleton) {
    ctx.lineCap = "round";
    for (const [from, to] of CONNECTIONS) {
      const start = visiblePoint(frame, from, viewport);
      const end = visiblePoint(frame, to, viewport);
      if (!start || !end) continue;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = "rgba(34, 211, 238, 0.85)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    for (const name of Object.keys(frame.keypoints) as JointKeypoint[]) {
      const point = visiblePoint(frame, name, viewport);
      if (!point) continue;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "#f8fafc";
      ctx.fill();
      ctx.strokeStyle = "rgba(14, 116, 144, 0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  if (options.showAngles) {
    const arm = options.bowlingArm;
    const frontKnee = arm === "right" ? "left_knee" : "right_knee";
    const frontHip = arm === "right" ? "left_hip" : "right_hip";
    const frontAnkle = arm === "right" ? "left_ankle" : "right_ankle";
    drawAngle(
      ctx,
      frame,
      viewport,
      arm === "right" ? "right_shoulder" : "left_shoulder",
      arm === "right" ? "right_elbow" : "left_elbow",
      arm === "right" ? "right_wrist" : "left_wrist",
      24,
    );
    drawAngle(ctx, frame, viewport, frontHip, frontKnee, frontAnkle, 22);
  }
}
