"""Verification orchestrator, fallback and history.

Runs the SIM swap identity journey in the agreed order:

    ID precheck -> liveness -> RICA registration -> external ID verification
    -> Home Affairs face match -> decision

HT2-73: Zero-trust security added. POST /verifications is Tier-1 (requires
simswap:execute scope + X-API-Key via middleware). GET /verifications/history
requires biometric:read scope.
"""
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from Backend.app import repository
from Backend.app.config import get_settings
from Backend.app.dependencies.security import get_correlation_id, require_biometric_read, require_simswap_execute
from Backend.app.routers.validation import run_structural_checks
from Backend.app.services.audit import record_event
from Backend.app.services.face_match import run_face_match
from Backend.app.services.fraud import run_fraud_checks
from Backend.app.services.notifications import notify_decision
from Backend.app.services.number_port import create_port_request
from Backend.app.services.sim_swap import activate, create_order
from Backend.external_backend.main import VerifyNowError, verify_said
from Backend.rica_service.store import verify as rica_verify

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["verifications"])

APPROVED = "approved"
REJECTED = "rejected"
REVIEW = "review"


class VerificationRequest(BaseModel):
    id_number: str = Field(..., min_length=1, max_length=32)
    full_name: str | None = Field(None, max_length=200)
    msisdn: str | None = Field(None, max_length=32, description="Number being swapped")
    new_sim_number: str | None = Field(None, max_length=32)
    transaction: str = Field("sim_swap", pattern="^(sim_swap|number_port)$")
    target_network: str | None = Field(None, max_length=64)
    device_id: str | None = Field(None, max_length=128)
    selfie_id: str | None = Field(
        None, description="Selfie that passed liveness; required for approval"
    )
    mode: str | None = Field(
        None, pattern="^(production|sandbox)$", deprecated="Ignored; set VERIFY_MODE instead"
    )
    allow_fallback: bool = Field(
        True, description="Permit fallback approval when the primary provider is down"
    )


class CheckResult(BaseModel):
    name: str
    label: str
    status: str
    detail: str
    score: float | None = None


class VerificationDecision(BaseModel):
    attempt_id: str
    id_number: str
    status: str
    method: str
    reason: str
    provider_status: str | None = None
    notification_type: str
    match_score: float | None = None
    mode: str | None = None
    checks: list[CheckResult] = []


class AttemptRecord(BaseModel):
    id: str
    id_number: str
    selfie_id: str | None = None
    status: str
    method: str
    reason: str | None = None
    provider_status: str | None = None
    created_at: str


def _finalise(
        id_number: str,
        decision: bool | str,
        method: str,
        reason: str,
        selfie_id: str | None,
        provider_status: str | None = None,
        match_score: float | None = None,
        mode: str | None = None,
        checks: list[CheckResult] | None = None,
) -> VerificationDecision:
    if isinstance(decision, bool):
        status_value = APPROVED if decision else REJECTED
    else:
        status_value = decision

    attempt = repository.record_attempt(
        id_number=id_number,
        status=status_value,
        method=method,
        reason=reason,
        provider_status=provider_status,
        selfie_id=selfie_id,
    )
    notification = notify_decision(id_number, status_value, method, attempt["id"])

    record_event(
        "verification_decision",
        {
            "attempt_id": attempt["id"],
            "id_number": id_number,
            "status": status_value,
            "method": method,
            "reason": reason,
            "provider_status": provider_status,
            "match_score": match_score,
            "mode": mode,
            "checks": [c.model_dump() for c in (checks or [])],
        },
    )

    return VerificationDecision(
        attempt_id=attempt["id"],
        id_number=id_number,
        status=status_value,
        method=method,
        reason=reason,
        provider_status=provider_status,
        notification_type=notification["type"],
        match_score=match_score,
        mode=mode,
        checks=checks or [],
    )


@router.post(
    "/verifications",
    response_model=VerificationDecision,
    dependencies=[Depends(require_simswap_execute)])
