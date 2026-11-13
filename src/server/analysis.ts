/**
 * Embedded OHLC + technical analysis for Vercel (no FastAPI required).
 * Uses live Moneycontrol history only — never fabricates candles.
 */

import { readFileSync } from "fs";
import { join } from "path";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

const INDEX_HISTORY: Record<string, string> = {
  NIFTY: "in%3BNSX",
  SENSEX: "in%3BSEN",
  BANKNIFTY: "in%3Bnbx",
};

const INDEX_FEED: Record<string, string> = {
  NIFTY: "in%3BNSX",
  SENSEX: "in%3BSEN",
  BANKNIFTY: "in%3Bnbx",
};

const SCID_SEED: Record<string, string> = {
  RELIANCE: "RI",
  TCS: "TCS",
  INFY: "IT",
  HDFCBANK: "HDF01",
  ICICIBANK: "ICI02",
  SBIN: "SBI",
  ITC: "ITC",
  BHARTIARTL: "BA08",
  LT: "LT",
  AXISBANK: "UTI10",
  ASIANPAINT: "API",
  MARUTI: "MU01",
  SUNPHARMA: "SPI",
  TITAN: "TI01",
  ULTRACEMCO: "UTC",
  NESTLEIND: "NI",
  POWERGRID: "PGC",
  NTPC: "NTP",
  WIPRO: "W",
  HCLTECH: "HCL02",
  TATASTEEL: "TIS",
  TATAMOTORS: "TM03",
  "M&M": "MM",
  KOTAKBANK: "KKB",
  BAJFINANCE: "BAF",
};

export type ChartRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";

type Candle = { t: string; o: number; h: number; l: number; c: number; v: number };

const RANGE_CFG: Record<
  ChartRange,
  { days: number; resolution: string; pathHint?: "intraday" | "daily" }
> = {
  "1D": { days: 1, resolution: "5", pathHint: "intraday" },
  "1W": { days: 7, resolution: "15", pathHint: "intraday" },
  "1M": { days: 35, resolution: "D", pathHint: "daily" },
  "3M": { days: 100, resolution: "D", pathHint: "daily" },
  "6M": { days: 200, resolution: "D", pathHint: "daily" },
  "1Y": { days: 400, resolution: "D", pathHint: "daily" },
  ALL: { days: 2000, resolution: "D", pathHint: "daily" },
};

let scidMap: Record<string, string> | null = null;

function headers() {
  return {
    "User-Agent": UA,
    Accept: "application/json,text/plain,*/*",
    Referer: "https://www.moneycontrol.com/",
  };
}

function loadScid(): Record<string, string> {
  if (scidMap) return scidMap;
  const map = { ...SCID_SEED };
  try {
    const p = join(process.cwd(), "backend/app/data/mc_scid.json");
    Object.assign(map, JSON.parse(readFileSync(p, "utf8")));
  } catch {
    /* optional */
  }
  scidMap = map;
  return map;
}

function resolveSym(ticker: string): string {
  const raw = ticker.toUpperCase().replace(/\s+/g, "");
  if (raw === "NIFTY50" || raw === "NIFTY") return "NIFTY";
  if (raw === "BSESENSEX") return "SENSEX";
  return raw;
}

function sma(vals: number[], n: number): (number | null)[] {
  const out: (number | null)[] = Array(vals.length).fill(null);
  if (n <= 0) return out;
  let s = 0;
  for (let i = 0; i < vals.length; i++) {
    s += vals[i];
    if (i >= n) s -= vals[i - n];
    if (i >= n - 1) out[i] = Math.round((s / n) * 100) / 100;
  }
  return out;
}

function ema(vals: number[], n: number): (number | null)[] {
  const out: (number | null)[] = Array(vals.length).fill(null);
  if (!vals.length || n <= 0) return out;
  const k = 2 / (n + 1);
  let e = vals[0];
  for (let i = 0; i < vals.length; i++) {
    e = i === 0 ? vals[0] : vals[i] * k + e * (1 - k);
    out[i] = i >= n - 1 ? Math.round(e * 100) / 100 : null;
  }
  return out;
}

