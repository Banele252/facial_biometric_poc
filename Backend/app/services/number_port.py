"""Number port authorisation.

The CARB names SIM swap and number port as the two high-risk transactions this
platform protects. They share an identity chain — precheck, liveness, RICA,
ID verification, Home Affairs face match, fraud checks — and differ only in
what happens once identity is established. So the journey is not duplicated:
the transaction type selects the final action, and this module is that action
for a port.

A port hands the number to a different network, which makes it strictly more
destructive than a SIM swap: the customer leaves. The gate is therefore the
same two conditions, applied with the same strictness, and the request is
persisted so an authorisation can be evidenced afterwards.

This is the PoC boundary. A real port also needs the donor network's
acceptance and a porting window, neither of which exists here — a request in
``PENDING`` means MTN has authorised the customer's identity, not that the
number has moved.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

from Backend.app.db import get_db, utcnow_iso

logger = logging.getLogger(__name__)

# Authorised by MTN; the port itself completes out of band.
STATUS_PENDING = "PENDING"
STATUS_REFUSED = "REFUSED"


@dataclass(frozen=True)
class PortResult:
    created: bool
    request_id: str | None
    status: str
    reasons: tuple[str, ...]
    detail: str


def create_port_request(
    msisdn: str,
    target_network: str,
    identity_reference: str,
    identity_verified: bool,
    fraud_approved: bool,
) -> PortResult:
    """Authorise a number port, if identity and fraud both allow it."""
    reasons: list[str] = []
    if not identity_verified:
        reasons.append("Identity was not verified.")
    if not fraud_approved:
        reasons.append("Fraud checks did not approve the request.")

    if reasons:
        logger.info("Port request refused: %s", "; ".join(reasons))
        return PortResult(
            created=False,
            request_id=None,
            status=STATUS_REFUSED,
            reasons=tuple(reasons),
            detail=reasons[0],
        )

    request_id = str(uuid.uuid4())
    get_db().execute(
        "INSERT INTO port_requests "
        "(request_id, msisdn, target_network, identity_reference, status, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            request_id,
            msisdn,
            target_network,
            identity_reference,
            STATUS_PENDING,
            utcnow_iso(),
        ),
    )
    logger.info("Port request %s authorised for target network %s", request_id, target_network)
    return PortResult(
        created=True,
        request_id=request_id,
        status=STATUS_PENDING,
        reasons=(),
        detail=f"Port to {target_network} authorised — request {request_id}",
    )


def get_port_request(request_id: str) -> dict[str, Any] | None:
    return get_db().query_one("SELECT * FROM port_requests WHERE request_id = ?", (request_id,))
