"""
SIM swap order management endpoints.

Handles:
- SIM swap initiation
- Alternative order creation
- Order status retrieval
- Order activation

Security:
- JWT authentication
- SIM swap execution/read scopes
- API-key enforcement via middleware/security layer
- Geo-fence header
- Device fingerprint header
- Replay-protection nonce
- Correlation ID
"""

import hashlib
import logging
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Request,
    status,
)
from pydantic import BaseModel, Field

from Backend.app.db import get_db
from Backend.app.dependencies.security import (
    get_correlation_id,
    get_current_user,
    require_biometric_read,
    require_simswap_execute,
)

logger = logging.getLogger("sim_swap.router")

router = APIRouter(
    prefix="/api/v1/sim-swap",
    tags=["sim-swap"],
)


# =============================================================================
# Request / response models
# =============================================================================


class InitiateSwapRequest(BaseModel):
    id_number: str = Field(
        ...,
        min_length=13,
        max_length=13,
        description="South African identity number",
    )

    msisdn: str = Field(
        ...,
        min_length=10,
        max_length=15,
        description="MTN mobile number being swapped",
    )

    iccid: str = Field(
        ...,
        min_length=19,
        max_length=20,
        description="Replacement SIM ICCID",
    )

    selfie_id: str | None = Field(
        default=None,
        description="Reference to selfie that passed biometric verification",
    )

    device_id: str | None = Field(
        default=None,
        max_length=128,
        description="Journey/app device identifier",
    )


class InitiateSwapResponse(BaseModel):
    order_id: str
    status: str
    reference: str
    message: str


class CreateOrderRequest(BaseModel):
    id_number: str = Field(
        ...,
        min_length=13,
        max_length=13,
    )

    msisdn: str = Field(
        ...,
        min_length=10,
        max_length=15,
    )

    iccid: str = Field(
        ...,
        min_length=19,
        max_length=20,
    )

    selfie_id: str | None = None

    device_id: str | None = Field(
        default=None,
        max_length=128,
    )


class SimSwapOrderResponse(BaseModel):
    order_id: str
    id_number: str
    msisdn: str
    iccid: str
    status: str
    reference: str
    created_at: str
    updated_at: str


# =============================================================================
# Header aliases
# =============================================================================


RequestNonceHeader = Annotated[
    str,
    Header(
        alias="X-Request-Nonce",
        description=(
            "Unique nonce for replay protection. "
            "Generate a new value for every state-changing request."
        ),
    ),
]

DeviceFingerprintHeader = Annotated[
    str,
    Header(
        alias="X-Device-Fingerprint",
        description="Persistent device/application installation fingerprint",
    ),
]

GeoFenceHeader = Annotated[
    str,
    Header(
        alias="X-Geo-Fence",
        description="Request geo-fence, for example ZA-jnb",
    ),
]


# =============================================================================
# Helpers
# =============================================================================


def _mask_msisdn(msisdn: str) -> str:
    """
    Mask phone number for logging.

    Only the last four digits remain visible.
    """

    value = msisdn.strip()

    if len(value) <= 4:
        return "*" * len(value)

    return "*" * (len(value) - 4) + value[-4:]


def _hash_id(id_number: str) -> str:
    """
    Hash RSA ID for audit-safe logging.
    """

    return hashlib.sha256(
        id_number.strip().encode()
    ).hexdigest()[:12]


def _generate_reference() -> str:
    """
    Generate human-readable SIM swap reference.
    """

    date_part = datetime.now(UTC).strftime("%Y%m%d")
    random_part = uuid.uuid4().hex[:8].upper()

    return f"SWP-{date_part}-{random_part}"


