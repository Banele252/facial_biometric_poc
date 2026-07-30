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
        resp = client.post("/api/v1/selfies", json={"id_number": VALID_ID, "image": _live_image()})
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
    @staticmethod
    def _configure(monkeypatch):
        monkeypatch.setenv("VERIFY_NOW_API_KEY", "k")
        monkeypatch.setenv("VERIFY_BASE_URL", "https://verify.example.com")
        config.get_settings.cache_clear()

    @staticmethod
    def _match(outcome, score=88.0, provider_status="Approved", detail="ok"):
        from Backend.app.services.face_match import FaceMatchResult

        return lambda *_a, **_k: FaceMatchResult(
            outcome=outcome,
            provider_status=provider_status,
            score=score,
            detail=detail,
            request_id="req-1",
        )

    def test_face_match_approval(self, client, monkeypatch):
        self._configure(monkeypatch)
        monkeypatch.setattr(
            "Backend.app.routers.verifications.run_face_match", self._match("approved")
        )
        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id}
        ).json()
        assert body["status"] == "approved"
        assert body["method"] == "facematch"
        assert body["notification_type"] == "approval"
        assert body["match_score"] == 88.0
        # Sandbox unless the deployment opts into production.
        assert body["mode"] == "sandbox"

    def test_face_match_rejection(self, client, monkeypatch):
        self._configure(monkeypatch)
        monkeypatch.setattr(
            "Backend.app.routers.verifications.run_face_match",
            self._match("rejected", score=12.0, provider_status="Declined"),
        )
        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id}
        ).json()
        assert body["status"] == "rejected"
        assert body["method"] == "facematch"
        assert body["notification_type"] == "rejection"

    def test_face_match_in_review(self, client, monkeypatch):
        """ "In Review" is neither approval nor rejection and must not be coerced."""
        self._configure(monkeypatch)
        monkeypatch.setattr(
            "Backend.app.routers.verifications.run_face_match",
            self._match("review", score=68.0, provider_status="In Review"),
        )
        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id}
        ).json()
        assert body["status"] == "review"
        assert body["provider_status"] == "In Review"
        assert body["notification_type"] == "review"

    def test_client_cannot_force_production(self, client, monkeypatch):
        """A client-supplied mode must not be able to spend live credits."""
        self._configure(monkeypatch)
        captured = {}

        def _capture_mode(id_number, storage_ref, settings=None):
            from Backend.app.config import get_settings

            captured["mode"] = (settings or get_settings()).verify_mode
            return self._match("approved")()

        monkeypatch.setattr("Backend.app.routers.verifications.run_face_match", _capture_mode)
        selfie_id = _pass_liveness(client)
        client.post(
            "/api/v1/verifications",
            json={"id_number": VALID_ID, "selfie_id": selfie_id, "mode": "production"},
        )
        # The provider call resolves its mode from settings, not the request body.
        assert captured["mode"] == "sandbox"

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

        def _boom(*_a, **_k):
            raise VerifyNowError("upstream down")

        monkeypatch.setattr("Backend.app.routers.verifications.run_face_match", _boom)
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
        assert body["method"] == "facematch"


