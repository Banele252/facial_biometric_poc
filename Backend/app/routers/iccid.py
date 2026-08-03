import io
import logging
import re

import pyzbar.pyzbar as pyzbar
from fastapi import APIRouter, File, HTTPException, UploadFile, status
from PIL import Image, ImageEnhance
from pyzbar.pyzbar import ZBarSymbol

router = APIRouter(prefix="/iccid", tags=["iccid"])

logger = logging.getLogger(__name__)

# ICCID: 19 or 20 digits, starts with 89 (telecom identifier)
ICCID_PATTERN = re.compile(r"^89\d{17,18}$")


def _preprocess(image: Image.Image) -> Image.Image:
    """Grayscale + contrast + sharpness to improve barcode decode rate."""
    if image.mode != "L":
        image = image.convert("L")
    image = ImageEnhance.Contrast(image).enhance(2.2)
    image = ImageEnhance.Sharpness(image).enhance(2.0)
    return image


@router.post(
    "/extract",
    summary="Extract ICCID from SIM card image",
    description="Upload a photo of the SIM barcode. Returns the 19–20 digit ICCID.",
)
async def extract_iccid(file: UploadFile = File(...)):
    allowed = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported type. Allowed: {', '.join(allowed)}",
        )

    try:
        contents = await file.read()
        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Image too large. Max size is 10 MB.",
            )

        image = Image.open(io.BytesIO(contents))

        # Try original first, then preprocessed
        for img in (image, _preprocess(image)):
            barcodes = pyzbar.decode(
                img,
                symbols=[
                    ZBarSymbol.CODE128,
                    ZBarSymbol.CODE39,
                    ZBarSymbol.EAN13,
                    ZBarSymbol.I25,
                ],
            )
            for barcode in barcodes:
                data = barcode.data.decode("utf-8", errors="ignore")
                digits = re.sub(r"\D", "", data)
                if ICCID_PATTERN.match(digits):
                    return {
                        "iccid": digits,
                        "raw": data,
                        "barcode_type": barcode.type,
                    }

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "No valid ICCID barcode found. Wipe the SIM, ensure good "
                "lighting, and keep the barcode flat."
            ),
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("ICCID extraction failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Image processing failed. Please try again.",
        ) from exc
