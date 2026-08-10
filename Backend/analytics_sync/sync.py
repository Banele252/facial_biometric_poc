"""
Mirrors every table in the production Postgres to a separate analytics
Postgres, for the management console to read from without querying
production directly. Per direction from the tech lead: "create a copy of
our prod database onto another database" - not a curated subset of tables.

Tables are discovered dynamically from the source's `public` schema on every
run, not hardcoded here - a table added to prod later shows up in the mirror
automatically, with no code change needed.

Each table is synced with an UPSERT (`INSERT ... ON CONFLICT DO UPDATE`)
rather than a full TRUNCATE-then-reinsert. Which rows get read from the
source depends on what the table looks like:

- A table with a column literally named `updated_at` (`active_sims`,
  `rica_records`) is filtered by `updated_at > last_watermark` - each run
  only reads and transfers rows that are new or changed since the last run.
- Every other table is read in full on every run, even ones that only ever
  get new rows in this codebase today (`notifications`, `process_log`,
  `api_call_log` via `occurred_at`, ...). Only the exact name `updated_at`
  is trusted, deliberately: a table with `created_at` but no
  `updated_at` can't be distinguished, from information_schema alone, from
  one that gets UPDATEs which simply don't touch `created_at` - which is
  exactly what `selfies` (updates `liveness_status`/`liveness_score`) and
  `sim_swap_orders` (updates `status`) do. Filtering either of those on
  `created_at > last_watermark` would silently stop syncing a row's later
  updates forever, the moment that row first falls behind the watermark -
  a correctness bug this sync ran into for real against the live prod
  database before this comment was written (`selfies` picked up an
  incorrect `created_at` watermark in testing). Trading incremental
  efficiency for insert-only tables to close off that whole bug class is
  the same call this codebase already made once, for the original
  TRUNCATE-vs-incremental decision (see below). Adding a real `updated_at`
  column to `selfies`/`sim_swap_orders` in `Backend/app/db.py` would let
  them (and only them, correctly) join the incremental path; not done here
  since that's a change to a different service's schema.

Per-table watermarks are persisted in a `_sync_state` table created on the
*destination* database - a Function App's consumption-plan instances aren't
guaranteed to keep in-memory state between runs, so the watermark has to live
somewhere durable. Watermarks are stored as text and cast back to the
source column's real type when used in a query, since source columns storing
timestamps are sometimes native `timestamptz` (`api_call_log.occurred_at`)
and sometimes plain `text` holding an ISO-8601 string (everything under
`Backend/app/db.py`'s schema) - casting at query time handles both without
the sync code needing to know which.

Destination column types are inferred from `information_schema.columns` via
a small, deliberately conservative type map - anything not explicitly
recognised falls back to `text`, which always accepts whatever the source
sends rather than risk a type-mismatch failure on an unanticipated column.
The source's primary key IS recreated on the destination (needed to make
`ON CONFLICT` possible) but other constraints, foreign keys and indexes are
not - this mirror is for reporting reads, not for standing in as a
replacement transactional database. A table is only UPSERT-able if it has a
primary key; a source table with no primary key falls back to
TRUNCATE-then-reinsert, since there's nothing for `ON CONFLICT` to key on.

Known gap: an UPSERT-only sync never removes rows that were hard-deleted
from the source - a row deleted in prod stays in the mirror indefinitely.
Acceptable for a reporting console at current scale; would need an explicit
tombstone/soft-delete convention on the source, or a periodic full
reconciliation pass, to close.
"""

from __future__ import annotations

import logging
import os

import psycopg
from psycopg import sql
from psycopg.types.json import Json

logger = logging.getLogger("analytics_sync")

# information_schema.columns.data_type -> the type to use on the destination.
# Deliberately conservative: only types actually seen in this project's
# schemas are mapped explicitly, everything else falls back to `text`.
_TYPE_MAP = {
    "character varying": "text",
    "character": "text",
    "text": "text",
    "integer": "integer",
    "bigint": "bigint",
    "smallint": "smallint",
    "boolean": "boolean",
    "real": "real",
    "double precision": "double precision",
    "numeric": "numeric",
    "timestamp with time zone": "timestamptz",
    "timestamp without time zone": "timestamp",
    "date": "date",
    "jsonb": "jsonb",
    "json": "jsonb",
    "uuid": "text",
}

# The only column name trusted as a watermark. Deliberately not `created_at`
# too - see the module docstring for why a table having `created_at` doesn't
# mean it's safe to filter on (selfies, sim_swap_orders). A table without
# `updated_at` falls back to a full-table read every run.
_WATERMARK_COLUMN = "updated_at"


class SyncConfigError(Exception):
    """Raised when required connection environment variables are missing."""


