import pytest
from fastapi.testclient import TestClient

from Backend.app.config import get_settings
from Backend.app.main import app


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    """Settings are cached per-process; drop the cache around env monkeypatching."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
