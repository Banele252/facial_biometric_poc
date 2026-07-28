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


class VerifyNowError(RuntimeError):
    """Raised when the VerifyNow API cannot be reached or is misconfigured."""


def _headers() -> dict[str, str]:
    return {
        "x-api-key": os.getenv("VERIFY_NOW_API_KEY", ""),
        "Content-Type": "application/json",
        "Idempotency-Key": os.getenv("Idempotency_id_key", ""),
    }


def _base_url() -> str:
    base_url = os.getenv("VERIFY_BASE_URL")
    if not base_url:
        raise VerifyNowError("VERIFY_BASE_URL is not configured")
    return base_url.rstrip("/")


def verify_said(id_number: str, mode: str = "production", timeout: float = 15.0) -> dict:
    """Run a said_verification report against VerifyNow for the given ID number."""
    try:
        resp = requests.post(
            url=f"{_base_url()}{VERIFY_ENDPOINT}",
            headers=_headers(),
            json={
                "reportType": "said_verification",
                "idNumber": id_number,
                "mode": mode,
            },
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise VerifyNowError(f"VerifyNow request failed: {exc}") from exc

    if resp.status_code >= 400:
        raise VerifyNowError(f"VerifyNow returned HTTP {resp.status_code}")

    try:
        return resp.json()
    except ValueError as exc:
        raise VerifyNowError("VerifyNow returned a non-JSON response") from exc


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
