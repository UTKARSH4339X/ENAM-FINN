"use client";

import { useEffect } from "react";

/** Registers the FINN service worker (production / HTTPS only). */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const isLocal =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    // Allow local testing; always register on HTTPS hosts (Vercel).
    if (!window.isSecureContext && !isLocal) return;

    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        reg.update().catch(() => {});
      })
      .catch(() => {
        /* SW optional — app still works */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
