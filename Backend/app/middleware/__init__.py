"""Middleware package.

Exports the zero-trust security middleware that enforces:
- JWT validation with issuer/audience checks
- Geo-fence matching
- Nonce replay protection
- Device binding validation
- Tier-1 API key validation
- Rate limiting (IP-based + user-based)
- Security headers injection
- Correlation ID propagation

Usage in main.py:
    from Backend.app.middleware import ZeroTrustMiddleware
    app.add_middleware(ZeroTrustMiddleware)
"""
from Backend.app.middleware.zero_trust import ZeroTrustMiddleware

__all__ = ["ZeroTrustMiddleware"]