from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from Backend.sim_swap_service.sim_swap_activation import activate_new_sim

# Import your existing business logic (or move it into app/services)
from Backend.sim_swap_service.sim_swap_request import (
    FraudDecision,
    InMemoryOrderStore,
    VerificationStatus,
    create_sim_swap_request,
)

router = APIRouter(prefix="/api/v1/sim-swap", tags=["SIM Swap"])

# Draft storage (you can replace with a proper SQLite/Postgres table)
# Temporary in‑memory store for the /initiate step (just for demonstration)
_draft_store = {}

# Pydantic models for JSON requests


class InitiateSwapRequest(BaseModel):
    full_name: str
    msisdn: str
    new_sim_serial: str


class CreateOrderRequest(BaseModel):
    msisdn: str
    new_sim_serial: str
    identity_reference: str
    verification_status: VerificationStatus
    fraud_decision: FraudDecision


# Endpoints


@router.post("/initiate")
async def initiate_sim_swap(
    request: InitiateSwapRequest,
    background_tasks: BackgroundTasks,
):
    """
    Step 1 of the SIM Swap journey: the user confirms their details.
    Saves the draft to the database so it can be retrieved later.
    """
    # Example: insert into a 'pending_swaps' table
    # db = get_db()
    # db.execute(...)
    # For now, keep in memory
    _draft_store[request.msisdn] = {
        "full_name": request.full_name,
        "new_sim_serial": request.new_sim_serial,
    }

    # Log the API call (optional)
    # background_tasks.add_task(log_call, ...)

    return {"status": "accepted", "message": "Draft saved"}


@router.post("/create")
async def create_sim_swap_order(
    request: CreateOrderRequest,
    background_tasks: BackgroundTasks,
):
    """
    Step 2: actually create the order after identity and fraud checks have passed.
    Uses the same logic as sim_swap_service but accepts JSON.
    """
    # Use an in‑memory store (or replace with a DB-backed store)
    order_store = InMemoryOrderStore()

    result = create_sim_swap_request(
        msisdn=request.msisdn,
        new_sim_serial=request.new_sim_serial,
        identity_reference=request.identity_reference,
        verification_status=request.verification_status,
        fraud_decision=request.fraud_decision,
        store=order_store,
    )

    if not result.order:
        raise HTTPException(status_code=400, detail=result.reasons)

    # Optional: log to DB
    # background_tasks.add_task(log_call, ...)

    return {
        "status": result.status.value,
        "order": result.order.__dict__,
        "reasons": result.reasons,
    }


@router.get("/{order_id}")
async def get_sim_swap_order(order_id: str):
    """Retrieve an existing order."""
    order_store = InMemoryOrderStore()  # or DB-backed
    order = order_store.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order.__dict__


@router.post("/{order_id}/activate")
async def activate_sim_swap_order(
    order_id: str,
    background_tasks: BackgroundTasks,
):
    """Activate the new SIM and deactivate the old one."""
    from Backend.sim_swap_service.sim_swap_activation import InMemorySimRegistry

    order_store = InMemoryOrderStore()
    sim_registry = InMemorySimRegistry()

    result = activate_new_sim(order_id, order_store, sim_registry)
    return {
        "status": result.status.value,
        "order_id": result.order_id,
        "new_sim_serial": result.new_sim_serial,
        "previous_sim_serial": result.previous_sim_serial,
        "activated_at": result.activated_at,
        "reasons": result.reasons,
    }
