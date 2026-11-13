"""Groww/Zerodha-style read-only broker snapshot.

Never stores passwords. Live broker OAuth plugs in behind the same shapes later.
"""

from __future__ import annotations

MOCK_HOLDINGS = [
    {"ticker": "RELIANCE", "name": "Reliance Industries", "sector": "Energy", "qty": 40, "avg_price": 1210.0, "weight": 9.4},
    {"ticker": "TCS", "name": "Tata Consultancy", "sector": "IT", "qty": 18, "avg_price": 3800.0, "weight": 8.1},
    {"ticker": "HDFCBANK", "name": "HDFC Bank", "sector": "Banks", "qty": 45, "avg_price": 1620.0, "weight": 7.6},
    {"ticker": "INFY", "name": "Infosys", "sector": "IT", "qty": 35, "avg_price": 1710.0, "weight": 6.8},
    {"ticker": "ICICIBANK", "name": "ICICI Bank", "sector": "Banks", "qty": 50, "avg_price": 1180.0, "weight": 6.2},
    {"ticker": "BHARTIARTL", "name": "Bharti Airtel", "sector": "Telecom", "qty": 30, "avg_price": 1520.0, "weight": 5.4},
    {"ticker": "ITC", "name": "ITC", "sector": "FMCG", "qty": 100, "avg_price": 450.0, "weight": 5.1},
    {"ticker": "SBIN", "name": "State Bank of India", "sector": "Banks", "qty": 55, "avg_price": 790.0, "weight": 4.8},
    {"ticker": "LT", "name": "Larsen & Toubro", "sector": "Industrials", "qty": 12, "avg_price": 3450.0, "weight": 4.5},
    {"ticker": "AXISBANK", "name": "Axis Bank", "sector": "Banks", "qty": 35, "avg_price": 1080.0, "weight": 4.2},
    {"ticker": "ASIANPAINT", "name": "Asian Paints", "sector": "Materials", "qty": 14, "avg_price": 2550.0, "weight": 3.9},
    {"ticker": "MARUTI", "name": "Maruti Suzuki", "sector": "Auto", "qty": 3, "avg_price": 10900.0, "weight": 3.7},
    {"ticker": "SUNPHARMA", "name": "Sun Pharma", "sector": "Healthcare", "qty": 18, "avg_price": 1680.0, "weight": 3.5},
    {"ticker": "TITAN", "name": "Titan Company", "sector": "Consumer", "qty": 9, "avg_price": 3300.0, "weight": 3.3},
    {"ticker": "ULTRACEMCO", "name": "UltraTech Cement", "sector": "Materials", "qty": 2, "avg_price": 10800.0, "weight": 3.1},
    {"ticker": "NESTLEIND", "name": "Nestlé India", "sector": "FMCG", "qty": 10, "avg_price": 2350.0, "weight": 2.9},
    {"ticker": "POWERGRID", "name": "Power Grid", "sector": "Utilities", "qty": 80, "avg_price": 300.0, "weight": 2.7},
    {"ticker": "NTPC", "name": "NTPC", "sector": "Utilities", "qty": 70, "avg_price": 350.0, "weight": 2.5},
]

MOCK_FUNDS = {
    "available_cash": 185000.0,
    "collateral": 42000.0,
    "currency": "INR",
}

MOCK_ORDERS = [
    {
        "id": "SIM-10021",
        "ticker": "INFY",
        "side": "BUY",
        "qty": 10,
        "price": 1710.0,
        "status": "COMPLETE",
        "ts": "2026-11-03T10:22:00+05:30",
    },
    {
        "id": "SIM-10044",
        "ticker": "ASIANPAINT",
        "side": "SELL",
        "qty": 4,
        "price": 2588.0,
        "status": "COMPLETE",
        "ts": "2026-11-07T14:05:00+05:30",
    },
]


def broker_snapshot() -> dict:
    return {
        "mode": "live_quotes",
        "broker": "FINN Mock Broker (Groww/Zerodha-shaped)",
        "disclaimer": "Read-only holdings snapshot. No passwords stored.",
        "funds": MOCK_FUNDS,
        "holdings": MOCK_HOLDINGS,
        "orders": MOCK_ORDERS,
        "positions": [],
    }
