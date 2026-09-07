# Backend/fraud_engine/device_risk_check.py
"""
Device Risk Checks.
Assesses the customer's device risk profile based on recent SIM swap attempt
volume and distinct identities used on the device.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Protocol

DEFAULT_WINDOW_DAYS = 7
DEFAULT_MAX_ATTEMPTS_PER_WINDOW = 3
DEFAULT_MAX_DISTINCT_IDENTITIES_PER_WINDOW = 2

logger = logging.getLogger(__name__)


class DeviceRiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


@dataclass
class DeviceAttempt:
    identity_reference: str
    timestamp: datetime


@dataclass
class DeviceRiskResult:
    risk_level: DeviceRiskLevel
    attempt_count_in_window: int
    distinct_identities_in_window: int
    reasons: list[str] = field(default_factory=list)


class DeviceAttemptStore(Protocol):
    def record_attempt(self, device_id: str, identity_reference: str, timestamp: datetime) -> None: ...
    def get_attempts_since(self, device_id: str, since: datetime) -> list[DeviceAttempt]: ...


class InMemoryDeviceAttemptStore:
    """POC-only store. Data does not survive a process restart."""
    def __init__(self) -> None:
        self._attempts: dict[str, list[DeviceAttempt]] = {}

    def record_attempt(self, device_id: str, identity_reference: str, timestamp: datetime) -> None:
        self._attempts.setdefault(device_id, []).append(
            DeviceAttempt(identity_reference=identity_reference, timestamp=timestamp)
        )

    def get_attempts_since(self, device_id: str, since: datetime) -> list[DeviceAttempt]:
        return [a for a in self._attempts.get(device_id, []) if a.timestamp >= since]


def assess_device_risk(
        device_id: str,
        identity_reference: str,
        store: DeviceAttemptStore,
        now: datetime | None = None,
        window_days: int = DEFAULT_WINDOW_DAYS,
        max_attempts_per_window: int = DEFAULT_MAX_ATTEMPTS_PER_WINDOW,
        max_distinct_identities_per_window: int = DEFAULT_MAX_DISTINCT_IDENTITIES_PER_WINDOW,
) -> DeviceRiskResult:
    if not device_id:
        return DeviceRiskResult(
            risk_level=DeviceRiskLevel.HIGH,
            attempt_count_in_window=0,
            distinct_identities_in_window=0,
            reasons=["No device identifier was supplied."],
        )

    now = now or datetime.now(UTC)
    store.record_attempt(device_id, identity_reference, now)

    since = now - timedelta(days=window_days)
    attempts = store.get_attempts_since(device_id, since)

    attempt_count = len(attempts)
    distinct_identities = len({a.identity_reference for a in attempts})

    reasons: list[str] = []
    risk_level = DeviceRiskLevel.LOW

    if distinct_identities > max_distinct_identities_per_window:
        risk_level = DeviceRiskLevel.HIGH
        reasons.append(
            f"Device used by {distinct_identities} distinct identities in the last "
            f"{window_days} days (threshold {max_distinct_identities_per_window})."
        )
    elif attempt_count > max_attempts_per_window:
        risk_level = DeviceRiskLevel.MEDIUM
        reasons.append(
            f"Device made {attempt_count} SIM Swap attempts in the last {window_days} days "
            f"(threshold {max_attempts_per_window})."
        )

    return DeviceRiskResult(
        risk_level=risk_level,
        attempt_count_in_window=attempt_count,
        distinct_identities_in_window=distinct_identities,
        reasons=reasons,
    )