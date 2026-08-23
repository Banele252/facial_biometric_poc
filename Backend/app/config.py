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
    verify_mode: Literal["production", "sandbox"] = "sandbox"

    @property
    def is_sandbox(self) -> bool:
        return self.verify_mode == "sandbox" or self.env == "development"

    verify_now_configured: bool = False
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