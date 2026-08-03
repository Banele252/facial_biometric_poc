"""
Reject Identity Mismatches (OCR/document fallback path).

"As the system, I want to reject requests where identity details or
biometric verification fail so that fraud is prevented."

This is the decision step for the OCR/document fallback flow (used when
Home Affairs verification is unavailable, per the "Fallback Verification" /
"Passport Verification" user story). It takes the outputs of document_match
(user input vs. OCR'd document) and face_match (live selfie vs. document
photo) and produces one final, auditable accept/reject decision - it does
not call Azure itself, so it is fully unit testable.

Named "fallback_verification" (rather than "identity_verification") to keep
this distinct from the Home-Affairs-based identity verification flow
elsewhere in this repo.

Every decision is logged (with sensitive fields masked) for the audit
requirements referenced throughout the solution concept's Trust Validation
Framework.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

from Backend.internal_backend.document_match import DocumentMatchResult
from Backend.internal_backend.face_match import FaceMatchResult

logger = logging.getLogger("fallback_verification_decision")

# Default is relative so the module imports anywhere — a developer's checkout, a
# test runner, the container. The container overrides it to a directory the app
# user owns; see the Dockerfile.
DEFAULT_AUDIT_LOG_PATH = "data/logs/fallback_verification_audit.log"

_audit_handler_attached = False


def _attach_audit_handler() -> None:
    """Attach the audit file handler, once, on first use.

    Deliberately lazy and best-effort. Doing this at import time meant a
    read-only or non-existent log directory raised while the module was being
    imported, which took the whole application down before it could bind a
    port. An audit log that cannot be opened is worth a warning, not an outage
    — the decision itself is still recorded through the normal logging chain.
    """
    global _audit_handler_attached
    if _audit_handler_attached or logger.handlers:
        return
    _audit_handler_attached = True

    path = Path(os.getenv("FALLBACK_AUDIT_LOG_PATH", DEFAULT_AUDIT_LOG_PATH))
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        handler = logging.FileHandler(path)
    except OSError as exc:
        logging.getLogger(__name__).warning(
            "Fallback verification audit log unavailable at %s (%s); "
            "decisions will only go to the application log",
            path,
            exc,
        )
        return

    handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class DecisionStatus(StrEnum):
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


@dataclass
class FallbackVerificationDecision:
    status: DecisionStatus
    reasons: list = field(default_factory=list)


def _mask_reference(reference_id: str) -> str:
    if not reference_id:
        return "<none>"
    if len(reference_id) <= 4:
        return "*" * len(reference_id)
    return f"{reference_id[:2]}{'*' * (len(reference_id) - 4)}{reference_id[-2:]}"


def evaluate_fallback_verification(
    document_match_result: DocumentMatchResult,
    face_match_result: FaceMatchResult,
    reference_id: str = "",
) -> FallbackVerificationDecision:
    """
    Combine the document-match and face-match outcomes into a single
    accept/reject decision, and log the outcome for audit purposes.

    `reference_id` is any identifier you want in the audit trail (e.g. the
    RICA/MSISDN reference or a request ID) - it is masked before logging.
    """
    _attach_audit_handler()
    reasons = []

    if not document_match_result.overall_match:
        reasons.extend(
            document_match_result.reasons or ["Document details did not match user input."]
        )

    if not face_match_result.success:
        reasons.append(f"Face match could not be completed: {face_match_result.error}")
    elif not face_match_result.is_match:
        confidence = face_match_result.confidence
        reasons.append(
            "Live face did not match the document photo"
            + (f" (confidence {confidence:.2f})." if confidence is not None else ".")
        )

    status = DecisionStatus.ACCEPTED if not reasons else DecisionStatus.REJECTED
    decision = FallbackVerificationDecision(status=status, reasons=reasons)

    logger.info(
        "reference=%s status=%s reasons=%s",
        _mask_reference(reference_id),
        decision.status.value,
        decision.reasons,
    )

    return decision
