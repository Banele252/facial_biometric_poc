"""
Fraud engine API.

Currently covers:
    - Device Risk Checks (assess a device's recent SIM-swap attempt history)

Run locally with (from this directory):
    uv run uvicorn main:app --reload

Then open http://127.0.0.1:8000/docs for interactive Swagger docs.
"""

from __future__ import annotations

from fastapi import FastAPI, Form

from device_risk_check import InMemoryDeviceAttemptStore, assess_device_risk

app = FastAPI(title="Fraud Engine API", version="0.1.0")

# POC-only in-memory store, shared across requests for the life of this
# process. Replace with a persistent DeviceAttemptStore implementation
# before this leaves POC stage - see device_risk_check.py.
_device_attempt_store = InMemoryDeviceAttemptStore()


@app.post("/api/v1/risk/device-check")
async def device_check(
    device_id: str = Form(...),
    identity_reference: str = Form(...),
):
    """Assess the risk of the device attempting this SIM Swap request."""
    result = assess_device_risk(device_id, identity_reference, _device_attempt_store)
    return {
        "risk_level": result.risk_level.value,
        "attempt_count_in_window": result.attempt_count_in_window,
        "distinct_identities_in_window": result.distinct_identities_in_window,
        "reasons": result.reasons,
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
