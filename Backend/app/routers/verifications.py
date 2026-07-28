"""Verification orchestrator, fallback and history.

Runs the SIM swap identity journey in the agreed order:

    ID precheck -> liveness -> RICA registration -> external ID verification
    -> Home Affairs face match -> decision

then records the attempt and fires the approval/rejection notification. Each
step is written to the audit trail and returned in ``checks``, so the caller
can show what every stage actually returned rather than a bare verdict.

Two provider calls are made (ID verification and face match). The VerifyNow
sandbox rate-limits per IP across its routes, so a wait is inserted between
them in sandbox mode — which is why this endpoint takes ~12s there and the
client needs a progress state.

Stories:
- HT2-15 Fallback Verification for SA_ID holders: when the primary provider is
  unavailable, a structurally valid ID that passed liveness is approved via a
  fallback path flagged for manual review, instead of failing the customer.
- HT2-14 Check Failed Verification History: GET /verifications/history exposes
  past attempts, filterable to rejected ones.
- HT2-24 / HT2-25: an approval or rejection notification is sent for every
  decision.
"""

import logging
import time

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from Backend.app import repository
from Backend.app.config import get_settings
from Backend.app.routers.validation import run_structural_checks
from Backend.app.services.audit import record_event
from Backend.app.services.face_match import run_face_match
from Backend.app.services.notifications import notify_decision
from Backend.external_backend.main import VerifyNowError, verify_said
from Backend.rica_service.store import verify as rica_verify

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["verifications"])

APPROVED = "approved"
REJECTED = "rejected"
REVIEW = "review"


class VerificationRequest(BaseModel):
    id_number: str = Field(..., min_length=1, max_length=32)
    # Identity claimed by the customer. Needed to check the SIM registration
    # against RICA; when absent that check is skipped rather than failed, so
    # the ID-only flow still works.
    full_name: str | None = Field(None, max_length=200)
    msisdn: str | None = Field(None, max_length=32, description="Number being swapped")
    new_sim_number: str | None = Field(None, max_length=32)
    selfie_id: str | None = Field(
        None, description="Selfie that passed liveness; required for approval"
    )
    # The call mode is a deployment decision, not a client one — leaving this
    # unset uses VERIFY_MODE, which defaults to sandbox. A client cannot make
    # the service spend credits.
    mode: str | None = Field(None, pattern="^(production|sandbox)$")
    allow_fallback: bool = Field(
        True, description="Permit fallback approval when the primary provider is down"
    )


class CheckResult(BaseModel):
    """One step of the journey, in the order it ran."""

    name: str
    label: str
    status: str  # pass | fail | review | skipped
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
    # ``decision`` accepts the outcome string or a boolean, so the simple
    # approve/reject gates below stay readable.
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


@router.post("/verifications", response_model=VerificationDecision)
def verify(payload: VerificationRequest) -> VerificationDecision:
    """Run the SIM swap identity journey and return the decision.

    Order matches the agreed process: ID precheck -> RICA registration ->
    external ID verification -> Home Affairs face match. Every step is audited
    and returned in ``checks`` so the caller can show what actually happened
    rather than a bare verdict.
    """
    id_number = payload.id_number.strip()
    settings = get_settings()
    mode = payload.mode or settings.verify_mode
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

    # 1. ID precheck — structural validation, no external call.
    valid, _checks, failed = run_structural_checks(id_number)
    checks.append(
        CheckResult(
            name="precheck",
            label="ID number precheck",
            status="pass" if valid else "fail",
            detail="Structure and checksum valid"
            if valid
            else f"Failed: {', '.join(failed)}",
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

    # Liveness precondition. A selfie is required, and it must have passed.
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

    # 2. RICA registration. Skipped when the caller did not supply the claimed
    #    identity — an ID-only request is still a valid, narrower journey.
    if payload.full_name and payload.msisdn:
        rica = rica_verify(
            id_number=id_number,
            full_name=payload.full_name.strip(),
            msisdn=payload.msisdn.strip(),
        )
        matched = bool(rica.get("matched"))
        detail = "Matches the SIM registration" if matched else str(
            rica.get("reason") or "Does not match the SIM registration"
        )
        checks.append(
            CheckResult(
                name="rica",
                label="RICA registration",
                status="pass" if matched else "fail",
                detail=detail,
            )
        )
        record_event("rica_check", {"id_number": id_number, "matched": matched, "detail": detail})
        if not matched:
            # The claimed identity does not own the number being swapped. That
            # is the fraud case this journey exists to stop, so it ends here.
            return _finalise(
                id_number,
                decision=False,
                method="rica",
                reason=f"RICA check failed: {detail}",
                selfie_id=payload.selfie_id,
                provider_status="rica_mismatch",
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

    # 3. External ID verification. A provider failure here is not fatal — the
    #    face match is the stronger signal and still runs.
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

    # The sandbox rate-limits per IP across its routes, so the second provider
    # call in this journey has to wait. Production is not limited this way.
    if settings.is_sandbox and settings.sandbox_cooldown_seconds > 0:
        logger.info("Sandbox cooldown: waiting %.0fs", settings.sandbox_cooldown_seconds)
        time.sleep(settings.sandbox_cooldown_seconds)

    # 4. Home Affairs face match (CARB step 8A).
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


@router.get("/verifications/history", response_model=list[AttemptRecord])
def verification_history(
    id_number: str | None = Query(None, max_length=32),
    status_filter: str | None = Query(
        None, alias="status", pattern="^(approved|rejected|review)$"
    ),
    limit: int = Query(50, ge=1, le=200),
) -> list[AttemptRecord]:
    rows = repository.list_attempts(
        id_number=id_number.strip() if id_number else None,
        status=status_filter,
        limit=limit,
    )
    return [AttemptRecord(**row) for row in rows]
