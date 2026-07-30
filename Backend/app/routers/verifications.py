"""Verification orchestrator, fallback and history.

Ties the journey together: structural validation -> liveness gate -> primary
provider (VerifyNow) with a fallback path, then records the attempt and fires
the approval/rejection notification.

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

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from Backend.app import repository
from Backend.app.config import get_settings
from Backend.app.routers.validation import run_structural_checks
from Backend.app.services.notifications import notify_decision
from Backend.external_backend.main import VerifyNowError, verify_said

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["verifications"])

APPROVED = "approved"
REJECTED = "rejected"


class VerificationRequest(BaseModel):
    id_number: str = Field(..., min_length=1, max_length=32)
    selfie_id: str | None = Field(
        None, description="Selfie that passed liveness; required for approval"
    )
    mode: str = Field("production", pattern="^(production|sandbox)$")
    allow_fallback: bool = Field(
        True, description="Permit fallback approval when the primary provider is down"
    )


class VerificationDecision(BaseModel):
    attempt_id: str
    id_number: str
    status: str
    method: str
    reason: str
    provider_status: str | None = None
    notification_type: str


class AttemptRecord(BaseModel):
    id: str
    id_number: str
    selfie_id: str | None = None
    status: str
    method: str
    reason: str | None = None
    provider_status: str | None = None
    created_at: str


def _interpret_verifynow(result: dict) -> tuple[bool, str]:
    """Map a VerifyNow response to an approve/reject decision.

    The provider payload varies, so this checks the common success indicators
    and defaults to approved when the call returned without an error and no
    negative signal is present.
    """
    for key in ("Status", "status", "result", "outcome"):
        value = result.get(key)
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"success", "verified", "match", "passed", "approved"}:
                return True, value
            if lowered in {"failed", "not_verified", "no_match", "rejected", "declined"}:
                return False, value
    for key in ("verified", "match", "isMatch", "success"):
        if key in result:
            ok = bool(result[key])
            return ok, ("verified" if ok else "not_verified")
    return True, "completed"


def _finalise(
    id_number: str,
    decision: bool,
    method: str,
    reason: str,
    selfie_id: str | None,
    provider_status: str | None = None,
) -> VerificationDecision:
    status_value = APPROVED if decision else REJECTED
    attempt = repository.record_attempt(
        id_number=id_number,
        status=status_value,
        method=method,
        reason=reason,
        provider_status=provider_status,
        selfie_id=selfie_id,
    )
    notification = notify_decision(id_number, decision, method, attempt["id"])
    return VerificationDecision(
        attempt_id=attempt["id"],
        id_number=id_number,
        status=status_value,
        method=method,
        reason=reason,
        provider_status=provider_status,
        notification_type=notification["type"],
    )


@router.post("/verifications", response_model=VerificationDecision)
def verify(payload: VerificationRequest) -> VerificationDecision:
    id_number = payload.id_number.strip()
    settings = get_settings()

    # 1. Structural validation gate.
    valid, _checks, failed = run_structural_checks(id_number)
    if not valid:
        return _finalise(
            id_number,
            decision=False,
            method="structural",
            reason=f"ID failed structural validation: {', '.join(failed)}",
            selfie_id=payload.selfie_id,
        )

    # 2. Liveness gate. A selfie is required, and it must have passed liveness.
    if not payload.selfie_id:
        return _finalise(
            id_number,
            decision=False,
            method="liveness",
            reason="No selfie provided; liveness check is required",
            selfie_id=None,
        )
    selfie = repository.get_selfie(payload.selfie_id)
    if selfie is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selfie not found")
    if selfie["liveness_status"] != "live":
        return _finalise(
            id_number,
            decision=False,
            method="liveness",
            reason=f"Liveness not passed (status={selfie['liveness_status']})",
            selfie_id=payload.selfie_id,
        )

    # 3. Primary verification via VerifyNow, with fallback on failure.
    if settings.verify_now_configured:
        try:
            result = verify_said(
                id_number=id_number,
                mode=payload.mode,
                timeout=settings.request_timeout_seconds,
            )
            approved, provider_status = _interpret_verifynow(result)
            return _finalise(
                id_number,
                decision=approved,
                method="verifynow",
                reason=(
                    "Approved by VerifyNow" if approved else "Rejected by VerifyNow"
                ),
                selfie_id=payload.selfie_id,
                provider_status=provider_status,
            )
        except VerifyNowError as exc:
            logger.error("VerifyNow unavailable, considering fallback: %s", exc)
            # fall through to fallback handling below

    # 4. Fallback path (HT2-15): primary unavailable or unconfigured.
    if not payload.allow_fallback:
        return _finalise(
            id_number,
            decision=False,
            method="verifynow",
            reason="Primary provider unavailable and fallback disabled",
            selfie_id=payload.selfie_id,
        )
    return _finalise(
        id_number,
        decision=True,
        method="fallback",
        reason=(
            "Primary provider unavailable; approved via fallback "
            "(structural + liveness). Manual review recommended."
        ),
        selfie_id=payload.selfie_id,
        provider_status="provider_unavailable",
    )


@router.get("/verifications/history", response_model=list[AttemptRecord])
def verification_history(
    id_number: str | None = Query(None, max_length=32),
    status_filter: str | None = Query(
        None, alias="status", pattern="^(approved|rejected)$"
    ),
    limit: int = Query(50, ge=1, le=200),
) -> list[AttemptRecord]:
    rows = repository.list_attempts(
        id_number=id_number.strip() if id_number else None,
        status=status_filter,
        limit=limit,
    )
    return [AttemptRecord(**row) for row in rows]
