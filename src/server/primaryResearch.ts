/**
 * Embedded Screener.in primary research for Vercel (no FastAPI required).
 * Builds bull/bear from quarterly filing tables — not fabricated narratives.
 */

import { readFileSync } from "fs";
import { join } from "path";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type CacheEntry = { at: number; payload: Record<string, unknown> };
const cache = new Map<string, CacheEntry>();
const TTL = 10 * 60 * 1000;

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(cell: string): number | null {
  const s = cell.replace(/,/g, "").replace(/%/g, "").replace(/\+/g, "").trim();
  if (!s || s === "-" || s === "—") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return Math.round(((cur / prev - 1) * 100) * 10) / 10;
}

function parseTable(html: string, tableId: string): { headers: string[]; rows: Record<string, string[]> } {
  const secRe = new RegExp(`id="${tableId}"([\\s\\S]*?)</section>`, "i");
  let blob = "";
  const sec = html.match(secRe);
  if (sec) blob = sec[1];
  else {
    const alt = html.match(new RegExp(`id="${tableId}"[\\s\\S]*?<table[\\s\\S]*?</table>`, "i"));
    if (!alt) return { headers: [], rows: {} };
    blob = alt[0];
  }
  const table = blob.match(/<table[\s\S]*?<\/table>/i);
  if (!table) return { headers: [], rows: {} };
  const t = table[0];
  const headers = [...t.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => strip(m[1])).filter(Boolean);
  const rows: Record<string, string[]> = {};
  for (const tr of t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => strip(m[1]));
    if (!cells.length) continue;
    const label = cells[0].replace(/\+/g, "").trim();
    if (!label || label.toLowerCase() === "raw pdf") continue;
    rows[label] = cells.slice(1);
  }
  return { headers, rows };
}

function pickRow(rows: Record<string, string[]>, ...names: string[]): string[] | null {
  for (const n of names) {
    for (const [k, v] of Object.entries(rows)) {
      if (k.toLowerCase().startsWith(n.toLowerCase()) || k.toLowerCase().includes(n.toLowerCase())) {
        return v;
      }
    }
  }
  return null;
}

function lastN(series: string[] | null, n = 5): (number | null)[] {
  if (!series) return Array(n).fill(null);
  const vals = series.slice(-n).map(num);
  while (vals.length < n) vals.unshift(null);
  return vals;
}

function lookupName(sym: string): { name: string; sector: string; exchange: string } {
  try {
    const raw = readFileSync(join(process.cwd(), "backend/app/data/universe.json"), "utf8");
    const list = JSON.parse(raw) as Array<{ ticker?: string; name?: string; sector?: string; exchange?: string }>;
    const hit = list.find((x) => (x.ticker || "").toUpperCase() === sym);
    if (hit) {
      return {
        name: hit.name || sym,
        sector: hit.sector || "—",
        exchange: hit.exchange || "NSE",
      };
    }
  } catch {
    /* optional */
  }
  return { name: sym, sector: "—", exchange: "NSE" };
}

