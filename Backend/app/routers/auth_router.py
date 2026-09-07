# Backend/app/routers/auth_router.py
"""
Auth router -- issues test JWTs for Swagger UI sandbox testing.
Production deployments should replace this with OAuth2/OIDC provider integration.
"""
import json
import logging
import os
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from pydantic import BaseModel

from Backend.app.config import get_settings
from Backend.app.dependencies.security import get_correlation_id

logger = logging.getLogger("auth.router")
security_settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])


def _load_test_users() -> dict:
    """Load test users from TEST_USERS_JSON environment variable."""
    test_users_json = os.getenv("TEST_USERS_JSON")
    if not test_users_json:
        logger.warning("TEST_USERS_JSON not set. Auth endpoint will be unavailable.")
        return {}

    try:
        users = json.loads(test_users_json)
        # Validate structure and convert lists to sets for O(1) lookup
        for username, config in users.items():
            required = {"password", "allowed_scopes", "default_geo_fence"}
            if not required.issubset(config.keys()):
                raise ValueError(f"Test user '{username}' missing required fields: {required - config.keys()}")
            if isinstance(config["allowed_scopes"], list):
                config["allowed_scopes"] = set(config["allowed_scopes"])
        return users
    except (json.JSONDecodeError, ValueError) as e:
        logger.error("Failed to parse TEST_USERS_JSON: %s", e)
        return {}


TEST_USERS = _load_test_users()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    scope: str
    token_id: str
    device_binding: str | None = None
    geo_fence: str | None = None


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="Issue JWT access token (sandbox only)",
    description="Issues a test JWT for Swagger UI sandbox testing. Production deployments should use OAuth2/OIDC.",
)
async def issue_token(
        request: Request,
        username: str = Form(..., description="Test username"),
        password: str = Form(..., description="Test password"),
        scope: str = Form("", description="Requested scopes (space-separated)"),
        correlation_id: Annotated[str, Depends(get_correlation_id)] = "",
) -> TokenResponse:
    """
    Issue a test JWT for Swagger UI sandbox testing.

    Security features:
    - Device fingerprint binding from X-Device-Fingerprint header
    - Geo-fence binding from X-Geo-Fence header
    - Scope validation against user's allowed scopes
    - Constant-time password comparison
    - Structured audit logging
    """
    if not TEST_USERS:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Test users not configured. Set TEST_USERS_JSON environment variable.",
            headers={"X-Error-Code": "TEST_USERS_NOT_CONFIGURED"},
        )

    # 1. Validate user credentials with constant-time comparison
    user = TEST_USERS.get(username)
    if not user or not secrets.compare_digest(user["password"], password):
        logger.warning(
            "auth.token.invalid_credentials correlation=%s username=%s",
            correlation_id, username,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={
                "WWW-Authenticate": "Bearer",
                "X-Error-Code": "INVALID_CREDENTIALS",
            },
        )

    # 2. Extract device fingerprint and geo-fence from headers
    device_fingerprint = request.headers.get("X-Device-Fingerprint")
    geo_fence = request.headers.get("X-Geo-Fence", user["default_geo_fence"])

    # 3. Validate requested scopes
    requested_scopes = set(scope.split()) if scope else user["allowed_scopes"]

    # Sandbox super-admin:
    # test_admin may request any scope.
    if username != "test_admin":
        invalid_scopes = requested_scopes - user["allowed_scopes"]

        if invalid_scopes:
            logger.warning(
                "auth.token.invalid_scopes correlation=%s username=%s invalid_scopes=%s",
                correlation_id, username, list(invalid_scopes),
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid scopes requested: {', '.join(sorted(invalid_scopes))}",
                headers={"X-Error-Code": "INVALID_SCOPES"},
            )

    # 4. Validate geo-fence
    if geo_fence not in security_settings.allowed_geo_fences:
        logger.warning(
            "auth.token.invalid_geo_fence correlation=%s username=%s geo_fence=%s",
            correlation_id, username, geo_fence,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid geo-fence: {geo_fence}",
            headers={"X-Error-Code": "INVALID_GEO_FENCE"},
        )

    # 5. Generate JWT
    private_key = security_settings.jwt_private_key
    if not private_key:
        logger.error("auth.token.missing_private_key correlation=%s", correlation_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="JWT private key not configured",
            headers={"X-Error-Code": "JWT_KEY_MISSING"},
        )

    now = datetime.now(UTC)
    token_id = str(uuid.uuid4())
    expires_in = security_settings.jwt_access_token_expire_minutes * 60

    payload = {
        "sub": username,
        "iss": security_settings.jwt_issuer,
        "aud": security_settings.jwt_audience,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
        "jti": token_id,
        "scope": " ".join(sorted(requested_scopes)),
        "geo_fence": geo_fence,
        "device_binding": device_fingerprint,
    }

    token = jwt.encode(
        payload,
        private_key,
        algorithm=security_settings.jwt_algorithm,
    )

    # 6. Audit logging
    logger.info(
        "auth.token.issued correlation=%s username=%s token_id=%s scopes=%s device=%s geo=%s expires_in=%d",
        correlation_id, username, token_id, payload["scope"],
        device_fingerprint or "none", geo_fence, expires_in,
        )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        scope=payload["scope"],
        token_id=token_id,
        device_binding=device_fingerprint,
        geo_fence=geo_fence,
    )


@router.get(
    "/introspect",
    summary="Decode and display JWT payload (debug only)",
    description="For debugging purposes only. Do not expose in production.",
)
async def introspect_token(
        request: Request,
        token: str = Form(..., description="JWT token to decode"),
        correlation_id: Annotated[str, Depends(get_correlation_id)] = "",
) -> dict:
    """
    Decode and display JWT payload for debugging.
    WARNING: This endpoint should be disabled in production.
    """
    if security_settings.is_production:
        logger.warning(
            "auth.introspect.blocked_in_production correlation=%s",
            correlation_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token introspection is disabled in production",
            headers={"X-Error-Code": "INTROSPECTION_DISABLED"},
        )

    try:
        payload = jwt.decode(
            token,
            security_settings.jwt_public_key,
            algorithms=[security_settings.jwt_algorithm],
            options={"verify_signature": False},  # Debug only
        )

        logger.info(
            "auth.introspect.success correlation=%s token_id=%s",
            correlation_id, payload.get("jti", "unknown"),
        )

        return {
            "valid": True,
            "payload": payload,
            "header": jwt.get_unverified_header(token),
        }
    except jwt.InvalidTokenError as e:
        logger.warning(
            "auth.introspect.invalid_token correlation=%s error=%s",
            correlation_id, str(e),
        )
        return {
            "valid": False,
            "error": str(e),
        }
