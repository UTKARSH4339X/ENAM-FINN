/** Same-origin proxy so phones on LAN get live quotes (Next rewrites /finn-api → backend). */
const API_BASE = process.env.NEXT_PUBLIC_FINN_API ?? "/finn-api";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type BrokerHolding = {
  ticker: string;
  name: string;
  sector?: string;
  qty: number;
  avg_price: number;
  weight?: number;
  last_price: number;
  change_pct: number;
  market_value: number;
  invested: number;
  unrealized_pnl: number;
  unrealized_pnl_pct?: number;
  quote_source?: string;
};

export type BrokerSnapshot = {
  mode: string;
  broker: string;
  disclaimer: string;
  holdings: BrokerHolding[];
  totals: { market_value: number; invested: number; unrealized_pnl: number };
  quotes_meta: { live: boolean; error: string | null };
  as_of: string;
  funds: { available_cash: number; collateral: number; currency: string };
};

export type Recommendation = {
  id: number;
  ticker: string;
  action: string;
  entry_price: number;
  thesis: string;
  created_at: string;
  status: string;
  exit_price?: number | null;
  closed_at?: string | null;
  notes?: string | null;
  mark_price?: number;
  unrealized_pct?: number;
  realized_pct?: number;
};

export function getApiBase() {
  return API_BASE;
}

export function fetchBrokerSnapshot() {
  return api<BrokerSnapshot>("/broker/snapshot");
}

export type QuoteRow = {
  price: number;
  change_pct: number;
  source: string;
  spark?: number[];
};

export function fetchQuotes(tickers: string[]) {
  return api<{
    live: boolean;
    as_of?: string;
    quotes: Record<string, QuoteRow>;
  }>("/market/quotes", { method: "POST", body: JSON.stringify({ tickers }) });
}

export type SearchHit = {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  display?: string;
  listing?: string | null;
  is_ipo?: boolean;
  kind?: "index" | "equity" | string;
};

export type Candle = { t: string; o: number; h: number; l: number; c: number; v: number };

export type ChartMarker = {
  i: number;
  t: string;
  price: number;
  code: string;
  label: string;
  bias: "buy" | "sell" | "wait";
  hint: string;
};

export type IndicatorRow = {
  id: string;
  name: string;
  value: number | string;
  signal: "buy" | "sell" | "wait";
  note: string;
};

export type TradePlan = {
  stance: "Long" | "Keep" | "Sell" | string;
  entry: number;
  target: number;
  stop: number;
  profit_pct: number;
  loss_pct: number;
  reward_rupees: number;
  risk_rupees: number;
};

export type AnalysisPayload = {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  kind?: string;
  live: boolean;
  error: string | null;
  price: number;
  change_pct: number;
  action: "BUY" | "HOLD" | "REDUCE" | "SELL" | "WAIT" | string;
  tone: "buy" | "sell" | "wait";
  stance?: "Long" | "Keep" | "Sell" | string;
  trade?: TradePlan;
  score: number;
  score_max: number;
  indicators: IndicatorRow[];
  markers: ChartMarker[];
  overlays: {
    sma20: (number | null)[];
    sma50: (number | null)[];
    bb_upper: (number | null)[];
    bb_mid: (number | null)[];
    bb_lower: (number | null)[];
    rsi: (number | null)[];
    macd: (number | null)[];
    macd_signal: (number | null)[];
    macd_hist: (number | null)[];
  };
  candles: Candle[];
  disclaimer: string;
};

export type UniverseStats = {
  total: number;
  nse_equities: number;
  bse_equities: number;
  indices: number;
};

export function searchStocks(
  q: string,
  limit = 80,
  listing?: "ipo" | "index",
  opts?: { exchange?: "NSE" | "BSE"; offset?: number },
) {
  const qs = new URLSearchParams({ q, limit: String(Math.min(limit, 3000)) });
  if (listing) qs.set("listing", listing);
  if (opts?.exchange) qs.set("exchange", opts.exchange);
  if (opts?.offset) qs.set("offset", String(opts.offset));
  return api<{
    query: string;
    results: SearchHit[];
    count: number;
    offset: number;
    limit: number;
    universe?: UniverseStats;
  }>(`/market/search?${qs}`);
}

