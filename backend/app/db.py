import sqlite3
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "finn.db"


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS recommendations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ticker TEXT NOT NULL,
              action TEXT NOT NULL,
              entry_price REAL NOT NULL,
              thesis TEXT NOT NULL,
              created_at TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'open',
              exit_price REAL,
              closed_at TEXT,
              notes TEXT
            );

            CREATE TABLE IF NOT EXISTS uploaded_holdings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ticker TEXT NOT NULL,
              name TEXT,
              qty REAL NOT NULL,
              avg_price REAL NOT NULL,
              source TEXT NOT NULL DEFAULT 'csv',
              uploaded_at TEXT NOT NULL
            );
            """
        )


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
