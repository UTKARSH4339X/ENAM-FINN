"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "@/app/detail.module.css";
import { IconBack } from "@/components/Icons";
import { useAsk } from "@/components/AppFrame";
import { fetchFiling, fetchPrimaryResearch, type DigestItem, type PrimaryResearch } from "@/lib/api";

function Delta({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="faint">—</span>;
  const up = value >= 0;
  return (
    <span className={`num ${styles.delta} ${up ? "up" : "down"}`}>
      {up ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

export default function FilingPage() {
  const params = useParams<{ id: string }>();
  const { openAsk } = useAsk();
  const [item, setItem] = useState<DigestItem | null>(null);
  const [primary, setPrimary] = useState<PrimaryResearch | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItem(null);
    setPrimary(null);
    setErr(null);
    fetchFiling(params.id)
      .then((f) => {
        if (cancelled) return;
        setItem(f);
        if (f.ticker) {
          void fetchPrimaryResearch(f.ticker)
            .then((p) => {
              if (!cancelled) setPrimary(p);
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (!cancelled) setErr("Filing not found. Go back to Home and reopen.");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (err) {
    return (
      <main className="screen" style={{ padding: 20 }}>
        <Link href="/home" className={styles.back}>
          <IconBack /> Back
        </Link>
        <p style={{ marginTop: 20, fontWeight: 700 }}>{err}</p>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="screen" style={{ padding: 20 }}>
        <p className="faint" style={{ fontWeight: 600 }}>
          Loading NSE filing…
        </p>
      </main>
    );
  }

  const showResults = item.category === "results" && primary?.results?.length;
  const nseQuoteUrl = `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(item.ticker)}`;
  const sourceLabel =
    item.source === "market" ? "Live market" : item.source === "nse" ? "NSE corporate filing" : item.source || "Exchange";

  return (
    <main className="screen" style={{ paddingBottom: 40 }}>
      <div className={styles.top}>
        <Link href="/home" className={`${styles.back} tap`}>
          <IconBack /> Back
        </Link>
        <span className="eyebrow">{item.time}</span>
      </div>

      <div className={styles.body}>
        <div className={styles.kicker}>
          <span className="chip hot">
            {item.priority === "critical" || item.priority === "high" ? "Important" : "FYI"}
          </span>
          <span className="chip">{item.company}</span>
          <span className="chip">{item.badge || item.category}</span>
          <span className="chip">{sourceLabel}</span>
        </div>

        <h1 className={styles.headline}>{item.title}</h1>
        <p className={styles.lede}>{item.summary}</p>

        <section className={`${styles.panel} ${styles.panelHot}`}>
          <h2 className={styles.panelTitle}>Why it matters</h2>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.45 }}>
            {item.whyItMatters}
          </p>
          <p className="faint" style={{ marginTop: 10, fontSize: 12, fontWeight: 700 }}>
            Next: Protect size if the move is sharp · Pull research for numbers vs story
          </p>
        </section>

        {showResults && (
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Key numbers (primary)</h2>
            <p className="faint" style={{ marginBottom: 10, fontSize: 12, fontWeight: 600 }}>
              From company quarterly tables · QoQ / YoY
            </p>
            <div className={styles.table}>
              {primary!.results!.map((row) => (
                <div key={row.label} className={styles.row}>
                  <span className={styles.label}>{row.label.split("/")[0].trim()}</span>
                  <span className={`num ${styles.value}`}>{row.value ?? "—"}</span>
                  <Delta value={row.yoy} />
                  <span className="faint" style={{ fontSize: 11 }}>
                    YoY
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Primary links</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {item.attachment ? (
              <a href={item.attachment} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                Open NSE filing PDF ↗
              </a>
            ) : (
              <a href={nseQuoteUrl} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                NSE quote & filings page ↗
              </a>
            )}
            {primary?.sources?.annual_report?.url && (
              <a
                href={primary.sources.annual_report.url}
                target="_blank"
                rel="noreferrer"
                className={styles.sourceLink}
              >
                Annual report ↗
              </a>
            )}
            {primary?.sources?.transcript?.url && (
              <a
                href={primary.sources.transcript.url}
                target="_blank"
                rel="noreferrer"
                className={styles.sourceLink}
              >
                Concall transcript ↗
              </a>
            )}
            {primary?.page && (
              <a href={primary.page} target="_blank" rel="noreferrer" className={styles.sourceLink}>
                Screener filings page ↗
              </a>
            )}
          </div>
        </section>

        <div className={styles.actions}>
          <Link href={`/research/${item.ticker}`} className={`btn btn-primary ${styles.primary}`}>
            Pull research
          </Link>
          <Link href="/guardian" className={`btn btn-soft ${styles.secondary}`}>
            Protect
          </Link>
          <button
            type="button"
            className={`btn btn-soft ${styles.secondary}`}
            onClick={() =>
              openAsk(`Why does this ${item.category} filing for ${item.ticker} matter? Use filings only.`)
            }
          >
            Ask FINN
          </button>
        </div>
      </div>
    </main>
  );
}
