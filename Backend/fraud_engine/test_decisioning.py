from Backend.fraud_engine.decisioning import FraudDecision, decide
from Backend.fraud_engine.fraud_intelligence_check import FraudIntelligenceResult, FraudRiskLevel
from Backend.fraud_engine.risk_assessment import OverallRiskBand, RiskScoreResult


def make_risk_result(band, score=0, factors=None):
    return RiskScoreResult(score=score, band=band, contributing_factors=factors or [])


def make_fraud_intel(watchlist_hit=False):
    return FraudIntelligenceResult(
        risk_level=FraudRiskLevel.LOW,
        velocity_count_in_window=1,
        watchlist_hit=watchlist_hit,
    )


def test_low_band_approves():
    result = decide(make_risk_result(OverallRiskBand.LOW), make_fraud_intel())
    assert result.decision == FraudDecision.APPROVE


def test_medium_band_refers():
    result = decide(make_risk_result(OverallRiskBand.MEDIUM), make_fraud_intel())
    assert result.decision == FraudDecision.REFER


def test_high_band_refers_not_rejects():
    result = decide(make_risk_result(OverallRiskBand.HIGH), make_fraud_intel())
    assert result.decision == FraudDecision.REFER


def test_watchlist_hit_rejects_regardless_of_band():
    result = decide(make_risk_result(OverallRiskBand.LOW), make_fraud_intel(watchlist_hit=True))
    assert result.decision == FraudDecision.REJECT
    assert "Watchlist match" in result.reasons[0]
