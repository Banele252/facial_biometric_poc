from store import get_by_msisdn, list_records, upsert_record, verify


def test_upsert_creates_new_record():
    record = upsert_record("9001015009087", "Jane Doe", "27821234567", "8901234567890123456")
    assert record["id_number"] == "9001015009087"
    assert record["full_name"] == "Jane Doe"
    assert record["msisdn"] == "27821234567"
    assert record["new_sim_number"] == "8901234567890123456"


def test_upsert_replaces_existing_record_for_same_msisdn():
    upsert_record("9001015009087", "Jane Doe", "27821234567")
    updated = upsert_record("9001015009087", "Jane Doe", "27821234567", "NEWSIM123")
    assert updated["new_sim_number"] == "NEWSIM123"
    assert len(list_records()) == 1


def test_get_by_msisdn_returns_none_when_missing():
    assert get_by_msisdn("does-not-exist") is None


def test_verify_matches_when_id_and_name_align():
    upsert_record("9001015009087", "Jane Doe", "27821234567")
    result = verify("9001015009087", "jane doe", "27821234567")
    assert result["matched"] is True
    assert result["record"]["msisdn"] == "27821234567"


def test_verify_fails_on_id_mismatch():
    upsert_record("9001015009087", "Jane Doe", "27821234567")
    result = verify("8001015009087", "Jane Doe", "27821234567")
    assert result["matched"] is False
    assert "id_number" in result["reason"]


def test_verify_fails_when_msisdn_unknown():
    result = verify("9001015009087", "Jane Doe", "27827654321")
    assert result["matched"] is False
    assert result["record"] is None
