import { portfolio } from "@/data/portfolio";
import type { FinancialProfile } from "@/data/profile";

export type Insight = {
  id: string;
  severity: "info" | "watch" | "critical";
  title: string;
  reason: string;
  action?: string;
};

export type DecisionAction = "BUY" | "HOLD" | "REDUCE" | "SELL" | "AVOID" | "WAIT";

export type DecisionCard = {
  ticker: string;
  action: DecisionAction;
  risk: "Low" | "Medium" | "High";
  horizon: string;
  reasoning: string;
  evidence: string[];
  upside: string;
  downside: string;
  invalidates: string;
  alternatives: string;
  portfolioFit: string;
};

function sectorWeights() {
  const total = portfolio.reduce((s, h) => s + h.weight, 0);
  const map = new Map<string, number>();
  for (const h of portfolio) {
    map.set(h.sector, (map.get(h.sector) ?? 0) + h.weight);
  }
  return [...map.entries()]
    .map(([sector, w]) => ({ sector, pct: (w / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}

export function buildInsights(profile: FinancialProfile): Insight[] {
  const sectors = sectorWeights();
  const top = sectors[0];
  const largest = [...portfolio].sort((a, b) => b.weight - a.weight)[0];
  const losers = portfolio.filter((h) => h.changePct <= -2);
  const hotVol = portfolio.filter((h) => h.volumeRatio >= 2);
  const insights: Insight[] = [];

  if (top && top.pct >= 28) {
    insights.push({
      id: "conc-sector",
      severity: top.pct >= 35 ? "critical" : "watch",
      title: `Heavy concentration in ${top.sector}`,
      reason: `${top.sector} is ~${top.pct.toFixed(0)}% of the book. A sector shock hits a large slice of capital at once.`,
      action: "Cap any single sector near 25% unless conviction is explicit.",
    });
  }

  if (largest && largest.weight >= 8) {
    insights.push({
      id: "conc-name",
      severity: "watch",
      title: `${largest.ticker} dominates name risk`,
      reason: `${largest.name} is ${largest.weight.toFixed(1)}% of the book — your largest single-name exposure.`,
      action: "Size new adds elsewhere until this weight cools.",
    });
  }

  const riskMismatch =
    (profile.risk === "conservative" && top && top.pct > 30) ||
    (profile.risk === "conservative" && profile.maxDrawdownPct < 12);

  if (riskMismatch) {
    insights.push({
      id: "risk-mismatch",
      severity: "critical",
      title: "Allocation may not match your risk profile",
      reason: `You set risk to ${profile.risk} with max drawdown ${profile.maxDrawdownPct}%, but sector/name concentration still looks aggressive for that posture.`,
      action: "Revisit stops and sector caps on the Risk desk.",
    });
  }

  if (losers.length) {
    insights.push({
      id: "day-losers",
      severity: "watch",
      title: `${losers.length} name${losers.length > 1 ? "s" : ""} moved hard today`,
      reason: losers.map((h) => `${h.ticker} ${h.changePct.toFixed(1)}%`).join(" · "),
      action: "Check whether the move invalidates thesis or is noise.",
    });
  }

  if (hotVol.length) {
    insights.push({
      id: "vol-spike",
      severity: "critical",
      title: "Unusual volume on holdings",
      reason: hotVol.map((h) => `${h.ticker} ${h.volumeRatio.toFixed(1)}× avg`).join(" · "),
      action: "Open Guardian — volume + price pairing often precedes thesis changes.",
    });
  }

  const preferredHit = profile.preferredSectors.filter((s) =>
    sectors.some((x) => x.sector === s && x.pct >= 5),
  );
  if (preferredHit.length < Math.min(2, profile.preferredSectors.length)) {
    insights.push({
      id: "style-drift",
      severity: "info",
      title: "Book drifts from preferred sectors",
      reason: `You prefer ${profile.preferredSectors.join(", ")}, but coverage of those sleeves is thin relative to the rest of the book.`,
      action: "Use Research + Decision cards before filling gaps.",
    });
  }

  return insights;
}

export function decisionFor(ticker: string, profile: FinancialProfile): DecisionCard {
  const h = portfolio.find((p) => p.ticker === ticker) ?? portfolio[0];
  const overweight = h.weight >= 7;
  const weakDay = h.changePct <= -2;
  const hot = h.volumeRatio >= 2;

  let action: DecisionAction = "HOLD";
  if (hot && weakDay && overweight) action = "REDUCE";
  else if (hot && weakDay) action = "WAIT";
  else if (profile.style === "growth" && h.changePct > 0 && !overweight) action = "BUY";
  else if (profile.risk === "conservative" && overweight) action = "REDUCE";

  return {
    ticker: h.ticker,
    action,
    risk: profile.risk === "aggressive" ? "Medium" : overweight ? "High" : "Medium",
    horizon: profile.style === "intraday" ? "Session" : profile.style === "swing" ? "2–8 weeks" : `${profile.horizonYears}y frame`,
    reasoning: `Decision blends ${h.name}'s day tape (${h.changePct.toFixed(1)}%, vol ${h.volumeRatio.toFixed(1)}×), your ${h.weight.toFixed(1)}% book weight, and a ${profile.risk} / ${profile.style.replace("_", " ")} profile.`,
    evidence: [
      `Weight in book: ${h.weight.toFixed(1)}%`,
      `Day move: ${h.changePct >= 0 ? "+" : ""}${h.changePct.toFixed(1)}%`,
      `Volume vs 20d: ${h.volumeRatio.toFixed(1)}×`,
      `Max drawdown you accept: ${profile.maxDrawdownPct}%`,
    ],
    upside: "If thesis holds, compounding inside your horizon band without forcing a chase.",
    downside: "Further concentration or a thesis break can overrun your stated drawdown comfort.",
    invalidates: "Guidance miss, structural margin break, or sector shock that changes cash-flow quality.",
    alternatives: "Trim into strength, hedge via broader index sleeve, or wait for a cleaner primary-source print.",
    portfolioFit:
      overweight
        ? "Looks less suitable as an add — already a large sleeve of your book."
        : "Isolated attractiveness is not enough; size only if it still respects sector caps and risk budget.",
  };
}

export type GuardianItem = {
  id: string;
  kind: "risk" | "opportunity" | "thesis" | "alert";
  title: string;
  body: string;
  when: string;
  ticker?: string;
};

export function buildGuardianFeed(profile: FinancialProfile): GuardianItem[] {
  const insights = buildInsights(profile);
  const items: GuardianItem[] = insights.map((i) => ({
    id: i.id,
    kind: i.severity === "critical" ? "risk" : i.severity === "watch" ? "alert" : "opportunity",
    title: i.title,
    body: `${i.reason}${i.action ? ` → ${i.action}` : ""}`,
    when: "Today",
  }));

  items.push({
    id: "opp-quality",
    kind: "opportunity",
    title: "Quality add window",
    body: "Within your preferred sectors, look for names where portfolio weight is still light and primary-source guidance is intact — not momentum chases.",
    when: "This week",
  });

  items.push({
    id: "thesis-infy",
    kind: "thesis",
    title: "INFY CFO succession — thesis check",
    body: "Original IT compounding thesis still valid if margin band holds. Invalidation: growth exits guided band for two prints.",
    when: "14:48 IST",
    ticker: "INFY",
  });

  return items;
}
