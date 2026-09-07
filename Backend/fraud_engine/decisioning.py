# Backend/fraud_engine/decisioning.py
"""
Decisioning.
Applies thresholds to the combined Risk Assessment output to produce a final
APPROVE / REFER / REJECT decision.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from Backend.fraud_engine.fraud_intelligence_check import FraudIntelligenceResult
from Backend.fraud_engine.risk_assessment import OverallRiskBand, RiskScoreResult


class FraudDecision(StrEnum):
    APPROVE = "APPROVE"
    REFER = "REFER"
    REJECT = "REJECT"


@dataclass
class DecisionResult:
    decision: FraudDecision
    risk_score: float
    reasons: list[str] = field(default_factory=list)


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