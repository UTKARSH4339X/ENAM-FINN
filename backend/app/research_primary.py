"""Primary-source company research from screener.in (AR + transcripts + filings tables).

ENAM discipline: ground Pull in annual reports / concalls / company financials —
not broker notes or news.
"""

from __future__ import annotations

import os
import re
import time
from html import unescape
from typing import Any

import httpx

from .universe import lookup, resolve_symbol

for _k in list(os.environ):
    if "proxy" in _k.lower():
        os.environ.pop(_k, None)

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 600.0


def _strip(html: str) -> str:
    t = re.sub(r"<[^>]+>", " ", html)
    t = unescape(t)
    t = t.replace("\xa0", " ").replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", t).strip()


def _num(cell: str) -> float | None:
    s = cell.replace(",", "").replace("%", "").replace("+", "").strip()
    if not s or s in {"-", "—"}:
        return None
    try:
        return float(s)
    except Exception:
        return None


def _parse_table(html: str, table_id: str) -> tuple[list[str], dict[str, list[str]]]:
    sec = re.search(rf'id="{table_id}"([\s\S]*?)</section>', html)
    if not sec:
        # fallback: id on table parent
        sec = re.search(rf'id="{table_id}"[\s\S]*?<table[\s\S]*?</table>', html)
        if not sec:
            return [], {}
        blob = sec.group(0)
    else:
        blob = sec.group(1)
    table = re.search(r"<table[\s\S]*?</table>", blob)
    if not table:
        return [], {}
    t = table.group(0)
    headers = [_strip(h) for h in re.findall(r"<th[^>]*>([\s\S]*?)</th>", t)]
    # drop empty first header
    headers = [h for h in headers if h]
    rows: dict[str, list[str]] = {}
    for m in re.finditer(r"<tr[^>]*>([\s\S]*?)</tr>", t):
        cells = [_strip(c) for c in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", m.group(1))]
        if not cells:
            continue
        label = cells[0].replace("\xa0", " ").replace("+", "").strip()
        if not label or label.lower() in {"", "raw pdf"}:
            continue
        rows[label] = cells[1:]
    return headers, rows


def _pick_row(rows: dict[str, list[str]], *names: str) -> list[str] | None:
    for n in names:
        for k, v in rows.items():
            if k.lower().startswith(n.lower()) or n.lower() in k.lower():
                return v
    return None


def _pct_change(cur: float | None, prev: float | None) -> float | None:
    if cur is None or prev is None or prev == 0:
        return None
    return round((cur / prev - 1) * 100, 1)


def scrape_screener(ticker: str) -> dict[str, Any]:
    sym = resolve_symbol(ticker).upper()
    now = time.time()
    cached = _CACHE.get(sym)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    urls = [
        f"https://www.screener.in/company/{sym}/consolidated/",
        f"https://www.screener.in/company/{sym}/",
    ]
    html = ""
    used = ""
    with httpx.Client(
        headers={"User-Agent": UA, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9"},
        timeout=30.0,
        follow_redirects=True,
    ) as c:
        for url in urls:
            try:
                r = c.get(url)
                if r.status_code == 200 and len(r.text) > 5000:
                    html = r.text
                    used = url
                    break
            except Exception:
                continue

    if not html:
        meta = lookup(sym) or {"name": sym}
        payload = {
            "ticker": sym,
            "name": meta.get("name", sym),
            "ok": False,
            "error": "Could not load screener.in primary page",
            "sources": [],
        }
        _CACHE[sym] = (now, payload)
        return payload

    about = ""
    m_about = re.search(
        r'class="company-profile"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)</p>',
        html,
        re.I,
    ) or re.search(r'id="top"[\s\S]*?<p[^>]*>([\s\S]*?)</p>', html, re.I)
    if m_about:
        about = _strip(m_about.group(1))

    # Documents: annual reports + transcripts
    docs = []
    for href, label in re.findall(r'href="([^"]+)"[^>]*>\s*([^<]{2,80})</a>', html):
        lab = _strip(label)
        low = (href + " " + lab).lower()
        kind = None
        if "annual report" in low:
            kind = "annual_report"
        elif "transcript" in low:
            kind = "transcript"
        elif "concall" in low or "earnings" in low:
            kind = "concall"
        if not kind:
            continue
        link = href if href.startswith("http") else f"https://www.screener.in{href}"
        docs.append({"kind": kind, "title": lab, "url": link})

    # de-dupe keep first few of each
    seen = set()
    sources = []
    for d in docs:
        key = (d["kind"], d["url"])
        if key in seen:
            continue
        seen.add(key)
        sources.append(d)

    q_headers, q_rows = _parse_table(html, "quarters")
    y_headers, y_rows = _parse_table(html, "profit-loss")

    sales = _pick_row(q_rows, "Sales")
    op = _pick_row(q_rows, "Operating Profit")
    pbt = _pick_row(q_rows, "Profit before tax")
    pat = _pick_row(q_rows, "Net Profit")
    opm = _pick_row(q_rows, "OPM")
    eps = _pick_row(q_rows, "EPS")

    def last_n(series: list[str] | None, n: int = 5) -> list[float | None]:
        if not series:
            return [None] * n
        vals = [_num(x) for x in series[-n:]]
        while len(vals) < n:
            vals.insert(0, None)
        return vals

    sales_v = last_n(sales)
    op_v = last_n(op)
    pbt_v = last_n(pbt)
    pat_v = last_n(pat)

    # Latest quarter vs prior quarter (QoQ) and vs ~4 quarters ago (YoY)
    def line(label: str, vals: list[float | None]) -> dict:
        cur = vals[-1]
        prev = vals[-2] if len(vals) >= 2 else None
        yoy_base = vals[-5] if len(vals) >= 5 else None
        return {
            "label": label,
            "value": None if cur is None else f"₹{cur:,.0f} Cr",
            "raw": cur,
            "qoq": _pct_change(cur, prev),
            "yoy": _pct_change(cur, yoy_base),
        }

    results = [
        line("Revenue", sales_v),
        line("EBITDA / Operating profit", op_v),
        line("PBT", pbt_v),
        line("PAT", pat_v),
    ]

    # Trajectory from yearly sales/pat if present
    y_sales = last_n(_pick_row(y_rows, "Sales"), 4)
    y_pat = last_n(_pick_row(y_rows, "Net Profit"), 4)
    trajectory = []
    if y_sales[-1] is not None and y_sales[0] is not None and y_sales[0]:
        trajectory.append(
            {
                "metric": "Sales (multi-year)",
                "change_pct": _pct_change(y_sales[-1], y_sales[0]),
                "from": y_sales[0],
                "to": y_sales[-1],
            }
        )
    if y_pat[-1] is not None and y_pat[0] is not None and y_pat[0]:
        trajectory.append(
            {
                "metric": "PAT (multi-year)",
                "change_pct": _pct_change(y_pat[-1], y_pat[0]),
                "from": y_pat[0],
                "to": y_pat[-1],
            }
        )

    # Bull / bear from primary numbers only
    bull_bits = []
    bear_bits = []
    rev = results[0]
    ebitda = results[1]
    net = results[3]
    if rev.get("yoy") is not None and rev["yoy"] > 0:
        bull_bits.append(f"Revenue up {rev['yoy']}% YoY in the latest quarter (company filings via screener).")
    elif rev.get("yoy") is not None and rev["yoy"] < 0:
        bear_bits.append(f"Revenue down {abs(rev['yoy'])}% YoY — top-line pressure in primary prints.")
    if ebitda.get("yoy") is not None and ebitda["yoy"] > 0:
        bull_bits.append(f"Operating profit up {ebitda['yoy']}% YoY.")
    elif ebitda.get("yoy") is not None and ebitda["yoy"] < 0:
        bear_bits.append(f"Operating profit down {abs(ebitda['yoy'])}% YoY.")
    if net.get("qoq") is not None and net["qoq"] > 0:
        bull_bits.append(f"PAT improved {net['qoq']}% QoQ.")
    elif net.get("qoq") is not None and net["qoq"] < 0:
        bear_bits.append(f"PAT slipped {abs(net['qoq'])}% QoQ.")
    if opm:
        latest_opm = opm[-1] if opm else None
        if latest_opm:
            bull_bits.append(f"Latest operating margin print: {latest_opm} (from quarterly filing table).")
    if trajectory:
        for t in trajectory:
            ch = t.get("change_pct")
            if ch is None:
                continue
            if ch >= 0:
                bull_bits.append(f"{t['metric']} expanded ~{ch}% over the recent annual window.")
            else:
                bear_bits.append(f"{t['metric']} compressed ~{abs(ch)}% over the recent annual window.")

    if not bull_bits:
        bull_bits.append("Primary tables do not show a clear positive swing this print — wait for next filing.")
    if not bear_bits:
        bear_bits.append("No sharp deterioration in the latest primary quarter table — risk is still execution / guidance.")

    # Narrative vs numbers (simple, primary-only)
    narrative = []
    if rev.get("yoy") is not None and ebitda.get("yoy") is not None:
        if rev["yoy"] > 0 and ebitda["yoy"] < rev["yoy"] - 5:
            narrative.append(
                "Sales grew faster than operating profit YoY — margin mix needs the next concall transcript."
            )
        elif rev["yoy"] > 0 and ebitda["yoy"] >= rev["yoy"]:
            narrative.append(
                "Operating profit kept pace with or beat sales growth YoY — numbers support an efficiency story."
            )
        elif rev["yoy"] < 0 and ebitda["yoy"] < 0:
            narrative.append(
                "Both sales and operating profit are down YoY in the filing tables — thesis must start from that fact."
            )

    ar = next((s for s in sources if s["kind"] == "annual_report"), None)
    tr = next((s for s in sources if s["kind"] in ("transcript", "concall")), None)

    meta = lookup(sym) or {"name": sym, "sector": "—", "exchange": "NSE"}
    quarters = q_headers[-5:] if q_headers else []

    payload = {
        "ok": True,
        "ticker": sym,
        "name": meta.get("name", sym),
        "exchange": meta.get("exchange", "NSE"),
        "sector": meta.get("sector", "—"),
        "as_of": time.strftime("%Y-%m-%d %H:%M"),
        "page": used,
        "snapshot": about[:500] if about else f"{meta.get('name', sym)} — profile from company disclosures on screener.in.",
        "discipline": "Primary sources only (company filings / AR / transcripts via screener.in). No broker notes.",
        "quarters": quarters,
        "results": results,
        "opm_latest": (opm[-1] if opm else None),
        "eps_latest": (eps[-1] if eps else None),
        "trajectory": trajectory,
        "bull": bull_bits[:4],
        "bear": bear_bits[:4],
        "narrative_vs_numbers": narrative,
        "sources": {
            "annual_report": ar,
            "transcript": tr,
            "all": sources[:12],
        },
        "action_hint": (
            "Keep watching"
            if (rev.get("yoy") or 0) > -2 and (net.get("yoy") or 0) > -5
            else "Dig deeper before adding"
            if (rev.get("yoy") or 0) < 0
            else "Numbers supportive — confirm on transcript"
        ),
        "invalidates": (
            (
                f"Flip to caution if next print shows Revenue YoY turning negative "
                f"(latest {rev.get('yoy'):+.1f}%) or PAT YoY rolling over hard (latest {net.get('yoy'):+.1f}%)."
                if (rev.get("yoy") or 0) >= 0
                else (
                    f"Thesis stays weak unless Revenue YoY recovers (latest {rev.get('yoy'):+.1f}%) "
                    f"and PAT YoY stabilizes (latest {net.get('yoy'):+.1f}%)."
                )
            )
            if rev.get("yoy") is not None and net.get("yoy") is not None
            else (
                bear_bits[0]
                if bear_bits
                else "Thesis weakens if guidance, margins, or cash conversion break for two consecutive prints."
            )
        ),
    }
    _CACHE[sym] = (now, payload)
    return payload
