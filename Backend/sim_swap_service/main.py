"""
SIM Swap order service.

Covers:
    - Create SIM Swap Request (UC018): creates a SIM Swap order once
      identity verification and fraud checks have both passed.
    - Activate New SIM (UC019): activates the new SIM and deactivates the
      previous one for a previously created order.

Run locally with (from this directory):
    uv run uvicorn main:app --reload

Then open http://127.0.0.1:8000/docs for interactive Swagger docs.
"""

from __future__ import annotations

from fastapi import FastAPI, Form, HTTPException
from sim_swap_activation import InMemorySimRegistry, activate_new_sim
from sim_swap_request import (
    FraudDecision,
    InMemoryOrderStore,
    VerificationStatus,
    create_sim_swap_request,
)

app = FastAPI(title="SIM Swap Service API", version="0.1.0")

# POC-only in-memory stores, shared across requests for the life of this
# process. Replace with a real provisioning/order system and SIM registry
# before this leaves POC stage - see sim_swap_request.py / sim_swap_activation.py.
_order_store = InMemoryOrderStore()
_sim_registry = InMemorySimRegistry()


@app.post("/api/v1/sim-swap/create")
async def create_sim_swap(
    msisdn: str = Form(...),
    new_sim_serial: str = Form(...),
    identity_reference: str = Form(...),
    verification_status: VerificationStatus = Form(...),
    fraud_decision: FraudDecision = Form(...),
):
    """Create a SIM Swap order, gated on verification + fraud decision both passing."""
    result = create_sim_swap_request(
        msisdn=msisdn,
        new_sim_serial=new_sim_serial,
        identity_reference=identity_reference,
        verification_status=verification_status,
        fraud_decision=fraud_decision,
        store=_order_store,
    )
    return {
        "status": result.status.value,
        "order": result.order.__dict__ if result.order else None,
        "reasons": result.reasons,
    }


@app.get("/api/v1/sim-swap/{order_id}")
async def get_sim_swap(order_id: str):
    """Look up a previously created SIM Swap order."""
    order = _order_store.get(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order.__dict__


@app.post("/api/v1/sim-swap/{order_id}/activate")
async def activate_sim_swap(order_id: str):
    """Activate the new SIM and deactivate the previous one for this order."""
    result = activate_new_sim(order_id, _order_store, _sim_registry)
    return {
        "status": result.status.value,
        "order_id": result.order_id,
        "new_sim_serial": result.new_sim_serial,
        "previous_sim_serial": result.previous_sim_serial,
        "activated_at": result.activated_at,
        "reasons": result.reasons,
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
