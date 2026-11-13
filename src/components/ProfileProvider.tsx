"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  PROFILE_KEY,
  defaultProfile,
  type FinancialProfile,
} from "@/data/profile";

type ProfileContextValue = {
  profile: FinancialProfile;
  ready: boolean;
  saveProfile: (next: FinancialProfile) => void;
  resetProfile: () => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<FinancialProfile>(defaultProfile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) setProfile({ ...defaultProfile, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const saveProfile = useCallback((next: FinancialProfile) => {
    const payload = { ...next, completedOnboarding: true };
    setProfile(payload);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(payload));
  }, []);

  const resetProfile = useCallback(() => {
    setProfile(defaultProfile);
    localStorage.removeItem(PROFILE_KEY);
  }, []);

  const value = useMemo(
    () => ({ profile, ready, saveProfile, resetProfile }),
    [profile, ready, saveProfile, resetProfile],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
