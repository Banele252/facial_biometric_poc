"""Data-access helpers for selfies, verification attempts and notifications.

Thin functions over :mod:`Backend.app.db` so routers and services never write
SQL directly. Timestamps are ISO-8601 strings and identifiers are opaque hex
UUIDs, both chosen so the same statements run on sqlite and Postgres unchanged.
"""

from __future__ import annotations

from typing import Any

from Backend.app.db import get_db, new_id, utcnow_iso


# -- selfies -----------------------------------------------------------------
def create_selfie(id_number: str, storage_ref: str, content_type: str) -> dict[str, Any]:
    selfie_id = new_id()
    created_at = utcnow_iso()
    get_db().execute(
        "INSERT INTO selfies (id, id_number, storage_ref, content_type, created_at, "
        "liveness_status) VALUES (?, ?, ?, ?, ?, 'pending')",
        (selfie_id, id_number, storage_ref, content_type, created_at),
    )
    return get_selfie(selfie_id)  # type: ignore[return-value]


def get_selfie(selfie_id: str) -> dict[str, Any] | None:
    return get_db().query_one("SELECT * FROM selfies WHERE id = ?", (selfie_id,))


def set_selfie_liveness(
    selfie_id: str, status: str, score: float, provider: str
) -> None:
    get_db().execute(
        "UPDATE selfies SET liveness_status = ?, liveness_score = ?, "
        "liveness_provider = ? WHERE id = ?",
        (status, score, provider, selfie_id),
    )


# -- verification attempts ---------------------------------------------------
def record_attempt(
    id_number: str,
    status: str,
    method: str,
    reason: str | None = None,
    provider_status: str | None = None,
    selfie_id: str | None = None,
) -> dict[str, Any]:
    attempt_id = new_id()
    created_at = utcnow_iso()
    get_db().execute(
        "INSERT INTO verification_attempts (id, id_number, selfie_id, status, method, "
        "reason, provider_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (attempt_id, id_number, selfie_id, status, method, reason, provider_status, created_at),
    )
    return get_db().query_one(  # type: ignore[return-value]
        "SELECT * FROM verification_attempts WHERE id = ?", (attempt_id,)
    )


def list_attempts(
    id_number: str | None = None, status: str | None = None, limit: int = 50
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if id_number:
        clauses.append("id_number = ?")
        params.append(id_number)
    if status:
        clauses.append("status = ?")
        params.append(status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    return get_db().query(
        # `where` is built only from fixed literal fragments; all values are
        # bound as parameters, so this is not an injection vector.
        f"SELECT * FROM verification_attempts {where} "  # noqa: S608
        f"ORDER BY created_at DESC LIMIT ?",
        tuple(params),
    )


# -- notifications -----------------------------------------------------------
def create_notification(
    id_number: str, type_: str, channel: str, message: str, attempt_id: str | None = None
) -> dict[str, Any]:
    notif_id = new_id()
    created_at = utcnow_iso()
    get_db().execute(
        "INSERT INTO notifications (id, id_number, attempt_id, type, channel, message, "
        "created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (notif_id, id_number, attempt_id, type_, channel, message, created_at),
    )
    return get_db().query_one(  # type: ignore[return-value]
        "SELECT * FROM notifications WHERE id = ?", (notif_id,)
    )


def list_notifications(
    id_number: str | None = None, limit: int = 50
) -> list[dict[str, Any]]:
    where = "WHERE id_number = ?" if id_number else ""
    params: tuple[Any, ...] = (id_number, limit) if id_number else (limit,)
    return get_db().query(
        # `where` is a fixed literal fragment; values are bound as parameters.
        f"SELECT * FROM notifications {where} ORDER BY created_at DESC LIMIT ?",  # noqa: S608
        params,
    )
