"""Analytics DB access for the management console.

Reads from the analytics Postgres database - the same one
Backend/analytics_api reads from, mirrored from production by
Backend/analytics_sync. Used by main.py's /api/v1/analytics/* routes and by
system_llm.py's chatbot tools.

Every query here is a read, so this deliberately stays a single module
rather than a fuller sqlite/psycopg wrapper - there's no local schema to
create, since this only ever talks to the analytics Postgres that
Backend/analytics_sync populates. Structure duplicates (does not import)
Backend/analytics_api/db.py, activity_logs.py, and fraud_rules.py, since
management-backend runs standalone with local bare imports.

created_at on all three source tables is stored as plain ISO-8601 text (not
a native Postgres timestamp - see Backend/analytics_sync/sync.py's
docstring for why), so date-range filters take strings, not datetimes;
lexicographic comparison on ISO-8601 UTC strings is chronologically correct.

Stored/transmitted-between-services timestamps stay UTC (that's what's in
the DB and what the rest of the system assumes). This module converts to
SAST (South African Standard Time, a fixed UTC+2 offset with no DST) only
at the API-response boundary, for every `created_at` value it returns and
for the day-bucketing in the `*_volume_by_day` functions - so a viewer of
this console only ever sees SAST, never UTC or their own machine's zone.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg
from config import get_settings
from psycopg import sql
from psycopg.rows import dict_row

_MAX_LIMIT = 200
_DEFAULT_LIMIT = 50

_SAST = timezone(timedelta(hours=2))


def _to_sast(iso_text: str | None) -> str | None:
    """A stored UTC (or otherwise offset-aware) ISO-8601 string, converted to
    the equivalent SAST (+02:00) ISO-8601 string."""
    if iso_text is None:
        return None
    return datetime.fromisoformat(iso_text).astimezone(_SAST).isoformat()


def get_connection() -> psycopg.Connection:
    return psycopg.connect(get_settings().database_url, row_factory=dict_row)


def db_conn() -> Iterator[psycopg.Connection]:
    """FastAPI dependency: one connection per request, closed after."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def _date_range_where(
    created_from: str | None, created_to: str | None
) -> tuple[list[sql.Composable], list[Any]]:
    conditions: list[sql.Composable] = []
    params: list[Any] = []
    if created_from is not None:
        conditions.append(sql.SQL("created_at >= %s"))
        params.append(created_from)
    if created_to is not None:
        conditions.append(sql.SQL("created_at <= %s"))
        params.append(created_to)
    return conditions, params


def _where_clause(conditions: list[sql.Composable]) -> sql.Composable:
    return sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions) if conditions else sql.SQL("")


# --- process_log (audit/process events) --------------------------------


def list_process_logs(
    conn: psycopg.Connection,
    *,
    process: str | None = None,
    environment: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Filtered, paginated audit/process log entries, newest first."""
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, offset)

    conditions, params = _date_range_where(created_from, created_to)
    if process is not None:
        conditions.append(sql.SQL("process = %s"))
        params.append(process)
    if environment is not None:
        conditions.append(sql.SQL("environment = %s"))
        params.append(environment)
    where_clause = _where_clause(conditions)

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("SELECT count(*) AS total FROM process_log{}").format(where_clause), params
        )
        total = cur.fetchone()["total"]

        cur.execute(
            sql.SQL(
                "SELECT id, environment, process, payload, created_at FROM process_log{} "
                "ORDER BY created_at DESC LIMIT %s OFFSET %s"
            ).format(where_clause),
            [*params, limit, offset],
        )
        items = cur.fetchall()

    for item in items:
        try:
            item["payload"] = json.loads(item["payload"])
        except (TypeError, json.JSONDecodeError):
            item["payload"] = {"raw": item["payload"]}
        item["created_at"] = _to_sast(item["created_at"])

    return {"total": total, "limit": limit, "offset": offset, "items": items}


def find_verification_decision(
    conn: psycopg.Connection, *, id_number: str, near: str
) -> dict[str, Any] | None:
    """Best-effort match: the verification_decision process_log event for
    `id_number` closest in time to `near` (typically a transaction's
    created_at). `transactions` has no foreign key into process_log - this
    is a fuzzy join, not an exact one. Callers MUST check the returned
    `delta_seconds` against their own cutoff before trusting this as "the"
    matching event; this always returns the nearest candidate, even if it
    is hours or days away."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, payload, created_at, "
            "ABS(EXTRACT(EPOCH FROM (created_at::timestamptz - %(near)s::timestamptz))) "
            "AS delta_seconds "
            "FROM process_log WHERE process = 'verification_decision' "
            "AND payload::jsonb->>'id_number' = %(id_number)s "
            "ORDER BY delta_seconds ASC LIMIT 1",
            {"near": near, "id_number": id_number},
        )
        row = cur.fetchone()

    if row is None:
        return None
    try:
        row["payload"] = json.loads(row["payload"])
    except (TypeError, json.JSONDecodeError):
        row["payload"] = {}
    row["created_at"] = _to_sast(row["created_at"])
    return row


