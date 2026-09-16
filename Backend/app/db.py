# Backend/app/db.py
"""Minimal persistence layer for verification history and notifications.
Deliberately dependency-free: the default backend is stdlib `sqlite3` writing
to a local file. Setting `DATABASE_URL` to a `postgresql://` URL switches to
the deployed Postgres (requires optional `psycopg` package).
"""
from __future__ import annotations

import logging
import sqlite3
import threading
import uuid
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from Backend.app.config import get_settings

SCHEMA = (
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
    """
    CREATE TABLE IF NOT EXISTS process_log (
                                               id TEXT PRIMARY KEY,
                                               environment TEXT,
                                               process TEXT NOT NULL,
                                               payload TEXT NOT NULL,
                                               created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sim_swap_orders (
                                                   order_id TEXT PRIMARY KEY,
                                                   id_number TEXT,
                                                   msisdn TEXT NOT NULL,
                                                   iccid TEXT,
                                                   reference TEXT,
                                                   selfie_id TEXT,
                                                   device_id TEXT,
                                                   new_sim_serial TEXT,
                                                   identity_reference TEXT,
                                                   status TEXT NOT NULL,
                                                   created_at TEXT NOT NULL,
                                                   updated_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS active_sims (
                                               msisdn TEXT PRIMARY KEY,
                                               sim_serial TEXT NOT NULL,
                                               updated_at TEXT NOT NULL
    )
    """,
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
    """
    CREATE TABLE IF NOT EXISTS audit_logs (
                                              event_id TEXT PRIMARY KEY,
                                              event_type TEXT NOT NULL,
                                              timestamp TEXT NOT NULL,
                                              session_id TEXT NOT NULL,
                                              user_id TEXT,
                                              msisdn TEXT,
                                              device_id TEXT NOT NULL,
                                              app_version TEXT,
                                              os_version TEXT,
                                              screen TEXT,
                                              action TEXT,
                                              outcome TEXT,
                                              reason TEXT,
                                              metadata TEXT,
                                              integrity_hash TEXT NOT NULL,
                                              device_integrity_hash TEXT,
                                              previous_hash TEXT,
                                              source TEXT NOT NULL DEFAULT 'backend',
                                              synced_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS audit_chain_control (
                                                       id INTEGER PRIMARY KEY,
                                                       last_hash TEXT NOT NULL,
                                                       updated_at TEXT NOT NULL
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
        except ImportError as exc:
            raise RuntimeError(
                "DATABASE_URL points at Postgres but the optional 'psycopg' "
                "package is not installed."
            ) from exc
        conn = psycopg.connect(url, autocommit=True, row_factory=dict_row)
        return conn

    def _sql(self, sql: str) -> str:
        return sql.replace("?", "%s") if self._is_postgres else sql

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


# Columns added after a table first shipped. CREATE TABLE IF NOT EXISTS is a
# no-op against an existing table, so a database created before a column was
# introduced would keep the old shape forever and silently drop the value.
# Each entry is (table, column, DDL type) and is applied only when missing.
ADDED_COLUMNS: tuple[tuple[str, str, str], ...] = (
    # The mobile AuditService sends msisdn and the console filters on it.
    ("audit_logs", "msisdn", "TEXT"),
    # The device's own SHA-256 chain hash. integrity_hash holds the server's
    # HMAC chain after ingest re-chains the entry; keeping the device value
    # means the handset's chain stays reconcilable against the server's.
    ("audit_logs", "device_integrity_hash", "TEXT"),
    # sim_swap_orders grew the fields the sim-swap router writes. Without
    # these, an INSERT against a database created before they existed fails
    # outright — which is a deployed-Postgres problem, never a local one,
    # because a fresh SQLite file always gets the current CREATE TABLE.
    ("sim_swap_orders", "id_number", "TEXT"),
    ("sim_swap_orders", "iccid", "TEXT"),
    ("sim_swap_orders", "reference", "TEXT"),
    ("sim_swap_orders", "selfie_id", "TEXT"),
    ("sim_swap_orders", "device_id", "TEXT"),
    ("sim_swap_orders", "updated_at", "TEXT"),
)


# Columns that were NOT NULL when a table first shipped and are now optional.
# Adding the new columns is not enough on an existing database: the sim-swap
# router's INSERT does not supply these two at all, so a legacy NOT NULL makes
# every insert fail with an integrity error even once the new columns exist.
RELAXED_COLUMNS: tuple[tuple[str, str], ...] = (
    ("sim_swap_orders", "new_sim_serial"),
    ("sim_swap_orders", "identity_reference"),
)


def _relax_not_null(db: Database) -> None:
    """Drop legacy NOT NULL constraints listed in RELAXED_COLUMNS.

    Postgres only. SQLite cannot ALTER COLUMN and would need a full table
    rebuild — it does not need one either, because a SQLite database here is
    always created fresh from the current CREATE TABLE, which already has
    these columns nullable. The deployed Postgres is the one that predates it.
    """
    if not db._is_postgres:
        return

    log = logging.getLogger(__name__)
    for table, column in RELAXED_COLUMNS:
        try:
            db.execute(f"ALTER TABLE {table} ALTER COLUMN {column} DROP NOT NULL")
            log.info("Dropped legacy NOT NULL on %s.%s", table, column)
        except Exception:
            # Already nullable, or the table does not exist yet. Both fine.
            log.debug("No NOT NULL to drop on %s.%s", table, column, exc_info=True)


def _existing_columns(db: Database, table: str) -> set[str]:
    """Column names for `table`, or an empty set if it does not exist yet.

    SQLite and Postgres need different introspection: PRAGMA is SQLite-only
    and raises on Postgres. Getting this wrong is silent — the exception was
    previously swallowed and the migration skipped — and it only shows up on
    the deployed database, since a fresh local SQLite file is always created
    with the current schema and never needs migrating.
    """
    if db._is_postgres:
        rows = db.query(
            "SELECT column_name AS name FROM information_schema.columns "
            "WHERE table_name = ?",
            (table,),
        )
    else:
        rows = db.query(f"PRAGMA table_info({table})")

    return {row["name"] for row in rows}


def _apply_added_columns(db: Database) -> None:
    """Add any missing columns from ADDED_COLUMNS. Idempotent."""
    for table, column, ddl_type in ADDED_COLUMNS:
        try:
            existing = _existing_columns(db, table)
        except Exception:
            logging.getLogger(__name__).warning(
                "Could not introspect %s to apply added columns", table, exc_info=True
            )
            continue

        # An empty set means the table does not exist yet; CREATE TABLE above
        # will already have built it with every column.
        if existing and column not in existing:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")
            logging.getLogger(__name__).info(
                "Added missing column %s.%s", table, column
            )


@lru_cache(maxsize=1)
def get_db() -> Database:
    db = Database(get_settings().database_url)
    db.executescript(SCHEMA)
    _apply_added_columns(db)
    _relax_not_null(db)
    return db


def init_db() -> None:
    """Create tables if needed. Safe to call repeatedly at startup."""
    get_db()


def reset_db_cache() -> None:
    """Drop the cached connection so tests can rebind to a fresh database."""
    get_db.cache_clear()