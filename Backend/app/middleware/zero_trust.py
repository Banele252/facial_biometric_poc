"""
Zero-trust middleware for Facial Biometric PoC.
Enforces: JWT validation, geo-fence matching, nonce replay protection,
correlation ID propagation, scope checking, rate limiting, security headers.
"""

import json
import os
import re
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import jwt
from fastapi import Request
from fastapi.security import APIKeyHeader, HTTPBearer
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from Backend.app.config import get_settings

# ── Security scheme exports (used by routers) ──
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
bearer_auth = HTTPBearer(auto_error=False)
correlation_header = APIKeyHeader(name="X-Correlation-Id", auto_error=False)

# ── Redis ──
try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


class ZeroTrustMiddleware(BaseHTTPMiddleware):
    """
    Zero-trust middleware. Validates every request before it reaches
    the application layer. Fail closed on any security check failure.
    """

    def __init__(self, app, redis_client: Any | None = None):
        super().__init__(app)
        self.settings = get_settings()
        self.env = os.getenv("ENV", "development")
        self.redis = redis_client

        # ── Redis: mandatory in production, fail closed ──
        if REDIS_AVAILABLE and redis_client is None:
            try:
                self.redis = redis.from_url(
                    self.settings.redis_url, decode_responses=True
                )
            except Exception as exc:
                self.redis = None
                if self.env == "production":
                    raise RuntimeError(
                        f"Redis is required in production for rate limiting and nonce storage: {exc}"
                    ) from exc

        if self.env == "production" and self.redis is None:
            raise RuntimeError(
                "Redis is required in production. Set REDIS_URL and ensure redis is reachable."
            )

        # In-memory only for local dev (single worker)
        self._nonce_cache: dict[str, float] = {}
        self._rate_counters: dict[str, list[float]] = {}

    async def dispatch(self, request: Request, call_next):
        settings = self.settings
        path = request.url.path
        method = request.method

        # 1. SKIP HEALTH CHECKS
        if path in ("/healthz", "/readyz", "/docs", "/redoc", "/openapi.json", "/", "/favicon.ico"):
            return await call_next(request)

        # 2. CORRELATION ID
        correlation_id = request.headers.get("X-Correlation-Id")
        if not correlation_id:
            correlation_id = (
                f"facial-poc-{uuid.uuid4()}-"
                f"{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}"
            )
        request.state.correlation_id = correlation_id

        # 3. RATE LIMITING
        client_ip = self._get_client_ip(request)
        rate_key = f"rate:{client_ip}:{path}:{method}"
        if await self._is_rate_limited(rate_key, path):
            return self._security_response(
                429,
                "Too Many Requests",
                "RATE_LIMIT_EXCEEDED",
                correlation_id,
                retry_after=60,
            )
        await self._increment_counter(rate_key)

        # 4. JWT VALIDATION
        if path == "/auth/token":
            response = await call_next(request)
            response.headers["X-Correlation-Id"] = correlation_id
            return response

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return self._security_response(
                401,
                "Missing or invalid Authorization header",
                "MISSING_BEARER_TOKEN",
                correlation_id,
            )

        token = auth_header.replace("Bearer ", "").strip()
        if not token:
            return self._security_response(
                401, "Empty bearer token", "EMPTY_TOKEN", correlation_id
            )

        payload = self._validate_jwt(token, correlation_id)
        if isinstance(payload, Response):
            return payload

        request.state.user = payload
        request.state.jwt_payload = payload

        # 5. GEO-FENCE CHECK
        geo_header = request.headers.get("X-Geo-Fence")
        geo_claim = payload.get("geo_fence")

        if not geo_header:
            return self._security_response(
                403, "Missing X-Geo-Fence header", "MISSING_GEO_FENCE", correlation_id
            )

        if geo_header != geo_claim:
            return self._security_response(
                403,
                f"Geo-fence mismatch: header={geo_header}, claim={geo_claim}",
                "GEO_FENCE_MISMATCH",
                correlation_id,
            )

        if geo_header not in settings.allowed_geo_fences:
            return self._security_response(
                403,
                f"Geo-fence not allowed: {geo_header}",
                "GEO_FENCE_NOT_ALLOWED",
                correlation_id,
            )

        # 6. NONCE / REPLAY PROTECTION
        nonce = request.headers.get("X-Request-Nonce")
        if nonce:
            if await self._is_duplicate_nonce(nonce):
                return self._security_response(
                    409, "Duplicate nonce detected", "DUPLICATE_NONCE", correlation_id
                )
            await self._store_nonce(nonce)

        # 7. DEVICE FINGERPRINT BINDING
        if path.startswith("/api/v1/selfies") or path.startswith("/api/v1/face-match"):
            device_fp = request.headers.get("X-Device-Fingerprint")
            device_claim = payload.get("device_binding")
            if device_claim and device_fp != device_claim:
                return self._security_response(
                    403,
                    "Device fingerprint mismatch",
                    "DEVICE_BINDING_FAILED",
                    correlation_id,
                )

        # 8. API KEY CHECK (Tier-1)
        if self._is_tier1_endpoint(path):
            api_key = request.headers.get("X-API-Key")
            if not api_key:
                return self._security_response(
                    403,
                    "Missing X-API-Key for Tier-1 operation",
                    "MISSING_API_KEY",
                    correlation_id,
                )
            if not self._validate_api_key(api_key):
                return self._security_response(
                    403, "Invalid API key", "INVALID_API_KEY", correlation_id
                )

        # 9. FORWARD REQUEST
        response = await call_next(request)

        # 10. RESPONSE HEADERS
        current_count = await self._get_current_count(rate_key)
        limit = self._get_rate_limit(path)
        response.headers["X-Correlation-Id"] = correlation_id
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - current_count))
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + 60)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'none'"
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

        return response

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP behind a trusted reverse proxy."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _validate_jwt(self, token: str, correlation_id: str) -> Any:
        settings = self.settings
        if not settings.jwt_public_key:
            return self._security_response(
                500, "JWT public key not configured", "JWT_KEY_MISSING", correlation_id
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
        except jwt.ExpiredSignatureError:
            return self._security_response(
                401, "Token has expired", "TOKEN_EXPIRED", correlation_id
            )
        except jwt.InvalidIssuerError:
            return self._security_response(
                401, "Invalid token issuer", "INVALID_ISSUER", correlation_id
            )
        except jwt.InvalidAudienceError:
            return self._security_response(
                401, "Invalid token audience", "INVALID_AUDIENCE", correlation_id
            )
        except jwt.InvalidTokenError as e:
            return self._security_response(
                401, f"Invalid token: {str(e)}", "INVALID_TOKEN", correlation_id
            )
        return payload

    def _is_tier1_endpoint(self, path: str) -> bool:
        tier1 = (
            "/api/v1/sim-swap",
            "/api/v1/rica/records",
            "/api/v1/rica/verify",
            "/api/v1/verifications",
        )
        return path.startswith(tier1)

    def _validate_api_key(self, api_key: str) -> bool:
        import secrets
        if not re.match(r"^(sbx|prd)-ak-\d{4}-\d{2}-\d{2}-[a-f0-9]{8}$", api_key):
            return False
        expected = (
            self.settings.sandbox_api_key
            if "sbx" in api_key
            else self.settings.production_api_key
        )
        if not expected:
            return False
        return secrets.compare_digest(api_key, expected)

    async def _is_duplicate_nonce(self, nonce: str) -> bool:
        if self.redis:
            return await self.redis.exists(f"nonce:{nonce}") > 0
        now = time.time()
        self._nonce_cache = {
            k: v
            for k, v in self._nonce_cache.items()
            if v > now - self.settings.nonce_ttl_seconds
        }
        return nonce in self._nonce_cache

    async def _store_nonce(self, nonce: str):
        if self.redis:
            await self.redis.set(
                f"nonce:{nonce}", "1", nx=True, ex=self.settings.nonce_ttl_seconds
            )
        else:
            self._nonce_cache[nonce] = time.time()

    async def _is_rate_limited(self, key: str, path: str) -> bool:
        limit = self._get_rate_limit(path)
        current = await self._get_current_count(key)
        return current >= limit

    def _get_rate_limit(self, path: str) -> int:
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
        return 100

    async def _get_current_count(self, key: str) -> int:
        if self.redis:
            count = await self.redis.get(key)
            return int(count) if count else 0
        now = time.time()
        if key not in self._rate_counters:
            self._rate_counters[key] = []
        self._rate_counters[key] = [t for t in self._rate_counters[key] if now - t < 60]
        return len(self._rate_counters[key])

    async def _increment_counter(self, key: str):
        if self.redis:
            pipe = self.redis.pipeline()
            await pipe.incr(key)
            await pipe.expire(key, 60)
            await pipe.execute()
        else:
            now = time.time()
            if key not in self._rate_counters:
                self._rate_counters[key] = []
            self._rate_counters[key].append(now)

    def _security_response(
            self,
            status_code: int,
            message: str,
            code: str,
            correlation_id: str,
            retry_after: int | None = None,
    ) -> Response:
        body: dict[str, Any] = {  # ← FIX: explicit annotation allows int values
            "error": (
                "Unauthorized"
                if status_code == 401
                else (
                    "Forbidden"
                    if status_code == 403
                    else (
                        "Too Many Requests"
                        if status_code == 429
                        else "Conflict" if status_code == 409 else "Error"
                    )
                )
            ),
            "message": message,
            "code": code,
            "correlation_id": correlation_id,
            "timestamp": datetime.now(UTC).isoformat(),
        }
        if retry_after is not None:  # ← FIX: truthiness bug (0 is valid)
            body["retry_after"] = retry_after

        headers = {
            "Content-Type": "application/json",
            "X-Correlation-Id": correlation_id,
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy": "default-src 'none'",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        }
        if retry_after is not None:
            headers["Retry-After"] = str(retry_after)

        return Response(
            content=json.dumps(body), status_code=status_code, headers=headers
        )
