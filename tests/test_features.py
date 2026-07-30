"""Tests for the verification journey: selfie capture, liveness, orchestration,
fallback, history and notifications (HT2-11, HT2-12, HT2-14, HT2-15, HT2-24/25).
"""

import base64

import pytest

from Backend.app import config

VALID_ID = "9001015001083"
INVALID_ID = "123"

PNG_SIG = b"\x89PNG\r\n\x1a\n"
JPEG_SIG = b"\xff\xd8\xff"


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def _live_image() -> str:
    """A large, high-diversity image that clears the mock liveness gate."""
    body = bytes(range(256)) * 8  # 256 distinct byte values -> score ~1.0
    return _b64(PNG_SIG + body)


def _weak_large_image() -> str:
    """A large but low-diversity image: a valid image that fails liveness."""
    return _b64(PNG_SIG + b"\x00" * 4000)


def _small_image() -> str:
    """Too small to be a genuine capture."""
    return _b64(JPEG_SIG + b"\x01\x02\x03")


def _capture(client, image: str, id_number: str = VALID_ID) -> str:
    resp = client.post("/api/v1/selfies", json={"id_number": id_number, "image": image})
    assert resp.status_code == 201, resp.text
    return resp.json()["selfie_id"]


def _pass_liveness(client, image: str = None, id_number: str = VALID_ID) -> str:
    selfie_id = _capture(client, image or _live_image(), id_number)
    resp = client.post(f"/api/v1/selfies/{selfie_id}/liveness")
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_live"] is True
    return selfie_id


class TestCaptureSelfie:
    def test_capture_returns_id_and_pending_liveness(self, client):
        resp = client.post(
            "/api/v1/selfies", json={"id_number": VALID_ID, "image": _live_image()}
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["selfie_id"]
        assert body["liveness_status"] == "pending"
        assert body["content_type"] == "image/png"

    def test_data_url_is_accepted(self, client):
        data_url = "data:image/png;base64," + _live_image()
        resp = client.post("/api/v1/selfies", json={"id_number": VALID_ID, "image": data_url})
        assert resp.status_code == 201

    def test_non_image_rejected(self, client):
        resp = client.post(
            "/api/v1/selfies", json={"id_number": VALID_ID, "image": _b64(b"not an image")}
        )
        assert resp.status_code == 422

    def test_invalid_base64_rejected(self, client):
        resp = client.post(
            "/api/v1/selfies", json={"id_number": VALID_ID, "image": "!!!notbase64!!!"}
        )
        assert resp.status_code == 422

    def test_missing_fields_rejected(self, client):
        assert client.post("/api/v1/selfies", json={"id_number": VALID_ID}).status_code == 422


class TestLiveness:
    def test_live_image_passes(self, client):
        selfie_id = _capture(client, _live_image())
        body = client.post(f"/api/v1/selfies/{selfie_id}/liveness").json()
        assert body["is_live"] is True
        assert body["score"] >= 0.6
        assert body["provider"] == "mock"

    def test_small_image_fails(self, client):
        selfie_id = _capture(client, _small_image())
        body = client.post(f"/api/v1/selfies/{selfie_id}/liveness").json()
        assert body["is_live"] is False

    def test_weak_large_image_fails(self, client):
        selfie_id = _capture(client, _weak_large_image())
        body = client.post(f"/api/v1/selfies/{selfie_id}/liveness").json()
        assert body["is_live"] is False

    def test_unknown_selfie_is_404(self, client):
        assert client.post("/api/v1/selfies/does-not-exist/liveness").status_code == 404


class TestVerificationGates:
    def test_structurally_invalid_id_is_rejected(self, client):
        resp = client.post("/api/v1/verifications", json={"id_number": INVALID_ID})
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "rejected"
        assert body["method"] == "structural"
        assert body["notification_type"] == "rejection"

    def test_missing_selfie_is_rejected(self, client):
        body = client.post("/api/v1/verifications", json={"id_number": VALID_ID}).json()
        assert body["status"] == "rejected"
        assert body["method"] == "liveness"

    def test_selfie_without_passed_liveness_is_rejected(self, client):
        selfie_id = _capture(client, _live_image())  # liveness not run -> pending
        body = client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id}
        ).json()
        assert body["status"] == "rejected"
        assert body["method"] == "liveness"

    def test_unknown_selfie_is_404(self, client):
        resp = client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": "nope"}
        )
        assert resp.status_code == 404


