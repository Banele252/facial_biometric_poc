"""Selfie capture and liveness endpoints.

HT2-11 (Capture Selfie): accept a base64/data-URL image, store it via the
storage service and register it. HT2-12 (Perform Liveness Check): run the
configured liveness provider against a stored selfie and persist the verdict.

Selfies are sensitive personal information: the raw image is never returned or
logged, only opaque identifiers and the liveness verdict.
"""

import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from Backend.app import repository
from Backend.app.config import get_settings
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


@router.post("/selfies", response_model=SelfieResponse, status_code=status.HTTP_201_CREATED)
def capture_selfie(payload: SelfieRequest) -> SelfieResponse:
    try:
        raw, content_type = storage_service.decode_image(payload.image)
    except storage_service.StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    stored = storage_service.get_storage().save(payload.id_number.strip(), raw, content_type)
    selfie = repository.create_selfie(
        id_number=payload.id_number.strip(),
        storage_ref=stored.reference,
        content_type=stored.content_type,
    )
    return SelfieResponse(
        selfie_id=selfie["id"],
        content_type=stored.content_type,
        size_bytes=stored.size_bytes,
        liveness_status=selfie["liveness_status"],
    )


@router.post("/selfies/{selfie_id}/liveness", response_model=LivenessResponse)
def check_liveness(selfie_id: str) -> LivenessResponse:
    selfie = repository.get_selfie(selfie_id)
    if selfie is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selfie not found")

    try:
        raw = storage_service.get_storage().load(selfie["storage_ref"])
    except Exception as exc:  # storage backends raise varied errors
        logger.error("Failed to load stored selfie: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stored selfie could not be retrieved",
        ) from exc

    settings = get_settings()
    provider = liveness_service.get_liveness_provider(settings)
    try:
        result = provider.check(raw, selfie["content_type"], settings.liveness_min_score)
    except RuntimeError as exc:
        # e.g. the Azure Face provider is unavailable in this environment.
        logger.error("Liveness provider error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Liveness provider is unavailable",
        ) from exc

    repository.set_selfie_liveness(
        selfie_id,
        status="live" if result.is_live else "not_live",
        score=result.score,
        provider=result.provider,
    )
    return LivenessResponse(
        selfie_id=selfie_id,
        is_live=result.is_live,
        score=result.score,
        provider=result.provider,
        detail=result.detail,
    )
