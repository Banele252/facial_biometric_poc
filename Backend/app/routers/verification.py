"""Identity verification against the external VerifyNow provider."""

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from Backend.app.config import get_settings
from Backend.app.services.face_match import run_face_match_bytes
from Backend.external_backend.main import VerifyNowError, get_credits, verify_said

# Uploads the journey never stored. 10 MB is well past a phone camera JPEG and
# well short of anything worth buffering in a request handler.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["verification"])


class VerificationRequest(BaseModel):
    id_number: str = Field(..., min_length=1, max_length=32)
    mode: str = Field("production", pattern="^(production|sandbox)$")


@router.post("/verify-identity")
def verify_identity(payload: VerificationRequest) -> dict:
    settings = get_settings()
    if not settings.verify_now_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Identity verification provider is not configured",
        )

    try:
        return verify_said(
            id_number=payload.id_number.strip(),
            mode=payload.mode,
            timeout=settings.request_timeout_seconds,
        )
    except VerifyNowError as exc:
        # Log the provider detail, but do not leak it to the caller.
        logger.error("VerifyNow verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Identity verification provider is unavailable",
        ) from exc


@router.post("/face-match")
async def face_match_endpoint(
    id_number: str = Form(...),
    selfie_image: UploadFile = File(...),
) -> dict:
    """Match an uploaded selfie against the Home Affairs photo.

    A direct, single-step view of the same match the journey runs at
    ``POST /api/v1/verifications``, for testing a selfie against an ID number
    without walking the whole journey. The call mode is not a parameter here
    for the same reason it is not one there: it is a deployment decision read
    from VERIFY_MODE, so no caller can move this to production on its own.
    """
    settings = get_settings()
    if not settings.verify_now_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Identity verification provider is not configured",
        )

    if selfie_image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type: {selfie_image.content_type}",
        )

    image_bytes = await selfie_image.read()
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image exceeds the maximum allowed size (10MB)",
        )

    try:
        result = run_face_match_bytes(id_number.strip(), image_bytes, settings)
    except VerifyNowError as exc:
        logger.error("VerifyNow face match failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Identity verification provider is unavailable",
        ) from exc

    return {
        "outcome": result.outcome,
        "provider_status": result.provider_status,
        "score": result.score,
        "detail": result.detail,
        "mode": settings.verify_mode,
    }


@router.get("/credits")
def credits() -> dict:
    settings = get_settings()
    if not settings.verify_now_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Identity verification provider is not configured",
        )

    try:
        return get_credits(timeout=settings.request_timeout_seconds)
    except VerifyNowError as exc:
        logger.error("VerifyNow credits lookup failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Identity verification provider is unavailable",
        ) from exc
