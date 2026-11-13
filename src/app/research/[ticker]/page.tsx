"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "@/app/research.module.css";
import { useAsk } from "@/components/AppFrame";
import { CandleChart } from "@/components/CandleChart";
import {
  createRecommendation,
  fetchAnalysis,
  fetchPrimaryResearch,
  fetchQuotes,
  type AnalysisPayload,
  type PrimaryResearch,
} from "@/lib/api";

function Delta({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="faint">—</span>;
  const up = value >= 0;
  return (
    <span className={`num ${up ? "up" : "down"}`} style={{ fontWeight: 800 }}>
      {up ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

export default function ResearchPage() {
  const params = useParams<{ ticker: string }>();
  const ticker = (params.ticker || "INFY").toUpperCase();
  const { openAsk } = useAsk();
  const [data, setData] = useState<AnalysisPayload | null>(null);
  const [primary, setPrimary] = useState<PrimaryResearch | null>(null);
  const [live, setLive] = useState<{ price: number; change_pct: number; source?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [logMsg, setLogMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPrimary(null);
    setLive(null);
    setData(null);

    fetchPrimaryResearch(ticker)
      .then((p) => {
        if (!cancelled) setPrimary(p);
      })
      .catch(() => {
        if (!cancelled) setPrimary({ ok: false, ticker, name: ticker, error: "Primary research offline" });
      });

    async function pullQuote() {
      try {
        const q = await fetchQuotes([ticker]);
        if (cancelled) return;
        const row = q.quotes?.[ticker];
        if (row?.price) {
          setLive({ price: row.price, change_pct: row.change_pct, source: row.source });
        }
      } catch {
        /* keep last print */
      }
    }

    async function pullChart() {
      try {
        const a = await fetchAnalysis(ticker);
        if (cancelled) return;
        setData(a);
        if (a.price) {
          setLive({ price: a.price, change_pct: a.change_pct, source: a.live ? "live" : undefined });
        }
        setErr(null);
      } catch {
        if (!cancelled) setErr("Could not load chart.");
      }
    }

    void pullQuote();
    void pullChart();
    const quoteId = window.setInterval(pullQuote, 2500);
    const chartId = window.setInterval(pullChart, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(quoteId);
      window.clearInterval(chartId);
    };
  }, [ticker]);

  const price = live?.price ?? data?.price ?? null;
  const changePct = live?.change_pct ?? data?.change_pct ?? null;
  const isIndex = data?.kind === "index" || ["NIFTY", "SENSEX", "BANKNIFTY"].includes(ticker);

  async function logDecision() {
    if (!data) return;
    setLogging(true);
    setLogMsg(null);
    try {
      const thesis =
        primary?.bull?.[0] ||
        data.indicators
          .slice(0, 3)
          .map((i) => `${i.name}: ${i.note}`)
          .join(" · ");
      await createRecommendation({
        ticker: data.ticker,
        action: data.action,
        entry_price: data.price,
        thesis,
      });
      setLogMsg("Saved to your list");
    } catch {
      setLogMsg("Save failed");
    } finally {
      setLogging(false);
    }
  }

  const toneClass =
    data?.tone === "buy" ? styles.toneBuy : data?.tone === "sell" ? styles.toneSell : styles.toneWait;

  return (
    <main className="screen">
      <div style={{ padding: "8px 16px 0", display: "flex", gap: 10, alignItems: "center" }}>
        <Link href="/search" className={styles.searchLink}>
          Search
        </Link>
      </div>

      <header className={styles.hero}>
        <div className={styles.top}>
          <div className={styles.brandTiny}>FINN</div>
          <span className="eyebrow">
            Pull · primary sources
          </span>
        </div>
        <h1 className={styles.ticker}>{primary?.name ?? data?.name ?? ticker}</h1>
        <p className={styles.sub}>
          {ticker}
          {primary?.sector ? ` · ${primary.sector}` : ""}
        </p>

        <div className={styles.priceRow}>
          <span className={`num ${styles.price}`}>
            {price == null
              ? "…"
              : `${isIndex ? "" : "₹"}${price.toLocaleString("en-IN", {
                  maximumFractionDigits: isIndex ? 2 : 1,
                })}`}
          </span>
          {changePct != null && (
            <span className={`num ${styles.change} ${changePct >= 0 ? "up" : "down"}`}>
              {changePct >= 0 ? "+" : ""}
              {changePct.toFixed(1)}%
            </span>
          )}
          {price != null && (
            <span className={styles.livePill} style={{ marginLeft: 6 }}>
              ● LIVE
            </span>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <section className={styles.block}>
          <div className={styles.chartHead}>
            <h2>Business snapshot</h2>
            <span className="faint">company disclosure</span>
          </div>
          <p>{primary?.snapshot || "Loading company profile from primary filings…"}</p>
          {primary?.discipline && (
            <p className="faint" style={{ marginTop: 8, fontSize: 12, fontWeight: 600 }}>
              {primary.discipline}
            </p>
          )}
        </section>

        {primary?.results && primary.results.length > 0 && (
          <section className={styles.block}>
            <div className={styles.chartHead}>
              <h2>Latest quarter</h2>
              <span className="faint">{primary.quarters?.slice(-1)?.[0] || "filings"}</span>
            </div>
            <div className={styles.metrics}>
              {primary.results.map((row) => (
                <div key={row.label} className={styles.metric}>
                  <span>{row.label}</span>
                  <strong className="num">{row.value ?? "—"}</strong>
                  <span style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <span className="faint" style={{ fontSize: 11 }}>
                      QoQ <Delta value={row.qoq} />
                    </span>
                    <span className="faint" style={{ fontSize: 11 }}>
                      YoY <Delta value={row.yoy} />
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {(primary.opm_latest || primary.eps_latest) && (
              <p style={{ marginTop: 10, fontWeight: 700, fontSize: 13 }}>
                {primary.opm_latest ? `OPM ${primary.opm_latest}` : ""}
                {primary.opm_latest && primary.eps_latest ? " · " : ""}
                {primary.eps_latest ? `EPS ₹${primary.eps_latest}` : ""}
              </p>
            )}
          </section>
        )}

        {primary?.narrative_vs_numbers && primary.narrative_vs_numbers.length > 0 && (
          <section className={styles.block}>
            <h2>Numbers vs story</h2>
            {primary.narrative_vs_numbers.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        )}

        <div className={styles.splitCases}>
          <section className={`${styles.block} ${styles.bullBox}`}>
            <h2>Bull case</h2>
            <ul>
              {(primary?.bull || (primary ? [] : ["Loading…"])).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {primary && !(primary.bull || []).length && (
              <p className="faint">No bull points parsed from the latest tables.</p>
            )}
          </section>
          <section className={`${styles.block} ${styles.bearBox}`}>
            <h2>Bear case</h2>
            <ul>
              {(primary?.bear || (primary ? [] : ["Loading…"])).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {primary && !(primary.bear || []).length && (
              <p className="faint">No bear points parsed from the latest tables.</p>
            )}
          </section>
        </div>

        {primary?.invalidates && (
          <section className={`${styles.block} ${styles.invalidate}`}>
            <h2>What invalidates this</h2>
            <p>{primary.invalidates}</p>
            {primary.action_hint && (
              <p style={{ marginTop: 8, fontWeight: 800 }}>{primary.action_hint}</p>
            )}
          </section>
        )}

        {primary?.ok === false && (
          <section className={styles.block}>
            <h2>Primary research</h2>
            <p className="faint">{primary.error || "Could not load company tables right now."}</p>
          </section>
        )}

        {primary?.sources && (
          <section className={styles.block}>
            <h2>Proof · primary sources</h2>
            <p className="faint" style={{ marginBottom: 8, fontSize: 12, fontWeight: 600 }}>
              {primary.discipline || "Company disclosures only."}
              {primary.as_of ? ` · as of ${primary.as_of}` : ""}
            </p>
            <div className={styles.sourceLinks}>
              {primary.sources.annual_report && (
                <a href={primary.sources.annual_report.url} target="_blank" rel="noreferrer">
                  Annual report →
                </a>
              )}
              {primary.sources.transcript && (
                <a href={primary.sources.transcript.url} target="_blank" rel="noreferrer">
                  Concall transcript →
                </a>
              )}
              {primary.page && (
                <a href={primary.page} target="_blank" rel="noreferrer">
                  Screener filings page →
                </a>
              )}
            </div>
          </section>
        )}

        {data && data.kind !== "index" && (
          <section className={`${styles.verdict} ${toneClass}`}>
            <div className={styles.verdictArrow} aria-hidden>
              {data.stance === "Long" ? "▲" : data.stance === "Sell" ? "▼" : "◆"}
            </div>
            <div>
              <div className={styles.verdictAction}>{data.stance ?? "Keep"}</div>
              <div className={styles.verdictScore}>Tape check · not a substitute for filings</div>
            </div>
          </section>
        )}

        <section className={styles.block}>
          <div className={styles.chartHead}>
            <h2>Price chart</h2>
            <span className={data?.live ? styles.livePill : "faint"}>
              {data?.live ? "● LIVE" : err || "…"}
            </span>
          </div>
          {data ? (
            <CandleChart
              candles={data.candles}
              sma20={data.overlays.sma20}
              sma50={data.overlays.sma50}
              markers={data.markers}
              height={200}
            />
          ) : (
            <p className={styles.loading}>{err ?? "Loading chart…"}</p>
          )}
        </section>

        <button
          type="button"
          className="btn btn-primary"
          disabled={logging || !data}
          onClick={() => void logDecision()}
        >
          {logging ? "Saving…" : "Save this idea"}
        </button>
        {logMsg && <p className={styles.loading}>{logMsg}</p>}

        <button
          type="button"
          className="btn btn-soft"
          onClick={() =>
            openAsk(
              `Using only filings and transcripts, what matters in ${ticker} right now? Keep it short.`,
            )
          }
        >
          Ask FINN (primary only)
        </button>
      </div>
    </main>
  );
}
