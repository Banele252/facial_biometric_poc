"""Application settings."""

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # JWT
    jwt_private_key: str = ""
    jwt_public_key: str = ""
    jwt_algorithm: str = "RS256"
    jwt_issuer: str = "facial-biometric-poc"
    jwt_audience: str = "facial-biometric-api"
    jwt_access_token_expire_minutes: int = 60

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Geo-fence
    allowed_geo_fences: list[str] = Field(default_factory=lambda: ["ZA-jnb", "ZA-cpt", "ZA-dur"])

    # Rate limits
    rate_limit_face_match_per_minute: int = 30
    rate_limit_sim_swap_per_minute: int = 10
    rate_limit_history_per_minute: int = 60
    rate_limit_token_per_minute: int = 20

    # Nonce / replay
    nonce_ttl_seconds: int = 300

    # API Keys
    sandbox_api_key: str | None = None
    production_api_key: str | None = None

    # Frontend static files
    static_dir: Path = Path(__file__).parent.parent.parent / "frontend" / "dist"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
