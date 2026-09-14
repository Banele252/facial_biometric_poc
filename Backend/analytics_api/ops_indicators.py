"""Ops-performance indicators - the third management-console ask: "any
relevant ops-based info about the system performance."

Unlike the other two modules, there's no single source table for this - an
"indicator" is inherently something computed (a rate, a count, a breakdown),
not a row you can select. This aggregates a handful of signals from across
the mirrored tables into one dashboard-shaped response:

- API call volume and error rate, and calls broken down by service
  (api_call_log) - the traffic/health signal.
- Verification outcome breakdown (verification_attempts.status) - how much
  of the verification journey is actually succeeding.
- SIM swap order status breakdown (sim_swap_orders.status) - where swap
  requests are getting stuck.
- Rejection-stage breakdown (rejected_requests.stage) - which check causes
  the most friction. Same caveat as fraud_rules.py: this table's write path
  is unconfirmed.
- Sync freshness (_sync_state) - how recently each table was last synced
  from production. This isn't about the production system's performance,
  it's about *this analytics pipeline's* health - "is the data on this
  dashboard current" is itself an ops indicator worth surfacing.

Each section is queried independently and skipped (not failed) if its
source table doesn't exist yet in a given deployment - analytics_sync
creates tables dynamically from whatever's in production, so not every
table this module knows about is guaranteed to be there.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import psycopg
from psycopg import sql


def _safe[T](conn: psycopg.Connection, query: Callable[[], T]) -> T | None:
    """Run a query section; return None instead of raising if its table
    doesn't exist in this deployment yet. Rolls back so the aborted
    transaction doesn't take out the sections that follow it."""
    try:
        return query()
    except psycopg.errors.UndefinedTable:
        conn.rollback()
        return None


def _api_call_indicators(conn: psycopg.Connection) -> dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT count(*) AS total, "
            "count(*) FILTER (WHERE status_code >= 400) AS error_count "
            "FROM api_call_log"
        )
        row = cur.fetchone()
        cur.execute("SELECT service, count(*) AS count FROM api_call_log GROUP BY service")
        by_service = cur.fetchall()

    total = row["total"]
    error_count = row["error_count"]
    return {
        "total_calls": total,
        "error_count": error_count,
        "error_rate": (error_count / total) if total else 0.0,
        "calls_by_service": by_service,
    }


def _group_count(conn: psycopg.Connection, table: str, group_column: str) -> list[dict[str, Any]]:
    """Row counts grouped by one column - no alias on the group column, so
    the result key is whatever that column is actually called (`status`,
    `stage`, ...) rather than a generic name that wouldn't fit all callers."""
    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("SELECT {col}, count(*) AS count FROM {table} GROUP BY {col}").format(
                col=sql.Identifier(group_column), table=sql.Identifier(table)
            )
        )
        return cur.fetchall()


def _sync_freshness(conn: psycopg.Connection) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute("SELECT table_name, last_synced_at FROM _sync_state ORDER BY table_name")
        return cur.fetchall()


def get_ops_indicators(conn: psycopg.Connection) -> dict[str, Any]:
    return {
        "api_calls": _safe(conn, lambda: _api_call_indicators(conn)),
        "verification_outcomes": _safe(
            conn, lambda: _group_count(conn, "verification_attempts", "status")
        ),
        "sim_swap_order_status": _safe(
            conn, lambda: _group_count(conn, "sim_swap_orders", "status")
        ),
        "rejection_stages": _safe(conn, lambda: _group_count(conn, "rejected_requests", "stage")),
        "sync_freshness": _safe(conn, lambda: _sync_freshness(conn)),
    }
