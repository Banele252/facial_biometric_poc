"""
Decisioning.

"As the fraud engine, I want to approve, refer or reject requests based on
risk thresholds so that fraud exposure is minimized."

Takes the combined Risk Assessment (UC016) output and applies thresholds to
produce a final APPROVE / REFER / REJECT decision.

This is where the open question from UC014's notes gets resolved for the
POC: a risky device does not, by itself, hard-block a genuine customer.
MEDIUM/HIGH overall risk is REFERred (send the customer to a branch /
manual review) rather than REJECTed outright - REJECT is reserved for a
fraud-watchlist hit, which is a materially stronger signal than
volume-based risk scoring. This is a POC policy choice, not a confirmed
fraud-team decision - flag it for sign-off before relying on it beyond
the POC.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from fraud_intelligence_check import FraudIntelligenceResult
from risk_assessment import OverallRiskBand, RiskScoreResult


class FraudDecision(str, Enum):
    APPROVE = "APPROVE"
    REFER = "REFER"
    REJECT = "REJECT"


@dataclass
class DecisionResult:
    decision: FraudDecision
    risk_score: float
    reasons: list = field(default_factory=list)


def decide(
    risk_result: RiskScoreResult,
    fraud_intelligence: FraudIntelligenceResult,
) -> DecisionResult:
    if fraud_intelligence.watchlist_hit:
        return DecisionResult(
            decision=FraudDecision.REJECT,
            risk_score=risk_result.score,
            reasons=["Watchlist match - request rejected."] + risk_result.contributing_factors,
        )

    if risk_result.band in (OverallRiskBand.MEDIUM, OverallRiskBand.HIGH):
        decision = FraudDecision.REFER
    else:
        decision = FraudDecision.APPROVE

    return DecisionResult(
        decision=decision,
        risk_score=risk_result.score,
        reasons=risk_result.contributing_factors,
    )
