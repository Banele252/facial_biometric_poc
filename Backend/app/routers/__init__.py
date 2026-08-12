"""Router package exports."""

from Backend.app.routers.auth_router import router as auth
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
    "health",
    "iccid",
    "notifications",
    "selfies",
    "sim_swap",
    "validation",
    "verification",
    "verifications",
]
