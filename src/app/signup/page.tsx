"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import styles from "./signup.module.css";
import { useAuth } from "@/components/AuthProvider";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 4) {
      setError("Enter your name, email, and a password (4+ letters).");
      return;
    }
    signup(name, email, password);
    router.push("/onboarding");
  }

  return (
    <main className={`screen ${styles.wrap}`}>
      <Link href="/" className={styles.back}>
        ← Back
      </Link>
      <h1 className={styles.title}>Create account</h1>
      <p className={styles.sub}>Takes less than a minute. Stays on your phone.</p>

      <form className={styles.form} onSubmit={onSubmit}>
        <label>
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Utkarsh" />
        </label>
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password"
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className="btn btn-primary">
          Create account
        </button>
      </form>
    </main>
  );
}
