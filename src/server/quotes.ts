/** Server-side live NSE quotes (Moneycontrol). Used when Python API is unreachable. */

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

const INDEX_FEED: Record<string, string> = {
  NIFTY: "in%3BNSX",
  SENSEX: "in%3BSEN",
  BANKNIFTY: "in%3Bnbx",
};

const SCID: Record<string, string> = {
  RELIANCE: "RI",
  TCS: "TCS",
  INFY: "IT",
  HDFCBANK: "HDF01",
  ICICIBANK: "ICI02",
  SBIN: "SBI",
  ITC: "ITC",
  BHARTIARTL: "BA08",
  LT: "LT",
  AXISBANK: "UTI10",
  ASIANPAINT: "API",
  MARUTI: "MU01",
  SUNPHARMA: "SPI",
  TITAN: "TI01",
  ULTRACEMCO: "UTC",
  NESTLEIND: "NI",
  POWERGRID: "PGC",
  NTPC: "NTP",
  WIPRO: "W",
  HCLTECH: "HCL02",
  TATASTEEL: "TIS",
  TATAMOTORS: "TM03",
  "M&M": "MM",
  KOTAKBANK: "KKB",
  BAJFINANCE: "BAF",
};

function headers() {
  return {
    "User-Agent": UA,
    Accept: "application/json,text/plain,*/*",
    Referer: "https://www.moneycontrol.com/",
  };
}

async function quoteOne(ticker: string): Promise<{
  ticker: string;
  price: number;
  change_pct: number;
  source: string;
  spark: number[];
} | null> {
  const sym = ticker.toUpperCase().replace(/\s+/g, "");
  try {
    if (INDEX_FEED[sym]) {
      const url = `https://priceapi.moneycontrol.com/pricefeed/notapplicable/inidicesindia/${INDEX_FEED[sym]}`;
      const r = await fetch(url, { headers: headers(), cache: "no-store" });
      if (!r.ok) return null;
      const body = await r.json();
      const d = body?.data;
      if (!d) return null;
      const price = Number(d.lastprice || d.last || 0);
      const change_pct = Number(d.perchange || d.percentchange || 0);
      if (!price) return null;
      return { ticker: sym, price, change_pct, source: "moneycontrol", spark: [] };
    }
    const scid = SCID[sym] || sym;
    for (const path of ["nse", "bse"] as const) {
      const url = `https://priceapi.moneycontrol.com/pricefeed/${path}/equitycash/${scid}`;
      const r = await fetch(url, { headers: headers(), cache: "no-store" });
      if (!r.ok) continue;
      const body = await r.json();
      const d = body?.data;
      if (!d) continue;
      const price = Number(d.pricecurrent || d.lastprice || 0);
      const change_pct = Number(d.pricepercentchange || d.perchange || 0);
      if (!price) continue;
      return {
        ticker: sym,
        price,
        change_pct,
        source: path === "nse" ? "moneycontrol" : "moneycontrol_bse",
        spark: [],
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchQuotesEmbedded(tickers: string[]) {
  const quotes: Record<string, object> = {};
  let live = false;
  await Promise.all(
    tickers.map(async (t) => {
      const sym = t.toUpperCase();
      const q = await quoteOne(sym);
      if (q) {
        live = true;
        quotes[sym] = q;
      } else {
        quotes[sym] = {
          ticker: sym,
          price: 0,
          change_pct: 0,
          source: "unavailable",
          spark: [],
        };
      }
    }),
  );
  return {
    live,
    error: live ? null : "quotes_unavailable",
    quotes,
    as_of: new Date().toISOString(),
    disclaimer: "Live NSE/BSE quotes from Moneycontrol public feeds.",
  };
}
