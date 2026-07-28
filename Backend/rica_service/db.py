"""Minimal persistence layer for mock RICA registration records.

Same tiny sqlite/psycopg wrapper as Backend/app/db.py, copied rather than
imported so this service stays standalone and independently deployable -
same convention as the other Backend/*_service directories. Defaults to a
local SQLite file; set DATABASE_URL (see config.py) to point at the
deployed Azure Postgres instead.
"""

from __future__ import annotations

import sqlite3
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

from config import get_settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS rica_records (
    id TEXT PRIMARY KEY,
    id_number TEXT NOT NULL,
    full_name TEXT NOT NULL,
    msisdn TEXT NOT NULL UNIQUE,
    new_sim_number TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""


class Database:
    """A tiny, thread-safe wrapper over sqlite3 or psycopg."""

    def __init__(self, url: str):
        self.url = url
        self._lock = threading.Lock()
        self._is_postgres = url.startswith(("postgres://", "postgresql://"))
        self._conn = self._connect_postgres(url) if self._is_postgres else self._connect_sqlite(url)

    @staticmethod
    def _connect_sqlite(url: str) -> Any:
        target = url[len("sqlite:///") :] if url.startswith("sqlite:///") else url
        if target and target != ":memory:":
            Path(target).expanduser().parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(target or ":memory:", check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _connect_postgres(url: str) -> Any:
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError(
                "DATABASE_URL points at Postgres but the 'psycopg' package is not installed."
            ) from exc
        return psycopg.connect(url, autocommit=True, row_factory=dict_row)

    def _sql(self, sql: str) -> str:
        return sql.replace("?", "%s") if self._is_postgres else sql

    def executescript(self, statement: str) -> None:
        with self._lock:
            cur = self._conn.cursor()
            cur.execute(statement)
            if not self._is_postgres:
                self._conn.commit()

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        with self._lock:
            cur = self._conn.cursor()
            cur.execute(self._sql(sql), params)
            if not self._is_postgres:
                self._conn.commit()

    def query(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._lock:
            cur = self._conn.cursor()
            cur.execute(self._sql(sql), params)
            rows = cur.fetchall()
            return [dict(row) for row in rows]

    def query_one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        rows = self.query(sql, params)
        return rows[0] if rows else None


@lru_cache(maxsize=1)
def get_db() -> Database:
    db = Database(get_settings().database_url)
    db.executescript(_SCHEMA)
    return db


def reset_db_cache() -> None:
    """Drop the cached connection so tests can rebind to a fresh database."""
    get_db.cache_clear()
