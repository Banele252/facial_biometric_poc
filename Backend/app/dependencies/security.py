"""
FastAPI dependency injectors for zero-trust security.
Use with Depends() in route definitions for declarative auth.
"""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer

security_bearer = HTTPBearer(auto_error=False)


async def get_current_user(request: Request) -> dict:
    """Extract validated JWT payload from request state."""
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_scope(scope: str):
    """Factory for scope-based authorization."""

    async def _check(request: Request, user: dict = Depends(get_current_user)):
        scopes = user.get("scope", "").split()
        if scope not in scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient scope. Required: {scope}",
                headers={"X-Error-Code": "INSUFFICIENT_SCOPE"},
            )
        return user

    return _check


def require_any_scope(*scopes: str):
    """Require any one of the provided scopes."""

    async def _check(request: Request, user: dict = Depends(get_current_user)):
        user_scopes = user.get("scope", "").split()
        if not any(s in user_scopes for s in scopes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient scope. Required any of: {', '.join(scopes)}",
                headers={"X-Error-Code": "INSUFFICIENT_SCOPE"},
            )
        return user

    return _check


def require_all_scopes(*scopes: str):
    """Require all of the provided scopes."""

    async def _check(request: Request, user: dict = Depends(get_current_user)):
        user_scopes = user.get("scope", "").split()
        missing = [s for s in scopes if s not in user_scopes]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient scope. Missing: {', '.join(missing)}",
                headers={"X-Error-Code": "INSUFFICIENT_SCOPE"},
            )
        return user

    return _check


# Pre-built scope checkers
require_biometric_read = require_scope("biometric:read")
require_biometric_write = require_scope("biometric:write")
require_simswap_execute = require_scope("simswap:execute")
require_rica_read = require_scope("rica:read")
require_rica_write = require_scope("rica:write")
require_admin = require_scope("admin:docs")


async def get_correlation_id(request: Request) -> str:
    return getattr(
        request.state, "correlation_id", f"facial-poc-fallback-{id(request)}"
    )


async def get_geo_fence(request: Request) -> str:
    return request.headers.get("X-Geo-Fence", "unknown")


async def get_device_fingerprint(request: Request) -> str | None:
    return request.headers.get("X-Device-Fingerprint")
