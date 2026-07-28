from typing import Any

from audit import AuditDB
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(
    title="Audit Log API",
    description="Simple API for writing audit log records to Postgres via AuditDB.",
    version="1.0.0",
)


class AuditLogRequest(BaseModel):
    """
    Request body for creating an audit log record.

    `process` is required (used both as its own column and inside the JSON payload).
    `extra` holds any additional fields you want stored in the JSON payload.
    """
    process: str = Field(..., description="Name of the process being logged, e.g. 'invoice_import'")
    extra: dict[str, Any] | None = Field(
        default_factory=dict,
        description="Any additional key/value pairs to store alongside 'process' in the payload",
    )


class AuditLogResponse(BaseModel):
    status: str
    detail: str


@app.get("/health")
def health_check():
    """Basic liveness check for the API itself (does not touch the DB)."""
    return {"status": "ok"}


@app.post("/audit/log", response_model=AuditLogResponse)
def create_audit_log(request: AuditLogRequest):
    """
    Write a single audit log record.

    The full request body (process + extra fields) is stored as the JSON payload,
    while `process` is also stored in its own column for fast filtering.
    """
    input_data = {"process": request.process, **request.extra}

    try:
        with AuditDB(input_data=input_data) as db:
            db.insert_record()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to write audit log: {exc}",
        ) from exc

    return AuditLogResponse(status="success", detail="Audit record inserted")
