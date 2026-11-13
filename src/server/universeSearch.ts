import { readFileSync } from "fs";
import path from "path";

type Row = {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  kind?: string;
  alias?: string;
  listing?: string;
};

let cache: Row[] | null = null;

function load(): Row[] {
  if (cache) return cache;
  const p = path.join(process.cwd(), "backend/app/data/universe.json");
  cache = JSON.parse(readFileSync(p, "utf8")) as Row[];
  return cache;
}

function out(row: Row) {
  const kind = row.kind || "equity";
  return {
    ticker: kind !== "index" ? row.alias || row.ticker : row.ticker,
    name: row.name,
    exchange: row.exchange,
    sector: row.sector,
    display: row.ticker,
    listing: row.listing || null,
    is_ipo: row.listing === "ipo" || row.listing === "recent",
    kind,
  };
}

export function searchUniverseEmbedded(
  q: string,
  limit = 80,
  offset = 0,
  listing?: string | null,
  exchange?: string | null,
) {
  const pool0 = load();
  let pool = pool0;
  if (listing === "ipo") pool = pool.filter((r) => r.listing === "ipo" || r.listing === "recent");
  if (listing === "index") pool = pool.filter((r) => r.kind === "index");
  const ex = (exchange || "").toUpperCase();
  if (ex === "NSE" || ex === "BSE") pool = pool.filter((r) => r.exchange === ex);

  const needle = q.trim().toLowerCase();
  let results: ReturnType<typeof out>[] = [];

  if (!needle) {
    const idxs = pool.filter((r) => r.kind === "index").map(out);
    const eqs = pool
      .filter((r) => r.kind !== "index" && (!ex ? r.exchange === "NSE" : true))
      .map(out);
    results = ex === "BSE" ? eqs : [...idxs, ...eqs];
  } else {
    const scored: Array<[number, Row]> = [];
    for (const row of pool) {
      const ticker = row.ticker.toLowerCase();
      const name = row.name.toLowerCase();
      const alias = (row.alias || "").toLowerCase();
      let score = 0;
      if (ticker === needle || alias === needle || name === needle) score = 100;
      else if (ticker.startsWith(needle) || alias.startsWith(needle)) score = 80;
      else if (ticker.includes(needle) || alias.includes(needle)) score = 60;
      else if (name.startsWith(needle)) score = 50;
      else if (name.includes(needle)) score = 30;
      else if (needle.includes(row.sector.toLowerCase())) score = 15;
      if (score) {
        if (row.kind === "index") score += 20;
        scored.push([score, row]);
      }
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
    results = scored.map(([, r]) => out(r));
  }

  const slice = results.slice(offset, offset + limit);
  const nse = pool0.filter((r) => r.exchange === "NSE" && r.kind !== "index").length;
  const bse = pool0.filter((r) => r.exchange === "BSE" && r.kind !== "index").length;
  const indices = pool0.filter((r) => r.kind === "index").length;
  return {
    query: q,
    listing: listing || null,
    exchange: ex || null,
    limit,
    offset,
    count: slice.length,
    universe: { total: pool0.length, nse_equities: nse, bse_equities: bse, indices },
    results: slice,
  };
}