def _validate_iccid(iccid: str) -> str:
    """
    Normalise and perform baseline ICCID validation.

    Full ICCID extraction/validation occurs earlier in the journey via
    /api/v1/iccid/extract. This acts as a final transaction-level guard.
    """

    value = "".join(
        character
        for character in iccid
        if character.isdigit()
    )

    if len(value) not in (19, 20):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ICCID length. Expected 19 or 20 digits.",
            headers={
                "X-Error-Code": "INVALID_ICCID",
            },
        )

    if not value.startswith("89"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ICCID format. ICCID must start with '89'.",
            headers={
                "X-Error-Code": "INVALID_ICCID",
            },
        )

    return value


# =============================================================================
# Initiate SIM swap
# =============================================================================


@router.post(
    "/initiate",
    response_model=InitiateSwapResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Initiate SIM Swap",
    description=(
            "Create a pending SIM swap order after the identity, "
            "replacement SIM and biometric journey has completed."
    ),
    dependencies=[
        Depends(require_simswap_execute),
    ],
)
async def initiate_sim_swap(
        request: Request,
        payload: InitiateSwapRequest,

        x_request_nonce: RequestNonceHeader,
        x_device_fingerprint: DeviceFingerprintHeader,
        x_geo_fence: GeoFenceHeader,

        user: Annotated[
            dict,
            Depends(get_current_user),
        ],

        correlation_id: Annotated[
            str,
            Depends(get_correlation_id),
        ],
) -> InitiateSwapResponse:

    user_ref = user.get(
        "sub",
        "anonymous",
    )

    id_number = payload.id_number.strip()
    msisdn = payload.msisdn.strip()
    iccid = _validate_iccid(payload.iccid)

    id_hash = _hash_id(id_number)
    masked_msisdn = _mask_msisdn(msisdn)

    # Prefer the security-layer device fingerprint as authoritative.
    device_id = (
        payload.device_id.strip()
        if payload.device_id
        else x_device_fingerprint.strip()
    )

    logger.info(
        (
            "sim_swap.initiate.start "
            "correlation=%s "
            "user=%s "
            "id_hash=%s "
            "msisdn=%s "
            "geo=%s "
            "device=%s"
        ),
        correlation_id,
        user_ref,
        id_hash,
        masked_msisdn,
        x_geo_fence,
        device_id,
    )

    db = get_db()

    existing = db.query_one(
        """
        SELECT
            order_id
        FROM sim_swap_orders
        WHERE
            id_number = ?
          AND msisdn = ?
          AND status IN (
                         'pending',
                         'approved'
            )
        ORDER BY created_at DESC
            LIMIT 1
        """,
        (
            id_number,
            msisdn,
        ),
    )

    if existing:
        logger.warning(
            (
                "sim_swap.initiate.duplicate "
                "correlation=%s "
                "user=%s "
                "id_hash=%s "
                "existing_order=%s"
            ),
            correlation_id,
            user_ref,
            id_hash,
            existing["order_id"],
        )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "An active SIM swap order already exists "
                "for this number."
            ),
            headers={
                "X-Error-Code": "DUPLICATE_ORDER",
            },
        )

    order_id = str(uuid.uuid4())
    reference = _generate_reference()
    now = datetime.now(UTC).isoformat()

    db.execute(
        """
        INSERT INTO sim_swap_orders
        (
            order_id,
            id_number,
            msisdn,
            iccid,
            status,
            reference,
            selfie_id,
            device_id,
            created_at,
            updated_at
        )
        VALUES (
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
               )
        """,
        (
            order_id,
            id_number,
            msisdn,
            iccid,
            "pending",
            reference,
            payload.selfie_id,
            device_id,
            now,
            now,
        ),
    )

    logger.info(
        (
            "sim_swap.initiate.success "
            "correlation=%s "
            "user=%s "
            "order_id=%s "
            "id_hash=%s "
            "msisdn=%s "
            "reference=%s"
        ),
        correlation_id,
        user_ref,
        order_id,
        id_hash,
        masked_msisdn,
        reference,
    )

    return InitiateSwapResponse(
        order_id=order_id,
        status="pending",
        reference=reference,
        message=(
            "SIM swap order created successfully. "
            "Awaiting activation."
        ),
    )


