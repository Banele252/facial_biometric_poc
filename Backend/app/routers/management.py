# Backend/app/routers/management.py
"""Console read surface.

Serves the three views in the management console. Read-only by design:
nothing here mutates state, so the console's service account never needs a
write scope and a leaked console token cannot move a SIM swap.

Response shapes are fixed by the console's hooks:

    /audit-logs         -> console/src/hooks/useAuditLogs.ts
    /fraud-intelligence -> console/src/hooks/useFraudStats.ts
    /transactions       -> console/src/hooks/useTransactions.ts

Field names are snake_case; the console adapts them to its view models.
Changing a name here breaks the console silently -- the field arrives as
undefined rather than erroring -- so treat these as a contract.

DATA ACCESS: each endpoint delegates to one `_load_*` function below.
Those are the only places that touch persistence. They are written against
the audit repository interface; adjust the queries to match your models
without touching the route handlers.
"""
from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/management", tags=["management"])

MAX_LIMIT = 500


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class AuditLogEntryOut(BaseModel):
    """Mirrors the mobile AuditService wire shape, plus server stamps.

    received_at and environment are added at ingest. The console prefers
    received_at over the device's timestamp for anything evidential --
    the device clock is attacker-controlled on a rooted handset.
    """
    event_id: str
    event_type: str
    timestamp: str
    session_id: str
    user_id: str | None = None
    msisdn: str | None = None
    device_id: str
    app_version: str
    os_version: str
    screen: str | None = None
    action: str | None = None
    outcome: Literal["success", "failure", "blocked", "pending"] | None = None
    reason: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    integrity_hash: str
    previous_hash: str | None = None
    source: str = "mobile"

    received_at: str | None = None
    environment: str | None = None
    batch_hash: str | None = None


class AuditLogPage(BaseModel):
    entries: list[AuditLogEntryOut]
    next_cursor: str | None = None
    total: int | None = None


class RiskTrendPoint(BaseModel):
    date: str
    score: float


class FraudIdentityOut(BaseModel):
    identity_ref: str
    msisdn: str
    outcome: Literal["approved", "rejected", "review", "pending", "flagged"]
    decision: Literal["APPROVE", "REJECT", "REFER"]
    risk_score: float
    reasons: list[str] = Field(default_factory=list)
    timestamp: str


class FraudSummaryOut(BaseModel):
    approved: int
    review: int
    rejected: int
    risk_trend: list[RiskTrendPoint]
    identities: list[FraudIdentityOut]


class VolumePoint(BaseModel):
    date: str
    approved: int
    flagged: int
    pending: int


class TransactionOut(BaseModel):
    order_id: str
    msisdn: str
    identity_ref: str
    verification: Literal["ACCEPTED", "REJECTED"]
    fraud_decision: Literal["APPROVE", "REJECT", "REFER"]
    risk_score: float
    timestamp: str
    outcome: Literal["approved", "rejected", "review", "pending", "flagged"]


class TransactionSummaryOut(BaseModel):
    total: int
    approved: int
    flagged: int
    volume: list[VolumePoint]
    orders: list[TransactionOut]


# ---------------------------------------------------------------------------
# Data access — the only functions that touch persistence
# ---------------------------------------------------------------------------

def _load_audit_entries(
    *,
    session_id: str | None,
    msisdn: str | None,
    event_type: str | None,
    outcome: str | None,
    since: datetime | None,
    until: datetime | None,
    limit: int,
    cursor: str | None,
) -> tuple[list[dict], str | None, int | None]:
    """Return (entries, next_cursor, total).

    Order by received_at DESC, event_id DESC. Two reasons:

    1. Keyset pagination needs a stable total order; received_at alone is
       not unique under a batch insert, so rows can repeat or vanish
       between pages.
    2. Ordering by the device timestamp would let a handset with a skewed
       clock inject rows at the top of an operator's screen.

    Cursor is an opaque encoding of the last (received_at, event_id) seen.
    """
    from Backend.app.repository import get_audit_entries  # type: ignore

    return get_audit_entries(
        session_id=session_id,
        msisdn=msisdn,
        event_type=event_type,
        outcome=outcome,
        since=since,
        until=until,
        limit=limit,
        cursor=cursor,
    )


def _load_fraud_decisions(since: datetime) -> list[dict]:
    """Fraud decisions since `since`.

    Expected keys per row: identity_ref, msisdn, decision, risk_score,
    reasons (list[str]), created_at (datetime).
    """
    from Backend.app.repository import get_fraud_decisions  # type: ignore

    return get_fraud_decisions(since=since)


