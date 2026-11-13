export type Holding = {
  ticker: string;
  name: string;
  sector: string;
  weight: number;
  price: number;
  changePct: number;
  volumeRatio: number;
};

export type AnnouncementCategory =
  | "results"
  | "M&A"
  | "management_change"
  | "fund_raise"
  | "litigation"
  | "dividend"
  | "credit_rating"
  | "capex"
  | "press_release"
  | "unclassified";

export type Priority = "critical" | "high" | "watch" | "routine";

export type PushItem = {
  id: string;
  ticker: string;
  company: string;
  category: AnnouncementCategory;
  priority: Priority;
  title: string;
  summary: string;
  whyItMatters: string;
  time: string;
  kind: "filing" | "price" | "volume";
  badge?: string;
};

export type ResultLine = {
  label: string;
  value: string;
  qoq: number;
  yoy: number;
};

export const portfolio: Holding[] = [
  { ticker: "RELIANCE", name: "Reliance Industries", sector: "Energy", weight: 9.4, price: 1284.5, changePct: 1.2, volumeRatio: 1.1 },
  { ticker: "TCS", name: "Tata Consultancy", sector: "IT", weight: 8.1, price: 3921.0, changePct: -0.4, volumeRatio: 0.9 },
  { ticker: "HDFCBANK", name: "HDFC Bank", sector: "Banks", weight: 7.6, price: 1688.2, changePct: 0.6, volumeRatio: 1.3 },
  { ticker: "INFY", name: "Infosys", sector: "IT", weight: 6.8, price: 1782.4, changePct: -1.1, volumeRatio: 2.4 },
  { ticker: "ICICIBANK", name: "ICICI Bank", sector: "Banks", weight: 6.2, price: 1241.7, changePct: 0.8, volumeRatio: 1.0 },
  { ticker: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom", weight: 5.4, price: 1589.3, changePct: 0.3, volumeRatio: 0.8 },
  { ticker: "ITC", name: "ITC", sector: "FMCG", weight: 5.1, price: 468.9, changePct: -0.2, volumeRatio: 0.7 },
  { ticker: "SBIN", name: "State Bank of India", sector: "Banks", weight: 4.8, price: 842.1, changePct: 1.5, volumeRatio: 1.6 },
  { ticker: "LT", name: "Larsen & Toubro", sector: "Industrials", weight: 4.5, price: 3612.0, changePct: 0.9, volumeRatio: 1.2 },
  { ticker: "AXISBANK", name: "Axis Bank", sector: "Banks", weight: 4.2, price: 1124.6, changePct: -0.7, volumeRatio: 1.4 },
  { ticker: "ASIANPAINT", name: "Asian Paints", sector: "Materials", weight: 3.9, price: 2488.0, changePct: -2.8, volumeRatio: 3.1 },
  { ticker: "MARUTI", name: "Maruti Suzuki", sector: "Auto", weight: 3.7, price: 11240.0, changePct: 0.5, volumeRatio: 0.9 },
  { ticker: "SUNPHARMA", name: "Sun Pharma", sector: "Healthcare", weight: 3.5, price: 1789.5, changePct: 1.1, volumeRatio: 1.1 },
  { ticker: "TITAN", name: "Titan Company", sector: "Consumer", weight: 3.3, price: 3388.0, changePct: -0.9, volumeRatio: 1.5 },
  { ticker: "ULTRACEMCO", name: "UltraTech Cement", sector: "Materials", weight: 3.1, price: 11215.0, changePct: 0.4, volumeRatio: 0.8 },
  { ticker: "NESTLEIND", name: "Nestlé India", sector: "FMCG", weight: 2.9, price: 2410.0, changePct: 0.2, volumeRatio: 0.6 },
  { ticker: "POWERGRID", name: "Power Grid", sector: "Utilities", weight: 2.7, price: 318.4, changePct: 0.7, volumeRatio: 1.0 },
  { ticker: "NTPC", name: "NTPC", sector: "Utilities", weight: 2.5, price: 372.8, changePct: 1.0, volumeRatio: 1.2 },
];

export const windows = ["24h", "3d", "7d", "MTD"] as const;

export const pushItems: PushItem[] = [
  {
    id: "asian-vol",
    ticker: "ASIANPAINT",
    company: "Asian Paints",
    category: "press_release",
    priority: "critical",
    title: "Volume 3.1× average on −2.8% close",
    summary: "Heaviest session in 47 trading days. Price cleared the 50-day average on elevated participation.",
    whyItMatters: "Unusual volume with a sharp down-day often precedes a guidance reset or channel restocking commentary.",
    time: "16:12 IST",
    kind: "volume",
    badge: "Volume alert",
  },
  {
    id: "infy-cfo",
    ticker: "INFY",
    company: "Infosys",
    category: "management_change",
    priority: "critical",
    title: "CFO succession announced",
    summary: "Jayesh Sanghrajka appointed CFO effective 1 Dec. Incumbent Nilanjan Roy retires after eight years.",
    whyItMatters: "CFO transitions at large-cap IT can reprice capital-allocation credibility and buyback cadence for 2–3 quarters.",
    time: "14:48 IST",
    kind: "filing",
    badge: "Management",
  },
  {
    id: "hdfc-results",
    ticker: "HDFCBANK",
    company: "HDFC Bank",
    category: "results",
    priority: "high",
    title: "Q2 FY26 results filed",
    summary: "NII and PAT ahead of street on deposit traction; NIM held. Provisions benign.",
    whyItMatters: "First clean print after merger noise — deposit mix and NIM are the two numbers that reset the multiple.",
    time: "13:05 IST",
    kind: "filing",
    badge: "Results",
  },
  {
    id: "lt-capex",
    ticker: "LT",
    company: "Larsen & Toubro",
    category: "capex",
    priority: "high",
    title: "Board clears hydrocarbon capacity spend",
    summary: "₹4,820 Cr approved for Middle East fabrication capacity and domestic modular yards.",
    whyItMatters: "Capex of this size is a forward order-book signal — watch utilisation commentary on the next concall.",
    time: "11:22 IST",
    kind: "filing",
    badge: "Capex",
  },
  {
    id: "sbin-div",
    ticker: "SBIN",
    company: "State Bank of India",
    category: "dividend",
    priority: "watch",
    title: "Interim dividend declared",
    summary: "₹7.10 per share. Record date 21 Nov.",
    whyItMatters: "Routine capital return; no change to thesis, but useful for cash-flow timing in the book.",
    time: "10:40 IST",
    kind: "filing",
    badge: "Dividend",
  },
  {
    id: "titan-rating",
    ticker: "TITAN",
    company: "Titan Company",
    category: "credit_rating",
    priority: "watch",
    title: "CRISIL reaffirms AAA / Stable",
    summary: "Long-term rating reaffirmed. No change to outlook.",
    whyItMatters: "Confirmatory, not catalytic. Keep collapsed unless leverage narrative shifts.",
    time: "09:58 IST",
    kind: "filing",
    badge: "Rating",
  },
  {
    id: "itc-esop",
    ticker: "ITC",
    company: "ITC",
    category: "unclassified",
    priority: "routine",
    title: "ESOP allotment — 4.2 lakh shares",
    summary: "Routine employee stock option allotment under the 2001 scheme.",
    whyItMatters: "Paperwork. Dilution immaterial at book size.",
    time: "09:12 IST",
    kind: "filing",
    badge: "Routine",
  },
];

export const hdfcResults: ResultLine[] = [
  { label: "Revenue / NII", value: "₹31,248 Cr", qoq: 3.4, yoy: 11.8 },
  { label: "EBITDA / PPOP", value: "₹24,106 Cr", qoq: 2.1, yoy: 9.6 },
  { label: "PBT", value: "₹20,884 Cr", qoq: 4.0, yoy: 12.4 },
  { label: "PAT", value: "₹15,772 Cr", qoq: 3.8, yoy: 11.2 },
];

export const research = {
  ticker: "INFY",
  name: "Infosys Limited",
  exchange: "NSE",
  asOf: "Primary sources · AR FY25 + Q2 FY26 concall",
  snapshot:
    "Global IT services major. Revenue mix skewed to Financial Services, Retail, and Communications; delivery footprint across India, Americas, and Europe.",
  segments: [
    { name: "Financial Services", pct: 28 },
    { name: "Retail", pct: 15 },
    { name: "Communications", pct: 12 },
    { name: "Energy & Utilities", pct: 12 },
    { name: "Others", pct: 33 },
  ],
  financials: [
    { label: "Revenue (TTM)", value: "$19.1B" },
    { label: "EBIT margin", value: "20.8%" },
    { label: "PAT margin", value: "16.4%" },
    { label: "Cash conversion (FCF / PAT)", value: "1.05×" },
  ],
  trajectory:
    "Three-year revenue CAGR mid-single digits in USD. Margin band held inside guided corridor after FY24 compression. Large-deal TCV recovering, but discretionary spend in US FS remains uneven.",
  narrativeVsNumbers: {
    promised: "Management guided FY26 revenue growth 3.5–4.5% CC and operating margin 20–22%.",
    delivered:
      "H1 tracking the lower half of the growth band. Margin at 20.8% — inside guide, not expanding. Large-deal pipeline cited as ‘healthy’; conversion lag visible in utilisation.",
    verdict: "Story and numbers rhyme on margin discipline. Growth commentary is running ahead of reported CC growth by roughly a quarter.",
  },
  guidance: [
    "FY26 revenue growth 3.5–4.5% CC",
    "Operating margin 20–22%",
    "Capex guided at ~2% of revenue",
  ],
  bull: "Margin floor holds, large-deal conversion accelerates in H2, and a clean CFO handoff keeps buyback and capital return cadence intact.",
  bear: "US FS discretionary spend stays soft, growth exits the guided band, and CFO transition becomes an excuse to defer capital return.",
};

export const cfoProfile = {
  name: "Jayesh Sanghrajka",
  role: "Incoming CFO · Infosys",
  from: "Deputy CFO, Infosys · previously led FP&A and investor relations cadence",
  notes: [
    "Internal elevation — continuity bias on capital allocation.",
    "Known to street from earnings walk-throughs; lower narrative risk than an external hire.",
    "Watch first two quarters for any shift in buyback framing or margin vocabulary.",
  ],
};

export function portfolioPulse() {
  const up = portfolio.filter((h) => h.changePct > 0).length;
  const down = portfolio.length - up;
  const movers = [...portfolio].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 3);
  const avg = portfolio.reduce((s, h) => s + h.changePct * h.weight, 0) / portfolio.reduce((s, h) => s + h.weight, 0);
  return { up, down, movers, avg };
}
