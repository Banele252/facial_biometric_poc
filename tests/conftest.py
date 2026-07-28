import os

# Point persistence at an isolated in-memory database and keep selfie storage
# out of the repo before the app (and its startup init_db) is imported.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from fastapi.testclient import TestClient

from Backend.app.config import get_settings
from Backend.app.db import reset_db_cache
from Backend.app.main import app
from Backend.external_backend.main import VerifyNowError


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
    yield
    get_settings.cache_clear()
    reset_db_cache()


@pytest.fixture(autouse=True)
def _no_outbound_calls(monkeypatch):
    """Fail fast instead of reaching the network.

    Several tests configure a placeholder provider URL. Without this the ID
    verification step would attempt a real request to it on every run.
    """

    def _blocked(*_a, **_k):
        raise VerifyNowError("outbound calls are disabled in tests")

    monkeypatch.setattr("Backend.app.routers.verifications.verify_said", _blocked)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