# --- rejected_requests (fraud rule rejections) --------------------------


def list_fraud_rejections(
    conn: psycopg.Connection,
    *,
    stage: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Filtered, paginated fraud-rule rejection records, newest first."""
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, offset)

    conditions, params = _date_range_where(created_from, created_to)
    if stage is not None:
        conditions.append(sql.SQL("stage = %s"))
        params.append(stage)
    if msisdn is not None:
        conditions.append(sql.SQL("msisdn = %s"))
        params.append(msisdn)
    where_clause = _where_clause(conditions)

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("SELECT count(*) AS total FROM rejected_requests{}").format(where_clause),
            params,
        )
        total = cur.fetchone()["total"]

        cur.execute(
            sql.SQL(
                "SELECT id, id_number, msisdn, device_id, stage, reason, created_at "
                "FROM rejected_requests{} ORDER BY created_at DESC LIMIT %s OFFSET %s"
            ).format(where_clause),
            [*params, limit, offset],
        )
        items = cur.fetchall()

    for item in items:
        item["created_at"] = _to_sast(item["created_at"])

    return {"total": total, "limit": limit, "offset": offset, "items": items}


def fraud_rejections_summary(
    conn: psycopg.Connection,
    *,
    created_from: str | None = None,
    created_to: str | None = None,
) -> list[dict[str, Any]]:
    """Which (stage, reason) pairs fired, and how often, ranked by trigger count."""
    conditions, params = _date_range_where(created_from, created_to)
    where_clause = _where_clause(conditions)

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "SELECT stage, reason, count(*) AS trigger_count FROM rejected_requests{} "
                "GROUP BY stage, reason ORDER BY trigger_count DESC"
            ).format(where_clause),
            params,
        )
        return cur.fetchall()


# --- sim_swap_orders (transactions) --------------------------------------


def list_sim_swap_orders(
    conn: psycopg.Connection,
    *,
    status: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Filtered, paginated SIM-swap order records, newest first."""
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, offset)

    conditions, params = _date_range_where(created_from, created_to)
    if status is not None:
        conditions.append(sql.SQL("status = %s"))
        params.append(status)
    if msisdn is not None:
        conditions.append(sql.SQL("msisdn = %s"))
        params.append(msisdn)
    where_clause = _where_clause(conditions)

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("SELECT count(*) AS total FROM sim_swap_orders{}").format(where_clause),
            params,
        )
        total = cur.fetchone()["total"]

        cur.execute(
            sql.SQL(
                "SELECT order_id, msisdn, new_sim_serial, identity_reference, status, "
                "created_at FROM sim_swap_orders{} ORDER BY created_at DESC LIMIT %s OFFSET %s"
            ).format(where_clause),
            [*params, limit, offset],
        )
        items = cur.fetchall()

    for item in items:
        item["created_at"] = _to_sast(item["created_at"])

    return {"total": total, "limit": limit, "offset": offset, "items": items}


def sim_swap_status_summary(
    conn: psycopg.Connection,
    *,
    created_from: str | None = None,
    created_to: str | None = None,
) -> list[dict[str, Any]]:
    """Order counts grouped by status, most common first."""
    conditions, params = _date_range_where(created_from, created_to)
    where_clause = _where_clause(conditions)

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "SELECT status, count(*) AS count FROM sim_swap_orders{} "
                "GROUP BY status ORDER BY count DESC"
            ).format(where_clause),
            params,
        )
        return cur.fetchall()


