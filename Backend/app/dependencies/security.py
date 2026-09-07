# Backend/app/dependencies/security.py
"""
FastAPI dependency injectors for zero-trust security.

Provides:
- Core authentication (get_current_user)
- Zero-trust device binding validation
- Zero-trust geo-fence validation
- Scope validation (require_scope, require_any_scope, require_all_scopes)
- Pre-configured scope requirements for common use cases
- Combined zero-trust dependencies for high-security endpoints
- Request context helpers (correlation ID, geo-fence, device fingerprint)
- Token introspection for debugging/admin

All dependencies integrate with ZeroTrustMiddleware, which populates
request.state.user after validating the JWT.
"""
import logging
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

logger = logging.getLogger(__name__)


#  Centralized Scope Constants

class Scopes:
    """
    Centralized scope constants to prevent typos and simplify refactoring.

    Usage:
        dependencies=[Depends(require_scope(Scopes.BIOMETRIC_READ))]
    """
    BIOMETRIC_READ = "biometric:read"
    BIOMETRIC_WRITE = "biometric:write"
    SIMSWAP_EXECUTE = "simswap:execute"
    RICA_READ = "rica:read"
    RICA_WRITE = "rica:write"
    ADMIN_DOCS = "admin:docs"


#  Core Authentication
async def get_current_user(request: Request) -> dict:
    """
    Extract and validate the authenticated user from the request state.

    ZeroTrustMiddleware populates request.state.user after validating
    the JWT. This dependency ensures it exists and raises 401 otherwise.
    """
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please provide a valid Bearer token.",
            headers={
                "WWW-Authenticate": "Bearer",
                "X-Error-Code": "NOT_AUTHENTICATED",
            },
        )
    return user