export async function fetchPrimaryResearchEmbedded(ticker: string) {
  const sym = ticker.toUpperCase().replace(/\s+/g, "");
  const cached = cache.get(sym);
  if (cached && Date.now() - cached.at < TTL) return cached.payload;

  const urls = [
    `https://www.screener.in/company/${encodeURIComponent(sym)}/consolidated/`,
    `https://www.screener.in/company/${encodeURIComponent(sym)}/`,
  ];

  let html = "";
  let used = "";
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
        cache: "no-store",
        signal: AbortSignal.timeout(28000),
      });
      if (r.ok) {
        const text = await r.text();
        if (text.length > 5000) {
          html = text;
          used = url;
          break;
        }
      }
    } catch {
      /* try next */
    }
  }

  const meta = lookupName(sym);
  if (!html) {
    const payload = {
      ok: false,
      ticker: sym,
      name: meta.name,
      error: "Could not load company filings page. Technical bull/bear from the chart still apply.",
      sources: [],
    };
    cache.set(sym, { at: Date.now(), payload });
    return payload;
  }

  let about = "";
  const aboutMatch =
    html.match(/class="company-profile"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) ||
    html.match(/id="top"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  if (aboutMatch) about = strip(aboutMatch[1]).slice(0, 500);

  const docs: Array<{ kind: string; title: string; url: string }> = [];
  for (const m of html.matchAll(/href="([^"]+)"[^>]*>\s*([^<]{2,80})<\/a>/gi)) {
    const href = m[1];
    const lab = strip(m[2]);
    const low = `${href} ${lab}`.toLowerCase();
    let kind: string | null = null;
    if (low.includes("annual report")) kind = "annual_report";
    else if (low.includes("transcript")) kind = "transcript";
    else if (low.includes("concall") || low.includes("earnings")) kind = "concall";
    if (!kind) continue;
    const link = href.startsWith("http") ? href : `https://www.screener.in${href}`;
    docs.push({ kind, title: lab, url: link });
  }
  const seen = new Set<string>();
  const sources = [];
  for (const d of docs) {
    const key = `${d.kind}|${d.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(d);
  }

  const q = parseTable(html, "quarters");
  const y = parseTable(html, "profit-loss");
  const salesV = lastN(pickRow(q.rows, "Sales"));
  const opV = lastN(pickRow(q.rows, "Operating Profit"));
  const pbtV = lastN(pickRow(q.rows, "Profit before tax"));
  const patV = lastN(pickRow(q.rows, "Net Profit"));
  const opm = pickRow(q.rows, "OPM");
  const eps = pickRow(q.rows, "EPS");

  const line = (label: string, vals: (number | null)[]) => {
    const cur = vals[vals.length - 1] ?? null;
    const prev = vals.length >= 2 ? vals[vals.length - 2] : null;
    const yoyBase = vals.length >= 5 ? vals[vals.length - 5] : null;
    return {
      label,
      value: cur == null ? null : `₹${Math.round(cur).toLocaleString("en-IN")} Cr`,
      raw: cur,
      qoq: pctChange(cur, prev),
      yoy: pctChange(cur, yoyBase),
    };
  };

  const results = [
    line("Revenue", salesV),
    line("EBITDA / Operating profit", opV),
    line("PBT", pbtV),
    line("PAT", patV),
  ];

  const ySales = lastN(pickRow(y.rows, "Sales"), 4);
  const yPat = lastN(pickRow(y.rows, "Net Profit"), 4);
  const trajectory: Array<{ metric: string; change_pct: number | null }> = [];
  if (ySales[3] != null && ySales[0] != null) {
    trajectory.push({ metric: "Sales (multi-year)", change_pct: pctChange(ySales[3], ySales[0]) });
  }
  if (yPat[3] != null && yPat[0] != null) {
    trajectory.push({ metric: "PAT (multi-year)", change_pct: pctChange(yPat[3], yPat[0]) });
  }

  const bull: string[] = [];
  const bear: string[] = [];
  const rev = results[0];
  const ebitda = results[1];
  const net = results[3];
  if (rev.yoy != null && rev.yoy > 0) bull.push(`Revenue up ${rev.yoy}% YoY in the latest quarter (company filings).`);
  else if (rev.yoy != null && rev.yoy < 0)
    bear.push(`Revenue down ${Math.abs(rev.yoy)}% YoY — top-line pressure in primary prints.`);
  if (ebitda.yoy != null && ebitda.yoy > 0) bull.push(`Operating profit up ${ebitda.yoy}% YoY.`);
  else if (ebitda.yoy != null && ebitda.yoy < 0)
    bear.push(`Operating profit down ${Math.abs(ebitda.yoy)}% YoY.`);
  if (net.qoq != null && net.qoq > 0) bull.push(`PAT improved ${net.qoq}% QoQ.`);
  else if (net.qoq != null && net.qoq < 0) bear.push(`PAT slipped ${Math.abs(net.qoq)}% QoQ.`);
  if (opm?.[opm.length - 1]) bull.push(`Latest operating margin print: ${opm[opm.length - 1]} (quarterly table).`);
  for (const t of trajectory) {
    if (t.change_pct == null) continue;
    if (t.change_pct >= 0) bull.push(`${t.metric} expanded ~${t.change_pct}% over the recent annual window.`);
    else bear.push(`${t.metric} compressed ~${Math.abs(t.change_pct)}% over the recent annual window.`);
  }
  if (!bull.length) bull.push("Primary tables do not show a clear positive swing this print — wait for next filing.");
  if (!bear.length) bear.push("No sharp deterioration in the latest primary quarter table — risk is still execution / guidance.");

  const narrative: string[] = [];
  if (rev.yoy != null && ebitda.yoy != null) {
    if (rev.yoy > 0 && ebitda.yoy < rev.yoy - 5) {
      narrative.push("Sales grew faster than operating profit YoY — margin mix needs the next concall.");
    } else if (rev.yoy > 0 && ebitda.yoy >= rev.yoy) {
      narrative.push("Operating profit kept pace with or beat sales growth YoY.");
    } else if (rev.yoy < 0 && ebitda.yoy < 0) {
      narrative.push("Both sales and operating profit are down YoY in the filing tables.");
    }
  }

  const ar = sources.find((s) => s.kind === "annual_report") || null;
  const tr = sources.find((s) => s.kind === "transcript" || s.kind === "concall") || null;
  const invalidates =
    (rev.yoy != null && rev.yoy < -8) || (net.yoy != null && net.yoy < -10)
      ? "Thesis weakens if the next filing print stays negative on revenue and PAT without a clear recovery path in the transcript."
      : "Thesis weakens if the next quarter shows a sharp YoY drop in revenue/PAT or guidance turns cautious on the concall.";

  const payload = {
    ok: true,
    ticker: sym,
    name: meta.name,
    exchange: meta.exchange,
    sector: meta.sector,
    as_of: new Date().toISOString(),
    page: used,
    snapshot: about || `${meta.name} — profile from company disclosures on screener.in.`,
    discipline: "Primary sources only (company filings / AR / transcripts via screener.in).",
    quarters: q.headers.slice(-5),
    results,
    opm_latest: opm?.[opm.length - 1] ?? null,
    eps_latest: eps?.[eps.length - 1] ?? null,
    trajectory,
    bull: bull.slice(0, 5),
    bear: bear.slice(0, 5),
    narrative_vs_numbers: narrative,
    invalidates,
    action_hint:
      (rev.yoy ?? 0) > -2 && (net.yoy ?? 0) > -5 ? "Keep watching" : "Dig deeper before adding",
    sources: {
      annual_report: ar,
      transcript: tr,
      all: sources.slice(0, 12),
    },
  };

  cache.set(sym, { at: Date.now(), payload });
  return payload;
}
