from .auth_router import router as auth
from .health import router as health
from .iccid import router as iccid
from .notifications import router as notifications
from .selfies import router as selfies
from .sim_swap import router as sim_swap
from .sim_swap_router_secure import router as sim_swap_secure
from .validation import router as validation
from .verification import router as verification
from .verifications import router as verifications

__all__ = [
    "auth", "health", "iccid", "notifications", "selfies",
    "sim_swap", "sim_swap_secure", "validation", "verification", "verifications",
]
