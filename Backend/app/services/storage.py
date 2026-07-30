"""Selfie storage — HT2-11 (Capture Selfie) backing.

Biometric images are sensitive personal information under the CARB, so this
module only persists the raw bytes and returns an opaque reference; nothing
here logs image content. The default stores to a local directory (self-contained
for the hackathon). Setting AZURE_STORAGE_CONNECTION_STRING switches to Azure
Blob, matching the target architecture, via a lazily imported optional package.
"""

from __future__ import annotations

import base64
import binascii
import logging
from dataclasses import dataclass
from pathlib import Path

from Backend.app.config import Settings, get_settings
from Backend.app.db import new_id

logger = logging.getLogger(__name__)

# Minimal magic-number sniffing so we can reject non-images without pulling in
# an image library. Maps a content-type to its leading signature bytes.
_IMAGE_SIGNATURES: tuple[tuple[str, bytes], ...] = (
    ("image/jpeg", b"\xff\xd8\xff"),
    ("image/png", b"\x89PNG\r\n\x1a\n"),
    ("image/webp", b"RIFF"),
)


class StorageError(ValueError):
    """Raised when selfie bytes are missing, malformed or not an image."""


@dataclass(frozen=True)
class StoredSelfie:
    reference: str
    content_type: str
    size_bytes: int


def decode_image(data: str) -> tuple[bytes, str]:
    """Decode a base64 image payload (optionally a ``data:`` URL).

    Returns the raw bytes and a sniffed content type. Raises StorageError for
    empty input, invalid base64, or bytes that are not a supported image.
    """
    if not data or not data.strip():
        raise StorageError("No image data provided")

    payload = data.strip()
    if payload.startswith("data:"):
        # data:[<mediatype>][;base64],<data>
        header, _, payload = payload.partition(",")
        if "base64" not in header or not payload:
            raise StorageError("Unsupported data URL; expected base64 image")

    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise StorageError("Image is not valid base64") from exc

    content_type = _sniff_content_type(raw)
    if content_type is None:
        raise StorageError("Payload is not a supported image (jpeg, png, webp)")
    return raw, content_type


def _sniff_content_type(raw: bytes) -> str | None:
    for content_type, signature in _IMAGE_SIGNATURES:
        if raw.startswith(signature):
            return content_type
    return None


class SelfieStorage:
    def save(self, id_number: str, raw: bytes, content_type: str) -> StoredSelfie:
        raise NotImplementedError

    def load(self, reference: str) -> bytes:
        raise NotImplementedError


class LocalSelfieStorage(SelfieStorage):
    """Writes selfies to a local directory. Default for the hackathon."""

    def __init__(self, directory: Path):
        self._dir = directory
        self._dir.mkdir(parents=True, exist_ok=True)

    def save(self, id_number: str, raw: bytes, content_type: str) -> StoredSelfie:
        ext = content_type.split("/")[-1]
        name = f"{new_id()}.{ext}"
        path = self._dir / name
        path.write_bytes(raw)
        return StoredSelfie(
            reference=f"file://{path.as_posix()}",
            content_type=content_type,
            size_bytes=len(raw),
        )

    def load(self, reference: str) -> bytes:
        if not reference.startswith("file://"):
            raise StorageError("Reference is not a local file")
        return Path(reference[len("file://"):]).read_bytes()


class AzureBlobSelfieStorage(SelfieStorage):
    """Stores selfies in Azure Blob — the CARB-intended backing store."""

    def __init__(self, connection_string: str, container: str):
        try:
            from azure.storage.blob import BlobServiceClient
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError(
                "AZURE_STORAGE_CONNECTION_STRING is set but the optional "
                "'azure-storage-blob' package is not installed."
            ) from exc
        self._service = BlobServiceClient.from_connection_string(connection_string)
        self._container = container
        try:  # Container may already exist; ignore that case.
            self._service.create_container(container)
        except Exception:  # pragma: no cover - depends on live Azure
            logger.debug("Container %s already exists or could not be created", container)

    def save(self, id_number: str, raw: bytes, content_type: str) -> StoredSelfie:
        from azure.storage.blob import ContentSettings

        ext = content_type.split("/")[-1]
        blob_name = f"{id_number}/{new_id()}.{ext}"
        client = self._service.get_blob_client(self._container, blob_name)
        client.upload_blob(
            raw, overwrite=True, content_settings=ContentSettings(content_type=content_type)
        )
        return StoredSelfie(
            reference=f"blob://{self._container}/{blob_name}",
            content_type=content_type,
            size_bytes=len(raw),
        )

    def load(self, reference: str) -> bytes:
        # blob://<container>/<blob name...>
        without_scheme = reference[len("blob://"):]
        container, _, blob_name = without_scheme.partition("/")
        client = self._service.get_blob_client(container, blob_name)
        return client.download_blob().readall()


def get_storage(settings: Settings | None = None) -> SelfieStorage:
    settings = settings or get_settings()
    if settings.blob_storage_configured:
        return AzureBlobSelfieStorage(
            settings.azure_storage_connection_string,  # type: ignore[arg-type]
            settings.azure_storage_container,
        )
    return LocalSelfieStorage(settings.selfie_storage_dir)
