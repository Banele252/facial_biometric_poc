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
from datetime import date, datetime


@dataclass
class OCRResult:
    success: bool
    document_type: str | None = None  # "idDocument" or "passport"
    first_name: str | None = None
    last_name: str | None = None
    full_name: str | None = None
    document_number: str | None = None  # SA ID number or passport number
    date_of_birth: date | None = None
    country_region: str | None = None
    field_confidence: dict = field(default_factory=dict)
    error: str | None = None


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


# Document Intelligence puts a field's parsed value on a type-specific
# attribute - a date field populates `value_date` and leaves `value_string`
# empty, a country field populates `value_country_region`, and so on. Reading
# only `value_string` therefore silently misses every non-string field and
# falls through to `content`, which is the raw text exactly as printed on the
# document ("15 MAR 90", "ZAF") rather than a parsed value.
_TYPED_VALUE_ATTRS = ("value_date", "value_country_region", "value_string")


def _field_value(fields: dict, name: str):
    f = fields.get(name)
    if f is None:
        return None, None
    confidence = getattr(f, "confidence", None)
    for attr in _TYPED_VALUE_ATTRS:
        value = getattr(f, attr, None)
        if value is not None:
            return value, confidence
    # Nothing typed - fall back to the raw OCR text for this field.
    return getattr(f, "content", None), confidence


def _coerce_date(value) -> date | None:
    """Normalise a Document Intelligence date field to a `date`.

    `value_date` already gives a real date object. The fallback path only
    matters when Azure could not type the field and we are left with the raw
    text off the document, which is rarely ISO-formatted - so the common
    printed layouts are tried explicitly. Day-first ordering throughout:
    these are SA IDs and passports, not US documents.
    """
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value

    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


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
    country_region, cr_conf = _field_value(fields, "CountryRegion")

    dob = _coerce_date(dob_raw) if dob_raw else None

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
            "country_region": cr_conf,
        },
    )
