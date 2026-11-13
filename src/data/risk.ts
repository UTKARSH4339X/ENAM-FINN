import { portfolio, type Holding } from "@/data/portfolio";

/** Book value in ₹ — used for risk sizing */
export const BOOK_VALUE = 1_00_00_000; // ₹1 Cr

export type RiskRule = {
  ticker: string;
  entry: number;
  stopPct: number;
  targetPct: number;
  riskBudgetPct: number; // max loss as % of book
  autoExit: boolean;
};

export const defaultRules: RiskRule[] = [
  { ticker: "ASIANPAINT", entry: 2558, stopPct: 3.5, targetPct: 6, riskBudgetPct: 0.4, autoExit: true },
  { ticker: "INFY", entry: 1802, stopPct: 4, targetPct: 8, riskBudgetPct: 0.35, autoExit: true },
  { ticker: "HDFCBANK", entry: 1678, stopPct: 2.5, targetPct: 5, riskBudgetPct: 0.5, autoExit: false },
  { ticker: "RELIANCE", entry: 1269, stopPct: 3, targetPct: 7, riskBudgetPct: 0.45, autoExit: true },
];

export function holdingFor(ticker: string): Holding | undefined {
  return portfolio.find((h) => h.ticker === ticker);
}

export function calcPlan(rule: RiskRule, lastPrice?: number) {
  const price = lastPrice ?? rule.entry;
  const stopPrice = rule.entry * (1 - rule.stopPct / 100);
  const targetPrice = rule.entry * (1 + rule.targetPct / 100);
  const riskPerShare = rule.entry - stopPrice;
  const maxLossRs = (BOOK_VALUE * rule.riskBudgetPct) / 100;
  const shares = riskPerShare > 0 ? Math.floor(maxLossRs / riskPerShare) : 0;
  const positionValue = shares * rule.entry;
  const rewardPerShare = targetPrice - rule.entry;
  const expectedProfit = shares * rewardPerShare;
  const rr = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;
  const distToStop = ((price - stopPrice) / price) * 100;
  const breached = price <= stopPrice;

  return {
    stopPrice,
    targetPrice,
    riskPerShare,
    maxLossRs,
    shares,
    positionValue,
    expectedProfit,
    rr,
    distToStop,
    breached,
    price,
  };
}

export function formatInr(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