export function fetchAnalysis(ticker: string) {
  return api<AnalysisPayload>(`/market/analysis/${encodeURIComponent(ticker)}`);
}

export type DigestItem = {
  id: string;
  ticker: string;
  company: string;
  category: string;
  priority: "critical" | "high" | "watch" | "routine" | string;
  title: string;
  summary: string;
  whyItMatters: string;
  time: string;
  kind: string;
  badge?: string;
  source?: string;
  attachment?: string | null;
  industry?: string;
};

export type DigestPayload = {
  window: string;
  as_of: string;
  count: number;
  important: DigestItem[];
  routine: DigestItem[];
  items: DigestItem[];
  disclaimer: string;
  source: string;
};

export type PrimaryResearch = {
  ok: boolean;
  ticker: string;
  name: string;
  exchange?: string;
  sector?: string;
  as_of?: string;
  page?: string;
  snapshot?: string;
  discipline?: string;
  quarters?: string[];
  results?: Array<{
    label: string;
    value: string | null;
    raw?: number | null;
    qoq: number | null;
    yoy: number | null;
  }>;
  opm_latest?: string | null;
  eps_latest?: string | null;
  trajectory?: Array<{ metric: string; change_pct: number | null }>;
  bull?: string[];
  bear?: string[];
  narrative_vs_numbers?: string[];
  sources?: {
    annual_report?: { title: string; url: string } | null;
    transcript?: { title: string; url: string } | null;
    all?: Array<{ kind: string; title: string; url: string }>;
  };
  action_hint?: string;
  invalidates?: string;
  error?: string;
};

export function fetchDigest(window = "24h", tickers?: string[]) {
  const qs = new URLSearchParams({ window });
  if (tickers?.length) qs.set("tickers", tickers.join(","));
  return api<DigestPayload>(`/push/digest?${qs}`);
}

export function fetchFiling(id: string) {
  return api<DigestItem>(`/filings/${encodeURIComponent(id)}`);
}

export function fetchPrimaryResearch(ticker: string) {
  return api<PrimaryResearch>(`/research/${encodeURIComponent(ticker)}/primary`);
}

export type AskSource = {
  kind: string;
  ticker?: string;
  title?: string;
  id?: string;
  url?: string | null;
};

export type AskPayload = {
  ok: boolean;
  answer: string;
  tickers?: string[];
  sources?: AskSource[];
  as_of?: string;
  discipline?: string;
};

export function askFinn(question: string, tickers?: string[]) {
  return api<AskPayload>("/ask", {
    method: "POST",
    body: JSON.stringify({ question, tickers: tickers || [] }),
  });
}

export function fetchRecommendations(status?: string) {
  const q = status ? `?status=${status}` : "";
  return api<{
    items: Recommendation[];
    stats: { open: number; closed: number; win_rate_closed: number | null };
    disclaimer: string;
  }>(`/recommendations${q}`);
}

export function createRecommendation(payload: {
  ticker: string;
  action: string;
  entry_price: number;
  thesis: string;
  notes?: string;
}) {
  return api<{ ok: boolean; id: number }>("/recommendations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function closeRecommendation(id: number, exit_price: number, notes?: string) {
  return api<{ ok: boolean }>(`/recommendations/${id}/close`, {
    method: "POST",
    body: JSON.stringify({ exit_price, notes }),
  });
}

export async function uploadPortfolioCsv(file: File) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_BASE}/portfolio/upload-csv`, { method: "POST", body });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean; count: number; holdings: unknown[] }>;
}

export function fetchUploadedPortfolio() {
  return api<{
    holdings: Array<{
      ticker: string;
      name: string;
      qty: number;
      avg_price: number;
      last_price: number;
      market_value: number;
      unrealized_pnl: number;
    }>;
    count: number;
  }>("/portfolio/uploaded");
}

export async function pingApi() {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
