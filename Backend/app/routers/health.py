# Backend/app/routers/health.py
"""
Liveness and readiness probes for Kubernetes/Azure Container Apps.

Design principles:
- /healthz MUST stay cheap and dependency-free so a downstream outage
  never restarts an otherwise healthy container.
- /readyz can check dependencies but should fail gracefully with details.
- Both endpoints are in PUBLIC_PATHS (no auth required).
"""
import logging
from typing import Any

from fastapi import APIRouter

from Backend.app.config import get_settings

logger = logging.getLogger("health.probes")

router = APIRouter(tags=["health"])


@router.get(
    "/healthz",
    summary="Liveness probe",
    description="Simple liveness check. Must stay dependency-free.",
    response_model=dict[str, str],
)
def healthz() -> dict[str, str]:
    """
    Liveness probe - returns 200 if the process is running.
    This endpoint MUST NOT check external dependencies (DB, Redis, etc.)
    to prevent cascading restarts during downstream outages.
    """
    return {"status": "ok"}


@router.get(
    "/readyz",
    summary="Readiness probe",
    description="Checks if the application is ready to serve traffic.",
    response_model=dict[str, Any],
)
def readyz() -> dict[str, Any]:
    """
    Readiness probe - checks if all required configurations are in place.
    Can check dependencies but should fail gracefully.
    """
    settings = get_settings()

    checks = {
        "status": "ready",
        "verify_now_configured": settings.verify_now_configured,
        "liveness_provider": settings.liveness_provider,
        "blob_storage_configured": settings.blob_storage_configured,
        "jwt_keys_configured": bool(settings.jwt_public_key and settings.jwt_private_key),
        "redis_configured": bool(settings.redis_url),
    }

    # Determine overall readiness
    # Note: verify_now_configured can be False in sandbox mode, so we don't fail on it
    critical_checks = [
        checks["jwt_keys_configured"],
    ]

    if not all(critical_checks):
        checks["status"] = "not_ready"
        checks["reason"] = "Critical configuration missing"
        logger.warning("Readiness check failed: %s", checks)
        return checks

    logger.debug("Readiness check passed: %s", checks)
    return checks