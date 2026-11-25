import { useMemo } from "react";
import type { RefObject } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AnalysisResult } from "../types/biomechanics";

interface AngleTimeChartProps {
  result: AnalysisResult;
  videoRef: RefObject<HTMLVideoElement>;
}

interface ChartPoint {
  frame: number;
  timestamp: number;
  elbow: number | null;
  knee: number | null;
}

export default function AngleTimeChart({
  result,
  videoRef,
}: AngleTimeChartProps) {
  const data = useMemo(() => {
    const points = new Map<number, ChartPoint>();
    const elbow = result.angles.find((series) => series.angle === "elbow_extension");
    const knee = result.angles.find((series) => series.angle === "front_knee_flexion");
    for (const sample of elbow?.samples ?? []) {
      points.set(sample.frame_index, {
        frame: sample.frame_index,
        timestamp: sample.timestamp_ms,
        elbow: sample.value_degrees,
        knee: null,
      });
    }
    for (const sample of knee?.samples ?? []) {
      const existing = points.get(sample.frame_index);
      if (existing) existing.knee = sample.value_degrees;
      else
        points.set(sample.frame_index, {
          frame: sample.frame_index,
          timestamp: sample.timestamp_ms,
          elbow: null,
          knee: sample.value_degrees,
        });
    }
    return [...points.values()].sort((a, b) => a.frame - b.frame);
  }, [result.angles]);

  return (
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">
          Angle over frames
        </h2>
        <span className="text-xs text-slate-500">Click a point to seek</span>
      </div>
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">
          No angle samples in this analysis.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 4, left: -12 }}
            onClick={(state) => {
              const payload = state?.activePayload?.[0]?.payload as
                | ChartPoint
                | undefined;
              const video = videoRef.current;
              if (payload && video) video.currentTime = payload.timestamp / 1000;
            }}
          >
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="frame"
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 180]}
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              tickLine={false}
              unit="°"
            />
            <Tooltip
              contentStyle={{
                background: "#020617",
                border: "1px solid #1e293b",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(frame) => `Frame ${frame}`}
              formatter={(value, name) => [
                `${Number(value).toFixed(1)}°`,
                name === "elbow" ? "Elbow" : "Front knee",
              ]}
            />
            <Legend
              formatter={(value) => (value === "elbow" ? "Elbow" : "Front knee")}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="elbow"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="knee"
              stroke="#a78bfa"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