function rsi(closes: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = Array(closes.length).fill(null);
  if (closes.length < n + 1) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / n;
  let avgL = losses / n;
  out[n] = Math.round((100 - 100 / (1 + (avgL ? avgG / avgL : 100))) * 100) / 100;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = Math.max(d, 0);
    const l = Math.max(-d, 0);
    avgG = (avgG * (n - 1) + g) / n;
    avgL = (avgL * (n - 1) + l) / n;
    out[i] = Math.round((100 - 100 / (1 + (avgL ? avgG / avgL : 100))) * 100) / 100;
  }
  return out;
}

function macd(closes: number[]) {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const line: (number | null)[] = Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] != null && ema26[i] != null) {
      line[i] = Math.round((ema12[i]! - ema26[i]!) * 1000) / 1000;
    }
  }
  const signal: (number | null)[] = Array(closes.length).fill(null);
  const hist: (number | null)[] = Array(closes.length).fill(null);
  const first = line.findIndex((x) => x != null);
  if (first < 0) return { line, signal, hist };
  const k = 2 / 10;
  let e = line[first]!;
  let count = 0;
  for (let i = first; i < closes.length; i++) {
    if (line[i] == null) continue;
    count += 1;
    e = count === 1 ? line[i]! : line[i]! * k + e * (1 - k);
    if (count >= 9) {
      signal[i] = Math.round(e * 1000) / 1000;
      hist[i] = Math.round((line[i]! - signal[i]!) * 1000) / 1000;
    }
  }
  return { line, signal, hist };
}

