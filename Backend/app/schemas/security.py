"""Security schema models."""


from pydantic import BaseModel


class SecurityError(BaseModel):
    error: str
    message: str
    code: str
    correlation_id: str
    timestamp: str
    retry_after: int | None = None
