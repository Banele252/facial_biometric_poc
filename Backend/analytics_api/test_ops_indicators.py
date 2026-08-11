import psycopg

from Backend.analytics_api.conftest import FakeConnection, FakeCursor, RaisingCursor
from Backend.analytics_api.ops_indicators import get_ops_indicators


def _full_success_cursors():
    return [
        FakeCursor(
            results=[
                {"total": 10, "error_count": 2},
                [{"service": "internal_backend", "count": 10}],
            ]
        ),
        FakeCursor(results=[[{"status": "approved", "count": 5}]]),
        FakeCursor(results=[[{"status": "completed", "count": 2}]]),
        FakeCursor(results=[[{"stage": "consent", "count": 1}]]),
        FakeCursor(
            results=[[{"table_name": "rica_records", "last_synced_at": "2026-08-10T00:00:00Z"}]]
        ),
    ]


def test_get_ops_indicators_computes_error_rate_and_all_sections():
    conn = FakeConnection(_full_success_cursors())

    result = get_ops_indicators(conn)

    assert result["api_calls"] == {
        "total_calls": 10,
        "error_count": 2,
        "error_rate": 0.2,
        "calls_by_service": [{"service": "internal_backend", "count": 10}],
    }
    assert result["verification_outcomes"] == [{"status": "approved", "count": 5}]
    assert result["sim_swap_order_status"] == [{"status": "completed", "count": 2}]
    assert result["rejection_stages"] == [{"stage": "consent", "count": 1}]
    assert result["sync_freshness"] == [
        {"table_name": "rica_records", "last_synced_at": "2026-08-10T00:00:00Z"}
    ]


def test_get_ops_indicators_zero_calls_has_zero_error_rate_not_a_crash():
    cursors = _full_success_cursors()
    cursors[0] = FakeCursor(results=[{"total": 0, "error_count": 0}, []])
    conn = FakeConnection(cursors)

    result = get_ops_indicators(conn)

    assert result["api_calls"]["error_rate"] == 0.0


def test_get_ops_indicators_missing_table_returns_none_for_that_section_only():
    """A table analytics_sync hasn't created yet in this deployment (e.g. no
    sim_swap_orders rows exist upstream) shouldn't take down the whole
    response - just that one section."""
    cursors = _full_success_cursors()
    cursors[2] = RaisingCursor(psycopg.errors.UndefinedTable())
    conn = FakeConnection(cursors)

    result = get_ops_indicators(conn)

    assert result["sim_swap_order_status"] is None
    assert conn.rollback_calls == 1
    # Sections after the missing one still ran normally.
    assert result["rejection_stages"] == [{"stage": "consent", "count": 1}]
    assert result["sync_freshness"] is not None
