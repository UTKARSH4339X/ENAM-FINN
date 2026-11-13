"use client";

import { useMemo } from "react";

/** Sparkline from real spark points, or a deterministic seed fallback. */
export function Sparkline({
  seed,
  up,
  series,
  width = 140,
  height = 44,
}: {
  seed: string;
  up: boolean;
  series?: number[];
  width?: number;
  height?: number;
}) {
  const points = useMemo(() => {
    if (series && series.length >= 2) return series;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const vals: number[] = [];
    let v = 50;
    for (let i = 0; i < 18; i++) {
      h = (h * 1664525 + 1013904223) >>> 0;
      const n = (h % 1000) / 1000;
      v += (n - 0.48) * 8 + (up ? 0.35 : -0.35);
      vals.push(Math.max(8, Math.min(92, v)));
    }
    return vals;
  }, [seed, up, series]);

  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = Math.max(1e-9, max - min);
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p - min) / span) * (height - 6) - 3;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const color = up ? "#0f7a57" : "#c0392b";

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
