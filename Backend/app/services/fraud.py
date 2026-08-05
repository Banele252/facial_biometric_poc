"""Fraud checks — CARB journey step 9 (Fraud Intelligence Checks).

Composes the four checks the fraud engine provides into the one call the
journey needs:

    device risk  ─┐
                  ├─► risk score ─► decision (APPROVE / REFER / REJECT)
    fraud intel  ─┘

The engine's own policy is preserved: a watchlist hit is the only hard
rejection. Volume-based risk lands on REFER, because a risky-looking device
should not by itself turn away a genuine customer — that judgement belongs to
a human. See ``fraud_engine/decisioning.py``.

The velocity and repeat-device stores are in-memory and do not survive a
restart, so those two signals only span the life of the process. That is the
engine's own POC limitation, carried over rather than papered over.

The recent-rejections check is the exception and is persisted, because it is
the one signal that is worthless in memory: the diagram's "check against recent
(7 days) rejected requests" exists to catch someone who was refused and came
back, which is precisely the case where the earlier rejection is likely to sit
behind a restart or on another replica.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from Backend.app import repository
from Backend.app.config import get_settings
from Backend.fraud_engine.decisioning import FraudDecision, decide
from Backend.fraud_engine.device_risk_check import (
    InMemoryDeviceAttemptStore,
    assess_device_risk,
)
from Backend.fraud_engine.fraud_intelligence_check import (
    InMemoryVelocityStore,
    Watchlist,
    assess_fraud_intelligence,
)
from Backend.fraud_engine.risk_assessment import calculate_risk_score

logger = logging.getLogger(__name__)

# Process-lifetime stores, shared across requests so velocity counting works
# at all. Documented limitation above.
_device_store = InMemoryDeviceAttemptStore()
_velocity_store = InMemoryVelocityStore()
_watchlist = Watchlist()


# Journey outcomes, matching the vocabulary used by the orchestrator.
APPROVED = "approved"
REJECTED = "rejected"
REVIEW = "review"

_DECISION_MAP = {
    FraudDecision.APPROVE: APPROVED,
    FraudDecision.REFER: REVIEW,
    FraudDecision.REJECT: REJECTED,
}


@dataclass(frozen=True)
class FraudOutcome:
    outcome: str
    decision: str
    risk_score: float
    reasons: tuple[str, ...]
    detail: str


def reset_stores() -> None:
    """Clear the in-process fraud history.

    Velocity and repeat-device signals are cumulative by design, so the stores
    deliberately persist across requests. Tests need each case to start from a
    clean slate, otherwise earlier cases push later ones over the thresholds.
    """
    global _device_store, _velocity_store, _watchlist
    _device_store = InMemoryDeviceAttemptStore()
    _velocity_store = InMemoryVelocityStore()
    _watchlist = Watchlist()


def get_watchlist() -> Watchlist:
    """The shared watchlist, exposed so a demo can seed a known-risky entry."""
    return _watchlist


def _assess_recent_rejections(
    identity_reference: str, msisdn: str, device_id: str
) -> tuple[int, str | None]:
    """Count recent rejections and say what, if anything, they mean.

    Returns the count and an outcome (``REJECTED``/``REVIEW``) or None when the
    history is clean. Reading the repository is best-effort: a database that
    cannot be reached should not take down a journey that has other evidence,
    so a failure here logs and reports a clean history.
    """
    settings = get_settings()
    window = settings.recent_rejection_window_days
    tolerance = settings.max_recent_rejections

    # A zero-day window disables the check entirely, which is the honest way to
    # turn it off for a demo rather than leaving it on and misreading why every
    # second attempt lands in review.
    if window == 0:
        return 0, None

    since = (datetime.now(UTC) - timedelta(days=window)).isoformat()
    try:
        count = repository.count_recent_rejections(
            id_number=identity_reference,
            since_iso=since,
            msisdn=msisdn or None,
            device_id=device_id or None,
        )
    except Exception as exc:  # database unavailable, table missing, etc.
        logger.warning("Recent-rejection check unavailable: %s", exc)
        return 0, None

    # Well past the tolerance and still trying: beyond the point where a
    # genuine customer with a bad camera is the likely explanation.
    if count > tolerance * 2:
        return count, REJECTED
    # Over the tolerance but not egregious — a human should look, rather than
    # the customer being turned away by arithmetic.
    if count > tolerance:
        return count, REVIEW
    return count, None


def run_fraud_checks(identity_reference: str, msisdn: str, device_id: str) -> FraudOutcome:
    """Run the pre-checks: recent rejections, device risk, fraud intelligence."""
    recent_rejections, rejection_outcome = _assess_recent_rejections(
        identity_reference, msisdn, device_id
    )
    if rejection_outcome == REJECTED:
        window = get_settings().recent_rejection_window_days
        detail = f"{recent_rejections} rejected requests in the last {window} days"
        logger.info(
            "Fraud checks completed: recent_rejections=%s decision=REJECT", recent_rejections
        )
        return FraudOutcome(
            outcome=REJECTED,
            decision="REJECT",
            risk_score=100.0,
            reasons=(detail,),
            detail=detail,
        )

    device = assess_device_risk(
        device_id=device_id,
        identity_reference=identity_reference,
        store=_device_store,
    )
    intel = assess_fraud_intelligence(
        identity_reference=identity_reference,
        msisdn=msisdn,
        device_id=device_id,
        velocity_store=_velocity_store,
        watchlist=_watchlist,
    )
    risk = calculate_risk_score(device_risk=device, fraud_intelligence=intel)
    result = decide(risk_result=risk, fraud_intelligence=intel)

    outcome = _DECISION_MAP.get(result.decision, REVIEW)
    reasons = tuple(str(r) for r in result.reasons)

    # Recent rejections do not override a clean assessment into a refusal, but
    # they do stop it going straight through.
    if rejection_outcome == REVIEW and outcome == APPROVED:
        outcome = REVIEW
        plural = "s" if recent_rejections != 1 else ""
        window = get_settings().recent_rejection_window_days
        reasons = (
            f"{recent_rejections} rejected request{plural} in the last {window} days",
            *reasons,
        )

    if outcome == APPROVED:
        detail = f"No fraud indicators (risk score {result.risk_score:.0f})"
    elif outcome == REJECTED:
        detail = reasons[0] if reasons else "Rejected by fraud checks"
    else:
        detail = (
            f"Risk score {result.risk_score:.0f} — referred for review"
            if not reasons
            else reasons[0]
        )

    logger.info(
        "Fraud checks completed: decision=%s score=%s device_risk=%s watchlist_hit=%s",
        result.decision,
        result.risk_score,
        device.risk_level,
        intel.watchlist_hit,
    )
    return FraudOutcome(
        outcome=outcome,
        decision=str(result.decision),
        risk_score=result.risk_score,
        reasons=reasons,
        detail=detail,
    )