class TestVerificationDecision:
    def test_verifynow_approval(self, client, monkeypatch):
        monkeypatch.setenv("VERIFY_NOW_API_KEY", "k")
        monkeypatch.setenv("VERIFY_BASE_URL", "https://verify.example.com")
        config.get_settings.cache_clear()
        monkeypatch.setattr(
            "Backend.app.routers.verifications.verify_said",
            lambda **_: {"Status": "Success"},
        )
        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id}
        ).json()
        assert body["status"] == "approved"
        assert body["method"] == "verifynow"
        assert body["notification_type"] == "approval"

    def test_verifynow_rejection(self, client, monkeypatch):
        monkeypatch.setenv("VERIFY_NOW_API_KEY", "k")
        monkeypatch.setenv("VERIFY_BASE_URL", "https://verify.example.com")
        config.get_settings.cache_clear()
        monkeypatch.setattr(
            "Backend.app.routers.verifications.verify_said",
            lambda **_: {"Status": "failed"},
        )
        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id}
        ).json()
        assert body["status"] == "rejected"
        assert body["method"] == "verifynow"

    def test_fallback_approval_when_provider_unconfigured(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        monkeypatch.delenv("VERIFY_BASE_URL", raising=False)
        config.get_settings.cache_clear()
        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id}
        ).json()
        assert body["status"] == "approved"
        assert body["method"] == "fallback"
        assert body["provider_status"] == "provider_unavailable"

    def test_fallback_when_provider_errors(self, client, monkeypatch):
        from Backend.external_backend.main import VerifyNowError

        monkeypatch.setenv("VERIFY_NOW_API_KEY", "k")
        monkeypatch.setenv("VERIFY_BASE_URL", "https://verify.example.com")
        config.get_settings.cache_clear()

        def _boom(**_):
            raise VerifyNowError("upstream down")

        monkeypatch.setattr("Backend.app.routers.verifications.verify_said", _boom)
        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id}
        ).json()
        assert body["status"] == "approved"
        assert body["method"] == "fallback"

    def test_fallback_disabled_rejects(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        monkeypatch.delenv("VERIFY_BASE_URL", raising=False)
        config.get_settings.cache_clear()
        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications",
            json={"id_number": VALID_ID, "selfie_id": selfie_id, "allow_fallback": False},
        ).json()
        assert body["status"] == "rejected"
        assert body["method"] == "verifynow"


class TestHistoryAndNotifications:
    def test_history_records_and_filters(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        monkeypatch.delenv("VERIFY_BASE_URL", raising=False)
        config.get_settings.cache_clear()

        # One approval (fallback) and one rejection (bad ID).
        selfie_id = _pass_liveness(client)
        client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id}
        )
        client.post("/api/v1/verifications", json={"id_number": VALID_ID})

        all_history = client.get(f"/api/v1/verifications/history?id_number={VALID_ID}").json()
        assert len(all_history) == 2

        rejected = client.get(
            f"/api/v1/verifications/history?id_number={VALID_ID}&status=rejected"
        ).json()
        assert len(rejected) == 1
        assert rejected[0]["status"] == "rejected"

    def test_invalid_history_status_filter_rejected(self, client):
        assert (
            client.get("/api/v1/verifications/history?status=maybe").status_code == 422
        )

    def test_notifications_inbox(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        monkeypatch.delenv("VERIFY_BASE_URL", raising=False)
        config.get_settings.cache_clear()

        selfie_id = _pass_liveness(client)
        client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id}
        )
        notifications = client.get(f"/api/v1/notifications?id_number={VALID_ID}").json()
        assert len(notifications) == 1
        assert notifications[0]["type"] == "approval"
        assert notifications[0]["channel"] == "inapp"


@pytest.mark.parametrize(
    "payload",
    [{}, {"id_number": ""}, {"id_number": "x" * 40}],
)
def test_verification_schema_violations_rejected(client, payload):
    assert client.post("/api/v1/verifications", json=payload).status_code == 422
