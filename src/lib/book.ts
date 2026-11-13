"use client";

import { useCallback, useEffect, useState } from "react";
import { portfolio as seedPortfolio, type Holding } from "@/data/portfolio";
import { fetchUploadedPortfolio } from "@/lib/api";

const BOOK_KEY = "finn.active.book.tickers.v1";

export type BookState = {
  tickers: string[];
  holdings: Holding[];
  source: "seed" | "csv";
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function seedHoldings(): Holding[] {
  return seedPortfolio.map((h) => ({ ...h }));
}

function readCachedTickers(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BOOK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) && parsed.length ? parsed.map((t) => t.toUpperCase()) : null;
  } catch {
    return null;
  }
}

function writeCachedTickers(tickers: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BOOK_KEY, JSON.stringify(tickers));
}

/** Active investment book: CSV upload wins, else seed NSE book. */
export function useBook(): BookState {
  const [holdings, setHoldings] = useState<Holding[]>(seedHoldings);
  const [source, setSource] = useState<"seed" | "csv">("seed");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchUploadedPortfolio();
      const rows = res.holdings || [];
      if (rows.length) {
        const totalMv = rows.reduce((s, h) => s + (h.market_value || 0), 0) || 1;
        const next: Holding[] = rows.map((h) => ({
          ticker: h.ticker.toUpperCase(),
          name: h.name || h.ticker,
          sector: "Equity",
          weight: ((h.market_value || 0) / totalMv) * 100,
          price: h.last_price || h.avg_price,
          changePct: 0,
          volumeRatio: 1,
        }));
        const tickers = next.map((h) => h.ticker);
        writeCachedTickers(tickers);
        setHoldings(next);
        setSource("csv");
        setError(null);
      } else {
        const cached = readCachedTickers();
        if (cached?.length) {
          // CSV cleared but cache exists — fall back to seed names still in universe
          setHoldings(seedHoldings());
          setSource("seed");
        } else {
          setHoldings(seedHoldings());
          setSource("seed");
        }
        setError(null);
      }
    } catch {
      const cached = readCachedTickers();
      if (cached?.length) {
        const fromSeed = seedHoldings().filter((h) => cached.includes(h.ticker));
        setHoldings(fromSeed.length ? fromSeed : seedHoldings());
      }
      setError("Could not refresh uploaded book — using local book.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    function onBookChanged() {
      void refresh();
    }
    window.addEventListener("finn-book-changed", onBookChanged);
    return () => window.removeEventListener("finn-book-changed", onBookChanged);
  }, [refresh]);

  return {
    tickers: holdings.map((h) => h.ticker),
    holdings,
    source,
    ready,
    error,
    refresh,
  };
}

export function defaultBookTickers() {
  return seedPortfolio.map((h) => h.ticker);
}
