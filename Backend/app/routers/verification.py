"""Identity verification against the external VerifyNow provider."""

import logging

from fastapi import APIRouter, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel, Field
import base64
from Backend.app.config import get_settings
from Backend.external_backend.main import VerifyNowError, get_credits, verify_said, face_match

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["verification"])


class VerificationRequest(BaseModel):
    reportType: str = Field("said_verification")
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

@router.post("/face-match")
async def face_match_endpoint(
          id_number: str = Form(...),
          mode: str = Form("production"),
          selfie_image: UploadFile = File(...),
                ) -> dict:
    settings = get_settings()
    if not settings.verify_now_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Identity verification provider is not configured",
        )
    
     # Basic validation before doing any work
    if selfie_image.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type: {selfie_image.content_type}",
        )
    image_bytes = await selfie_image.read()

    # Optional: guard against absurdly large uploads
    max_size = 10 * 1024 * 1024  # 10 MB
    if len(image_bytes) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image exceeds maximum allowed size (10MB)",
        )

    selfie_image_base64 = base64.b64encode(image_bytes).decode("utf-8")

    try:
        return face_match(
            id_number=id_number.strip(),
            selfie_image_base64=selfie_image_base64,
            mode=mode,
            timeout=settings.request_timeout_seconds,
        )
    
    except VerifyNowError as exc:
        logger.error("VerifyNow face match failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Identity verification provider is unavailable",
        ) from exc
