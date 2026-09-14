"""Deterministic data-gathering for the per-transaction PDF report.

`transactions` and `process_log` are now read from Backend/app's own API
(prod_api_client.py) rather than the analytics mirror - see
Backend/app/routers/verifications.py::_finalise for where `transactions` is
written, and Backend/app/routers/reports.py for the read endpoints. Even so,
`transactions` has no foreign key into `process_log`: the best available
correlation to journey history is still a fuzzy join on `id_number` against
`process_log`'s `verification_decision` events, nearest in time. Many
transactions will have NO match at all; this module makes that an explicit,
first-class outcome (`correlation_found`) rather than an error, so
`report_agent.py`/`pdf_report.py` can render an honest report either way.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import prod_api_client
import psycopg
from process_docs_db import get_process_docs

# How close a verification_decision event's created_at must be to a
# transaction's created_at to be trusted as "the" matching journey.
_CORRELATION_WINDOW_SECONDS = 24 * 60 * 60  # 24h

# Maps each CheckResult.name (Backend/app/routers/verifications.py) to the
# process_document/*.txt slug that explains it in business language.
CHECK_NAME_TO_SLUG: dict[str, str] = {
    "precheck": "id_validation",
    "liveness": "liveness",
    "rica": "rica_service",
    "id_verification": "external_backend",
    "face_match": "face_match_home_affairs",
    "fraud": "fraud",
    "sim_swap": "sim_swap",
    "activation": "sim_swap_activation",
    "number_port": "number_port",
}

# Always included for the executive-summary "what does this system do"
# grounding, regardless of which checks ran.
_OVERVIEW_SLUGS = ("verifications", "decisioning")


@dataclass
class ReportContext:
    transaction: dict[str, Any]
    correlation_found: bool
    checks: list[dict[str, Any]] = field(default_factory=list)
    decision_status: str | None = None
    decision_reason: str | None = None
    process_docs: list[dict[str, Any]] = field(default_factory=list)


async def gather_report_context(
    conn: psycopg.Connection, transaction_id: str
) -> ReportContext | None:
    """None means the transaction itself doesn't exist (caller returns 404).

    `conn` is still needed here - it's the process_docs (RAG store)
    connection, unrelated to `transactions`/`process_log` which now come
    from prod_api_client instead.
    """
    transaction = await prod_api_client.get_transaction(transaction_id)
    if transaction is None:
        return None

    decision_row = await prod_api_client.find_verification_decision(
        id_number=transaction["id_number"], near=transaction["created_at"]
    )
    correlation_found = (
        decision_row is not None and decision_row["delta_seconds"] <= _CORRELATION_WINDOW_SECONDS
    )

    checks: list[dict[str, Any]] = []
    decision_status: str | None = None
    decision_reason: str | None = None
    slugs = set(_OVERVIEW_SLUGS)
    if correlation_found:
        payload = decision_row["payload"]
        checks = payload.get("checks", [])
        decision_status = payload.get("status")
        decision_reason = payload.get("reason")
        for check in checks:
            slug = CHECK_NAME_TO_SLUG.get(check.get("name", ""))
            if slug:
                slugs.add(slug)

    docs = get_process_docs(conn, sorted(slugs))

    return ReportContext(
        transaction=transaction,
        correlation_found=correlation_found,
        checks=checks,
        decision_status=decision_status,
        decision_reason=decision_reason,
        process_docs=docs,
    )
