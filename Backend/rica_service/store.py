"""Data-access helpers for mock RICA registration records.

Thin functions over :mod:`db` so main.py never writes SQL directly, mirroring
Backend/app/repository.py.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from db import get_db


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def upsert_record(
    id_number: str, full_name: str, msisdn: str, new_sim_number: str | None = None
) -> dict[str, Any]:
    """Create the RICA registration for an msisdn, or replace it if one exists."""
    now = utcnow_iso()
    get_db().execute(
        "INSERT INTO rica_records "
        "(id, id_number, full_name, msisdn, new_sim_number, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT (msisdn) DO UPDATE SET "
        "id_number = excluded.id_number, full_name = excluded.full_name, "
        "new_sim_number = excluded.new_sim_number, updated_at = excluded.updated_at",
        (new_id(), id_number, full_name, msisdn, new_sim_number, now, now),
    )
    return get_by_msisdn(msisdn)  # type: ignore[return-value]


def get_by_msisdn(msisdn: str) -> dict[str, Any] | None:
    return get_db().query_one("SELECT * FROM rica_records WHERE msisdn = ?", (msisdn,))


def list_records(limit: int = 100) -> list[dict[str, Any]]:
    return get_db().query("SELECT * FROM rica_records ORDER BY created_at DESC LIMIT ?", (limit,))


def verify(id_number: str, full_name: str, msisdn: str) -> dict[str, Any]:
    """Check a claimed id_number + full_name against the RICA record for msisdn."""
    record = get_by_msisdn(msisdn)
    if record is None:
        return {"matched": False, "reason": "no RICA record for this msisdn", "record": None}

    id_ok = record["id_number"] == id_number
    name_ok = record["full_name"].strip().casefold() == full_name.strip().casefold()
    if id_ok and name_ok:
        return {"matched": True, "reason": None, "record": record}

    reasons = []
    if not id_ok:
        reasons.append("id_number does not match RICA registration")
    if not name_ok:
        reasons.append("full_name does not match RICA registration")
    return {"matched": False, "reason": "; ".join(reasons), "record": record}
