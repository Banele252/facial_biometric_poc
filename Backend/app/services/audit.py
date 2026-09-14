"""Audit trail for the SIM swap journey.

The CARB makes audit logging mandatory (slide 19 item 8: authentication events,
verification requests, authorisation decisions, failed attempts). Every step of
the journey writes one row here, so a decision can be reconstructed afterwards
from what each check actually returned.

Rows go to ``process_log`` over the application's own database connection.
``Backend/internal_backend/audit.py`` writes the same table with psycopg2 and a
separate ``postgres_*`` configuration; this path reuses the connection the app
already has, so there is no second driver to install and nothing extra to
configure in the deployed environment.

Auditing must never break the journey: a failure here is logged and swallowed.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any

from Backend.app.db import get_db, new_id, utcnow_iso

_MAX_LIMIT = 200
_DEFAULT_LIMIT = 50

logger = logging.getLogger(__name__)

# Values that must never be written to the audit trail. Biometric images are
# SPI under CARB slide 20 and are referenced by id, never embedded.
_REDACT = {"image", "selfie_image_base64", "reference_image_base64", "raw"}


def _scrub(payload: dict[str, Any]) -> dict[str, Any]:
    return {k: ("<redacted>" if k in _REDACT else v) for k, v in payload.items()}


def record_event(process: str, payload: dict[str, Any] | None = None) -> None:
    """Append one audit row. Never raises."""
    try:
        body = _scrub(payload or {})
        body.setdefault("process", process)
        get_db().execute(
            "INSERT INTO process_log (id, environment, process, payload, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                new_id(),
                os.getenv("ENVIRONMENT", "dev"),
                process,
                json.dumps(body, default=str),
                utcnow_iso(),
            ),
        )
    except Exception as exc:  # pragma: no cover - auditing must not break the flow
        logger.error("Audit write failed for process %s: %s", process, exc)


def list_events(limit: int = 50) -> list[dict[str, Any]]:
    """Most recent audit rows, newest first."""
    return get_db().query(
        "SELECT id, environment, process, payload, created_at "
        "FROM process_log ORDER BY created_at DESC LIMIT ?",
        (limit,),
    )


def list_events_filtered(
    process: str | None = None,
    environment: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = _DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Filtered, paginated audit rows, newest first, with `payload` decoded."""
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, offset)

    clauses: list[str] = []
    params: list[Any] = []
    if process is not None:
        clauses.append("process = ?")
        params.append(process)
    if environment is not None:
        clauses.append("environment = ?")
        params.append(environment)
    if created_from is not None:
        clauses.append("created_at >= ?")
        params.append(created_from)
    if created_to is not None:
        clauses.append("created_at <= ?")
        params.append(created_to)
    # `where` is built only from fixed literal fragments; all values are
    # bound as parameters, so this is not an injection vector.
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""  # noqa: S608

    db = get_db()
    total = db.query_one(f"SELECT count(*) AS total FROM process_log {where}", tuple(params))[  # noqa: S608
        "total"
    ]
    items = db.query(
        f"SELECT id, environment, process, payload, created_at FROM process_log {where} "  # noqa: S608
        f"ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    )
    for item in items:
        try:
            item["payload"] = json.loads(item["payload"])
        except (TypeError, json.JSONDecodeError):
            item["payload"] = {"raw": item["payload"]}
    return {"total": total, "limit": limit, "offset": offset, "items": items}


def find_decision_near(id_number: str, near: str) -> dict[str, Any] | None:
    """Best-effort match: the verification_decision event for `id_number`
    closest in time to `near` (typically a transaction's created_at).
    `transactions` has no foreign key into process_log - this is a fuzzy
    join, not an exact one. Callers MUST check the returned `delta_seconds`
    against their own cutoff before trusting this as "the" matching event;
    this always returns the nearest candidate, even if it is hours or days
    away.

    The nearest-match arithmetic is done in Python (not e.g. Postgres'
    EXTRACT(EPOCH FROM ...)) so it works against the sqlite backend too.
    """
    near_dt = datetime.fromisoformat(near)
    rows = get_db().query(
        "SELECT id, payload, created_at FROM process_log "
        "WHERE process = 'verification_decision' "
        "ORDER BY created_at DESC LIMIT 500"
    )

    best: dict[str, Any] | None = None
    best_delta: float | None = None
    for row in rows:
        try:
            payload = json.loads(row["payload"])
        except (TypeError, json.JSONDecodeError):
            continue
        if payload.get("id_number") != id_number:
            continue
        delta = abs((datetime.fromisoformat(row["created_at"]) - near_dt).total_seconds())
        if best_delta is None or delta < best_delta:
            best = {"id": row["id"], "payload": payload, "created_at": row["created_at"]}
            best_delta = delta

    if best is None:
        return None
    best["delta_seconds"] = best_delta
    return best
