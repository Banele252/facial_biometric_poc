# Backend/app/services/console_queries.py
"""Read queries backing the management console.

Written against the project's actual persistence layer -- `get_db()` from
Backend.app.db, with `query_one` / `execute` -- rather than an ORM.

Two things are discovered at runtime rather than hardcoded:

  * the audit table name, found by looking for a table carrying both
    `event_id` and `integrity_hash`;
  * the multi-row query method on the Database object, since only
    `query_one` and `execute` are used elsewhere in the codebase.

Both are cached after first use. If the audit table cannot be found the
functions return empty results and log once, so the console renders an
empty state instead of a 500.

Fraud and transaction figures are DERIVED, not stored: there is no
fraud_decisions table, and `sim_swap_orders` carries no risk score or
decision. Both come from FRAUD_DECISION audit events, whose metadata the
mobile journey populates.
"""
from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any, Iterable

from Backend.app.db import get_db

logger = logging.getLogger(__name__)

_audit_table: str | None = None
_audit_columns: set[str] | None = None
_resolved = False


# ---------------------------------------------------------------------------
# Schema discovery
# ---------------------------------------------------------------------------

def _rows(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Run a multi-row query regardless of what the Database class calls it."""
    db = get_db()

    for name in ("query_all", "query", "fetch_all", "fetchall", "query_many"):
        method = getattr(db, name, None)
        if callable(method):
            result = method(sql, params)
            return [dict(row) for row in (result or [])]

    # Fall back to the underlying connection. Every shape the Database class
    # is likely to expose it under:
    for attr in ("conn", "connection", "_conn", "_connection"):
        conn = getattr(db, attr, None)
        if isinstance(conn, sqlite3.Connection):
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute(sql, params).fetchall()]

    raise RuntimeError(
        "Could not find a multi-row query method on the Database object. "
        "Add one, or extend the name list in console_queries._rows()."
    )


def _resolve_audit_table() -> tuple[str | None, set[str]]:
    """Locate the audit table and its columns. Cached after first call."""
    global _audit_table, _audit_columns, _resolved

    if _resolved:
        return _audit_table, _audit_columns or set()

    _resolved = True

    try:
        tables = _rows(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
    except Exception:  # noqa: BLE001
        logger.exception("Could not list tables -- console will show empty data")
        return None, set()

    for table in (row["name"] for row in tables):
        try:
            columns = {
                row["name"]
                for row in _rows(f"PRAGMA table_info({table})")
            }
        except Exception:  # noqa: BLE001
            continue

        if {"event_id", "integrity_hash"} <= columns:
            _audit_table = table
            _audit_columns = columns
            logger.info("Console audit source: %s (%d columns)", table, len(columns))
            return _audit_table, columns

    logger.warning(
        "No audit table found (looked for one with event_id + integrity_hash). "
        "Console audit views will be empty until the mobile app posts a batch."
    )
    return None, set()


def _order_column(columns: set[str]) -> str:
    """Prefer server receive time over the device clock.

    The device timestamp is attacker-controlled on a rooted handset, so a
    skewed clock could otherwise push rows to the top of an operator's
    screen. Falls back only if the column does not exist.
    """
    for candidate in ("received_at", "created_at", "timestamp"):
        if candidate in columns:
            return candidate
    return "rowid"


def _parse_metadata(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def _parse_dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Audit logs
# ---------------------------------------------------------------------------

def get_audit_entries(
    *,
    session_id: str | None = None,
    msisdn: str | None = None,
    event_type: str | None = None,
    outcome: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = 200,
    cursor: str | None = None,
) -> tuple[list[dict], str | None, int | None]:
    table, columns = _resolve_audit_table()

    if not table:
        return [], None, 0

    order_col = _order_column(columns)

    where: list[str] = []
    params: list[Any] = []

    if session_id and "session_id" in columns:
        where.append("session_id = ?")
        params.append(session_id)

    if event_type and "event_type" in columns:
        where.append("event_type = ?")
        params.append(event_type)

    if outcome and "outcome" in columns:
        where.append("outcome = ?")
        params.append(outcome)

    if since:
        where.append(f"{order_col} >= ?")
        params.append(since.isoformat())

    if until:
        where.append(f"{order_col} <= ?")
        params.append(until.isoformat())

    # Keyset pagination: (order_col, event_id) is unique even when a batch
    # insert gives several rows the same receive time.
    if cursor:
        try:
            cursor_time, cursor_id = cursor.split("|", 1)
            where.append(f"({order_col}, event_id) < (?, ?)")
            params.extend([cursor_time, cursor_id])
        except ValueError:
            logger.warning("Ignoring malformed cursor: %r", cursor)

    # MSISDN may live in a column or inside metadata JSON, so it is applied
    # in Python below rather than in SQL.
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    total: int | None = None
    try:
        counted = _rows(f"SELECT COUNT(*) AS n FROM {table} {clause}", tuple(params))
        total = counted[0]["n"] if counted else None
    except Exception:  # noqa: BLE001
        logger.debug("Count query failed; continuing without a total")

    rows = _rows(
        f"""
        SELECT * FROM {table}
        {clause}
        ORDER BY {order_col} DESC, event_id DESC
        LIMIT ?
        """,
        tuple(params) + (limit + 1,),
    )

    has_more = len(rows) > limit
    rows = rows[:limit]

    entries: list[dict] = []
    for row in rows:
        metadata = _parse_metadata(row.get("metadata"))
        row_msisdn = row.get("msisdn") or metadata.get("msisdn")

        if msisdn and msisdn not in str(row_msisdn or ""):
            continue

        entries.append(
            {
                "event_id": row.get("event_id") or "",
                "event_type": row.get("event_type") or "UNKNOWN",
                "timestamp": str(row.get("timestamp") or ""),
                "session_id": row.get("session_id") or "",
                "user_id": row.get("user_id"),
                "msisdn": row_msisdn,
                "device_id": row.get("device_id") or "",
                "app_version": row.get("app_version") or "",
                "os_version": row.get("os_version") or "",
                "screen": row.get("screen"),
                "action": row.get("action"),
                "outcome": row.get("outcome"),
                "reason": row.get("reason"),
                "metadata": metadata,
                "integrity_hash": row.get("integrity_hash") or "",
                "previous_hash": row.get("previous_hash"),
                "source": row.get("source") or "mobile",
                "received_at": row.get("received_at"),
                "environment": row.get("environment"),
                "batch_hash": row.get("batch_hash"),
            }
        )

    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = f"{last.get(order_col)}|{last.get('event_id')}"

    return entries, next_cursor, total


# ---------------------------------------------------------------------------
# Fraud decisions — derived from audit events
# ---------------------------------------------------------------------------

def get_fraud_decisions(since: datetime) -> list[dict]:
    table, columns = _resolve_audit_table()

    if not table or "event_type" not in columns:
        return []

    order_col = _order_column(columns)

    rows = _rows(
        f"""
        SELECT * FROM {table}
        WHERE event_type IN ('FRAUD_DECISION', 'FRAUD_RULE_TRIGGERED')
          AND {order_col} >= ?
        ORDER BY {order_col} DESC
        LIMIT 500
        """,
        (since.isoformat(),),
    )

    decisions: list[dict] = []
    for row in rows:
        metadata = _parse_metadata(row.get("metadata"))
        created = _parse_dt(row.get(order_col)) or _parse_dt(row.get("timestamp"))

        if created is None:
            continue

        reasons = metadata.get("reasons") or metadata.get("rules") or []
        if isinstance(reasons, str):
            reasons = [reasons]

        decision = str(metadata.get("decision") or "").upper()
        if decision not in ("APPROVE", "REJECT", "REFER"):
            # Fall back to the event outcome when metadata is thin.
            decision = {
                "success": "APPROVE",
                "blocked": "REJECT",
                "failure": "REJECT",
                "pending": "REFER",
            }.get(str(row.get("outcome") or ""), "REFER")

        decisions.append(
            {
                "identity_ref": (
                    metadata.get("identity_ref")
                    or metadata.get("identity_reference")
                    or row.get("session_id")
                    or ""
                ),
                "msisdn": row.get("msisdn") or metadata.get("msisdn") or "",
                "decision": decision,
                "risk_score": float(metadata.get("risk_score") or 0),
                "reasons": list(reasons),
                "created_at": created,
            }
        )

    return decisions


# ---------------------------------------------------------------------------
# SIM swap orders
# ---------------------------------------------------------------------------

def get_sim_swap_orders(since: datetime) -> list[dict]:
    rows = _rows(
        """
        SELECT * FROM sim_swap_orders
        WHERE created_at >= ?
        ORDER BY created_at DESC
        LIMIT 500
        """,
        (since.isoformat(),),
    )

    # sim_swap_orders carries no risk score or fraud decision, so enrich
    # from the fraud events, matched on MSISDN. Most recent decision wins.
    fraud_by_msisdn: dict[str, dict] = {}
    for decision in get_fraud_decisions(since):
        key = decision["msisdn"]
        if key and key not in fraud_by_msisdn:
            fraud_by_msisdn[key] = decision

    orders: list[dict] = []
    for row in rows:
        created = _parse_dt(row.get("created_at"))
        if created is None:
            continue

        msisdn = row.get("msisdn") or ""
        fraud = fraud_by_msisdn.get(msisdn, {})
        status = str(row.get("status") or "pending").lower()

        orders.append(
            {
                "order_id": row.get("order_id") or "",
                "msisdn": msisdn,
                "identity_ref": (
                    fraud.get("identity_ref")
                    or row.get("selfie_id")
                    or row.get("reference")
                    or ""
                ),
                # No stored verification result on the order; a completed or
                # approved swap implies the biometric gate was passed.
                "verification": (
                    "ACCEPTED"
                    if status in ("completed", "approved", "pending")
                    else "REJECTED"
                ),
                "fraud_decision": fraud.get("decision", "REFER"),
                "risk_score": float(fraud.get("risk_score") or 0),
                "status": status,
                "created_at": created,
            }
        )

    return orders
