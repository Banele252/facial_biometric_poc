"""Selfie capture and liveness endpoints.
HT2-11 (Capture Selfie): accept a base64/data-URL image, store it via the
storage service and register it. HT2-12 (Perform Liveness Check): run the
configured liveness provider against a stored selfie and persist the verdict.
Selfies are sensitive personal information: the raw image is never returned or
logged, only opaque identifiers and the liveness verdict.
"""
import hashlib
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from Backend.app import repository
from Backend.app.config import get_settings
from Backend.app.dependencies.security import (
    get_correlation_id,
    get_current_user,
    require_biometric_read,
    require_biometric_write,
)
from Backend.app.services import liveness as liveness_service
from Backend.app.services import storage as storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["selfies"])


class SelfieRequest(BaseModel):
    id_number: str = Field(..., min_length=1, max_length=32)
    image: str = Field(..., min_length=1, description="Base64 image or data URL")


class SelfieResponse(BaseModel):
    selfie_id: str
    content_type: str
    size_bytes: int
    liveness_status: str


class LivenessResponse(BaseModel):
    selfie_id: str
    is_live: bool
    score: float
    provider: str
    detail: str


def _hash_id(id_number: str) -> str:
    """Hash ID number for logging without exposing PII."""
    return hashlib.sha256(id_number.encode()).hexdigest()[:12]


@router.post(
    "/selfies",
    response_model=SelfieResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_biometric_write)],
)
def capture_selfie(
        request: Request,
        payload: SelfieRequest,
        user: Annotated[dict, Depends(get_current_user)],
        correlation_id: Annotated[str, Depends(get_correlation_id)],
) -> SelfieResponse:
    """Capture and store a selfie for liveness verification."""
    user_ref = user.get("sub", "anonymous")
    id_hash = _hash_id(payload.id_number)

    logger.info(
        "selfie.capture.start correlation=%s user=%s id_hash=%s",
        correlation_id, user_ref, id_hash,
    )

    try:
        raw, content_type = storage_service.decode_image(payload.image)
    except storage_service.StorageError as exc:
        logger.warning(
            "selfie.capture.decode_error correlation=%s user=%s error=%s",
            correlation_id, user_ref, str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
            headers={"X-Error-Code": "INVALID_IMAGE"},
        ) from exc

    stored = storage_service.get_storage().save(payload.id_number.strip(), raw, content_type)
    selfie = repository.create_selfie(
        id_number=payload.id_number.strip(),
        storage_ref=stored.reference,
        content_type=stored.content_type,
    )

    logger.info(
        "selfie.capture.success correlation=%s user=%s selfie_id=%s size=%d",
        correlation_id, user_ref, selfie["id"], stored.size_bytes,
    )

    return SelfieResponse(
        selfie_id=selfie["id"],
        content_type=stored.content_type,
        size_bytes=stored.size_bytes,
        liveness_status=selfie["liveness_status"],
    )


@router.post(
    "/selfies/{selfie_id}/liveness",
    response_model=LivenessResponse,
    dependencies=[Depends(require_biometric_read)],
)
def check_liveness(
        request: Request,
        selfie_id: str,
        user: Annotated[dict, Depends(get_current_user)],
        correlation_id: Annotated[str, Depends(get_correlation_id)],
) -> LivenessResponse:
    """Run liveness detection against a previously captured selfie."""
    user_ref = user.get("sub", "anonymous")

    logger.info(
        "selfie.liveness.start correlation=%s user=%s selfie_id=%s",
        correlation_id, user_ref, selfie_id,
    )

    selfie = repository.get_selfie(selfie_id)
    if selfie is None:
        logger.warning(
            "selfie.liveness.not_found correlation=%s user=%s selfie_id=%s",
            correlation_id, user_ref, selfie_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Selfie not found",
            headers={"X-Error-Code": "SELFIE_NOT_FOUND"},
        )

    try:
        raw = storage_service.get_storage().load(selfie["storage_ref"])
    except Exception as exc:
        logger.error(
            "selfie.liveness.load_error correlation=%s user=%s selfie_id=%s error=%s",
            correlation_id, user_ref, selfie_id, str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stored selfie could not be retrieved",
            headers={"X-Error-Code": "STORAGE_LOAD_ERROR"},
        ) from exc

    settings = get_settings()
    provider = liveness_service.get_liveness_provider(settings)

    try:
        result = provider.check(raw, selfie["content_type"], settings.liveness_min_score)
    except RuntimeError as exc:
        logger.error(
            "selfie.liveness.provider_error correlation=%s user=%s selfie_id=%s error=%s",
            correlation_id, user_ref, selfie_id, str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Liveness provider is unavailable",
            headers={"X-Error-Code": "PROVIDER_UNAVAILABLE"},
        ) from exc

    repository.set_selfie_liveness(
        selfie_id,
        status="live" if result.is_live else "not_live",
        score=result.score,
        provider=result.provider,
    )

    logger.info(
        "selfie.liveness.complete correlation=%s user=%s selfie_id=%s is_live=%s score=%.3f",
        correlation_id, user_ref, selfie_id, result.is_live, result.score,
    )

    return LivenessResponse(
        selfie_id=selfie_id,
        is_live=result.is_live,
        score=result.score,
        provider=result.provider,
        detail=result.detail,
    )