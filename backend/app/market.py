from __future__ import annotations

from typing import Iterable

from .live_market import fetch_quotes_live
from .universe import resolve_symbol


def to_yahoo(ticker: str) -> str:
    t = resolve_symbol(ticker).upper().replace(".NS", "").replace(".BO", "")
    return f"{t}.NS"


def fetch_quotes(tickers: Iterable[str]) -> dict:
    """Real-time quotes — Moneycontrol / NSE (no simulated wobble)."""
    symbols = [resolve_symbol(t).upper() for t in tickers]
    # Map typed NIFTY50 etc
    normalized = []
    for s in symbols:
        if s in ("NIFTY50", "NIFTY_50"):
            normalized.append("NIFTY")
        elif s in ("BSESENSEX",):
            normalized.append("SENSEX")
        else:
            normalized.append(s)
    return fetch_quotes_live(normalized)


def default_universe_quotes() -> dict:
    return fetch_quotes(
        ["NIFTY", "SENSEX", "RELIANCE", "TCS", "HDFCBANK", "INFY", "SBIN", "ITC"]
    )
