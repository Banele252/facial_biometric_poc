"""
Create SIM Swap Request.

"As the system, I want to create a SIM Swap order when verification and
fraud checks pass so that the new SIM can be activated."

This is a POC-level mock (per the UC018 notes: "How are we going to MOCK
this?") - there is no real MTN core/provisioning system integration here.
Order creation just writes to an in-memory store; swap in a real
provisioning call before this leaves POC stage.

Deliberately decoupled from the identity-verification and fraud-engine
modules elsewhere in this repo (no direct imports) - this service receives
their outcomes as plain data (VerificationStatus / FraudDecision), the way
it would receive them over an API call in a real deployment where these
are separate services. It only creates an order when BOTH gates pass:
verification ACCEPTED and fraud decision APPROVE. A fraud REFER does not
create an order here - per decisioning.py's UC017 policy, REFER means
branch/manual review, not an automatic order.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Protocol


class VerificationStatus(str, Enum):
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


class FraudDecision(str, Enum):
    APPROVE = "APPROVE"
    REFER = "REFER"
    REJECT = "REJECT"


class OrderStatus(str, Enum):
    CREATED = "CREATED"
    REJECTED = "REJECTED"  # gate failed - no order was created


@dataclass
class SimSwapOrder:
    order_id: str
    msisdn: str
    new_sim_serial: str
    identity_reference: str
    created_at: str


@dataclass
class SimSwapRequestResult:
    status: OrderStatus
    order: Optional[SimSwapOrder]
    reasons: list = field(default_factory=list)


class OrderStore(Protocol):
    def save(self, order: SimSwapOrder) -> None: ...

    def get(self, order_id: str) -> Optional[SimSwapOrder]: ...


class InMemoryOrderStore:
    """POC-only store. Data does not survive a process restart."""

    def __init__(self) -> None:
        self._orders: dict[str, SimSwapOrder] = {}

    def save(self, order: SimSwapOrder) -> None:
        self._orders[order.order_id] = order

    def get(self, order_id: str) -> Optional[SimSwapOrder]:
        return self._orders.get(order_id)


def create_sim_swap_request(
    msisdn: str,
    new_sim_serial: str,
    identity_reference: str,
    verification_status: VerificationStatus,
    fraud_decision: FraudDecision,
    store: OrderStore,
) -> SimSwapRequestResult:
    """
    Create a SIM Swap order, but only if verification passed and the fraud
    decision was APPROVE. Otherwise return a REJECTED result explaining why,
    without touching the store.
    """
    reasons = []
    if verification_status != VerificationStatus.ACCEPTED:
        reasons.append("Identity verification did not pass.")
    if fraud_decision != FraudDecision.APPROVE:
        reasons.append(f"Fraud decision was {fraud_decision.value}, not APPROVE.")

    if reasons:
        return SimSwapRequestResult(status=OrderStatus.REJECTED, order=None, reasons=reasons)

    order = SimSwapOrder(
        order_id=str(uuid.uuid4()),
        msisdn=msisdn,
        new_sim_serial=new_sim_serial,
        identity_reference=identity_reference,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    store.save(order)

    return SimSwapRequestResult(status=OrderStatus.CREATED, order=order, reasons=[])
