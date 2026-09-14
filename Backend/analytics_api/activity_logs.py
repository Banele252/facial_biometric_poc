"""API activity logs - the first of the three management-console user story
asks: "API logs for the performed activities."

Reads straight from `api_call_log`, the audit trail every Backend/*_service
already writes to via its own db_logger.py (see e.g.
Backend/fraud_engine/db_logger.py) and that Backend/analytics_sync mirrors
into the analytics database. Filterable rather than a raw dump, so the
console doesn't need to know the table's shape - just the filters it cares
about.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import psycopg
from psycopg import sql

_MAX_LIMIT = 200
_DEFAULT_LIMIT = 50


def list_activity_logs(
    conn: psycopg.Connection,
    *,
    service: str | None = None,
    status_code: int | None = None,
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Filtered, paginated activity log entries, newest first."""
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, offset)

    conditions: list[sql.Composable] = []
    params: list[Any] = []
    if service is not None:
        conditions.append(sql.SQL("service = %s"))
        params.append(service)
    if status_code is not None:
        conditions.append(sql.SQL("status_code = %s"))
        params.append(status_code)
    if occurred_from is not None:
        conditions.append(sql.SQL("occurred_at >= %s"))
        params.append(occurred_from)
    if occurred_to is not None:
        conditions.append(sql.SQL("occurred_at <= %s"))
        params.append(occurred_to)
    where_clause = (
        sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions) if conditions else sql.SQL("")
    )

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("SELECT count(*) AS total FROM api_call_log{}").format(where_clause), params
        )
        total = cur.fetchone()["total"]

        cur.execute(
            sql.SQL(
                "SELECT id, occurred_at, service, endpoint, method, status_code, "
                "request_summary, response_summary FROM api_call_log{} "
                "ORDER BY occurred_at DESC LIMIT %s OFFSET %s"
            ).format(where_clause),
            [*params, limit, offset],
        )
        items = cur.fetchall()

    return {"total": total, "limit": limit, "offset": offset, "items": items}
