#!/usr/bin/env python3
"""Rebuild universe.json from the official NSE EQUITY_L.csv (+ indices / BSE keepers)."""

from __future__ import annotations

import csv
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "backend" / "app" / "data"
OUT = DATA / "universe.json"
CSV_PATH = DATA / "EQUITY_L.csv"
NSE_CSV_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"

INDICES = [
    {"ticker": "NIFTY", "name": "Nifty 50", "exchange": "NSE", "sector": "Index", "kind": "index", "yahoo": "^NSEI"},
    {"ticker": "SENSEX", "name": "Sensex", "exchange": "BSE", "sector": "Index", "kind": "index", "yahoo": "^BSESN"},
    {"ticker": "BANKNIFTY", "name": "Nifty Bank", "exchange": "NSE", "sector": "Index", "kind": "index", "yahoo": "^NSEBANK"},
    {"ticker": "FINNIFTY", "name": "Nifty Financial Services", "exchange": "NSE", "sector": "Index", "kind": "index"},
    {"ticker": "MIDCPNIFTY", "name": "Nifty Midcap Select", "exchange": "NSE", "sector": "Index", "kind": "index"},
    {"ticker": "INDIAVIX", "name": "India VIX", "exchange": "NSE", "sector": "Index", "kind": "index"},
]


def download_csv() -> None:
    req = urllib.request.Request(
        NSE_CSV_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": "https://www.nseindia.com/",
            "Accept": "text/csv,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        CSV_PATH.write_bytes(resp.read())
    print(f"downloaded {CSV_PATH} ({CSV_PATH.stat().st_size} bytes)")


def load_existing_meta() -> dict[str, dict]:
    if not OUT.exists():
        return {}
    try:
        rows = json.loads(OUT.read_text())
    except Exception:
        return {}
    meta: dict[str, dict] = {}
    for r in rows:
        if r.get("kind") == "index":
            continue
        key = (r.get("alias") or r.get("ticker") or "").upper()
        if key:
            meta[key] = r
    return meta


def parse_nse_rows(existing: dict[str, dict]) -> list[dict]:
    with CSV_PATH.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    out: list[dict] = []
    seen: set[str] = set()
    for raw in rows:
        sym = (raw.get("SYMBOL") or "").strip().upper()
        name = (raw.get("NAME OF COMPANY") or "").strip()
        series = (raw.get(" SERIES") or raw.get("SERIES") or "").strip().upper()
        listed = (raw.get(" DATE OF LISTING") or raw.get("DATE OF LISTING") or "").strip()
        isin = (raw.get(" ISIN NUMBER") or raw.get("ISIN NUMBER") or "").strip()
        if not sym or not name:
            continue
        if series and series not in {"EQ", "BE", "BZ", "SM", "ST"}:
            # Keep tradeable equity-like series only
            continue
        if sym in seen:
            continue
        seen.add(sym)
        prev = existing.get(sym) or {}
        listing = prev.get("listing")
        # Rough IPO flag: listed in current / prior calendar year string isn't parsed deeply;
        # preserve prior listing tags when present.
        row = {
            "ticker": sym,
            "name": name,
            "exchange": "NSE",
            "sector": prev.get("sector") or "Equity",
            "kind": "equity",
            "series": series or "EQ",
            "isin": isin or None,
            "listed_on": listed or None,
        }
        if listing:
            row["listing"] = listing
        # Drop nulls
        out.append({k: v for k, v in row.items() if v is not None})
    return out


def keep_bse_only(existing: dict[str, dict], nse_syms: set[str]) -> list[dict]:
    kept: list[dict] = []
    for sym, row in existing.items():
        if row.get("exchange") != "BSE":
            continue
        # Skip if same symbol already on NSE
        if sym in nse_syms:
            continue
        kept.append(
            {
                "ticker": row.get("ticker") or sym,
                "name": row.get("name") or sym,
                "exchange": "BSE",
                "sector": row.get("sector") or "Equity",
                "kind": "equity",
                **({"alias": row["alias"]} if row.get("alias") else {}),
                **({"listing": row["listing"]} if row.get("listing") else {}),
            }
        )
    return kept


def main() -> int:
    refresh = "--refresh" in sys.argv or not CSV_PATH.exists()
    if refresh:
        try:
            download_csv()
        except Exception as e:
            if not CSV_PATH.exists():
                print(f"download failed and no local CSV: {e}", file=sys.stderr)
                return 1
            print(f"download failed ({e}); using cached {CSV_PATH}")

    existing = load_existing_meta()
    nse = parse_nse_rows(existing)
    nse_syms = {r["ticker"] for r in nse}
    bse = keep_bse_only(existing, nse_syms)

    universe = [*INDICES, *nse, *bse]
    OUT.write_text(json.dumps(universe, ensure_ascii=False, indent=2) + "\n")
    print(
        f"wrote {OUT}: {len(universe)} rows "
        f"(indices={len(INDICES)}, nse={len(nse)}, bse={len(bse)})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
