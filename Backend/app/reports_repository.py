"""Data-access helpers for transactions, rejected requests and SIM swap orders.

Same conventions as :mod:`Backend.app.repository`: thin functions over
:mod:`Backend.app.db`, ``?`` placeholders, ISO-8601 text timestamps so the
same statements run on sqlite and Postgres unchanged.

Timestamps are returned as stored: UTC ISO-8601 text, same convention as
every other endpoint in this API (e.g. ``GET /api/v1/verifications/history``).
Converting to a display timezone (SAST) is a presentation concern for
whichever caller renders it, not something this API bakes in — see
``management-console/management-backend/prod_api_client.py``.

Day-bucketing for the ``*_volume_by_day`` functions is done in Python rather
than SQL (e.g. Postgres' ``AT TIME ZONE``) because this module's queries must
keep working against the sqlite backend too. It buckets by SAST day (the
console's display timezone) since "day" is inherently a timezone-dependent
grouping decision, not a raw-value passthrough like the other fields.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone
from typing import Any

from Backend.app.db import get_db, new_id, utcnow_iso

_MAX_LIMIT = 200
_DEFAULT_LIMIT = 50
_SAST = timezone(timedelta(hours=2))


def _date_range_clauses(
    created_from: str | None, created_to: str | None
) -> tuple[list[str], list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if created_from is not None:
        clauses.append("created_at >= ?")
        params.append(created_from)
    if created_to is not None:
        clauses.append("created_at <= ?")
        params.append(created_to)
    return clauses, params


def _where(clauses: list[str]) -> str:
    return f"WHERE {' AND '.join(clauses)}" if clauses else ""


def _volume_by_day(table: str, days: int) -> list[dict[str, Any]]:
    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    rows = get_db().query(
        f"SELECT status, created_at FROM {table} WHERE created_at >= ?",  # noqa: S608
        (cutoff,),
    )
    counts: dict[tuple[str, str], int] = {}
    for row in rows:
        day = datetime.fromisoformat(row["created_at"]).astimezone(_SAST).date().isoformat()
        key = (day, row["status"])
        counts[key] = counts.get(key, 0) + 1
    return [
        {"day": day, "status": status, "count": count}
        for (day, status), count in sorted(counts.items())
    ]


# -- transactions --------------------------------------------------------
def record_transaction(
    id_number: str,
    transaction_kind: str,
    status: str,
    reason: str | None = None,
    msisdn: str | None = None,
    sim_serial: str | None = None,
) -> dict[str, Any]:
    txn_id = new_id()
    created_at = utcnow_iso()
    get_db().execute(
        "INSERT INTO transactions (id, msisdn, id_number, sim_serial, transaction_kind, "
        "status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (txn_id, msisdn, id_number, sim_serial, transaction_kind, status, reason, created_at),
    )
    return get_db().query_one(  # type: ignore[return-value]
        "SELECT * FROM transactions WHERE id = ?", (txn_id,)
    )


def list_transactions(
    status: str | None = None,
    msisdn: str | None = None,
    transaction_kind: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, offset)

    clauses, params = _date_range_clauses(created_from, created_to)
    if status is not None:
        clauses.append("status = ?")
        params.append(status)
    if msisdn is not None:
        clauses.append("msisdn = ?")
        params.append(msisdn)
    if transaction_kind is not None:
        clauses.append("transaction_kind = ?")
        params.append(transaction_kind)
    where = _where(clauses)

    db = get_db()
    # `where` is built only from fixed literal fragments; all values are
    # bound as parameters, so this is not an injection vector.
    total = db.query_one(f"SELECT count(*) AS total FROM transactions {where}", tuple(params))[  # noqa: S608
        "total"
    ]
    items = db.query(
        f"SELECT id, msisdn, id_number, sim_serial, transaction_kind, status, reason, "  # noqa: S608
        f"created_at FROM transactions {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    )
    return {"total": total, "limit": limit, "offset": offset, "items": items}


def get_transaction(transaction_id: str) -> dict[str, Any] | None:
    row = get_db().query_one(
        "SELECT id, msisdn, id_number, sim_serial, transaction_kind, status, reason, "
        "created_at FROM transactions WHERE id = ?",
        (transaction_id,),
    )
    return row


def transaction_status_summary(
    created_from: str | None = None, created_to: str | None = None
) -> list[dict[str, Any]]:
    clauses, params = _date_range_clauses(created_from, created_to)
    where = _where(clauses)
    return get_db().query(
        f"SELECT status, count(*) AS count FROM transactions {where} "  # noqa: S608
        f"GROUP BY status ORDER BY count DESC",
        tuple(params),
    )


def transaction_volume_by_day(days: int = 14) -> list[dict[str, Any]]:
    return _volume_by_day("transactions", days)


# -- rejected_requests -----------------------------------------------------
def record_rejection(
    id_number: str,
    stage: str,
    reason: str,
    msisdn: str | None = None,
    device_id: str | None = None,
) -> dict[str, Any]:
    rejection_id = new_id()
    created_at = utcnow_iso()
    get_db().execute(
        "INSERT INTO rejected_requests (id, id_number, msisdn, device_id, stage, reason, "
        "created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (rejection_id, id_number, msisdn, device_id, stage, reason, created_at),
    )
    return get_db().query_one(  # type: ignore[return-value]
        "SELECT * FROM rejected_requests WHERE id = ?", (rejection_id,)
    )


def list_rejections(
    stage: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, offset)

    clauses, params = _date_range_clauses(created_from, created_to)
    if stage is not None:
        clauses.append("stage = ?")
        params.append(stage)
    if msisdn is not None:
        clauses.append("msisdn = ?")
        params.append(msisdn)
    where = _where(clauses)

    db = get_db()
    total = db.query_one(
        f"SELECT count(*) AS total FROM rejected_requests {where}", tuple(params)  # noqa: S608
    )["total"]
    items = db.query(
        f"SELECT id, id_number, msisdn, device_id, stage, reason, created_at "  # noqa: S608
        f"FROM rejected_requests {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    )
    return {"total": total, "limit": limit, "offset": offset, "items": items}


def rejection_summary(
    created_from: str | None = None, created_to: str | None = None
) -> list[dict[str, Any]]:
    clauses, params = _date_range_clauses(created_from, created_to)
    where = _where(clauses)
    return get_db().query(
        f"SELECT stage, reason, count(*) AS trigger_count FROM rejected_requests {where} "  # noqa: S608
        f"GROUP BY stage, reason ORDER BY trigger_count DESC",
        tuple(params),
    )


# -- sim_swap_orders --------------------------------------------------------
def list_sim_swap_orders(
    status: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, offset)

    clauses, params = _date_range_clauses(created_from, created_to)
    if status is not None:
        clauses.append("status = ?")
        params.append(status)
    if msisdn is not None:
        clauses.append("msisdn = ?")
        params.append(msisdn)
    where = _where(clauses)

    db = get_db()
    total = db.query_one(
        f"SELECT count(*) AS total FROM sim_swap_orders {where}", tuple(params)  # noqa: S608
    )["total"]
    items = db.query(
        f"SELECT order_id, msisdn, new_sim_serial, identity_reference, status, "  # noqa: S608
        f"created_at FROM sim_swap_orders {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    )
    return {"total": total, "limit": limit, "offset": offset, "items": items}


def sim_swap_status_summary(
    created_from: str | None = None, created_to: str | None = None
) -> list[dict[str, Any]]:
    clauses, params = _date_range_clauses(created_from, created_to)
    where = _where(clauses)
    return get_db().query(
        f"SELECT status, count(*) AS count FROM sim_swap_orders {where} "  # noqa: S608
        f"GROUP BY status ORDER BY count DESC",
        tuple(params),
    )


def sim_swap_volume_by_day(days: int = 14) -> list[dict[str, Any]]:
    return _volume_by_day("sim_swap_orders", days)