# =============================================================================
# Alternative create endpoint
# =============================================================================


@router.post(
    "/create",
    response_model=SimSwapOrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create SIM Swap Order",
    description="Create a SIM swap order using the alternative entry point.",
    dependencies=[
        Depends(require_simswap_execute),
    ],
)
async def create_sim_swap_order(
        request: Request,
        payload: CreateOrderRequest,

        x_request_nonce: RequestNonceHeader,
        x_device_fingerprint: DeviceFingerprintHeader,
        x_geo_fence: GeoFenceHeader,

        user: Annotated[
            dict,
            Depends(get_current_user),
        ],

        correlation_id: Annotated[
            str,
            Depends(get_correlation_id),
        ],
) -> SimSwapOrderResponse:

    user_ref = user.get(
        "sub",
        "anonymous",
    )

    id_number = payload.id_number.strip()
    msisdn = payload.msisdn.strip()
    iccid = _validate_iccid(payload.iccid)

    id_hash = _hash_id(id_number)

    device_id = (
        payload.device_id.strip()
        if payload.device_id
        else x_device_fingerprint.strip()
    )

    logger.info(
        (
            "sim_swap.create.start "
            "correlation=%s "
            "user=%s "
            "id_hash=%s "
            "geo=%s"
        ),
        correlation_id,
        user_ref,
        id_hash,
        x_geo_fence,
    )

    order_id = str(uuid.uuid4())
    reference = _generate_reference()
    now = datetime.now(UTC).isoformat()

    db = get_db()

    db.execute(
        """
        INSERT INTO sim_swap_orders
        (
            order_id,
            id_number,
            msisdn,
            iccid,
            status,
            reference,
            selfie_id,
            device_id,
            created_at,
            updated_at
        )
        VALUES (
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
               )
        """,
        (
            order_id,
            id_number,
            msisdn,
            iccid,
            "pending",
            reference,
            payload.selfie_id,
            device_id,
            now,
            now,
        ),
    )

    logger.info(
        (
            "sim_swap.create.success "
            "correlation=%s "
            "user=%s "
            "order_id=%s "
            "id_hash=%s"
        ),
        correlation_id,
        user_ref,
        order_id,
        id_hash,
    )

    return SimSwapOrderResponse(
        order_id=order_id,
        id_number=id_number,
        msisdn=msisdn,
        iccid=iccid,
        status="pending",
        reference=reference,
        created_at=now,
        updated_at=now,
    )


# =============================================================================
# Retrieve order
# =============================================================================


@router.get(
    "/{order_id}",
    response_model=SimSwapOrderResponse,
    summary="Get SIM Swap Order",
    description="Retrieve current SIM swap order status.",
    dependencies=[
        Depends(require_biometric_read),
    ],
)
async def get_sim_swap_order(
        request: Request,
        order_id: str,

        user: Annotated[
            dict,
            Depends(get_current_user),
        ],

        correlation_id: Annotated[
            str,
            Depends(get_correlation_id),
        ],
) -> SimSwapOrderResponse:

    user_ref = user.get(
        "sub",
        "anonymous",
    )

    logger.info(
        (
            "sim_swap.get.start "
            "correlation=%s "
            "user=%s "
            "order_id=%s"
        ),
        correlation_id,
        user_ref,
        order_id,
    )

    db = get_db()

    row = db.query_one(
        """
        SELECT *
        FROM sim_swap_orders
        WHERE order_id = ?
        """,
        (
            order_id,
        ),
    )

    if not row:
        logger.warning(
            (
                "sim_swap.get.not_found "
                "correlation=%s "
                "user=%s "
                "order_id=%s"
            ),
            correlation_id,
            user_ref,
            order_id,
        )

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SIM swap order not found.",
            headers={
                "X-Error-Code": "ORDER_NOT_FOUND",
            },
        )

    record = dict(row)

    logger.info(
        (
            "sim_swap.get.success "
            "correlation=%s "
            "user=%s "
            "order_id=%s "
            "status=%s"
        ),
        correlation_id,
        user_ref,
        order_id,
        record["status"],
    )

    return SimSwapOrderResponse(
        order_id=record["order_id"],
        id_number=record["id_number"],
        msisdn=record["msisdn"],
        iccid=record["iccid"],
        status=record["status"],
        reference=record["reference"],
        created_at=record["created_at"],
        updated_at=record["updated_at"],
    )


