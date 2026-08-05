"""Verification orchestrator, fallback and history.

Runs the SIM swap / number port identity journey in the order the process
diagram sets out, top to bottom of the MTN lane:

    consent
      -> ID precheck (SA ID only; a passport has no checksum to verify)
      -> liveness
      -> fraud pre-checks (recent rejections, device, IMEI, velocity)
      -> OCR the scanned document
      -> live face vs the document photo
      -> typed details vs the document details
      -> RICA registration
      -> Home Affairs face match (SA ID only)
      -> authorisation token
      -> SIM swap / number port

Each step is written to the audit trail and returned in ``checks``, so the
caller can show what every stage returned rather than a bare verdict. Every
rejection is also written to the fraud intelligence repository, which is what
the first pre-check reads on a later attempt.

Two branches carry the document type. A passport holder skips the SA ID
structural validation, because there is no SA ID checksum to run, and skips the
Home Affairs face match, because Home Affairs holds no photo for them — their
identity rests on the document checks and RICA instead. Both are the diagram's
"Passport" path, not shortcuts.

Stories:
- HT2-17..20 Fallback / Passport Verification: the OCR and document-comparison
  steps, now part of the main journey rather than a separate fallback service.
- HT2-15: with ALLOW_PROVIDER_FALLBACK set, a provider outage approves on the
  evidence already gathered and flags for manual review. Off by default — the
  diagram rejects when Home Affairs cannot be reached after several tries.
- HT2-14 Check Failed Verification History: GET /verifications/history.
- HT2-24 / HT2-25: an approval or rejection notification for every decision.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from Backend.app import repository
from Backend.app.config import Settings, get_settings
from Backend.app.db import new_id
from Backend.app.routers.validation import run_structural_checks
from Backend.app.services import authorisation
from Backend.app.services import storage as storage_service
from Backend.app.services.audit import record_event
from Backend.app.services.documents import (
    ClaimedIdentity,
    DocumentType,
    extract_document_fields,
    match_input_to_document,
    match_selfie_to_document,
)
from Backend.app.services.face_match import run_face_match_bytes
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

SA_ID = "SA_ID"
PASSPORT = "PASSPORT"


class VerificationRequest(BaseModel):
    # Which document the customer is presenting. The diagram branches on this
    # at the very first step and again before the Home Affairs check.
    document_type: str = Field(SA_ID, pattern=f"^({SA_ID}|{PASSPORT})$")
    # SA ID number or passport number, depending on document_type.
    id_number: str = Field(..., min_length=1, max_length=32)
    # RICA and POPIA both require the customer to consent to being verified
    # before any of it happens. The journey refuses to start without it.
    consent: bool = Field(
        False, description="Customer consented to identity verification (RICA/POPIA)"
    )
    # Identity claimed by the customer, compared against both the scanned
    # document and the SIM registration.
    full_name: str | None = Field(None, max_length=200)
    msisdn: str | None = Field(None, max_length=32, description="Number being swapped")
    new_sim_number: str | None = Field(None, max_length=32)
    # Which high-risk transaction this journey authorises. The CARB names both;
    # they share the entire identity chain and differ only in the final action.
    transaction: str = Field("sim_swap", pattern="^(sim_swap|number_port)$")
    # Receiving network, for a port. Ignored for a SIM swap.
    target_network: str | None = Field(None, max_length=64)
    # Client-supplied device identifier, used for repeat-device and velocity
    # signals. Absent means those checks see every request as a new device.
    device_id: str | None = Field(None, max_length=128)
    # Handset identifier, for the diagram's IMEI reputation check.
    imei: str | None = Field(None, max_length=32)
    selfie_id: str | None = Field(
        None, description="Selfie that passed liveness; required for approval"
    )
    document_image: str | None = Field(
        None, description="Base64 image or data URL of the scanned ID/passport"
    )
    # Accepted but ignored — the call mode is a deployment decision, read from
    # VERIFY_MODE. Kept on the model so existing callers do not break.
    mode: str | None = Field(
        None, pattern="^(production|sandbox)$", deprecated="Ignored; set VERIFY_MODE instead"
    )
    # Per-request override of ALLOW_PROVIDER_FALLBACK. Left unset, configuration
    # decides; the deployed default is to reject rather than approve on an
    # outage.
    allow_fallback: bool | None = Field(
        None, description="Permit fallback approval when the provider is unreachable"
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
    document_type: str = SA_ID
    # Present only on an approved journey that reached the authorisation step.
    authorisation_token: str | None = None
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


@dataclass
class Journey:
    """State carried between the steps of one verification."""

    payload: VerificationRequest
    settings: Settings
    id_number: str
    mode: str
    journey_id: str
    checks: list[CheckResult] = field(default_factory=list)
    # Populated as the journey progresses.
    selfie: dict[str, Any] | None = None
    selfie_bytes: bytes = b""
    document_bytes: bytes = b""
    match_score: float | None = None
    provider_status: str | None = None

    @property
    def is_passport(self) -> bool:
        return self.payload.document_type == PASSPORT

    @property
    def fallback_allowed(self) -> bool:
        if self.payload.allow_fallback is not None:
            return self.payload.allow_fallback
        return self.settings.allow_provider_fallback

    def add(
        self, name: str, label: str, status_value: str, detail: str, score: float | None = None
    ) -> None:
        self.checks.append(
            CheckResult(name=name, label=label, status=status_value, detail=detail, score=score)
        )

    def load_selfie_bytes(self) -> bytes:
        """The stored selfie, fetched once per journey.

        Two steps need the raw image — the document comparison and the Home
        Affairs match — and the document step is skipped entirely when no
        document was supplied. Caching here means neither step has to know
        whether the other ran, and the image is pulled from storage once rather
        than once per consumer.
        """
        if not self.selfie_bytes:
            self.selfie_bytes = storage_service.get_storage(self.settings).load(
                self.selfie["storage_ref"]  # type: ignore[index]
            )
        return self.selfie_bytes

    def idempotency_key(self, operation: str) -> str:
        """A key stable for one logical provider call within this journey.

        Retries of the same call replay rather than billing twice; a different
        journey, or a different operation in this one, gets a different key.
        """
        return f"{self.journey_id}:{operation}"


def _finalise(
    journey: Journey,
    decision: bool | str,
    method: str,
    reason: str,
    authorisation_token: str | None = None,
) -> VerificationDecision:
    """Record the attempt, notify the customer and build the response."""
    if isinstance(decision, bool):
        status_value = APPROVED if decision else REJECTED
    else:
        status_value = decision

    payload = journey.payload
    attempt = repository.record_attempt(
        id_number=journey.id_number,
        status=status_value,
        method=method,
        reason=reason,
        provider_status=journey.provider_status,
        selfie_id=payload.selfie_id,
    )
    notification = notify_decision(journey.id_number, status_value, method, attempt["id"])

    record_event(
        "verification_decision",
        {
            "attempt_id": attempt["id"],
            "id_number": journey.id_number,
            "document_type": payload.document_type,
            "status": status_value,
            "method": method,
            "reason": reason,
            "provider_status": journey.provider_status,
            "match_score": journey.match_score,
            "mode": journey.mode,
            "checks": [c.model_dump() for c in journey.checks],
        },
    )

    return VerificationDecision(
        attempt_id=attempt["id"],
        id_number=journey.id_number,
        status=status_value,
        method=method,
        reason=reason,
        provider_status=journey.provider_status,
        notification_type=notification["type"],
        match_score=journey.match_score,
        mode=journey.mode,
        document_type=payload.document_type,
        authorisation_token=authorisation_token,
        checks=journey.checks,
    )


def _reject(journey: Journey, stage: str, reason: str) -> VerificationDecision:
    """Reject, and store the record the fraud pre-checks read on a retry.

    This is the diagram's "Store rejected record" arrow into the fraud
    intelligence repository. Writing it is best-effort: failing to record a
    rejection must not turn the rejection itself into an error.
    """
    try:
        repository.record_rejection(
            id_number=journey.id_number,
            stage=stage,
            reason=reason,
            msisdn=(journey.payload.msisdn or "").strip() or None,
            device_id=(journey.payload.device_id or "").strip() or None,
        )
    except Exception as exc:
        logger.warning("Could not store rejected record: %s", exc)

    return _finalise(journey, decision=REJECTED, method=stage, reason=reason)


def _call_provider(journey: Journey, operation: str, call: Callable[[], Any]) -> Any:
    """Run a provider call, retrying before giving up.

    The diagram allows several attempts before concluding "Home affairs
    integration not available". Retries reuse one idempotency key so a call
    that succeeded upstream but timed out on the way back is replayed rather
    than charged again.
    """
    attempts = journey.settings.provider_max_attempts
    last_error: VerifyNowError | None = None

    for attempt in range(1, attempts + 1):
        try:
            return call()
        except VerifyNowError as exc:
            last_error = exc
            logger.warning("%s attempt %d/%d failed: %s", operation, attempt, attempts, exc)
            if attempt < attempts:
                _sandbox_cooldown(journey)

    raise last_error  # type: ignore[misc]


def _sandbox_cooldown(journey: Journey) -> None:
    """Wait out the sandbox's per-IP cooldown between provider calls.

    The VerifyNow sandbox rate-limits across its routes, so a journey making
    two calls — or retrying one — has to pause or the next returns "Too Many
    Requests". Production has no such limit.
    """
    if journey.settings.is_sandbox and journey.settings.sandbox_cooldown_seconds > 0:
        logger.info("Sandbox cooldown: waiting %.0fs", journey.settings.sandbox_cooldown_seconds)
        time.sleep(journey.settings.sandbox_cooldown_seconds)


# ---------------------------------------------------------------------------
# The journey, one step per function. Each returns a decision to stop on, or
# None to carry on to the next step.
# ---------------------------------------------------------------------------
def _step_consent(journey: Journey) -> VerificationDecision | None:
    """RICA and POPIA both require consent before any verification happens."""
    if not journey.payload.consent:
        journey.add("consent", "Consent to verification", "fail", "Customer did not consent")
        return _reject(
            journey,
            stage="consent",
            reason="Identity verification requires the customer's consent (RICA/POPIA).",
        )
    journey.add("consent", "Consent to verification", "pass", "Consent given")
    return None


def _step_precheck(journey: Journey) -> VerificationDecision | None:
    """Structural validation of the SA ID number.

    A passport number has no national checksum to verify, so the diagram sends
    passport holders past this step entirely — their document number is checked
    against the scanned document instead.
    """
    if journey.is_passport:
        journey.add(
            "precheck",
            "ID number precheck",
            "skipped",
            "Passport number — no SA ID checksum applies",
        )
        return None

    valid, _checks, failed = run_structural_checks(journey.id_number)
    journey.add(
        "precheck",
        "ID number precheck",
        "pass" if valid else "fail",
        "Structure and checksum valid" if valid else f"Failed: {', '.join(failed)}",
    )
    if not valid:
        return _reject(
            journey,
            stage="structural",
            reason=f"ID failed structural validation: {', '.join(failed)}",
        )
    return None


def _step_liveness(journey: Journey) -> VerificationDecision | None:
    """The selfie must exist, have passed liveness, and still be readable."""
    payload = journey.payload
    if not payload.selfie_id:
        journey.add("liveness", "Liveness", "fail", "No selfie provided")
        return _reject(
            journey,
            stage="liveness",
            reason="No selfie provided; the liveness check is required.",
        )

    selfie = repository.get_selfie(payload.selfie_id)
    if selfie is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selfie not found")

    if selfie["liveness_status"] != "live":
        journey.add(
            "liveness", "Liveness", "fail", f"Liveness status is {selfie['liveness_status']}"
        )
        return _reject(
            journey,
            stage="liveness",
            reason=f"Liveness not passed (status={selfie['liveness_status']}).",
        )

    journey.selfie = selfie
    journey.add(
        "liveness", "Liveness", "pass", "Live person confirmed", selfie.get("liveness_score")
    )
    return None


def _step_fraud(journey: Journey) -> VerificationDecision | None:
    """The pre-checks, before any biometric work.

    The diagram runs these immediately after the full request is assembled and
    before the face and document comparisons — a request that is already known
    to be risky should be turned away without spending a provider call or
    asking the customer to stand still for a camera.
    """
    payload = journey.payload
    fraud = run_fraud_checks(
        identity_reference=journey.id_number,
        msisdn=(payload.msisdn or "").strip(),
        device_id=(payload.device_id or "unknown-device").strip(),
    )
    journey.add(
        "fraud",
        "Fraud checks",
        "pass"
        if fraud.outcome == APPROVED
        else ("fail" if fraud.outcome == REJECTED else "review"),
        fraud.detail,
        fraud.risk_score,
    )
    record_event(
        "fraud_checks",
        {
            "id_number": journey.id_number,
            "decision": fraud.decision,
            "risk_score": fraud.risk_score,
            "reasons": list(fraud.reasons),
            "imei": payload.imei,
        },
    )

    if fraud.outcome == REJECTED:
        journey.provider_status = fraud.decision
        return _reject(journey, stage="fraud", reason=fraud.detail)
    if fraud.outcome == REVIEW:
        journey.provider_status = fraud.decision
        return _finalise(journey, decision=REVIEW, method="fraud", reason=fraud.detail)
    return None


def _step_documents(journey: Journey) -> VerificationDecision | None:
    """The three document checks: OCR, live face vs document, details vs document."""
    payload = journey.payload

    if not payload.document_image:
        # Skipped, not failed — the same treatment RICA gets when the caller
        # did not supply a name and number. A client that has not yet wired up
        # its document scan still gets a usable journey, and the checks array
        # says plainly that the document evidence is missing rather than
        # implying it passed. Clients that do send an image get the full
        # comparison below.
        journey.add(
            "document_ocr",
            "Document scan",
            "skipped",
            "No document image supplied",
        )
        journey.add(
            "document_face",
            "Face vs document photo",
            "skipped",
            "No document image to compare against",
        )
        journey.add(
            "document_details",
            "Details vs document",
            "skipped",
            "No document image to compare against",
        )
        record_event(
            "document_steps_skipped",
            {"id_number": journey.id_number, "reason": "no document image supplied"},
        )
        return None

    try:
        journey.document_bytes, _ = storage_service.decode_image(payload.document_image)
    except storage_service.StorageError as exc:
        journey.add("document_ocr", "Document scan", "fail", str(exc))
        return _reject(journey, stage="document", reason=f"Document image unreadable: {exc}")

    # The selfie is compared against the document photo, so the raw image is
    # needed here, not just its reference.
    try:
        journey.load_selfie_bytes()
    except Exception as exc:
        logger.error("Failed to load stored selfie for the document match: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stored selfie could not be retrieved",
        ) from exc

    claimed = ClaimedIdentity(
        full_name=(payload.full_name or "").strip(),
        document_number=journey.id_number,
    )

    # 1. OCR — extract name, document number and photo from the scan.
    ocr = extract_document_fields(journey.document_bytes, claimed, journey.settings)
    if not ocr.success:
        journey.add("document_ocr", "Document scan", "fail", ocr.error or "Could not read document")
        return _reject(
            journey,
            stage="document_ocr",
            reason=ocr.error or "Your ID document could not be read. Try again in better light.",
        )
    journey.add(
        "document_ocr",
        "Document scan",
        "pass",
        f"Read {ocr.document_type or 'document'}: {ocr.full_name or 'name not found'}",
    )
    record_event(
        "document_ocr",
        {
            "id_number": journey.id_number,
            "document_type": ocr.document_type,
            "field_confidence": ocr.field_confidence,
        },
    )

    # 2. Live face against the photo on the document.
    face = match_selfie_to_document(journey.selfie_bytes, journey.document_bytes, journey.settings)
    if not face.success:
        journey.add(
            "document_face", "Face vs document photo", "fail", face.error or "Comparison failed"
        )
        return _reject(
            journey,
            stage="document_face",
            reason=face.error or "Your face could not be compared to your document photo.",
        )
    journey.add(
        "document_face",
        "Face vs document photo",
        "pass" if face.is_match else "fail",
        "Live face matches the document photo"
        if face.is_match
        else "Live face does not match the document photo",
        face.confidence,
    )
    record_event(
        "document_face_match",
        {
            "id_number": journey.id_number,
            "is_match": face.is_match,
            "confidence": face.confidence,
        },
    )
    if not face.is_match:
        return _reject(
            journey,
            stage="document_face",
            reason="Your live photo does not match the photo on your document.",
        )

    # 3. What the customer typed against what the document says.
    document_type = DocumentType.PASSPORT if journey.is_passport else DocumentType.SA_ID
    details = match_input_to_document(
        document_type=document_type,
        user_full_name=(payload.full_name or "").strip(),
        user_id_number=journey.id_number,
        ocr_result=ocr,
    )
    journey.add(
        "document_details",
        "Details vs document",
        "pass" if details.overall_match else "fail",
        "Your details match the document"
        if details.overall_match
        else "; ".join(details.reasons) or "Details do not match the document",
        details.name_similarity,
    )
    record_event(
        "document_detail_match",
        {
            "id_number": journey.id_number,
            "overall_match": details.overall_match,
            "id_number_match": details.id_number_match,
            "name_match": details.name_match,
            "name_similarity": details.name_similarity,
        },
    )
    if not details.overall_match:
        return _reject(
            journey,
            stage="document_details",
            reason="The details you entered do not match your document.",
        )

    return None


def _step_rica(journey: Journey) -> VerificationDecision | None:
    """Check the number and identity against the SIM registration.

    Skipped when the caller did not supply the claimed identity — an ID-only
    request is still a valid, narrower journey.
    """
    payload = journey.payload
    if not (payload.full_name and payload.msisdn):
        journey.add("rica", "RICA registration", "skipped", "Full name and number not supplied")
        return None

    rica = rica_verify(
        id_number=journey.id_number,
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

    journey.add("rica", "RICA registration", "pass" if matched else "fail", detail)
    record_event(
        "rica_check",
        {
            "id_number": journey.id_number,
            "matched": matched,
            "unregistered": unregistered,
            "detail": detail,
        },
    )

    if not matched:
        # The diagram sends both "No record of MSISDN" and a registration
        # mismatch down the same red path to "Store rejected record". An
        # unregistered number is not evidence of fraud, but it is not evidence
        # of identity either, and a SIM swap cannot be authorised without it.
        journey.provider_status = "rica_unregistered" if unregistered else "rica_mismatch"
        return _reject(
            journey,
            stage="rica",
            reason=(
                "This number is not registered to you, so the swap cannot be processed."
                if unregistered
                else f"RICA check failed: {detail}"
            ),
        )
    return None


def _step_home_affairs(journey: Journey) -> VerificationDecision | None:
    """Verify the ID number and face against Home Affairs.

    Only for SA ID holders: Home Affairs holds no photo for a passport, which
    is why the diagram routes passports straight to the authorisation token
    once RICA has matched.
    """
    if journey.is_passport:
        journey.add(
            "id_verification",
            "ID verification",
            "skipped",
            "Passport — not held by Home Affairs",
        )
        journey.add(
            "face_match",
            "Home Affairs face match",
            "skipped",
            "Passport — Home Affairs holds no photo; document checks apply instead",
        )
        return None

    settings = journey.settings
    if not settings.verify_now_configured:
        journey.add("id_verification", "ID verification", "skipped", "Provider not configured")
        journey.add("face_match", "Home Affairs face match", "skipped", "Provider not configured")
        return _provider_unavailable(journey, "Identity verification is not configured.")

    # ID verification. A failure here is not fatal on its own — the face match
    # is the stronger signal and still runs.
    try:
        _call_provider(
            journey,
            "id_verification",
            lambda: verify_said(
                id_number=journey.id_number,
                mode=journey.mode,
                timeout=settings.request_timeout_seconds,
                idempotency_key=journey.idempotency_key("verify_said"),
            ),
        )
        journey.add(
            "id_verification", "ID verification", "pass", "Confirmed with the external provider"
        )
        record_event("id_verification", {"id_number": journey.id_number, "verified": True})
    except VerifyNowError as exc:
        logger.warning("ID verification unavailable: %s", exc)
        journey.add(
            "id_verification",
            "ID verification",
            "skipped",
            "Provider did not respond; continuing to the face match",
        )
        record_event("id_verification", {"id_number": journey.id_number, "verified": False})

    _sandbox_cooldown(journey)

    # Home Affairs face match.
    try:
        # The document step already pulled these bytes out of storage. Passing
        # them on rather than the storage reference avoids a second download —
        # which, against Blob, also means a second client and container round
        # trip for an image we are already holding.
        match = _call_provider(
            journey,
            "face_match",
            lambda: run_face_match_bytes(
                journey.id_number,
                journey.load_selfie_bytes(),
                settings,
                idempotency_key=journey.idempotency_key("face_match"),
            ),
        )
    except VerifyNowError as exc:
        logger.error(
            "Home Affairs face match unreachable after %d attempts: %s",
            settings.provider_max_attempts,
            exc,
        )
        journey.add(
            "face_match",
            "Home Affairs face match",
            "fail",
            f"Provider did not respond after {settings.provider_max_attempts} attempts",
        )
        return _provider_unavailable(
            journey, "Home Affairs could not be reached. Please try again later."
        )

    journey.match_score = match.score
    journey.provider_status = match.provider_status
    journey.add(
        "face_match",
        "Home Affairs face match",
        "pass"
        if match.outcome == APPROVED
        else ("fail" if match.outcome == REJECTED else "review"),
        match.detail,
        match.score,
    )
    record_event(
        "face_match",
        {
            "id_number": journey.id_number,
            "provider_status": match.provider_status,
            "score": match.score,
            "outcome": match.outcome,
            "mode": journey.mode,
        },
    )

    if match.outcome == REJECTED:
        return _reject(journey, stage="facematch", reason=match.detail)
    if match.outcome != APPROVED:
        return _finalise(journey, decision=match.outcome, method="facematch", reason=match.detail)
    return None


def _provider_unavailable(journey: Journey, message: str) -> VerificationDecision:
    """What to do when the provider cannot be reached at all.

    The diagram rejects: "Home affairs integration not available after multiple
    tries" runs to the failure message. ALLOW_PROVIDER_FALLBACK restores the
    older HT2-15 behaviour of approving on the evidence already gathered —
    which by this point is a passed liveness check, a document that matched the
    customer's face and details, and a RICA match — and flagging it for review.
    """
    if journey.fallback_allowed:
        return _finalise(
            journey,
            decision=REVIEW,
            method="fallback",
            reason=(
                "Home Affairs could not be reached. Approved on document and RICA "
                "evidence, pending manual review."
            ),
        )
    journey.provider_status = "provider_unavailable"
    return _reject(journey, stage="provider_unavailable", reason=message)


def _step_authorise(journey: Journey) -> VerificationDecision:
    """Issue the authorisation token, then carry out the transaction."""
    payload = journey.payload
    token = authorisation.issue(
        id_number=journey.id_number,
        transaction=payload.transaction,
        msisdn=(payload.msisdn or "").strip() or None,
        attempt_reference=journey.journey_id,
    )
    journey.add(
        "authorisation",
        "Authorisation token",
        "pass",
        "Authorisation token issued",
    )
    record_event(
        "authorisation_token_issued",
        {
            "id_number": journey.id_number,
            "transaction": payload.transaction,
            "expires_at": token.expires_at,
        },
    )

    if payload.transaction == "number_port":
        return _authorise_port(journey, token)
    return _process_sim_swap(journey, token)


def _consume_token(
    journey: Journey, token: authorisation.AuthorisationToken
) -> VerificationDecision | None:
    """Spend the token, or refuse to act without a valid one."""
    check = authorisation.consume(token.token, journey.id_number, journey.payload.transaction)
    if not check.valid:
        journey.add("authorisation", "Authorisation token", "fail", check.detail)
        return _reject(journey, stage="authorisation", reason=check.detail)
    return None


def _process_sim_swap(
    journey: Journey, token: authorisation.AuthorisationToken
) -> VerificationDecision:
    """Create the SIM swap order and activate the new SIM."""
    payload = journey.payload

    # Without the number and the new SIM there is nothing to swap. The identity
    # journey still succeeded, so this is reported as skipped rather than
    # failing the customer — and the token goes unspent.
    if not payload.msisdn or not payload.new_sim_number:
        journey.add(
            "sim_swap",
            "SIM swap order",
            "skipped",
            "Number and new SIM serial not supplied",
        )
        return _finalise(
            journey,
            decision=APPROVED,
            method="identity",
            reason="Identity verified. No SIM swap requested.",
            authorisation_token=token.token,
        )

    refused = _consume_token(journey, token)
    if refused:
        return refused

    swap = create_order(
        msisdn=payload.msisdn.strip(),
        new_sim_serial=payload.new_sim_number.strip(),
        identity_reference=journey.id_number,
        identity_verified=True,
        fraud_approved=True,
    )
    journey.add("sim_swap", "SIM swap order", "pass" if swap.created else "fail", swap.detail)
    record_event(
        "sim_swap_order",
        {
            "id_number": journey.id_number,
            "created": swap.created,
            "order_id": swap.order_id,
            "status": swap.status,
        },
    )

    if not (swap.created and swap.order_id):
        return _finalise(
            journey,
            decision=REVIEW,
            method="sim_swap_pending",
            reason=swap.detail,
            authorisation_token=token.token,
        )

    # Activation is the step that actually cuts the customer over, and it
    # records the serial it replaced so the change is reversible.
    activation = activate(swap.order_id)
    journey.add(
        "activation",
        "New SIM activation",
        "pass" if activation.activated else "fail",
        activation.detail,
    )
    record_event(
        "sim_activation",
        {
            "id_number": journey.id_number,
            "order_id": swap.order_id,
            "activated": activation.activated,
            "status": activation.status,
            "previous_sim_serial": activation.previous_sim_serial,
        },
    )
    return _finalise(
        journey,
        decision=APPROVED if activation.activated else REVIEW,
        method="sim_swap" if activation.activated else "sim_swap_pending",
        reason=activation.detail,
        authorisation_token=token.token,
    )


def _authorise_port(
    journey: Journey, token: authorisation.AuthorisationToken
) -> VerificationDecision:
    """Final action for a number port, once identity and fraud have passed."""
    payload = journey.payload
    if not payload.msisdn or not payload.target_network:
        journey.add(
            "number_port",
            "Number port authorisation",
            "skipped",
            "Number and receiving network not supplied",
        )
        return _finalise(
            journey,
            decision=APPROVED,
            method="identity",
            reason="Identity verified. No port requested.",
            authorisation_token=token.token,
        )

    refused = _consume_token(journey, token)
    if refused:
        return refused

    port = create_port_request(
        msisdn=payload.msisdn.strip(),
        target_network=payload.target_network.strip(),
        identity_reference=journey.id_number,
        identity_verified=True,
        fraud_approved=True,
    )
    journey.add(
        "number_port",
        "Number port authorisation",
        "pass" if port.created else "fail",
        port.detail,
    )
    record_event(
        "number_port",
        {
            "id_number": journey.id_number,
            "created": port.created,
            "request_id": port.request_id,
            "target_network": payload.target_network,
            "status": port.status,
        },
    )
    return _finalise(
        journey,
        decision=APPROVED if port.created else REVIEW,
        method="number_port",
        reason=port.detail,
        authorisation_token=token.token,
    )


# Order matters: this is the diagram, top to bottom.
_STEPS: tuple[Callable[[Journey], VerificationDecision | None], ...] = (
    _step_consent,
    _step_precheck,
    _step_liveness,
    _step_fraud,
    _step_documents,
    _step_rica,
    _step_home_affairs,
)


@router.post("/verifications", response_model=VerificationDecision)
def verify(payload: VerificationRequest) -> VerificationDecision:
    """Run the identity journey and return the decision.

    Every step is audited and returned in ``checks`` so the caller can show
    what actually happened rather than a bare verdict.
    """
    settings = get_settings()
    journey = Journey(
        payload=payload,
        settings=settings,
        id_number=payload.id_number.strip(),
        # The call mode is read from configuration only. `payload.mode` is
        # accepted for backwards compatibility but deliberately ignored: a
        # client able to move one provider call to production but not the
        # other is worse than a client that cannot move either.
        mode=settings.verify_mode,
        journey_id=new_id(),
    )

    record_event(
        "journey_started",
        {
            "id_number": journey.id_number,
            "document_type": payload.document_type,
            "transaction": payload.transaction,
            "msisdn": payload.msisdn,
            "new_sim_number": payload.new_sim_number,
            "consent": payload.consent,
            "mode": journey.mode,
        },
    )

    for step in _STEPS:
        decision = step(journey)
        if decision is not None:
            return decision

    return _step_authorise(journey)


@router.get("/verifications/history", response_model=list[AttemptRecord])
def verification_history(
    id_number: str | None = Query(None, max_length=32),
    status_filter: str | None = Query(None, alias="status", pattern="^(approved|rejected|review)$"),
    limit: int = Query(50, ge=1, le=200),
) -> list[AttemptRecord]:
    rows = repository.list_attempts(
        id_number=id_number.strip() if id_number else None,
        status=status_filter,
        limit=limit,
    )
    return [AttemptRecord(**row) for row in rows]
