from datetime import UTC, datetime, timedelta

from Backend.fraud_engine.fraud_intelligence_check import (
    FraudRiskLevel,
    InMemoryVelocityStore,
    Watchlist,
    assess_fraud_intelligence,
)

NOW = datetime(2026, 7, 27, 12, 0, 0, tzinfo=UTC)


def test_single_attempt_is_low_risk():
    result = assess_fraud_intelligence(
        "9001015011082",
        "27821234567",
        "device-1",
        InMemoryVelocityStore(),
        Watchlist(),
        now=NOW,
    )
    assert result.risk_level == FraudRiskLevel.LOW
    assert result.watchlist_hit is False
    assert result.velocity_count_in_window == 1


def test_watchlist_hit_is_high_risk():
    watchlist = Watchlist({"27821234567"})
    result = assess_fraud_intelligence(
        "9001015011082",
        "27821234567",
        "device-1",
        InMemoryVelocityStore(),
        watchlist,
        now=NOW,
    )
    assert result.risk_level == FraudRiskLevel.HIGH
    assert result.watchlist_hit is True
    assert "watchlist" in result.reasons[0].lower()


def test_high_velocity_msisdn_is_medium_risk():
    store = InMemoryVelocityStore()
    for _ in range(3):
        result = assess_fraud_intelligence(
            "9001015011082",
            "27821234567",
            "device-1",
            store,
            Watchlist(),
            now=NOW,
            max_attempts_per_msisdn=2,
        )
    assert result.velocity_count_in_window == 3
    assert result.risk_level == FraudRiskLevel.MEDIUM


def test_missing_fields_trigger_indicators():
    result = assess_fraud_intelligence(
        "",
        "27821234567",
        "device-1",
        InMemoryVelocityStore(),
        Watchlist(),
        now=NOW,
    )
    assert "missing_identity_reference" in result.triggered_indicators
    assert result.risk_level == FraudRiskLevel.MEDIUM


def test_velocity_outside_window_not_counted():
    store = InMemoryVelocityStore()
    assess_fraud_intelligence(
        "id-a",
        "27821234567",
        "device-1",
        store,
        Watchlist(),
        now=NOW - timedelta(hours=48),
    )
    result = assess_fraud_intelligence(
        "id-a",
        "27821234567",
        "device-1",
        store,
        Watchlist(),
        now=NOW,
        velocity_window_hours=24,
    )
    assert result.velocity_count_in_window == 1
