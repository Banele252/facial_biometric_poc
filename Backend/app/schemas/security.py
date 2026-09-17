# Backend/app/schemas/security.py
"""Security-related Pydantic schemas.

These models define the standard error response structure used throughout
the zero-trust middleware and authenticated endpoints.
"""
from pydantic import BaseModel, Field


class SecurityError(BaseModel):
    """
    Standard security error response.
    Matches the JSON structure returned by ZeroTrustMiddleware.
    """
    error: str = Field(
        ...,
        description="HTTP error type (e.g., 'Unauthorized', 'Forbidden', 'Too Many Requests')"
    )
    message: str = Field(
        ...,
        description="Human-readable error message explaining what went wrong"
    )
    code: str = Field(
        ...,
        description="Machine-readable error code (e.g., 'INVALID_TOKEN', 'GEO_FENCE_MISMATCH', 'RATE_LIMIT_EXCEEDED')"
    )
    correlation_id: str = Field(
        ...,
        description="Request tracing ID for debugging and log correlation"
    )
    timestamp: str = Field(
        ...,
        description="ISO 8601 timestamp of when the error occurred"
    )
    retry_after: int | None = Field(
        None,
        description="Seconds to wait before retrying (only present for 429 Too Many Requests errors)"
    )