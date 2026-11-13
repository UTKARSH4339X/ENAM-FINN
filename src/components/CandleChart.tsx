"use client";

import type { Candle, ChartMarker } from "@/lib/api";

type Props = {
  candles: Candle[];
  sma20?: (number | null)[];
  sma50?: (number | null)[];
  markers?: ChartMarker[];
  height?: number;
};

export function CandleChart({ candles, sma20, sma50, markers = [], height = 220 }: Props) {
  if (!candles.length) {
    return <div style={{ height, display: "grid", placeItems: "center", color: "#6b7280" }}>No chart</div>;
  }

  const w = 320;
  const padL = 8;
  const padR = 8;
  const padT = 18;
  const padB = 28;
  const chartW = w - padL - padR;
  const chartH = height - padT - padB;
  const n = candles.length;
  const slot = chartW / n;

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    min = Math.min(min, candles[i].l);
    max = Math.max(max, candles[i].h);
    const s20 = sma20?.[i];
    const s50 = sma50?.[i];
    if (typeof s20 === "number") {
      min = Math.min(min, s20);
      max = Math.max(max, s20);
    }
    if (typeof s50 === "number") {
      min = Math.min(min, s50);
      max = Math.max(max, s50);
    }
  }
  const span = Math.max(max - min, 1e-6);

  const y = (price: number) => padT + (1 - (price - min) / span) * chartH;
  const xMid = (i: number) => padL + i * slot + slot / 2;

  function linePath(series?: (number | null)[]) {
    if (!series) return "";
    let d = "";
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = series[i];
      if (v == null) continue;
      const cmd = started ? "L" : "M";
      d += `${cmd}${xMid(i).toFixed(1)},${y(v).toFixed(1)} `;
      started = true;
    }
    return d.trim();
  }

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label="Candlestick chart">
      {/* grid */}
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1={padL}
          x2={w - padR}
          y1={padT + chartH * p}
          y2={padT + chartH * p}
          stroke="rgba(16,24,32,0.06)"
          strokeWidth="1"
        />
      ))}

      {linePath(sma50) && (
        <path d={linePath(sma50)} fill="none" stroke="#8b5e34" strokeWidth="1.4" strokeDasharray="4 3" />
      )}
      {linePath(sma20) && (
        <path d={linePath(sma20)} fill="none" stroke="#2457ff" strokeWidth="1.6" />
      )}

      {candles.map((c, i) => {
        const up = c.c >= c.o;
        const color = up ? "#0f7a57" : "#c0392b";
        const cx = xMid(i);
        const bodyTop = y(Math.max(c.o, c.c));
        const bodyBot = y(Math.min(c.o, c.c));
        const bodyH = Math.max(1.2, bodyBot - bodyTop);
        const wickW = Math.max(1, slot * 0.12);
        const bodyW = Math.max(2, slot * 0.55);
        return (
          <g key={`${c.t}-${i}`}>
            <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={wickW} />
            <rect
              x={cx - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              fill={color}
              rx={0.6}
            />
          </g>
        );
      })}

      {markers.map((m) => {
        const cx = xMid(m.i);
        const cy = y(m.price) - (m.bias === "buy" ? 10 : m.bias === "sell" ? -10 : 0);
        const fill = m.bias === "buy" ? "#0f7a57" : m.bias === "sell" ? "#c0392b" : "#6b7280";
        if (m.bias === "buy") {
          return (
            <g key={`m-${m.i}-${m.code}`}>
              <polygon points={`${cx},${cy - 5} ${cx - 5},${cy + 4} ${cx + 5},${cy + 4}`} fill={fill} />
            </g>
          );
        }
        if (m.bias === "sell") {
          return (
            <g key={`m-${m.i}-${m.code}`}>
              <polygon points={`${cx},${cy + 5} ${cx - 5},${cy - 4} ${cx + 5},${cy - 4}`} fill={fill} />
            </g>
          );
        }
        return (
          <circle key={`m-${m.i}-${m.code}`} cx={cx} cy={cy} r={3.2} fill={fill} />
        );
      })}

      <text x={padL} y={height - 8} fontSize="10" fill="#6b7280">
        {candles[0]?.t?.slice(5)}
      </text>
      <text x={w - padR} y={height - 8} fontSize="10" fill="#6b7280" textAnchor="end">
        {candles[n - 1]?.t?.slice(5)}
      </text>
    </svg>
  );
}
