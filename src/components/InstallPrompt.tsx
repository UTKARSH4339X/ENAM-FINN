"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "finn-install-dismissed";

/** Soft Android/Chrome install banner. iOS uses Share → Add to Home Screen. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    if (isIos && isSafari) {
      const t = window.setTimeout(() => setIosHint(true), 1800);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBip);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
    setIosHint(false);
    setDeferred(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!visible && !iosHint) return null;

  return (
    <div
      role="dialog"
      aria-label="Install FINN"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "calc(78px + env(safe-area-inset-bottom, 0px))",
        zIndex: 60,
        background: "#101820",
        color: "#fff",
        borderRadius: 16,
        padding: "14px 16px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 420,
        margin: "0 auto",
      }}
    >
      <strong style={{ fontFamily: "var(--font-display)", fontSize: 17, letterSpacing: "-0.03em" }}>
        Install FINN
      </strong>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, opacity: 0.85 }}>
        {iosHint
          ? "On iPhone: tap Share, then Add to Home Screen for the full-screen app."
          : "Add FINN to your home screen for a faster, app-like experience."}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        {visible && deferred ? (
          <button
            type="button"
            onClick={() => void install()}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 12,
              background: "#e8321a",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Install
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 12,
            background: "rgba(255,255,255,0.12)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
