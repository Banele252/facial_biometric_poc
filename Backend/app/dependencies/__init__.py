"""Dependency injection package.

Exports FastAPI dependencies for zero-trust security:
- Authentication (get_current_user)
- Device binding validation
- Geo-fence validation
- Scope requirements (require_scope, require_any_scope, require_all_scopes)
- Pre-configured scope dependencies (require_biometric_read, etc.)
- Request context helpers (get_correlation_id, get_geo_fence, get_device_fingerprint)

Usage in routers:
    from Backend.app.dependencies import (
        get_correlation_id,
        get_current_user,
        require_simswap_execute,
    )
"""
from Backend.app.dependencies.security import (
    Scopes,
    get_correlation_id,
    get_current_user,
    get_device_fingerprint,
    get_geo_fence,
    get_token_info,
    require_admin,
    require_all_scopes,
    require_any_scope,
    require_biometric_read,
    require_biometric_write,
    require_rica_read,
    require_rica_write,
    require_scope,
    require_secure_biometric_read,
    require_secure_simswap_execute,
    require_simswap_execute,
    validate_device_binding,
    validate_geo_fence,
)

__all__ = [
    "Scopes",
    "get_correlation_id",
    "get_current_user",
    "get_device_fingerprint",
    "get_geo_fence",
    "get_token_info",
    "require_admin",
    "require_all_scopes",
    "require_any_scope",
    "require_biometric_read",
    "require_biometric_write",
    "require_rica_read",
    "require_rica_write",
    "require_scope",
    "require_secure_biometric_read",
    "require_secure_simswap_execute",
    "require_simswap_execute",
    "validate_device_binding",
    "validate_geo_fence",
]