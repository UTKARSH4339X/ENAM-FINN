"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ACCOUNT_KEY, type Account } from "@/data/auth";

type AuthContextValue = {
  account: Account | null;
  ready: boolean;
  signup: (name: string, email: string, _password: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACCOUNT_KEY);
      if (raw) setAccount(JSON.parse(raw) as Account);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const signup = useCallback((name: string, email: string, _password: string) => {
    const next: Account = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
    setAccount(next);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(ACCOUNT_KEY);
    setAccount(null);
  }, []);

  const value = useMemo(
    () => ({ account, ready, signup, logout }),
    [account, ready, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
