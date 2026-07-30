import os

# Point persistence at an isolated in-memory database before the app (and its
# lifespan get_db() call) is imported.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from config import get_settings
from db import reset_db_cache
from fastapi.testclient import TestClient

from main import app


@pytest.fixture(autouse=True)
def _isolate_state(monkeypatch):
    """Give each test a fresh in-memory DB.

    Settings and the DB connection are cached per-process, so both caches are
    dropped around every test to prevent state leaking between them.
    """
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    get_settings.cache_clear()
    reset_db_cache()
    yield
    get_settings.cache_clear()
    reset_db_cache()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