def sim_swap_volume_by_day(conn: psycopg.Connection, *, days: int = 14) -> list[dict[str, Any]]:
    """Order counts per day per status for the last `days` days.

    created_at is TEXT holding a UTC instant, so it's cast to `timestamptz`
    and shifted to SAST wall-clock via `AT TIME ZONE` before bucketing -
    `AT TIME ZONE` on a `timestamptz` is unambiguous regardless of the DB
    connection's own session timezone setting, so e.g. 23:30 UTC (01:30 SAST
    the next day) buckets into the correct SAST day rather than the UTC one.
    Rows are unpivoted ({day, status, count}) - the caller decides how to
    present the status breakdown rather than this module hardcoding the set
    of known statuses.
    """
    cutoff = (datetime.now(_SAST).date() - timedelta(days=days)).isoformat()

    with conn.cursor() as cur:
        cur.execute(
            "SELECT substring((created_at::timestamptz AT TIME ZONE 'Africa/Johannesburg')::text, 1, 10) AS day, "
            "status, count(*) AS count FROM sim_swap_orders "
            "WHERE substring((created_at::timestamptz AT TIME ZONE 'Africa/Johannesburg')::text, 1, 10) >= %s "
            "GROUP BY day, status ORDER BY day",
            (cutoff,),
        )
        return cur.fetchall()


# --- transactions ---------------------------------------------------------


def list_transactions(
    conn: psycopg.Connection,
    *,
    status: str | None = None,
    msisdn: str | None = None,
    transaction_kind: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Filtered, paginated transaction records, newest first."""
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, offset)

    conditions, params = _date_range_where(created_from, created_to)
    if status is not None:
        conditions.append(sql.SQL("status = %s"))
        params.append(status)
    if msisdn is not None:
        conditions.append(sql.SQL("msisdn = %s"))
        params.append(msisdn)
    if transaction_kind is not None:
        conditions.append(sql.SQL("transaction_kind = %s"))
        params.append(transaction_kind)
    where_clause = _where_clause(conditions)

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("SELECT count(*) AS total FROM transactions{}").format(where_clause),
            params,
        )
        total = cur.fetchone()["total"]

        cur.execute(
            sql.SQL(
                "SELECT id, msisdn, id_number, sim_serial, transaction_kind, status, reason, "
                "created_at FROM transactions{} ORDER BY created_at DESC LIMIT %s OFFSET %s"
            ).format(where_clause),
            [*params, limit, offset],
        )
        items = cur.fetchall()

    for item in items:
        item["created_at"] = _to_sast(item["created_at"])

    return {"total": total, "limit": limit, "offset": offset, "items": items}


def get_transaction(conn: psycopg.Connection, transaction_id: str) -> dict[str, Any] | None:
    """One transaction row by id, or None if it doesn't exist."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, msisdn, id_number, sim_serial, transaction_kind, status, reason, "
            "created_at FROM transactions WHERE id = %s",
            (transaction_id,),
        )
        row = cur.fetchone()
    if row is not None:
        row["created_at"] = _to_sast(row["created_at"])
    return row


def transaction_status_summary(
    conn: psycopg.Connection,
    *,
    created_from: str | None = None,
    created_to: str | None = None,
) -> list[dict[str, Any]]:
    """Transaction counts grouped by status, most common first."""
    conditions, params = _date_range_where(created_from, created_to)
    where_clause = _where_clause(conditions)

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "SELECT status, count(*) AS count FROM transactions{} "
                "GROUP BY status ORDER BY count DESC"
            ).format(where_clause),
            params,
        )
        return cur.fetchall()


def transaction_volume_by_day(conn: psycopg.Connection, *, days: int = 14) -> list[dict[str, Any]]:
    """Transaction counts per day per status for the last `days` days - see
    `sim_swap_volume_by_day` for why this shifts `created_at` to SAST via
    `AT TIME ZONE` before bucketing."""
    cutoff = (datetime.now(_SAST).date() - timedelta(days=days)).isoformat()

    with conn.cursor() as cur:
        cur.execute(
            "SELECT substring((created_at::timestamptz AT TIME ZONE 'Africa/Johannesburg')::text, 1, 10) AS day, "
            "status, count(*) AS count FROM transactions "
            "WHERE substring((created_at::timestamptz AT TIME ZONE 'Africa/Johannesburg')::text, 1, 10) >= %s "
            "GROUP BY day, status ORDER BY day",
            (cutoff,),
        )
        return cur.fetchall()