function fmtTs(ts: number, intraday: boolean): string {
  const d = new Date(ts * 1000);
  if (intraday) {
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toISOString().slice(0, 10);
}

async function fetchHistory(sym: string, range: ChartRange): Promise<Candle[] | null> {
  const cfg = RANGE_CFG[range];
  const now = Math.floor(Date.now() / 1000);
  const from = now - cfg.days * 86400 - 2 * 86400;
  const isIndex = Boolean(INDEX_HISTORY[sym]);
  const path = isIndex ? "index" : "stock";
  const symbol = isIndex ? INDEX_HISTORY[sym] : encodeURIComponent(sym);
  const countback =
    cfg.resolution === "D" || cfg.resolution === "W" || cfg.resolution === "M"
      ? Math.min(cfg.days + 10, 2500)
      : Math.min(cfg.days * 80, 2000);

  const url =
    `https://priceapi.moneycontrol.com/techCharts/indianMarket/${path}/history` +
    `?symbol=${symbol}&resolution=${cfg.resolution}&from=${from}&to=${now}` +
    `&countback=${countback}&currencyCode=INR`;

  try {
    const r = await fetch(url, { headers: headers(), cache: "no-store" });
    if (!r.ok) return null;
    const body = (await r.json()) as {
      s?: string;
      t?: number[];
      o?: number[];
      h?: number[];
      l?: number[];
      c?: number[];
      v?: number[];
    };
    if (body.s !== "ok" || !body.t?.length) return null;
    const intraday = cfg.pathHint === "intraday";
    const candles: Candle[] = [];
    for (let i = 0; i < body.t.length; i++) {
      candles.push({
        t: fmtTs(Number(body.t[i]), intraday),
        o: Math.round(Number(body.o?.[i] ?? 0) * 100) / 100,
        h: Math.round(Number(body.h?.[i] ?? 0) * 100) / 100,
        l: Math.round(Number(body.l?.[i] ?? 0) * 100) / 100,
        c: Math.round(Number(body.c?.[i] ?? 0) * 100) / 100,
        v: Math.round(Number(body.v?.[i] ?? 0)),
      });
    }
    return candles.length >= 3 ? candles : null;
  } catch {
    return null;
  }
}

async function fetchLivePrice(sym: string): Promise<{ price: number; change_pct: number } | null> {
  try {
    if (INDEX_FEED[sym]) {
      const url = `https://priceapi.moneycontrol.com/pricefeed/notapplicable/inidicesindia/${INDEX_FEED[sym]}`;
      const r = await fetch(url, { headers: headers(), cache: "no-store" });
      if (!r.ok) return null;
      const d = (await r.json())?.data;
      const price = Number(d?.lastprice || d?.last || 0);
      if (!price) return null;
      return { price, change_pct: Number(d?.perchange || d?.percentchange || 0) };
    }
    const scid = loadScid()[sym] || sym;
    for (const ex of ["nse", "bse"] as const) {
      const url = `https://priceapi.moneycontrol.com/pricefeed/${ex}/equitycash/${scid}`;
      const r = await fetch(url, { headers: headers(), cache: "no-store" });
      if (!r.ok) continue;
      const d = (await r.json())?.data;
      const price = Number(d?.pricecurrent || d?.lastprice || 0);
      if (!price) continue;
      return { price, change_pct: Number(d?.pricepercentchange || d?.perchange || 0) };
    }
  } catch {
    return null;
  }
  return null;
}

export async function analyzeTickerEmbedded(ticker: string, range: ChartRange = "3M") {
  const sym = resolveSym(ticker);
  const kind = INDEX_HISTORY[sym] ? "index" : "equity";
  const candlesRaw = await fetchHistory(sym, range);

  if (!candlesRaw || candlesRaw.length < 5) {
    return {
      ticker: sym,
      name: sym,
      exchange: kind === "index" ? "INDEX" : "NSE",
      sector: "—",
      kind,
      live: false,
      error: "chart_unavailable",
      price: 0,
      change_pct: 0,
      action: "WAIT",
      tone: "wait",
      stance: "Keep",
      trend: "DATA UNAVAILABLE" as const,
      trend_strength: 0,
      trend_reason: "Could not load real market history for this range. Retry or pick another window.",
      score: 0,
      score_max: 14,
      indicators: [],
      markers: [],
      overlays: {
        sma20: [],
        sma50: [],
        sma200: [],
        bb_upper: [],
        bb_mid: [],
        bb_lower: [],
        rsi: [],
        macd: [],
        macd_signal: [],
        macd_hist: [],
      },
      candles: [],
      range,
      as_of: new Date().toISOString(),
      disclaimer:
        "Technical signals are not investment advice. No fabricated candles — live history was unavailable.",
    };
  }

  let candles = candlesRaw;
  const liveQ = await fetchLivePrice(sym);
  if (liveQ?.price && candles.length) {
    const last = { ...candles[candles.length - 1] };
    last.c = liveQ.price;
    last.h = Math.max(last.h, liveQ.price);
    last.l = Math.min(last.l || liveQ.price, liveQ.price);
    candles = [...candles.slice(0, -1), last];
  }

  const closes = candles.map((c) => c.c);
  const volumes = candles.map((c) => c.v);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, Math.min(200, Math.max(50, Math.floor(closes.length * 0.6))));
  const rsiArr = rsi(closes, 14);
  const { line: macdLine, signal: macdSig, hist: macdHist } = macd(closes);

  const last = closes.length - 1;
  let score = 0;
  const indicators: Array<{
    id: string;
    name: string;
    value: number | string;
    signal: "buy" | "sell" | "wait";
    note: string;
  }> = [];
  const reasons: string[] = [];

  if (sma20[last] != null) {
    const above = closes[last] >= sma20[last]!;
    score += above ? 1 : -1;
    indicators.push({
      id: "sma20",
      name: "SMA 20",
      value: sma20[last]!,
      signal: above ? "buy" : "sell",
      note: above ? "Price above" : "Price below",
    });
    reasons.push(above ? "Price holds above 20-day average" : "Price below 20-day average");
  }

  if (sma50[last] != null) {
    const above = closes[last] >= sma50[last]!;
    score += above ? 1 : -1;
    indicators.push({
      id: "sma50",
      name: "SMA 50",
      value: sma50[last]!,
      signal: above ? "buy" : "sell",
      note: above ? "Price above" : "Price below",
    });
  }

  if (sma200[last] != null) {
    const above = closes[last] >= sma200[last]!;
    score += above ? 1 : -1;
    indicators.push({
      id: "sma200",
      name: "SMA 200",
      value: sma200[last]!,
      signal: above ? "buy" : "sell",
      note: above ? "Long-term up" : "Long-term down",
    });
    reasons.push(above ? "Above longer-term average" : "Below longer-term average");
  }

  if (sma20[last] != null && sma50[last] != null) {
    const golden = sma20[last]! >= sma50[last]!;
    score += golden ? 1 : -1;
    indicators.push({
      id: "cross",
      name: "SMA cross",
      value: golden ? "20>50" : "20<50",
      signal: golden ? "buy" : "sell",
      note: golden ? "Uptrend bias" : "Downtrend bias",
    });
  }

  if (rsiArr[last] != null) {
    const r = rsiArr[last]!;
    let sig: "buy" | "sell" | "wait" = "wait";
    let note = "Neutral zone";
    if (r < 30) {
      score += 2;
      sig = "buy";
      note = "Oversold";
      reasons.push(`RSI ${r} oversold`);
    } else if (r > 70) {
      score -= 2;
      sig = "sell";
      note = "Overbought";
      reasons.push(`RSI ${r} overbought`);
    } else {
      reasons.push(`RSI ${r} neutral`);
    }
    indicators.push({ id: "rsi", name: "RSI 14", value: r, signal: sig, note });
  }

  if (macdHist[last] != null && last > 0 && macdHist[last - 1] != null) {
    const hist = macdHist[last]!;
    const prev = macdHist[last - 1]!;
    const rising = hist > prev;
    const bull = hist > 0;
    score += bull ? 1 : -1;
    score += rising ? 1 : -1;
    indicators.push({
      id: "macd",
      name: "MACD hist",
      value: hist,
      signal: bull && rising ? "buy" : !bull && !rising ? "sell" : "wait",
      note: rising ? "Momentum rising" : "Momentum falling",
    });
    reasons.push(bull ? "MACD histogram positive" : "MACD histogram negative");
  }

  if (closes.length > 5) {
    const m5 = (closes[last] / closes[last - 5] - 1) * 100;
    score += m5 > 0 ? 1 : -1;
    indicators.push({
      id: "mom5",
      name: "5-bar momentum",
      value: Math.round(m5 * 100) / 100,
      signal: m5 > 1 ? "buy" : m5 < -1 ? "sell" : "wait",
      note: `${m5 >= 0 ? "+" : ""}${m5.toFixed(1)}%`,
    });
  }

  if (volumes.length > 20) {
    const avgVol = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const lastVol = volumes[last];
    if (avgVol > 0 && lastVol > 0) {
      const ratio = lastVol / avgVol;
      const upBar = closes[last] >= closes[last - 1];
      if (ratio > 1.4 && upBar) {
        score += 1;
        indicators.push({
          id: "vol",
          name: "Volume",
          value: `${ratio.toFixed(1)}× avg`,
          signal: "buy",
          note: "Rising on volume",
        });
        reasons.push("Strong volume on up move");
      } else if (ratio > 1.4 && !upBar) {
        score -= 1;
        indicators.push({
          id: "vol",
          name: "Volume",
          value: `${ratio.toFixed(1)}× avg`,
          signal: "sell",
          note: "Selling volume",
        });
        reasons.push("Strong volume on down move");
      } else {
        indicators.push({
          id: "vol",
          name: "Volume",
          value: `${ratio.toFixed(1)}× avg`,
          signal: "wait",
          note: "Average activity",
        });
      }
    }
  }

  let trend: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let action = "HOLD";
  let tone: "buy" | "sell" | "wait" = "wait";
  let stance = "Keep";
  if (score >= 3) {
    trend = "BULLISH";
    action = "BUY";
    tone = "buy";
    stance = "Long";
  } else if (score <= -3) {
    trend = "BEARISH";
    action = "SELL";
    tone = "sell";
    stance = "Sell";
  }

  const price = closes[last];
  const change_pct =
    liveQ?.change_pct ??
    (closes.length >= 2 && closes[last - 1]
      ? Math.round((closes[last] / closes[last - 1] - 1) * 10000) / 100
      : 0);

  const recent = candles.slice(-14);
  const atr =
    recent.reduce((s, c) => s + Math.max(1e-6, c.h - c.l), 0) / Math.max(recent.length, 1);
  const atrPct = price ? (atr / price) * 100 : 2;
  const profit_pct = Math.round(Math.max(2, Math.min(12, atrPct * 2.2)) * 10) / 10;
  const loss_pct = Math.round(Math.max(1, Math.min(6, atrPct * 1.1)) * 10) / 10;
  const target =
    stance === "Sell"
      ? Math.round(price * (1 - profit_pct / 100) * 100) / 100
      : Math.round(price * (1 + profit_pct / 100) * 100) / 100;
  const stop =
    stance === "Sell"
      ? Math.round(price * (1 + loss_pct / 100) * 100) / 100
      : Math.round(price * (1 - loss_pct / 100) * 100) / 100;

  const strength = Math.min(100, Math.round((Math.abs(score) / 14) * 100));

  // Explicit bull / bear case lines from indicator evidence
  const bull_case: string[] = [];
  const bear_case: string[] = [];
  for (const ind of indicators) {
    const line = `${ind.name}: ${ind.note}${
      typeof ind.value === "number" ? ` (${ind.value})` : ind.value ? ` (${ind.value})` : ""
    }`;
    if (ind.signal === "buy") bull_case.push(line);
    else if (ind.signal === "sell") bear_case.push(line);
  }
  if (!bull_case.length) {
    bull_case.push(
      trend === "BULLISH"
        ? "Tape leans constructive but individual buy triggers are mixed — wait for confirmation."
        : "No strong bullish indicator cluster on this window.",
    );
  }
  if (!bear_case.length) {
    bear_case.push(
      trend === "BEARISH"
        ? "Tape leans weak but individual sell triggers are mixed — manage size carefully."
        : "No strong bearish indicator cluster on this window.",
    );
  }

  const take_profit = target;
  const stop_loss = stop;
  const invalidates_tech =
    stance === "Long"
      ? `Technical long weakens if price closes below stop ₹${stop_loss.toLocaleString("en-IN")} or RSI/MACD turn firmly down.`
      : stance === "Sell"
        ? `Technical short/reduce weakens if price closes above stop ₹${stop_loss.toLocaleString("en-IN")} or momentum flips up.`
        : `Stay flat/keep sizing tight until RSI, MACD, and MAs agree more clearly.`;

  // Cap chart length for UI (keep last window)
  const maxBars = range === "1D" ? 120 : range === "1W" ? 200 : range === "ALL" ? 400 : 180;
  const trim = Math.min(candles.length, maxBars);
  const offset = candles.length - trim;
  const sliced = candles.slice(offset);
  const sliceArr = <T,>(arr: (T | null)[]) => arr.slice(offset);

  return {
    ticker: sym,
    name: sym,
    exchange: kind === "index" ? "INDEX" : "NSE",
    sector: "—",
    kind,
    live: true,
    error: null,
    price,
    change_pct,
    action,
    tone,
    stance,
    trend,
    trend_strength: strength,
    trend_reason: reasons.slice(0, 3).join(" · ") || "Insufficient indicator agreement",
    bull_case: bull_case.slice(0, 5),
    bear_case: bear_case.slice(0, 5),
    take_profit,
    stop_loss,
    invalidates_tech,
    trade: {
      stance,
      entry: price,
      target: take_profit,
      stop: stop_loss,
      profit_pct,
      loss_pct,
      reward_rupees: Math.round(Math.abs(take_profit - price) * 100) / 100,
      risk_rupees: Math.round(Math.abs(price - stop_loss) * 100) / 100,
    },
    score,
    score_max: 14,
    indicators,
    markers: [],
    overlays: {
      sma20: sliceArr(sma20),
      sma50: sliceArr(sma50),
      sma200: sliceArr(sma200),
      bb_upper: [],
      bb_mid: [],
      bb_lower: [],
      rsi: sliceArr(rsiArr),
      macd: sliceArr(macdLine),
      macd_signal: sliceArr(macdSig),
      macd_hist: sliceArr(macdHist),
    },
    candles: sliced,
    range,
    as_of: new Date().toISOString(),
    disclaimer:
      "Bull/bear lines combine live Moneycontrol OHLC indicators (RSI, MACD, MAs, momentum, volume). Not a guaranteed prediction. Filing bull/bear come from company tables when available.",
  };
}