def verify(payload: VerificationRequest, correlation_id: str = Depends(get_correlation_id)) -> VerificationDecision:
    """Run the SIM swap identity journey and return the decision."""
    id_number = payload.id_number.strip()
    settings = get_settings()
    mode = settings.verify_mode
    checks: list[CheckResult] = []

    record_event(
        "journey_started",
        {
            "id_number": id_number,
            "msisdn": payload.msisdn,
            "new_sim_number": payload.new_sim_number,
            "mode": mode,
        },
    )

    # 1. ID precheck
    valid, _checks, failed = run_structural_checks(id_number)
    checks.append(
        CheckResult(
            name="precheck",
            label="ID number precheck",
            status="pass" if valid else "fail",
            detail="Structure and checksum valid" if valid else f"Failed: {', '.join(failed)}",
        )
    )
    if not valid:
        return _finalise(
            id_number,
            decision=False,
            method="structural",
            reason=f"ID failed structural validation: {', '.join(failed)}",
            selfie_id=payload.selfie_id,
            mode=mode,
            checks=checks,
        )

    # Liveness precondition
    if not payload.selfie_id:
        checks.append(
            CheckResult(
                name="liveness", label="Liveness", status="fail", detail="No selfie provided"
            )
        )
        return _finalise(
            id_number,
            decision=False,
            method="liveness",
            reason="No selfie provided; liveness check is required",
            selfie_id=None,
            mode=mode,
            checks=checks,
        )
    selfie = repository.get_selfie(payload.selfie_id)
    if selfie is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selfie not found")
    if selfie["liveness_status"] != "live":
        checks.append(
            CheckResult(
                name="liveness",
                label="Liveness",
                status="fail",
                detail=f"Liveness status is {selfie['liveness_status']}",
            )
        )
        return _finalise(
            id_number,
            decision=False,
            method="liveness",
            reason=f"Liveness not passed (status={selfie['liveness_status']})",
            selfie_id=payload.selfie_id,
            mode=mode,
            checks=checks,
        )
    checks.append(
        CheckResult(
            name="liveness",
            label="Liveness",
            status="pass",
            detail="Live person confirmed",
            score=selfie.get("liveness_score"),
        )
    )

    # 2. RICA registration
    if payload.full_name and payload.msisdn:
        rica = rica_verify(
            id_number=id_number,
            full_name=payload.full_name.strip(),
            msisdn=payload.msisdn.strip(),
        )
        matched = bool(rica.get("matched"))
        unregistered = rica.get("record") is None

        if matched:
            detail = "Matches the SIM registration"
        elif unregistered:
            detail = "No registration found for this number"
        else:
            detail = str(rica.get("reason") or "Does not match the SIM registration")

        checks.append(
            CheckResult(
                name="rica",
                label="RICA registration",
                status="pass" if matched else ("review" if unregistered else "fail"),
                detail=detail,
            )
        )
        record_event(
            "rica_check",
            {
                "id_number": id_number,
                "matched": matched,
                "unregistered": unregistered,
                "detail": detail,
            },
        )
        if not matched:
            return _finalise(
                id_number,
                decision=REVIEW if unregistered else REJECTED,
                method="rica",
                reason=(
                    "This number is not registered, so the swap needs a manual check."
                    if unregistered
                    else f"RICA check failed: {detail}"
                ),
                selfie_id=payload.selfie_id,
                provider_status="rica_unregistered" if unregistered else "rica_mismatch",
                mode=mode,
                checks=checks,
            )
    else:
        checks.append(
            CheckResult(
                name="rica",
                label="RICA registration",
                status="skipped",
                detail="Full name and number not supplied",
            )
        )

    if not settings.verify_now_configured:
        checks.append(
            CheckResult(
                name="id_verification",
                label="ID verification",
                status="skipped",
                detail="Provider not configured",
            )
        )
        checks.append(
            CheckResult(
                name="face_match",
                label="Home Affairs face match",
                status="skipped",
                detail="Provider not configured",
            )
        )
        return _fallback(payload, id_number, mode, checks)

    # 3. External ID verification
    id_verified = False
    try:
        verify_said(id_number=id_number, mode=mode, timeout=settings.request_timeout_seconds)
        id_verified = True
        checks.append(
            CheckResult(
                name="id_verification",
                label="ID verification",
                status="pass",
                detail="Confirmed with the external provider",
            )
        )
    except VerifyNowError as exc:
        logger.warning("ID verification unavailable: %s", exc)
        checks.append(
            CheckResult(
                name="id_verification",
                label="ID verification",
                status="skipped",
                detail="Provider did not respond; continuing to face match",
            )
        )
    record_event("id_verification", {"id_number": id_number, "verified": id_verified})

    if settings.is_sandbox and settings.sandbox_cooldown_seconds > 0:
        logger.info("Sandbox cooldown: waiting %.0fs", settings.sandbox_cooldown_seconds)
        time.sleep(settings.sandbox_cooldown_seconds)

    # 4. Home Affairs face match
    try:
        match = run_face_match(id_number, selfie["storage_ref"], settings)
        checks.append(
            CheckResult(
                name="face_match",
                label="Home Affairs face match",
                status="pass"
                if match.outcome == APPROVED
                else ("fail" if match.outcome == REJECTED else "review"),
                detail=match.detail,
                score=match.score,
            )
        )
        record_event(
            "face_match",
            {
                "id_number": id_number,
                "provider_status": match.provider_status,
                "score": match.score,
                "outcome": match.outcome,
                "mode": mode,
            },
        )
        if match.outcome != APPROVED:
            return _finalise(
                id_number,
                decision=match.outcome,
                method="facematch",
                reason=match.detail,
                selfie_id=payload.selfie_id,
                provider_status=match.provider_status,
                match_score=match.score,
                mode=mode,
                checks=checks,
            )

        return _fraud_and_swap(payload, id_number, mode, checks, match)
    except VerifyNowError as exc:
        logger.error("Face match unavailable, considering fallback: %s", exc)
        checks.append(
            CheckResult(
                name="face_match",
                label="Home Affairs face match",
                status="skipped",
                detail="Provider did not respond",
            )
        )

    return _fallback(payload, id_number, mode, checks)


