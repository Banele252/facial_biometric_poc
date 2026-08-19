from Backend.analytics_api.conftest import FakeConnection, FakeCursor, rendered
from Backend.analytics_api.fraud_rules import list_rejections, rules_triggered_summary


def test_list_rejections_no_filters_omits_where_clause():
    conn = FakeConnection([FakeCursor(results=[{"total": 1}, [{"id": "1", "stage": "consent"}]])])

    result = list_rejections(conn)

    count_query, count_params = conn.cursors_seen[0].executed[0]
    assert "WHERE" not in rendered(count_query)
    assert count_params == []
    assert result["items"] == [{"id": "1", "stage": "consent"}]


def test_list_rejections_filters_by_stage_and_msisdn():
    conn = FakeConnection([FakeCursor(results=[{"total": 0}, []])])

    list_rejections(conn, stage="document_face", msisdn="0821234567")

    count_query, count_params = conn.cursors_seen[0].executed[0]
    rendered_query = rendered(count_query)
    assert "stage = %s" in rendered_query
    assert "msisdn = %s" in rendered_query
    assert count_params == ["document_face", "0821234567"]


def test_list_rejections_date_range_uses_string_params_not_datetimes():
    """created_at is stored as ISO-8601 text, not a native timestamp - date
    filters must stay strings so the comparison isn't a type mismatch."""
    conn = FakeConnection([FakeCursor(results=[{"total": 0}, []])])

    list_rejections(
        conn, created_from="2026-08-01T00:00:00+00:00", created_to="2026-08-10T00:00:00+00:00"
    )

    _, count_params = conn.cursors_seen[0].executed[0]
    assert count_params == ["2026-08-01T00:00:00+00:00", "2026-08-10T00:00:00+00:00"]
    assert all(isinstance(p, str) for p in count_params)


def test_rules_triggered_summary_groups_by_stage_and_reason():
    conn = FakeConnection(
        [
            FakeCursor(
                results=[
                    [
                        {"stage": "document_face", "reason": "no match", "trigger_count": 3},
                        {"stage": "consent", "reason": "missing consent", "trigger_count": 1},
                    ]
                ]
            )
        ]
    )

    result = rules_triggered_summary(conn)

    query, _ = conn.cursors_seen[0].executed[0]
    rendered_query = rendered(query)
    assert "GROUP BY stage, reason" in rendered_query
    assert "ORDER BY trigger_count DESC" in rendered_query
    assert result[0]["trigger_count"] == 3
