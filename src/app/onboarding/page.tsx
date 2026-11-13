"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./onboarding.module.css";
import { useAuth } from "@/components/AuthProvider";
import { useProfile } from "@/components/ProfileProvider";
import {
  RISK_LABELS,
  SECTOR_OPTIONS,
  STYLE_LABELS,
  type FinancialProfile,
  type InvestmentStyle,
  type RiskTolerance,
} from "@/data/profile";

const STEP_TITLES = ["Your money", "Your goals", "Your risk", "Sectors you like"];

export default function OnboardingPage() {
  const { account, ready: authReady } = useAuth();
  const { profile, saveProfile } = useProfile();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<FinancialProfile>(profile);

  useEffect(() => {
    if (authReady && !account) router.replace("/signup");
  }, [authReady, account, router]);

  function toggleSector(sector: string) {
    setDraft((d) => {
      const has = d.preferredSectors.includes(sector);
      return {
        ...d,
        preferredSectors: has
          ? d.preferredSectors.filter((s) => s !== sector)
          : [...d.preferredSectors, sector],
      };
    });
  }

  function finish() {
    saveProfile(draft);
    router.replace("/home");
  }

  return (
    <main className={`screen ${styles.wrap}`}>
      <div className={styles.sim}>Answers stay on this phone</div>
      <div className={styles.brand}>FINN</div>
      <h1 className={styles.title}>Tell us about you</h1>
      <p className={styles.sub}>A few simple questions so tips fit you better.</p>

      <div className={styles.progress} aria-hidden>
        <div className={styles.progressFill} style={{ width: `${((step + 1) / 4) * 100}%` }} />
      </div>
      <p className={styles.stepLabel}>
        Step {step + 1} of 4 · {STEP_TITLES[step]}
      </p>

      {step === 0 && (
        <section className={styles.panel}>
          <label className={styles.field}>
            <span>Monthly income (₹)</span>
            <input
              type="number"
              value={draft.monthlyIncome}
              onChange={(e) => setDraft({ ...draft, monthlyIncome: Number(e.target.value) })}
            />
          </label>
          <label className={styles.field}>
            <span>Monthly expenses (₹)</span>
            <input
              type="number"
              value={draft.monthlyExpenses}
              onChange={(e) => setDraft({ ...draft, monthlyExpenses: Number(e.target.value) })}
            />
          </label>
          <label className={styles.field}>
            <span>Money you can invest (₹)</span>
            <input
              type="number"
              value={draft.investableCapital}
              onChange={(e) => setDraft({ ...draft, investableCapital: Number(e.target.value) })}
            />
          </label>
          <label className={styles.field}>
            <span>Emergency fund (months)</span>
            <input
              type="number"
              value={draft.emergencyFundMonths}
              onChange={(e) =>
                setDraft({ ...draft, emergencyFundMonths: Number(e.target.value) })
              }
            />
          </label>
        </section>
      )}

      {step === 1 && (
        <section className={styles.panel}>
          <label className={styles.field}>
            <span>How many years will you invest?</span>
            <input
              type="number"
              value={draft.horizonYears}
              onChange={(e) => setDraft({ ...draft, horizonYears: Number(e.target.value) })}
            />
          </label>
          <label className={styles.field}>
            <span>Main money goal</span>
            <textarea
              rows={3}
              value={draft.goal}
              onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
            />
          </label>
          <div className={styles.choiceGrid}>
            <span className={styles.choiceLabel}>Style</span>
            {(Object.keys(STYLE_LABELS) as InvestmentStyle[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`${styles.choice}${draft.style === key ? ` ${styles.choiceOn}` : ""}`}
                onClick={() => setDraft({ ...draft, style: key })}
              >
                {STYLE_LABELS[key]}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className={styles.panel}>
          <div className={styles.choiceGrid}>
            <span className={styles.choiceLabel}>How much risk is okay?</span>
            {(Object.keys(RISK_LABELS) as RiskTolerance[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`${styles.choice}${draft.risk === key ? ` ${styles.choiceOn}` : ""}`}
                onClick={() => setDraft({ ...draft, risk: key })}
              >
                {RISK_LABELS[key]}
              </button>
            ))}
          </div>
          <label className={styles.field}>
            <span>
              Biggest drop you can handle
              <b>{draft.maxDrawdownPct}%</b>
            </span>
            <input
              type="range"
              min={5}
              max={40}
              value={draft.maxDrawdownPct}
              onChange={(e) => setDraft({ ...draft, maxDrawdownPct: Number(e.target.value) })}
            />
          </label>
        </section>
      )}

      {step === 3 && (
        <section className={styles.panel}>
          <span className={styles.choiceLabel}>Sectors you care about</span>
          <div className={styles.choiceGrid}>
            {SECTOR_OPTIONS.map((sector) => (
              <button
                key={sector}
                type="button"
                className={`${styles.choice}${
                  draft.preferredSectors.includes(sector) ? ` ${styles.choiceOn}` : ""
                }`}
                onClick={() => toggleSector(sector)}
              >
                {sector}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className={styles.actions}>
        {step < 3 ? (
          <button type="button" className={styles.primary} onClick={() => setStep((s) => s + 1)}>
            Continue
          </button>
        ) : (
          <button type="button" className={styles.primary} onClick={finish}>
            Start
          </button>
        )}
        {step > 0 && (
          <button type="button" className={styles.secondary} onClick={() => setStep((s) => s - 1)}>
            Back
          </button>
        )}
      </div>
    </main>
  );
}
