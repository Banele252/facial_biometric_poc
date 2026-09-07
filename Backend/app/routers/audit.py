# Backend/app/routers/audit.py
"""
Immutable audit log endpoints with hash-chain verification.
Provides batch ingestion, export, and cryptographic verification of audit events.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel

from Backend.app.db import get_db
from Backend.app.dependencies.security import (
    get_correlation_id,
    get_current_user,
    require_admin,
    require_biometric_read,
)
from Backend.app.schemas.audit import (
    AuditBatchRequest,
    AuditExportResponse,
    AuditVerifyResponse,
    ChainVerifyResponse,
)
from Backend.app.services.audit_service import audit_service

logger = logging.getLogger("audit.router")

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


class BatchIngestResponse(BaseModel):
    status: str
    accepted_entries: int
    rejected_entries: int
    chain_head: str | None = None
    correlation_id: str


class FraudSignal(BaseModel):
    signal_type: str
    severity: str
    detail: str
    timestamp: str


def _hash_user_id(user_id: str) -> str:
    """Hash user ID for logging without exposing PII."""
    return hashlib.sha256(user_id.encode()).hexdigest()[:12]


@router.post(
    "/batch",
    response_model=BatchIngestResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_biometric_read)],
)
async def ingest_batch(
        request: Request,
        payload: AuditBatchRequest,
        user: Annotated[dict, Depends(get_current_user)],
        correlation_id: Annotated[str, Depends(get_correlation_id)],
        x_device_id: str = Header(..., alias="X-Device-Id"),
        x_session_id: str = Header(..., alias="X-Session-Id"),
) -> BatchIngestResponse:
    """
    Ingest a batch of audit events with hash-chain integrity.
    Requires biometric:read scope and device/session headers.
    """
    user_ref = user.get("sub", "anonymous")

    logger.info(
        "audit.batch.ingest.start correlation=%s user=%s device=%s session=%s entries=%d",
        correlation_id, user_ref, x_device_id, x_session_id, len(payload.entries),
    )

    try:
        result = audit_service.ingest_batch(
            [e.model_dump() for e in payload.entries],
            payload.batch_hash,
        )

        logger.info(
            "audit.batch.ingest.success correlation=%s user=%s accepted=%d rejected=%d",
            correlation_id, user_ref, result["accepted"], result["rejected"],
        )

        return BatchIngestResponse(
            status="accepted",
            accepted_entries=result["accepted"],
            rejected_entries=result["rejected"],
            chain_head=result.get("new_chain_head"),
            correlation_id=correlation_id,
        )
    except ValueError as exc:
        logger.warning(
            "audit.batch.ingest.validation_error correlation=%s user=%s error=%s",
            correlation_id, user_ref, str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid batch: {str(exc)}",
            headers={"X-Error-Code": "INVALID_BATCH"},
        ) from exc
    except Exception as exc:
        logger.error(
            "audit.batch.ingest.error correlation=%s user=%s error=%s",
            correlation_id, user_ref, str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process audit batch",
            headers={"X-Error-Code": "BATCH_PROCESSING_ERROR"},
        ) from exc


@router.get(
    "/export/{user_id}",
    response_model=AuditExportResponse,
    dependencies=[Depends(require_admin)],
)
async def export_user_audit(
        request: Request,
        user_id: str,
        user: Annotated[dict, Depends(get_current_user)],
        correlation_id: Annotated[str, Depends(get_correlation_id)],
) -> AuditExportResponse:
    """
    Export all audit data for a specific user.
    Requires admin:docs scope. Users can only export their own data unless admin.
    """
    requesting_user = user.get("sub", "anonymous")
    is_admin = (
            user.get("role") == "admin"
            or "admin:docs" in user.get("scope", "").split()
    )

    if requesting_user != user_id and not is_admin:
        logger.warning(
            "audit.export.unauthorized correlation=%s requesting_user=%s target_user=%s",
            correlation_id, _hash_user_id(requesting_user), _hash_user_id(user_id),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized export request. Users can only export their own audit data.",
            headers={"X-Error-Code": "UNAUTHORIZED_EXPORT"},
        )

    logger.info(
        "audit.export.start correlation=%s requesting_user=%s target_user=%s is_admin=%s",
        correlation_id, _hash_user_id(requesting_user), _hash_user_id(user_id), is_admin,
    )

    try:
        result = audit_service.export_user_data(user_id)

        logger.info(
            "audit.export.success correlation=%s target_user=%s events=%d",
            correlation_id, _hash_user_id(user_id), len(result.get("events", [])),
        )

        return AuditExportResponse(**result)
    except Exception as exc:
        logger.error(
            "audit.export.error correlation=%s target_user=%s error=%s",
            correlation_id, _hash_user_id(user_id), str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to export audit data",
            headers={"X-Error-Code": "EXPORT_ERROR"},
        ) from exc


@router.get(
    "/verify/{event_id}",
    response_model=AuditVerifyResponse,
    dependencies=[Depends(require_biometric_read)],
)
async def verify_event(
        request: Request,
        event_id: str,
        user: Annotated[dict, Depends(get_current_user)],
        correlation_id: Annotated[str, Depends(get_correlation_id)],
) -> AuditVerifyResponse:
    """Verify the cryptographic integrity of a specific audit event."""
    user_ref = user.get("sub", "anonymous")

    logger.info(
        "audit.verify.event.start correlation=%s user=%s event_id=%s",
        correlation_id, user_ref, event_id,
    )

    db = get_db()
    db_row = db.query_one(
        "SELECT * FROM audit_logs WHERE event_id = ?", (event_id,)
    )

    if not db_row:
        logger.warning(
            "audit.verify.event.not_found correlation=%s user=%s event_id=%s",
            correlation_id, user_ref, event_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit event not found",
            headers={"X-Error-Code": "EVENT_NOT_FOUND"},
        )

    entry = dict(db_row)
    valid = audit_service._verify_entry_hash(entry)
    chain = audit_service.verify_chain(entry["session_id"])

    logger.info(
        "audit.verify.event.complete correlation=%s user=%s event_id=%s valid=%s chain_valid=%s",
        correlation_id, user_ref, event_id, valid, chain["valid"],
    )

    return AuditVerifyResponse(
        event_id=event_id,
        valid=valid,
        computed_hash="verified" if valid else "mismatch",
        stored_hash=entry["integrity_hash"],
        chain_valid=chain["valid"],
    )


@router.get(
    "/chain/{session_id}",
    response_model=ChainVerifyResponse,
    dependencies=[Depends(require_biometric_read)],
)
async def verify_chain(
        request: Request,
        session_id: str,
        user: Annotated[dict, Depends(get_current_user)],
        correlation_id: Annotated[str, Depends(get_correlation_id)],
) -> ChainVerifyResponse:
    """Verify the integrity of an entire audit chain for a session."""
    user_ref = user.get("sub", "anonymous")

    logger.info(
        "audit.verify.chain.start correlation=%s user=%s session_id=%s",
        correlation_id, user_ref, session_id,
    )

    try:
        result = audit_service.verify_chain(session_id)

        logger.info(
            "audit.verify.chain.complete correlation=%s user=%s session_id=%s valid=%s events=%d",
            correlation_id, user_ref, session_id, result["valid"], result.get("event_count", 0),
        )

        return ChainVerifyResponse(**result)
    except Exception as exc:
        logger.error(
            "audit.verify.chain.error correlation=%s user=%s session_id=%s error=%s",
            correlation_id, user_ref, session_id, str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify audit chain",
            headers={"X-Error-Code": "CHAIN_VERIFICATION_ERROR"},
        ) from exc


@router.get(
    "/fraud-signals/{session_id}",
    response_model=list[FraudSignal],
    dependencies=[Depends(require_biometric_read)],
)
async def get_fraud_signals(
        request: Request,
        session_id: str,
        user: Annotated[dict, Depends(get_current_user)],
        correlation_id: Annotated[str, Depends(get_correlation_id)],
) -> list[FraudSignal]:
    """Retrieve fraud signals detected during a verification session."""
    user_ref = user.get("sub", "anonymous")

    logger.info(
        "audit.fraud_signals.start correlation=%s user=%s session_id=%s",
        correlation_id, user_ref, session_id,
    )

    try:
        signals = audit_service.get_fraud_signals(session_id)

        logger.info(
            "audit.fraud_signals.complete correlation=%s user=%s session_id=%s signal_count=%d",
            correlation_id, user_ref, session_id, len(signals),
        )

        return [FraudSignal(**signal) for signal in signals]
    except Exception as exc:
        logger.error(
            "audit.fraud_signals.error correlation=%s user=%s session_id=%s error=%s",
            correlation_id, user_ref, session_id, str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve fraud signals",
            headers={"X-Error-Code": "FRAUD_SIGNALS_ERROR"},
        ) from exc