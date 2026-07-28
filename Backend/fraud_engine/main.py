"""
Fraud engine API.

Covers the full fraud-checks flow:
    - Device Risk Checks (UC014)
    - Fraud Intelligence Checks (UC015)
    - Risk Assessment (UC016)
    - Decisioning (UC017)

Run locally with (from this directory):
    uv run uvicorn main:app --reload

Then open http://127.0.0.1:8000/docs for interactive Swagger docs.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from db_logger import ensure_table, log_call
from decisioning import decide
from device_risk_check import (
    DeviceRiskLevel,
    DeviceRiskResult,
    InMemoryDeviceAttemptStore,
    assess_device_risk,
)
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Form
from fraud_intelligence_check import (
    FraudIntelligenceResult,
    FraudRiskLevel,
    InMemoryVelocityStore,
    Watchlist,
    assess_fraud_intelligence,
)
from pydantic import BaseModel
from risk_assessment import OverallRiskBand, RiskScoreResult, calculate_risk_score

load_dotenv()

SERVICE_NAME = "fraud_engine"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    ensure_table()
    yield


app = FastAPI(title="Fraud Engine API", version="0.1.0", lifespan=lifespan)

# POC-only in-memory stores, shared across requests for the life of this
# process. Replace with persistent implementations before this leaves POC
# stage - see the docstrings in device_risk_check.py / fraud_intelligence_check.py.
_device_attempt_store = InMemoryDeviceAttemptStore()
_velocity_store = InMemoryVelocityStore()
_watchlist = Watchlist()


# --------------------------------------------------------------------------
# Device Risk Checks (UC014)
# --------------------------------------------------------------------------
@app.post("/api/v1/risk/device-check")
async def device_check(
    background_tasks: BackgroundTasks,
    device_id: str = Form(...),
    identity_reference: str = Form(...),
):
    """Assess the risk of the device attempting this SIM Swap request."""
    result = assess_device_risk(device_id, identity_reference, _device_attempt_store)
    response = {
        "risk_level": result.risk_level.value,
        "attempt_count_in_window": result.attempt_count_in_window,
        "distinct_identities_in_window": result.distinct_identities_in_window,
        "reasons": result.reasons,
    }
    background_tasks.add_task(
        log_call,
        service=SERVICE_NAME,
        endpoint="/api/v1/risk/device-check",
        method="POST",
        request_summary={"device_id": device_id, "identity_reference": identity_reference},
        response_summary=response,
        status_code=200,
    )
    return response


# --------------------------------------------------------------------------
# Fraud Intelligence Checks (UC015)
# --------------------------------------------------------------------------
@app.post("/api/v1/risk/fraud-intelligence")
async def fraud_intelligence_check(
    background_tasks: BackgroundTasks,
    identity_reference: str = Form(...),
    msisdn: str = Form(...),
    device_id: str = Form(...),
):
    """Evaluate velocity, watchlist, and fraud-indicator signals."""
    result = assess_fraud_intelligence(
        identity_reference, msisdn, device_id, _velocity_store, _watchlist
    )
    response = {
        "risk_level": result.risk_level.value,
        "velocity_count_in_window": result.velocity_count_in_window,
        "watchlist_hit": result.watchlist_hit,
        "triggered_indicators": result.triggered_indicators,
        "reasons": result.reasons,
    }
    background_tasks.add_task(
        log_call,
        service=SERVICE_NAME,
        endpoint="/api/v1/risk/fraud-intelligence",
        method="POST",
        request_summary={
            "identity_reference": identity_reference,
            "msisdn": msisdn,
            "device_id": device_id,
        },
        response_summary=response,
        status_code=200,
    )
    return response


# --------------------------------------------------------------------------
# Risk Assessment (UC016) - pure combiner over the two signals above
# --------------------------------------------------------------------------
class DeviceRiskInput(BaseModel):
    risk_level: DeviceRiskLevel
    attempt_count_in_window: int = 0
    distinct_identities_in_window: int = 0
    reasons: list[str] = []


class FraudIntelligenceInput(BaseModel):
    risk_level: FraudRiskLevel
    velocity_count_in_window: int = 0
    watchlist_hit: bool = False
    triggered_indicators: list[str] = []
    reasons: list[str] = []


@app.post("/api/v1/risk/score")
async def risk_score(
    background_tasks: BackgroundTasks,
    device_risk: DeviceRiskInput,
    fraud_intelligence: FraudIntelligenceInput,
):
    """
    Combine a device-risk result and a fraud-intelligence result into a
    single risk score. Takes the raw signals as input (rather than
    identifiers) so it can be tested standalone without re-triggering the
    stateful checks above.
    """
    result = calculate_risk_score(
        DeviceRiskResult(**device_risk.model_dump()),
        FraudIntelligenceResult(**fraud_intelligence.model_dump()),
    )
    response = {
        "score": result.score,
        "band": result.band.value,
        "contributing_factors": result.contributing_factors,
    }
    background_tasks.add_task(
        log_call,
        service=SERVICE_NAME,
        endpoint="/api/v1/risk/score",
        method="POST",
        request_summary={
            "device_risk": device_risk.model_dump(),
            "fraud_intelligence": fraud_intelligence.model_dump(),
        },
        response_summary=response,
        status_code=200,
    )
    return response


# --------------------------------------------------------------------------
# Decisioning (UC017) - pure combiner over the risk score + watchlist flag
# --------------------------------------------------------------------------
class RiskScoreInput(BaseModel):
    score: float
    band: OverallRiskBand
    contributing_factors: list[str] = []


@app.post("/api/v1/risk/decision")
async def risk_decision(
    background_tasks: BackgroundTasks,
    risk_result: RiskScoreInput,
    watchlist_hit: bool = False,
):
    """Apply APPROVE / REFER / REJECT thresholds to a risk score."""
    result = decide(
        RiskScoreResult(**risk_result.model_dump()),
        FraudIntelligenceResult(
            risk_level=FraudRiskLevel.HIGH if watchlist_hit else FraudRiskLevel.LOW,
            velocity_count_in_window=0,
            watchlist_hit=watchlist_hit,
        ),
    )
    response = {
        "decision": result.decision.value,
        "risk_score": result.risk_score,
        "reasons": result.reasons,
    }
    background_tasks.add_task(
        log_call,
        service=SERVICE_NAME,
        endpoint="/api/v1/risk/decision",
        method="POST",
        request_summary={
            "risk_result": risk_result.model_dump(),
            "watchlist_hit": watchlist_hit,
        },
        response_summary=response,
        status_code=200,
    )
    return response


# --------------------------------------------------------------------------
# Umbrella pipeline: run all four fraud checks end to end
# --------------------------------------------------------------------------
class FraudCheckResponse(BaseModel):
    decision: str
    risk_score: float
    risk_band: str
    device_risk_level: str
    fraud_intelligence_risk_level: str
    reasons: list[str]


@app.post("/api/v1/fraud-checks/assess", response_model=FraudCheckResponse)
async def assess_fraud_checks(
    background_tasks: BackgroundTasks,
    device_id: str = Form(...),
    identity_reference: str = Form(...),
    msisdn: str = Form(...),
):
    """
    Full fraud-checks pipeline: Device Risk -> Fraud Intelligence -> Risk
    Assessment -> Decisioning. This is the endpoint the SIM Swap journey
    would call after identity verification passes.
    """
    device_risk = assess_device_risk(device_id, identity_reference, _device_attempt_store)
    fraud_intelligence = assess_fraud_intelligence(
        identity_reference, msisdn, device_id, _velocity_store, _watchlist
    )
    score = calculate_risk_score(device_risk, fraud_intelligence)
    decision = decide(score, fraud_intelligence)

    response = FraudCheckResponse(
        decision=decision.decision.value,
        risk_score=score.score,
        risk_band=score.band.value,
        device_risk_level=device_risk.risk_level.value,
        fraud_intelligence_risk_level=fraud_intelligence.risk_level.value,
        reasons=decision.reasons,
    )
    background_tasks.add_task(
        log_call,
        service=SERVICE_NAME,
        endpoint="/api/v1/fraud-checks/assess",
        method="POST",
        request_summary={
            "device_id": device_id,
            "identity_reference": identity_reference,
            "msisdn": msisdn,
        },
        response_summary=response.model_dump(),
        status_code=200,
    )
    return response


@app.get("/health")
async def health():
    return {"status": "ok"}
