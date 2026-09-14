"""Prod API access for the management console.

Reads from Backend/app (the real production API) instead of the analytics
Postgres mirror - see Backend/app/routers/reports.py for the endpoints this
calls. Function names and signatures deliberately match the analytical_db.py
module this replaces, so main.py/report_data.py/system_llm.py only need their
imports swapped, not their call sites.

created_at on every prod response is raw UTC ISO-8601 text (prod's own
convention - see Backend/app/reports_repository.py's module docstring).
Converting to SAST (South African Standard Time, a fixed UTC+2 offset with no
DST) happens only here, at the boundary where the console formats a response
for its own frontend - so a viewer of the console only ever sees SAST, never
UTC or their own machine's zone. Same policy this module replaces from
analytical_db.py, just moved from a DB-response boundary to an HTTP-response
boundary.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from config import get_settings

_SAST = timezone(timedelta(hours=2))
_TIMEOUT = 10.0


class ProdApiError(Exception):
    """Raised when Backend/app is unreachable or returns an error status."""


def _to_sast(iso_text: str | None) -> str | None:
    if iso_text is None:
        return None
    return datetime.fromisoformat(iso_text).astimezone(_SAST).isoformat()


def _sast_item(item: dict[str, Any]) -> dict[str, Any]:
    if "created_at" in item:
        item["created_at"] = _to_sast(item["created_at"])
    return item


async def _get(path: str, params: dict[str, Any]) -> Any:
    params = {k: v for k, v in params.items() if v is not None}
    base_url = get_settings().prod_api_base_url
    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=_TIMEOUT) as client:
            response = await client.get(path, params=params)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ProdApiError(f"Prod API request to {path} failed: {exc}") from exc
    return response.json()


# --- process_log (audit/process events) --------------------------------


async def list_process_logs(
    *,
    process: str | None = None,
    environment: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    data = await _get(
        "/api/v1/reports/audit-logs",
        {
            "process": process,
            "environment": environment,
            "created_from": created_from,
            "created_to": created_to,
            "limit": limit,
            "offset": offset,
        },
    )
    data["items"] = [_sast_item(item) for item in data["items"]]
    return data


async def find_verification_decision(*, id_number: str, near: str) -> dict[str, Any] | None:
    row = await _get(
        "/api/v1/reports/audit-logs/nearest-decision", {"id_number": id_number, "near": near}
    )
    if row is None:
        return None
    return _sast_item(row)


# --- rejected_requests (fraud rule rejections) --------------------------


async def list_fraud_rejections(
    *,
    stage: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    data = await _get(
        "/api/v1/reports/fraud-rejections",
        {
            "stage": stage,
            "msisdn": msisdn,
            "created_from": created_from,
            "created_to": created_to,
            "limit": limit,
            "offset": offset,
        },
    )
    data["items"] = [_sast_item(item) for item in data["items"]]
    return data


async def fraud_rejections_summary(
    *, created_from: str | None = None, created_to: str | None = None
) -> list[dict[str, Any]]:
    data = await _get(
        "/api/v1/reports/fraud-rejections/summary",
        {"created_from": created_from, "created_to": created_to},
    )
    return data["rules"]


# --- sim_swap_orders -------------------------------------------------------


async def list_sim_swap_orders(
    *,
    status: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    data = await _get(
        "/api/v1/reports/sim-swap-orders",
        {
            "status": status,
            "msisdn": msisdn,
            "created_from": created_from,
            "created_to": created_to,
            "limit": limit,
            "offset": offset,
        },
    )
    data["items"] = [_sast_item(item) for item in data["items"]]
    return data


async def sim_swap_status_summary(
    *, created_from: str | None = None, created_to: str | None = None
) -> list[dict[str, Any]]:
    data = await _get(
        "/api/v1/reports/sim-swap-orders/status-summary",
        {"created_from": created_from, "created_to": created_to},
    )
    return data["statuses"]


async def sim_swap_volume_by_day(*, days: int = 14) -> list[dict[str, Any]]:
    data = await _get("/api/v1/reports/sim-swap-orders/volume-by-day", {"days": days})
    return data["days"]


# --- transactions ---------------------------------------------------------


async def list_transactions(
    *,
    status: str | None = None,
    msisdn: str | None = None,
    transaction_kind: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    data = await _get(
        "/api/v1/reports/transactions",
        {
            "status": status,
            "msisdn": msisdn,
            "transaction_kind": transaction_kind,
            "created_from": created_from,
            "created_to": created_to,
            "limit": limit,
            "offset": offset,
        },
    )
    data["items"] = [_sast_item(item) for item in data["items"]]
    return data


async def get_transaction(transaction_id: str) -> dict[str, Any] | None:
    row = await _get(f"/api/v1/reports/transactions/{transaction_id}", {})
    if row is None:
        return None
    return _sast_item(row)


async def transaction_status_summary(
    *, created_from: str | None = None, created_to: str | None = None
) -> list[dict[str, Any]]:
    data = await _get(
        "/api/v1/reports/transactions/status-summary",
        {"created_from": created_from, "created_to": created_to},
    )
    return data["statuses"]


async def transaction_volume_by_day(*, days: int = 14) -> list[dict[str, Any]]:
    data = await _get("/api/v1/reports/transactions/volume-by-day", {"days": days})
    return data["days"]
