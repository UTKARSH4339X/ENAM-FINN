"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "@/app/research.module.css";
import { useAsk } from "@/components/AppFrame";
import { CandleChart } from "@/components/CandleChart";
import {
  createRecommendation,
  fetchAnalysis,
  fetchPrimaryResearch,
  fetchQuotes,
  type AnalysisPayload,
  type ChartRange,
  type PrimaryResearch,
} from "@/lib/api";
import { placePaperOrder, type PaperSide } from "@/lib/paperTrade";

const RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "ALL"];

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
  const [range, setRange] = useState<ChartRange>("3M");
  const [data, setData] = useState<AnalysisPayload | null>(null);
  const [primary, setPrimary] = useState<PrimaryResearch | null>(null);
  const [live, setLive] = useState<{ price: number; change_pct: number; source?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadingChart, setLoadingChart] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [logging, setLogging] = useState(false);
  const [logMsg, setLogMsg] = useState<string | null>(null);

  const [side, setSide] = useState<PaperSide>("BUY");
  const [qty, setQty] = useState("1");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tradeMsg, setTradeMsg] = useState<string | null>(null);
  const [tradeErr, setTradeErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPrimary(null);
    fetchPrimaryResearch(ticker)
      .then((p) => {
        if (!cancelled) setPrimary(p);
      })
      .catch(() => {
        if (!cancelled) setPrimary({ ok: false, ticker, name: ticker, error: "Primary research offline" });
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  useEffect(() => {
    let cancelled = false;

    async function pullQuote() {
      try {
        const q = await fetchQuotes([ticker]);
        if (cancelled) return;
        const row = q.quotes?.[ticker];
        if (row?.price) setLive({ price: row.price, change_pct: row.change_pct, source: row.source });
      } catch {
        /* keep */
      }
    }

    async function pullChart() {
      setLoadingChart(true);
      setErr(null);
      try {
        const a = await fetchAnalysis(ticker, range);
        if (cancelled) return;
        setData(a);
        if (a.price) setLive({ price: a.price, change_pct: a.change_pct, source: a.live ? "live" : undefined });
        if (a.error === "chart_unavailable" || !a.candles?.length) {
          setErr(a.trend_reason || "Chart data unavailable for this range.");
        } else {
          setErr(null);
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setErr("Could not load chart. Check connection and retry.");
        }
      } finally {
        if (!cancelled) setLoadingChart(false);
      }
    }

    void pullQuote();
    void pullChart();
    const quoteId = window.setInterval(pullQuote, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(quoteId);
    };
  }, [ticker, range, retryKey]);

  const price = live?.price ?? data?.price ?? null;
  const changePct = live?.change_pct ?? data?.change_pct ?? null;
  const isIndex = data?.kind === "index" || ["NIFTY", "SENSEX", "BANKNIFTY"].includes(ticker);

  const qtyNum = Math.max(0, Math.floor(Number(qty) || 0));
  const estValue = useMemo(() => {
    if (!price || qtyNum < 1) return null;
    return Math.round(qtyNum * price * 100) / 100;
  }, [price, qtyNum]);

  const trend = data?.trend || (data?.tone === "buy" ? "BULLISH" : data?.tone === "sell" ? "BEARISH" : "NEUTRAL");
  const trendClass =
    trend === "BULLISH"
      ? styles.trendBull
      : trend === "BEARISH"
        ? styles.trendBear
        : styles.trendNeutral;

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
      setLogMsg("Save failed — paper trades below still work offline.");
    } finally {
      setLogging(false);
    }
  }

  function openConfirm() {
    setTradeErr(null);
    setTradeMsg(null);
    if (!price) {
      setTradeErr("Wait for live price before placing a paper order.");
      return;
    }
    if (qtyNum < 1) {
      setTradeErr("Enter a quantity of at least 1.");
      return;
    }
    setConfirmOpen(true);
  }

  function submitPaper() {
    try {
      if (!price) throw new Error("Live price unavailable.");
      const order = placePaperOrder({ ticker, side, qty: qtyNum, price });
      setConfirmOpen(false);
      setTradeMsg(
        `Paper ${order.side} ${order.qty} ${order.ticker} @ ₹${order.price.toLocaleString("en-IN")} · value ₹${order.value.toLocaleString("en-IN")}. No real broker order was sent.`,
      );
      setTradeErr(null);
    } catch (e) {
      setTradeErr(e instanceof Error ? e.message : "Order failed");
      setConfirmOpen(false);
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
          <span className="eyebrow">Pull · live tape + filings</span>
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
        {/* Technical trend */}
        <section className={`${styles.trendBanner} ${trendClass}`}>
          <div className={styles.trendLabel}>{trend}</div>
          <div className={styles.trendMeta}>
            Technical signal · strength {data?.trend_strength ?? 0}%
            {data?.as_of
              ? ` · updated ${new Date(data.as_of).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} Asia/Calcutta`
              : ""}
          </div>
          <p className={styles.trendReason}>
            {data?.trend_reason ||
              (loadingChart ? "Loading indicators…" : "DATA UNAVAILABLE — not enough market history.")}
          </p>
          <p className="faint" style={{ fontSize: 11, fontWeight: 700, margin: 0 }}>
            Not a guaranteed prediction. Confirm with filings before acting.
          </p>
        </section>

        {data?.indicators && data.indicators.length > 0 && (
          <section className={styles.block}>
            <h2>Indicators</h2>
            <div className={styles.indTable}>
              {data.indicators.slice(0, 8).map((row) => (
                <div key={row.id} className={styles.indRow}>
                  <span style={{ fontWeight: 700 }}>{row.name}</span>
                  <span className="num" style={{ fontWeight: 800 }}>
                    {typeof row.value === "number" ? row.value.toLocaleString("en-IN") : row.value}
                  </span>
                  <span
                    className={row.signal === "buy" ? "up" : row.signal === "sell" ? "down" : "faint"}
                    style={{ fontWeight: 800, textAlign: "right" }}
                  >
                    {row.note}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={styles.block}>
          <div className={styles.chartHead}>
            <h2>Price chart</h2>
            <span className={data?.live && data.candles?.length ? styles.livePill : "faint"}>
              {loadingChart ? "Loading…" : data?.live && data.candles?.length ? "● LIVE" : "Offline"}
            </span>
          </div>

          <div className={styles.rangeRow} role="tablist" aria-label="Chart range">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className={`${styles.rangeChip}${range === r ? ` ${styles.rangeOn}` : ""}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>

          {loadingChart && !data?.candles?.length ? (
            <p className={styles.loading}>Loading {range} chart…</p>
          ) : data?.candles?.length ? (
            <CandleChart
              candles={data.candles}
              sma20={data.overlays.sma20}
              sma50={data.overlays.sma50}
              markers={data.markers}
              height={220}
            />
          ) : (
            <div className={styles.chartError}>
              <p>{err || "No chart data for this range."}</p>
              <button type="button" className="btn btn-soft" onClick={() => setRetryKey((k) => k + 1)}>
                Retry chart
              </button>
            </div>
          )}
          {data?.disclaimer && (
            <p className="faint" style={{ marginTop: 8, fontSize: 11, fontWeight: 600 }}>
              {data.disclaimer}
            </p>
          )}
        </section>

        {/* Paper Buy / Sell */}
        {!isIndex && (
          <section className={`${styles.block} ${styles.paperBox}`}>
            <div className={styles.paperBadge}>PAPER TRADING</div>
            <h2>Buy / Sell</h2>
            <p className="faint" style={{ fontSize: 13, fontWeight: 600, marginTop: -4 }}>
              Simulated orders only. No real broker is connected — nothing is executed in the market.
            </p>
            <div className={styles.sideRow}>
              <button
                type="button"
                className={`${styles.sideBtn}${side === "BUY" ? ` ${styles.sideBuyOn}` : ""}`}
                onClick={() => setSide("BUY")}
              >
                BUY
              </button>
              <button
                type="button"
                className={`${styles.sideBtn}${side === "SELL" ? ` ${styles.sideSellOn}` : ""}`}
                onClick={() => setSide("SELL")}
              >
                SELL
              </button>
            </div>
            <div className={styles.qtyRow}>
              <label htmlFor="qty">Quantity · {ticker}</label>
              <input
                id="qty"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Shares"
              />
            </div>
            <p className={styles.estValue}>
              Price{" "}
              {price != null ? `₹${price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "…"}
              {estValue != null
                ? ` · Est. value ₹${estValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                : ""}
            </p>
            <button type="button" className="btn btn-primary" onClick={openConfirm} disabled={!price}>
              Review {side} order
            </button>
            {tradeErr && (
              <p className="down" style={{ fontWeight: 700, fontSize: 13 }}>
                {tradeErr}
              </p>
            )}
            {tradeMsg && (
              <p className="up" style={{ fontWeight: 700, fontSize: 13 }}>
                {tradeMsg}
              </p>
            )}
            {confirmOpen && (
              <div
                style={{
                  border: "1.5px solid var(--line-strong)",
                  borderRadius: 14,
                  padding: 14,
                  display: "grid",
                  gap: 10,
                  background: "var(--sheet)",
                }}
              >
                <strong>
                  Confirm paper {side} {qtyNum} {ticker}
                </strong>
                <p style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 600 }}>
                  @ ₹{price?.toLocaleString("en-IN")} · est. ₹
                  {estValue?.toLocaleString("en-IN")} — this will not send a real order.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button type="button" className="btn btn-soft" onClick={() => setConfirmOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-accent" onClick={submitPaper}>
                    Confirm paper {side}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className={styles.block}>
          <div className={styles.chartHead}>
            <h2>Business snapshot</h2>
            <span className="faint">company disclosure</span>
          </div>
          <p>{primary?.snapshot || "Loading company profile from primary filings…"}</p>
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
          </section>
          <section className={`${styles.block} ${styles.bearBox}`}>
            <h2>Bear case</h2>
            <ul>
              {(primary?.bear || (primary ? [] : ["Loading…"])).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </section>
        </div>

        {primary?.invalidates && (
          <section className={`${styles.block} ${styles.invalidate}`}>
            <h2>What invalidates this</h2>
            <p>{primary.invalidates}</p>
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
            openAsk(`Using only filings and transcripts, what matters in ${ticker} right now? Keep it short.`)
          }
        >
          Ask FINN (primary only)
        </button>
      </div>
    </main>
  );
}
