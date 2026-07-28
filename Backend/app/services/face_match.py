"""Face match against Home Affairs — CARB journey step 8A (ABIS Match).

Sends the stored selfie to VerifyNow's ``/facematch`` endpoint with the
``facematch`` bundle, which compares it against the ID photo Home Affairs holds
for that ID number. The other bundles need a caller-supplied reference image,
which this journey never has.

The provider returns its own decision at ``results.face_match.status`` — one of
``Approved``, ``In Review`` or ``Declined`` — alongside a 0-100 ``score``. The
status is authoritative; the score is applied as an additional floor so a
low-confidence "Approved" still lands in review rather than straight through.

Calls run in sandbox unless ``VERIFY_MODE=production`` is set explicitly, so a
demo cannot spend credits by accident.
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass

from Backend.app.config import Settings, get_settings
from Backend.app.services import storage as storage_service
from Backend.external_backend.main import VerifyNowError, face_match

logger = logging.getLogger(__name__)

APPROVED = "approved"
REJECTED = "rejected"
REVIEW = "review"

# Provider status strings, lowercased, mapped to our outcome vocabulary.
_STATUS_MAP = {
    "approved": APPROVED,
    "accepted": APPROVED,
    "match": APPROVED,
    "declined": REJECTED,
    "rejected": REJECTED,
    "no match": REJECTED,
    "in review": REVIEW,
    "review": REVIEW,
    "manual review": REVIEW,
}


@dataclass(frozen=True)
class FaceMatchResult:
    outcome: str
    provider_status: str
    score: float | None
    detail: str
    request_id: str | None = None
    warnings: tuple[str, ...] = ()


def _extract(body: dict) -> tuple[str, float | None, str | None, tuple[str, ...]]:
    """Pull status, score, request id and warnings out of the provider body."""
    results = body.get("results") or {}
    fm = results.get("face_match") or {}
    status = str(fm.get("status") or "").strip()
    raw_score = fm.get("score")
    score = float(raw_score) if isinstance(raw_score, (int, float)) else None
    request_id = results.get("request_id") or body.get("requestId")
    warnings = tuple(str(w) for w in (fm.get("warnings") or []))
    return status, score, request_id, warnings


def run_face_match(
    id_number: str, storage_ref: str, settings: Settings | None = None
) -> FaceMatchResult:
    """Run the Home Affairs face match for a stored selfie.

    Raises VerifyNowError if the provider cannot be reached, so the caller can
    fall back rather than failing the customer.
    """
    settings = settings or get_settings()

    raw = storage_service.get_storage(settings).load(storage_ref)
    selfie_b64 = base64.b64encode(raw).decode("ascii")

    body = face_match(
        id_number=id_number,
        selfie_image_base64=selfie_b64,
        mode=settings.verify_mode,
        timeout=settings.request_timeout_seconds * 2,
    )

    if body.get("success") is False:
        raise VerifyNowError(str(body.get("message") or body.get("error") or "face match failed"))

    status, score, request_id, warnings = _extract(body)
    if not status:
        raise VerifyNowError("Face match response carried no status")

    outcome = _STATUS_MAP.get(status.lower(), REVIEW)

    # A pass that scored below the floor is downgraded rather than approved.
    if outcome == APPROVED and score is not None and score < settings.face_match_min_score:
        outcome = REVIEW
        detail = (
            f"Face match scored {score:.0f}, below the {settings.face_match_min_score:.0f} "
            "threshold. Sent for manual review."
        )
    elif outcome == APPROVED:
        detail = f"Face matched the Home Affairs photo (score {score:.0f})." if score is not None \
            else "Face matched the Home Affairs photo."
    elif outcome == REJECTED:
        detail = "Face did not match the Home Affairs photo."
    else:
        detail = "Face match needs manual review."

    logger.info(
        "Face match completed: provider_status=%s outcome=%s score=%s mode=%s",
        status,
        outcome,
        score,
        settings.verify_mode,
    )
    return FaceMatchResult(
        outcome=outcome,
        provider_status=status,
        score=score,
        detail=detail,
        request_id=request_id,
        warnings=warnings,
    )
