"""
Risk Assessment.

"As the fraud engine, I want to generate a fraud risk score so that SIM
Swap decisions are risk-based."

Combines Device Risk Checks (UC014) and Fraud Intelligence Checks (UC015)
into a single numeric risk score (0-100) and an overall risk band, so
Decisioning (UC017) has one consistent number to apply thresholds to
instead of juggling multiple independent signals itself.

Open product question (UC016 notes): with only the device check, there is
one signal to rank; once more fraud checks exist (UC015) their relative
seriousness needs to be agreed with the fraud team. The weighting below
(LEVEL_POINTS / *_WEIGHT) is a POC placeholder, not a calibrated
fraud-team scoring model - confirm before relying on it beyond the POC.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from device_risk_check import DeviceRiskResult
from fraud_intelligence_check import FraudIntelligenceResult

LEVEL_POINTS = {
    "LOW": 0,
    "MEDIUM": 50,
    "HIGH": 100,
}

# Relative weight of each signal in the combined score. Placeholder POC
# values - not agreed fraud-team weights.
DEVICE_RISK_WEIGHT = 0.5
FRAUD_INTELLIGENCE_WEIGHT = 0.5

MEDIUM_BAND_THRESHOLD = 34
HIGH_BAND_THRESHOLD = 67


class OverallRiskBand(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


@dataclass
class RiskScoreResult:
    score: float  # 0-100
    band: OverallRiskBand
    contributing_factors: list = field(default_factory=list)


def _band_for_score(score: float) -> OverallRiskBand:
    if score >= HIGH_BAND_THRESHOLD:
        return OverallRiskBand.HIGH
    if score >= MEDIUM_BAND_THRESHOLD:
        return OverallRiskBand.MEDIUM
    return OverallRiskBand.LOW


def calculate_risk_score(
    device_risk: DeviceRiskResult,
    fraud_intelligence: FraudIntelligenceResult,
) -> RiskScoreResult:
    device_points = LEVEL_POINTS[device_risk.risk_level.value]
    fraud_points = LEVEL_POINTS[fraud_intelligence.risk_level.value]

    score = round(device_points * DEVICE_RISK_WEIGHT + fraud_points * FRAUD_INTELLIGENCE_WEIGHT, 2)

    contributing_factors = list(device_risk.reasons) + list(fraud_intelligence.reasons)

    return RiskScoreResult(
        score=score,
        band=_band_for_score(score),
        contributing_factors=contributing_factors,
    )
