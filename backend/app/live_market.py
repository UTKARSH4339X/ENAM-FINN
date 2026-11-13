"""Real NSE/BSE market data via Moneycontrol (+ NSE indices backup).

Clears proxy env so quotes are not blocked. No fake price wobble on live prints.
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Iterable
from urllib.parse import quote

import httpx

from .universe import lookup, resolve_symbol, yahoo_symbol

# Avoid corporate/proxy tunnels that break market hosts
for _k in list(os.environ):
    if "proxy" in _k.lower():
        os.environ.pop(_k, None)

UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
)
HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.moneycontrol.com/",
}

# Moneycontrol index feed keys
INDEX_FEED = {
    "NIFTY": "in%3BNSX",
    "SENSEX": "in%3BSEN",
    "BANKNIFTY": "in%3Bnbx",
    "FINNIFTY": "in%3BNSX",  # closest available feed fallback
    "MIDCPNIFTY": "in%3BNSX",
}

INDEX_HISTORY = {
    "NIFTY": "in%3BNSX",
    "SENSEX": "in%3BSEN",
    "BANKNIFTY": "in%3Bnbx",
}

_CACHE_DIR = Path(__file__).resolve().parent / "data"
_SCID_PATH = _CACHE_DIR / "mc_scid.json"
_QUOTE_TTL = 4.0
_HIST_TTL = 45.0
_quote_cache: dict[str, tuple[float, dict]] = {}
_hist_cache: dict[str, tuple[float, dict]] = {}
_scid_map: dict[str, str] | None = None

# Seed common NSE symbols → Moneycontrol sc_id (from autosuggest)
SEED_SCID = {
    "RELIANCE": "RI",
    "TCS": "TCS",
    "INFY": "IT",
    "HDFCBANK": "HDF01",
    "ICICIBANK": "ICI02",
    "SBIN": "SBI",
    "ITC": "ITC",
    "BHARTIARTL": "BA08",
    "LT": "LT",
    "AXISBANK": "UTI10",
    "KOTAKBANK": "KKB",
    "HINDUNILVR": "HU",
    "BAJFINANCE": "BAF",
    "MARUTI": "MU01",
    "ASIANPAINT": "API",
    "SUNPHARMA": "SPI",
    "TITAN": "TI01",
    "WIPRO": "W",
    "NTPC": "NTP",
    "POWERGRID": "PGC",
    "ONGC": "ONG",
    "TATAMOTORS": "TM03",
    "TATASTEEL": "TIS",
    "JSWSTEEL": "JSW01",
    "ADANIENT": "AE01",
    "ADANIPORTS": "AMS",
    "COALINDIA": "CI29",
    "HCLTECH": "HCL02",
    "TECHM": "TM04",
    "M&M": "MM",
    "ULTRACEMCO": "UTC",
    "NESTLEIND": "NI",
    "BAJAJ-AUTO": "BA10",
    "HEROMOTOCO": "HHM",
    "INDUSINDBK": "IIB",
    "DRREDDY": "DRL",
    "CIPLA": "C",
    "DIVISLAB": "DL03",
    "BPCL": "BPC",
    "IOC": "IOC",
    "ZOMATO": "Z",
    "DMART": "AS19",
    "TRENT": "T04",
    "INDIGO": "IE01",
    "BEL": "BE03",
    "HAL": "HA04",
    "JIOFIN": "JF01",
    "SWIGGY": "S",
}


def _client() -> httpx.Client:
    return httpx.Client(headers=HEADERS, timeout=12.0, follow_redirects=True)


def _load_scid() -> dict[str, str]:
    global _scid_map
    if _scid_map is not None:
        return _scid_map
    data = dict(SEED_SCID)
    if _SCID_PATH.exists():
        try:
            data.update(json.loads(_SCID_PATH.read_text()))
        except Exception:
            pass
    _scid_map = data
    return data


def _save_scid() -> None:
    if _scid_map is None:
        return
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _SCID_PATH.write_text(json.dumps(_scid_map, indent=0, sort_keys=True))


def resolve_scid(ticker: str) -> str | None:
    sym = resolve_symbol(ticker).upper()
    if sym in INDEX_FEED:
        return None
    m = _load_scid()
    if sym in m:
        return m[sym]
    # Autosuggest
    try:
        with _client() as c:
            r = c.get(
                "https://www.moneycontrol.com/mccode/common/autosuggestion_solr.php",
                params={"classic": "true", "query": sym, "type": "1", "format": "json"},
            )
            if r.status_code != 200:
                return None
            arr = r.json()
            if not isinstance(arr, list):
                return None
            for item in arr:
                sc = item.get("sc_id")
                if not sc:
                    continue
                blob = f"{item.get('pdt_dis_nm','')} {item.get('link_src','')}".upper()
                # Prefer exact NSE symbol match in suggestion text
                if re.search(rf"\b{re.escape(sym)}\b", blob) or item.get("stock_name", "").upper().startswith(sym):
                    m[sym] = sc
                    _save_scid()
                    return sc
            # fallback first with sc_id
            for item in arr:
                if item.get("sc_id"):
                    m[sym] = item["sc_id"]
                    _save_scid()
                    return item["sc_id"]
    except Exception:
        return None
    return None


def _parse_mc_equity(data: dict, ticker: str) -> dict:
    price = float(data.get("pricecurrent") or 0)
    prev = float(data.get("priceprevclose") or price or 1)
    chg = float(data.get("pricepercentchange") or 0)
    if not chg and prev:
        chg = ((price - prev) / prev) * 100
    return {
        "ticker": ticker,
        "price": round(price, 2),
        "change_pct": round(chg, 2),
        "prev_close": round(prev, 2),
        "open": float(data.get("OPN") or 0) or None,
        "high": float(data.get("HG") or data.get("HIGH") or 0) or None,
        "low": float(data.get("LW") or data.get("LOW") or 0) or None,
        "volume": data.get("VOL") or data.get("volume"),
        "source": "moneycontrol",
        "as_of": data.get("lastupd") or time.strftime("%Y-%m-%d %H:%M:%S"),
        "live": True,
    }


def _parse_mc_index(data: dict, ticker: str) -> dict:
    price = float(data.get("pricecurrent") or data.get("lastprice") or 0)
    prev = float(data.get("priceprevclose") or price or 1)
    chg = float(data.get("pricepercentchange") or 0)
    if not chg and prev:
        chg = ((price - prev) / prev) * 100
    return {
        "ticker": ticker,
        "price": round(price, 2),
        "change_pct": round(chg, 2),
        "prev_close": round(prev, 2),
        "open": float(data.get("OPEN") or 0) or None,
        "high": float(data.get("HIGH") or 0) or None,
        "low": float(data.get("LOW") or 0) or None,
        "source": "moneycontrol",
        "as_of": data.get("lastupd") or time.strftime("%Y-%m-%d %H:%M:%S"),
        "live": True,
    }


def _nse_index_quote(ticker: str) -> dict | None:
    """Backup: NSE allIndices (works reliably for Nifty family)."""
    name_map = {
        "NIFTY": "NIFTY 50",
        "BANKNIFTY": "NIFTY BANK",
        "FINNIFTY": "NIFTY FINANCIAL SERVICES",
        "MIDCPNIFTY": "NIFTY MIDCAP SELECT",
        "INDIAVIX": "INDIA VIX",
        "SENSEX": None,  # BSE — not on NSE list
    }
    want = name_map.get(ticker)
    if not want:
        return None
    try:
        h = {
            **HEADERS,
            "Referer": "https://www.nseindia.com/market-data/live-market-indices",
        }
        with httpx.Client(headers=h, timeout=12.0, follow_redirects=True) as c:
            r = c.get("https://www.nseindia.com/api/allIndices")
            if r.status_code != 200:
                return None
            for row in r.json().get("data", []):
                if (row.get("index") or "").upper() == want.upper() or (
                    row.get("indexSymbol") or ""
                ).upper() == want.upper():
                    price = float(row.get("last") or 0)
                    chg = float(row.get("percentChange") or 0)
                    return {
                        "ticker": ticker,
                        "price": round(price, 2),
                        "change_pct": round(chg, 2),
                        "prev_close": float(row.get("previousClose") or 0) or None,
                        "open": float(row.get("open") or 0) or None,
                        "high": float(row.get("high") or 0) or None,
                        "low": float(row.get("low") or 0) or None,
                        "source": "nseindia",
                        "as_of": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "live": True,
                    }
    except Exception:
        return None
    return None


def fetch_live_quote(ticker: str) -> dict | None:
    sym = resolve_symbol(ticker).upper()
    # Prefer index keys by typed name too
    raw = ticker.upper().strip()
    if raw in ("NIFTY50", "NIFTY 50"):
        sym = "NIFTY"
    if raw in ("BSESENSEX",):
        sym = "SENSEX"

    now = time.time()
    cached = _quote_cache.get(sym)
    if cached and now - cached[0] < _QUOTE_TTL:
        return cached[1]

    quote = None
    try:
        with _client() as c:
            if sym in INDEX_FEED:
                feed = INDEX_FEED[sym]
                r = c.get(
                    f"https://priceapi.moneycontrol.com/pricefeed/notapplicable/inidicesindia/{feed}"
                )
                if r.status_code == 200:
                    body = r.json()
                    if body.get("code") == "200" and body.get("data"):
                        quote = _parse_mc_index(body["data"], sym)
                if not quote:
                    quote = _nse_index_quote(sym)
            else:
                scid = resolve_scid(sym)
                if scid:
                    r = c.get(f"https://priceapi.moneycontrol.com/pricefeed/nse/equitycash/{scid}")
                    if r.status_code == 200:
                        body = r.json()
                        if body.get("code") == "200" and body.get("data"):
                            quote = _parse_mc_equity(body["data"], sym)
                    # BSE feed fallback
                    if not quote:
                        r = c.get(f"https://priceapi.moneycontrol.com/pricefeed/bse/equitycash/{scid}")
                        if r.status_code == 200:
                            body = r.json()
                            if body.get("code") == "200" and body.get("data"):
                                quote = _parse_mc_equity(body["data"], sym)
                                quote["source"] = "moneycontrol_bse"
    except Exception:
        quote = None

    if not quote and sym in INDEX_FEED:
        quote = _nse_index_quote(sym)

    if quote and quote.get("price"):
        _quote_cache[sym] = (now, quote)
    return quote


def fetch_history(ticker: str, days: int = 120) -> dict | None:
    """OHLC candles from Moneycontrol techCharts (real market)."""
    sym = resolve_symbol(ticker).upper()
    raw = ticker.upper().strip()
    if raw in ("NIFTY50", "NIFTY 50"):
        sym = "NIFTY"
    now = time.time()
    cached = _hist_cache.get(sym)
    if cached and now - cached[0] < _HIST_TTL:
        return cached[1]

    to_ts = int(now)
    from_ts = to_ts - days * 86400 - 5 * 86400
    if sym in INDEX_HISTORY:
        symbol = INDEX_HISTORY[sym]
        path = "index"
    else:
        symbol = quote(sym, safe="")
        path = "stock"

    url = (
        f"https://priceapi.moneycontrol.com/techCharts/indianMarket/{path}/history"
        f"?symbol={symbol}&resolution=D&from={from_ts}&to={to_ts}&countback={days}&currencyCode=INR"
    )
    try:
        with _client() as c:
            r = c.get(url)
            if r.status_code != 200:
                return None
            body = r.json()
            if body.get("s") != "ok":
                return None
            ts = body.get("t") or []
            o = body.get("o") or []
            h = body.get("h") or []
            l = body.get("l") or []
            cl = body.get("c") or []
            v = body.get("v") or [0] * len(ts)
            candles = []
            for i in range(len(ts)):
                candles.append(
                    {
                        "t": time.strftime("%Y-%m-%d", time.gmtime(int(ts[i]))),
                        "o": round(float(o[i]), 2),
                        "h": round(float(h[i]), 2),
                        "l": round(float(l[i]), 2),
                        "c": round(float(cl[i]), 2),
                        "v": int(float(v[i])) if i < len(v) else 0,
                    }
                )
            if len(candles) < 5:
                return None
            payload = {"candles": candles, "source": "moneycontrol", "live": True}
            _hist_cache[sym] = (now, payload)
            return payload
    except Exception:
        return None


def fetch_quotes_live(tickers: Iterable[str]) -> dict:
    out: dict[str, dict] = {}
    live = False
    errors: list[str] = []
    for t in tickers:
        sym = resolve_symbol(t).upper()
        q = fetch_live_quote(sym)
        if q and q.get("price"):
            live = True
            spark = []
            hist = fetch_history(sym, days=40)
            if hist:
                spark = [c["c"] for c in hist["candles"][-24:]]
            out[sym] = {
                "ticker": sym,
                "price": q["price"],
                "change_pct": q["change_pct"],
                "source": q["source"],
                "symbol": yahoo_symbol(sym)[0] if yahoo_symbol(sym) else sym,
                "spark": spark,
                "as_of": q.get("as_of"),
            }
        else:
            errors.append(sym)
            meta = lookup(sym) or {}
            out[sym] = {
                "ticker": sym,
                "price": 0.0,
                "change_pct": 0.0,
                "source": "unavailable",
                "symbol": sym,
                "spark": [],
            }

    return {
        "live": live,
        "error": (",".join(errors) if errors and not live else None),
        "quotes": out,
        "as_of": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "disclaimer": "Live NSE/BSE quotes from Moneycontrol / NSE public feeds.",
    }
