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
        get_db().execute(
            "INSERT INTO sim_swap_orders "
            "(order_id, msisdn, new_sim_serial, identity_reference, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                order.order_id,
                order.msisdn,
                order.new_sim_serial,
                order.identity_reference,
                OrderStatus.CREATED.value,
                order.created_at or utcnow_iso(),
            ),
        )

    def get(self, order_id: str) -> dict[str, Any] | None:
        return get_db().query_one("SELECT * FROM sim_swap_orders WHERE order_id = ?", (order_id,))


_store = DatabaseOrderStore()


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
    return _store.get(order_id)
