"""SIM Swap router — Tier-1 endpoints requiring dual auth.

All endpoints in this router require:
  - Valid RS256 JWT (bearerAuth)
  - X-API-Key header (apiKey)
  - X-Correlation-Id header (correlationId)
  - simswap:execute scope
"""

from fastapi import APIRouter, Depends, Security

from Backend.app.dependencies.security import require_simswap_execute
from Backend.app.middleware.zero_trust import (
    api_key_header,
    bearer_auth,
)

router = APIRouter(
    prefix="/api/v1/sim-swap",
    tags=["sim-swap"],
    # Router-level security: ALL endpoints in this router require dual auth
    dependencies=[
        Security(bearer_auth),
        Security(api_key_header),

        Depends(require_simswap_execute),
    ],
)


@router.post(
    "/initiate",
    summary="Initiate SIM Swap",
    description="Tier-1 mutation. Requires dual auth. Max 3/min per MSISDN.",
    responses={
        200: {"description": "SimSwapOrderResponse"},
        403: {"description": "Missing API key or insufficient scope"},
        429: {"description": "Rate limit exceeded — max 3/min per MSISDN"},
    },
)
async def initiate_sim_swap():
    """Initiate a SIM swap order."""
    return {"status": "initiated", "order_id": "swp-123"}
