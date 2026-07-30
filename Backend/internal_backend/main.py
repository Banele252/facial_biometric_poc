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

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from db_logger import ensure_table, log_call, summarize_upload
from document_match import DocumentType, match_user_input_to_document
from dotenv import load_dotenv
from face_match import match_face_to_document as match_face_to_document_azure
from face_match_local import match_face_to_document as match_face_to_document_local
from fallback_verification_decision import evaluate_fallback_verification
from fastapi import BackgroundTasks, FastAPI, File, Form, UploadFile
from ocr_validator import extract_id_fields
from pydantic import BaseModel

load_dotenv()

SERVICE_NAME = "internal_backend"

# face_match.py (Azure) is left untouched so it's a no-code-change swap back
# once Azure Face API's Limited Access approval comes through - set
# FACE_MATCH_PROVIDER=local in .env to use face_match_local.py instead.
FACE_MATCH_PROVIDERS = {
    "azure": match_face_to_document_azure,
    "local": match_face_to_document_local,
}


def match_face_to_document(selfie_bytes: bytes, document_image_bytes: bytes):
    provider = os.getenv("FACE_MATCH_PROVIDER", "azure")
    return FACE_MATCH_PROVIDERS.get(provider, match_face_to_document_azure)(
        selfie_bytes, document_image_bytes
    )


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    ensure_table()
    yield


app = FastAPI(
    title="Facial Biometric Verification - Internal API", version="0.1.0", lifespan=lifespan
)


# --------------------------------------------------------------------------
# OCR Validation
# --------------------------------------------------------------------------
@app.post("/api/v1/ocr/extract")
async def ocr_extract(background_tasks: BackgroundTasks, document_image: UploadFile = File(...)):
    """Extract identity fields from a photographed/scanned ID document or passport."""
    document_bytes = await document_image.read()
    result = extract_id_fields(document_bytes)
    response = {
        "success": result.success,
        "document_type": result.document_type,
        "full_name": result.full_name,
        "document_number": result.document_number,
        "date_of_birth": result.date_of_birth.isoformat() if result.date_of_birth else None,
        "country_region": result.country_region,
        "field_confidence": result.field_confidence,
        "error": result.error,
    }
    background_tasks.add_task(
        log_call,
        service=SERVICE_NAME,
        endpoint="/api/v1/ocr/extract",
        method="POST",
        request_summary=summarize_upload(
            document_image.filename, document_image.content_type, len(document_bytes)
        ),
        response_summary=response,
        status_code=200,
    )
    return response


# --------------------------------------------------------------------------
# User Input Match Against Document
# --------------------------------------------------------------------------
@app.post("/api/v1/verify/document-match")
async def document_match_endpoint(
    background_tasks: BackgroundTasks,
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
    response = {
        "overall_match": match_result.overall_match,
        "id_number_match": match_result.id_number_match,
        "name_match": match_result.name_match,
        "name_similarity": match_result.name_similarity,
        "reasons": match_result.reasons,
    }
    background_tasks.add_task(
        log_call,
        service=SERVICE_NAME,
        endpoint="/api/v1/verify/document-match",
        method="POST",
        request_summary={
            "document_type": document_type.value,
            "user_full_name": user_full_name,
            "user_id_number": user_id_number,
            "document_image": summarize_upload(
                document_image.filename, document_image.content_type, len(document_bytes)
            ),
        },
        response_summary=response,
        status_code=200,
    )
    return response


# --------------------------------------------------------------------------
# Face Match Against Document photo
# --------------------------------------------------------------------------
@app.post("/api/v1/verify/face-match")
async def face_match_endpoint(
    background_tasks: BackgroundTasks,
    selfie_image: UploadFile = File(...),
    document_image: UploadFile = File(...),
):
    """Compare a live selfie against the photo on the ID document / passport."""
    selfie_bytes = await selfie_image.read()
    document_bytes = await document_image.read()
    result = match_face_to_document(selfie_bytes, document_bytes)
    response = {
        "success": result.success,
        "is_match": result.is_match,
        "confidence": result.confidence,
        "error": result.error,
    }
    background_tasks.add_task(
        log_call,
        service=SERVICE_NAME,
        endpoint="/api/v1/verify/face-match",
        method="POST",
        request_summary={
            "selfie_image": summarize_upload(
                selfie_image.filename, selfie_image.content_type, len(selfie_bytes)
            ),
            "document_image": summarize_upload(
                document_image.filename, document_image.content_type, len(document_bytes)
            ),
        },
        response_summary=response,
        status_code=200,
    )
    return response


# --------------------------------------------------------------------------
# Reject Identity Mismatches (full OCR/document fallback pipeline)
# --------------------------------------------------------------------------
class FallbackVerifyResponse(BaseModel):
    status: str
    reasons: list[str]


@app.post("/api/v1/fallback-verification/verify", response_model=FallbackVerifyResponse)
async def verify_fallback(
    background_tasks: BackgroundTasks,
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

    background_tasks.add_task(
        log_call,
        service=SERVICE_NAME,
        endpoint="/api/v1/fallback-verification/verify",
        method="POST",
        request_summary={
            "document_type": document_type.value,
            "user_full_name": user_full_name,
            "user_id_number": user_id_number,
            "reference_id": reference_id,
            "selfie_image": summarize_upload(
                selfie_image.filename, selfie_image.content_type, len(selfie_bytes)
            ),
            "document_image": summarize_upload(
                document_image.filename, document_image.content_type, len(document_bytes)
            ),
        },
        response_summary={"status": decision.status.value, "reasons": decision.reasons},
        status_code=200,
    )

    return FallbackVerifyResponse(status=decision.status.value, reasons=decision.reasons)


@app.get("/health")
async def health():
    return {"status": "ok"}
