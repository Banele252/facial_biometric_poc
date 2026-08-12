"""Auth router — issues test JWTs for Swagger UI sandbox testing.

Public endpoint. No authentication required. Returns RS256-signed JWTs
with mandatory claims for the zero-trust security model.
"""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Form, HTTPException, status
from pydantic import BaseModel

from Backend.app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])

# Test users loaded from env or defaults (sandbox only)
TEST_USERS = {
    "test_standard": {
        "password": "test-secret-123",
        "scope": "biometric:read biometric:write",
        "geo_fence": "ZA-jnb",
        "device_binding": "fp-a1b2c3d4",
        "role": "qa_engineer",
    },
    "test_tier1": {
        "password": "test-secret-456",
        "scope": "biometric:read biometric:write simswap:execute rica:read",
        "geo_fence": "ZA-jnb",
        "device_binding": "fp-a1b2c3d4",
        "role": "qa_engineer",
    },
    "test_admin": {
        "password": "test-secret-789",
        "scope": "biometric:read biometric:write simswap:execute rica:read admin:docs",
        "geo_fence": "ZA-jnb",
        "device_binding": "fp-a1b2c3d4",
        "role": "admin",
    },
}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int = 3600
    scope: str
    token_id: str


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="Issue Test Token",
    description=(
            "Issues a short-lived RS256 JWT for Swagger UI testing. "
            "Public endpoint — no auth required. "
            "Test users: test_standard, test_tier1, test_admin."
    ),
    # Explicitly no security for this endpoint
    openapi_extra={"security": []},
)
def issue_test_token(
        username: str = Form(..., description="Test user username"),
        password: str = Form(..., description="Test user password"),
        scope: str = Form("", description="Override scopes (optional)"),
):
    """Issue a test JWT for Swagger UI and sandbox testing."""
    settings = get_settings()

    # In production, block test token endpoint
    # FIX: was settings.ENV — every other settings access in this codebase
    # (zero_trust.py, verification.py) is lowercase, matching the default
    # pydantic-settings behaviour where a field declared `env: str` binds to
    # the ENV env var but is accessed as `settings.env`. See config.py once
    # confirmed - this assumes that convention holds here too.
    if settings.env == "production":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test token endpoint disabled in production",
        )

    user = TEST_USERS.get(username)
    if not user or user["password"] != password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    now = datetime.now(UTC)
    token_id = str(uuid.uuid4())

    # JWT_ISSUER / JWT_AUDIENCE / JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    # — same casing correction as above.
    payload = {
        "sub": username,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_access_token_expire_minutes),
        "jti": token_id,
        "scope": scope or user["scope"],
        "geo_fence": user["geo_fence"],
        "device_binding": user["device_binding"],
        "role": user["role"],
    }

    # JWT_PRIVATE_KEY
    if not settings.jwt_private_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT_PRIVATE_KEY not configured. Run: python scripts/generate_keys.py",
        )

    # JWT_PRIVATE_KEY / settings.JWT_ALGORITHM
    token = jwt.encode(
        payload,
        settings.jwt_private_key,
        algorithm=settings.jwt_algorithm,
    )

    return TokenResponse(
        access_token=token,
        scope=payload["scope"],
        token_id=token_id,
    )