class TestHistoryAndNotifications:
    def test_history_records_and_filters(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        monkeypatch.delenv("VERIFY_BASE_URL", raising=False)
        config.get_settings.cache_clear()

        # One approval (fallback) and one rejection (bad ID).
        selfie_id = _pass_liveness(client)
        client.post("/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id})
        client.post("/api/v1/verifications", json={"id_number": VALID_ID})

        all_history = client.get(f"/api/v1/verifications/history?id_number={VALID_ID}").json()
        assert len(all_history) == 2

        rejected = client.get(
            f"/api/v1/verifications/history?id_number={VALID_ID}&status=rejected"
        ).json()
        assert len(rejected) == 1
        assert rejected[0]["status"] == "rejected"

    def test_invalid_history_status_filter_rejected(self, client):
        assert client.get("/api/v1/verifications/history?status=maybe").status_code == 422

    def test_notifications_inbox(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        monkeypatch.delenv("VERIFY_BASE_URL", raising=False)
        config.get_settings.cache_clear()

        selfie_id = _pass_liveness(client)
        client.post("/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id})
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


class TestRicaAndAudit:
    """The RICA gate and the audit trail (journey one, steps 2 and 4)."""

    @staticmethod
    def _seed_rica(client, id_number, full_name, msisdn):
        resp = client.post(
            "/api/v1/rica/records",
            json={"id_number": id_number, "full_name": full_name, "msisdn": msisdn},
        )
        assert resp.status_code == 201, resp.text

    def test_rica_mismatch_rejects_before_any_provider_call(self, client, monkeypatch):
        """A name that does not own the number is the fraud case — stop there."""
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        config.get_settings.cache_clear()
        self._seed_rica(client, VALID_ID, "Thabo Nkosi", "0821234567")

        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications",
            json={
                "id_number": VALID_ID,
                "full_name": "Someone Else",
                "msisdn": "0821234567",
                "selfie_id": selfie_id,
            },
        ).json()

        assert body["status"] == "rejected"
        assert body["method"] == "rica"
        assert body["provider_status"] == "rica_mismatch"
        names = [c["name"] for c in body["checks"]]
        # The journey stopped at RICA: no provider steps were even attempted.
        assert "rica" in names
        assert "face_match" not in names

    def test_rica_match_lets_the_journey_continue(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        config.get_settings.cache_clear()
        self._seed_rica(client, VALID_ID, "Thabo Nkosi", "0821234567")

        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications",
            json={
                "id_number": VALID_ID,
                "full_name": "  thabo nkosi  ",  # case and padding must not matter
                "msisdn": "0821234567",
                "selfie_id": selfie_id,
            },
        ).json()

        rica = next(c for c in body["checks"] if c["name"] == "rica")
        assert rica["status"] == "pass"
        assert body["status"] == "approved"  # fallback, provider unconfigured

    def test_rica_skipped_when_identity_not_supplied(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        config.get_settings.cache_clear()
        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id}
        ).json()
        rica = next(c for c in body["checks"] if c["name"] == "rica")
        assert rica["status"] == "skipped"

    def test_every_decision_is_audited(self, client, monkeypatch):
        from Backend.app.services.audit import list_events

        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        config.get_settings.cache_clear()
        selfie_id = _pass_liveness(client)
        client.post("/api/v1/verifications", json={"id_number": VALID_ID, "selfie_id": selfie_id})

        processes = [e["process"] for e in list_events()]
        assert "journey_started" in processes
        assert "verification_decision" in processes

    def test_audit_never_stores_the_image(self, client, monkeypatch):
        """Biometric images are SPI (CARB slide 20) — only references are kept."""
        from Backend.app.services.audit import list_events, record_event

        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        config.get_settings.cache_clear()
        client.get("/api/v1/notifications")  # force db init
        record_event("test", {"image": "AAAABBBB", "id_number": VALID_ID})
        payloads = [e["payload"] for e in list_events()]
        assert any("<redacted>" in p for p in payloads)
        assert not any("AAAABBBB" in p for p in payloads)


class TestRicaUnregisteredVsMismatch:
    """An unknown number and a wrong name are different answers."""

    def test_unknown_number_goes_to_review_not_rejection(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        config.get_settings.cache_clear()
        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications",
            json={
                "id_number": VALID_ID,
                "full_name": "Thabo Nkosi",
                "msisdn": "0999999999",  # never seeded
                "selfie_id": selfie_id,
            },
        ).json()

        assert body["status"] == "review"
        assert body["provider_status"] == "rica_unregistered"
        assert body["notification_type"] == "review"
        rica = next(c for c in body["checks"] if c["name"] == "rica")
        assert rica["status"] == "review"

    def test_wrong_name_is_still_a_rejection(self, client, monkeypatch):
        monkeypatch.delenv("VERIFY_NOW_API_KEY", raising=False)
        config.get_settings.cache_clear()
        client.post(
            "/api/v1/rica/records",
            json={"id_number": VALID_ID, "full_name": "Thabo Nkosi", "msisdn": "0821234567"},
        )
        selfie_id = _pass_liveness(client)
        body = client.post(
            "/api/v1/verifications",
            json={
                "id_number": VALID_ID,
                "full_name": "Someone Else",
                "msisdn": "0821234567",
                "selfie_id": selfie_id,
            },
        ).json()

        assert body["status"] == "rejected"
        assert body["provider_status"] == "rica_mismatch"


class TestFraudAndSimSwap:
    """Journey steps 9-11: fraud checks, then creating the swap order."""

    @staticmethod
    def _ready(client, monkeypatch, outcome="approved", score=88.0):
        """Get the journey as far as an approved face match."""
        monkeypatch.setenv("VERIFY_NOW_API_KEY", "k")
        monkeypatch.setenv("VERIFY_BASE_URL", "https://verify.example.com")
        config.get_settings.cache_clear()
        from Backend.app.services.face_match import FaceMatchResult

        monkeypatch.setattr(
            "Backend.app.routers.verifications.run_face_match",
            lambda *_a, **_k: FaceMatchResult(
                outcome=outcome,
                provider_status="Approved",
                score=score,
                detail="matched",
                request_id="r1",
            ),
        )
        client.post(
            "/api/v1/rica/records",
            json={"id_number": VALID_ID, "full_name": "Thabo Nkosi", "msisdn": "0821234567"},
        )
        return _pass_liveness(client)

    def _run(self, client, selfie_id, **extra):
        body = {
            "id_number": VALID_ID,
            "full_name": "Thabo Nkosi",
            "msisdn": "0821234567",
            "selfie_id": selfie_id,
            **extra,
        }
        return client.post("/api/v1/verifications", json=body).json()

    def test_clean_request_creates_a_swap_order(self, client, monkeypatch):
        selfie_id = self._ready(client, monkeypatch)
        body = self._run(
            client, selfie_id, new_sim_number="8927001234567890", device_id="dev-clean-1"
        )
        assert body["status"] == "approved"
        assert body["method"] == "sim_swap"

        names = [c["name"] for c in body["checks"]]
        assert names[-2:] == ["fraud", "sim_swap"]
        swap = next(c for c in body["checks"] if c["name"] == "sim_swap")
        assert swap["status"] == "pass"
        assert "order" in swap["detail"].lower()

    def test_watchlist_hit_rejects_before_any_order_is_created(self, client, monkeypatch):
        """A watchlist match is the one hard rejection the fraud engine makes."""
        from Backend.app.services.fraud import get_watchlist

        selfie_id = self._ready(client, monkeypatch)
        get_watchlist().add("dev-blocked")
        try:
            body = self._run(
                client, selfie_id, new_sim_number="8927001234567890", device_id="dev-blocked"
            )
            assert body["status"] == "rejected"
            assert body["method"] == "fraud"
            # The order step must never have run.
            assert "sim_swap" not in [c["name"] for c in body["checks"]]
        finally:
            get_watchlist()._entries.discard("dev-blocked")

    def test_order_is_skipped_when_sim_details_are_missing(self, client, monkeypatch):
        """Identity still succeeded — the customer is not failed for this."""
        selfie_id = self._ready(client, monkeypatch)
        body = self._run(client, selfie_id, device_id="dev-nosim")
        assert body["status"] == "approved"
        swap = next(c for c in body["checks"] if c["name"] == "sim_swap")
        assert swap["status"] == "skipped"

    def test_a_failed_face_match_never_reaches_fraud_or_swap(self, client, monkeypatch):
        selfie_id = self._ready(client, monkeypatch, outcome="rejected")
        body = self._run(client, selfie_id, new_sim_number="8927001234567890", device_id="dev-x")
        assert body["status"] == "rejected"
        names = [c["name"] for c in body["checks"]]
        assert "fraud" not in names
        assert "sim_swap" not in names
