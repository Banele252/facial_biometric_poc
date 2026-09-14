"""Analytics read API.

Serves the management console's three data asks over the analytics Postgres
that Backend/analytics_sync mirrors from production - the console can't
connect to Postgres directly (that means shipping DB credentials to a
browser), so this is the HTTP layer in between, same pattern as every other
Backend/*_service in this repo.

Run locally with (from this directory):
    uv run uvicorn main:app --reload

Then open http://127.0.0.1:8000/docs for interactive Swagger docs.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Query

from Backend.analytics_api.activity_logs import list_activity_logs
from Backend.analytics_api.db import db_conn
from Backend.analytics_api.fraud_rules import list_rejections, rules_triggered_summary
from Backend.analytics_api.ops_indicators import get_ops_indicators

load_dotenv()

# Routes live on a router so this can either run standalone or be mounted
# into the main application - same convention as Backend/rica_service/main.py.
router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])

app = FastAPI(title="Analytics Read API", version="0.1.0")

Conn = Annotated[Any, Depends(db_conn)]


@router.get("/activity-logs")
async def activity_logs(
    conn: Conn,
    service: str | None = None,
    status_code: int | None = None,
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """API logs for performed activities, filterable by service/status/date."""
    return list_activity_logs(
        conn,
        service=service,
        status_code=status_code,
        occurred_from=occurred_from,
        occurred_to=occurred_to,
        limit=limit,
        offset=offset,
    )


_ISO_DATE_DESC = "ISO-8601, e.g. 2026-08-01T00:00:00+00:00"


@router.get("/fraud-rules/rejections")
async def fraud_rule_rejections(
    conn: Conn,
    stage: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = Query(default=None, description=_ISO_DATE_DESC),
    created_to: str | None = Query(default=None, description=_ISO_DATE_DESC),
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """Individual rejection records - which rule fired, for which request."""
    return list_rejections(
        conn,
        stage=stage,
        msisdn=msisdn,
        created_from=created_from,
        created_to=created_to,
        limit=limit,
        offset=offset,
    )


@router.get("/fraud-rules/summary")
async def fraud_rule_summary(
    conn: Conn,
    created_from: str | None = Query(default=None, description=_ISO_DATE_DESC),
    created_to: str | None = Query(default=None, description=_ISO_DATE_DESC),
) -> dict[str, Any]:
    """The rules used: each (stage, reason) pair that fired, ranked by count."""
    rules = rules_triggered_summary(conn, created_from=created_from, created_to=created_to)
    return {"rules": rules}


@router.get("/ops/indicators")
async def ops_indicators(conn: Conn) -> dict[str, Any]:
    """Ops-relevant system performance indicators - traffic, error rate,
    outcome breakdowns, and analytics-pipeline freshness."""
    return get_ops_indicators(conn)


app.include_router(router)


# Standalone only — the Dockerfile healthcheck hits this. When mounted into the
# main application it is not registered; that app has its own /healthz.
@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
