"""Security-related Pydantic schemas."""

from pydantic import BaseModel


class SecurityError(BaseModel):
    """Standard security error response."""

    error: str
    message: str
    code: str
    correlation_id: str
    timestamp: str
    retry_after: int | None = None
