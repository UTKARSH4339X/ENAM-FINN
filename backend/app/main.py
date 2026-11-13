from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .analysis import analyze_ticker
from .ask import answer_question
from .db import connect, init_db
from .filings import DEFAULT_PORTFOLIO, build_digest, get_filing
from .market import fetch_quotes
from .mock_broker import broker_snapshot, MOCK_HOLDINGS
from .research_primary import scrape_screener
from .universe import search_universe, universe_stats

app = FastAPI(
    title="FINN API",
    description="Read-only portfolio intelligence API with live NSE quotes.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RecommendationIn(BaseModel):
    ticker: str
    action: str
    entry_price: float
    thesis: str
    notes: Optional[str] = None


class CloseRecommendationIn(BaseModel):
    exit_price: float
    notes: Optional[str] = None


class QuotesIn(BaseModel):
    tickers: List[str] = Field(default_factory=list)


class AskIn(BaseModel):
    question: str = ""
    tickers: List[str] = Field(default_factory=list)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health():
    return {"ok": True, "service": "finn-api", "mode": "live_quotes"}


@app.get("/broker/snapshot")
def get_broker_snapshot():
    snap = broker_snapshot()
    quotes = fetch_quotes([h["ticker"] for h in snap["holdings"]])
    enriched = []
    for h in snap["holdings"]:
        q = quotes["quotes"].get(h["ticker"], {})
        price = float(q.get("price") or h["avg_price"])
        market_value = price * h["qty"]
        invested = h["avg_price"] * h["qty"]
        enriched.append(
            {
                **h,
                "last_price": price,
                "change_pct": q.get("change_pct", 0.0),
                "market_value": round(market_value, 2),
                "invested": round(invested, 2),
                "unrealized_pnl": round(market_value - invested, 2),
                "unrealized_pnl_pct": round(((price - h["avg_price"]) / h["avg_price"]) * 100, 2)
                if h["avg_price"]
                else 0.0,
                "quote_source": q.get("source", "unknown"),
            }
        )
    total_mv = sum(x["market_value"] for x in enriched)
    total_inv = sum(x["invested"] for x in enriched)
    return {
        **snap,
        "holdings": enriched,
        "totals": {
            "market_value": round(total_mv, 2),
            "invested": round(total_inv, 2),
            "unrealized_pnl": round(total_mv - total_inv, 2),
        },
        "quotes_meta": {"live": quotes["live"], "error": quotes["error"]},
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/market/quotes")
def post_quotes(body: QuotesIn):
    tickers = body.tickers or [h["ticker"] for h in MOCK_HOLDINGS]
    return fetch_quotes(tickers)


@app.get("/market/quotes")
def get_quotes(tickers: str = ""):
    parsed = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not parsed:
        parsed = [h["ticker"] for h in MOCK_HOLDINGS]
    return fetch_quotes(parsed)


@app.get("/market/search")
def market_search(
    q: str = "",
    limit: int = 80,
    offset: int = 0,
    listing: str = "",
    exchange: str = "",
):
    filt = listing.strip().lower() or None
    if filt not in (None, "ipo", "index"):
        filt = None
    ex = exchange.strip().upper() or None
    if ex not in (None, "NSE", "BSE"):
        ex = None
    capped = max(1, min(int(limit or 80), 3000))
    off = max(0, int(offset or 0))
    results = search_universe(q, limit=capped, listing=filt, exchange=ex, offset=off)
    stats = universe_stats()
    return {
        "query": q,
        "listing": filt,
        "exchange": ex,
        "limit": capped,
        "offset": off,
        "count": len(results),
        "universe": stats,
        "results": results,
    }


@app.get("/market/analysis/{ticker}")
def market_analysis(ticker: str):
    return analyze_ticker(ticker)


@app.get("/push/digest")
def push_digest(window: str = "24h", tickers: str = ""):
    """ENAM Push: prioritized NSE filings + price alerts for the book."""
    parsed = [t.strip().upper() for t in tickers.split(",") if t.strip()] or DEFAULT_PORTFOLIO
    return build_digest(tickers=parsed, window=window)


@app.get("/filings/{filing_id}")
def filing_detail(filing_id: str, tickers: str = ""):
    parsed = [t.strip().upper() for t in tickers.split(",") if t.strip()] or None
    item = get_filing(filing_id, tickers=parsed)
    if not item:
        raise HTTPException(status_code=404, detail="Filing not found")
    return item


@app.get("/research/{ticker}/primary")
def research_primary(ticker: str):
    """ENAM Pull: primary-source research (screener filings / AR / transcripts)."""
    return scrape_screener(ticker)


@app.post("/ask")
def ask_finn(body: AskIn):
    """ENAM Pull helper: short answers grounded in filings + primary sources."""
    tickers = [t.strip().upper() for t in body.tickers if t.strip()] or None
    return answer_question(body.question, tickers=tickers)


@app.post("/portfolio/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    """Accept CSV with columns: ticker,qty,avg_price[,name]

    Replaces previous uploaded holdings. Does not touch mock broker book.
    """
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"CSV must be UTF-8: {exc}") from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="Empty CSV")

    fields = {f.lower().strip(): f for f in reader.fieldnames}
    required = ["ticker", "qty", "avg_price"]
    for req in required:
        if req not in fields:
            raise HTTPException(
                status_code=400,
                detail=f"Missing column '{req}'. Expected ticker,qty,avg_price[,name]",
            )

    rows = []
    now = datetime.now(timezone.utc).isoformat()
    for row in reader:
        ticker = str(row[fields["ticker"]]).strip().upper()
        if not ticker:
            continue
        try:
            qty = float(row[fields["qty"]])
            avg_price = float(row[fields["avg_price"]])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Bad number for {ticker}") from exc
        name = row[fields["name"]].strip() if "name" in fields and row.get(fields["name"]) else ticker
        rows.append((ticker, name, qty, avg_price, now))

    if not rows:
        raise HTTPException(status_code=400, detail="No holdings parsed")

    with connect() as conn:
        conn.execute("DELETE FROM uploaded_holdings")
        conn.executemany(
            """
            INSERT INTO uploaded_holdings (ticker, name, qty, avg_price, source, uploaded_at)
            VALUES (?, ?, ?, ?, 'csv', ?)
            """,
            rows,
        )

    return {
        "ok": True,
        "count": len(rows),
        "holdings": [
            {"ticker": t, "name": n, "qty": q, "avg_price": a, "uploaded_at": ts}
            for t, n, q, a, ts in rows
        ],
        "disclaimer": "CSV holdings stored locally. Not a broker sync.",
    }


@app.get("/portfolio/uploaded")
def get_uploaded():
    with connect() as conn:
        rows = conn.execute(
            "SELECT ticker, name, qty, avg_price, source, uploaded_at FROM uploaded_holdings ORDER BY id"
        ).fetchall()
    holdings = [dict(r) for r in rows]
    tickers = [h["ticker"] for h in holdings]
    quotes = fetch_quotes(tickers) if tickers else {"quotes": {}, "live": False, "error": None}
    enriched = []
    for h in holdings:
        q = quotes["quotes"].get(h["ticker"], {})
        price = float(q.get("price") or h["avg_price"])
        mv = price * h["qty"]
        inv = h["avg_price"] * h["qty"]
        enriched.append(
            {
                **h,
                "last_price": price,
                "change_pct": q.get("change_pct", 0.0),
                "market_value": round(mv, 2),
                "invested": round(inv, 2),
                "unrealized_pnl": round(mv - inv, 2),
            }
        )
    return {
        "holdings": enriched,
        "count": len(enriched),
        "quotes_meta": {"live": quotes.get("live"), "error": quotes.get("error")},
    }


@app.post("/recommendations")
def create_recommendation(body: RecommendationIn):
    now = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO recommendations (ticker, action, entry_price, thesis, created_at, status, notes)
            VALUES (?, ?, ?, ?, ?, 'open', ?)
            """,
            (
                body.ticker.upper(),
                body.action.upper(),
                body.entry_price,
                body.thesis,
                now,
                body.notes,
            ),
        )
        rid = cur.lastrowid
    return {"ok": True, "id": rid, "created_at": now}


@app.get("/recommendations")
def list_recommendations(status: Optional[str] = None):
    with connect() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM recommendations WHERE status = ? ORDER BY id DESC",
                (status,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM recommendations ORDER BY id DESC").fetchall()

    items = []
    open_tickers = [r["ticker"] for r in rows if r["status"] == "open"]
    quotes = fetch_quotes(open_tickers) if open_tickers else {"quotes": {}}
    wins = 0
    closed = 0
    for r in rows:
        item = dict(r)
        if r["status"] == "open":
            q = quotes["quotes"].get(r["ticker"], {})
            last = float(q.get("price") or r["entry_price"])
            item["mark_price"] = last
            item["unrealized_pct"] = round(((last - r["entry_price"]) / r["entry_price"]) * 100, 2)
        else:
            closed += 1
            if r["exit_price"] is not None:
                pnl_pct = ((r["exit_price"] - r["entry_price"]) / r["entry_price"]) * 100
                item["realized_pct"] = round(pnl_pct, 2)
                # For REDUCE/SELL, lower price can be "win" depending on action — keep simple long bias for BUY/HOLD
                if r["action"] in ("BUY", "HOLD", "WAIT"):
                    if pnl_pct > 0:
                        wins += 1
                elif r["action"] in ("SELL", "REDUCE", "AVOID"):
                    if pnl_pct < 0:
                        wins += 1
        items.append(item)

    return {
        "items": items,
        "stats": {
            "open": sum(1 for i in items if i["status"] == "open"),
            "closed": closed,
            "win_rate_closed": round((wins / closed) * 100, 1) if closed else None,
        },
        "disclaimer": "Paper tracking of FINN recommendations. Not live brokerage P&L.",
    }


@app.post("/recommendations/{rec_id}/close")
def close_recommendation(rec_id: int, body: CloseRecommendationIn):
    now = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        row = conn.execute("SELECT * FROM recommendations WHERE id = ?", (rec_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if row["status"] != "open":
            raise HTTPException(status_code=400, detail="Already closed")
        conn.execute(
            """
            UPDATE recommendations
            SET status = 'closed', exit_price = ?, closed_at = ?, notes = COALESCE(?, notes)
            WHERE id = ?
            """,
            (body.exit_price, now, body.notes, rec_id),
        )
    return {"ok": True, "id": rec_id, "closed_at": now}
