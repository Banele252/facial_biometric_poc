"""Smoke tests that the FastAPI routes are wired to the right query
functions and shapes - not a re-test of the query logic itself (see
test_activity_logs.py / test_fraud_rules.py / test_ops_indicators.py for
that)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from Backend.analytics_api.conftest import FakeConnection, FakeCursor
from Backend.analytics_api.db import db_conn
from Backend.analytics_api.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _use_connection(conn: FakeConnection) -> None:
    def _dep():
        yield conn

    app.dependency_overrides[db_conn] = _dep


def test_health():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_activity_logs_endpoint_returns_paginated_shape(client):
    items = [{"id": 1, "service": "rica_service"}]
    conn = FakeConnection([FakeCursor(results=[{"total": 1}, items])])
    _use_connection(conn)

    response = client.get("/api/v1/analytics/activity-logs", params={"service": "rica_service"})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"] == [{"id": 1, "service": "rica_service"}]


def test_fraud_rules_summary_endpoint(client):
    conn = FakeConnection(
        [FakeCursor(results=[[{"stage": "consent", "reason": "missing", "trigger_count": 2}]])]
    )
    _use_connection(conn)

    response = client.get("/api/v1/analytics/fraud-rules/summary")

    assert response.status_code == 200
    assert response.json() == {
        "rules": [{"stage": "consent", "reason": "missing", "trigger_count": 2}]
    }


def test_ops_indicators_endpoint_returns_all_sections(client):
    conn = FakeConnection(
        [
            FakeCursor(results=[{"total": 1, "error_count": 0}, [{"service": "x", "count": 1}]]),
            FakeCursor(results=[[{"status": "approved", "count": 1}]]),
            FakeCursor(results=[[{"status": "completed", "count": 1}]]),
            FakeCursor(results=[[{"stage": "consent", "count": 1}]]),
            FakeCursor(results=[[{"table_name": "rica_records", "last_synced_at": "x"}]]),
        ]
    )
    _use_connection(conn)

    response = client.get("/api/v1/analytics/ops/indicators")

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {
        "api_calls",
        "verification_outcomes",
        "sim_swap_order_status",
        "rejection_stages",
        "sync_freshness",
    }
    assert body["api_calls"]["error_rate"] == 0.0
