"""Document steps of the journey — OCR extraction and the document face match.

The diagram puts three document checks between the fraud pre-checks and the
RICA lookup:

    Scan Identity document  ->  extract Name, ID/Passport number, photo
    Compare Live face with Document Photo
    Compare USER INPUT details with Document details

The logic for all three already exists under ``Backend/internal_backend``
(``ocr_validator``, ``face_match``, ``document_match``). Both Azure-backed
modules hard-fail without credentials, which would make the second half of the
journey unreachable in any environment that does not have them. This module is
the seam: it picks a provider the same way ``liveness.py`` does, so the journey
runs end to end on a laptop and switches to Azure by configuration alone.

``DOCUMENT_PROVIDER=azure`` uses Azure Document Intelligence for OCR and Azure
AI Face for the document face match. Anything else uses the deterministic mock
below.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from Backend.app.config import Settings, get_settings
from Backend.internal_backend.document_match import (
    DocumentMatchResult,
    DocumentType,
    match_user_input_to_document,
)
from Backend.internal_backend.face_match import FaceMatchResult as DocumentFaceResult
from Backend.internal_backend.face_match import match_face_to_document
from Backend.internal_backend.ocr_validator import OCRResult, extract_id_fields

logger = logging.getLogger(__name__)

# Below this an image is not a camera capture — a blank frame, an icon, a
# truncated upload. Same threshold and reasoning as the liveness mock.
_MIN_CAPTURE_BYTES = 1024


@dataclass(frozen=True)
class ClaimedIdentity:
    """What the customer typed, before any document has been read.

    The mock OCR provider needs this to produce a document that either agrees
    or disagrees with the customer; the Azure provider ignores it entirely and
    reads whatever is actually on the document.
    """

    full_name: str
    document_number: str


def _byte_diversity(raw: bytes) -> float:
    """Distinct byte values over 256 — a cheap stand-in for image richness."""
    return len(set(raw)) / 256


# ---------------------------------------------------------------------------
# OCR extraction
# ---------------------------------------------------------------------------
def extract_document_fields(
    document_bytes: bytes,
    claimed: ClaimedIdentity,
    settings: Settings | None = None,
) -> OCRResult:
    """Read the identity fields off a photographed ID or passport."""
    settings = settings or get_settings()

    if settings.document_provider == "azure":
        if not settings.azure_documents_configured:
            return OCRResult(
                success=False,
                error=(
                    "DOCUMENT_PROVIDER=azure but AZURE_DOC_INTELLIGENCE_ENDPOINT/KEY are not set."
                ),
            )
        return extract_id_fields(document_bytes)

    return _mock_extract(document_bytes, claimed)


def _mock_extract(document_bytes: bytes, claimed: ClaimedIdentity) -> OCRResult:
    """Deterministic stand-in for Document Intelligence.

    No mock can actually read a photograph, so the useful question is which
    branches of the journey it can reach. A capture that looks like a real
    photo returns a document agreeing with what the customer typed, so the
    happy path completes; a degenerate image (too small, or near-solid colour)
    returns a document that disagrees, so the "Details not matching" rejection
    is reachable too. It is a plausibility gate, not OCR.
    """
    if not document_bytes:
        return OCRResult(success=False, error="No document image was provided.")

    if len(document_bytes) < _MIN_CAPTURE_BYTES:
        return OCRResult(
            success=False,
            error="Document image too small to be a genuine capture.",
        )

    diversity = _byte_diversity(document_bytes)
    if diversity < 0.20:
        # Reads as a document, but not the customer's — drives the mismatch
        # branch without needing a second fixture image.
        return OCRResult(
            success=True,
            document_type="idDocument",
            full_name="Unreadable Document",
            document_number="0000000000000",
            field_confidence={"mock_diversity": round(diversity, 3)},
        )

    parts = claimed.full_name.split()
    return OCRResult(
        success=True,
        document_type="idDocument",
        first_name=parts[0] if parts else None,
        last_name=parts[-1] if len(parts) > 1 else None,
        full_name=claimed.full_name,
        document_number=claimed.document_number,
        country_region="ZAF",
        field_confidence={"mock_diversity": round(diversity, 3)},
    )


# ---------------------------------------------------------------------------
# Live face vs the photo on the document
# ---------------------------------------------------------------------------
def match_selfie_to_document(
    selfie_bytes: bytes,
    document_bytes: bytes,
    settings: Settings | None = None,
) -> DocumentFaceResult:
    """Compare the live selfie against the photo printed on the document."""
    settings = settings or get_settings()

    if settings.document_provider == "azure":
        if not settings.azure_face_configured:
            return DocumentFaceResult(
                success=False,
                error="DOCUMENT_PROVIDER=azure but AZURE_FACE_API_ENDPOINT/KEY are not set.",
            )
        return match_face_to_document(
            selfie_bytes,
            document_bytes,
            confidence_threshold=settings.document_face_min_confidence,
        )

    return _mock_document_face_match(
        selfie_bytes, document_bytes, settings.document_face_min_confidence
    )


def _mock_document_face_match(
    selfie_bytes: bytes, document_bytes: bytes, threshold: float
) -> DocumentFaceResult:
    """Deterministic stand-in for the Azure Face verify call.

    Confidence is how alike the two images are in byte diversity. Two genuine
    photographs land close together and match; a photograph against a blank or
    degenerate frame lands far apart and does not — so both the pass and the
    "Live face vs Document picture not matching" branches are reachable.
    """
    if not selfie_bytes or not document_bytes:
        return DocumentFaceResult(
            success=False, error="Both a selfie and a document image are required."
        )

    if len(selfie_bytes) < _MIN_CAPTURE_BYTES:
        return DocumentFaceResult(success=False, error="No face detected in the selfie.")
    if len(document_bytes) < _MIN_CAPTURE_BYTES:
        return DocumentFaceResult(success=False, error="No face detected on the document image.")

    confidence = round(
        1.0 - abs(_byte_diversity(selfie_bytes) - _byte_diversity(document_bytes)), 4
    )
    return DocumentFaceResult(
        success=True,
        is_match=confidence >= threshold,
        confidence=confidence,
    )


# ---------------------------------------------------------------------------
# User input vs the document
# ---------------------------------------------------------------------------
def match_input_to_document(
    document_type: DocumentType,
    user_full_name: str,
    user_id_number: str,
    ocr_result: OCRResult,
) -> DocumentMatchResult:
    """Compare what the customer typed against what the document says.

    Pure comparison over the OCR output — no provider involved, so this behaves
    identically whichever provider produced ``ocr_result``.
    """
    return match_user_input_to_document(
        document_type=document_type,
        user_id_number=user_id_number,
        user_full_name=user_full_name,
        ocr_result=ocr_result,
    )


__all__ = [
    "ClaimedIdentity",
    "DocumentFaceResult",
    "DocumentMatchResult",
    "DocumentType",
    "OCRResult",
    "extract_document_fields",
    "match_input_to_document",
    "match_selfie_to_document",
]
