"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { askFinn, type AskSource } from "@/lib/api";
import { useBook } from "@/lib/book";

const PROMPTS = [
  "What matters today?",
  "INFY results?",
  "Why did Asian Paints move?",
  "HDFC Bank filings?",
];

export function AskSheet({
  open,
  seed,
  onClose,
}: {
  open: boolean;
  seed: string;
  onClose: () => void;
}) {
  const book = useBook();
  const [query, setQuery] = useState(seed);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<AskSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runAsk(q: string) {
    const question = q.trim();
    if (!question) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await askFinn(question, book.tickers);
      setAnswer(res.answer);
      setSources(res.sources || []);
    } catch {
      setErr("Could not reach FINN. Is the API running?");
      setAnswer(null);
      setSources([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setQuery(seed);
    setAnswer(null);
    setSources([]);
    setErr(null);
    if (seed.trim()) void runAsk(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close ask"
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Ask FINN"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "110%" }}
            transition={{ type: "spring", stiffness: 340, damping: 36 }}
            style={{ x: 0 }}
          >
            <div className="sheet-handle" />
            <h2
              className="brand-mark"
              style={{ fontSize: 28, marginBottom: 6, letterSpacing: "-0.03em" }}
            >
              Ask FINN
            </h2>
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.4 }}>
              Answers from NSE filings and company disclosures — not broker notes.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
              {PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="chip"
                  disabled={loading}
                  onClick={() => {
                    setQuery(q);
                    void runAsk(q);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>

            <form
              style={{ marginTop: 16 }}
              onSubmit={(e) => {
                e.preventDefault();
                void runAsk(query);
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 8,
                  padding: 6,
                  borderRadius: 16,
                  background: "#fff",
                  border: "1.5px solid var(--line-strong)",
                }}
              >
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask about a filing or ticker…"
                  style={{
                    border: 0,
                    outline: "none",
                    background: "transparent",
                    padding: "12px",
                    fontSize: 16,
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-accent"
                  style={{ minHeight: 44, borderRadius: 12 }}
                  disabled={loading}
                >
                  {loading ? "…" : "Ask"}
                </button>
              </div>
            </form>

            {loading && (
              <p className="faint" style={{ marginTop: 14, fontWeight: 600 }}>
                Checking filings and primary sources…
              </p>
            )}
            {err && (
              <p style={{ marginTop: 14, color: "#c0392b", fontWeight: 700 }}>{err}</p>
            )}

            {answer && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  marginTop: 16,
                  padding: 16,
                  borderRadius: 16,
                  background: "#fff",
                  border: "1px solid var(--line)",
                }}
              >
                <p style={{ fontSize: 15, lineHeight: 1.5 }}>{answer}</p>
                {sources.length > 0 && (
                  <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                    <span className="faint" style={{ fontSize: 12, fontWeight: 700 }}>
                      Sources
                    </span>
                    {sources.map((s, i) => {
                      const label = `${s.ticker ? `${s.ticker} · ` : ""}${s.title || s.kind}`;
                      if (s.id) {
                        return (
                          <Link
                            key={`${s.id}-${i}`}
                            href={`/filing/${s.id}`}
                            style={{ fontSize: 13, fontWeight: 700, color: "var(--cobalt)" }}
                            onClick={onClose}
                          >
                            {label} →
                          </Link>
                        );
                      }
                      if (s.url) {
                        return (
                          <a
                            key={`${s.url}-${i}`}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 13, fontWeight: 700, color: "var(--cobalt)" }}
                          >
                            {label} ↗
                          </a>
                        );
                      }
                      return (
                        <span key={`${label}-${i}`} style={{ fontSize: 13, fontWeight: 600 }}>
                          {label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
