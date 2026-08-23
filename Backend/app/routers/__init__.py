"""Router package exports.

This module provides a clean, centralized registry of all FastAPI routers
used by the Facial Biometric PoC backend. It enables:

1. Clean imports in main.py: `from Backend.app.routers import auth, sim_swap`
2. Explicit public API via __all__
3. Single source of truth for available routers

Note: sim_swap_router_secure.py is intentionally excluded — its functionality
is fully covered by ZeroTrustMiddleware + sim_swap.py's router-level deps.
"""
from Backend.app.routers.auth_router import router as auth
from Backend.app.routers.audit import router as audit
from Backend.app.routers.health import router as health
from Backend.app.routers.iccid import router as iccid
from Backend.app.routers.notifications import router as notifications
from Backend.app.routers.selfies import router as selfies
from Backend.app.routers.sim_swap import router as sim_swap
from Backend.app.routers.validation import router as validation
from Backend.app.routers.verification import router as verification
from Backend.app.routers.verifications import router as verifications

__all__ = [
    "auth",
    "audit",
    "health",
    "iccid",
    "notifications",
    "selfies",
    "sim_swap",
    "validation",
    "verification",
    "verifications",
]