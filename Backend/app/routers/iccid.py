# Backend/app/routers/iccid.py

"""
ICCID resolution endpoint.

Accepts either:
- a manually entered ICCID, or
- a base64-encoded image containing a SIM barcode.

Whichever valid input is supplied is resolved into a validated ICCID.

Security controls:
- JWT authentication
- Base64 validation
- upload size limit
- MIME sniffing
- decompression bomb protection
- barcode preprocessing
- ICCID format validation
- structured audit logging without exposing full ICCID
"""

import base64
import hashlib
import io
import logging
import re
from typing import Annotated, Literal

import pyzbar.pyzbar as pyzbar
from fastapi import APIRouter, Depends, HTTPException, status
from PIL import Image, ImageEnhance, UnidentifiedImageError
from pydantic import BaseModel, Field, model_validator
from pyzbar.pyzbar import ZBarSymbol

from Backend.app.dependencies.security import (
    get_correlation_id,
    get_current_user,
)

router = APIRouter(
    prefix="/api/v1/iccid",
    tags=["iccid"],
)

logger = logging.getLogger("iccid.audit")


# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

ICCID_PATTERN = re.compile(
    r"^89\d{17,18}$"
)

MAX_UPLOAD_BYTES = (
        10 * 1024 * 1024
)

ALLOWED_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

Image.MAX_IMAGE_PIXELS = (
    40_000_000
)


# -----------------------------------------------------------------------------
# Request / response models
# -----------------------------------------------------------------------------

class IccidExtractRequest(BaseModel):
    """
    Supply either:

    {
        "iccid": "8957..."
    }

    OR:

    {
        "image_base64": "data:image/jpeg;base64,..."
    }

    Both may technically be supplied, but the endpoint prefers a valid
    manually entered ICCID before processing the image.
    """

    iccid: str | None = Field(
        default=None,
        max_length=64,
        description=(
            "Manually entered ICCID. "
            "Spaces and formatting characters are allowed."
        ),
    )

    image_base64: str | None = Field(
        default=None,
        description=(
            "Base64 encoded image of the replacement SIM/barcode, "
            "with or without a data URL prefix."
        ),
    )

    @model_validator(mode="after")
    def validate_input(
            self,
    ) -> "IccidExtractRequest":
        has_iccid = bool(
            self.iccid
            and self.iccid.strip()
        )

        has_image = bool(
            self.image_base64
            and self.image_base64.strip()
        )

        if (
                not has_iccid
                and not has_image
        ):
            raise ValueError(
                "Provide either an ICCID or a barcode image."
            )

        return self


class IccidExtractResponse(BaseModel):
    iccid: str

    raw: str

    barcode_type: str

    source: Literal[
        "manual",
        "barcode_scan",
    ]


# -----------------------------------------------------------------------------
# ICCID helpers
# -----------------------------------------------------------------------------

def _normalize_iccid(
        value: str,
) -> str:
    """
    Remove spaces and non-numeric formatting characters.
    """

    return re.sub(
        r"\D",
        "",
        value,
    )


def _is_valid_iccid(
        value: str,
) -> bool:
    """
    Validate normalized ICCID format.
    """

    return bool(
        ICCID_PATTERN.fullmatch(
            value
        )
    )


def _extract_iccid_candidate(
        value: str,
) -> str | None:
    """
    Extract a 19-20 digit ICCID beginning with 89 from arbitrary
    barcode content.

    Examples accepted:

        8957012345678901234

        ICCID: 8957012345678901234

        89 5701 2345 6789 0123 4
    """

    if not value:
        return None

    digits = _normalize_iccid(
        value
    )

    match = re.search(
        r"89\d{17,18}",
        digits,
    )

    if not match:
        return None

    candidate = match.group(0)

    if not _is_valid_iccid(
            candidate
    ):
        return None

    return candidate


def _mask(
        digits: str,
) -> str:
    """
    Mask ICCID for logs, leaving only the last four digits.
    """

    if len(digits) <= 4:
        return "*" * len(
            digits
        )

    return (
            "*" * (
            len(digits) - 4
    )
            + digits[-4:]
    )


def _hash(
        digits: str,
) -> str:
    """
    Hash ICCID for audit correlation without logging the full value.
    """

    return hashlib.sha256(
        digits.encode()
    ).hexdigest()[:16]


# -----------------------------------------------------------------------------
# Image helpers
# -----------------------------------------------------------------------------

def _sniff_mime(
        header: bytes,
) -> str | None:
    """
    Determine image MIME type from magic bytes.
    """

    if len(header) < 12:
        return None

    if header.startswith(
            b"\xff\xd8\xff"
    ):
        return "image/jpeg"

    if header.startswith(
            b"\x89PNG\r\n\x1a\n"
    ):
        return "image/png"

    if (
            header.startswith(
                b"RIFF"
            )
            and header[8:12]
            == b"WEBP"
    ):
        return "image/webp"

    return None