def _load_sim_swap_orders(since: datetime) -> list[dict]:
    """SIM swap orders since `since`.

    Expected keys per row: order_id, msisdn, identity_ref, verification,
    fraud_decision, risk_score, status, created_at (datetime).
    """
    from Backend.app.repository import get_sim_swap_orders  # type: ignore

    return get_sim_swap_orders(since=since)


# ---------------------------------------------------------------------------
# Derivations
# ---------------------------------------------------------------------------

DECISION_TO_OUTCOME = {
    "APPROVE": "approved",
    "REJECT": "rejected",
    "REFER": "review",
}

STATUS_TO_OUTCOME = {
    "completed": "approved",
    "approved": "approved",
    "rejected": "flagged",
    "flagged": "flagged",
    "pending": "pending",
    "review": "review",
}


def _day(value: datetime) -> str:
    return value.date().isoformat()


def _window_start(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/audit-logs", response_model=AuditLogPage)
def audit_logs(
    session_id: str | None = None,
    msisdn: str | None = None,
    event_type: str | None = None,
    outcome: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(200, ge=1, le=MAX_LIMIT),
    cursor: str | None = None,
) -> AuditLogPage:
    entries, next_cursor, total = _load_audit_entries(
        session_id=session_id,
        msisdn=msisdn,
        event_type=event_type,
        outcome=outcome,
        since=since,
        until=until,
        limit=limit,
        cursor=cursor,
    )

    return AuditLogPage(
        entries=[AuditLogEntryOut(**entry) for entry in entries],
        next_cursor=next_cursor,
        total=total,
    )


@router.get("/fraud-intelligence", response_model=FraudSummaryOut)
def fraud_intelligence(
    days: int = Query(14, ge=1, le=90),
) -> FraudSummaryOut:
    since = _window_start(days)
    rows = _load_fraud_decisions(since)

    counts = Counter(row["decision"] for row in rows)

    # Mean risk score per day. Mean rather than max: one REJECT at 95
    # would otherwise pin the whole trend line to the top and hide the
    # movement an analyst is looking for.
    by_day: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        by_day[_day(row["created_at"])].append(float(row["risk_score"]))

    trend = [
        RiskTrendPoint(
            date=day,
            score=round(sum(scores) / len(scores), 1),
        )
        for day, scores in sorted(by_day.items())
    ]

    identities = [
        FraudIdentityOut(
            identity_ref=row["identity_ref"],
            msisdn=row["msisdn"],
            outcome=DECISION_TO_OUTCOME.get(row["decision"], "review"),
            decision=row["decision"],
            risk_score=float(row["risk_score"]),
            reasons=list(row.get("reasons") or []),
            timestamp=row["created_at"].isoformat(),
        )
        for row in sorted(
            rows,
            key=lambda item: item["created_at"],
            reverse=True,
        )[:100]
    ]

    return FraudSummaryOut(
        approved=counts.get("APPROVE", 0),
        review=counts.get("REFER", 0),
        rejected=counts.get("REJECT", 0),
        risk_trend=trend,
        identities=identities,
    )


@router.get("/transactions", response_model=TransactionSummaryOut)
def transactions(
    days: int = Query(12, ge=1, le=90),
) -> TransactionSummaryOut:
    since = _window_start(days)
    rows = _load_sim_swap_orders(since)

    orders = [
        TransactionOut(
            order_id=row["order_id"],
            msisdn=row["msisdn"],
            identity_ref=row["identity_ref"],
            verification=row["verification"],
            fraud_decision=row["fraud_decision"],
            risk_score=float(row["risk_score"]),
            timestamp=row["created_at"].isoformat(),
            outcome=STATUS_TO_OUTCOME.get(
                str(row["status"]).lower(),
                "pending",
            ),
        )
        for row in sorted(
            rows,
            key=lambda item: item["created_at"],
            reverse=True,
        )
    ]

    buckets: dict[str, Counter] = defaultdict(Counter)
    for order in orders:
        day = order.timestamp[:10]
        if order.outcome in ("approved", "flagged", "pending"):
            buckets[day][order.outcome] += 1
        else:
            # rejected/review both read as "needs attention" on the chart.
            buckets[day]["flagged"] += 1

    volume = [
        VolumePoint(
            date=day,
            approved=counts["approved"],
            flagged=counts["flagged"],
            pending=counts["pending"],
        )
        for day, counts in sorted(buckets.items())
    ]

    outcome_counts = Counter(order.outcome for order in orders)

    return TransactionSummaryOut(
        total=len(orders),
        approved=outcome_counts["approved"],
        flagged=outcome_counts["flagged"],
        volume=volume,
        # Cap the table payload; the chart already carries the full window.
        orders=orders[:100],
    )
