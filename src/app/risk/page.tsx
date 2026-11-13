"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./risk.module.css";
import {
  BOOK_VALUE,
  calcPlan,
  defaultRules,
  formatInr,
  holdingFor,
  type RiskRule,
} from "@/data/risk";
import { fetchQuotes } from "@/lib/api";
import { loadRiskRules, saveRiskRules } from "@/lib/protect";

export default function RiskPage() {
  const [rules, setRules] = useState<RiskRule[]>(defaultRules);
  const [active, setActive] = useState(0);
  const [liveMap, setLiveMap] = useState<Record<string, { price: number; change_pct: number }>>(
    {},
  );
  const [live, setLive] = useState(false);

  useEffect(() => {
    setRules(loadRiskRules());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const tickers = rules.map((r) => r.ticker);
        const q = await fetchQuotes(tickers);
        if (cancelled) return;
        const next: Record<string, { price: number; change_pct: number }> = {};
        for (const [k, v] of Object.entries(q.quotes || {})) {
          if (v?.price) next[k] = { price: v.price, change_pct: v.change_pct };
        }
        setLiveMap(next);
        setLive(Boolean(q.live));
      } catch {
        /* keep */
      }
    }
    void pull();
    const id = window.setInterval(pull, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [rules]);

  const rule = rules[active];
  const holding = holdingFor(rule.ticker);
  const lastPrice = liveMap[rule.ticker]?.price ?? holding?.price;
  const changePct = liveMap[rule.ticker]?.change_pct ?? holding?.changePct ?? 0;
  const plan = useMemo(() => calcPlan(rule, lastPrice), [rule, lastPrice]);

  function patch(partial: Partial<RiskRule>) {
    setRules((prev) => {
      const next = prev.map((r, i) => (i === active ? { ...r, ...partial } : r));
      saveRiskRules(next);
      return next;
    });
  }

  function syncEntryToLive() {
    if (lastPrice) patch({ entry: Number(lastPrice.toFixed(1)) });
  }

  return (
    <main className={`screen ${styles.wrap}`}>
      <div className={styles.brand}>FINN</div>
      <h1 className={styles.title}>Stop loss</h1>
      <p className={styles.sub}>
        Decide the max you can lose on one idea. FINN sizes shares from that risk budget.
      </p>

      <div className={styles.bookChip}>
        <span>Book value</span>
        <strong className="num">{formatInr(BOOK_VALUE)}</strong>
      </div>

      <div className={styles.tickerRow}>
        {rules.map((r, i) => (
          <button
            key={r.ticker}
            type="button"
            className={`${styles.tickerBtn}${i === active ? ` ${styles.on}` : ""}`}
            onClick={() => setActive(i)}
          >
            {r.ticker}
          </button>
        ))}
      </div>

      <section className={styles.priceCard}>
        <div className={styles.priceTop}>
          <div>
            <div className={styles.name}>{holding?.name ?? rule.ticker}</div>
            <div className={styles.ex}>NSE · {live ? "LIVE quote" : "last print"}</div>
          </div>
          <div className={styles.priceBlock}>
            <div className={`num ${styles.last}`}>
              ₹{(lastPrice ?? rule.entry).toLocaleString("en-IN", { maximumFractionDigits: 1 })}
            </div>
            <div className={`num ${changePct >= 0 ? "up" : "down"}`}>
              {changePct >= 0 ? "+" : ""}
              {changePct.toFixed(1)}%
            </div>
          </div>
        </div>

        <div className={styles.levels}>
          <div>
            <span>Entry</span>
            <strong className="num">₹{rule.entry.toLocaleString("en-IN")}</strong>
          </div>
          <div>
            <span>Stop</span>
            <strong className={`num down`}>{formatInr(plan.stopPrice)}</strong>
          </div>
          <div>
            <span>Target</span>
            <strong className={`num up`}>{formatInr(plan.targetPrice)}</strong>
          </div>
        </div>

        {plan.breached ? (
          <div className={styles.breach}>
            Stop breached on live/last print. Exit signal fired
            {rule.autoExit ? " — auto-exit was armed." : " — alert only (auto-exit off)."}
          </div>
        ) : (
          <div className={styles.safe}>
            Cushion to stop: <strong className="num">{plan.distToStop.toFixed(1)}%</strong>
          </div>
        )}

        <button type="button" className={styles.syncBtn} onClick={syncEntryToLive} disabled={!lastPrice}>
          Use live price as entry
        </button>
      </section>

      <section className={styles.panel}>
        <h2>Your limits</h2>

        <label className={styles.field}>
          <span>
            Stop loss
            <b className="num stamp">{rule.stopPct.toFixed(1)}%</b>
          </span>
          <input
            type="range"
            min={1}
            max={8}
            step={0.1}
            value={rule.stopPct}
            onChange={(e) => patch({ stopPct: Number(e.target.value) })}
          />
        </label>

        <label className={styles.field}>
          <span>
            Target
            <b className="num up">{rule.targetPct.toFixed(1)}%</b>
          </span>
          <input
            type="range"
            min={2}
            max={15}
            step={0.1}
            value={rule.targetPct}
            onChange={(e) => patch({ targetPct: Number(e.target.value) })}
          />
        </label>

        <label className={styles.field}>
          <span>
            Max risk on this idea
            <b className="num">{rule.riskBudgetPct.toFixed(2)}% of book</b>
          </span>
          <input
            type="range"
            min={0.1}
            max={1.2}
            step={0.05}
            value={rule.riskBudgetPct}
            onChange={(e) => patch({ riskBudgetPct: Number(e.target.value) })}
          />
          <em>Keeps pain small — never a large chunk of the book on one name.</em>
        </label>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={rule.autoExit}
            onChange={(e) => patch({ autoExit: e.target.checked })}
          />
          <span>
            <strong>Auto-exit when stop hits</strong>
            If price hits your stop, FINN marks the idea closed in your tracker.
          </span>
        </label>
      </section>

      <section className={styles.panel}>
        <h2>Suggested size</h2>
        <div className={styles.calcGrid}>
          <div>
            <span>Max loss allowed</span>
            <strong className="num">{formatInr(plan.maxLossRs)}</strong>
          </div>
          <div>
            <span>Shares to hold</span>
            <strong className="num">{plan.shares.toLocaleString("en-IN")}</strong>
          </div>
          <div>
            <span>Position value</span>
            <strong className="num">{formatInr(plan.positionValue)}</strong>
          </div>
          <div>
            <span>If target hits</span>
            <strong className="num up">{formatInr(plan.expectedProfit)}</strong>
          </div>
          <div className={styles.wide}>
            <span>Reward / risk</span>
            <strong className="num">{plan.rr.toFixed(2)}×</strong>
          </div>
        </div>
        <p className={styles.note}>
          Same stop, tighter risk budget → fewer shares. That is how FINN refuses oversized bets
          while still letting you hunt asymmetric payoffs.
        </p>
      </section>

      <Link href="/guardian" className={styles.linkBtn}>
        ← Back to Protect
      </Link>
      <Link href={`/research/${rule.ticker}`} className={styles.linkBtn}>
        Open {rule.ticker} research
      </Link>
    </main>
  );
}
