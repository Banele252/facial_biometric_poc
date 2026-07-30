"""
Activate New SIM.

"As the system, I want to activate the replacement SIM and deactivate the
previous SIM so that service continuity is maintained."

This is a POC-level mock (per the UC019 notes: "How are we going to MOCK
this?") - there is no real MTN core/provisioning system integration here.
A small in-memory SimRegistry stands in for whatever system actually
tracks which SIM is active for a given MSISDN; swap in a real
activation/deactivation call before this leaves POC stage.

Only activates an order that was actually created by sim_swap_request.py
(looked up via the OrderStore) and is still in CREATED status - an
unknown order_id, or one that's already been activated or was rejected,
is refused rather than silently activated.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Protocol

from sim_swap_request import OrderStatus, OrderStore


class ActivationStatus(StrEnum):
    ACTIVATED = "ACTIVATED"
    REJECTED = "REJECTED"


@dataclass
class SimActivationResult:
    status: ActivationStatus
    order_id: str
    new_sim_serial: str | None = None
    previous_sim_serial: str | None = None
    activated_at: str | None = None
    reasons: list = field(default_factory=list)


class SimRegistry(Protocol):
    def get_active_sim(self, msisdn: str) -> str | None: ...

    def set_active_sim(self, msisdn: str, sim_serial: str) -> None: ...


class InMemorySimRegistry:
    """POC-only registry of which SIM is active per MSISDN. Not persisted."""

    def __init__(self) -> None:
        self._active_sims: dict[str, str] = {}

    def get_active_sim(self, msisdn: str) -> str | None:
        return self._active_sims.get(msisdn)

    def set_active_sim(self, msisdn: str, sim_serial: str) -> None:
        self._active_sims[msisdn] = sim_serial


def activate_new_sim(
    order_id: str,
    order_store: OrderStore,
    sim_registry: SimRegistry,
) -> SimActivationResult:
    """
    Activate the new SIM on a previously created order, deactivating
    whatever SIM was previously active for that MSISDN (if any - a fresh
    MSISDN with no prior activation in this registry has nothing to
    deactivate, which is not an error).
    """
    order = order_store.get(order_id)
    if order is None:
        return SimActivationResult(
            status=ActivationStatus.REJECTED,
            order_id=order_id,
            reasons=["No SIM Swap order found for this order_id."],
        )

    if order.status != OrderStatus.CREATED:
        return SimActivationResult(
            status=ActivationStatus.REJECTED,
            order_id=order_id,
            reasons=[f"Order status is {order.status.value}, expected CREATED."],
        )

    previous_sim_serial = sim_registry.get_active_sim(order.msisdn)
    sim_registry.set_active_sim(order.msisdn, order.new_sim_serial)

    order.status = OrderStatus.ACTIVATED
    order_store.save(order)

    return SimActivationResult(
        status=ActivationStatus.ACTIVATED,
        order_id=order_id,
        new_sim_serial=order.new_sim_serial,
        previous_sim_serial=previous_sim_serial,
        activated_at=datetime.now(UTC).isoformat(),
        reasons=[],
    )
