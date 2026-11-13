import Link from "next/link";

export const metadata = {
  title: "Offline — FINN",
  description: "FINN is offline. Reconnect for live markets.",
};

export default function OfflinePage() {
  return (
    <main
      className="screen"
      style={{
        padding: "48px 22px 120px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        justifyContent: "center",
        minHeight: "100%",
      }}
    >
      <div className="brand-mark" style={{ fontSize: 42 }}>
        FINN
      </div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: "-0.04em" }}>
        You’re offline
      </h1>
      <p className="muted" style={{ fontSize: 15, lineHeight: 1.45, maxWidth: 320 }}>
        Live quotes, filings, and research need a connection. Cached screens may still open.
        Market data is never stored offline for privacy and freshness.
      </p>
      <Link href="/home" className="btn btn-primary" style={{ marginTop: 8 }}>
        Try Home again
      </Link>
      <Link href="/search" className="btn btn-soft">
        Open Markets
      </Link>
    </main>
  );
}
