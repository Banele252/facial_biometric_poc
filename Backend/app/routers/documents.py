"""Document verification endpoints — OCR and the document-based matches.

These are the individual document steps of the journey, exposed one at a time
so a document can be tested on its own without walking the whole flow at
``POST /api/v1/verifications``. They run the same
``Backend.app.services.documents`` code the journey runs, so an answer here is
the answer the journey would get.

Replaces the standalone FastAPI app that used to live at
``Backend/internal_backend/main.py``. That app was never mounted or served —
the container runs a single process — so its endpoints were unreachable and
drifted from the journey's copy of the same logic.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile
from pydantic import BaseModel

from Backend.app.routers.uploads import read_image
from Backend.app.services.documents import (
    ClaimedIdentity,
    DocumentType,
    extract_document_fields,
    match_input_to_document,
    match_selfie_to_document,
)
from Backend.internal_backend.db_logger import log_call, summarize_upload
from Backend.internal_backend.fallback_verification_decision import (
    evaluate_fallback_verification,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])

SERVICE_NAME = "internal_backend"


class FallbackVerifyResponse(BaseModel):
    status: str
    reasons: list[str]


@router.post("/ocr")
async def ocr_extract(
    background_tasks: BackgroundTasks,
    document_image: UploadFile = File(...),
    user_full_name: str = Form(""),
    user_id_number: str = Form(""),
) -> dict:
    """Extract the identity fields from a photographed ID document or passport.

    ``user_full_name`` and ``user_id_number`` are only consulted by the mock
    provider, which has no way to read an image and uses them to decide whether
    to return a document that agrees with the customer. The Azure provider
    ignores them and reads what is on the document.
    """
    document_bytes = await read_image(document_image, "document_image")
    result = extract_document_fields(
        document_bytes,
        ClaimedIdentity(full_name=user_full_name, document_number=user_id_number),
    )
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
        endpoint="/api/v1/documents/ocr",
        method="POST",
        request_summary=summarize_upload(
            document_image.filename, document_image.content_type, len(document_bytes)
        ),
        response_summary=response,
        status_code=200,
    )
    return response


@router.post("/input-match")
async def document_match_endpoint(
    background_tasks: BackgroundTasks,
    document_type: DocumentType = Form(...),
    user_full_name: str = Form(...),
    user_id_number: str = Form(""),
    document_image: UploadFile = File(...),
) -> dict:
    """Compare the customer's typed details against the OCR'd document."""
    document_bytes = await read_image(document_image, "document_image")
    claimed = ClaimedIdentity(full_name=user_full_name, document_number=user_id_number)
    ocr_result = extract_document_fields(document_bytes, claimed)
    match_result = match_input_to_document(
        document_type=document_type,
        user_full_name=user_full_name,
        user_id_number=user_id_number,
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
        endpoint="/api/v1/documents/input-match",
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


@router.post("/face-match")
async def document_face_match_endpoint(
    background_tasks: BackgroundTasks,
    selfie_image: UploadFile = File(...),
    document_image: UploadFile = File(...),
) -> dict:
    """Compare a live selfie against the photo on the document."""
    selfie_bytes = await read_image(selfie_image, "selfie_image")
    document_bytes = await read_image(document_image, "document_image")
    result = match_selfie_to_document(selfie_bytes, document_bytes)
    response = {
        "success": result.success,
        "is_match": result.is_match,
        "confidence": result.confidence,
        "error": result.error,
    }
    background_tasks.add_task(
        log_call,
        service=SERVICE_NAME,
        endpoint="/api/v1/documents/face-match",
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


@router.post("/verify", response_model=FallbackVerifyResponse)
async def verify_documents(
    background_tasks: BackgroundTasks,
    document_type: DocumentType = Form(...),
    user_full_name: str = Form(...),
    user_id_number: str = Form(""),
    reference_id: str = Form(""),
    selfie_image: UploadFile = File(...),
    document_image: UploadFile = File(...),
) -> FallbackVerifyResponse:
    """The three document steps as one call: OCR, face match, detail match.

    The same sequence the journey runs between its fraud pre-checks and the
    RICA lookup, without the rest of the journey around it.
    """
    document_bytes = await read_image(document_image, "document_image")
    selfie_bytes = await read_image(selfie_image, "selfie_image")
    claimed = ClaimedIdentity(full_name=user_full_name, document_number=user_id_number)

    ocr_result = extract_document_fields(document_bytes, claimed)
    doc_match_result = match_input_to_document(
        document_type=document_type,
        user_full_name=user_full_name,
        user_id_number=user_id_number,
        ocr_result=ocr_result,
    )
    face_result = match_selfie_to_document(selfie_bytes, document_bytes)

    decision = evaluate_fallback_verification(
        document_match_result=doc_match_result,
        face_match_result=face_result,
        reference_id=reference_id,
    )

    background_tasks.add_task(
        log_call,
        service=SERVICE_NAME,
        endpoint="/api/v1/documents/verify",
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
