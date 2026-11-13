"""OHLC history + technical indicators + visual buy/sell signal."""

from __future__ import annotations

import hashlib
import math
import time
from typing import Any

from .live_market import fetch_history, fetch_live_quote
from .universe import lookup, resolve_symbol, yahoo_symbol

_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 5.0


def _seed(ticker: str) -> int:
    return int(hashlib.md5(ticker.encode()).hexdigest()[:8], 16)


def _sma(vals: list[float], n: int) -> list[float | None]:
    out: list[float | None] = [None] * len(vals)
    if n <= 0:
        return out
    s = 0.0
    for i, v in enumerate(vals):
        s += v
        if i >= n:
            s -= vals[i - n]
        if i >= n - 1:
            out[i] = round(s / n, 2)
    return out


def _ema(vals: list[float], n: int) -> list[float | None]:
    out: list[float | None] = [None] * len(vals)
    if not vals or n <= 0:
        return out
    k = 2 / (n + 1)
    ema = vals[0]
    for i, v in enumerate(vals):
        ema = v if i == 0 else v * k + ema * (1 - k)
        out[i] = round(ema, 2) if i >= n - 1 else None
    return out


def _rsi(closes: list[float], n: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(closes)
    if len(closes) < n + 1:
        return out
    gains = 0.0
    losses = 0.0
    for i in range(1, n + 1):
        d = closes[i] - closes[i - 1]
        if d >= 0:
            gains += d
        else:
            losses -= d
    avg_g = gains / n
    avg_l = losses / n
    rs = avg_g / avg_l if avg_l else 100.0
    out[n] = round(100 - (100 / (1 + rs)), 2)
    for i in range(n + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        g = max(d, 0.0)
        l = max(-d, 0.0)
        avg_g = (avg_g * (n - 1) + g) / n
        avg_l = (avg_l * (n - 1) + l) / n
        rs = avg_g / avg_l if avg_l else 100.0
        out[i] = round(100 - (100 / (1 + rs)), 2)
    return out


def _macd(closes: list[float]) -> tuple[list[float | None], list[float | None], list[float | None]]:
    ema12 = _ema(closes, 12)
    ema26 = _ema(closes, 26)
    line: list[float | None] = [None] * len(closes)
    for i in range(len(closes)):
        if ema12[i] is not None and ema26[i] is not None:
            line[i] = round(ema12[i] - ema26[i], 3)  # type: ignore[operator]
    # Signal = EMA9 of MACD line (skip Nones by carrying)
    signal: list[float | None] = [None] * len(closes)
    hist: list[float | None] = [None] * len(closes)
    vals = [x for x in line if x is not None]
    if len(vals) < 9:
        return line, signal, hist
    k = 2 / 10
    # Align signal to indices where line exists
    first = next(i for i, x in enumerate(line) if x is not None)
    ema = line[first]
    count = 0
    for i in range(first, len(closes)):
        if line[i] is None:
            continue
        count += 1
        ema = line[i] if count == 1 else line[i] * k + ema * (1 - k)  # type: ignore[operator]
        if count >= 9:
            signal[i] = round(ema, 3)  # type: ignore[arg-type]
            hist[i] = round(line[i] - signal[i], 3)  # type: ignore[operator]
    return line, signal, hist


def _bollinger(closes: list[float], n: int = 20) -> tuple[list[float | None], list[float | None], list[float | None]]:
    mid = _sma(closes, n)
    upper: list[float | None] = [None] * len(closes)
    lower: list[float | None] = [None] * len(closes)
    for i in range(n - 1, len(closes)):
        window = closes[i - n + 1 : i + 1]
        mean = sum(window) / n
        var = sum((x - mean) ** 2 for x in window) / n
        sd = math.sqrt(var)
        upper[i] = round(mean + 2 * sd, 2)
        lower[i] = round(mean - 2 * sd, 2)
    return upper, mid, lower


def _pattern(o: float, h: float, l: float, c: float, prev_o: float | None, prev_c: float | None) -> str | None:
    body = abs(c - o)
    full = max(h - l, 1e-9)
    upper = h - max(o, c)
    lower = min(o, c) - l
    # Hammer / hanging man
    if lower >= 2 * body and upper <= body * 0.35 and body / full < 0.35:
        return "hammer" if c >= o else "hanging"
    # Inverted hammer / shooting star
    if upper >= 2 * body and lower <= body * 0.35 and body / full < 0.35:
        return "inv_hammer" if c >= o else "shooting"
    # Doji
    if body / full < 0.08:
        return "doji"
    # Engulfing
    if prev_o is not None and prev_c is not None:
        prev_body = abs(prev_c - prev_o)
        if c > o and prev_c < prev_o and c >= prev_o and o <= prev_c and body > prev_body:
            return "bull_engulf"
        if c < o and prev_c > prev_o and c <= prev_o and o >= prev_c and body > prev_body:
            return "bear_engulf"
    return None


# Plain labels only — no chart jargon shown to users
PATTERN_META = {
    "hammer": {"label": "Buy", "bias": "buy", "hint": "Buyers stepping in"},
    "inv_hammer": {"label": "Buy", "bias": "buy", "hint": "May turn up"},
    "bull_engulf": {"label": "Buy", "bias": "buy", "hint": "Strong up day"},
    "hanging": {"label": "Sell", "bias": "sell", "hint": "Be careful"},
    "shooting": {"label": "Sell", "bias": "sell", "hint": "Sellers in control"},
    "bear_engulf": {"label": "Sell", "bias": "sell", "hint": "Strong down day"},
    "doji": {"label": "Keep", "bias": "wait", "hint": "Market unsure"},
}


def _synthetic_ohlc(ticker: str, days: int = 90) -> list[dict]:
    h = _seed(ticker)
    price = 400 + (h % 9000) / 10
    rows = []
    t0 = int(time.time()) - days * 86400
    for i in range(days):
        h = (h * 1664525 + 1013904223) & 0xFFFFFFFF
        drift = math.sin(i / 9 + (h % 7)) * 0.012 + ((h % 100) - 50) / 9000
        o = price
        c = max(5.0, price * (1 + drift))
        hi = max(o, c) * (1 + ((h % 40) / 4000))
        lo = min(o, c) * (1 - ((h % 35) / 4000))
        vol = 1_000_000 + (h % 5_000_000)
        rows.append(
            {
                "t": time.strftime("%Y-%m-%d", time.gmtime(t0 + i * 86400)),
                "o": round(o, 2),
                "h": round(hi, 2),
                "l": round(lo, 2),
                "c": round(c, 2),
                "v": vol,
            }
        )
        price = c
    return rows


def _yf_download(symbol: str, period: str) -> list[dict]:
    import yfinance as yf

    data = yf.download(
        symbol,
        period=period,
        interval="1d",
        auto_adjust=True,
        progress=False,
        threads=False,
    )
    rows: list[dict] = []
    if data is None or len(data) < 10:
        return rows
    for idx, row in data.iterrows():
        try:
            o = float(row["Open"])
            h = float(row["High"])
            l = float(row["Low"])
            c = float(row["Close"])
            v = float(row["Volume"]) if "Volume" in row and row["Volume"] == row["Volume"] else 0
            if math.isnan(o) or math.isnan(c):
                continue
            rows.append(
                {
                    "t": idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10],
                    "o": round(o, 2),
                    "h": round(h, 2),
                    "l": round(l, 2),
                    "c": round(c, 2),
                    "v": int(v),
                }
            )
        except Exception:
            continue
    return rows


def _fetch_ohlc(ticker: str, period: str = "6mo") -> tuple[list[dict], bool, str | None]:
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

    sym = resolve_symbol(ticker)
    live = False
    error = None
    rows: list[dict] = []

    # 1) Real Moneycontrol / NSE history
    hist = fetch_history(sym, days=120)
    if hist and hist.get("candles"):
        rows = list(hist["candles"])
        live = True
        # Stamp last candle with latest live LTP when available
        q = fetch_live_quote(sym)
        if q and q.get("price") and rows:
            last = dict(rows[-1])
            px = float(q["price"])
            last["c"] = px
            last["h"] = max(float(last.get("h") or px), px)
            last["l"] = min(float(last.get("l") or px), px)
            rows[-1] = last
        return rows, live, None

    # 2) Yahoo chart fallback (may be rate-limited)
    candidates = yahoo_symbol(ticker)
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            for ysym in candidates:
                fut = pool.submit(_yf_download, ysym, period)
                try:
                    rows = fut.result(timeout=5)
                except FuturesTimeout:
                    error = "quote_timeout"
                    rows = []
                    break
                except Exception as exc:  # noqa: BLE001
                    error = str(exc)
                    rows = []
                    continue
                if len(rows) >= 10:
                    live = True
                    break
                rows = []
    except Exception as exc:  # noqa: BLE001
        error = str(exc)
        rows = []

    if len(rows) < 10:
        rows = _synthetic_ohlc(sym)
        if error is None:
            error = "using_simulated_candles"
    return rows, live, error


def analyze_ticker(ticker: str) -> dict[str, Any]:
    sym = resolve_symbol(ticker)
    now = time.time()
    cached = _CACHE.get(sym)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    candles, live, error = _fetch_ohlc(sym)
    closes = [x["c"] for x in candles]
    sma20 = _sma(closes, 20)
    sma50 = _sma(closes, 50)
    rsi = _rsi(closes, 14)
    macd_line, macd_sig, macd_hist = _macd(closes)
    bb_u, bb_m, bb_l = _bollinger(closes, 20)

    markers: list[dict] = []
    for i, cndl in enumerate(candles):
        prev_o = candles[i - 1]["o"] if i else None
        prev_c = candles[i - 1]["c"] if i else None
        p = _pattern(cndl["o"], cndl["h"], cndl["l"], cndl["c"], prev_o, prev_c)
        if p and i >= len(candles) - 40:  # recent markers only for chart clarity
            meta = PATTERN_META[p]
            markers.append(
                {
                    "i": i,
                    "t": cndl["t"],
                    "price": cndl["c"],
                    "code": p,
                    "label": meta["label"],
                    "bias": meta["bias"],
                    "hint": meta["hint"],
                }
            )

    last = len(closes) - 1
    score = 0
    indicators: list[dict] = []

    # Trend: price vs SMA
    if sma20[last] is not None:
        above20 = closes[last] >= sma20[last]
        score += 1 if above20 else -1
        indicators.append(
            {
                "id": "sma20",
                "name": "SMA 20",
                "value": sma20[last],
                "signal": "buy" if above20 else "sell",
                "note": "Above" if above20 else "Below",
            }
        )
    if sma50[last] is not None:
        above50 = closes[last] >= sma50[last]
        score += 1 if above50 else -1
        indicators.append(
            {
                "id": "sma50",
                "name": "SMA 50",
                "value": sma50[last],
                "signal": "buy" if above50 else "sell",
                "note": "Above" if above50 else "Below",
            }
        )
    if sma20[last] is not None and sma50[last] is not None:
        golden = sma20[last] >= sma50[last]
        score += 1 if golden else -1
        indicators.append(
            {
                "id": "cross",
                "name": "SMA cross",
                "value": "20>50" if golden else "20<50",
                "signal": "buy" if golden else "sell",
                "note": "Uptrend" if golden else "Downtrend",
            }
        )

    if rsi[last] is not None:
        r = rsi[last]
        if r < 30:
            score += 2
            sig, note = "buy", "Oversold"
        elif r > 70:
            score -= 2
            sig, note = "sell", "Overbought"
        else:
            sig, note = "wait", "Neutral"
        indicators.append({"id": "rsi", "name": "RSI 14", "value": r, "signal": sig, "note": note})

    if macd_hist[last] is not None and last > 0 and macd_hist[last - 1] is not None:
        hist = macd_hist[last]
        prev = macd_hist[last - 1]
        rising = hist > prev
        bull = hist > 0
        score += 1 if bull else -1
        score += 1 if rising else -1
        indicators.append(
            {
                "id": "macd",
                "name": "MACD",
                "value": hist,
                "signal": "buy" if bull and rising else "sell" if not bull and not rising else "wait",
                "note": "Rising" if rising else "Falling",
            }
        )

    if bb_l[last] is not None and bb_u[last] is not None:
        if closes[last] <= bb_l[last]:
            score += 1
            sig, note = "buy", "Near lower band"
        elif closes[last] >= bb_u[last]:
            score -= 1
            sig, note = "sell", "Near upper band"
        else:
            sig, note = "wait", "Inside bands"
        indicators.append(
            {
                "id": "bb",
                "name": "Bollinger",
                "value": closes[last],
                "signal": sig,
                "note": note,
            }
        )

    # Recent pattern bias
    recent_buy = sum(1 for m in markers[-5:] if m["bias"] == "buy")
    recent_sell = sum(1 for m in markers[-5:] if m["bias"] == "sell")
    if recent_buy > recent_sell:
        score += 1
    elif recent_sell > recent_buy:
        score -= 1
    if markers:
        last_m = markers[-1]
        plain = "Buy" if last_m["bias"] == "buy" else "Sell" if last_m["bias"] == "sell" else "Keep"
        indicators.append(
            {
                "id": "pattern",
                "name": "Chart signal",
                "value": last_m["t"],
                "signal": last_m["bias"] if last_m["bias"] != "wait" else "wait",
                "note": plain,
            }
        )

    # Momentum 5d / 20d
    if len(closes) > 5:
        m5 = (closes[-1] / closes[-6] - 1) * 100
        score += 1 if m5 > 0 else -1
        indicators.append(
            {
                "id": "mom5",
                "name": "5-day move",
                "value": round(m5, 2),
                "signal": "buy" if m5 > 1 else "sell" if m5 < -1 else "wait",
                "note": f"{m5:+.1f}%",
            }
        )
    if len(closes) > 20:
        m20 = (closes[-1] / closes[-21] - 1) * 100
        score += 1 if m20 > 0 else -1
        indicators.append(
            {
                "id": "mom20",
                "name": "20-day move",
                "value": round(m20, 2),
                "signal": "buy" if m20 > 2 else "sell" if m20 < -2 else "wait",
                "note": f"{m20:+.1f}%",
            }
        )

    # Plain trade stance: Long / Keep / Sell
    if score >= 3:
        action, tone, stance = "BUY", "buy", "Long"
    elif score <= -3:
        action, tone, stance = "SELL", "sell", "Sell"
    else:
        action, tone, stance = "HOLD", "wait", "Keep"

    price = closes[-1]
    # ATR-ish from recent ranges for profit / loss targets
    recent = candles[-14:]
    ranges = [max(1e-6, c["h"] - c["l"]) for c in recent]
    atr = sum(ranges) / len(ranges)
    atr_pct = (atr / price) * 100 if price else 2.0

    if stance == "Long":
        profit_pct = round(max(2.0, min(12.0, atr_pct * 2.2)), 1)
        loss_pct = round(max(1.0, min(6.0, atr_pct * 1.1)), 1)
        target = round(price * (1 + profit_pct / 100), 2)
        stop = round(price * (1 - loss_pct / 100), 2)
    elif stance == "Sell":
        profit_pct = round(max(2.0, min(12.0, atr_pct * 2.2)), 1)
        loss_pct = round(max(1.0, min(6.0, atr_pct * 1.1)), 1)
        target = round(price * (1 - profit_pct / 100), 2)
        stop = round(price * (1 + loss_pct / 100), 2)
    else:
        profit_pct = round(max(1.5, min(6.0, atr_pct * 1.4)), 1)
        loss_pct = round(max(1.0, min(4.0, atr_pct * 1.0)), 1)
        target = round(price * (1 + profit_pct / 100), 2)
        stop = round(price * (1 - loss_pct / 100), 2)

    meta = lookup(sym) or lookup(ticker) or {"ticker": sym, "name": sym, "exchange": "NSE", "sector": "—"}
    # Prefer display ticker for indices
    display_ticker = meta.get("ticker") or sym
    chg = 0.0
    if len(closes) >= 2 and closes[-2]:
        chg = round((closes[-1] / closes[-2] - 1) * 100, 2)

    trade = {
        "stance": stance,
        "entry": price,
        "target": target,
        "stop": stop,
        "profit_pct": profit_pct,
        "loss_pct": loss_pct,
        "reward_rupees": round(abs(target - price), 2),
        "risk_rupees": round(abs(price - stop), 2),
    }

    payload = {
        "ticker": display_ticker,
        "name": meta["name"],
        "exchange": meta.get("exchange", "NSE"),
        "sector": meta.get("sector", "—"),
        "kind": meta.get("kind", "equity"),
        "live": live,
        "error": error,
        "price": price,
        "change_pct": chg,
        "action": action,
        "tone": tone,
        "stance": stance,
        "trade": trade,
        "score": score,
        "score_max": 12,
        "indicators": indicators,
        "markers": markers,
        "overlays": {
            "sma20": sma20,
            "sma50": sma50,
            "bb_upper": bb_u,
            "bb_mid": bb_m,
            "bb_lower": bb_l,
            "rsi": rsi,
            "macd": macd_line,
            "macd_signal": macd_sig,
            "macd_hist": macd_hist,
        },
        "candles": candles[-90:],
        "disclaimer": "Tape check from market data — always confirm with filings.",
    }
    # Trim overlay arrays to match returned candles
    trim = len(payload["candles"])
    for k, arr in list(payload["overlays"].items()):
        payload["overlays"][k] = arr[-trim:]
    # Remap marker indices to trimmed window
    offset = len(candles) - trim
    remapped = []
    for m in markers:
        ni = m["i"] - offset
        if ni >= 0:
            remapped.append({**m, "i": ni})
    payload["markers"] = remapped

    _CACHE[sym] = (now, payload)
    return payload
