"""NSE corporate announcements → prioritized Push digest (ENAM core)."""

from __future__ import annotations

import hashlib
import os
import re
import time
from datetime import datetime, timedelta
from typing import Any

import httpx

for _k in list(os.environ):
    if "proxy" in _k.lower():
        os.environ.pop(_k, None)

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

# ENAM-style categories (from challenge reference)
CATEGORY_RULES: list[tuple[str, list[str]]] = [
    ("results", ["financial results", "outcome of board", "audited", "unaudited", "quarterly", "q1", "q2", "q3", "q4", "results"]),
    ("M&A", ["acquisition", "merger", "demerger", "joint venture", "stake sale", "subsidiary"]),
    ("fund_raise", ["qip", "preferential", "rights issue", "commercial paper", "buyback", "fund raise", "fund raising"]),
    ("management_change", ["appointment", "resignation", "retire", "cfo", "ceo", "managing director", "director", "kmp", "change in"]),
    ("litigation", ["litigation", "court", "sebi", "penalty", "fine", "insolvency", "nclat", "nclt"]),
    ("dividend", ["dividend"]),
    ("credit_rating", ["credit rating", "rating", "crisil", "icra", "care"]),
    ("capex", ["capex", "capacity", "plant", "expansion"]),
    ("earnings_call", ["con. call", "conference call", "earnings call", "analysts/institutional", "investor meet"]),
    ("press_release", ["press release", "bagging/receiving of orders", "order", "update"]),
    ("agm_egm", ["shareholders meeting", "agm", "egm", "postal ballot"]),
    ("unclassified", []),
]

PRIORITY = {
    "results": "critical",
    "M&A": "critical",
    "management_change": "critical",
    "litigation": "high",
    "fund_raise": "high",
    "capex": "high",
    "credit_rating": "watch",
    "dividend": "watch",
    "earnings_call": "watch",
    "press_release": "watch",
    "agm_egm": "routine",
    "unclassified": "routine",
}

DEFAULT_PORTFOLIO = [
    "RELIANCE",
    "TCS",
    "HDFCBANK",
    "INFY",
    "ICICIBANK",
    "BHARTIARTL",
    "ITC",
    "SBIN",
    "LT",
    "AXISBANK",
    "ASIANPAINT",
    "MARUTI",
    "SUNPHARMA",
    "TITAN",
    "ULTRACEMCO",
    "NESTLEIND",
    "POWERGRID",
    "NTPC",
]

_CACHE: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL = 180.0
_DIGEST_CACHE: dict[str, tuple[float, dict]] = {}


def _nse_client() -> httpx.Client:
    return httpx.Client(
        headers={
            "User-Agent": UA,
            "Accept": "application/json,text/plain,*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-announcements",
        },
        timeout=35.0,
        follow_redirects=True,
    )


def classify(desc: str, text: str) -> str:
    blob = f"{desc} {text}".lower()
    for cat, keys in CATEGORY_RULES:
        if cat == "unclassified":
            continue
        if any(k in blob for k in keys):
            return cat
    return "unclassified"


def _why(cat: str, title: str, company: str) -> str:
    if cat == "results":
        return f"{company} filed results — check Revenue, EBITDA, PBT, PAT vs last quarter and last year."
    if cat == "management_change":
        return f"Leadership change at {company} can reset capital-allocation and guidance credibility."
    if cat == "M&A":
        return f"Deal activity at {company} can change the earnings mix and balance-sheet risk."
    if cat == "capex":
        return f"New spend signals forward capacity — watch utilisation and funding on the next call."
    if cat == "litigation":
        return f"Legal / regulatory items can create downside not visible in the P&L yet."
    if cat == "dividend":
        return "Capital return timing — usually not thesis-changing."
    if cat == "earnings_call":
        return "Primary source coming — management tone and guidance live here."
    if cat == "credit_rating":
        return "Confirms or challenges leverage story — usually confirmatory."
    return f"Exchange filing for {company}: {title}."


def _fid(symbol: str, seq: str, dt: str) -> str:
    raw = f"{symbol}|{seq}|{dt}"
    return "nse-" + hashlib.md5(raw.encode()).hexdigest()[:12]


def fetch_symbol_announcements(symbol: str, days: int = 14) -> list[dict]:
    sym = symbol.upper()
    key = f"{sym}:{days}"
    now = time.time()
    cached = _CACHE.get(key)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    to_d = datetime.now()
    from_d = to_d - timedelta(days=max(days, 7))
    from_s = from_d.strftime("%d-%m-%Y")
    to_s = to_d.strftime("%d-%m-%Y")
    url = (
        "https://www.nseindia.com/api/corporate-announcements"
        f"?index=equities&symbol={sym}&from_date={from_s}&to_date={to_s}"
    )
    rows: list[dict] = []
    try:
        with _nse_client() as c:
            c.get("https://www.nseindia.com/api/allIndices")
            r = c.get(url)
            if r.status_code != 200:
                _CACHE[key] = (now, [])
                return []
            data = r.json()
            if not isinstance(data, list):
                _CACHE[key] = (now, [])
                return []
            for item in data:
                desc = item.get("desc") or ""
                text = item.get("attchmntText") or ""
                cat = classify(desc, text)
                title = (text.strip().split("\n")[0] if text.strip() else desc)[:140]
                if not title:
                    title = desc or "Exchange filing"
                company = item.get("sm_name") or sym
                an_dt = item.get("an_dt") or item.get("exchdisstime") or ""
                seq = str(item.get("seq_id") or item.get("dt") or title)
                rows.append(
                    {
                        "id": _fid(sym, seq, an_dt),
                        "ticker": sym,
                        "company": company,
                        "category": cat,
                        "priority": PRIORITY.get(cat, "routine"),
                        "title": title,
                        "summary": (text or desc)[:280],
                        "whyItMatters": _why(cat, title, company),
                        "time": an_dt,
                        "kind": "filing",
                        "badge": cat.replace("_", " ").title(),
                        "source": "nse",
                        "attachment": item.get("attchmntFile"),
                        "sort_date": item.get("sort_date") or an_dt,
                        "industry": item.get("smIndustry"),
                    }
                )
    except Exception:
        rows = []

    _CACHE[key] = (now, rows)
    return rows


