"""
Fraud Intelligence Checks.

"As the fraud engine, I want to evaluate velocity checks, watchlists and
fraud indicators so that high-risk requests are detected."

Three independent signals, each producing its own flag so the caller (Risk
Assessment) can see exactly which check tripped:

    - Velocity: how many SIM Swap attempts has this MSISDN made recently,
      regardless of device. Complements device_risk_check.py's per-device
      view with a per-subscriber-number view.
    - Watchlist: does the identity reference, MSISDN, or device ID appear
      on a known-fraud watchlist.
    - Indicators: a small set of named heuristic fraud indicators.

Open product question (raised, not yet answered, in the UC015 notes):
"What other fraud checks do we want for the POC besides the device check?"
This module implements velocity + a static watchlist + a couple of
placeholder indicators as a starting answer - confirm scope with the fraud
team before treating this as final.

Storage for velocity/watchlist is in-memory - same POC caveat as
device_risk_check.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Protocol

DEFAULT_VELOCITY_WINDOW_HOURS = 24
DEFAULT_MAX_ATTEMPTS_PER_MSISDN = 2


class FraudRiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


@dataclass
class FraudIntelligenceResult:
    risk_level: FraudRiskLevel
    velocity_count_in_window: int
    watchlist_hit: bool
    triggered_indicators: list = field(default_factory=list)
    reasons: list = field(default_factory=list)


class VelocityStore(Protocol):
    def record_attempt(self, msisdn: str, timestamp: datetime) -> None: ...

    def get_attempts_since(self, msisdn: str, since: datetime) -> list:
        pass


class InMemoryVelocityStore:
    """POC-only store. Data does not survive a process restart."""

    def __init__(self) -> None:
        self._attempts: dict[str, list] = {}

    def record_attempt(self, msisdn: str, timestamp: datetime) -> None:
        self._attempts.setdefault(msisdn, []).append(timestamp)

    def get_attempts_since(self, msisdn: str, since: datetime) -> list:
        return [t for t in self._attempts.get(msisdn, []) if t >= since]


class Watchlist:
    """Static in-memory watchlist of known-risky identifiers. POC only."""

    def __init__(self, entries: set | None = None) -> None:
        self._entries = {e.strip().lower() for e in (entries or set())}

    def add(self, entry: str) -> None:
        self._entries.add(entry.strip().lower())

    def contains(self, *candidates: str) -> bool:
        return any(c and c.strip().lower() in self._entries for c in candidates)


def _check_indicators(identity_reference: str, msisdn: str, device_id: str) -> list:
    """
    Placeholder fraud indicators for the POC. Each is a cheap, self-contained
    heuristic - extend this list as the fraud team defines more checks
    (UC015 notes: scope not yet finalized).
    """
    indicators = []
    if not msisdn:
        indicators.append("missing_msisdn")
    if not identity_reference:
        indicators.append("missing_identity_reference")
    if not device_id:
        indicators.append("missing_device_id")
    return indicators


def assess_fraud_intelligence(
    identity_reference: str,
    msisdn: str,
    device_id: str,
    velocity_store: VelocityStore,
    watchlist: Watchlist,
    now: datetime | None = None,
    velocity_window_hours: int = DEFAULT_VELOCITY_WINDOW_HOURS,
    max_attempts_per_msisdn: int = DEFAULT_MAX_ATTEMPTS_PER_MSISDN,
) -> FraudIntelligenceResult:
    now = now or datetime.now(UTC)

    velocity_store.record_attempt(msisdn, now)
    since = now - timedelta(hours=velocity_window_hours)
    velocity_count = len(velocity_store.get_attempts_since(msisdn, since))

    watchlist_hit = watchlist.contains(identity_reference, msisdn, device_id)
    triggered_indicators = _check_indicators(identity_reference, msisdn, device_id)

    reasons = []
    risk_level = FraudRiskLevel.LOW

    if watchlist_hit:
        risk_level = FraudRiskLevel.HIGH
        reasons.append("Identity, MSISDN, or device matched a fraud watchlist entry.")
    elif velocity_count > max_attempts_per_msisdn:
        risk_level = FraudRiskLevel.MEDIUM
        reasons.append(
            f"MSISDN made {velocity_count} SIM Swap attempts in the last "
            f"{velocity_window_hours}h (threshold {max_attempts_per_msisdn})."
        )
    elif triggered_indicators:
        risk_level = FraudRiskLevel.MEDIUM
        reasons.append(f"Fraud indicators triggered: {', '.join(triggered_indicators)}.")

    return FraudIntelligenceResult(
        risk_level=risk_level,
        velocity_count_in_window=velocity_count,
        watchlist_hit=watchlist_hit,
        triggered_indicators=triggered_indicators,
        reasons=reasons,
    )