def _connect(prefix: str) -> psycopg.Connection:
    host = os.getenv(f"{prefix}postgres_host")
    port = os.getenv(f"{prefix}postgres_port", "5432")
    user = os.getenv(f"{prefix}postgres_username")
    password = os.getenv(f"{prefix}postgres_password")
    dbname = os.getenv(f"{prefix}database")
    if not all([host, user, password, dbname]):
        raise SyncConfigError(
            f"Missing one or more of {prefix}postgres_host/_username/_password/"
            f"{prefix}database environment variables."
        )
    return psycopg.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=dbname,
        sslmode="require",
        connect_timeout=10,
    )


def source_connection() -> psycopg.Connection:
    """The production database - unprefixed env vars, matching db_logger.py."""
    return _connect(prefix="")


def dest_connection() -> psycopg.Connection:
    """The analytics database the management console reads from."""
    return _connect(prefix="analytics_")


def list_source_tables(source_conn: psycopg.Connection) -> list[str]:
    """Every base table in the source's public schema, alphabetical."""
    with source_conn.cursor() as cur:
        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
            "ORDER BY table_name"
        )
        return [row[0] for row in cur.fetchall()]


def _table_columns(source_conn: psycopg.Connection, table_name: str) -> list[tuple[str, str]]:
    """(column_name, source_data_type) pairs, in column order."""
    with source_conn.cursor() as cur:
        cur.execute(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = %s "
            "ORDER BY ordinal_position",
            (table_name,),
        )
        return list(cur.fetchall())


def _primary_key_columns(source_conn: psycopg.Connection, table_name: str) -> list[str]:
    """Source table's primary key column names, in key order. Empty if the
    table has no primary key."""
    with source_conn.cursor() as cur:
        cur.execute(
            "SELECT kcu.column_name FROM information_schema.table_constraints tc "
            "JOIN information_schema.key_column_usage kcu "
            "  ON tc.constraint_name = kcu.constraint_name "
            "  AND tc.table_schema = kcu.table_schema "
            "WHERE tc.table_schema = 'public' AND tc.table_name = %s "
            "  AND tc.constraint_type = 'PRIMARY KEY' "
            "ORDER BY kcu.ordinal_position",
            (table_name,),
        )
        return [row[0] for row in cur.fetchall()]


def _watermark_column(columns: list[tuple[str, str]]) -> str | None:
    """`updated_at` if the table has one, else None - see `_WATERMARK_COLUMN`
    for why `created_at` doesn't count."""
    names = {name for name, _ in columns}
    return _WATERMARK_COLUMN if _WATERMARK_COLUMN in names else None


def ensure_sync_state_table(dest_conn: psycopg.Connection) -> None:
    """Create the table that persists each source table's watermark across
    runs. Lives on the destination since the Function itself keeps no state
    between invocations."""
    with dest_conn.cursor() as cur:
        cur.execute(
            "CREATE TABLE IF NOT EXISTS _sync_state ("
            "table_name text PRIMARY KEY, last_synced_at text NOT NULL)"
        )
    dest_conn.commit()


def _get_watermark(dest_conn: psycopg.Connection, table_name: str) -> str | None:
    with dest_conn.cursor() as cur:
        cur.execute("SELECT last_synced_at FROM _sync_state WHERE table_name = %s", (table_name,))
        row = cur.fetchone()
        return row[0] if row else None


def _set_watermark(dest_conn: psycopg.Connection, table_name: str, value: object) -> None:
    with dest_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO _sync_state (table_name, last_synced_at) VALUES (%s, %s) "
            "ON CONFLICT (table_name) DO UPDATE SET last_synced_at = EXCLUDED.last_synced_at",
            (table_name, str(value)),
        )
    dest_conn.commit()


def ensure_table_mirror(
    dest_conn: psycopg.Connection,
    table_name: str,
    columns: list[tuple[str, str]],
    pk_columns: list[str],
) -> None:
    """Create the destination table if it doesn't exist yet. No-op if it does -
    this does not attempt to reconcile a column (or primary key) added on the
    source after the destination table was first created; drop the
    destination table manually if a source schema change needs picking up."""
    col_defs = [
        sql.SQL("{} {}").format(sql.Identifier(name), sql.SQL(_TYPE_MAP.get(dtype, "text")))
        for name, dtype in columns
    ]
    if pk_columns:
        col_defs.append(
            sql.SQL("PRIMARY KEY ({})").format(
                sql.SQL(", ").join(sql.Identifier(c) for c in pk_columns)
            )
        )
    query = sql.SQL("CREATE TABLE IF NOT EXISTS {} ({})").format(
        sql.Identifier(table_name), sql.SQL(", ").join(col_defs)
    )
    with dest_conn.cursor() as cur:
        cur.execute(query)
    dest_conn.commit()


