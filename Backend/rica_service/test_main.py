def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_create_record_returns_stored_record(client):
    resp = client.post(
        "/api/v1/rica/records",
        json={
            "id_number": "9001015009087",
            "full_name": "Jane Doe",
            "msisdn": "27821234567",
            "new_sim_number": "8901234567890123456",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "stored"
    assert body["record"]["full_name"] == "Jane Doe"
    assert body["record"]["new_sim_number"] == "8901234567890123456"


def test_get_record_not_found(client):
    resp = client.get("/api/v1/rica/records/000")
    assert resp.status_code == 404


def test_get_record_after_create(client):
    client.post(
        "/api/v1/rica/records",
        json={"id_number": "9001015009087", "full_name": "Jane Doe", "msisdn": "27821234567"},
    )
    resp = client.get("/api/v1/rica/records/27821234567")
    assert resp.status_code == 200
    assert resp.json()["id_number"] == "9001015009087"


def test_verify_endpoint_matches(client):
    client.post(
        "/api/v1/rica/records",
        json={"id_number": "9001015009087", "full_name": "Jane Doe", "msisdn": "27821234567"},
    )
    resp = client.post(
        "/api/v1/rica/verify",
        json={"id_number": "9001015009087", "full_name": "Jane Doe", "msisdn": "27821234567"},
    )
    assert resp.status_code == 200
    assert resp.json()["matched"] is True


def test_verify_endpoint_no_match(client):
    resp = client.post(
        "/api/v1/rica/verify",
        json={"id_number": "9001015009087", "full_name": "Jane Doe", "msisdn": "27821234567"},
    )
    assert resp.status_code == 200
    assert resp.json()["matched"] is False


def test_list_records(client):
    client.post(
        "/api/v1/rica/records",
        json={"id_number": "9001015009087", "full_name": "Jane Doe", "msisdn": "27821234567"},
    )
    resp = client.get("/api/v1/rica/records")
    assert resp.status_code == 200
    assert len(resp.json()["records"]) == 1
