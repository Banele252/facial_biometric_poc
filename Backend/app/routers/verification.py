"""Identity verification against the external VerifyNow provider."""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from Backend.app.config import get_settings
from Backend.app.dependencies.security import get_correlation_id, require_biometric_read, require_biometric_write
from Backend.external_backend.main import VerifyNowError, get_credits, verify_said

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["verification"])


class VerificationRequest(BaseModel):
    id_number: str = Field(..., min_length=1, max_length=32)
    mode: str = Field("production", pattern="^(production|sandbox)$")


@router.post("/verify-identity", dependencies=[Depends(require_biometric_write)])
def verify_identity(payload: VerificationRequest, correlation_id: str = Depends(get_correlation_id)) -> dict:
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
        logger.error("VerifyNow verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Identity verification provider is unavailable",
        ) from exc


@router.get("/credits", dependencies=[Depends(require_biometric_read)])
def credits(correlation_id: str = Depends(get_correlation_id)) -> dict:
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
