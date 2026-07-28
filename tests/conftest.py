import os

# Point persistence at an isolated in-memory database and keep selfie storage
# out of the repo before the app (and its startup init_db) is imported.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from fastapi.testclient import TestClient

from Backend.app.config import get_settings
from Backend.app.db import reset_db_cache
from Backend.app.main import app


@pytest.fixture(autouse=True)
def _isolate_state(tmp_path, monkeypatch):
    """Give each test a fresh in-memory DB and a private selfie directory.

    Settings and the DB connection are cached per-process, so both caches are
    dropped around every test to prevent state leaking between them.
    """
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("SELFIE_STORAGE_DIR", str(tmp_path / "selfies"))
    get_settings.cache_clear()
    reset_db_cache()
    yield
    get_settings.cache_clear()
    reset_db_cache()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
