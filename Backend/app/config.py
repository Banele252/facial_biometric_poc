"""Application configuration."""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Environment ──
    env: str = Field(default="development", alias="ENV")

    # ── JWT ──
    jwt_issuer: str = Field(default="facial-biometric-poc", alias="JWT_ISSUER")
    jwt_audience: str = Field(default="facial-biometric-api", alias="JWT_AUDIENCE")
    jwt_private_key: str | None = Field(default=None, alias="JWT_PRIVATE_KEY")
    jwt_public_key: str | None = Field(default=None, alias="JWT_PUBLIC_KEY")
    jwt_algorithm: str = Field(default="RS256", alias="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(default=60, alias="JWT_ACCESS_TOKEN_EXPIRE_MINUTES")

    # ── API Keys ──
    sandbox_api_key: str | None = Field(default=None, alias="SANDBOX_API_KEY")
    production_api_key: str | None = Field(default=None, alias="PRODUCTION_API_KEY")
    admin_api_key: str | None = Field(default=None, alias="ADMIN_API_KEY")

    # ── VerifyNow ──
    verify_now_api_key: str | None = Field(default=None, alias="VERIFY_NOW_API_KEY")
    verify_base_url: str | None = Field(default=None, alias="VERIFY_BASE_URL")
    verify_mode: str = Field(default="sandbox", alias="VERIFY_MODE")
    verify_now_configured: bool = False
    request_timeout_seconds: float = 30.0

    # ── Rate Limits ──
    rate_limit_face_match_per_minute: int = 10
    rate_limit_sim_swap_per_minute: int = 3
    rate_limit_history_per_minute: int = 60
    rate_limit_token_per_minute: int = 10

    # ── Redis / Nonce ──
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    nonce_ttl_seconds: int = 86400

    # ── Geo-fence ──
    allowed_geo_fences: list[str] = ["ZA-jnb", "ZA-cpt", "ZA-dur"]

    # ── Sandbox ──
    is_sandbox: bool = False
    sandbox_cooldown_seconds: float = 0.0

    # ── Persistence ──
    database_url: str = "sqlite:///./facial_biometric.db"
    static_dir: Path = Path("./static")
    selfie_storage_dir: Path = Path("./selfies")
    idempotency_key: str | None = None

    # ── Azure ──
    azure_storage_connection_string: str | None = None
    azure_storage_container: str = "selfies"

    # ── Liveness ──
    liveness_provider: str = "mock"
    liveness_min_score: float = 0.85

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


_settings_cache: Settings | None = None


def get_settings() -> Settings:
    global _settings_cache
    if _settings_cache is None:
        _settings_cache = Settings()
    return _settings_cache


def clear_settings_cache() -> None:
    global _settings_cache
    _settings_cache = None
