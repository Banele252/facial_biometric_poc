# Backend/app/config.py
"""Application settings."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings

_DEFAULT_DB_PATH = Path(__file__).parent.parent / "facial_biometric.db"


class Settings(BaseSettings):
    env: str = "development"
    # 'mock' answers provider calls locally (see external_backend._mock_response);
    # 'sandbox' still calls VerifyNow's hosted sandbox and needs credentials.
    verify_mode: Literal["production", "sandbox", "mock"] = "sandbox"

    @property
    def is_sandbox(self) -> bool:
        return self.verify_mode == "sandbox" or self.env == "development"

    # The provider credentials Backend/external_backend/main.py reads straight
    # from the environment. They are declared here too so the app can tell
    # whether a real provider call is even possible.
    verify_now_api_key: str | None = None
    verify_base_url: str | None = None

    @property
    def verify_now_configured(self) -> bool:
        """True when a real VerifyNow call could be made.

        Derived, not configured. This used to be a plain `bool = False` field,
        which meant setting VERIFY_NOW_API_KEY and VERIFY_BASE_URL left it
        False: the journey then took the offline fallback path and never
        reached the fraud, sim-swap and activation stages, whatever the
        provider credentials said.
        """
        if self.verify_mode == "mock":
            return True
        return bool(self.verify_now_api_key and self.verify_base_url)

    request_timeout_seconds: int = 30
    sandbox_cooldown_seconds: int = 0
    face_match_min_score: float = 60.0
    liveness_provider: str = "mock"
    liveness_min_score: float = 0.6
    selfie_storage_dir: Path = Path(__file__).parent.parent / "selfies"

    # JWT Configuration
    jwt_private_key: str = ""
    jwt_public_key: str = ""
    jwt_algorithm: str = "RS256"
    jwt_issuer: str = "facial-biometric-poc"
    jwt_audience: str = "facial-biometric-api"
    jwt_access_token_expire_minutes: int = 60

    @field_validator("jwt_private_key", "jwt_public_key", mode="before")
    @classmethod
    def normalize_newlines(cls, v: str) -> str:
        if isinstance(v, str):
            return v.replace("\\n", "\n").strip()
        return v

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    # Database
    database_url: str = f"sqlite:///{_DEFAULT_DB_PATH}"
    redis_url: str = "redis://localhost:6379/0"

    # Security & Zero Trust
    allowed_geo_fences: list[str] = Field(default_factory=lambda: ["ZA-jnb", "ZA-cpt", "ZA-dur"])
    rate_limit_face_match_per_minute: int = 30
    rate_limit_sim_swap_per_minute: int = 10
    rate_limit_history_per_minute: int = 60
    rate_limit_token_per_minute: int = 20
    nonce_ttl_seconds: int = 300
    sandbox_api_key: str | None = None
    production_api_key: str | None = None
    cors_allow_origins: str = ""

    # Sandbox credentials for /auth/token, as a JSON object of
    # {username: {password, allowed_scopes, default_geo_fence}}.
    # Declared here rather than read with os.getenv in the router so it
    # resolves from .env like every other setting — os.getenv only sees the
    # real process environment, so a value in .env was silently ignored and
    # auth came up disabled with no indication why.
    test_users_json: str = ""

    # Audit & Compliance
    audit_secret_key: str = "change-me-in-production-use-256-bit-key-min-32-chars-long"
    audit_mobile_batch_max: int = 50
    audit_mobile_flush_interval_sec: int = 30
    audit_retention_days: int = 1825

    # Storage
    azure_storage_connection_string: str | None = None
    azure_storage_container: str = "selfies"

    @property
    def blob_storage_configured(self) -> bool:
        return bool(self.azure_storage_connection_string)

    # Frontend
    static_dir: Path = Path(__file__).parent.parent.parent / "mobile" / "dist"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()