"""
SIM Swap order service.

Covers Create SIM Swap Request (UC018): creates a SIM Swap order once
identity verification and fraud checks have both passed.

Run locally with (from this directory):
    uv run uvicorn main:app --reload

Then open http://127.0.0.1:8000/docs for interactive Swagger docs.
"""

from __future__ import annotations

from fastapi import FastAPI, Form, HTTPException
from sim_swap_request import (
    FraudDecision,
    InMemoryOrderStore,
    VerificationStatus,
    create_sim_swap_request,
)

app = FastAPI(title="SIM Swap Service API", version="0.1.0")

# POC-only in-memory store, shared across requests for the life of this
# process. Replace with a real provisioning/order system before this
# leaves POC stage - see sim_swap_request.py.
_order_store = InMemoryOrderStore()


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


@app.get("/health")
async def health():
    return {"status": "ok"}
