"""Identity verification against the external VerifyNow provider."""
import hashlib
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from Backend.app.config import get_settings
from Backend.app.dependencies.security import (
    get_correlation_id,
    get_current_user,
    require_biometric_read,
    require_biometric_write,
)
from Backend.external_backend.main import VerifyNowError, get_credits, verify_said

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["verification"])


class VerificationRequest(BaseModel):
    id_number: str = Field(..., min_length=1, max_length=32)
    mode: str = Field("production", pattern="^(production|sandbox)$")


def _hash_id(id_number: str) -> str:
    """Hash ID number for logging without exposing PII."""
    return hashlib.sha256(id_number.encode()).hexdigest()[:12]


@router.post(
    "/verify-identity",
    dependencies=[Depends(require_biometric_write)],
)
def verify_identity(
        request: Request,
        payload: VerificationRequest,
        user: Annotated[dict, Depends(get_current_user)],
        correlation_id: Annotated[str, Depends(get_correlation_id)],
) -> dict:
    """Verify identity against the external VerifyNow provider."""
    settings = get_settings()
    user_ref = user.get("sub", "anonymous")
    id_hash = _hash_id(payload.id_number)

    logger.info(
        "verification.verify_identity.start correlation=%s user=%s id_hash=%s mode=%s",
        correlation_id, user_ref, id_hash, payload.mode,
    )

    if not settings.verify_now_configured:
        logger.warning(
            "verification.verify_identity.not_configured correlation=%s user=%s",
            correlation_id, user_ref,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Identity verification provider is not configured",
            headers={"X-Error-Code": "PROVIDER_NOT_CONFIGURED"},
        )

    try:
        result = verify_said(
            id_number=payload.id_number.strip(),
            mode=payload.mode,
            timeout=settings.request_timeout_seconds,
        )
        logger.info(
            "verification.verify_identity.success correlation=%s user=%s id_hash=%s",
            correlation_id, user_ref, id_hash,
        )
        return result
    except VerifyNowError as exc:
        logger.error(
            "verification.verify_identity.error correlation=%s user=%s id_hash=%s error=%s",
            correlation_id, user_ref, id_hash, str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Identity verification provider is unavailable",
            headers={"X-Error-Code": "PROVIDER_UNAVAILABLE"},
        ) from exc


@router.get(
    "/credits",
    dependencies=[Depends(require_biometric_read)],
)
def credits(
        request: Request,
        user: Annotated[dict, Depends(get_current_user)],
        correlation_id: Annotated[str, Depends(get_correlation_id)],
) -> dict:
    """Check remaining credits with the external provider."""
    settings = get_settings()
    user_ref = user.get("sub", "anonymous")

    logger.info(
        "verification.credits.start correlation=%s user=%s",
        correlation_id, user_ref,
    )

    if not settings.verify_now_configured:
        logger.warning(
            "verification.credits.not_configured correlation=%s user=%s",
            correlation_id, user_ref,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Identity verification provider is not configured",
            headers={"X-Error-Code": "PROVIDER_NOT_CONFIGURED"},
        )

    try:
        result = get_credits(timeout=settings.request_timeout_seconds)
        logger.info(
            "verification.credits.success correlation=%s user=%s",
            correlation_id, user_ref,
        )
        return result
    except VerifyNowError as exc:
        logger.error(
            "verification.credits.error correlation=%s user=%s error=%s",
            correlation_id, user_ref, str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Identity verification provider is unavailable",
            headers={"X-Error-Code": "PROVIDER_UNAVAILABLE"},
        ) from exc