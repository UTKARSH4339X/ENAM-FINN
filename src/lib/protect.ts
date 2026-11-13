import { portfolio as seedPortfolio, type Holding } from "@/data/portfolio";
import type { FinancialProfile } from "@/data/profile";
import { defaultRules, calcPlan, type RiskRule } from "@/data/risk";
import { buildGuardianFeed, type GuardianItem } from "@/data/intelligence";

export type LiveQuote = { price: number; change_pct: number };

export type ProtectPulse = {
  todayPct: number;
  maxName: { ticker: string; weight: number; changePct: number } | null;
  maxSector: { sector: string; pct: number } | null;
  losers: Array<{ ticker: string; changePct: number }>;
  drawdownLimit: number;
  riskLabel: string;
  stopsArmed: number;
  stopsBreached: number;
  emergencyMonths: number;
  status: "ok" | "watch" | "critical";
  statusLine: string;
};

export function mergeLiveHoldings(
  quotes: Record<string, LiveQuote>,
  holdings: Holding[] = seedPortfolio,
) {
  return holdings.map((h) => {
    const q = quotes[h.ticker];
    return {
      ...h,
      price: q?.price ?? h.price,
      changePct: q?.change_pct ?? h.changePct,
    };
  });
}

export function computeProtectPulse(
  profile: FinancialProfile,
  quotes: Record<string, LiveQuote>,
  rules: RiskRule[] = defaultRules,
  holdings: Holding[] = seedPortfolio,
): ProtectPulse {
  const live = mergeLiveHoldings(quotes, holdings);
  const wsum = live.reduce((s, h) => s + h.weight, 0) || 1;
  const todayPct = live.reduce((s, h) => s + h.changePct * h.weight, 0) / wsum;

  const maxNameRow = [...live].sort((a, b) => b.weight - a.weight)[0] ?? null;
  const sectorMap = new Map<string, number>();
  for (const h of live) {
    sectorMap.set(h.sector, (sectorMap.get(h.sector) ?? 0) + h.weight);
  }
  const maxSectorEntry = [...sectorMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const losers = live
    .filter((h) => h.changePct <= -1.5)
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, 4)
    .map((h) => ({ ticker: h.ticker, changePct: h.changePct }));

  let stopsBreached = 0;
  let stopsArmed = 0;
  for (const rule of rules) {
    if (!rule.autoExit) continue;
    stopsArmed += 1;
    const px = quotes[rule.ticker]?.price ?? rule.entry;
    if (calcPlan(rule, px).breached) stopsBreached += 1;
  }

  const heavyName = (maxNameRow?.weight ?? 0) >= 8;
  const heavySector = maxSectorEntry ? (maxSectorEntry[1] / wsum) * 100 >= 30 : false;
  const hardDay = todayPct <= -1.2 || losers.length >= 2;

  let status: ProtectPulse["status"] = "ok";
  if (stopsBreached > 0 || (profile.risk === "conservative" && (heavySector || hardDay))) {
    status = "critical";
  } else if (heavyName || heavySector || hardDay || losers.length) {
    status = "watch";
  }

  let statusLine = "Book looks orderly vs your limits.";
  if (stopsBreached > 0) statusLine = `${stopsBreached} stop${stopsBreached > 1 ? "s" : ""} hit — review exits.`;
  else if (hardDay) statusLine = "Tape is soft — check losers before adding risk.";
  else if (heavySector) statusLine = `${maxSectorEntry?.[0]} sleeve is heavy — respect sector caps.`;
  else if (heavyName && maxNameRow) statusLine = `${maxNameRow.ticker} is your largest name risk.`;

  return {
    todayPct,
    maxName: maxNameRow
      ? { ticker: maxNameRow.ticker, weight: maxNameRow.weight, changePct: maxNameRow.changePct }
      : null,
    maxSector: maxSectorEntry
      ? { sector: maxSectorEntry[0], pct: (maxSectorEntry[1] / wsum) * 100 }
      : null,
    losers,
    drawdownLimit: profile.maxDrawdownPct,
    riskLabel: profile.risk,
    stopsArmed,
    stopsBreached,
    emergencyMonths: profile.emergencyFundMonths,
    status,
    statusLine,
  };
}

export function liveGuardianFeed(
  profile: FinancialProfile,
  quotes: Record<string, LiveQuote>,
  holdings: Holding[] = seedPortfolio,
): GuardianItem[] {
  const base = buildGuardianFeed(profile);
  const live = mergeLiveHoldings(quotes, holdings);
  const extras: GuardianItem[] = [];

  for (const h of live.filter((x) => x.changePct <= -2).slice(0, 3)) {
    extras.push({
      id: `live-drop-${h.ticker}`,
      kind: "alert",
      title: `${h.ticker} down ${h.changePct.toFixed(1)}% live`,
      body: `Live print ₹${h.price.toLocaleString("en-IN", { maximumFractionDigits: 1 })}. Check if this breaks your thesis or just day noise → set / review stop.`,
      when: "Live",
      ticker: h.ticker,
    });
  }

  for (const h of live.filter((x) => x.volumeRatio >= 2 && x.changePct < 0).slice(0, 2)) {
    extras.push({
      id: `live-vol-${h.ticker}`,
      kind: "risk",
      title: `${h.ticker} volume stress`,
      body: `${h.volumeRatio.toFixed(1)}× usual volume with a down day — protect size before you average down.`,
      when: "Live",
      ticker: h.ticker,
    });
  }

  if (profile.emergencyFundMonths < 3) {
    extras.unshift({
      id: "cash-buffer",
      kind: "risk",
      title: "Cash buffer looks thin",
      body: `Emergency fund set to ${profile.emergencyFundMonths} months. Raise buffer before sizing aggressive equity risk.`,
      when: "Profile",
    });
  }

  // Live items first, then static guardian insights
  const seen = new Set<string>();
  const out: GuardianItem[] = [];
  for (const item of [...extras, ...base]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export const RISK_RULES_KEY = "finn.risk.rules.v1";

export function loadRiskRules(): RiskRule[] {
  if (typeof window === "undefined") return defaultRules;
  try {
    const raw = localStorage.getItem(RISK_RULES_KEY);
    if (!raw) return defaultRules;
    const parsed = JSON.parse(raw) as RiskRule[];
    if (!Array.isArray(parsed) || !parsed.length) return defaultRules;
    return parsed;
  } catch {
    return defaultRules;
  }
}

export function saveRiskRules(rules: RiskRule[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(RISK_RULES_KEY, JSON.stringify(rules));
}
