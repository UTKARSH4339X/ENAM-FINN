"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./guardian.module.css";
import { useProfile } from "@/components/ProfileProvider";
import { fetchQuotes } from "@/lib/api";
import { useBook } from "@/lib/book";
import {
  computeProtectPulse,
  liveGuardianFeed,
  loadRiskRules,
  type LiveQuote,
} from "@/lib/protect";

const KIND_LABEL = {
  risk: "Risk",
  alert: "Alert",
  opportunity: "Idea",
  thesis: "Check",
} as const;

export default function GuardianPage() {
  const { profile, ready } = useProfile();
  const book = useBook();
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [live, setLive] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);

  useEffect(() => {
    if (!book.ready || !book.tickers.length) return;
    let cancelled = false;

    async function pull() {
      try {
        const q = await fetchQuotes(book.tickers);
        if (cancelled) return;
        const next: Record<string, LiveQuote> = {};
        for (const [k, v] of Object.entries(q.quotes || {})) {
          if (v?.price) next[k] = { price: v.price, change_pct: v.change_pct };
        }
        setQuotes(next);
        setLive(Boolean(q.live));
        setQuoteErr(null);
      } catch {
        if (!cancelled) setQuoteErr("Live quotes offline — pulse using last known book weights.");
      }
    }

    void pull();
    const id = window.setInterval(pull, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [book.ready, book.tickers]);

  const rules = useMemo(() => loadRiskRules(), []);
  const pulse = useMemo(
    () => (ready ? computeProtectPulse(profile, quotes, rules, book.holdings) : null),
    [ready, profile, quotes, rules, book.holdings],
  );
  const feed = useMemo(
    () => (ready ? liveGuardianFeed(profile, quotes, book.holdings).slice(0, 8) : []),
    [ready, profile, quotes, book.holdings],
  );

  const statusClass =
    pulse?.status === "critical"
      ? styles.statusCritical
      : pulse?.status === "watch"
        ? styles.statusWatch
        : styles.statusOk;

  return (
    <main className={`screen ${styles.wrap}`}>
      <div className={styles.brand}>FINN</div>
      <h1 className={styles.title}>Protect</h1>
      <p className={styles.sub}>
        Live risk pulse for your book — warnings, stops, and size limits before you add pain.
        {book.source === "csv" ? " Using your CSV holdings." : ""}
      </p>

      {quoteErr && (
        <p style={{ padding: "0 16px", color: "var(--ink-3)", fontWeight: 700, fontSize: 13 }}>
          {quoteErr}
        </p>
      )}

      {pulse && (
        <section className={`${styles.pulse} ${statusClass}`}>
          <div className={styles.pulseTop}>
            <div>
              <div className={styles.pulseLabel}>Book today {live ? "· LIVE" : ""}</div>
              <div className={`num ${styles.pulseBig} ${pulse.todayPct >= 0 ? "up" : "down"}`}>
                {pulse.todayPct >= 0 ? "+" : ""}
                {pulse.todayPct.toFixed(2)}%
              </div>
            </div>
            <div className={styles.pulseBadge}>
              {pulse.status === "critical" ? "Act now" : pulse.status === "watch" ? "Watch" : "Steady"}
            </div>
          </div>
          <p className={styles.pulseLine}>{pulse.statusLine}</p>
          <div className={styles.metrics}>
            <div>
              <span>Max name</span>
              <strong>
                {pulse.maxName
                  ? `${pulse.maxName.ticker} ${pulse.maxName.weight.toFixed(1)}%`
                  : "—"}
              </strong>
            </div>
            <div>
              <span>Max sector</span>
              <strong>
                {pulse.maxSector
                  ? `${pulse.maxSector.sector} ${pulse.maxSector.pct.toFixed(0)}%`
                  : "—"}
              </strong>
            </div>
            <div>
              <span>Your drawdown cap</span>
              <strong>{pulse.drawdownLimit}%</strong>
            </div>
            <div>
              <span>Stops armed</span>
              <strong>
                {pulse.stopsArmed}
                {pulse.stopsBreached ? ` · ${pulse.stopsBreached} hit` : ""}
              </strong>
            </div>
          </div>
        </section>
      )}

      {pulse && pulse.losers.length > 0 && (
        <section className={styles.movers}>
          <h2>Needs a look</h2>
          <div className={styles.moverRow}>
            {pulse.losers.map((l) => (
              <Link key={l.ticker} href={`/research/${l.ticker}`} className={styles.moverChip}>
                <strong>{l.ticker}</strong>
                <span className="down">
                  {l.changePct.toFixed(1)}%
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={styles.checklist}>
        <h2>What to do here</h2>
        <ol>
          <li>Read alerts that match today’s tape.</li>
          <li>Set a stop + risk budget on names you actually hold.</li>
          <li>Keep sector / name weight inside your profile limits.</li>
          <li>Only then open Research to decide Keep / Long / Sell.</li>
        </ol>
      </section>

      <div className={styles.sectionHead}>
        <h2>Alerts</h2>
        <span className="faint">{feed.length} open</span>
      </div>

      <div className={styles.feed}>
        {feed.map((item) => (
          <article key={item.id} className={`${styles.card} ${styles[item.kind]}`}>
            <div className={styles.meta}>
              <span className={styles.kind}>{KIND_LABEL[item.kind]}</span>
              <span className={styles.when}>{item.when}</span>
            </div>
            <h2>{item.title}</h2>
            <p>{item.body}</p>
            <div className={styles.cardActions}>
              {item.ticker && (
                <Link href={`/research/${item.ticker}`} className={styles.link}>
                  Research →
                </Link>
              )}
              <Link href="/risk" className={styles.link}>
                Set stop →
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className={styles.rowLinks}>
        <Link href="/risk" className="btn btn-primary">
          Set stop loss & size
        </Link>
        <Link href="/portfolio" className="btn btn-soft">
          My stocks
        </Link>
        <Link href="/performance" className="btn btn-soft">
          Track record
        </Link>
        <Link href="/onboarding" className="btn btn-soft">
          Edit risk profile
        </Link>
      </div>
    </main>
  );
}