def _window_days(window: str) -> int:
    w = (window or "24h").lower()
    if w in ("24h", "1d", "today"):
        return 1
    if w in ("3d",):
        return 3
    if w in ("7d", "1w"):
        return 7
    if w in ("mtd",):
        return max(datetime.now().day, 7)
    return 3


def build_digest(
    tickers: list[str] | None = None,
    window: str = "24h",
    include_volume: bool = True,
) -> dict[str, Any]:
    from .market import fetch_quotes

    symbols = [t.upper() for t in (tickers or DEFAULT_PORTFOLIO)]
    days = _window_days(window)
    cache_key = f"digest:{','.join(symbols)}:{window}:{include_volume}"
    now = time.time()
    hit = _DIGEST_CACHE.get(cache_key)
    if hit and now - hit[0] < 90:
        return hit[1]

    from concurrent.futures import ThreadPoolExecutor, as_completed

    filings: list[dict] = []
    lookback = max(days, 10)
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(fetch_symbol_announcements, sym, lookback): sym for sym in symbols}
        for fut in as_completed(futs):
            try:
                filings.extend(fut.result())
            except Exception:
                continue

    # Keep items inside window roughly by sort_date
    cutoff = datetime.now() - timedelta(days=days)
    filtered = []
    for f in filings:
        sd = f.get("sort_date") or ""
        try:
            dt = datetime.strptime(sd[:19], "%Y-%m-%d %H:%M:%S")
        except Exception:
            try:
                dt = datetime.strptime(sd[:16], "%d-%b-%Y %H:%M")
            except Exception:
                dt = datetime.now()
        if dt >= cutoff - timedelta(hours=6):
            filtered.append(f)

    # Volume / price alerts from live quotes
    alerts: list[dict] = []
    if include_volume:
        try:
            q = fetch_quotes(symbols)
            for sym in symbols:
                row = q.get("quotes", {}).get(sym) or {}
                chg = float(row.get("change_pct") or 0)
                if abs(chg) >= 2.0:
                    alerts.append(
                        {
                            "id": f"px-{sym}-{int(now)//3600}",
                            "ticker": sym,
                            "company": sym,
                            "category": "press_release",
                            "priority": "critical" if abs(chg) >= 3 else "high",
                            "title": f"Price {chg:+.1f}% today",
                            "summary": f"{sym} moved {chg:+.1f}% vs previous close (live market).",
                            "whyItMatters": "Sharp day moves often precede guidance, results, or sector shocks — open the filing tape.",
                            "time": datetime.now().strftime("%d-%b-%Y %H:%M"),
                            "kind": "price",
                            "badge": "Price alert",
                            "source": "market",
                            "attachment": None,
                            "sort_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        }
                    )
        except Exception:
            pass

    items = alerts + filtered
    rank = {"critical": 0, "high": 1, "watch": 2, "routine": 3}
    items.sort(key=lambda x: (rank.get(x.get("priority", "routine"), 9), x.get("sort_date") or ""), reverse=False)
    # secondary sort by date desc within priority
    items.sort(key=lambda x: rank.get(x.get("priority", "routine"), 9))
    items_by_date = sorted(items, key=lambda x: x.get("sort_date") or "", reverse=True)
    # stable: priority first, then recency
    items_by_date.sort(key=lambda x: (rank.get(x.get("priority", "routine"), 9),))

    important = [i for i in items_by_date if i.get("priority") in ("critical", "high")]
    rest = [i for i in items_by_date if i.get("priority") not in ("critical", "high")]

    payload = {
        "window": window,
        "as_of": datetime.now().isoformat(timespec="seconds"),
        "count": len(items_by_date),
        "important": important[:40],
        "routine": rest[:40],
        "items": (important + rest)[:60],
        "disclaimer": "Filings from NSE corporate announcements. Prioritisation by FINN rules.",
        "source": "nse",
    }
    _DIGEST_CACHE[cache_key] = (now, payload)
    return payload


def get_filing(filing_id: str, tickers: list[str] | None = None) -> dict | None:
    dig = build_digest(tickers=tickers, window="7d")
    for item in dig.get("items", []):
        if item.get("id") == filing_id:
            return item
    # broader search
    for sym in tickers or DEFAULT_PORTFOLIO:
        for item in fetch_symbol_announcements(sym, days=30):
            if item.get("id") == filing_id:
                return item
    return None
