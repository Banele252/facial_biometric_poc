"""Liveness detection — HT2-12 (Perform Liveness Check).

The CARB uses Azure AI Face liveness detection, but the Cognitive Services
provider is not available in the hackathon subscription. To keep the end-to-end
flow demonstrable, the default is a dependency-free heuristic ``MockLiveness``
provider; an ``AzureFaceLiveness`` placeholder documents where the real
provider slots in. Selection is config-driven (``LIVENESS_PROVIDER``).

The mock is deterministic for a given image so the behaviour is testable: it
rejects payloads that are too small to be a real capture and scores larger
images by their byte diversity (a solid-colour or degenerate image scores low,
a genuine photo scores high). It is a plausibility gate, not real biometrics.
"""

from __future__ import annotations

import base64
import logging
from dataclasses import dataclass

from Backend.app.config import Settings, get_settings

logger = logging.getLogger(__name__)

# A real camera capture is comfortably larger than this; anything smaller is
# treated as a non-capture (blank frame, icon, truncated upload).
_MIN_CAPTURE_BYTES = 1024


@dataclass(frozen=True)
class LivenessResult:
    is_live: bool
    score: float
    provider: str
    detail: str


class LivenessProvider:
    name = "base"

    def check(self, raw: bytes, content_type: str, min_score: float) -> LivenessResult:
        raise NotImplementedError


class MockLiveness(LivenessProvider):
    name = "mock"

    def check(self, raw: bytes, content_type: str, min_score: float) -> LivenessResult:
        if len(raw) < _MIN_CAPTURE_BYTES:
            return LivenessResult(
                is_live=False,
                score=0.15,
                provider=self.name,
                detail="Image too small to be a genuine capture",
            )

        # Byte diversity in [0, 1] as a cheap stand-in for image richness.
        score = round(len(set(raw)) / 256, 3)
        is_live = score >= min_score
        detail = (
            "Liveness plausible (mock heuristic)"
            if is_live
            else "Liveness signal too weak (mock heuristic)"
        )
        return LivenessResult(is_live=is_live, score=score, provider=self.name, detail=detail)


class AzureFaceLiveness(LivenessProvider):
    """Placeholder for Azure AI Face liveness — the CARB-intended provider.

    Still not usable, for two separate reasons, and neither is a wiring gap:

    1. The Limited Access approval granted 2026-08-01 covers Identification
       and Verification (``/detect``, ``/verify``) only. Liveness is excluded
       and needs its own application against the separately gated Face Client
       SDK release artifacts.
    2. Azure liveness is not a server-side "post an image, get a verdict" call
       like the rest of this module assumes. It is a session-based flow: the
       backend opens a liveness session, and the *client* drives it through the
       Face SDK embedded in the app. Wiring it here would therefore also mean
       changing both front ends, not just this class.

    ``VerifyNowLiveness`` below is the provider that actually works today.
    """

    name = "azure_face"

    def check(self, raw: bytes, content_type: str, min_score: float) -> LivenessResult:
        raise RuntimeError(
            "Azure AI Face liveness is not available: the Limited Access grant "
            "covers detect/verify only, and liveness needs the client-side Face "
            "SDK session flow. Use LIVENESS_PROVIDER=verifynow or mock."
        )


# Provider status strings, lowercased, that count as a live capture.
_LIVE_STATUSES = {"live", "real", "genuine", "passed", "pass", "approved"}


class VerifyNowLiveness(LivenessProvider):
    """Passive liveness via VerifyNow — a real check, available now.

    This is the answer to "can Azure do liveness and VerifyNow do the identity
    match": VerifyNow does both halves. It already exposes ``/passive-liveness``
    and the client for it has been sitting in ``external_backend`` unused,
    because the sandbox applies a ~10s per-IP cooldown across its routes — so a
    journey calling liveness *and* the Home Affairs face match would have had
    its second call rejected. Production has no such cooldown, which is what
    makes this usable rather than theoretical.

    Note this spends a provider credit per capture in production mode.
    """

    name = "verifynow"

    def check(self, raw: bytes, content_type: str, min_score: float) -> LivenessResult:
        # Imported here rather than at module scope so the mock provider stays
        # importable without the provider client or its configuration.
        from Backend.external_backend.main import VerifyNowError, passive_liveness

        settings = get_settings()
        if not settings.verify_now_configured:
            raise RuntimeError(
                "LIVENESS_PROVIDER=verifynow but VERIFY_NOW_API_KEY/VERIFY_BASE_URL are not set."
            )

        image_b64 = base64.b64encode(raw).decode("ascii")
        try:
            body = passive_liveness(
                image_base64=image_b64,
                mode=settings.verify_mode,
                timeout=settings.request_timeout_seconds * 2,
            )
        except VerifyNowError as exc:
            # A provider outage must not read as "not a live person" — that
            # would turn an infrastructure problem into an accusation.
            raise RuntimeError(f"Liveness provider unavailable: {exc}") from exc

        status, score = _extract_liveness(body)
        if not status and score is None:
            raise RuntimeError("Liveness response carried neither a status nor a score")

        # The provider's own verdict is authoritative; the score is applied as
        # an additional floor, matching how the face match treats its result.
        is_live = status.lower() in _LIVE_STATUSES if status else True
        if is_live and score is not None and score < min_score:
            is_live = False

        detail = (
            f"Live person confirmed by the provider ({status or 'no status'})"
            if is_live
            else f"Provider did not confirm a live person ({status or 'below threshold'})"
        )
        logger.info("VerifyNow liveness: status=%s score=%s is_live=%s", status, score, is_live)
        return LivenessResult(
            is_live=is_live,
            score=round(score, 3) if score is not None else (1.0 if is_live else 0.0),
            provider=self.name,
            detail=detail,
        )


def _extract_liveness(body: dict) -> tuple[str, float | None]:
    """Pull a status and score out of the provider body.

    The response shape is not documented to us, so several plausible shapes are
    tried rather than assuming one and failing opaquely on a mismatch. The
    scores are normalised to 0-1, since the provider may report either scale.
    """
    results = body.get("results") or body
    section = results.get("passive_liveness") or results.get("liveness") or results

    status = str(section.get("status") or section.get("result") or "").strip()
    raw_score = section.get("score", section.get("confidence"))
    score = float(raw_score) if isinstance(raw_score, (int, float)) else None
    # A 0-100 scale normalises to 0-1; anything already <= 1 is left alone.
    if score is not None and score > 1:
        score = score / 100
    return status, score


_PROVIDERS: dict[str, type[LivenessProvider]] = {
    MockLiveness.name: MockLiveness,
    AzureFaceLiveness.name: AzureFaceLiveness,
    VerifyNowLiveness.name: VerifyNowLiveness,
}


def get_liveness_provider(settings: Settings | None = None) -> LivenessProvider:
    settings = settings or get_settings()
    provider_cls = _PROVIDERS.get(settings.liveness_provider, MockLiveness)
    return provider_cls()
