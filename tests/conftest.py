import json
import os
import uuid

# Point persistence at an isolated in-memory database and keep selfie storage
# out of the repo before the app (and its startup init_db) is imported.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

# Settings reads .env (Backend/app/config.py's Config.env_file) whatever the
# process is, so a developer's local file would otherwise decide test outcomes.
# VERIFY_MODE in particular: a local VERIFY_MODE=mock makes
# verify_now_configured True, and the tests that assert the provider-unconfigured
# fallback then fail on a machine that is merely set up for local development.
# Pin the provider settings to the unconfigured state the suite assumes;
# individual tests opt in with monkeypatch.setenv.
os.environ["VERIFY_MODE"] = "sandbox"
os.environ.pop("VERIFY_NOW_API_KEY", None)
os.environ.pop("VERIFY_BASE_URL", None)

# --- Auth for the zero-trust middleware -------------------------------------
# Every route except /healthz and /readyz sits behind ZeroTrustMiddleware, so
# the suite needs a real signed token rather than a bypass — testing the app
# with its authentication disabled would not be testing the app that ships.
#
# These must be set before Backend.app.main is imported: auth_router builds
# TEST_USERS at module import, and the settings object is cached.
# ZeroTrustMiddleware._validate_api_key enforces
# ^(sbx|prd)-ak-\d{4}-\d{2}-\d{2}-[a-f0-9]{8}$ before it even compares the
# value, so this has to be a well-formed sandbox key, not an arbitrary string.
TEST_API_KEY = "sbx-ak-2026-09-16-a1b2c3d4"
TEST_USERNAME = "test_admin"
TEST_PASSWORD = "test-suite-password"
TEST_GEO_FENCE = "ZA-jnb"
TEST_SCOPES = [
    "biometric:read",
    "biometric:write",
    "simswap:execute",
    "rica:read",
    "rica:write",
    "admin:docs",
]


def _generate_test_keypair() -> tuple[str, str]:
    """A throwaway RSA keypair, generated per test session.

    Deliberately not the committed keys/ pair: those are public by virtue of
    being in git history, and a test run should never depend on a key anyone
    could have.
    """
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


_PRIVATE_KEY, _PUBLIC_KEY = _generate_test_keypair()
os.environ["JWT_PRIVATE_KEY"] = _PRIVATE_KEY
os.environ["JWT_PUBLIC_KEY"] = _PUBLIC_KEY
os.environ["SANDBOX_API_KEY"] = TEST_API_KEY
os.environ["TEST_USERS_JSON"] = json.dumps(
    {
        TEST_USERNAME: {
            "password": TEST_PASSWORD,
            "allowed_scopes": TEST_SCOPES,
            "default_geo_fence": TEST_GEO_FENCE,
        }
    }
)

import pytest
from fastapi.testclient import TestClient

from Backend.app.config import get_settings
from Backend.app.db import reset_db_cache
from Backend.app.main import app
from Backend.app.services.fraud import reset_stores
from Backend.external_backend.main import VerifyNowError
from Backend.rica_service.config import get_settings as get_rica_settings
from Backend.rica_service.db import reset_db_cache as reset_rica_db_cache


@pytest.fixture(autouse=True)
def _isolate_state(tmp_path, monkeypatch):
    """Give each test a fresh in-memory DB and a private selfie directory.

    Settings and the DB connection are cached per-process, so both caches are
    dropped around every test to prevent state leaking between them.
    """
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("SELFIE_STORAGE_DIR", str(tmp_path / "selfies"))
    # The orchestrator waits out the VerifyNow sandbox cooldown between its two
    # provider calls. That is correct in production and pointless in tests,
    # where it would add ~11s per verification.
    monkeypatch.setenv("SANDBOX_COOLDOWN_SECONDS", "0")
    get_settings.cache_clear()
    reset_db_cache()
    # The RICA service keeps its own cached settings and connection
    # (Backend/rica_service/db.py), so clearing only the app's would leave
    # seeded registrations visible to the next test and make RICA tests pass
    # or fail depending on what ran before them.
    get_rica_settings.cache_clear()
    reset_rica_db_cache()
    reset_stores()
    yield
    get_settings.cache_clear()
    reset_db_cache()
    get_rica_settings.cache_clear()
    reset_rica_db_cache()


@pytest.fixture(autouse=True)
def _no_outbound_calls(monkeypatch):
    """Fail fast instead of reaching the network.

    Several tests configure a placeholder provider URL. Without this the ID
    verification step would attempt a real request to it on every run.
    """

    def _blocked(*_a, **_k):
        raise VerifyNowError("outbound calls are disabled in tests")

    monkeypatch.setattr("Backend.app.routers.verifications.verify_said", _blocked)


class _ZeroTrustClient(TestClient):
    """TestClient that mints a fresh nonce for every request.

    ZeroTrustMiddleware requires X-Request-Nonce on its high-security
    prefixes and rejects any nonce it has already seen, so this cannot be a
    static default header — the second request of a test would be refused as
    a replay. Generating one per request is what a real client does.
    """

    def request(self, *args, **kwargs):
        self.headers["X-Request-Nonce"] = uuid.uuid4().hex
        return super().request(*args, **kwargs)


@pytest.fixture
def client() -> TestClient:
    """A TestClient carrying a real bearer token and the zero-trust headers.

    The token is minted through /auth/token rather than forged, so the suite
    exercises the same path the mobile app and console use. X-API-Key is set
    because the Tier-1 sim-swap routes demand it on top of the bearer token.
    """
    test_client = _ZeroTrustClient(app)

    response = test_client.post(
        "/auth/token",
        data={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD,
            "scope": " ".join(TEST_SCOPES),
        },
        headers={
            "X-Device-Fingerprint": "pytest-device",
            "X-Geo-Fence": TEST_GEO_FENCE,
        },
    )
    assert response.status_code == 200, f"test auth setup failed: {response.text}"

    test_client.headers.update(
        {
            "Authorization": f"Bearer {response.json()['access_token']}",
            "X-Device-Fingerprint": "pytest-device",
            "X-Geo-Fence": TEST_GEO_FENCE,
            "X-API-Key": TEST_API_KEY,
        }
    )
    return test_client
