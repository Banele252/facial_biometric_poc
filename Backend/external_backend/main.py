"""VerifyNow client.

Previously this module read environment variables and built request headers at
import time, which made it impossible to import from a long-running service or
a test without the environment already populated. The request logic is
unchanged — it is now behind functions that resolve configuration when called.
"""

import os

import requests
from dotenv import load_dotenv

MY_CREDITS_ENDPOINT = "/my_credits"
VERIFY_ENDPOINT = "/verify"
FACEMATCH_ENDPOINT = "/facematch"
PASSIVE_LIVENESS_ENDPOINT = "/passive-liveness"

# Home Affairs face match: selfie compared against the ID photo held by Home
# Affairs. The other bundles ("facematch_standard", "facematch_verified")
# require a caller-supplied reference image, which this journey does not have.
BUNDLE_HOME_AFFAIRS = "facematch"


class VerifyNowError(RuntimeError):
    """Raised when the VerifyNow API cannot be reached or is misconfigured."""


def _headers(mode: str = "production") -> dict[str, str]:
    headers = {
        "x-api-key": os.getenv("VERIFY_NOW_API_KEY", ""),
        "Content-Type": "application/json",
    }
    # Only production POSTs require idempotency. Reusing one key across
    # different sandbox requests would be wrong anyway, since a key may only be
    # replayed for an identical body.
    if mode != "sandbox":
        headers["Idempotency-Key"] = os.getenv("Idempotency_id_key", "")
    return headers


def _base_url() -> str:
    base_url = os.getenv("VERIFY_BASE_URL")
    if not base_url:
        raise VerifyNowError("VERIFY_BASE_URL is not configured")
    return base_url.rstrip("/")


def _post(endpoint: str, payload: dict, mode: str, timeout: float) -> dict:
    """POST a JSON payload to VerifyNow and return the decoded body."""
    try:
        resp = requests.post(
            url=f"{_base_url()}{endpoint}",
            headers=_headers(mode),
            json=payload,
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise VerifyNowError(f"VerifyNow request failed: {exc}") from exc

    if resp.status_code >= 400:
        # The body carries the useful part ("Sandbox API is on a 10-second
        # cooldown", "Invalid or missing id_number"), so surface it.
        detail = ""
        try:
            body = resp.json()
            detail = str(body.get("message") or body.get("error") or "")
        except ValueError:
            detail = resp.text[:200]
        raise VerifyNowError(f"VerifyNow returned HTTP {resp.status_code}: {detail}".strip())

    try:
        return resp.json()
    except ValueError as exc:
        raise VerifyNowError("VerifyNow returned a non-JSON response") from exc


def verify_said(id_number: str, mode: str = "production", timeout: float = 15.0) -> dict:
    """Run a said_verification report against VerifyNow for the given ID number."""
    return _post(
        VERIFY_ENDPOINT,
        {"reportType": "said_verification", "idNumber": id_number, "mode": mode},
        mode,
        timeout,
    )


def face_match(
    id_number: str,
    selfie_image_base64: str,
    mode: str = "sandbox",
    timeout: float = 30.0,
) -> dict:
    """Match a selfie against the Home Affairs ID photo for the given ID number.

    Returns the raw provider body. The decision lives at
    ``results.face_match.status`` with a 0-100 ``score`` beside it.
    """
    return _post(
        FACEMATCH_ENDPOINT,
        {
            "bundle": BUNDLE_HOME_AFFAIRS,
            "selfie_image_base64": selfie_image_base64,
            "id_number": id_number,
            "mode": mode,
        },
        mode,
        timeout,
    )


def passive_liveness(image_base64: str, mode: str = "sandbox", timeout: float = 30.0) -> dict:
    """Run passive liveness on a face image.

    Note: in sandbox this shares a 10-second per-IP cooldown with the other
    sandbox routes, so calling it in the same journey as face_match will fail
    the second call. See services/liveness.py.
    """
    return _post(
        PASSIVE_LIVENESS_ENDPOINT,
        {"image_base64": image_base64, "mode": mode},
        mode,
        timeout,
    )


def get_credits(timeout: float = 15.0) -> dict:
    """Fetch the remaining VerifyNow credit balance."""
    try:
        resp = requests.get(
            url=f"{_base_url()}{MY_CREDITS_ENDPOINT}",
            headers=_headers(),
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json()
    except (requests.RequestException, ValueError) as exc:
        raise VerifyNowError(f"VerifyNow credits request failed: {exc}") from exc


def main() -> None:
    load_dotenv(override=True)
    print(verify_said(id_number=""))


if __name__ == "__main__":
    main()