def _adapt_row(row: tuple) -> tuple:
    """psycopg decodes a source `jsonb`/`json` column into a plain Python
    dict/list on SELECT, but won't adapt one back on INSERT without an
    explicit wrapper - wrap any dict/list value so it round-trips."""
    return tuple(Json(value) if isinstance(value, (dict, list)) else value for value in row)


def _upsert_rows(
    dest_conn: psycopg.Connection,
    table_name: str,
    col_names: list[str],
    pk_columns: list[str],
    rows: list[tuple],
) -> None:
    non_pk_cols = [c for c in col_names if c not in pk_columns]
    conflict_action = (
        sql.SQL("DO UPDATE SET {}").format(
            sql.SQL(", ").join(
                sql.SQL("{0} = EXCLUDED.{0}").format(sql.Identifier(c)) for c in non_pk_cols
            )
        )
        if non_pk_cols
        else sql.SQL("DO NOTHING")
    )
    query = sql.SQL("INSERT INTO {} ({}) VALUES ({}) ON CONFLICT ({}) {}").format(
        sql.Identifier(table_name),
        sql.SQL(", ").join(sql.Identifier(c) for c in col_names),
        sql.SQL(", ").join([sql.Placeholder()] * len(col_names)),
        sql.SQL(", ").join(sql.Identifier(c) for c in pk_columns),
        conflict_action,
    )
    with dest_conn.cursor() as cur:
        cur.executemany(query, [_adapt_row(row) for row in rows])
    dest_conn.commit()


def mirror_table(
    source_conn: psycopg.Connection, dest_conn: psycopg.Connection, table_name: str
) -> int:
    """Sync one table from source to destination. Returns the number of rows
    read from the source (transferred, whether inserted or updated)."""
    columns = _table_columns(source_conn, table_name)
    if not columns:
        logger.warning("Skipping %s - no columns visible in information_schema.", table_name)
        return 0

    pk_columns = _primary_key_columns(source_conn, table_name)
    ensure_table_mirror(dest_conn, table_name, columns, pk_columns)

    col_names = [name for name, _ in columns]
    select_cols = sql.SQL(", ").join(sql.Identifier(c) for c in col_names)

    full_select = sql.SQL("SELECT {} FROM {}").format(select_cols, sql.Identifier(table_name))

    if not pk_columns:
        # Nothing for ON CONFLICT to key on - fall back to full reload.
        with source_conn.cursor() as cur:
            cur.execute(full_select)
            rows = cur.fetchall()
        with dest_conn.cursor() as cur:
            cur.execute(sql.SQL("TRUNCATE TABLE {}").format(sql.Identifier(table_name)))
            if rows:
                insert_query = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                    sql.Identifier(table_name),
                    select_cols,
                    sql.SQL(", ").join([sql.Placeholder()] * len(col_names)),
                )
                cur.executemany(insert_query, [_adapt_row(row) for row in rows])
        dest_conn.commit()
        return len(rows)

    watermark_col = _watermark_column(columns)
    watermark_idx = col_names.index(watermark_col) if watermark_col else None

    if watermark_col:
        source_dtype = dict(columns)[watermark_col]
        last_watermark = _get_watermark(dest_conn, table_name)
        if last_watermark is None:
            where_clause = sql.SQL("")
            params: tuple = ()
        else:
            where_clause = sql.SQL(" WHERE {} > %s::{}").format(
                sql.Identifier(watermark_col), sql.SQL(source_dtype)
            )
            params = (last_watermark,)
        query = sql.SQL("SELECT {} FROM {}{} ORDER BY {}").format(
            select_cols, sql.Identifier(table_name), where_clause, sql.Identifier(watermark_col)
        )
        with source_conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
    else:
        # No timestamp column to filter on - every run reads the full table.
        with source_conn.cursor() as cur:
            cur.execute(full_select)
            rows = cur.fetchall()

    if rows:
        _upsert_rows(dest_conn, table_name, col_names, pk_columns, rows)
        if watermark_idx is not None:
            new_watermark = max(row[watermark_idx] for row in rows)
            _set_watermark(dest_conn, table_name, new_watermark)

    return len(rows)


def run_sync() -> dict[str, int]:
    """Entry point called by the Function's timer trigger. Syncs every table
    found in the source database; returns rows transferred per table."""
    with source_connection() as source_conn, dest_connection() as dest_conn:
        ensure_sync_state_table(dest_conn)
        tables = list_source_tables(source_conn)
        counts = {table: mirror_table(source_conn, dest_conn, table) for table in tables}
    logger.info("analytics database sync complete: %s", counts)
    return counts