#  Zero-Trust Device Binding Validation
async def validate_device_binding(
        request: Request,
        user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """
    Ensure the request comes from the device the token was bound to.

    Prevents token theft/replay: even if a JWT is stolen, it cannot be
    used from a different device because the X-Device-Fingerprint header
    must match the device_binding claim in the token.
    """
    device_fingerprint = request.headers.get("X-Device-Fingerprint")
    expected_binding = user.get("device_binding")

    if not device_fingerprint:
        logger.warning(
            "security.device_binding.missing_header user=%s",
            user.get("sub", "anonymous"),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing required header: X-Device-Fingerprint",
            headers={"X-Error-Code": "MISSING_DEVICE_FINGERPRINT"},
        )

    if expected_binding and device_fingerprint != expected_binding:
        logger.warning(
            "security.device_binding.mismatch user=%s expected=%s got=%s",
            user.get("sub", "anonymous"),
            expected_binding[:8] + "..." if expected_binding else None,
            device_fingerprint[:8] + "...",
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Device fingerprint does not match token binding. Token may be compromised.",
            headers={"X-Error-Code": "DEVICE_MISMATCH"},
        )

    return user


#  Zero-Trust Geo-Fence Validation

async def validate_geo_fence(
        request: Request,
        user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """
    Ensure the request originates from an allowed geographic region.

    The X-Geo-Fence header must match the geo_fence claim in the JWT,
    preventing tokens issued for one region from being used in another.
    """
    geo_fence = request.headers.get("X-Geo-Fence")
    expected_fence = user.get("geo_fence")

    if not geo_fence:
        logger.warning(
            "security.geo_fence.missing_header user=%s",
            user.get("sub", "anonymous"),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing required header: X-Geo-Fence",
            headers={"X-Error-Code": "MISSING_GEO_FENCE"},
        )

    if expected_fence and geo_fence != expected_fence:
        logger.warning(
            "security.geo_fence.mismatch user=%s expected=%s got=%s",
            user.get("sub", "anonymous"), expected_fence, geo_fence,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Geo-fence mismatch. Expected: {expected_fence}, Got: {geo_fence}",
            headers={"X-Error-Code": "GEO_FENCE_MISMATCH"},
        )

    return user


#  Scope Validation

def require_scope(scope: str):
    """
    Require a specific scope in the JWT.

    Usage:
        @router.get("/endpoint", dependencies=[Depends(require_scope("biometric:read"))])
    """
    async def _check(
            request: Request,
            user: Annotated[dict, Depends(get_current_user)],
    ) -> dict:
        user_scopes = user.get("scope", "").split()
        if scope not in user_scopes:
            logger.warning(
                "security.scope.insufficient user=%s required=%s has=%s",
                user.get("sub", "anonymous"), scope, user_scopes,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient scope. Required: {scope}",
                headers={"X-Error-Code": "INSUFFICIENT_SCOPE"},
            )
        return user
    return _check


def require_any_scope(*scopes: str):
    """
    Require at least one of the specified scopes.

    Usage:
        dependencies=[Depends(require_any_scope(Scopes.ADMIN_DOCS, Scopes.RICA_READ))]
    """
    async def _check(
            request: Request,
            user: Annotated[dict, Depends(get_current_user)],
    ) -> dict:
        user_scopes = user.get("scope", "").split()
        if not any(s in user_scopes for s in scopes):
            logger.warning(
                "security.scope.insufficient_any user=%s required_any=%s has=%s",
                user.get("sub", "anonymous"), list(scopes), user_scopes,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient scope. Required any of: {', '.join(scopes)}",
                headers={"X-Error-Code": "INSUFFICIENT_SCOPE"},
            )
        return user
    return _check


def require_all_scopes(*scopes: str):
    """
    Require all specified scopes.

    Usage:
        dependencies=[Depends(require_all_scopes(Scopes.BIOMETRIC_READ, Scopes.RICA_READ))]
    """
    async def _check(
            request: Request,
            user: Annotated[dict, Depends(get_current_user)],
    ) -> dict:
        user_scopes = user.get("scope", "").split()
        missing = [s for s in scopes if s not in user_scopes]
        if missing:
            logger.warning(
                "security.scope.insufficient_all user=%s missing=%s has=%s",
                user.get("sub", "anonymous"), missing, user_scopes,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient scope. Missing: {', '.join(missing)}",
                headers={"X-Error-Code": "INSUFFICIENT_SCOPE"},
            )
        return user
    return _check


#  Pre-configured Scope Requirements──

require_biometric_read = require_scope(Scopes.BIOMETRIC_READ)
require_biometric_write = require_scope(Scopes.BIOMETRIC_WRITE)
require_simswap_execute = require_scope(Scopes.SIMSWAP_EXECUTE)
require_rica_read = require_scope(Scopes.RICA_READ)
require_rica_write = require_scope(Scopes.RICA_WRITE)
require_admin = require_scope(Scopes.ADMIN_DOCS)


#  Zero-Trust Combined Dependencies
# Use these for high-security endpoints (e.g., SIM swap execution)
# They bundle authentication + device binding + geo-fence + scope.

require_secure_biometric_read = [
    Depends(get_current_user),
    Depends(validate_device_binding),
    Depends(validate_geo_fence),
    Depends(require_biometric_read),
]

require_secure_biometric_write = [
    Depends(get_current_user),
    Depends(validate_device_binding),
    Depends(validate_geo_fence),
    Depends(require_biometric_write),
]

require_secure_simswap_execute = [
    Depends(get_current_user),
    Depends(validate_device_binding),
    Depends(validate_geo_fence),
    Depends(require_simswap_execute),
]


#  Request Context Helpers

async def get_correlation_id(request: Request) -> str:
    """
    Extract or generate a correlation ID for request tracing.

    ZeroTrustMiddleware generates/propagates X-Correlation-Id and stores
    it on request.state.correlation_id. This dependency provides a safe
    fallback if the middleware hasn't run (e.g., in tests).
    """
    correlation_id = getattr(request.state, "correlation_id", None)
    if correlation_id:
        return correlation_id
    return f"facial-poc-fallback-{id(request)}"


async def get_geo_fence(request: Request) -> str:
    """Extract the geo-fence header."""
    return request.headers.get("X-Geo-Fence", "unknown")


async def get_device_fingerprint(request: Request) -> str | None:
    """Extract the device fingerprint header."""
    return request.headers.get("X-Device-Fingerprint")


#  Token Introspection (for debugging/admin)

def get_token_info(user: Annotated[dict, Depends(get_current_user)]) -> dict:
    """
    Return non-sensitive token metadata for debugging.

    WARNING: Do not expose this endpoint publicly in production.
    Useful for admin dashboards and debugging JWT issues.
    """
    return {
        "sub": user.get("sub"),
        "scope": user.get("scope"),
        "geo_fence": user.get("geo_fence"),
        "device_binding_present": bool(user.get("device_binding")),
        "exp": user.get("exp"),
        "iat": user.get("iat"),
        "jti": user.get("jti"),
    }