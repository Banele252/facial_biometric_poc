# Backend/app/schemas/audit.py
"""
Pydantic models for the immutable, hash-chained audit log system.
These schemas define the contract between the mobile app, backend services,
and the audit storage layer.
"""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


class AuditEvent(StrEnum):
    """All possible audit event types in the system."""
    JOURNEY_STARTED = "JOURNEY_STARTED"
    SCREEN_VIEWED = "SCREEN_VIEWED"
    CONSENT_GRANTED = "CONSENT_GRANTED"
    CONSENT_DECLINED = "CONSENT_DECLINED"
    CONSENT_WITHDRAWN = "CONSENT_WITHDRAWN"
    ID_VALIDATION_INITIATED = "ID_VALIDATION_INITIATED"
    ID_VALIDATION_PASSED = "ID_VALIDATION_PASSED"
    ID_VALIDATION_FAILED = "ID_VALIDATION_FAILED"
    ID_SCAN_INITIATED = "ID_SCAN_INITIATED"
    ID_SCAN_COMPLETED = "ID_SCAN_COMPLETED"
    OCR_EXTRACTED = "OCR_EXTRACTED"
    LIVENESS_INITIATED = "LIVENESS_INITIATED"
    LIVENESS_CHALLENGE_ISSUED = "LIVENESS_CHALLENGE_ISSUED"
    LIVENESS_PASSED = "LIVENESS_PASSED"
    LIVENESS_FAILED = "LIVENESS_FAILED"
    FACIAL_MATCH_INITIATED = "FACIAL_MATCH_INITIATED"
    FACIAL_MATCH_PASSED = "FACIAL_MATCH_PASSED"
    FACIAL_MATCH_FAILED = "FACIAL_MATCH_FAILED"
    FRAUD_CHECK_INITIATED = "FRAUD_CHECK_INITIATED"
    FRAUD_RULE_TRIGGERED = "FRAUD_RULE_TRIGGERED"
    FRAUD_DECISION = "FRAUD_DECISION"
    SWAP_REQUESTED = "SWAP_REQUESTED"
    SWAP_PENDING = "SWAP_PENDING"
    SWAP_APPROVED = "SWAP_APPROVED"
    SWAP_REJECTED = "SWAP_REJECTED"
    SWAP_COMPLETED = "SWAP_COMPLETED"
    BARCODE_SCANNED = "BARCODE_SCANNED"
    ICCID_CAPTURED = "ICCID_CAPTURED"
    SAID_SELECTED = "SAID_SELECTED"
    JOURNEY_ENDED = "JOURNEY_ENDED"
    DATA_PURGE_SCHEDULED = "DATA_PURGE_SCHEDULED"
    ERROR_OCCURRED = "ERROR_OCCURRED"


class AuditOutcome(StrEnum):
    """Standardized outcomes for audit events."""
    SUCCESS = "success"
    FAILURE = "failure"
    BLOCKED = "blocked"
    PENDING = "pending"


class AuditLogEntry(BaseModel):
    """
    A single immutable audit event.
    Includes cryptographic hashes for chain-of-custody verification.
    """
    event_id: str = Field(..., min_length=32, max_length=36, description="UUID of the event")
    event_type: AuditEvent
    timestamp: datetime
    session_id: str = Field(..., description="Journey session identifier")
    user_id: str | None = None
    device_id: str
    app_version: str | None = None
    os_version: str | None = None
    screen: str | None = None
    action: str | None = None
    outcome: AuditOutcome | None = None
    reason: str | None = None
    metadata: dict[str, Any] | None = Field(default_factory=dict)

    # Cryptographic chain fields
    integrity_hash: str = Field(..., min_length=64, max_length=64, description="SHA-256 hash of this entry")
    previous_hash: str | None = Field(None, min_length=64, max_length=64, description="Hash of the previous entry in the chain")
    source: Literal["mobile", "backend"] = "mobile"


class AuditBatchRequest(BaseModel):
    """Request model for ingesting a batch of audit events from the mobile app."""
    entries: list[AuditLogEntry]
    batch_hash: str = Field(..., min_length=64, max_length=64, description="SHA-256 hash of the entire batch for integrity verification")


class AuditExportResponse(BaseModel):
    """Response model for exporting a user's audit trail."""
    user_id: str
    entries: list[AuditLogEntry]
    export_hash: str
    generated_at: datetime
    count: int


class AuditVerifyResponse(BaseModel):
    """Response model for verifying a single audit event's integrity."""
    event_id: str
    valid: bool
    computed_hash: str
    stored_hash: str
    chain_valid: bool


class ChainVerifyResponse(BaseModel):
    """Response model for verifying an entire audit chain for a session."""
    session_id: str
    valid: bool
    entry_count: int
    broken_at: str | None = None