"""
User Input Match Against Document.

SA ID holder: "As the system, I want to compare the user input ID number
(already matched to the RICA DB) and customer names against the ID document
details so that identity can be verified."

Foreign ID holder: "As the system, I want to compare the user input customer
names against the passport details so that identity can be verified."
(Passport number is intentionally NOT re-compared here - it was already
matched against RICA earlier in the flow, per the product note in the story.)

This module contains no external calls - it is pure comparison logic against
whatever ocr_validator.extract_id_fields() returned, so it's fully unit
testable without Azure credentials.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from difflib import SequenceMatcher
from enum import Enum
from typing import Optional

from ocr_validator import OCRResult

DEFAULT_NAME_SIMILARITY_THRESHOLD = 0.85


class DocumentType(str, Enum):
    SA_ID = "SA_ID"
    PASSPORT = "PASSPORT"


@dataclass
class DocumentMatchResult:
    overall_match: bool
    id_number_match: Optional[bool]  # None when not applicable (foreign ID holders)
    name_match: bool
    name_similarity: float
    reasons: list = field(default_factory=list)


def _normalize(text: Optional[str]) -> str:
    if not text:
        return ""
    return " ".join(text.strip().lower().split())


def _name_similarity(name_a: str, name_b: str) -> float:
    """
    Fuzzy-match two full names to absorb harmless real-world differences
    (extra middle names, OCR casing/spacing noise) rather than requiring a
    byte-for-byte match, which real ID documents rarely give you.
    """
    return SequenceMatcher(None, _normalize(name_a), _normalize(name_b)).ratio()


def match_user_input_to_document(
    document_type: DocumentType,
    user_id_number: Optional[str],
    user_full_name: str,
    ocr_result: OCRResult,
    name_similarity_threshold: float = DEFAULT_NAME_SIMILARITY_THRESHOLD,
) -> DocumentMatchResult:
    """
    Compare what the customer typed in against what OCR extracted from their
    ID/passport photo.
    """
    reasons = []

    if not ocr_result.success:
        return DocumentMatchResult(
            overall_match=False,
            id_number_match=None,
            name_match=False,
            name_similarity=0.0,
            reasons=[f"Document data unavailable: {ocr_result.error}"],
        )

    # Name match - required for both SA ID holders and foreign ID holders.
    similarity = _name_similarity(user_full_name, ocr_result.full_name or "")
    name_match = similarity >= name_similarity_threshold
    if not name_match:
        reasons.append(
            f"Name similarity {similarity:.2f} is below the {name_similarity_threshold:.2f} threshold."
        )

    # ID number match - only applicable for SA ID holders. Foreign ID holders
    # already had their passport number matched against RICA earlier in the
    # journey, so it is intentionally not re-checked here.
    id_number_match: Optional[bool] = None
    if document_type == DocumentType.SA_ID:
        id_number_match = _normalize(user_id_number) == _normalize(ocr_result.document_number)
        if not id_number_match:
            reasons.append("User-supplied ID number does not match the ID document.")

    overall_match = name_match and (id_number_match is not False)

    return DocumentMatchResult(
        overall_match=overall_match,
        id_number_match=id_number_match,
        name_match=name_match,
        name_similarity=round(similarity, 4),
        reasons=reasons,
    )
