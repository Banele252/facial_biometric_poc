from Backend.analytics_api.activity_logs import list_activity_logs
from Backend.analytics_api.conftest import FakeConnection, FakeCursor, rendered


def test_list_activity_logs_no_filters_omits_where_clause():
    conn = FakeConnection([FakeCursor(results=[{"total": 2}, [{"id": 1}, {"id": 2}]])])

    result = list_activity_logs(conn)

    count_query, count_params = conn.cursors_seen[0].executed[0]
    assert "WHERE" not in rendered(count_query)
    assert count_params == []
    select_query, select_params = conn.cursors_seen[0].executed[1]
    assert "WHERE" not in rendered(select_query)
    assert select_params == [50, 0]  # default limit/offset appended
    assert result == {"total": 2, "limit": 50, "offset": 0, "items": [{"id": 1}, {"id": 2}]}


def test_list_activity_logs_combines_filters_with_and():
    conn = FakeConnection([FakeCursor(results=[{"total": 0}, []])])

    list_activity_logs(conn, service="fraud_engine", status_code=500)

    count_query, count_params = conn.cursors_seen[0].executed[0]
    rendered_query = rendered(count_query)
    assert "service = %s" in rendered_query
    assert "status_code = %s" in rendered_query
    assert " AND " in rendered_query
    assert count_params == ["fraud_engine", 500]


def test_list_activity_logs_clamps_limit_to_max():
    conn = FakeConnection([FakeCursor(results=[{"total": 0}, []])])

    result = list_activity_logs(conn, limit=10_000)

    assert result["limit"] == 200
    _, select_params = conn.cursors_seen[0].executed[1]
    assert select_params[-2] == 200  # limit is the second-to-last bound param


def test_list_activity_logs_negative_offset_clamped_to_zero():
    conn = FakeConnection([FakeCursor(results=[{"total": 0}, []])])

    result = list_activity_logs(conn, offset=-5)

    assert result["offset"] == 0
