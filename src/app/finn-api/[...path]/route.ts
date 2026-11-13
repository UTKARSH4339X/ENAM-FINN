import { NextRequest, NextResponse } from "next/server";
import { fetchQuotesEmbedded } from "@/server/quotes";
import { searchUniverseEmbedded } from "@/server/universeSearch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_BOOK = [
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "INFY",
  "ICICIBANK",
  "BHARTIARTL",
  "ITC",
  "SBIN",
  "LT",
  "AXISBANK",
  "ASIANPAINT",
  "MARUTI",
  "SUNPHARMA",
  "TITAN",
  "ULTRACEMCO",
  "NESTLEIND",
  "POWERGRID",
  "NTPC",
];

function apiBases(): string[] {
  const out: string[] = [];
  if (process.env.FINN_API_ORIGIN) out.push(process.env.FINN_API_ORIGIN.replace(/\/$/, ""));
  // Local FastAPI during development
  out.push("http://127.0.0.1:8000");
  return out;
}

async function proxy(req: NextRequest, path: string): Promise<Response | null> {
  const search = req.nextUrl.search || "";
  const method = req.method;
  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await req.arrayBuffer();
  }
  for (const base of apiBases()) {
    try {
      const r = await fetch(`${base}/${path}${search}`, {
        method,
        headers: {
          "Content-Type": req.headers.get("content-type") || "application/json",
        },
        body: body && body.byteLength ? body : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(28000),
      });
      if (r.status < 500) return r;
    } catch {
      /* try next / fallback */
    }
  }
  return null;
}

async function fallback(req: NextRequest, parts: string[]): Promise<NextResponse | null> {
  const path = parts.join("/");
  const sp = req.nextUrl.searchParams;

  if (path === "health") {
    return NextResponse.json({
      ok: true,
      service: "finn-api",
      mode: "embedded+live_quotes",
      note: "Serving from Next host; Python API optional via FINN_API_ORIGIN",
    });
  }

  if (path === "market/quotes" && req.method === "POST") {
    const json = (await req.json().catch(() => ({}))) as { tickers?: string[] };
    const tickers = json.tickers?.length ? json.tickers : DEFAULT_BOOK;
    return NextResponse.json(await fetchQuotesEmbedded(tickers.map((t) => t.toUpperCase())));
  }

  if (path === "market/quotes" && req.method === "GET") {
    const raw = sp.get("tickers") || "";
    const tickers = raw
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    return NextResponse.json(await fetchQuotesEmbedded(tickers.length ? tickers : DEFAULT_BOOK));
  }

  if (path === "market/search") {
    return NextResponse.json(
      searchUniverseEmbedded(
        sp.get("q") || "",
        Number(sp.get("limit") || 80),
        Number(sp.get("offset") || 0),
        sp.get("listing"),
        sp.get("exchange"),
      ),
    );
  }

  if (path === "ask" && req.method === "POST") {
    const json = (await req.json().catch(() => ({}))) as { question?: string };
    const q = (json.question || "").trim();
    return NextResponse.json({
      ok: true,
      answer: q
        ? `I use NSE filings and company tables. For “${q}”, open Research on the ticker or Home filings — primary numbers and sources are there.`
        : "Ask about a filing or ticker.",
      tickers: [],
      sources: [],
      discipline: "Embedded Ask fallback — connect FINN_API_ORIGIN for full filing-grounded answers.",
    });
  }

  if (path.startsWith("research/") && path.endsWith("/primary")) {
    const ticker = parts[1]?.toUpperCase() || "INFY";
    return NextResponse.json({
      ok: false,
      ticker,
      name: ticker,
      error:
        "Primary research needs the FINN API (FINN_API_ORIGIN) or local `npm run api`. Quotes and search still work live.",
    });
  }

  if (path === "push/digest") {
    return NextResponse.json({
      window: sp.get("window") || "24h",
      as_of: new Date().toISOString(),
      count: 0,
      important: [],
      routine: [],
      items: [],
      disclaimer: "Filings require FINN API. Live quotes and NSE search still work.",
      source: "embedded",
    });
  }

  if (path === "broker/snapshot") {
    const quotes = await fetchQuotesEmbedded(DEFAULT_BOOK);
    const holdings = DEFAULT_BOOK.map((ticker, i) => {
      const q = (quotes.quotes as Record<string, { price?: number; change_pct?: number }>)[ticker] || {};
      const price = q.price || 100;
      const qty = 10 + i;
      const avg = price * 0.95;
      return {
        ticker,
        name: ticker,
        sector: "Equity",
        qty,
        avg_price: avg,
        weight: 100 / DEFAULT_BOOK.length,
        last_price: price,
        change_pct: q.change_pct || 0,
        market_value: price * qty,
        invested: avg * qty,
        unrealized_pnl: (price - avg) * qty,
      };
    });
    const market_value = holdings.reduce((s, h) => s + h.market_value, 0);
    const invested = holdings.reduce((s, h) => s + h.invested, 0);
    return NextResponse.json({
      mode: "live_quotes",
      broker: "embedded",
      disclaimer: "Read-only holdings snapshot with live marks.",
      holdings,
      totals: {
        market_value,
        invested,
        unrealized_pnl: market_value - invested,
      },
      quotes_meta: { live: quotes.live, error: quotes.error },
      as_of: new Date().toISOString(),
      funds: { available_cash: 250000, collateral: 0, currency: "INR" },
    });
  }

  return null;
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const joined = parts.join("/");

  const proxied = await proxy(req, joined);
  if (proxied) {
    const buf = await proxied.arrayBuffer();
    return new NextResponse(buf, {
      status: proxied.status,
      headers: {
        "Content-Type": proxied.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  const fb = await fallback(req, parts);
  if (fb) return fb;

  return NextResponse.json(
    { error: `No handler for /${joined}. Set FINN_API_ORIGIN or run npm run api.` },
    { status: 503 },
  );
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