def _preprocess(
        image: Image.Image,
) -> Image.Image:
    """
    Improve contrast and sharpness for barcode decoding.
    """

    working = image.copy()

    if working.mode != "L":
        working = (
            working.convert(
                "L"
            )
        )

    working = (
        ImageEnhance.Contrast(
            working
        ).enhance(
            2.2
        )
    )

    working = (
        ImageEnhance.Sharpness(
            working
        ).enhance(
            2.0
        )
    )

    return working


def _extract_from_image(
        image: Image.Image,
) -> dict | None:
    """
    Attempt ICCID extraction from original and enhanced images.
    """

    symbols = [
        ZBarSymbol.CODE128,
        ZBarSymbol.CODE39,
        ZBarSymbol.EAN13,
        ZBarSymbol.I25,
    ]

    variants = (
        image,
        _preprocess(
            image
        ),
    )

    for variant in variants:
        barcodes = pyzbar.decode(
            variant,
            symbols=symbols,
        )

        for barcode in barcodes:
            raw = (
                barcode.data.decode(
                    "utf-8",
                    errors="ignore",
                )
            )

            iccid = (
                _extract_iccid_candidate(
                    raw
                )
            )

            if not iccid:
                continue

            return {
                "iccid": iccid,
                "raw": raw,
                "barcode_type":
                    barcode.type,
                "source":
                    "barcode_scan",
            }

    return None


def _decode_image(
        image_base64: str,
) -> bytes:
    """
    Decode data URL or raw base64 image.
    """

    value = image_base64.strip()

    if "," in value:
        prefix, value = (
            value.split(
                ",",
                1,
            )
        )

        if (
                prefix.startswith(
                    "data:"
                )
                and ";base64"
                not in prefix
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Image data URL is not base64 encoded."
                ),
                headers={
                    "X-Error-Code":
                        "INVALID_BASE64",
                },
            )

    try:
        contents = (
            base64.b64decode(
                value,
                validate=True,
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid base64 image data."
            ),
            headers={
                "X-Error-Code":
                    "INVALID_BASE64",
            },
        ) from exc

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Image payload is empty."
            ),
            headers={
                "X-Error-Code":
                    "EMPTY_IMAGE",
            },
        )

    return contents


# -----------------------------------------------------------------------------
# Endpoint
# -----------------------------------------------------------------------------

