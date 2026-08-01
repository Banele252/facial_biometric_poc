"""
Face Match Against Document photo.

"As the system, I want to compare the live face image against the ID
document (or passport) photograph so that identity can be verified."

Uses Azure AI Face API's detect + verify operations:
    1. Detect a face in the live selfie.
    2. Detect a face in the ID/passport document image.
    3. Verify whether the two detected faces belong to the same person.

IMPORTANT: Azure's Face API (detection with identification/verification
attributes) is a Limited Access Azure Cognitive Service - it requires an
approved application with Microsoft before the endpoint will return face
IDs usable for verification. Confirm this has been granted for your Azure
resource before relying on this in a live demo.

Requires the following environment variables (see .env):
    AZURE_FACE_API_ENDPOINT
    AZURE_FACE_API_KEY

This module has not been tested against a live Azure resource. The
orchestration logic is isolated from the Azure calls so it can be unit
tested via mocking.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_CONFIDENCE_THRESHOLD = 0.60


@dataclass
class FaceMatchResult:
    success: bool
    is_match: bool | None = None
    confidence: float | None = None
    error: str | None = None


class FaceMatchError(Exception):
    """Raised when a face could not be detected or the verify call failed."""


def _get_client():
    """Isolated so tests can mock it out without real credentials."""
    from azure.ai.vision.face import FaceClient
    from azure.core.credentials import AzureKeyCredential

    endpoint = os.getenv("AZURE_FACE_API_ENDPOINT")
    key = os.getenv("AZURE_FACE_API_KEY")
    if not endpoint or not key:
        raise FaceMatchError("AZURE_FACE_API_ENDPOINT and AZURE_FACE_API_KEY must be set.")
    return FaceClient(endpoint=endpoint, credential=AzureKeyCredential(key))


def _detect_face_id(client, image_bytes: bytes) -> str:
    """Detect the primary face in an image and return its faceId."""
    detected = client.detect(
        image_content=image_bytes,
        detection_model="detection_03",
        recognition_model="recognition_04",
        return_face_id=True,
    )
    if not detected:
        raise FaceMatchError("No face detected in the supplied image.")
    return detected[0].face_id


def match_face_to_document(
    selfie_bytes: bytes,
    document_image_bytes: bytes,
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> FaceMatchResult:
    """
    Compare a live selfie against the photo on an ID document / passport.
    """
    if not selfie_bytes or not document_image_bytes:
        return FaceMatchResult(
            success=False, error="Both a selfie and a document image are required."
        )

    try:
        client = _get_client()
        selfie_face_id = _detect_face_id(client, selfie_bytes)
        document_face_id = _detect_face_id(client, document_image_bytes)

        verify_result = client.verify_face_to_face(
            face_id1=selfie_face_id,
            face_id2=document_face_id,
        )
    except FaceMatchError as exc:
        return FaceMatchResult(success=False, error=str(exc))
    except Exception as exc:  # Azure SDK / network errors
        return FaceMatchResult(success=False, error=f"Face match failed: {exc}")

    confidence = float(verify_result.confidence)
    is_match = bool(verify_result.is_identical) and confidence >= confidence_threshold

    return FaceMatchResult(success=True, is_match=is_match, confidence=round(confidence, 4))
