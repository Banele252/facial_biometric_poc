# Backend/app/middleware/zero_trust.py
"""
Zero-trust middleware for Facial Biometric PoC.

Enforces:
1. Rate limiting (per IP + per user)
2. JWT validation with issuer/audience checks
3. Geo-fence enforcement
4. Nonce replay protection
5. Device binding validation
6. Tier-1 API key validation
7. Security headers injection
8. Correlation ID propagation

Production requirements:
- Redis MUST be available (raises RuntimeError otherwise)
- JWT keys MUST be configured
- API keys MUST be set for Tier-1 endpoints
"""
import logging
import os
import re
import secrets
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import jwt
from fastapi import Request
from fastapi.security import APIKeyHeader, HTTPBearer
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from Backend.app.config import get_settings

logger = logging.getLogger("zero_trust.middleware")

# FastAPI dependency markers. ZeroTrustMiddleware performs the actual
# cryptographic/API-key validation; these enforce the expected header shape
# and keep the OpenAPI security contract attached to protected routers.
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
bearer_auth = HTTPBearer(auto_error=False)

try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning(
        "Redis library not available. Rate limiting and nonce storage "
        "will use in-memory fallback (development only)."
    )


class ZeroTrustMiddleware(BaseHTTPMiddleware):
    """
    Comprehensive zero-trust security middleware.

    Security layers (in order):
    1. Public path bypass (health, docs, auth/token)
    2. Correlation ID generation/propagation
    3. IP-based rate limiting
    4. JWT authentication
    5. User-based rate limiting
    6. Geo-fence validation
    7. Nonce replay protection
    8. Device binding validation
    9. Tier-1 API key validation
    10. Security headers injection
    """

    # Paths that bypass authentication
    PUBLIC_PATHS = {
        "/healthz",
        "/readyz",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/",
        "/favicon.ico",
        "/auth/token",  # Token endpoint handles its own auth
    }

    # Paths that need a relaxed CSP (Swagger / ReDoc assets)
    DOCS_PATHS = {
        "/docs",
        "/redoc",
        "/openapi.json",
    }

    # Tier-1 endpoints requiring API key (high-risk operations)
    TIER1_PREFIXES = (
        "/api/v1/sim-swap",
        "/api/v1/rica/records",
        "/api/v1/rica/verify",
        "/api/v1/verifications",
    )

    # Endpoints requiring mandatory nonce (replay protection)
    NONCE_REQUIRED_PREFIXES = (
        "/api/v1/sim-swap",
        "/api/v1/verifications",
    )

    # Endpoints requiring device binding (biometric operations)
    DEVICE_BINDING_PREFIXES = (
        "/api/v1/selfies",
        "/api/v1/face-match",
        "/api/v1/sim-swap",
        "/api/v1/verifications",
    )

    def __init__(self, app: ASGIApp, redis_client: Any | None = None):
        super().__init__(app)
        self.settings = get_settings()
        self.env = os.getenv("ENV", "development")
        self.redis = redis_client

        # Initialize Redis connection if not provided
        if REDIS_AVAILABLE and redis_client is None:
            try:
                self.redis = redis.from_url(
                    self.settings.redis_url,
                    decode_responses=True,
                )
                logger.info(
                    "Redis connection established for rate limiting and nonce storage"
                )
            except Exception as exc:
                self.redis = None
                if self.env == "production":
                    logger.error("Failed to connect to Redis: %s", exc)
                    raise RuntimeError(
                        f"Redis is required in production for rate limiting "
                        f"and nonce storage: {exc}"
                    ) from exc
                logger.warning(
                    "Redis unavailable in %s, using in-memory fallback", self.env
                )

        # Production must have Redis
        if self.env == "production" and self.redis is None:
            raise RuntimeError(
                "Redis is required in production. Set REDIS_URL and ensure "
                "redis is reachable."
            )

        # In-memory fallbacks (only for development/testing)
        self._nonce_cache: dict[str, float] = {}
        self._rate_counters: dict[str, list[float]] = {}

        logger.info(
            "ZeroTrustMiddleware initialized (env=%s, redis=%s)",
            self.env, "available" if self.redis else "unavailable",
        )

    async def dispatch(self, request: Request, call_next):
        """Main middleware entry point."""
        path = request.url.path
        method = request.method

        # 1. Skip authentication for public paths and CORS preflight
        if path in self.PUBLIC_PATHS or method == "OPTIONS":
            response = await call_next(request)
            self._add_security_headers(response, path)
            return response

        # 2. Generate or extract correlation ID
        correlation_id = request.headers.get("X-Correlation-Id")
        if not correlation_id:
            correlation_id = (
                f"facial-poc-{uuid.uuid4()}-"
                f"{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
            )
        request.state.correlation_id = correlation_id

        # 3. IP-based rate limiting (before auth to prevent brute force)
        client_ip = self._get_client_ip(request)
        rate_key = f"rate:{client_ip}:{path}:{method}"

        if await self._is_rate_limited(rate_key, path):
            logger.warning(
                "zero_trust.rate_limit.ip_exceeded ip=%s path=%s method=%s correlation=%s",
                client_ip, path, method, correlation_id,
            )
            return await self._security_response(
                429,
                "Too Many Requests",
                "RATE_LIMIT_EXCEEDED",
                correlation_id,
                retry_after=60,
            )

        await self._increment_counter(rate_key)

        # 4. JWT Authentication
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            logger.warning(
                "zero_trust.auth.missing_bearer path=%s correlation=%s",
                path, correlation_id,
            )
            return await self._security_response(
                401,
                "Missing or invalid Authorization header. Expected: Bearer <token>",
                "MISSING_BEARER_TOKEN",
                correlation_id,
            )

        token = auth_header.replace("Bearer ", "").strip()
        if not token:
            return await self._security_response(
                401, "Empty bearer token", "EMPTY_TOKEN", correlation_id
            )

        # Validate JWT
        payload = await self._validate_jwt(token, correlation_id)
        if isinstance(payload, Response):
            return payload

        # Store user context for downstream dependencies
        request.state.user = payload
        request.state.jwt_payload = payload

        # 5. User-based rate limiting (additional layer)
        user_id = payload.get("sub", "anonymous")
        user_rate_key = f"rate:user:{user_id}:{path}:{method}"
        if await self._is_rate_limited(user_rate_key, path):
            logger.warning(
                "zero_trust.rate_limit.user_exceeded user=%s path=%s correlation=%s",
                user_id, path, correlation_id,
            )
            return await self._security_response(
                429,
                "Too Many Requests",
                "USER_RATE_LIMIT_EXCEEDED",
                correlation_id,
                retry_after=60,
            )
        await self._increment_counter(user_rate_key)

        # 6. Geo-fence validation
        # In development we allow missing X-Geo-Fence so Swagger UI works.
        # In production the header is mandatory.
        geo_header = request.headers.get("X-Geo-Fence")
        geo_claim = payload.get("geo_fence")

        if self.env == "production" or geo_header:
            if not geo_header:
                return await self._security_response(
                    403,
                    "Missing required header: X-Geo-Fence",
                    "MISSING_GEO_FENCE",
                    correlation_id,
                )

            if geo_claim and geo_header != geo_claim:
                logger.warning(
                    "zero_trust.geo_fence.mismatch header=%s claim=%s user=%s correlation=%s",
                    geo_header, geo_claim, user_id, correlation_id,
                )
                return await self._security_response(
                    403,
                    f"Geo-fence mismatch: header={geo_header}, claim={geo_claim}",
                    "GEO_FENCE_MISMATCH",
                    correlation_id,
                )

            if geo_header not in self.settings.allowed_geo_fences:
                return await self._security_response(
                    403,
                    f"Geo-fence not allowed: {geo_header}",
                    "GEO_FENCE_NOT_ALLOWED",
                    correlation_id,
                )

        # 7. Nonce replay protection
        nonce = request.headers.get("X-Request-Nonce")

        # Mandatory nonce for high-security endpoints
        if path.startswith(self.NONCE_REQUIRED_PREFIXES) and not nonce:
            return await self._security_response(
                400,
                "Missing required header: X-Request-Nonce for high-security endpoint",
                "MISSING_NONCE",
                correlation_id,
            )

        if nonce:
            if await self._is_duplicate_nonce(nonce):
                logger.warning(
                    "zero_trust.nonce.duplicate nonce=%s... user=%s correlation=%s",
                    nonce[:16], user_id, correlation_id,
                )
                return await self._security_response(
                    409,
                    "Duplicate nonce detected. Request may have been replayed.",
                    "DUPLICATE_NONCE",
                    correlation_id,
                )
            await self._store_nonce(nonce)

        # 8. Device binding validation
        # In development we allow missing X-Device-Fingerprint so Swagger UI works.
        if path.startswith(self.DEVICE_BINDING_PREFIXES):
            device_fp = request.headers.get("X-Device-Fingerprint")
            device_claim = payload.get("device_binding")

            if self.env == "production" or device_fp:
                if not device_fp:
                    return await self._security_response(
                        403,
                        "Missing required header: X-Device-Fingerprint",
                        "MISSING_DEVICE_FINGERPRINT",
                        correlation_id,
                    )

                if device_claim and device_fp != device_claim:
                    logger.warning(
                        "zero_trust.device_binding.mismatch header=%s claim=%s user=%s correlation=%s",
                        device_fp[:8] + "...",
                        device_claim[:8] + "..." if device_claim else None,
                        user_id,
                        correlation_id,
                        )
                    return await self._security_response(
                        403,
                        "Device fingerprint mismatch. Token may be compromised.",
                        "DEVICE_BINDING_FAILED",
                        correlation_id,
                    )

        # 9. Tier-1 API key validation
        if self._is_tier1_endpoint(path):
            api_key = request.headers.get("X-API-Key")
            if not api_key:
                return await self._security_response(
                    403,
                    "Missing required header: X-API-Key for Tier-1 operation",
                    "MISSING_API_KEY",
                    correlation_id,
                )
            if not self._validate_api_key(api_key):
                logger.warning(
                    "zero_trust.api_key.invalid user=%s path=%s correlation=%s",
                    user_id, path, correlation_id,
                )
                return await self._security_response(
                    403, "Invalid API key", "INVALID_API_KEY", correlation_id
                )

        # 10. Execute the request
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.error(
                "zero_trust.unhandled_exception path=%s correlation=%s error=%s",
                path, correlation_id, exc,
                exc_info=True,
            )
            return await self._security_response(
                500,
                "Internal server error",
                "INTERNAL_ERROR",
                correlation_id,
            )

        # 11. Add rate limit headers to response
        current_count = await self._get_current_count(rate_key)
        limit = self._get_rate_limit(path)

        response.headers["X-Correlation-Id"] = correlation_id
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - current_count))
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + 60)

        # 12. Add security headers
        self._add_security_headers(response, path)

        logger.debug(
            "zero_trust.request.completed path=%s method=%s status=%s user=%s correlation=%s",
            path, method, response.status_code, user_id, correlation_id,
        )

        return response

    # ─── Helper Methods ─────────────────────────────────────────

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP, respecting X-Forwarded-For for proxied requests."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            # Take the first IP in the chain (original client)
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def _validate_jwt(self, token: str, correlation_id: str) -> dict | Response:
        """Validate JWT token and return payload or error response."""
        settings = self.settings

        if not settings.jwt_public_key:
            logger.error("zero_trust.jwt.missing_public_key correlation=%s", correlation_id)
            return await self._security_response(
                500,
                "JWT public key not configured",
                "JWT_KEY_MISSING",
                correlation_id,
            )

        try:
            payload = jwt.decode(
                token,
                settings.jwt_public_key,
                algorithms=[settings.jwt_algorithm],
                issuer=settings.jwt_issuer,
                audience=settings.jwt_audience,
                options={"require": ["exp", "iat", "sub", "jti", "scope"]},
            )
            return payload
        except jwt.ExpiredSignatureError:
            logger.info("zero_trust.jwt.expired correlation=%s", correlation_id)
            return await self._security_response(
                401, "Token has expired", "TOKEN_EXPIRED", correlation_id
            )
        except jwt.InvalidIssuerError:
            logger.warning("zero_trust.jwt.invalid_issuer correlation=%s", correlation_id)
            return await self._security_response(
                401, "Invalid token issuer", "INVALID_ISSUER", correlation_id
            )
        except jwt.InvalidAudienceError:
            logger.warning("zero_trust.jwt.invalid_audience correlation=%s", correlation_id)
            return await self._security_response(
                401, "Invalid token audience", "INVALID_AUDIENCE", correlation_id
            )
        except jwt.InvalidTokenError as e:
            logger.warning("zero_trust.jwt.invalid correlation=%s error=%s", correlation_id, e)
            return await self._security_response(
                401, f"Invalid token: {str(e)}", "INVALID_TOKEN", correlation_id
            )

    def _is_tier1_endpoint(self, path: str) -> bool:
        """Check if path is a tier-1 endpoint requiring API key."""
        return path.startswith(self.TIER1_PREFIXES)

    def _validate_api_key(self, api_key: str) -> bool:
        """
        Validate API key format and value.

        Format: (sbx|prd)-ak-YYYY-MM-DD-<8 hex chars>
        Uses constant-time comparison to prevent timing attacks.
        """
        # Validate format first
        if not re.match(r"^(sbx|prd)-ak-\d{4}-\d{2}-\d{2}-[a-f0-9]{8}$", api_key):
            return False

        # Select expected key based on prefix (startswith is more precise than 'in')
        expected = (
            self.settings.sandbox_api_key
            if api_key.startswith("sbx")
            else self.settings.production_api_key
        )

        if not expected:
            return False

        # Constant-time comparison to prevent timing attacks
        return secrets.compare_digest(api_key, expected)

    async def _is_duplicate_nonce(self, nonce: str) -> bool:
        """Check if nonce has been used before."""
        if self.redis:
            try:
                return await self.redis.exists(f"nonce:{nonce}") > 0
            except Exception as exc:
                logger.warning("zero_trust.nonce.redis_error error=%s", exc)
                return False

        # In-memory fallback
        now = time.time()
        # Clean expired nonces
        self._nonce_cache = {
            k: v
            for k, v in self._nonce_cache.items()
            if v > now - self.settings.nonce_ttl_seconds
        }
        return nonce in self._nonce_cache

    async def _store_nonce(self, nonce: str):
        """Store nonce with TTL."""
        if self.redis:
            try:
                await self.redis.set(
                    f"nonce:{nonce}",
                    "1",
                    nx=True,
                    ex=self.settings.nonce_ttl_seconds,
                )
            except Exception as exc:
                logger.warning("zero_trust.nonce.redis_store_error error=%s", exc)
        else:
            self._nonce_cache[nonce] = time.time()

    async def _is_rate_limited(self, key: str, path: str) -> bool:
        """Check if rate limit has been exceeded."""
        limit = self._get_rate_limit(path)
        current = await self._get_current_count(key)
        return current >= limit

    def _get_rate_limit(self, path: str) -> int:
        """Get rate limit for specific path."""
        s = self.settings

        if "/face-match" in path:
            return s.rate_limit_face_match_per_minute
        if "/sim-swap" in path:
            return s.rate_limit_sim_swap_per_minute
        if "/history" in path:
            return s.rate_limit_history_per_minute
        if "/auth/token" in path:
            return s.rate_limit_token_per_minute
        if "/iccid" in path:
            return 10

        return 100  # Default

    async def _get_current_count(self, key: str) -> int:
        """Get current request count for rate limiting."""
        if self.redis:
            try:
                count = await self.redis.get(key)
                return int(count) if count else 0
            except Exception as exc:
                logger.warning("zero_trust.rate.redis_error error=%s", exc)
                return 0

        # In-memory fallback
        now = time.time()
        if key not in self._rate_counters:
            self._rate_counters[key] = []

        # Clean old entries (older than 60 seconds)
        self._rate_counters[key] = [
            t for t in self._rate_counters[key]
            if now - t < 60
        ]
        return len(self._rate_counters[key])

    async def _increment_counter(self, key: str):
        """Increment rate limit counter."""
        if self.redis:
            try:
                pipe = self.redis.pipeline()
                pipe.incr(key)
                pipe.expire(key, 60)
                await pipe.execute()
            except Exception as exc:
                logger.warning("zero_trust.rate.redis_incr_error error=%s", exc)
        else:
            now = time.time()
            if key not in self._rate_counters:
                self._rate_counters[key] = []
            self._rate_counters[key].append(now)

    async def _security_response(
            self,
            status_code: int,
            message: str,
            code: str,
            correlation_id: str,
            retry_after: int | None = None,
    ) -> Response:
        """Create standardized security error response."""
        error_type = {
            400: "Bad Request",
            401: "Unauthorized",
            403: "Forbidden",
            409: "Conflict",
            429: "Too Many Requests",
            500: "Internal Server Error",
        }.get(status_code, "Error")

        body = {
            "error": error_type,
            "message": message,
            "code": code,
            "correlation_id": correlation_id,
            "timestamp": datetime.now(UTC).isoformat(),
        }

        if retry_after is not None:
            body["retry_after"] = retry_after

        headers = {
            "Content-Type": "application/json",
            "X-Correlation-Id": correlation_id,
        }

        if retry_after is not None:
            headers["Retry-After"] = str(retry_after)

        # Security error responses always use the strict CSP
        headers.update(self._get_security_headers(path=None))

        return JSONResponse(
            content=body,
            status_code=status_code,
            headers=headers,
        )

    def _get_security_headers(self, path: str | None = None) -> dict[str, str]:
        """Get standard security headers. Relax CSP only for docs/redoc."""
        headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
            "Referrer-Policy": "no-referrer",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Pragma": "no-cache",
        }

        # Relax CSP for Swagger UI / ReDoc so their CDN assets can load
        if path in self.DOCS_PATHS:
            headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                "img-src 'self' data: https://fastapi.tiangolo.com; "
                "font-src 'self' data:; "
                "connect-src 'self'; "
                "frame-ancestors 'none'"
            )
        else:
            # Strict policy for all other responses (API + error pages)
            headers["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'"
            )

        return headers

    def _add_security_headers(self, response: Response, path: str | None = None):
        """Add security headers to response."""
        for key, value in self._get_security_headers(path).items():
            response.headers[key] = value