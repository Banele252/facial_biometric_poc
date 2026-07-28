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
from typing import Any

from Backend.app.db import get_db, new_id, utcnow_iso

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
