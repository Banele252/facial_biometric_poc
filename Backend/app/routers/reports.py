"""Reporting endpoints for the management console.

Reads the tables the verification journey already writes (`process_log`,
`sim_swap_orders`) plus two tables written solely for reporting
(`transactions`, `rejected_requests` — see `routers/verifications.py::_finalise`).

Deliberately shaped to match `management-console/management-backend`'s
existing `/api/v1/analytics/*` routes (same query params, same response
envelopes), which previously read this data from a separate analytics
Postgres mirror — so switching the console over is a mechanical swap of data
source, not a UI or contract change.

No authentication, matching every other endpoint in this API today (POC).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from Backend.app import reports_repository
from Backend.app.services.audit import find_decision_near, list_events_filtered

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("/audit-logs")
def audit_logs(
    process: str | None = None,
    environment: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    return list_events_filtered(
        process=process,
        environment=environment,
        created_from=created_from,
        created_to=created_to,
        limit=limit,
        offset=offset,
    )


@router.get("/audit-logs/nearest-decision")
def audit_logs_nearest_decision(id_number: str, near: str) -> dict[str, Any] | None:
    return find_decision_near(id_number=id_number, near=near)


@router.get("/fraud-rejections")
def fraud_rejections(
    stage: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    return reports_repository.list_rejections(
        stage=stage,
        msisdn=msisdn,
        created_from=created_from,
        created_to=created_to,
        limit=limit,
        offset=offset,
    )


@router.get("/fraud-rejections/summary")
def fraud_rejections_summary(
    created_from: str | None = None, created_to: str | None = None
) -> dict[str, Any]:
    rules = reports_repository.rejection_summary(created_from=created_from, created_to=created_to)
    return {"rules": rules}


@router.get("/sim-swap-orders")
def sim_swap_orders(
    status: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    return reports_repository.list_sim_swap_orders(
        status=status,
        msisdn=msisdn,
        created_from=created_from,
        created_to=created_to,
        limit=limit,
        offset=offset,
    )


@router.get("/sim-swap-orders/status-summary")
def sim_swap_orders_status_summary(
    created_from: str | None = None, created_to: str | None = None
) -> dict[str, Any]:
    statuses = reports_repository.sim_swap_status_summary(
        created_from=created_from, created_to=created_to
    )
    return {"statuses": statuses}


@router.get("/sim-swap-orders/volume-by-day")
def sim_swap_orders_volume_by_day(days: int = Query(14, ge=1, le=365)) -> dict[str, Any]:
    return {"days": reports_repository.sim_swap_volume_by_day(days=days)}


@router.get("/transactions")
def transactions(
    status: str | None = None,
    msisdn: str | None = None,
    transaction_kind: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    return reports_repository.list_transactions(
        status=status,
        msisdn=msisdn,
        transaction_kind=transaction_kind,
        created_from=created_from,
        created_to=created_to,
        limit=limit,
        offset=offset,
    )


@router.get("/transactions/status-summary")
def transactions_status_summary(
    created_from: str | None = None, created_to: str | None = None
) -> dict[str, Any]:
    statuses = reports_repository.transaction_status_summary(
        created_from=created_from, created_to=created_to
    )
    return {"statuses": statuses}


@router.get("/transactions/volume-by-day")
def transactions_volume_by_day(days: int = Query(14, ge=1, le=365)) -> dict[str, Any]:
    return {"days": reports_repository.transaction_volume_by_day(days=days)}


@router.get("/transactions/{transaction_id}")
def transaction(transaction_id: str) -> dict[str, Any] | None:
    return reports_repository.get_transaction(transaction_id)
