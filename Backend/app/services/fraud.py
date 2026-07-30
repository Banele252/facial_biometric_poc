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

Both stores are in-memory and do not survive a restart, so velocity and
repeat-device signals only span the life of the process. That is the engine's
own POC limitation, carried over rather than papered over: persisting them
means giving the fraud engine its own tables, which is a decision for whoever
takes this past the POC.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

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


def get_watchlist() -> Watchlist:
    """The shared watchlist, exposed so a demo can seed a known-risky entry."""
    return _watchlist


def run_fraud_checks(identity_reference: str, msisdn: str, device_id: str) -> FraudOutcome:
    """Run device risk, fraud intelligence, scoring and decisioning."""
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
