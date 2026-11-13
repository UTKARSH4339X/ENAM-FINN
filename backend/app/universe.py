"""NSE / BSE / index searchable universe (full NSE EQUITY_L coverage)."""

from __future__ import annotations

import json
from pathlib import Path

_DATA = Path(__file__).resolve().parent / "data" / "universe.json"
_cache: dict[str, object] = {"mtime": None, "rows": []}


def load_universe() -> list[dict]:
    """Hot-reload when universe.json is rebuilt from NSE EQUITY_L.csv."""
    try:
        mtime = _DATA.stat().st_mtime
    except OSError:
        return list(_cache.get("rows") or [])
    if _cache.get("mtime") == mtime and _cache.get("rows"):
        return _cache["rows"]  # type: ignore[return-value]
    raw = json.loads(_DATA.read_text())
    _cache["mtime"] = mtime
    _cache["rows"] = raw
    return raw


UNIVERSE = load_universe()


def universe_stats() -> dict:
    rows = load_universe()
    nse = sum(1 for r in rows if r.get("exchange") == "NSE" and (r.get("kind") or "equity") != "index")
    bse = sum(1 for r in rows if r.get("exchange") == "BSE" and (r.get("kind") or "equity") != "index")
    idxs = sum(1 for r in rows if r.get("kind") == "index")
    return {"total": len(rows), "nse_equities": nse, "bse_equities": bse, "indices": idxs}


def resolve_symbol(ticker: str) -> str:
    t = ticker.upper().strip().replace(" ", "")
    aliases = {
        "NIFTY50": "NIFTY",
        "NIFTY_50": "NIFTY",
        "^NSEI": "NIFTY",
        "BSESENSEX": "SENSEX",
        "^BSESN": "SENSEX",
        "NIFTYBANK": "BANKNIFTY",
        "BANK_NIFTY": "BANKNIFTY",
    }
    if t in aliases:
        t = aliases[t]
    for row in load_universe():
        if row.get("kind") == "index" and row["ticker"] == t:
            return row["ticker"]
        if row["ticker"] == t:
            return row.get("alias") or row["ticker"]
        if (row.get("alias") or "") == t:
            return row.get("alias") or row["ticker"]
    return t


def yahoo_symbol(ticker: str) -> list[str]:
    """Candidate Yahoo symbols to try (order matters)."""
    t = resolve_symbol(ticker)
    for row in load_universe():
        key = row.get("alias") or row["ticker"]
        if row["ticker"] == t or key == t:
            if row.get("yahoo"):
                return [row["yahoo"]]
            if row.get("kind") == "index":
                break
            if row["exchange"] == "BSE" and row.get("alias"):
                return [f"{row['alias']}.NS", f"{row['alias']}.BO"]
            if row["exchange"] == "BSE":
                return [f"{t}.BO", f"{t}.NS"]
            return [f"{t}.NS", f"{t}.BO"]
    # Free-typed tickers
    if t in ("NIFTY", "NIFTY50"):
        return ["^NSEI"]
    if t in ("SENSEX",):
        return ["^BSESN"]
    if t in ("BANKNIFTY", "NIFTYBANK"):
        return ["^NSEBANK"]
    return [f"{t}.NS", f"{t}.BO"]


def _row_out(row: dict) -> dict:
    listing = row.get("listing")
    kind = row.get("kind") or "equity"
    return {
        "ticker": row.get("alias") or row["ticker"] if kind != "index" else row["ticker"],
        "name": row["name"],
        "exchange": row["exchange"],
        "sector": row["sector"],
        "display": row["ticker"],
        "listing": listing,
        "is_ipo": listing in ("ipo", "recent"),
        "kind": kind,
    }


def search_universe(
    q: str,
    limit: int = 40,
    listing: str | None = None,
    exchange: str | None = None,
    offset: int = 0,
) -> list[dict]:
    needle = q.strip().lower()
    pool = load_universe()
    if listing == "ipo":
        pool = [r for r in pool if r.get("listing") in ("ipo", "recent")]
    elif listing == "index":
        pool = [r for r in pool if r.get("kind") == "index"]

    ex = (exchange or "").strip().upper()
    if ex in ("NSE", "BSE"):
        pool = [r for r in pool if r.get("exchange") == ex]

    if not needle:
        if listing == "ipo":
            rows = [r for r in pool if r.get("exchange") == "NSE"]
            return [_row_out(r) for r in rows[offset : offset + limit]]
        if listing == "index":
            return [_row_out(r) for r in pool[offset : offset + limit]]
        # Browse: indices first (when not exchange-filtered), then full equity book
        idxs = [_row_out(r) for r in pool if r.get("kind") == "index"]
        eqs = [_row_out(r) for r in pool if r.get("kind") != "index"]
        if not ex:
            # Default Markets tab: indices + all NSE equities from EQUITY_L
            eqs = [r for r in eqs if r["exchange"] == "NSE"]
            combined = idxs + eqs
        else:
            combined = eqs
        return combined[offset : offset + limit]

    scored: list[tuple[int, dict]] = []
    for row in pool:
        ticker = row["ticker"].lower()
        name = row["name"].lower()
        alias = (row.get("alias") or "").lower()
        score = 0
        if ticker == needle or alias == needle or name == needle:
            score = 100
        elif needle in ("nifty", "nifty50", "nifty 50") and row["ticker"] == "NIFTY":
            score = 100
        elif needle in ("sensex", "bse sensex") and row["ticker"] == "SENSEX":
            score = 100
        elif needle in ("banknifty", "bank nifty", "nifty bank") and row["ticker"] == "BANKNIFTY":
            score = 100
        elif ticker.startswith(needle) or alias.startswith(needle):
            score = 80
        elif needle in ticker or needle in alias:
            score = 60
        elif name.startswith(needle):
            score = 50
        elif needle in name:
            score = 30
        elif needle in ("ipo", "ipos", "new") and row.get("listing") in ("ipo", "recent"):
            score = 70
        elif needle in ("index", "indices") and row.get("kind") == "index":
            score = 90
        elif needle in row["sector"].lower():
            score = 15
        if score:
            if row.get("kind") == "index":
                score += 20
            if row.get("listing") == "ipo":
                score += 5
            scored.append((score, row))

    scored.sort(key=lambda x: (-x[0], x[1]["name"]))
    seen: set[str] = set()
    out: list[dict] = []
    for _, row in scored:
        key = row["ticker"] if row.get("kind") == "index" else (row.get("alias") or row["ticker"])
        if key in seen:
            continue
        seen.add(key)
        out.append(_row_out(row))
    return out[offset : offset + limit]


def lookup(ticker: str) -> dict | None:
    sym = resolve_symbol(ticker)
    t = ticker.upper().strip()
    for row in load_universe():
        if row["ticker"] in (sym, t) or row.get("alias") == sym:
            if row.get("kind") == "index" or row["exchange"] == "NSE" or not row.get("alias"):
                return {
                    "ticker": row["ticker"] if row.get("kind") == "index" else sym,
                    "name": row["name"],
                    "exchange": row["exchange"],
                    "sector": row["sector"],
                    "kind": row.get("kind") or "equity",
                }
    for row in load_universe():
        if (row.get("alias") or row["ticker"]) == sym:
            return {
                "ticker": sym,
                "name": row["name"],
                "exchange": row["exchange"],
                "sector": row["sector"],
                "kind": row.get("kind") or "equity",
            }
    return {"ticker": sym, "name": sym, "exchange": "NSE", "sector": "—", "kind": "equity"}
