"""Business rules catalog for the management console.

There is no dedicated "rules" table in the analytics database - the
verification pipeline (see process_document/*.txt) is a fixed sequence of
checks that isn't recorded as discrete, independently countable events. The
catalog below is curated metadata (code, name, description, status)
describing that pipeline; each rule's `validation_count` is filled in from
the closest matching `process_log.process` value written by
Backend/app/services/audit.py's record_event() calls in
Backend/app/routers/verifications.py.

Several rules (Document OCR Extraction, Document Match, Liveness Check, Risk
Assessment Score, Fraud Decisioning Policy) run inline within the same
`verification_decision` audit event today rather than each logging its own
event, so those rows necessarily share one count until the pipeline
instruments them separately. This is a deliberate, documented approximation,
not a bug.
"""

from __future__ import annotations

from typing import Any

import psycopg

_PIPELINE_DECISION = "verification_decision"

RULE_CATALOG: list[dict[str, Any]] = [
    {
        "code": "BR-001",
        "name": "ID Number Validation",
        "description": (
            "Validates the structure of the submitted ID number: length, "
            "digit format, date-of-birth plausibility, citizenship digit, "
            "and checksum."
        ),
        "is_active": True,
        "process_key": "id_verification",
    },
    {
        "code": "BR-002",
        "name": "Document OCR Extraction",
        "description": "Extracts identity fields and the photo from the submitted ID or passport image.",
        "is_active": True,
        "process_key": _PIPELINE_DECISION,
    },
    {
        "code": "BR-003",
        "name": "Document Match",
        "description": (
            "Confirms the applicant-supplied name and ID number match what "
            "OCR extracted from the identity document."
        ),
        "is_active": True,
        "process_key": _PIPELINE_DECISION,
    },
    {
        "code": "BR-004",
        "name": "Liveness Check",
        "description": (
            "Confirms the selfie capture is of a live person, not a photo "
            "or video replay, before face matching proceeds."
        ),
        "is_active": True,
        "process_key": _PIPELINE_DECISION,
    },
    {
        "code": "BR-005",
        "name": "Face Match",
        "description": (
            "Compares the live selfie against the Home Affairs reference "
            "photo, falling back to the document photo when Home Affairs "
            "is unavailable."
        ),
        "is_active": True,
        "process_key": "face_match",
    },
    {
        "code": "BR-006",
        "name": "Device Risk Check",
        "description": (
            "Flags devices with repeated SIM-swap attempts or multiple "
            "distinct identities as medium or high risk."
        ),
        "is_active": True,
        "process_key": "fraud_checks",
    },
    {
        "code": "BR-007",
        "name": "Fraud Intelligence",
        "description": "Runs velocity and watchlist checks against known fraud indicators for the applicant and device.",
        "is_active": True,
        "process_key": "fraud_checks",
    },
    {
        "code": "BR-008",
        "name": "Risk Assessment Score",
        "description": (
            "Combines device risk and fraud intelligence signals into a "
            "single 0-100 risk score and LOW/MEDIUM/HIGH band."
        ),
        "is_active": True,
        "process_key": _PIPELINE_DECISION,
    },
    {
        "code": "BR-009",
        "name": "Fraud Decisioning Policy",
        "description": (
            "Applies final policy to the risk band: a watchlist hit "
            "rejects, medium/high risk refers for manual review, otherwise "
            "the transaction is approved."
        ),
        "is_active": True,
        "process_key": _PIPELINE_DECISION,
    },
    {
        "code": "BR-010",
        "name": "RICA Regulatory Check",
        "description": (
            "Confirms the transaction satisfies RICA identity-registration "
            "requirements before a SIM swap or activation proceeds."
        ),
        "is_active": True,
        "process_key": "rica_check",
    },
]


def business_rules_summary(conn: psycopg.Connection) -> list[dict[str, Any]]:
    """The rule catalog, each row annotated with how many process_log events
    of its `process_key` have been recorded (best-effort - see module
    docstring)."""
    with conn.cursor() as cur:
        cur.execute("SELECT process, count(*) AS count FROM process_log GROUP BY process")
        counts = {row["process"]: row["count"] for row in cur.fetchall()}

    return [
        {
            "code": rule["code"],
            "name": rule["name"],
            "description": rule["description"],
            "is_active": rule["is_active"],
            "validation_count": counts.get(rule["process_key"], 0),
        }
        for rule in RULE_CATALOG
    ]
