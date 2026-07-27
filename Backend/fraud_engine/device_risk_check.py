"""
Device Risk Checks.

"As the fraud engine, I want to assess the customer's device risk profile
so that suspicious requests can be identified."

This module only produces a risk signal (LOW/MEDIUM/HIGH + reasons) for a
device attempting a SIM Swap - it does NOT itself approve/refer/reject a
request. That final call belongs to the later fraud-engine stages (Risk
Assessment / Decisioning), once this signal is combined with the other
fraud checks. Deliberately kept separate from UC004's "Reject Non-Matching
Records" (RICA-mismatch rejection) - a risky device and a non-matching
subscriber record are different failure modes with potentially different
remediation paths for the customer.

Open product questions this module makes explicit, POC-level assumptions
about (raised in the use-case dependency notes, still worth confirming with
the team before this goes further):

    - Device identification: this POC accepts a client-supplied
      `device_id` (e.g. a UUID the MyMTN App generates and persists on
      first install). It does not do real hardware/IMEI fingerprinting.
    - Storage: attempts are tracked in-memory via `DeviceAttemptStore`
      (a small pluggable interface) rather than a real database. Swap in a
      persistent-store implementation before this leaves POC stage.
    - Attempt window: defaults to a 7-day rolling window, matching UC008's
      failed-verification lookback for consistency. Not yet confirmed by
      the team.
    - Risk thresholds (`max_attempts_per_window`,
      `max_distinct_identities_per_window`) are placeholder defaults, not
      agreed fraud-team numbers.
    - Whether a HIGH-risk device should hard-block the SIM Swap outright,
      or only refer it (letting a genuine customer retry on a different
      device) is explicitly NOT decided here - it's a Decisioning (UC017)
      policy choice once this risk signal exists. This module just reports
      the risk.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Protocol

DEFAULT_WINDOW_DAYS = 7
DEFAULT_MAX_ATTEMPTS_PER_WINDOW = 3
DEFAULT_MAX_DISTINCT_IDENTITIES_PER_WINDOW = 2


class DeviceRiskLevel(str, Enum):
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
    reasons: list = field(default_factory=list)


class DeviceAttemptStore(Protocol):
    """
    Storage interface for device SIM-swap attempt history. Implement this
    against a real database when moving past POC stage - the risk logic
    below only depends on this interface, not on how attempts are stored.
    """

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
    """
    Record this SIM-swap attempt against the device and assess its risk
    based on recent history.

    Two signals are checked:
      - Raw attempt volume on the device within the window (a device being
        used for repeated SIM swap attempts, even for the same customer,
        is unusual).
      - Distinct identities that have attempted a SIM swap on this device
        within the window (a device used across many different customers
        is a stronger fraud signal - e.g. a "fraud farm" device - and is
        weighted as HIGH rather than MEDIUM).
    """
    if not device_id:
        return DeviceRiskResult(
            risk_level=DeviceRiskLevel.HIGH,
            attempt_count_in_window=0,
            distinct_identities_in_window=0,
            reasons=["No device identifier was supplied."],
        )

    now = now or datetime.now(timezone.utc)
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
