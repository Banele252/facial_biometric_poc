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
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import date, timedelta
from typing import Any

import psycopg
from config import get_settings
from psycopg import sql
from psycopg.rows import dict_row

_MAX_LIMIT = 200
_DEFAULT_LIMIT = 50


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

    return {"total": total, "limit": limit, "offset": offset, "items": items}


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

    created_at is TEXT, so days are bucketed by string prefix
    (substring(created_at, 1, 10) == the "YYYY-MM-DD" portion) rather than
    date_trunc. Rows are unpivoted ({day, status, count}) - the caller
    decides how to present the status breakdown rather than this module
    hardcoding the set of known statuses.
    """
    cutoff = (date.today() - timedelta(days=days)).isoformat()

    with conn.cursor() as cur:
        cur.execute(
            "SELECT substring(created_at, 1, 10) AS day, status, count(*) AS count "
            "FROM sim_swap_orders WHERE substring(created_at, 1, 10) >= %s "
            "GROUP BY day, status ORDER BY day",
            (cutoff,),
        )
        return cur.fetchall()
