"""In-app notification inbox — read side of HT2-24 / HT2-25.

The verification orchestrator writes approval/rejection notifications; this
endpoint lets the frontend display them. Notifications are keyed by ID number
so a customer only sees their own decisions.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel

from Backend.app import repository

router = APIRouter(prefix="/api/v1", tags=["notifications"])


class NotificationRecord(BaseModel):
    id: str
    id_number: str
    attempt_id: str | None = None
    type: str
    channel: str
    message: str
    created_at: str


@router.get("/notifications", response_model=list[NotificationRecord])
def list_notifications(
    id_number: str | None = Query(None, max_length=32),
    limit: int = Query(50, ge=1, le=200),
) -> list[NotificationRecord]:
    rows = repository.list_notifications(
        id_number=id_number.strip() if id_number else None,
        limit=limit,
    )
    return [NotificationRecord(**row) for row in rows]
