"""Router package exports.

This module provides a clean, centralized registry of all FastAPI routers
used by the Facial Biometric PoC backend. It enables:

1. Clean imports in main.py: `from Backend.app.routers import auth_router, sim_swap_router`
2. Explicit public API via __all__
3. Single source of truth for available routers

Note: sim_swap_router_secure.py is intentionally excluded — its functionality
is fully covered by ZeroTrustMiddleware + sim_swap.py's router-level deps.

Why every name carries a `_router` suffix
-----------------------------------------
These used to be exported under the submodule's own name (`verifications`,
`sim_swap`, ...). Importing a submodule sets it as an attribute of its
package, so `from .verifications import router as verifications` then
*rebound* that attribute from the module to the APIRouter. Anything
resolving the dotted path afterwards got the router, not the module — which
silently broke every string-target patch, e.g.

    monkeypatch.setattr("Backend.app.routers.verifications.run_face_match", ...)
    AttributeError: 'APIRouter' object has no attribute 'run_face_match'

The suffix keeps the registry convenient while leaving the module attributes
alone, so dotted paths mean what they say.
"""
from Backend.app.routers.audit import router as audit_router
from Backend.app.routers.auth_router import router as auth_router
from Backend.app.routers.chat import router as chat_router
from Backend.app.routers.health import router as health_router
from Backend.app.routers.iccid import router as iccid_router
from Backend.app.routers.management import router as management_router
from Backend.app.routers.notifications import router as notifications_router
from Backend.app.routers.selfies import router as selfies_router
from Backend.app.routers.sim_swap import router as sim_swap_router
from Backend.app.routers.stream import router as stream_router
from Backend.app.routers.validation import router as validation_router
from Backend.app.routers.verification import router as verification_router
from Backend.app.routers.verifications import router as verifications_router

__all__ = [
    "audit_router",
    "auth_router",
    "chat_router",
    "health_router",
    "iccid_router",
    "management_router",
    "notifications_router",
    "selfies_router",
    "sim_swap_router",
    "stream_router",
    "validation_router",
    "verification_router",
    "verifications_router",
]
