"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/home.module.css";
import { portfolioPulse, windows } from "@/data/portfolio";
import { Sparkline } from "@/components/Sparkline";
import { fetchDigest, fetchQuotes, type DigestItem } from "@/lib/api";
import { useBook } from "@/lib/book";

const WINDOW_LABEL: Record<(typeof windows)[number], string> = {
  "24h": "Today",
  "3d": "3 days",
  "7d": "7 days",
  MTD: "This month",
};

function shortWhy(text: string) {
  const cut = text.split(/[.!]/)[0];
  return cut.length > 70 ? `${cut.slice(0, 67)}…` : `${cut}.`;
}

export default function AppHomePage() {
  const book = useBook();
  const bookKey = useMemo(() => book.tickers.join(","), [book.tickers]);
  const [windowKey, setWindowKey] = useState<(typeof windows)[number]>("24h");
  const [showMore, setShowMore] = useState(false);
  const pulse = useMemo(() => portfolioPulse(), []);
  const [liveMap, setLiveMap] = useState<
    Record<string, { price: number; change_pct: number; spark?: number[] }>
  >({});
  const [liveAvg, setLiveAvg] = useState<number | null>(null);
  const [quotesLive, setQuotesLive] = useState(false);
  const [quotesErr, setQuotesErr] = useState<string | null>(null);
  const [items, setItems] = useState<DigestItem[]>([]);
  const [digestSrc, setDigestSrc] = useState<string>("…");
  const [digestErr, setDigestErr] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(true);
  const digestReq = useRef(0);

  useEffect(() => {
    if (!book.ready || !book.tickers.length) return;
    let cancelled = false;
    const tickers = book.tickers;
    const holdings = book.holdings;

    async function pull() {
      try {
        const q = await fetchQuotes(tickers);
        if (cancelled) return;
        const next: Record<string, { price: number; change_pct: number; spark?: number[] }> = {};
        let weighted = 0;
        let wsum = 0;
        for (const h of holdings) {
          const row = q.quotes[h.ticker];
          if (!row) continue;
          next[h.ticker] = {
            price: row.price,
            change_pct: row.change_pct,
            spark: row.spark,
          };
          weighted += row.change_pct * h.weight;
          wsum += h.weight;
        }
        setLiveMap(next);
        setQuotesLive(Boolean(q.live));
        setQuotesErr(q.live ? null : "Quotes delayed — showing last good prints where available.");
        if (wsum > 0) setLiveAvg(weighted / wsum);
      } catch {
        if (!cancelled) setQuotesErr("Live quotes unreachable right now. Filings below may still load.");
      }
    }

    void pull();
    const id = window.setInterval(pull, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // bookKey is the stable dependency for ticker identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.ready, bookKey]);

  useEffect(() => {
    if (!book.ready) return;
    let cancelled = false;
    const req = ++digestReq.current;
    setShowMore(false);
    // Only show the loading line when we have nothing to display yet
    setDigestLoading((prev) => prev || items.length === 0);
    if (items.length === 0) setDigestSrc("loading NSE filings…");

    fetchDigest(windowKey, book.tickers)
      .then((d) => {
        if (cancelled || req !== digestReq.current) return;
        setItems(d.items || []);
        setDigestSrc(`${d.source} · ${d.count} items`);
        setDigestErr(null);
        setDigestLoading(false);
      })
      .catch(() => {
        if (cancelled || req !== digestReq.current) return;
        setDigestErr("Could not load NSE filings. Run npm run finn if the API is down.");
        // Keep prior items if we had them — don't flash empty
        setDigestSrc((s) => (s.startsWith("loading") ? "offline" : s));
        setDigestLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey, book.ready, bookKey]);

  const important = items.filter((i) => i.priority === "critical" || i.priority === "high");
  const extra = items.filter((i) => i.priority === "watch" || i.priority === "routine");
  const visible = showMore ? [...important, ...extra] : important.length ? important : items.slice(0, 8);
  const avg = liveAvg ?? pulse.avg;
  const topCharts = book.holdings.slice(0, 4);
  const showLoadingLine = digestLoading && visible.length === 0 && !digestErr;
  const showQuietLine = !digestLoading && visible.length === 0 && !digestErr;

  return (
    <main className="screen">
      <header className={styles.hero}>
        <p className={styles.hello}>Push · what matters</p>
        <h1 className={`brand-mark ${styles.brand}`}>FINN</h1>
        <p className={styles.tag}>NSE filings first. Routine noise buried.</p>

        <div className={styles.moneyCard}>
          <div className={styles.moneyLabel}>
            Your portfolio today
            {quotesLive ? <span className={styles.liveDot}> · LIVE</span> : null}
          </div>
          <div className={`num ${styles.moneyValue} ${avg >= 0 ? "up" : "down"}`}>
            {avg >= 0 ? "+" : ""}
            {avg.toFixed(2)}%
          </div>
          <div className={styles.moneySub}>
            <span className="stamp">{important.length} important</span>
            <span className="faint"> · </span>
            <span className="faint">{extra.length} routine buried</span>
            {!digestLoading && (
              <>
                <span className="faint"> · </span>
                <span className="faint">{digestSrc}</span>
              </>
            )}
          </div>
          <div className={styles.moneySub} style={{ marginTop: 6 }}>
            <span className="faint">
              Book: {book.source === "csv" ? "your CSV holdings" : "default NSE book"}
              {book.tickers.length ? ` · ${book.tickers.length} names` : ""}
            </span>
          </div>
        </div>
      </header>

      <div className={styles.pushNote}>
        <strong>Push rule:</strong> only Important filings earn the desk. Routine updates stay
        collapsed until you ask.
        <Link href="/demo"> Demo path →</Link>
      </div>

      <nav className={styles.path} aria-label="How to use FINN">
        <Link href="/home" className={styles.pathStep}>
          <span>1</span>
          Filings
        </Link>
        <span className={styles.pathSep} aria-hidden>
          →
        </span>
        <Link href="/guardian" className={styles.pathStep}>
          <span>2</span>
          Protect
        </Link>
        <span className={styles.pathSep} aria-hidden>
          →
        </span>
        <Link href="/research/INFY" className={styles.pathStep}>
          <span>3</span>
          Research
        </Link>
      </nav>

      {quotesErr && (
        <p style={{ padding: "8px 16px 0", color: "var(--ink-3)", fontWeight: 700, fontSize: 13 }}>
          {quotesErr}
        </p>
      )}

      <div className={styles.section}>
        <h2>Live book</h2>
        <Link href="/search" className="stamp" style={{ fontWeight: 800 }}>
          Search →
        </Link>
      </div>
      <div className={styles.charts}>
        {topCharts.map((h) => {
          const live = liveMap[h.ticker];
          const chg = live?.change_pct ?? h.changePct;
          const price = live?.price ?? h.price;
          return (
            <Link key={h.ticker} href={`/research/${h.ticker}`} className={`${styles.chartCard} tap`}>
              <div className={styles.chartTop}>
                <strong>{h.ticker}</strong>
                <span className={chg >= 0 ? "up" : "down"}>
                  {chg >= 0 ? "+" : ""}
                  {chg.toFixed(1)}%
                </span>
              </div>
              <Sparkline seed={h.ticker} up={chg >= 0} series={live?.spark} />
              <div className={`num ${styles.chartPrice}`}>
                ₹{price.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
              </div>
            </Link>
          );
        })}
      </div>

      <div style={{ padding: "4px 16px 8px", display: "grid", gap: 8 }}>
        <Link href="/guardian" className="btn btn-soft" style={{ width: "100%" }}>
          Protect · live risk pulse & stops →
        </Link>
        <Link href="/portfolio" className="btn btn-soft" style={{ width: "100%" }}>
          Upload CSV book →
        </Link>
      </div>

      <div className={styles.pills}>
        {windows.map((w) => (
          <button
            key={w}
            type="button"
            className={`${styles.pill}${windowKey === w ? ` ${styles.pillOn}` : ""}`}
            onClick={() => setWindowKey(w)}
          >
            {WINDOW_LABEL[w]}
          </button>
        ))}
      </div>

      <div className={styles.section}>
        <h2>Filings & alerts</h2>
        <span>{WINDOW_LABEL[windowKey]}</span>
      </div>

      {digestErr && <p style={{ padding: "0 16px", color: "#c0392b", fontWeight: 700 }}>{digestErr}</p>}

      <section className={styles.list}>
        {visible.map((item) => (
          <Link key={item.id} href={`/filing/${item.id}`} className={`${styles.card} tap`}>
            <div className={styles.cardTop}>
              <span className={styles.stock}>
                {item.ticker} · {item.badge || item.category}
              </span>
              <span
                className={`${styles.badge}${
                  item.priority === "critical" || item.priority === "high" ? "" : ` ${styles.badgeSoft}`
                }`}
              >
                {item.priority === "critical" || item.priority === "high" ? "Important" : "FYI"}
              </span>
            </div>
            <h3 className={styles.title}>{item.title}</h3>
            <p className={styles.oneLine}>
              {item.priority === "critical" || item.priority === "high"
                ? shortWhy(item.whyItMatters)
                : `${(item.summary || "").split(/[.!]/)[0]}.`}
            </p>
            <span className={styles.openBtn}>Open →</span>
          </Link>
        ))}
      </section>

      {showLoadingLine && (
        <p style={{ padding: "12px 16px", color: "var(--ink-3)", fontWeight: 600 }}>
          Loading filings from NSE…
        </p>
      )}
      {showQuietLine && (
        <p style={{ padding: "12px 16px", color: "var(--ink-3)", fontWeight: 600 }}>
          Quiet tape for this window — no NSE filings to show. Live prices above still update when
          the feed is up.
        </p>
      )}

      {!showMore && extra.length > 0 && important.length > 0 && (
        <div className={styles.more}>
          <button type="button" onClick={() => setShowMore(true)}>
            Show {extra.length} routine updates
          </button>
        </div>
      )}
    </main>
  );
}
