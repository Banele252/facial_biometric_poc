"""Shared validation for uploaded images.

Every route that accepts an image needs the same two guards, and they were
written three separate times — in ``documents.py``, ``verification.py`` and
``iccid.py`` — which had already drifted: one allowed ``image/jpg``, another
did not, and they disagreed on status codes. One definition here means a change
to the limit or the allowed types reaches every endpoint at once.
"""

from __future__ import annotations

from fastapi import HTTPException, UploadFile, status

# Well past a phone camera JPEG and well short of anything worth buffering in a
# request handler. An unbounded ``await upload.read()`` is a denial of service
# waiting to be found.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

ALLOWED_IMAGE_TYPES = ("image/jpeg", "image/jpg", "image/png", "image/webp")


async def read_image(upload: UploadFile, field: str = "image") -> bytes:
    """Read an uploaded image, rejecting the wrong type or an oversized body.

    ``field`` names the form field in the error, so a caller sending two images
    is told which one was wrong.
    """
    if upload.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field}: unsupported image type {upload.content_type}",
        )

    raw = await upload.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"{field}: image exceeds the maximum allowed size "
                f"({MAX_UPLOAD_BYTES // (1024 * 1024)}MB)"
            ),
        )
    return raw
