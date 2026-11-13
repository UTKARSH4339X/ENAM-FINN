"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./landing.module.css";
import { useAuth } from "@/components/AuthProvider";
import { useProfile } from "@/components/ProfileProvider";

export default function LandingPage() {
  const router = useRouter();
  const { account, ready: authReady } = useAuth();
  const { profile, ready: profileReady } = useProfile();

  useEffect(() => {
    if (!authReady || !profileReady) return;
    if (account && profile.completedOnboarding) {
      router.replace("/home");
    }
  }, [authReady, profileReady, account, profile.completedOnboarding, router]);

  return (
    <main className={`screen ${styles.wrap}`}>
      <p className={styles.kicker}>Your money helper</p>
      <h1 className={styles.brand}>FINN</h1>
      <p className={styles.lead}>
        See what matters in your stocks. Get clear research. Protect your book with stops and size
        limits.
      </p>

      <div className={styles.cards}>
        <div className={styles.card}>
          <strong>Updates</strong>
          <span>Only important news about your stocks</span>
        </div>
        <div className={styles.card}>
          <strong>Ask FINN</strong>
          <span>Ask questions in plain English</span>
        </div>
        <div className={styles.card}>
          <strong>Protect</strong>
          <span>Live risk pulse, stops, and size limits</span>
        </div>
        <div className={styles.card}>
          <strong>Markets</strong>
          <span>Search the full NSE equity list</span>
        </div>
      </div>

      <div className={styles.actions}>
        {account && !profile.completedOnboarding ? (
          <Link href="/onboarding" className="btn btn-primary">
            Continue setup
          </Link>
        ) : account ? (
          <Link href="/home" className="btn btn-primary">
            Open my portfolio
          </Link>
        ) : (
          <Link href="/demo" className="btn btn-primary">
            Start demo path
          </Link>
        )}
        <Link href="/home" className="btn btn-soft">
          Open FINN
        </Link>
        <Link href="/signup" className="btn btn-soft">
          {account ? "Use another account" : "Create account"}
        </Link>
      </div>

      <p className={styles.note}>NSE filings · live quotes · primary research</p>
    </main>
  );
}
