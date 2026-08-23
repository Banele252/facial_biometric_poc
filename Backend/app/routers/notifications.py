# Backend/app/routers/notifications.py
"""
In-app notification inbox — read side of HT2-24 / HT2-25.
The verification orchestrator writes approval/rejection notifications; this
endpoint lets the frontend display them. Notifications are keyed by ID number
so a customer only sees their own decisions.

SECURITY: Implemented as POST to prevent South African ID numbers
from leaking into URL access logs, CDN logs, and APM tools.
"""
import hashlib
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from Backend.app import repository
from Backend.app.dependencies.security import (
    get_correlation_id,
    get_current_user,
    require_biometric_read,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["notifications"])


class NotificationRecord(BaseModel):
    id: str
    id_number: str
    attempt_id: str | None = None
    type: str
    channel: str
    message: str
    created_at: str


class NotificationRequest(BaseModel):
    id_number: str = Field(..., min_length=1, max_length=32)
    limit: int = Field(50, ge=1, le=200)


def _hash_id(id_number: str) -> str:
    """Hash ID number for logging without exposing PII."""
    return hashlib.sha256(id_number.encode()).hexdigest()[:12]


@router.post(
    "/notifications",
    response_model=list[NotificationRecord],
    dependencies=[Depends(require_biometric_read)],
)
def list_notifications(
        request: Request,
        payload: NotificationRequest,
        user: Annotated[dict, Depends(get_current_user)],
        correlation_id: Annotated[str, Depends(get_correlation_id)],
) -> list[NotificationRecord]:
    """
    Retrieve notifications for a specific ID number.
    Implemented as POST to prevent PII leakage in URL logs.
    """
    user_ref = user.get("sub", "anonymous")
    id_hash = _hash_id(payload.id_number)

    logger.info(
        "notifications.list.start correlation=%s user=%s id_hash=%s limit=%d",
        correlation_id, user_ref, id_hash, payload.limit,
    )

    rows = repository.list_notifications(
        id_number=payload.id_number.strip(),
        limit=payload.limit,
    )

    logger.info(
        "notifications.list.success correlation=%s user=%s id_hash=%s count=%d",
        correlation_id, user_ref, id_hash, len(rows),
    )

    return [NotificationRecord(**row) for row in rows]