def _fraud_and_swap(
        payload: VerificationRequest,
        id_number: str,
        mode: str,
        checks: list[CheckResult],
        match,
) -> VerificationDecision:
    """Steps 9-11: fraud checks, then create the SIM swap order."""
    fraud = run_fraud_checks(
        identity_reference=id_number,
        msisdn=(payload.msisdn or "").strip(),
        device_id=(payload.device_id or "unknown-device").strip(),
    )
    checks.append(
        CheckResult(
            name="fraud",
            label="Fraud checks",
            status="pass"
            if fraud.outcome == APPROVED
            else ("fail" if fraud.outcome == REJECTED else "review"),
            detail=fraud.detail,
            score=fraud.risk_score,
        )
    )
    record_event(
        "fraud_checks",
        {
            "id_number": id_number,
            "decision": fraud.decision,
            "risk_score": fraud.risk_score,
            "reasons": list(fraud.reasons),
        },
    )

    if fraud.outcome != APPROVED:
        return _finalise(
            id_number,
            decision=fraud.outcome,
            method="fraud",
            reason=fraud.detail,
            selfie_id=payload.selfie_id,
            provider_status=fraud.decision,
            match_score=match.score,
            mode=mode,
            checks=checks,
        )

    if payload.transaction == "number_port":
        return _authorise_port(payload, id_number, mode, checks, match)

    if not payload.msisdn or not payload.new_sim_number:
        checks.append(
            CheckResult(
                name="sim_swap",
                label="SIM swap order",
                status="skipped",
                detail="Number and new SIM serial not supplied",
            )
        )
        return _finalise(
            id_number,
            decision=APPROVED,
            method="facematch",
            reason=match.detail,
            selfie_id=payload.selfie_id,
            provider_status=match.provider_status,
            match_score=match.score,
            mode=mode,
            checks=checks,
        )

    swap = create_order(
        msisdn=payload.msisdn.strip(),
        new_sim_serial=payload.new_sim_number.strip(),
        identity_reference=id_number,
        identity_verified=True,
        fraud_approved=True,
    )
    checks.append(
        CheckResult(
            name="sim_swap",
            label="SIM swap order",
            status="pass" if swap.created else "fail",
            detail=swap.detail,
        )
    )
    record_event(
        "sim_swap_order",
        {
            "id_number": id_number,
            "created": swap.created,
            "order_id": swap.order_id,
            "status": swap.status,
        },
    )

    if swap.created and swap.order_id:
        activation = activate(swap.order_id)
        checks.append(
            CheckResult(
                name="activation",
                label="New SIM activation",
                status="pass" if activation.activated else "fail",
                detail=activation.detail,
            )
        )
        record_event(
            "sim_activation",
            {
                "id_number": id_number,
                "order_id": swap.order_id,
                "activated": activation.activated,
                "status": activation.status,
                "previous_sim_serial": activation.previous_sim_serial,
            },
        )
        return _finalise(
            id_number,
            decision=APPROVED if activation.activated else REVIEW,
            method="sim_swap" if activation.activated else "sim_swap_pending",
            reason=activation.detail,
            selfie_id=payload.selfie_id,
            provider_status=match.provider_status,
            match_score=match.score,
            mode=mode,
            checks=checks,
        )

    return _finalise(
        id_number,
        decision=APPROVED if swap.created else REVIEW,
        method="sim_swap" if swap.created else "facematch",
        reason=swap.detail,
        selfie_id=payload.selfie_id,
        provider_status=match.provider_status,
        match_score=match.score,
        mode=mode,
        checks=checks,
    )


