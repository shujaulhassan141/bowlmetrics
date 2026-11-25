/**
 * Shared numeric helpers for the on-device biomechanics engine.
 *
 * These functions intentionally mirror `backend/app/core/pose_extractor.py`
 * and `backend/app/core/kinematics.py` so the offline Android result matches
 * the FastAPI server result as closely as the browser runtime allows.
 */

export type Vec3 = [number, number, number];

export const EPSILON = 1e-9;
export const DEFAULT_CUTOFF_HZ = 6.0;
export const FILTER_ORDER = 4;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function angleBetween(a: Vec3, b: Vec3, dimensions = 3): number {
  const u = a.slice(0, dimensions);
  const v = b.slice(0, dimensions);
  const norm = (vector: number[]) =>
    Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  const denominator = norm(u) * norm(v);
  if (denominator < EPSILON) return 0;
  const dot = u.reduce((sum, value, index) => sum + value * (v[index] ?? 0), 0);
  return (Math.acos(clamp(dot / denominator, -1, 1)) * 180) / Math.PI;
}

export function jointAngle(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  dimensions = 3,
): number {
  const u: Vec3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const v: Vec3 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  return angleBetween(u, v, dimensions);
}

/** Per-row angle between two arrays of vectors. */
export function rowAngles(
  u: number[][],
  v: number[][],
  dimensions = 3,
): number[] {
  return u.map((row, index) => {
    let uu = 0;
    let vv = 0;
    for (let axis = 0; axis < dimensions; axis += 1) {
      uu += row[axis] * row[axis];
      vv += v[index][axis] * v[index][axis];
    }
    const denominator = Math.sqrt(uu) * Math.sqrt(vv);
    if (denominator < EPSILON) return 0;
    let dot = 0;
    for (let axis = 0; axis < dimensions; axis += 1) {
      dot += row[axis] * v[index][axis];
    }
    return (Math.acos(clamp(dot / denominator, -1, 1)) * 180) / Math.PI;
  });
}

/**
 * 4th-order Butterworth low-pass applied forward and backward (zero phase),
 * matching the intent of SciPy's `sosfiltfilt` in the Python backend.
 */
export function smoothTrack(
  track: number[][][],
  fps: number,
  cutoffHz = DEFAULT_CUTOFF_HZ,
): number[][][] {
  const samples = track.length;
  const nyquist = fps / 2.0;
  const cutoff = Math.min(cutoffHz, nyquist * 0.9);
  if (samples < 3 * FILTER_ORDER + 3 || fps <= 0 || cutoff <= 0) {
    return track;
  }

  const output = track.map((frame) => frame.map((point) => [...point]));
  const landmarkCount = track[0].length;
  const qValues = [0.5411961, 1.306563];

  for (let landmark = 0; landmark < landmarkCount; landmark += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      let values = track.map((frame) => frame[landmark][axis]);
      for (const q of qValues) {
        values = filtfiltBiquad(values, fps, cutoff, q);
      }
      for (let index = 0; index < samples; index += 1) {
        output[index][landmark][axis] = values[index];
      }
    }
  }
  return output;
}

function filtfiltBiquad(
  input: number[],
  sampleRate: number,
  cutoffHz: number,
  q: number,
): number[] {
  const pad = Math.min(12, input.length - 1);
  const padded = [
    ...input.slice(1, pad + 1).reverse(),
    ...input,
    ...input.slice(-pad - 1, -1).reverse(),
  ];
  const forward = biquadLowpass(padded, sampleRate, cutoffHz, q);
  const backward = biquadLowpass([...forward].reverse(), sampleRate, cutoffHz, q);
  return backward.reverse().slice(pad, pad + input.length);
}

function biquadLowpass(
  input: number[],
  sampleRate: number,
  cutoffHz: number,
  q: number,
): number[] {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * q);

  const b0 = (1 - cosW0) / 2;
  const b1 = 1 - cosW0;
  const b2 = (1 - cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  let x1 = input[0] ?? 0;
  let x2 = input[0] ?? 0;
  let y1 = input[0] ?? 0;
  let y2 = input[0] ?? 0;
  const output = new Array<number>(input.length);

  for (let index = 0; index < input.length; index += 1) {
    const x0 = input[index];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    output[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

/** NumPy-compatible central-difference gradient (edge samples first-order). */
export function gradient(values: number[]): number[] {
  const count = values.length;
  if (count === 0) return [];
  if (count === 1) return [0];
  const output = new Array<number>(count);
  output[0] = values[1] - values[0];
  output[count - 1] = values[count - 1] - values[count - 2];
  for (let index = 1; index < count - 1; index += 1) {
    output[index] = (values[index + 1] - values[index - 1]) / 2;
  }
  return output;
}

/** NumPy `convolve(..., mode="same")` for a shorter kernel. */
export function convolveSame(values: number[], kernel: number[]): number[] {
  if (values.length === 0 || kernel.length === 0) return values.slice();
  const offset = Math.floor((kernel.length - 1) / 2);
  return values.map((_, index) => {
    let total = 0;
    for (let k = 0; k < kernel.length; k += 1) {
      const source = values[index + k - offset];
      if (source !== undefined) total += source * kernel[k];
    }
    return total;
  });
}

export function argmaxRange(values: number[], start: number, end = values.length): number {
  let bestIndex = start;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let index = start; index < end; index += 1) {
    if (values[index] > bestValue) {
      bestValue = values[index];
      bestIndex = index;
    }
  }
  return bestIndex;
}
