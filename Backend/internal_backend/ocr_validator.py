"""
OCR Validation.

"As the system, I want to extract identity information from the ID document
(or passport) so that customer details can be validated."

Uses Azure AI Document Intelligence's prebuilt identity-document model to pull
structured fields (name, document number, date of birth, document type, etc.)
out of a scanned/photographed SA ID or passport.

Requires the following environment variables (see .env):
    AZURE_DOC_INTELLIGENCE_ENDPOINT
    AZURE_DOC_INTELLIGENCE_KEY

NOTE: this module makes a real call out to Azure. It has not been tested
against a live Azure resource - the field-extraction logic has been
structured so it can be unit tested independently by mocking
`_analyze_document`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class OCRResult:
    success: bool
    document_type: Optional[str] = None          # "idDocument" or "passport"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    document_number: Optional[str] = None         # SA ID number or passport number
    date_of_birth: Optional[date] = None
    country_region: Optional[str] = None
    field_confidence: dict = field(default_factory=dict)
    error: Optional[str] = None


class OCRValidationError(Exception):
    """Raised when the document could not be read or fields could not be extracted."""


def _get_client():
    """
    Build the Azure Document Intelligence client. Kept as a separate function
    so tests can monkeypatch/mock it without needing real credentials.
    """
    from azure.ai.documentintelligence import DocumentIntelligenceClient
    from azure.core.credentials import AzureKeyCredential

    endpoint = os.getenv("AZURE_DOC_INTELLIGENCE_ENDPOINT")
    key = os.getenv("AZURE_DOC_INTELLIGENCE_KEY")
    if not endpoint or not key:
        raise OCRValidationError(
            "AZURE_DOC_INTELLIGENCE_ENDPOINT and AZURE_DOC_INTELLIGENCE_KEY must be set."
        )
    return DocumentIntelligenceClient(endpoint=endpoint, credential=AzureKeyCredential(key))


def _analyze_document(document_bytes: bytes):
    """
    Calls Azure Document Intelligence's prebuilt-idDocument model.
    Isolated in its own function so tests can replace it with a fake result.
    """
    client = _get_client()
    poller = client.begin_analyze_document(
        "prebuilt-idDocument",
        body=document_bytes,
        content_type="application/octet-stream",
    )
    return poller.result()


def _field_value(fields: dict, name: str):
    f = fields.get(name)
    if f is None:
        return None, None
    value = getattr(f, "value_string", None) or getattr(f, "content", None)
    confidence = getattr(f, "confidence", None)
    return value, confidence


def extract_id_fields(document_bytes: bytes) -> OCRResult:
    """
    Extract identity fields from a photographed/scanned SA ID or passport.

    Returns an OCRResult. On failure, success=False and `error` explains why
    (e.g. no document detected, unreadable image, Azure call failed) rather
    than raising, so callers (like the API layer) can turn this straight into
    a meaningful HTTP response.
    """
    if not document_bytes:
        return OCRResult(success=False, error="No document image was provided.")

    try:
        result = _analyze_document(document_bytes)
    except OCRValidationError as exc:
        return OCRResult(success=False, error=str(exc))
    except Exception as exc:  # Azure SDK errors, network errors, etc.
        return OCRResult(success=False, error=f"OCR extraction failed: {exc}")

    if not getattr(result, "documents", None):
        return OCRResult(success=False, error="No identity document detected in the image.")

    doc = result.documents[0]
    fields = doc.fields or {}

    first_name, fn_conf = _field_value(fields, "FirstName")
    last_name, ln_conf = _field_value(fields, "LastName")
    document_number, dn_conf = _field_value(fields, "DocumentNumber")
    dob_raw, dob_conf = _field_value(fields, "DateOfBirth")
    country_region, _ = _field_value(fields, "CountryRegion")

    dob = None
    if dob_raw:
        try:
            # Document Intelligence normally returns ISO-formatted dates.
            dob = date.fromisoformat(str(dob_raw)[:10])
        except ValueError:
            dob = None

    full_name = " ".join(part for part in [first_name, last_name] if part) or None

    return OCRResult(
        success=True,
        document_type=getattr(doc, "doc_type", None),
        first_name=first_name,
        last_name=last_name,
        full_name=full_name,
        document_number=document_number,
        date_of_birth=dob,
        country_region=country_region,
        field_confidence={
            "first_name": fn_conf,
            "last_name": ln_conf,
            "document_number": dn_conf,
            "date_of_birth": dob_conf,
        },
    )
