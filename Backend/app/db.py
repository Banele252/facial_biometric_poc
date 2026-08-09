"""Minimal persistence layer for verification history and notifications.

Deliberately dependency-free: the default backend is stdlib ``sqlite3`` writing
to a local file, which keeps the hackathon deployment self-contained. Setting
``DATABASE_URL`` to a ``postgresql://`` URL switches to the deployed Postgres
(this needs the optional ``psycopg`` package, imported lazily).

The API is intentionally small — parameterised ``execute``/``query`` with ``?``
placeholders that are translated for Postgres — because the feature set only
needs a handful of inserts and selects. Access is serialised with a lock so a
single shared connection is safe across FastAPI's sync threadpool workers.
"""

from __future__ import annotations

import sqlite3
import threading
import uuid
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from Backend.app.config import get_settings

_SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS selfies (
        id TEXT PRIMARY KEY,
        id_number TEXT NOT NULL,
        storage_ref TEXT NOT NULL,
        content_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        liveness_status TEXT NOT NULL DEFAULT 'pending',
        liveness_score REAL,
        liveness_provider TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS verification_attempts (
        id TEXT PRIMARY KEY,
        id_number TEXT NOT NULL,
        selfie_id TEXT,
        status TEXT NOT NULL,
        method TEXT NOT NULL,
        reason TEXT,
        provider_status TEXT,
        created_at TEXT NOT NULL
    )
    """,
    # Audit trail. Same table name and columns as
    # Backend/internal_backend/audit.py writes to, so queries written against
    # that service still work — but created here and reached over the
    # application's existing connection, so it needs no second driver
    # (psycopg2) and no separate postgres_* configuration.
    """
    CREATE TABLE IF NOT EXISTS process_log (
        id TEXT PRIMARY KEY,
        environment TEXT,
        process TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    # SIM swap orders. Persisted rather than held in the service's in-memory
    # store: losing the record of a completed swap is worse than never having
    # written it, because the customer's SIM has already changed.
    """
    CREATE TABLE IF NOT EXISTS sim_swap_orders (
        order_id TEXT PRIMARY KEY,
        msisdn TEXT NOT NULL,
        new_sim_serial TEXT NOT NULL,
        identity_reference TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    # Which SIM is currently active on a number. The activation step reads the
    # previous serial from here and writes the new one, so a restart cannot
    # make an already-swapped number look un-swapped.
    """
    CREATE TABLE IF NOT EXISTS active_sims (
        msisdn TEXT PRIMARY KEY,
        sim_serial TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    # Number port authorisations. PENDING means MTN authorised the customer's
    # identity, not that the number has moved — the port completes out of band
    # with the donor network.
    """
    CREATE TABLE IF NOT EXISTS port_requests (
        request_id TEXT PRIMARY KEY,
        msisdn TEXT NOT NULL,
        target_network TEXT NOT NULL,
        identity_reference TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    # The fraud intelligence repository the diagram draws beside the
    # pre-checks. Every rejection is written here, and the first pre-check
    # ("Check against recent (7 days) rejected requests") reads it back. This
    # has to be persisted rather than in-process: a repeat attempt an hour
    # later, or against another replica, must still see the earlier rejection.
    """
    CREATE TABLE IF NOT EXISTS rejected_requests (
        id TEXT PRIMARY KEY,
        id_number TEXT NOT NULL,
        msisdn TEXT,
        device_id TEXT,
        stage TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
    )
    """,
    # Authorisation tokens. The diagram issues one once every check has passed
    # and only then processes the SIM swap, so the step that changes the
    # customer's SIM presents evidence that the identity chain completed rather
    # than trusting its caller.
    """
    CREATE TABLE IF NOT EXISTS authorisation_tokens (
        token TEXT PRIMARY KEY,
        id_number TEXT NOT NULL,
        msisdn TEXT,
        -- Not "transaction": that is a reserved word in both SQLite and
        -- Postgres, and quoting it everywhere is worse than naming it well.
        transaction_kind TEXT NOT NULL,
        attempt_reference TEXT,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        id_number TEXT NOT NULL,
        attempt_id TEXT,
        type TEXT NOT NULL,
        channel TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
)


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


class Database:
    """A tiny, thread-safe wrapper over sqlite3 or psycopg."""

    def __init__(self, url: str):
        self.url = url
        self._lock = threading.Lock()
        self._is_postgres = url.startswith(("postgres://", "postgresql://"))
        if self._is_postgres:
            self._conn = self._connect_postgres(url)
        else:
            self._conn = self._connect_sqlite(url)

    # -- connection setup ----------------------------------------------------
    @staticmethod
    def _connect_sqlite(url: str) -> Any:
        # Accept sqlite:///relative/path.db, sqlite:////abs/path.db and :memory:.
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
                "DATABASE_URL points at Postgres but the optional 'psycopg' "
                "package is not installed. Install it or use the sqlite default."
            ) from exc
        conn = psycopg.connect(url, autocommit=True, row_factory=dict_row)
        return conn

    def _sql(self, sql: str) -> str:
        return sql.replace("?", "%s") if self._is_postgres else sql

    # -- operations ----------------------------------------------------------
    def executescript(self, statements: tuple[str, ...]) -> None:
        with self._lock:
            cur = self._conn.cursor()
            for stmt in statements:
                cur.execute(stmt)
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


def init_db() -> None:
    """Create tables if needed. Safe to call repeatedly at startup."""
    get_db()


def reset_db_cache() -> None:
    """Drop the cached connection so tests can rebind to a fresh database."""
    get_db.cache_clear()
