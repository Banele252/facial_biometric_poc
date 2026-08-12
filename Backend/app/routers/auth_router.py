"""Auth router -- issues test JWTs for Swagger UI sandbox testing."""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, HTTPException, Form
from pydantic import BaseModel

from Backend.app.config import get_settings

security_settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])

TEST_USERS = {
    "test_standard": {
        "password": "test-secret-123",
        "scope": "biometric:read biometric:write",
        "geo_fence": "ZA-jnb",
        "device_binding": "fp-a1b2c3d4",
    },
    "test_tier1": {
        "password": "test-secret-456",
        "scope": "biometric:read biometric:write simswap:execute rica:read",
        "geo_fence": "ZA-jnb",
        "device_binding": "fp-a1b2c3d4",
    },
    "test_admin": {
        "password": "test-secret-789",
        "scope": "biometric:read biometric:write simswap:execute rica:read admin:docs",
        "geo_fence": "ZA-jnb",
        "device_binding": "fp-a1b2c3d4",
    },
}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    scope: str
    token_id: str


@router.post("/token", response_model=TokenResponse, security=[])
async def issue_token(
    username: str = Form(...),
    password: str = Form(...),
    scope: str = Form(""),
):
    """Issue a test JWT for Swagger UI sandbox testing."""
    user = TEST_USERS.get(username)
    if not user or user["password"] != password:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    private_key = security_settings.jwt_private_key
    if not private_key:
        raise HTTPException(status_code=500, detail="JWT private key not configured")

    now = datetime.now(UTC)
    token_id = str(uuid.uuid4())

    payload = {
        "sub": username,
        "iss": security_settings.jwt_issuer,
        "aud": security_settings.jwt_audience,
        "iat": now,
        "exp": now + timedelta(minutes=security_settings.jwt_access_token_expire_minutes),
        "jti": token_id,
        "scope": scope or user["scope"],
        "geo_fence": user["geo_fence"],
        "device_binding": user["device_binding"],
    }

    token = jwt.encode(payload, private_key, algorithm=security_settings.jwt_algorithm)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=security_settings.jwt_access_token_expire_minutes * 60,
        scope=payload["scope"],
        token_id=token_id,
    )
