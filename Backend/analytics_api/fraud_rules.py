"""Fraud/verification rules triggered - the second management-console ask:
"extract the rules used on the fraud intelligence repo."

Source: `rejected_requests` (columns: id, id_number, msisdn, device_id,
stage, reason, created_at). `stage` is which check rejected the request
(e.g. "consent", "document_face") and `reason` is the human-readable rule
explanation - this is the closest thing to a queryable "rules" record that
exists in production today.

`created_at` here is stored as plain ISO-8601 text (not a native Postgres
timestamp - see Backend/analytics_sync/sync.py's docstring for why), so
date-range filters take strings, not datetimes; lexicographic comparison on
ISO-8601 UTC strings is chronologically correct.
"""

from __future__ import annotations

from typing import Any

import psycopg
from psycopg import sql

_MAX_LIMIT = 200
_DEFAULT_LIMIT = 50


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


def list_rejections(
    conn: psycopg.Connection,
    *,
    stage: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Filtered, paginated rejection records, newest first."""
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, offset)

    conditions, params = _date_range_where(created_from, created_to)
    if stage is not None:
        conditions.append(sql.SQL("stage = %s"))
        params.append(stage)
    if msisdn is not None:
        conditions.append(sql.SQL("msisdn = %s"))
        params.append(msisdn)
    where_clause = (
        sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions) if conditions else sql.SQL("")
    )

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


def rules_triggered_summary(
    conn: psycopg.Connection,
    *,
    created_from: str | None = None,
    created_to: str | None = None,
) -> list[dict[str, Any]]:
    """Which (stage, reason) pairs fired, and how often - "the rules used",
    ranked by trigger count."""
    conditions, params = _date_range_where(created_from, created_to)
    where_clause = (
        sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions) if conditions else sql.SQL("")
    )

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL(
                "SELECT stage, reason, count(*) AS trigger_count FROM rejected_requests{} "
                "GROUP BY stage, reason ORDER BY trigger_count DESC"
            ).format(where_clause),
            params,
        )
        return cur.fetchall()
