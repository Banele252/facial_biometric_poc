"""SIM swap order creation — CARB journey steps 10 and 11.

The last step of the journey: once identity is verified and the fraud checks
pass, a SIM swap order is created. The gate itself lives in
``sim_swap_service/sim_swap_request.py`` and is used unchanged — it refuses to
create an order unless both inputs are positive, which is the control that
matters here.

Orders are persisted to ``sim_swap_orders`` rather than kept in the service's
``InMemoryOrderStore``, so an order survives a restart and can be looked up
afterwards. Losing the record of a completed swap would be worse than not
recording it at all, because the customer's SIM has already changed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from Backend.app.db import get_db, utcnow_iso
from Backend.sim_swap_service.sim_swap_activation import activate_new_sim
from Backend.sim_swap_service.sim_swap_request import (
    FraudDecision,
    OrderStatus,
    SimSwapOrder,
    VerificationStatus,
    create_sim_swap_request,
)

logger = logging.getLogger(__name__)


class DatabaseOrderStore:
    """Order store backed by the application database.

    Satisfies the ``OrderStore`` protocol the gate expects, so the gating logic
    is reused exactly as written.
    """

    def save(self, order: SimSwapOrder) -> None:
        """Insert the order, or update its status if it already exists.

        Activation mutates ``order.status`` and calls ``save`` again, so this
        has to be an upsert rather than a plain insert.
        """
        existing = get_db().query_one(
            "SELECT order_id FROM sim_swap_orders WHERE order_id = ?", (order.order_id,)
        )
        if existing:
            get_db().execute(
                "UPDATE sim_swap_orders SET status = ? WHERE order_id = ?",
                (str(order.status), order.order_id),
            )
            return
        get_db().execute(
            "INSERT INTO sim_swap_orders "
            "(order_id, msisdn, new_sim_serial, identity_reference, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                order.order_id,
                order.msisdn,
                order.new_sim_serial,
                order.identity_reference,
                str(order.status or OrderStatus.CREATED),
                order.created_at or utcnow_iso(),
            ),
        )

    def get(self, order_id: str) -> SimSwapOrder | None:
        """Rehydrate the order. The protocol expects the dataclass, not a row —
        activation reads ``order.status`` and reassigns it."""
        row = get_db().query_one("SELECT * FROM sim_swap_orders WHERE order_id = ?", (order_id,))
        if row is None:
            return None
        return SimSwapOrder(
            order_id=row["order_id"],
            msisdn=row["msisdn"],
            new_sim_serial=row["new_sim_serial"],
            identity_reference=row["identity_reference"],
            created_at=row["created_at"],
            status=OrderStatus(row["status"]),
        )


class DatabaseSimRegistry:
    """Which SIM is live on a number, backed by the database.

    Satisfies the ``SimRegistry`` protocol. Persisted rather than in-memory
    because the previous serial is what makes an activation reversible — an
    in-memory registry forgets it on restart and the number looks as though it
    was never swapped.
    """

    def get_active_sim(self, msisdn: str) -> str | None:
        row = get_db().query_one("SELECT sim_serial FROM active_sims WHERE msisdn = ?", (msisdn,))
        return row["sim_serial"] if row else None

    def set_active_sim(self, msisdn: str, sim_serial: str) -> None:
        now = utcnow_iso()
        if self.get_active_sim(msisdn) is None:
            get_db().execute(
                "INSERT INTO active_sims (msisdn, sim_serial, updated_at) VALUES (?, ?, ?)",
                (msisdn, sim_serial, now),
            )
        else:
            get_db().execute(
                "UPDATE active_sims SET sim_serial = ?, updated_at = ? WHERE msisdn = ?",
                (sim_serial, now, msisdn),
            )


_store = DatabaseOrderStore()
_registry = DatabaseSimRegistry()


@dataclass(frozen=True)
class SwapResult:
    created: bool
    order_id: str | None
    status: str
    reasons: tuple[str, ...]
    detail: str


def create_order(
    msisdn: str,
    new_sim_serial: str,
    identity_reference: str,
    identity_verified: bool,
    fraud_approved: bool,
) -> SwapResult:
    """Create the SIM swap order if both gates allow it."""
    result = create_sim_swap_request(
        msisdn=msisdn,
        new_sim_serial=new_sim_serial,
        identity_reference=identity_reference,
        verification_status=(
            VerificationStatus.ACCEPTED if identity_verified else VerificationStatus.REJECTED
        ),
        fraud_decision=FraudDecision.APPROVE if fraud_approved else FraudDecision.REJECT,
        store=_store,
    )

    created = result.order is not None
    reasons = tuple(str(r) for r in (result.reasons or []))
    detail = (
        f"SIM swap order {result.order.order_id} created"
        if created
        else (reasons[0] if reasons else "SIM swap order was not created")
    )

    logger.info("SIM swap order creation: created=%s status=%s", created, result.status)
    return SwapResult(
        created=created,
        order_id=result.order.order_id if result.order else None,
        status=str(result.status),
        reasons=reasons,
        detail=detail,
    )


def get_order(order_id: str) -> dict[str, Any] | None:
    order = _store.get(order_id)
    return order.__dict__ if order else None


@dataclass(frozen=True)
class ActivationResult:
    activated: bool
    status: str
    new_sim_serial: str | None
    previous_sim_serial: str | None
    detail: str


def activate(order_id: str) -> ActivationResult:
    """Activate the new SIM for a created order (CARB step 11)."""
    result = activate_new_sim(
        order_id=order_id,
        order_store=_store,
        sim_registry=_registry,
    )
    activated = result.new_sim_serial is not None and not result.reasons
    reasons = tuple(str(r) for r in (result.reasons or []))
    detail = (
        f"New SIM {result.new_sim_serial} is now active"
        if activated
        else (reasons[0] if reasons else "New SIM was not activated")
    )
    logger.info("SIM activation: status=%s activated=%s", result.status, activated)
    return ActivationResult(
        activated=activated,
        status=str(result.status),
        new_sim_serial=result.new_sim_serial,
        previous_sim_serial=result.previous_sim_serial,
        detail=detail,
    )