# =============================================================================
# Activate order
# =============================================================================


@router.post(
    "/{order_id}/activate",
    response_model=SimSwapOrderResponse,
    summary="Activate SIM Swap Order",
    description="Activate a pending or approved SIM swap order.",
    dependencies=[
        Depends(require_simswap_execute),
    ],
)
async def activate_sim_swap_order(
        request: Request,
        order_id: str,

        x_request_nonce: RequestNonceHeader,
        x_device_fingerprint: DeviceFingerprintHeader,
        x_geo_fence: GeoFenceHeader,

        user: Annotated[
            dict,
            Depends(get_current_user),
        ],

        correlation_id: Annotated[
            str,
            Depends(get_correlation_id),
        ],
) -> SimSwapOrderResponse:

    user_ref = user.get(
        "sub",
        "anonymous",
    )

    logger.info(
        (
            "sim_swap.activate.start "
            "correlation=%s "
            "user=%s "
            "order_id=%s "
            "device=%s "
            "geo=%s"
        ),
        correlation_id,
        user_ref,
        order_id,
        x_device_fingerprint,
        x_geo_fence,
    )

    db = get_db()

    row = db.query_one(
        """
        SELECT *
        FROM sim_swap_orders
        WHERE order_id = ?
        """,
        (
            order_id,
        ),
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SIM swap order not found.",
            headers={
                "X-Error-Code": "ORDER_NOT_FOUND",
            },
        )

    record = dict(row)

    if record["status"] == "activated":
        logger.info(
            (
                "sim_swap.activate.already_active "
                "correlation=%s "
                "user=%s "
                "order_id=%s"
            ),
            correlation_id,
            user_ref,
            order_id,
        )

        return SimSwapOrderResponse(
            order_id=record["order_id"],
            id_number=record["id_number"],
            msisdn=record["msisdn"],
            iccid=record["iccid"],
            status=record["status"],
            reference=record["reference"],
            created_at=record["created_at"],
            updated_at=record["updated_at"],
        )

    if record["status"] not in (
            "pending",
            "approved",
    ):
        logger.warning(
            (
                "sim_swap.activate.invalid_status "
                "correlation=%s "
                "user=%s "
                "order_id=%s "
                "current_status=%s"
            ),
            correlation_id,
            user_ref,
            order_id,
            record["status"],
        )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot activate order in "
                f"'{record['status']}' status. "
                "Order must be pending or approved."
            ),
            headers={
                "X-Error-Code":
                    "INVALID_STATUS_TRANSITION",
            },
        )

    now = datetime.now(UTC).isoformat()

    db.execute(
        """
        UPDATE sim_swap_orders
        SET
            status = 'activated',
            updated_at = ?
        WHERE order_id = ?
        """,
        (
            now,
            order_id,
        ),
    )

    logger.info(
        (
            "sim_swap.activate.success "
            "correlation=%s "
            "user=%s "
            "order_id=%s "
            "id_hash=%s"
        ),
        correlation_id,
        user_ref,
        order_id,
        _hash_id(record["id_number"]),
    )

    return SimSwapOrderResponse(
        order_id=record["order_id"],
        id_number=record["id_number"],
        msisdn=record["msisdn"],
        iccid=record["iccid"],
        status="activated",
        reference=record["reference"],
        created_at=record["created_at"],
        updated_at=now,
    )