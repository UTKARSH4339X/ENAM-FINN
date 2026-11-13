"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { AskSheet } from "@/components/AskSheet";
import { StatusBar } from "@/components/StatusBar";
import { useAuth } from "@/components/AuthProvider";
import { useProfile } from "@/components/ProfileProvider";

type AskContextValue = {
  openAsk: (seed?: string) => void;
  closeAsk: () => void;
};

const AskContext = createContext<AskContextValue | null>(null);

export function useAsk() {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error("useAsk must be used within AppFrame");
  return ctx;
}

/** Core product routes work without forcing signup first. */
function isAppOpen(pathname: string) {
  return (
    pathname.startsWith("/home") ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/research") ||
    pathname.startsWith("/filing") ||
    pathname.startsWith("/portfolio") ||
    pathname.startsWith("/performance") ||
    pathname.startsWith("/risk") ||
    pathname.startsWith("/guardian") ||
    pathname.startsWith("/demo") ||
    pathname.startsWith("/offline")
  );
}

const PUBLIC = new Set(["/", "/signup", "/offline"]);

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { account, ready: authReady } = useAuth();
  const { profile, ready: profileReady } = useProfile();
  const [askOpen, setAskOpen] = useState(false);
  const [seed, setSeed] = useState("");

  const hideNav =
    pathname === "/" ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/filing/") ||
    pathname.startsWith("/offline");

  useEffect(() => {
    if (!authReady || !profileReady) return;

    const isPublic = PUBLIC.has(pathname) || isAppOpen(pathname);
    const onOnboarding = pathname.startsWith("/onboarding");

    if (!account && !isPublic) {
      router.replace("/");
      return;
    }

    // Skip forced onboarding for core app routes so /research etc. always load.
    if (
      account &&
      !profile.completedOnboarding &&
      !onOnboarding &&
      !isPublic &&
      !isAppOpen(pathname)
    ) {
      router.replace("/onboarding");
      return;
    }

    if (account && profile.completedOnboarding && onOnboarding) {
      router.replace("/home");
    }
  }, [
    authReady,
    profileReady,
    account,
    profile.completedOnboarding,
    pathname,
    router,
  ]);

  const value = useMemo(
    () => ({
      openAsk: (next?: string) => {
        setSeed(next ?? "");
        setAskOpen(true);
      },
      closeAsk: () => setAskOpen(false),
    }),
    [],
  );

  return (
    <AskContext.Provider value={value}>
      <div className="app-shell">
        <p className="desktop-hint">Mobile layout · open on your phone for the best feel</p>

        <div className="device">
          <div className="device-bezel" aria-hidden />
          <div className="phone">
            <div className="mesh" aria-hidden />
            <StatusBar />
            <div className="phone-scroll">
              {children}
              {!hideNav && <BottomNav onAsk={() => value.openAsk()} />}
            </div>
            <div className="home-indicator" aria-hidden />
            <AskSheet open={askOpen} seed={seed} onClose={value.closeAsk} />
          </div>
        </div>
      </div>
    </AskContext.Provider>
  );
}