@router.post(
    "/extract",
    response_model=IccidExtractResponse,
    summary=(
            "Resolve replacement SIM ICCID"
    ),
    description=(
            "Resolve and validate a replacement SIM ICCID from either "
            "a manually entered ICCID or a base64 encoded barcode image. "
            "At least one input must be supplied."
    ),
)
async def extract_iccid(
        payload: IccidExtractRequest,
        user: Annotated[
            dict,
            Depends(
                get_current_user
            ),
        ],
        correlation_id: Annotated[
            str,
            Depends(
                get_correlation_id
            ),
        ],
) -> IccidExtractResponse:
    """
    Resolve a replacement SIM ICCID.

    Input priority:

        1. Valid manually entered ICCID
        2. Barcode image

    A successful result is returned immediately.
    """

    user_ref = user.get(
        "sub",
        "anonymous",
    )

    has_manual = bool(
        payload.iccid
        and payload.iccid.strip()
    )

    has_image = bool(
        payload.image_base64
        and payload.image_base64.strip()
    )

    logger.info(
        (
            "iccid.resolve.start "
            "correlation=%s "
            "user=%s "
            "manual=%s "
            "image=%s"
        ),
        correlation_id,
        user_ref,
        has_manual,
        has_image,
    )

    # -------------------------------------------------------------------------
    # 1. Manual ICCID
    # -------------------------------------------------------------------------

    if has_manual:
        normalized = (
            _normalize_iccid(
                payload.iccid or ""
            )
        )

        if not _is_valid_iccid(
                normalized
        ):
            logger.warning(
                (
                    "iccid.resolve.invalid_manual "
                    "correlation=%s "
                    "user=%s "
                    "length=%d"
                ),
                correlation_id,
                user_ref,
                len(normalized),
            )

            # If image was also supplied, continue to image processing.
            if not has_image:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "Invalid ICCID. "
                        "The ICCID must start with 89 "
                        "and contain 19 or 20 digits."
                    ),
                    headers={
                        "X-Error-Code":
                            "INVALID_ICCID",
                    },
                )
        else:
            logger.info(
                (
                    "iccid.resolve.success "
                    "correlation=%s "
                    "user=%s "
                    "source=manual "
                    "masked=%s "
                    "hash=%s"
                ),
                correlation_id,
                user_ref,
                _mask(
                    normalized
                ),
                _hash(
                    normalized
                ),
            )

            return (
                IccidExtractResponse(
                    iccid=normalized,
                    raw=normalized,
                    barcode_type=(
                        "MANUAL"
                    ),
                    source="manual",
                )
            )

    # -------------------------------------------------------------------------
    # 2. Barcode image
    # -------------------------------------------------------------------------

    if has_image:
        try:
            contents = (
                _decode_image(
                    payload.image_base64
                    or ""
                )
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception(
                (
                    "iccid.resolve.image_decode_error "
                    "correlation=%s "
                    "user=%s"
                ),
                correlation_id,
                user_ref,
            )

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Unable to decode image."
                ),
                headers={
                    "X-Error-Code":
                        "INVALID_IMAGE",
                },
            ) from exc

        # ---------------------------------------------------------------------
        # Size validation
        # ---------------------------------------------------------------------

        if (
                len(contents)
                >
                MAX_UPLOAD_BYTES
        ):
            logger.warning(
                (
                    "iccid.resolve.too_large "
                    "correlation=%s "
                    "user=%s "
                    "size=%d"
                ),
                correlation_id,
                user_ref,
                len(contents),
            )

            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    "Image too large. "
                    "Maximum size is 10 MB."
                ),
                headers={
                    "X-Error-Code":
                        "IMAGE_TOO_LARGE",
                },
            )

        # ---------------------------------------------------------------------
        # MIME validation
        # ---------------------------------------------------------------------

        sniffed = _sniff_mime(
            contents[:16]
        )

        if (
                sniffed
                not in ALLOWED_MIME
        ):
            logger.warning(
                (
                    "iccid.resolve.rejected_mime "
                    "correlation=%s "
                    "user=%s "
                    "sniffed=%s"
                ),
                correlation_id,
                user_ref,
                sniffed,
            )

            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=(
                    "Unsupported or unrecognized image type. "
                    "Allowed formats: JPEG, PNG and WebP."
                ),
                headers={
                    "X-Error-Code":
                        "UNSUPPORTED_MIME",
                },
            )

        # ---------------------------------------------------------------------
        # Image decoding / barcode extraction
        # ---------------------------------------------------------------------

        try:
            with Image.open(
                    io.BytesIO(
                        contents
                    )
            ) as verify_image:
                verify_image.verify()

            with Image.open(
                    io.BytesIO(
                        contents
                    )
            ) as image:
                image.load()

                result = (
                    _extract_from_image(
                        image
                    )
                )

        except Image.DecompressionBombError:
            logger.warning(
                (
                    "iccid.resolve.decompression_bomb "
                    "correlation=%s "
                    "user=%s"
                ),
                correlation_id,
                user_ref,
            )

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Image exceeds allowed dimensions."
                ),
                headers={
                    "X-Error-Code":
                        "DECOMPRESSION_BOMB",
                },
            ) from None

        except (
                UnidentifiedImageError,
                OSError,
        ) as exc:
            logger.warning(
                (
                    "iccid.resolve.invalid_image "
                    "correlation=%s "
                    "user=%s "
                    "error=%s"
                ),
                correlation_id,
                user_ref,
                str(exc),
            )

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "File could not be read as a valid image."
                ),
                headers={
                    "X-Error-Code":
                        "INVALID_IMAGE",
                },
            ) from exc

        # ---------------------------------------------------------------------
        # Successful barcode result
        # ---------------------------------------------------------------------

        if result:
            resolved = (
                result["iccid"]
            )

            logger.info(
                (
                    "iccid.resolve.success "
                    "correlation=%s "
                    "user=%s "
                    "source=%s "
                    "type=%s "
                    "masked=%s "
                    "hash=%s"
                ),
                correlation_id,
                user_ref,
                result[
                    "source"
                ],
                result[
                    "barcode_type"
                ],
                _mask(
                    resolved
                ),
                _hash(
                    resolved
                ),
            )

            return (
                IccidExtractResponse(
                    **result
                )
            )

        logger.info(
            (
                "iccid.resolve.no_barcode_found "
                "correlation=%s "
                "user=%s"
            ),
            correlation_id,
            user_ref,
        )

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "No valid ICCID barcode found. "
                "Keep the barcode flat, well lit and fully visible."
            ),
            headers={
                "X-Error-Code":
                    "NO_BARCODE_FOUND",
            },
        )

    # -------------------------------------------------------------------------
    # Defensive fallback
    # -------------------------------------------------------------------------

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            "Provide either an ICCID or a barcode image."
        ),
        headers={
            "X-Error-Code":
                "ICCID_INPUT_REQUIRED",
        },
    )