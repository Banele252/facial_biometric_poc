"""Liveness and readiness probes.

Container Apps polls these; /healthz must stay cheap and dependency-free so a
downstream outage never restarts an otherwise healthy container.
"""

from fastapi import APIRouter

from Backend.app.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
def readyz() -> dict[str, object]:
    settings = get_settings()
    return {
        "status": "ready",
        "verify_now_configured": settings.verify_now_configured,
        "liveness_provider": settings.liveness_provider,
        "blob_storage_configured": settings.blob_storage_configured,
    }
