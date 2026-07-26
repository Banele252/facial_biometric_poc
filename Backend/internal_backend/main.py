"""
Internal backend API - OCR/document fallback verification.

Covers the OCR-and-document fallback flow used when Home Affairs
verification is unavailable (see "Fallback Verification" / "Passport
Verification" user story):
    - OCR Validation (extract identity fields from an ID/passport image)
    - User Input Match Against Document (compare user input to OCR'd fields)
    - Face Match Against Document (compare a live selfie to the document photo)
    - Reject Identity Mismatches (combine the above into an accept/reject decision)

Run locally with (from this directory):
    uv run uvicorn main:app --reload

Then open http://127.0.0.1:8000/docs for interactive Swagger docs.
"""

from __future__ import annotations

from fastapi import FastAPI, File, Form, UploadFile
from pydantic import BaseModel

from document_match import DocumentType, match_user_input_to_document
from face_match import match_face_to_document
from fallback_verification_decision import evaluate_fallback_verification
from ocr_validator import extract_id_fields

app = FastAPI(title="Facial Biometric Verification - Internal API", version="0.1.0")


# --------------------------------------------------------------------------
# OCR Validation
# --------------------------------------------------------------------------
@app.post("/api/v1/ocr/extract")
async def ocr_extract(document_image: UploadFile = File(...)):
    """Extract identity fields from a photographed/scanned ID document or passport."""
    document_bytes = await document_image.read()
    result = extract_id_fields(document_bytes)
    return {
        "success": result.success,
        "document_type": result.document_type,
        "full_name": result.full_name,
        "document_number": result.document_number,
        "date_of_birth": result.date_of_birth.isoformat() if result.date_of_birth else None,
        "country_region": result.country_region,
        "field_confidence": result.field_confidence,
        "error": result.error,
    }


# --------------------------------------------------------------------------
# User Input Match Against Document
# --------------------------------------------------------------------------
@app.post("/api/v1/verify/document-match")
async def document_match_endpoint(
    document_type: DocumentType = Form(...),
    user_full_name: str = Form(...),
    user_id_number: str = Form(""),
    document_image: UploadFile = File(...),
):
    """Compare user-supplied identity details against the OCR'd ID/passport."""
    document_bytes = await document_image.read()
    ocr_result = extract_id_fields(document_bytes)
    match_result = match_user_input_to_document(
        document_type=document_type,
        user_id_number=user_id_number,
        user_full_name=user_full_name,
        ocr_result=ocr_result,
    )
    return {
        "overall_match": match_result.overall_match,
        "id_number_match": match_result.id_number_match,
        "name_match": match_result.name_match,
        "name_similarity": match_result.name_similarity,
        "reasons": match_result.reasons,
    }


# --------------------------------------------------------------------------
# Face Match Against Document photo
# --------------------------------------------------------------------------
@app.post("/api/v1/verify/face-match")
async def face_match_endpoint(
    selfie_image: UploadFile = File(...),
    document_image: UploadFile = File(...),
):
    """Compare a live selfie against the photo on the ID document / passport."""
    selfie_bytes = await selfie_image.read()
    document_bytes = await document_image.read()
    result = match_face_to_document(selfie_bytes, document_bytes)
    return {
        "success": result.success,
        "is_match": result.is_match,
        "confidence": result.confidence,
        "error": result.error,
    }


# --------------------------------------------------------------------------
# Reject Identity Mismatches (full OCR/document fallback pipeline)
# --------------------------------------------------------------------------
class FallbackVerifyResponse(BaseModel):
    status: str
    reasons: list[str]


@app.post("/api/v1/fallback-verification/verify", response_model=FallbackVerifyResponse)
async def verify_fallback(
    document_type: DocumentType = Form(...),
    user_full_name: str = Form(...),
    user_id_number: str = Form(""),
    reference_id: str = Form(""),
    selfie_image: UploadFile = File(...),
    document_image: UploadFile = File(...),
):
    """
    Full OCR/document fallback pipeline: OCR -> document match -> face match
    -> accept/reject decision. Used when Home Affairs verification is
    unavailable and the customer falls back to scanning their ID/passport.
    """
    document_bytes = await document_image.read()
    selfie_bytes = await selfie_image.read()

    ocr_result = extract_id_fields(document_bytes)
    doc_match_result = match_user_input_to_document(
        document_type=document_type,
        user_id_number=user_id_number,
        user_full_name=user_full_name,
        ocr_result=ocr_result,
    )
    face_result = match_face_to_document(selfie_bytes, document_bytes)

    decision = evaluate_fallback_verification(
        document_match_result=doc_match_result,
        face_match_result=face_result,
        reference_id=reference_id,
    )

    return FallbackVerifyResponse(status=decision.status.value, reasons=decision.reasons)


@app.get("/health")
async def health():
    return {"status": "ok"}
