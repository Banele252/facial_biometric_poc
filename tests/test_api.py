"""API surface tests — health probes, validation endpoint, verification guards."""

import pytest

from Backend.app import config
from Backend.external_backend.main import VerifyNowError

VALID_ID = "9001015001083"


class TestHealth:
    def test_healthz_is_dependency_free(self, client):
        resp = client.get("/healthz")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_readyz_reports_provider_config(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        monkeypatch.delenv("VERIFY_BASE_URL", raising=False)
        config.get_settings.cache_clear()

        resp = client.get("/readyz")
        assert resp.status_code == 200
        assert resp.json()["verify_now_configured"] is False

    def test_readyz_true_when_configured(self, client, monkeypatch):
        monkeypatch.setenv("VERIFY_NOW_API_KEY", "test-key")
        monkeypatch.setenv("VERIFY_BASE_URL", "https://verify.example.com")
        config.get_settings.cache_clear()

        assert client.get("/readyz").json()["verify_now_configured"] is True


class TestValidateEndpoint:
    def test_valid_id_passes_every_check(self, client):
        resp = client.post("/api/v1/validate-id", json={"id_number": VALID_ID})
        assert resp.status_code == 200
        body = resp.json()
        assert body["valid"] is True
        assert body["failed_checks"] == []
        assert body["id_number_length"] == 13

    def test_malformed_id_does_not_500(self, client):
        """Rules that raise on short input must surface as failed checks, not errors."""
        resp = client.post("/api/v1/validate-id", json={"id_number": "abc"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["valid"] is False
        assert "length_is_13" in body["failed_checks"]
        assert "date_of_birth_plausible" in body["failed_checks"]

    def test_bad_luhn_is_reported(self, client):
        tampered = VALID_ID[:-1] + "4"
        body = client.post("/api/v1/validate-id", json={"id_number": tampered}).json()
        assert body["valid"] is False
        assert "luhn_checksum" in body["failed_checks"]

    @pytest.mark.parametrize("payload", [{}, {"id_number": ""}, {"id_number": "x" * 40}])
    def test_schema_violations_rejected(self, client, payload):
        assert client.post("/api/v1/validate-id", json=payload).status_code == 422


class TestVerifyEndpoint:
    def test_503_when_provider_unconfigured(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        monkeypatch.delenv("VERIFY_BASE_URL", raising=False)
        config.get_settings.cache_clear()

        resp = client.post("/api/v1/verify-identity", json={"id_number": VALID_ID})
        assert resp.status_code == 503

    def test_provider_error_becomes_502_without_leaking_detail(self, client, monkeypatch):
        monkeypatch.setenv("VERIFY_NOW_API_KEY", "test-key")
        monkeypatch.setenv("VERIFY_BASE_URL", "https://verify.example.com")
        config.get_settings.cache_clear()

        def _boom(**_kwargs):
            raise VerifyNowError("upstream 500 at https://internal.verify.example/secret")

        monkeypatch.setattr("Backend.app.routers.verification.verify_said", _boom)

        resp = client.post("/api/v1/verify-identity", json={"id_number": VALID_ID})
        assert resp.status_code == 502
        assert "internal.verify.example" not in resp.text

    def test_successful_verification_is_passed_through(self, client, monkeypatch):
        monkeypatch.setenv("VERIFY_NOW_API_KEY", "test-key")
        monkeypatch.setenv("VERIFY_BASE_URL", "https://verify.example.com")
        config.get_settings.cache_clear()

        monkeypatch.setattr(
            "Backend.app.routers.verification.verify_said",
            lambda **_kwargs: {"Status": "Success", "credits": 42},
        )

        resp = client.post("/api/v1/verify-identity", json={"id_number": VALID_ID})
        assert resp.status_code == 200
        assert resp.json()["Status"] == "Success"

    def test_invalid_mode_rejected(self, client):
        resp = client.post(
            "/api/v1/verify-identity",
            json={"id_number": VALID_ID, "mode": "staging"},
        )
        assert resp.status_code == 422
