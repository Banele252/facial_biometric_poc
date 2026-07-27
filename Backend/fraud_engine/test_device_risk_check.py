from datetime import datetime, timedelta, timezone

from device_risk_check import (
    DeviceRiskLevel,
    InMemoryDeviceAttemptStore,
    assess_device_risk,
)

NOW = datetime(2026, 7, 27, 12, 0, 0, tzinfo=timezone.utc)


def test_first_attempt_on_new_device_is_low_risk():
    store = InMemoryDeviceAttemptStore()
    result = assess_device_risk("device-1", "9001015011082", store, now=NOW)
    assert result.risk_level == DeviceRiskLevel.LOW
    assert result.attempt_count_in_window == 1
    assert result.distinct_identities_in_window == 1
    assert result.reasons == []


def test_missing_device_id_is_high_risk():
    store = InMemoryDeviceAttemptStore()
    result = assess_device_risk("", "9001015011082", store, now=NOW)
    assert result.risk_level == DeviceRiskLevel.HIGH
    assert "No device identifier" in result.reasons[0]


def test_repeated_attempts_same_identity_is_medium_risk():
    store = InMemoryDeviceAttemptStore()
    for _ in range(4):
        result = assess_device_risk(
            "device-1", "9001015011082", store, now=NOW, max_attempts_per_window=3
        )
    assert result.attempt_count_in_window == 4
    assert result.risk_level == DeviceRiskLevel.MEDIUM


def test_many_distinct_identities_on_device_is_high_risk():
    store = InMemoryDeviceAttemptStore()
    for identity in ["id-a", "id-b", "id-c"]:
        result = assess_device_risk(
            "device-1", identity, store, now=NOW, max_distinct_identities_per_window=2
        )
    assert result.distinct_identities_in_window == 3
    assert result.risk_level == DeviceRiskLevel.HIGH


def test_attempts_outside_window_are_not_counted():
    store = InMemoryDeviceAttemptStore()
    old_attempt_time = NOW - timedelta(days=10)
    assess_device_risk("device-1", "id-a", store, now=old_attempt_time)

    result = assess_device_risk("device-1", "id-b", store, now=NOW, window_days=7)
    assert result.attempt_count_in_window == 1
    assert result.distinct_identities_in_window == 1
    assert result.risk_level == DeviceRiskLevel.LOW


def test_high_risk_takes_precedence_over_medium():
    store = InMemoryDeviceAttemptStore()
    for identity in ["id-a", "id-b", "id-c", "id-d"]:
        result = assess_device_risk(
            "device-1",
            identity,
            store,
            now=NOW,
            max_attempts_per_window=2,
            max_distinct_identities_per_window=2,
        )
    assert result.risk_level == DeviceRiskLevel.HIGH
