"""Runtime configuration, read from the environment.

Values come from Container App secrets in deployed environments and from a
local .env file during development. Nothing here is read at import time by
the request path — call get_settings() so tests can override the environment.
"""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    verify_now_api_key: str | None
    verify_base_url: str | None
    idempotency_key: str | None
    static_dir: Path
    request_timeout_seconds: float
    # Persistence for verification history and the in-app notification inbox.
    # Defaults to a local SQLite file; set to a postgresql:// URL to use the
    # deployed Postgres (requires the optional `psycopg` package).
    database_url: str
    # Selfie storage. Defaults to a local directory; set an Azure Blob
    # connection string + container to store in Blob (requires the optional
    # `azure-storage-blob` package).
    selfie_storage_dir: Path
    azure_storage_connection_string: str | None
    azure_storage_container: str
    # Liveness detection. Azure AI Face is the target provider but is
    # unavailable in the hackathon subscription, so the default is a
    # dependency-free mock that keeps the flow demonstrable.
    liveness_provider: str
    liveness_min_score: float
    # VerifyNow call mode. "sandbox" returns mock responses and consumes no
    # credits; "production" bills per call. Sandbox is the default so no code
    # path can spend credits without an explicit deployment-level opt-in.
    verify_mode: str
    # VerifyNow face match returns a 0-100 score alongside its own status. The
    # status is authoritative; this is the floor applied to an approval.
    face_match_min_score: float
    # The VerifyNow sandbox enforces a ~10s per-IP cooldown across its routes,
    # so a journey making two provider calls must wait between them or the
    # second returns "Too Many Requests". Production has no such limit.
    sandbox_cooldown_seconds: float

    @property
    def verify_now_configured(self) -> bool:
        return bool(self.verify_now_api_key and self.verify_base_url)

    @property
    def is_sandbox(self) -> bool:
        return self.verify_mode == "sandbox"

    @property
    def blob_storage_configured(self) -> bool:
        return bool(self.azure_storage_connection_string)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    default_db = f"sqlite:///{(Path('data') / 'verifications.db').as_posix()}"
    return Settings(
        verify_now_api_key=os.getenv("VERIFY_NOW_API_KEY"),
        verify_base_url=os.getenv("VERIFY_BASE_URL"),
        # Casing matches the existing key used by Backend/external_backend.
        idempotency_key=os.getenv("Idempotency_id_key"),
        static_dir=Path(os.getenv("STATIC_DIR", "static")),
        request_timeout_seconds=float(os.getenv("REQUEST_TIMEOUT_SECONDS", "15")),
        database_url=os.getenv("DATABASE_URL", default_db),
        selfie_storage_dir=Path(os.getenv("SELFIE_STORAGE_DIR", "data/selfies")),
        azure_storage_connection_string=os.getenv("AZURE_STORAGE_CONNECTION_STRING"),
        azure_storage_container=os.getenv("AZURE_STORAGE_CONTAINER", "selfies"),
        liveness_provider=os.getenv("LIVENESS_PROVIDER", "mock"),
        liveness_min_score=float(os.getenv("LIVENESS_MIN_SCORE", "0.6")),
        # Anything other than an explicit "production" is treated as sandbox,
        # so a typo or empty value fails safe rather than spending credits.
        verify_mode="production" if os.getenv("VERIFY_MODE") == "production" else "sandbox",
        face_match_min_score=float(os.getenv("FACE_MATCH_MIN_SCORE", "60")),
        sandbox_cooldown_seconds=float(os.getenv("SANDBOX_COOLDOWN_SECONDS", "11")),
    )
