"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./performance.module.css";
import {
  closeRecommendation,
  fetchRecommendations,
  getApiBase,
  pingApi,
  type Recommendation,
} from "@/lib/api";
export default function PerformancePage() {
  const [online, setOnline] = useState(false);
  const [items, setItems] = useState<Recommendation[]>([]);
  const [stats, setStats] = useState<{ open: number; closed: number; win_rate_closed: number | null }>({
    open: 0,
    closed: 0,
    win_rate_closed: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const ok = await pingApi();
    setOnline(ok);
    if (!ok) {
      setError(`API offline at ${getApiBase()}. Start backend: npm run api`);
      return;
    }
    try {
      const data = await fetchRecommendations();
      setItems(data.items);
      setStats(data.stats);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onClose(rec: Recommendation) {
    const mark = rec.mark_price ?? rec.entry_price;
    const raw = window.prompt(`Exit price for ${rec.ticker}`, String(mark));
    if (!raw) return;
    const exit = Number(raw);
    if (!Number.isFinite(exit)) return;
    setBusyId(rec.id);
    try {
      await closeRecommendation(rec.id, exit, "Closed from Performance desk");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Close failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className={`screen ${styles.wrap}`}>
      <div className={styles.brand}>FINN</div>
      <h1 className={styles.title}>Track record</h1>
      <p className={styles.sub}>
        Logs FINN recommendations and scores outcomes against live marks.
      </p>

      <div className={styles.status}>
        <span className={online ? styles.up : styles.down}>
          API {online ? "online" : "offline"}
        </span>
        <button type="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.stats}>
        <div>
          <span>Open</span>
          <strong className="num">{stats.open}</strong>
        </div>
        <div>
          <span>Closed</span>
          <strong className="num">{stats.closed}</strong>
        </div>
        <div>
          <span>Win rate</span>
          <strong className="num">
            {stats.win_rate_closed == null ? "—" : `${stats.win_rate_closed}%`}
          </strong>
        </div>
      </div>

      <div className={styles.list}>
        {items.length === 0 && (
          <p className={styles.empty}>
            No recommendations yet. Open Research → save an idea to the tracker.
          </p>
        )}
        {items.map((item) => (
          <article key={item.id} className={styles.card}>
            <div className={styles.head}>
              <strong>
                {item.ticker} · {item.action}
              </strong>
              <span>{item.status}</span>
            </div>
            <p>{item.thesis}</p>
            <div className={styles.meta}>
              <span className="num">Entry ₹{item.entry_price}</span>
              {item.status === "open" && item.mark_price != null && (
                <span className={`num ${(item.unrealized_pct ?? 0) >= 0 ? "up" : "down"}`}>
                  Mark ₹{item.mark_price} ({item.unrealized_pct ?? 0}%)
                </span>
              )}
              {item.status === "closed" && item.realized_pct != null && (
                <span className={`num ${item.realized_pct >= 0 ? "up" : "down"}`}>
                  Realized {item.realized_pct}%
                </span>
              )}
            </div>
            {item.status === "open" && (
              <button
                type="button"
                className={styles.closeBtn}
                disabled={busyId === item.id}
                onClick={() => void onClose(item)}
              >
                Close trade
              </button>
            )}
          </article>
        ))}
      </div>

      <Link href="/guardian" className={styles.link}>
        Back to Guardian
      </Link>
    </main>
  );
}
