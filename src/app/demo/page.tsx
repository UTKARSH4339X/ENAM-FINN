"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./demo.module.css";
import { pingApi } from "@/lib/api";

const STEPS = [
  {
    n: 1,
    title: "Filings (Push)",
    body: "Home shows only Important NSE filings for the book. Routine noise stays buried.",
    href: "/home",
    cta: "Open Home",
  },
  {
    n: 2,
    title: "Protect",
    body: "Live risk pulse, concentration, and stop-loss sizing before you add pain.",
    href: "/guardian",
    cta: "Open Protect",
  },
  {
    n: 3,
    title: "Research (Pull)",
    body: "INFY primary sources — quarter numbers, bull/bear, and what invalidates the thesis.",
    href: "/research/INFY",
    cta: "Open INFY research",
  },
  {
    n: 4,
    title: "Ask FINN",
    body: "Ask “What matters today?” — answers cite filings and company tables.",
    href: "/home",
    cta: "Back to Home · tap Ask",
  },
];

export default function DemoPage() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    pingApi().then((ok) => {
      if (!cancelled) setApiOk(ok);
    });
    const id = window.setInterval(() => {
      void pingApi().then((ok) => {
        if (!cancelled) setApiOk(ok);
      });
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <main className={`screen ${styles.wrap}`}>
      <div className={styles.brand}>FINN</div>
      <h1 className={styles.title}>Demo path</h1>
      <p className={styles.sub}>
        Locked 2-minute walkthrough for judges — same order every time.
      </p>

      <div className={`${styles.health} ${apiOk ? styles.healthOk : apiOk === false ? styles.healthBad : ""}`}>
        {apiOk == null && "Checking API…"}
        {apiOk === true && "API online · live quotes path ready"}
        {apiOk === false && "API offline — run npm run finn in a terminal"}
      </div>

      <ol className={styles.steps}>
        {STEPS.map((s) => (
          <li key={s.n} className={styles.card}>
            <div className={styles.num}>{s.n}</div>
            <div>
              <h2>{s.title}</h2>
              <p>{s.body}</p>
              <Link href={s.href} className={styles.link}>
                {s.cta} →
              </Link>
            </div>
          </li>
        ))}
      </ol>

      <Link href="/home" className="btn btn-primary" style={{ marginTop: 16, width: "100%" }}>
        Start at step 1 · Home
      </Link>
    </main>
  );
}
