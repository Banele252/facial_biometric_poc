"""
Hardened ICCID extraction endpoint.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Depends, Request
from PIL import Image, ImageEnhance, UnidentifiedImageError
import pyzbar.pyzbar as pyzbar
from pyzbar.pyzbar import ZBarSymbol
import io
import re
import logging
import hashlib

from Backend.app.dependencies.security import get_current_user

router = APIRouter(prefix="/iccid", tags=["iccid"])
logger = logging.getLogger("iccid.audit")

ICCID_PATTERN = re.compile(r"^89\d{17,18}$")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}

Image.MAX_IMAGE_PIXELS = 40_000_000


def _mask(digits: str) -> str:
    if len(digits) <= 4:
        return "*" * len(digits)
    return "*" * (len(digits) - 4) + digits[-4:]


def _hash(digits: str) -> str:
    return hashlib.sha256(digits.encode()).hexdigest()[:16]


def _sniff_mime(header: bytes) -> str | None:
    if len(header) < 12:
        return None
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return "image/webp"
    return None


def _preprocess(image: Image.Image) -> Image.Image:
    if image.mode != "L":
        image = image.convert("L")
    image = ImageEnhance.Contrast(image).enhance(2.2)
    image = ImageEnhance.Sharpness(image).enhance(2.0)
    return image


def _validate_iccid(digits: str) -> dict:
    if not ICCID_PATTERN.match(digits):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid ICCID format. Expected 19-20 digits starting with 89, got: {_mask(digits)}",
        )
    return {
        "iccid": digits,
        "raw": digits,
        "barcode_type": "manual_entry",
        "source": "string_input",
    }


def _extract_from_image(image: Image.Image) -> dict | None:
    for img in (image, _preprocess(image)):
        barcodes = pyzbar.decode(
            img,
            symbols=[ZBarSymbol.CODE128, ZBarSymbol.CODE39, ZBarSymbol.EAN13, ZBarSymbol.I25],
        )
        for barcode in barcodes:
            data = barcode.data.decode("utf-8", errors="ignore")
            digits = re.sub(r"\D", "", data)
            if ICCID_PATTERN.match(digits):
                return {
                    "iccid": digits,
                    "raw": data,
                    "barcode_type": barcode.type,
                    "source": "barcode_scan",
                }
    return None


async def _read_bounded(file: UploadFile, max_bytes: int) -> bytes:
    chunks = []
    total = 0
    chunk_size = 1024 * 1024
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Image too large. Max size is 10 MB.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post(
    "/extract",
    summary="Extract or validate ICCID",
    description=(
        "Upload a photo of the SIM barcode OR provide the ICCID as a raw string. "
        "Requires JWT authentication via ZeroTrustMiddleware."
    ),
)
async def extract_iccid(
    request: Request,
    file: UploadFile | None = File(None, description="SIM card barcode image (JPEG/PNG/WebP, max 10 MB)"),
    iccid_string: str | None = Form(None, description="Raw ICCID digits (19-20 digits starting with 89)"),
    user: dict = Depends(get_current_user),
):
    correlation_id = getattr(request.state, "correlation_id", "unknown")
    user_ref = user.get("sub", "anonymous")

    if not file and not iccid_string:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either 'file' (barcode image) or 'iccid_string' (raw digits).",
        )

    if file:
        contents = await _read_bounded(file, MAX_UPLOAD_BYTES)

        sniffed = _sniff_mime(contents[:16])
        if sniffed not in ALLOWED_MIME:
            logger.warning(
                "iccid.extract.rejected_mime correlation=%s claimed=%s sniffed=%s",
                correlation_id, file.content_type, sniffed,
            )
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Unsupported or unrecognized image type.",
            )

        try:
            image = Image.open(io.BytesIO(contents))
            image.verify()
            image = Image.open(io.BytesIO(contents))
            result = _extract_from_image(image)
        except UnidentifiedImageError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File could not be read as an image.",
            ) from None
        except Image.DecompressionBombError:
            logger.warning("iccid.extract.decompression_bomb correlation=%s", correlation_id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Image exceeds allowed dimensions.",
            ) from None

        if result:
            logger.info(
                "iccid.extract.success correlation=%s user=%s source=barcode_scan hash=%s",
                correlation_id, user_ref, _hash(result["iccid"]),
            )
            return result

        if iccid_string:
            digits = re.sub(r"\D", "", iccid_string.strip())
            validated = _validate_iccid(digits)
            logger.info(
                "iccid.extract.success correlation=%s user=%s source=string_fallback hash=%s",
                correlation_id, user_ref, _hash(validated["iccid"]),
            )
            return validated

        logger.info("iccid.extract.no_barcode_found correlation=%s user=%s", correlation_id, user_ref)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No valid ICCID barcode found. Wipe the SIM, ensure good lighting, and keep the barcode flat, or provide 'iccid_string' as fallback.",
        )

    digits = re.sub(r"\D", "", iccid_string.strip())
    validated = _validate_iccid(digits)
    logger.info(
        "iccid.extract.success correlation=%s user=%s source=string_input hash=%s",
        correlation_id, user_ref, _hash(validated["iccid"]),
    )
    return validated
