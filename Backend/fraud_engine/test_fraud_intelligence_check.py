# Backend/fraud_engine/test_risk_assessment.py
from __future__ import annotations

from Backend.fraud_engine.device_risk_check import DeviceRiskLevel, DeviceRiskResult
from Backend.fraud_engine.fraud_intelligence_check import FraudIntelligenceResult, FraudRiskLevel
from Backend.fraud_engine.risk_assessment import OverallRiskBand, calculate_risk_score


def make_device_risk(level: DeviceRiskLevel, reasons: list[str] | None = None) -> DeviceRiskResult:
    return DeviceRiskResult(
        risk_level=level,
        attempt_count_in_window=1,
        distinct_identities_in_window=1,
        reasons=reasons or [],
    )


def make_fraud_intel(
        level: FraudRiskLevel,
        reasons: list[str] | None = None,
        watchlist_hit: bool = False
) -> FraudIntelligenceResult:
    return FraudIntelligenceResult(
        risk_level=level,
        velocity_count_in_window=1,
        watchlist_hit=watchlist_hit,
        triggered_indicators=[],
        reasons=reasons or [],
    )


def test_both_low_gives_low_band_zero_score():
    result = calculate_risk_score(
        make_device_risk(DeviceRiskLevel.LOW),
        make_fraud_intel(FraudRiskLevel.LOW)
    )
    # 0 * 0.5 + 0 * 0.5 = 0
    assert result.score == 0.0
    assert result.band == OverallRiskBand.LOW
    assert result.contributing_factors == []


def test_both_high_gives_high_band_max_score():
    result = calculate_risk_score(
        make_device_risk(DeviceRiskLevel.HIGH),
        make_fraud_intel(FraudRiskLevel.HIGH)
    )
    # 100 * 0.5 + 100 * 0.5 = 100
    assert result.score == 100.0
    assert result.band == OverallRiskBand.HIGH


def test_one_medium_one_low_stays_in_low_band():
    result = calculate_risk_score(
        make_device_risk(DeviceRiskLevel.MEDIUM),
        make_fraud_intel(FraudRiskLevel.LOW)
    )
    # 50 * 0.5 + 0 * 0.5 = 25 (Below MEDIUM_BAND_THRESHOLD of 34)
    assert result.score == 25.0
    assert result.band == OverallRiskBand.LOW


def test_one_high_one_low_crosses_into_medium_band():
    result = calculate_risk_score(
        make_device_risk(DeviceRiskLevel.HIGH),
        make_fraud_intel(FraudRiskLevel.LOW)
    )
    # 100 * 0.5 + 0 * 0.5 = 50 (Between 34 and 67)
    assert result.score == 50.0
    assert result.band == OverallRiskBand.MEDIUM


def test_contributing_factors_are_combined():
    result = calculate_risk_score(
        make_device_risk(DeviceRiskLevel.MEDIUM, reasons=["device reason"]),
        make_fraud_intel(FraudRiskLevel.MEDIUM, reasons=["fraud reason"]),
    )
    assert "device reason" in result.contributing_factors
    assert "fraud reason" in result.contributing_factors
    assert len(result.contributing_factors) == 2