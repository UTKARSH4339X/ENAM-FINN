"""Ask FINN — short answers grounded in NSE filings + primary research."""

from __future__ import annotations

import re
from datetime import datetime

from .filings import DEFAULT_PORTFOLIO, build_digest
from .research_primary import scrape_screener
from .universe import load_universe, resolve_symbol

_TICKER_RE = re.compile(r"\b([A-Z]{2,12}(?:&[A-Z]+)?)\b")


def _universe_tickers() -> set[str]:
    out: set[str] = set()
    for row in load_universe():
        if row.get("kind") == "index":
            continue
        out.add((row.get("alias") or row["ticker"]).upper())
        out.add(row["ticker"].upper())
    return out


def _detect_tickers(question: str, book: list[str]) -> list[str]:
    q = question.upper()
    found: list[str] = []
    # Prefer book names / common aliases in plain English
    aliases = {
        "INFOSYS": "INFY",
        "RELIANCE": "RELIANCE",
        "ASIAN PAINTS": "ASIANPAINT",
        "ASIANPAINT": "ASIANPAINT",
        "HDFC BANK": "HDFCBANK",
        "HDFC": "HDFCBANK",
        "TCS": "TCS",
        "SBI": "SBIN",
        "ITC": "ITC",
        "TATA STEEL": "TATASTEEL",
    }
    for phrase, sym in aliases.items():
        if phrase in q and sym not in found:
            found.append(sym)

    uni = _universe_tickers()
    for m in _TICKER_RE.findall(q):
        sym = resolve_symbol(m)
        if sym in uni or sym in book:
            if sym not in found:
                found.append(sym)

    # Fallback: if question is about "today" / portfolio, use top digest names later
    return found[:3]


def _short(text: str, n: int = 160) -> str:
    t = re.sub(r"\s+", " ", (text or "")).strip()
    if len(t) <= n:
        return t
    return t[: n - 1].rstrip() + "…"


def answer_question(question: str, tickers: list[str] | None = None) -> dict:
    book = [t.upper() for t in (tickers or DEFAULT_PORTFOLIO)]
    q = (question or "").strip()
    if not q:
        return {
            "ok": False,
            "answer": "Ask about a filing, a stock in your book, or what matters today.",
            "sources": [],
            "tickers": [],
        }

    digest = build_digest(tickers=book, window="3d")
    items = digest.get("items") or []
    important = [i for i in items if i.get("priority") in ("critical", "high")]

    detected = _detect_tickers(q, book)
    ql = q.lower()

    sources: list[dict] = []
    lines: list[str] = []

    # What matters today / portfolio overview
    if not detected and any(
        w in ql for w in ("today", "matter", "important", "digest", "portfolio", "book", "watch")
    ):
        top = (important or items)[:3]
        if not top:
            lines.append("No NSE filings in this window for your book — check Protect for live tape risk.")
        else:
            bits = []
            for it in top:
                bits.append(f"{it.get('ticker')}: {it.get('title')}")
                sources.append(
                    {
                        "kind": "filing",
                        "ticker": it.get("ticker"),
                        "title": it.get("title"),
                        "id": it.get("id"),
                        "url": it.get("attachment"),
                    }
                )
            label = "What needs your eye" if important else "Latest on your book"
            lines.append(f"{label}: " + " · ".join(bits) + ".")
            if top:
                lines.append(_short(top[0].get("whyItMatters") or ""))

    # Filing-focused for detected tickers
    for sym in detected or []:
        related = [i for i in items if i.get("ticker") == sym][:3]
        if related:
            head = related[0]
            lines.append(
                f"{sym} — {head.get('badge') or head.get('category')}: {_short(head.get('title') or '', 120)}."
            )
            lines.append(_short(head.get("whyItMatters") or head.get("summary") or ""))
            sources.append(
                {
                    "kind": "filing",
                    "ticker": sym,
                    "title": head.get("title"),
                    "id": head.get("id"),
                    "url": head.get("attachment"),
                }
            )
        else:
            lines.append(f"No fresh NSE filing hit for {sym} in this window — pull primary research next.")

        # Primary numbers when question smells like results / numbers / thesis
        if any(w in ql for w in ("result", "number", "revenue", "profit", "pat", "ebitda", "quarter", "research", "bull", "bear", "why")) or not related:
            try:
                primary = scrape_screener(sym)
            except Exception:
                primary = {"ok": False}
            if primary.get("ok"):
                res = primary.get("results") or []
                if res:
                    bits = [f"{r.get('label')}: {r.get('value')}" for r in res[:3] if r.get("value")]
                    if bits:
                        lines.append("Latest quarter (company tables): " + "; ".join(bits) + ".")
                bull = (primary.get("bull") or [])[:1]
                bear = (primary.get("bear") or [])[:1]
                if bull:
                    lines.append("Bull: " + bull[0])
                if bear:
                    lines.append("Bear: " + bear[0])
                if primary.get("sources", {}).get("annual_report"):
                    ar = primary["sources"]["annual_report"]
                    sources.append({"kind": "annual_report", "ticker": sym, "title": ar.get("title"), "url": ar.get("url")})
                if primary.get("sources", {}).get("transcript"):
                    tr = primary["sources"]["transcript"]
                    sources.append({"kind": "transcript", "ticker": sym, "title": tr.get("title"), "url": tr.get("url")})
                if primary.get("page"):
                    sources.append({"kind": "screener", "ticker": sym, "title": "Filings page", "url": primary["page"]})

    if not lines:
        # Generic grounded fallback from digest
        if important:
            it = important[0]
            lines.append(
                f"Start with {it.get('ticker')}: {_short(it.get('title') or '')}. {_short(it.get('whyItMatters') or '')}"
            )
            sources.append(
                {
                    "kind": "filing",
                    "ticker": it.get("ticker"),
                    "title": it.get("title"),
                    "id": it.get("id"),
                    "url": it.get("attachment"),
                }
            )
        else:
            lines.append(
                "I use your NSE filing tape and company tables. Ask about a ticker (e.g. INFY results) or what matters today."
            )

    answer = " ".join(x for x in lines if x).strip()
    return {
        "ok": True,
        "answer": answer,
        "tickers": detected,
        "sources": sources[:8],
        "as_of": datetime.now().isoformat(timespec="seconds"),
        "discipline": "Grounded in NSE filings and primary company disclosures when available.",
    }
