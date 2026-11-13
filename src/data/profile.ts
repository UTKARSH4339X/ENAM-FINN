export type InvestmentStyle =
  | "long_term"
  | "swing"
  | "intraday"
  | "value"
  | "growth"
  | "index";

export type RiskTolerance = "conservative" | "moderate" | "aggressive";

export type FinancialProfile = {
  monthlyIncome: number;
  monthlyExpenses: number;
  investableCapital: number;
  horizonYears: number;
  goal: string;
  risk: RiskTolerance;
  style: InvestmentStyle;
  emergencyFundMonths: number;
  maxDrawdownPct: number;
  preferredSectors: string[];
  completedOnboarding: boolean;
};

export const STYLE_LABELS: Record<InvestmentStyle, string> = {
  long_term: "Long-term investing",
  swing: "Swing trading",
  intraday: "Intraday trading",
  value: "Value investing",
  growth: "Growth investing",
  index: "Index investing",
};

export const RISK_LABELS: Record<RiskTolerance, string> = {
  conservative: "Conservative",
  moderate: "Moderate",
  aggressive: "Aggressive",
};

export const SECTOR_OPTIONS = [
  "Banks",
  "IT",
  "Energy",
  "Healthcare",
  "FMCG",
  "Auto",
  "Materials",
  "Telecom",
  "Utilities",
  "Consumer",
  "Industrials",
];

export const defaultProfile: FinancialProfile = {
  monthlyIncome: 150000,
  monthlyExpenses: 70000,
  investableCapital: 1000000,
  horizonYears: 5,
  goal: "Build long-term wealth with controlled drawdowns",
  risk: "moderate",
  style: "long_term",
  emergencyFundMonths: 6,
  maxDrawdownPct: 15,
  preferredSectors: ["Banks", "IT", "Healthcare"],
  completedOnboarding: false,
};

export const PROFILE_KEY = "finn.financial.profile.v1";
