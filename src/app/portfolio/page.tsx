"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/app/portfolio.module.css";
import { portfolio as seedPortfolio } from "@/data/portfolio";
import { useProfile } from "@/components/ProfileProvider";
import { buildInsights } from "@/data/intelligence";
import {
  fetchBrokerSnapshot,
  fetchUploadedPortfolio,
  getApiBase,
  pingApi,
  uploadPortfolioCsv,
  type BrokerHolding,
  type BrokerSnapshot,
} from "@/lib/api";

export default function PortfolioPage() {
  const [volX, setVolX] = useState(2);
  const [movePct, setMovePct] = useState(2.5);
  const { profile } = useProfile();
  const insights = useMemo(() => buildInsights(profile), [profile]);

  const [online, setOnline] = useState(false);
  const [snap, setSnap] = useState<BrokerSnapshot | null>(null);
  const [uploaded, setUploaded] = useState<BrokerHolding[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const ok = await pingApi();
    setOnline(ok);
    if (!ok) {
      setErr(`API offline (${getApiBase()}). Run: npm run api`);
      return;
    }
    try {
      const [broker, csvBook] = await Promise.all([
        fetchBrokerSnapshot(),
        fetchUploadedPortfolio(),
      ]);
      setSnap(broker);
      setUploaded(
        csvBook.holdings.map((h) => ({
          ticker: h.ticker,
          name: h.name,
          qty: h.qty,
          avg_price: h.avg_price,
          last_price: h.last_price,
          change_pct: 0,
          market_value: h.market_value,
          invested: h.avg_price * h.qty,
          unrealized_pnl: h.unrealized_pnl,
        })),
      );
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => {
      void reload();
    }, 2000);
    return () => window.clearInterval(id);
  }, [reload]);

  async function onCsv(file: File | null) {
    if (!file) return;
    setMsg(null);
    try {
      const res = await uploadPortfolioCsv(file);
      setMsg(`Uploaded ${res.count} holdings — Home, Protect, and Ask now use this book`);
      window.dispatchEvent(new Event("finn-book-changed"));
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    }
  }

  const rows: Array<{
    ticker: string;
    name: string;
    sector: string;
    price: number;
    changePct: number;
    weight: number;
    volumeRatio: number;
    extra?: string;
  }> = snap
    ? snap.holdings.map((h) => ({
        ticker: h.ticker,
        name: h.name,
        sector: h.sector ?? "—",
        price: h.last_price,
        changePct: h.change_pct,
        weight: h.weight ?? 0,
        volumeRatio: h.ticker === "ASIANPAINT" ? 3.1 : h.ticker === "INFY" ? 2.4 : 1,
        extra: `${h.unrealized_pnl >= 0 ? "+" : ""}₹${Math.round(h.unrealized_pnl).toLocaleString("en-IN")} uPNL`,
      }))
    : seedPortfolio.map((h) => ({
        ticker: h.ticker,
        name: h.name,
        sector: h.sector,
        price: h.price,
        changePct: h.changePct,
        weight: h.weight,
        volumeRatio: h.volumeRatio,
      }));

  const totalValue = snap?.totals.market_value
    ?? seedPortfolio.reduce((s, h) => s + h.price * (h.weight * 100), 0);
  const invested = snap?.totals.invested ?? null;
  const uPnl = snap?.totals.unrealized_pnl ?? null;
  const dayPnlPct =
    rows.length > 0
      ? rows.reduce((s, h) => s + h.changePct * (h.weight || 1), 0) /
        Math.max(
          1,
          rows.reduce((s, h) => s + (h.weight || 1), 0),
        )
      : 0;

  return (
    <main className={`screen ${styles.wrap}`}>
      <div className={styles.brand}>FINN</div>
      <h1 className={styles.title}>The book</h1>
      <p className={styles.sub}>
        Live marks on every name
        {snap?.quotes_meta.live ? " · market quotes on" : ""}. CSV upload for your own book.
      </p>

      <div className={styles.valueRow}>
        <div>
          <span>
            {online ? "Live portfolio value" : "Portfolio value"}
            {snap?.quotes_meta.live ? " · LIVE" : ""}
          </span>
          <strong className="num">₹{Math.round(totalValue).toLocaleString("en-IN")}</strong>
        </div>
        <button type="button" onClick={() => void reload()} style={{ fontWeight: 700, color: "var(--cobalt)" }}>
          Refresh
        </button>
      </div>

      <div className={styles.pnlRow}>
        <div>
          <span>Today</span>
          <strong className={`num ${dayPnlPct >= 0 ? "up" : "down"}`}>
            {dayPnlPct >= 0 ? "+" : ""}
            {dayPnlPct.toFixed(2)}%
          </strong>
        </div>
        <div>
          <span>Invested</span>
          <strong className="num">
            {invested != null ? `₹${Math.round(invested).toLocaleString("en-IN")}` : "—"}
          </strong>
        </div>
        <div>
          <span>Unrealized</span>
          <strong className={`num ${uPnl != null && uPnl >= 0 ? "up" : uPnl != null ? "down" : ""}`}>
            {uPnl != null
              ? `${uPnl >= 0 ? "+" : ""}₹${Math.round(uPnl).toLocaleString("en-IN")}`
              : "—"}
          </strong>
        </div>
      </div>

      {err && <div className={styles.uploadErr}>{err}</div>}
      {msg && <div className={styles.uploadOk}>{msg}</div>}

      <section className={styles.upload}>
        <h2>Manual / CSV portfolio</h2>
        <p>Columns: ticker,qty,avg_price[,name]</p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void onCsv(e.target.files?.[0] ?? null)}
        />
        {uploaded && uploaded.length > 0 && (
          <div className={styles.csvList}>
            {uploaded.map((h) => (
              <div key={h.ticker}>
                <strong>{h.ticker}</strong>
                <span className="num">
                  {h.qty} @ ₹{h.avg_price} → ₹{h.last_price}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.insights}>
        <h2>Portfolio intelligence</h2>
        {insights.slice(0, 3).map((insight) => (
          <div key={insight.id} className={`${styles.insight} ${styles[insight.severity]}`}>
            <strong>{insight.title}</strong>
            <p>{insight.reason}</p>
            {insight.action && <em>{insight.action}</em>}
          </div>
        ))}
      </section>

      <section className={styles.thresholds}>
        <h2>Price & volume alerts</h2>
        <p>FINN watches the tape against these levels.</p>
        <div className={styles.controls}>
          <div className={styles.control}>
            <label>
              <span>Volume vs 20-day average</span>
              <span className="num stamp">{volX.toFixed(1)}×</span>
            </label>
            <input
              type="range"
              min={1.2}
              max={4}
              step={0.1}
              value={volX}
              onChange={(e) => setVolX(Number(e.target.value))}
            />
          </div>
          <div className={styles.control}>
            <label>
              <span>Absolute daily move</span>
              <span className="num stamp">±{movePct.toFixed(1)}%</span>
            </label>
            <input
              type="range"
              min={1}
              max={6}
              step={0.1}
              value={movePct}
              onChange={(e) => setMovePct(Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      <div className={styles.list}>
        {rows.map((h) => {
          const hotVol = h.volumeRatio >= volX;
          const hotMove = Math.abs(h.changePct) >= movePct;
          return (
            <Link
              key={h.ticker}
              href={`/research/${h.ticker}`}
              className={`${styles.row}${hotVol || hotMove ? ` ${styles.rowHot}` : ""}`}
            >
              <div className={styles.name}>
                <strong>{h.ticker}</strong>
                <span>
                  {h.name} · {h.sector}
                  {hotVol ? " · volume" : ""}
                  {hotMove ? " · sharp move" : ""}
                  {h.extra ? ` · ${h.extra}` : ""}
                </span>
              </div>
              <div className={styles.quote}>
                <div className={`num ${styles.price}`}>
                  ₹{h.price.toLocaleString("en-IN", { maximumFractionDigits: 1 })}
                </div>
                <div className={`num ${styles.day} ${h.changePct >= 0 ? "up" : "down"}`}>
                  {h.changePct >= 0 ? "+" : ""}
                  {h.changePct.toFixed(1)}%
                </div>
                <div className={styles.wt}>{h.weight ? `${h.weight.toFixed(1)}% of book` : "CSV"}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <Link href="/guardian" className={styles.riskLink}>
        Protect · risk pulse
      </Link>
      <Link href="/risk" className={styles.riskLink}>
        Risk desk · stop-loss & sizing
      </Link>
      <Link href="/performance" className={styles.riskLink}>
        Track record
      </Link>
      <Link href="/onboarding" className={styles.riskLink}>
        Edit financial profile
      </Link>
    </main>
  );
}