def _authorise_port(
        payload: VerificationRequest,
        id_number: str,
        mode: str,
        checks: list[CheckResult],
        match,
) -> VerificationDecision:
    """Final action for a number port, once identity and fraud have passed."""
    if not payload.msisdn or not payload.target_network:
        checks.append(
            CheckResult(
                name="number_port",
                label="Number port authorisation",
                status="skipped",
                detail="Number and receiving network not supplied",
            )
        )
        return _finalise(
            id_number,
            decision=APPROVED,
            method="facematch",
            reason=match.detail,
            selfie_id=payload.selfie_id,
            provider_status=match.provider_status,
            match_score=match.score,
            mode=mode,
            checks=checks,
        )

    port = create_port_request(
        msisdn=payload.msisdn.strip(),
        target_network=payload.target_network.strip(),
        identity_reference=id_number,
        identity_verified=True,
        fraud_approved=True,
    )
    checks.append(
        CheckResult(
            name="number_port",
            label="Number port authorisation",
            status="pass" if port.created else "fail",
            detail=port.detail,
        )
    )
    record_event(
        "number_port",
        {
            "id_number": id_number,
            "created": port.created,
            "request_id": port.request_id,
            "target_network": payload.target_network,
            "status": port.status,
        },
    )
    return _finalise(
        id_number,
        decision=APPROVED if port.created else REVIEW,
        method="number_port",
        reason=port.detail,
        selfie_id=payload.selfie_id,
        provider_status=match.provider_status,
        match_score=match.score,
        mode=mode,
        checks=checks,
    )


def _fallback(
        payload: VerificationRequest, id_number: str, mode: str, checks: list[CheckResult]
) -> VerificationDecision:
    """Fallback path (HT2-15): the provider is unavailable or unconfigured."""
    if not payload.allow_fallback:
        return _finalise(
            id_number,
            decision=False,
            method="facematch",
            reason="Face match unavailable and fallback disabled",
            selfie_id=payload.selfie_id,
            mode=mode,
            checks=checks,
        )
    return _finalise(
        id_number,
        decision=True,
        method="fallback",
        reason=(
            "Face match unavailable; approved via fallback "
            "(structural + liveness). Manual review recommended."
        ),
        selfie_id=payload.selfie_id,
        provider_status="provider_unavailable",
        mode=mode,
        checks=checks,
    )


@router.get(
    "/verifications/history",
    response_model=list[AttemptRecord],
    dependencies=[Depends(require_biometric_read)])
def verification_history(
        id_number: str | None = Query(None, max_length=32),
        status_filter: str | None = Query(None, alias="status", pattern="^(approved|rejected|review)$"),
        limit: int = Query(50, ge=1, le=200),
        correlation_id: str = Depends(get_correlation_id),
) -> list[AttemptRecord]:
    rows = repository.list_attempts(
        id_number=id_number.strip() if id_number else None,
        status=status_filter,
        limit=limit,
    )
    return [AttemptRecord(**row) for row in rows]
