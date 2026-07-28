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

    @property
    def verify_now_configured(self) -> bool:
        return bool(self.verify_now_api_key and self.verify_base_url)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        verify_now_api_key=os.getenv("VERIFY_NOW_API_KEY"),
        verify_base_url=os.getenv("VERIFY_BASE_URL"),
        # Casing matches the existing key used by Backend/external_backend.
        idempotency_key=os.getenv("Idempotency_id_key"),
        static_dir=Path(os.getenv("STATIC_DIR", "static")),
        request_timeout_seconds=float(os.getenv("REQUEST_TIMEOUT_SECONDS", "15")),
    )
