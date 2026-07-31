from Backend.fraud_engine.device_risk_check import DeviceRiskLevel, DeviceRiskResult
from Backend.fraud_engine.fraud_intelligence_check import FraudIntelligenceResult, FraudRiskLevel
from Backend.fraud_engine.risk_assessment import OverallRiskBand, calculate_risk_score


def make_device_risk(level, reasons=None):
    return DeviceRiskResult(
        risk_level=level,
        attempt_count_in_window=1,
        distinct_identities_in_window=1,
        reasons=reasons or [],
    )


def make_fraud_intel(level, reasons=None, watchlist_hit=False):
    return FraudIntelligenceResult(
        risk_level=level,
        velocity_count_in_window=1,
        watchlist_hit=watchlist_hit,
        reasons=reasons or [],
    )


def test_both_low_gives_low_band_zero_score():
    result = calculate_risk_score(
        make_device_risk(DeviceRiskLevel.LOW), make_fraud_intel(FraudRiskLevel.LOW)
    )
    assert result.score == 0
    assert result.band == OverallRiskBand.LOW


def test_both_high_gives_high_band_max_score():
    result = calculate_risk_score(
        make_device_risk(DeviceRiskLevel.HIGH), make_fraud_intel(FraudRiskLevel.HIGH)
    )
    assert result.score == 100
    assert result.band == OverallRiskBand.HIGH


def test_one_medium_one_low_stays_in_low_band():
    result = calculate_risk_score(
        make_device_risk(DeviceRiskLevel.MEDIUM), make_fraud_intel(FraudRiskLevel.LOW)
    )
    assert result.score == 25
    assert result.band == OverallRiskBand.LOW


def test_one_high_one_low_crosses_into_medium_band():
    result = calculate_risk_score(
        make_device_risk(DeviceRiskLevel.HIGH), make_fraud_intel(FraudRiskLevel.LOW)
    )
    assert result.score == 50
    assert result.band == OverallRiskBand.MEDIUM


def test_contributing_factors_are_combined():
    result = calculate_risk_score(
        make_device_risk(DeviceRiskLevel.MEDIUM, reasons=["device reason"]),
        make_fraud_intel(FraudRiskLevel.MEDIUM, reasons=["fraud reason"]),
    )
    assert "device reason" in result.contributing_factors
    assert "fraud reason" in result.contributing_factors
