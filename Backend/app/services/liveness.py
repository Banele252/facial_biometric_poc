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

from dataclasses import dataclass

from Backend.app.config import Settings, get_settings

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

    The Cognitive Services provider is not registered in the hackathon
    subscription, so this raises with a clear message rather than failing
    obscurely. Wire the Face SDK here once the provider is available.
    """

    name = "azure_face"

    def check(self, raw: bytes, content_type: str, min_score: float) -> LivenessResult:
        raise RuntimeError(
            "Azure AI Face liveness is not available in this environment "
            "(CognitiveServices provider unregistered). Set LIVENESS_PROVIDER=mock."
        )


_PROVIDERS: dict[str, type[LivenessProvider]] = {
    MockLiveness.name: MockLiveness,
    AzureFaceLiveness.name: AzureFaceLiveness,
}


def get_liveness_provider(settings: Settings | None = None) -> LivenessProvider:
    settings = settings or get_settings()
    provider_cls = _PROVIDERS.get(settings.liveness_provider, MockLiveness)
    return provider_cls()
