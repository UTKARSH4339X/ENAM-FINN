"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./search.module.css";
import { fetchQuotes, searchStocks, type SearchHit, type UniverseStats } from "@/lib/api";

const QUICK = [
  { ticker: "NIFTY", label: "Nifty 50" },
  { ticker: "SENSEX", label: "Sensex" },
  { ticker: "BANKNIFTY", label: "Bank Nifty" },
  { ticker: "RELIANCE", label: "Reliance" },
  { ticker: "TCS", label: "TCS" },
  { ticker: "HDFCBANK", label: "HDFC Bank" },
];

const PAGE = 120;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [ex, setEx] = useState<"ALL" | "NSE" | "BSE" | "IPO" | "INDEX">("ALL");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [universe, setUniverse] = useState<UniverseStats | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [idxQuotes, setIdxQuotes] = useState<
    Record<string, { price: number; change_pct: number }>
  >({});

  const quoteTickers = useMemo(() => {
    const base = ["NIFTY", "SENSEX", "BANKNIFTY", "RELIANCE", "TCS", "HDFCBANK", "INFY", "SBIN", "ITC"];
    const fromHits = hits.slice(0, 40).map((h) => h.ticker);
    return Array.from(new Set([...base, ...fromHits]));
  }, [hits]);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const qres = await fetchQuotes(quoteTickers);
        if (cancelled) return;
        setIdxQuotes((prev) => {
          const map = { ...prev };
          for (const [k, v] of Object.entries(qres.quotes || {})) {
            if (v.price) map[k] = { price: v.price, change_pct: v.change_pct };
          }
          return map;
        });
      } catch {
        /* keep previous */
      }
    }
    void pull();
    const id = window.setInterval(pull, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [quoteTickers]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      const listing = ex === "IPO" ? "ipo" : ex === "INDEX" ? "index" : undefined;
      const exchange = ex === "NSE" || ex === "BSE" ? ex : undefined;
      searchStocks(q, PAGE, listing, { exchange, offset: 0 })
        .then((res) => {
          if (cancelled) return;
          setHits(res.results);
          setUniverse(res.universe ?? null);
          setHasMore(res.results.length >= PAGE);
          setErr(null);
        })
        .catch(() => {
          if (cancelled) return;
          setErr("Search offline — start API (npm run api)");
          setHits([]);
          setHasMore(false);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, q ? 160 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [q, ex]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const listing = ex === "IPO" ? "ipo" : ex === "INDEX" ? "index" : undefined;
      const exchange = ex === "NSE" || ex === "BSE" ? ex : undefined;
      const res = await searchStocks(q, PAGE, listing, { exchange, offset: hits.length });
      setHits((prev) => {
        const seen = new Set(prev.map((h) => `${h.exchange}-${h.ticker}`));
        const next = [...prev];
        for (const row of res.results) {
          const key = `${row.exchange}-${row.ticker}`;
          if (!seen.has(key)) {
            seen.add(key);
            next.push(row);
          }
        }
        return next;
      });
      setUniverse(res.universe ?? null);
      setHasMore(res.results.length >= PAGE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  const shown = hits;
  const indices = shown.filter((h) => h.kind === "index");
  const equities = shown.filter((h) => h.kind !== "index");
  const nseTotal = universe?.nse_equities ?? null;

  return (
    <main className={`screen ${styles.wrap}`}>
      <div className={styles.brand}>FINN</div>
      <h1 className={styles.title}>Markets</h1>
      <p className={styles.sub}>
        Full NSE book
        {nseTotal != null ? ` · ${nseTotal.toLocaleString("en-IN")} equities` : ""}
      </p>

      <div className={styles.searchBox}>
        <span aria-hidden>⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search any NSE stock…"
          autoCapitalize="characters"
          autoCorrect="off"
        />
      </div>

      <div className={styles.quick}>
        {QUICK.map((item) => (
          <Link key={item.ticker} href={`/research/${item.ticker}`} className={styles.quickChip}>
            {item.label}
          </Link>
        ))}
      </div>

      <div className={styles.filters}>
        {(["ALL", "INDEX", "NSE", "BSE", "IPO"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`${styles.chip}${ex === k ? ` ${styles.chipOn}` : ""}`}
            onClick={() => setEx(k)}
          >
            {k === "ALL" ? "All" : k === "INDEX" ? "Indices" : k === "IPO" ? "IPOs" : k}
          </button>
        ))}
      </div>

      <p className={styles.status}>
        {loading
          ? "Loading…"
          : err
            ? err
            : `${shown.length.toLocaleString("en-IN")} shown${
                nseTotal != null && !q ? ` · ${nseTotal.toLocaleString("en-IN")} NSE listed` : ""
              }`}
      </p>

      {!q && indices.length > 0 && (
        <>
          <h2 className={styles.section}>Indices</h2>
          <div className={styles.list}>
            {indices.map((h) => {
              const live = idxQuotes[h.ticker];
              return (
                <Link key={`idx-${h.ticker}`} href={`/research/${h.ticker}`} className={`${styles.row} tap`}>
                  <div className={styles.left}>
                    <strong>{h.ticker}</strong>
                    <span>{h.name}</span>
                  </div>
                  <div className={styles.meta}>
                    {live ? (
                      <>
                        <span className="num" style={{ fontWeight: 800, fontSize: 14 }}>
                          {live.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </span>
                        <span
                          className={live.change_pct >= 0 ? "up" : "down"}
                          style={{ fontWeight: 800, fontSize: 12 }}
                        >
                          {live.change_pct >= 0 ? "+" : ""}
                          {live.change_pct.toFixed(2)}%
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={styles.ex}>{h.exchange}</span>
                        <span className={styles.sector}>Index</span>
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <h2 className={styles.section}>{q ? "Results" : "NSE stocks"}</h2>
      <div className={styles.list}>
        {(q ? shown : equities).map((h) => {
          const live = idxQuotes[h.ticker];
          return (
            <Link
              key={`${h.exchange}-${h.ticker}-${h.display ?? ""}`}
              href={`/research/${h.ticker}`}
              className={`${styles.row} tap`}
            >
              <div className={styles.left}>
                <strong>{h.ticker}</strong>
                <span>{h.name}</span>
              </div>
              <div className={styles.meta}>
                {h.is_ipo ? <span className={styles.ipo}>NEW</span> : null}
                {h.kind === "index" ? <span className={styles.ipo}>INDEX</span> : null}
                {live ? (
                  <>
                    <span className="num" style={{ fontWeight: 800, fontSize: 14 }}>
                      ₹{live.price.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                    </span>
                    <span
                      className={live.change_pct >= 0 ? "up" : "down"}
                      style={{ fontWeight: 800, fontSize: 12 }}
                    >
                      {live.change_pct >= 0 ? "+" : ""}
                      {live.change_pct.toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <span className={styles.ex}>{h.exchange}</span>
                )}
                {!live && <span className={styles.sector}>{h.sector}</span>}
              </div>
            </Link>
          );
        })}
      </div>

      {hasMore && !loading && !err && (
        <div style={{ padding: "8px 0 20px" }}>
          <button type="button" className="btn btn-soft" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Load more NSE stocks"}
          </button>
        </div>
      )}

      {!loading && !err && shown.length === 0 && q.trim() && (
        <div className={styles.empty}>
          <p>No list match.</p>
          <Link
            href={`/research/${q.trim().toUpperCase()}`}
            className="btn btn-primary"
            style={{ marginTop: 12 }}
          >
            Open {q.trim().toUpperCase()} chart
          </Link>
        </div>
      )}
    </main>
  );
}
