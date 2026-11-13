"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./search.module.css";
import { fetchQuotes, searchStocks, type SearchHit, type UniverseStats } from "@/lib/api";

const QUICK = [
  { ticker: "NIFTY", label: "Nifty 50" },
  { ticker: "SENSEX", label: "Sensex" },
  { ticker: "BANKNIFTY", label: "Bank Nifty" },
  { ticker: "RELIANCE", label: "Reliance" },
  { ticker: "TCS", label: "TCS" },
  { ticker: "HDFCBANK", label: "HDFC Bank" },
  { ticker: "INFY", label: "Infosys" },
  { ticker: "SBIN", label: "SBI" },
];

const CHUNK = 500;
const PAINT = 180;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [ex, setEx] = useState<"ALL" | "NSE" | "BSE" | "IPO" | "INDEX">("NSE");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [universe, setUniverse] = useState<UniverseStats | null>(null);
  const [idxQuotes, setIdxQuotes] = useState<
    Record<string, { price: number; change_pct: number }>
  >({});
  const [visibleCount, setVisibleCount] = useState(PAINT);
  const [hasMoreApi, setHasMoreApi] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const loadGen = useRef(0);

  const quoteTickers = useMemo(() => {
    const base = ["NIFTY", "SENSEX", "BANKNIFTY", "RELIANCE", "TCS", "HDFCBANK", "INFY", "SBIN", "ITC"];
    const fromHits = hits.slice(0, 24).map((h) => h.ticker);
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
        /* keep */
      }
    }
    void pull();
    const id = window.setInterval(pull, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [quoteTickers]);

  useEffect(() => {
    let cancelled = false;
    const gen = ++loadGen.current;
    const handle = window.setTimeout(() => {
      setLoading(true);
      setVisibleCount(PAINT);
      setHits([]);
      const listing = ex === "IPO" ? "ipo" : ex === "INDEX" ? "index" : undefined;
      const exchange = ex === "NSE" || ex === "BSE" ? ex : undefined;

      async function run() {
        try {
          // First chunk fast so the list appears immediately
          const first = await searchStocks(q, CHUNK, listing, { exchange, offset: 0 });
          if (cancelled || gen !== loadGen.current) return;
          setHits(first.results);
          setUniverse(first.universe ?? null);
          setErr(null);
          setLoading(false);
          setHasMoreApi(first.results.length >= CHUNK && !q.trim());

          // Pull remaining NSE pages in background (browse only)
          if (!q.trim() && first.results.length >= CHUNK) {
            setLoadingMore(true);
            let offset = first.results.length;
            let guard = 0;
            let acc = first.results;
            while (guard < 12) {
              guard += 1;
              const page = await searchStocks(q, CHUNK, listing, { exchange, offset });
              if (cancelled || gen !== loadGen.current) return;
              if (!page.results.length) break;
              const seen = new Set(acc.map((h) => `${h.exchange}-${h.ticker}`));
              const merged = [...acc];
              for (const row of page.results) {
                const key = `${row.exchange}-${row.ticker}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  merged.push(row);
                }
              }
              acc = merged;
              setHits(merged);
              setUniverse(page.universe ?? null);
              offset = merged.length;
              if (page.results.length < CHUNK) break;
            }
            setHasMoreApi(false);
            setLoadingMore(false);
          }
        } catch {
          if (cancelled || gen !== loadGen.current) return;
          setErr("Search offline — run: npm run finn");
          setHits([]);
          setLoading(false);
          setLoadingMore(false);
          setHasMoreApi(false);
        }
      }

      void run();
    }, q ? 180 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [q, ex]);

  const indices = hits.filter((h) => h.kind === "index");
  const equities = hits.filter((h) => h.kind !== "index");
  const equityList = q ? hits : equities;
  const painted = equityList.slice(0, visibleCount);
  const canRevealMore = painted.length < equityList.length;
  const nseTotal = universe?.nse_equities ?? null;

  useEffect(() => {
    if (!canRevealMore) return;
    const node = sentinel.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((n) => Math.min(n + PAINT, equityList.length));
        }
      },
      { rootMargin: "500px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [canRevealMore, equityList.length]);

  return (
    <main className={`screen ${styles.wrap}`}>
      <div className={styles.brand}>FINN</div>
      <h1 className={styles.title}>Markets</h1>
      <p className={styles.sub}>
        Full NSE equity list
        {nseTotal != null ? ` · ${nseTotal.toLocaleString("en-IN")} stocks` : ""}
      </p>

      <div className={styles.searchBox}>
        <span aria-hidden>⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search any NSE stock (RELIANCE, INFY…)"
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
        {(["NSE", "ALL", "INDEX", "BSE", "IPO"] as const).map((k) => (
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
          ? "Loading NSE stocks…"
          : err
            ? err
            : q
              ? `${hits.length.toLocaleString("en-IN")} matches`
              : `${equityList.length.toLocaleString("en-IN")} NSE stocks${
                  loadingMore ? " · loading rest…" : nseTotal != null ? ` of ${nseTotal.toLocaleString("en-IN")}` : ""
                }`}
      </p>

      {!q && indices.length > 0 && ex !== "NSE" && (
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
                      <span className={styles.ex}>{h.exchange}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <h2 className={styles.section}>{q ? "Results" : "All NSE stocks (A–Z)"}</h2>
      <div className={styles.list}>
        {painted.map((h) => {
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

      {(canRevealMore || hasMoreApi) && (
        <div ref={sentinel} style={{ padding: "12px 0 24px", textAlign: "center" }}>
          <button
            type="button"
            className="btn btn-soft"
            disabled={loadingMore && !canRevealMore}
            onClick={() => setVisibleCount((n) => Math.min(n + PAINT, equityList.length))}
          >
            {loadingMore && !canRevealMore
              ? "Loading remaining NSE stocks…"
              : `Show more (${painted.length.toLocaleString("en-IN")} / ${equityList.length.toLocaleString("en-IN")})`}
          </button>
        </div>
      )}

      {!loading && !err && !canRevealMore && !loadingMore && equityList.length > 0 && !q && (
        <p className={styles.status} style={{ paddingBottom: 20 }}>
          End of list · {equityList.length.toLocaleString("en-IN")} NSE names
        </p>
      )}

      {!loading && !err && hits.length === 0 && q.trim() && (
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
