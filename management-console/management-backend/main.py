"""Management console API — currently just the System Chatbot endpoint.

Backed by the Fraud Assistant agent in system_llm.py.

Run locally with (from this directory):
    uv run uvicorn main:app --reload --port 8001

Then open http://127.0.0.1:8001/docs for interactive Swagger docs. The
management-frontend Vite dev server (port 5174) proxies /api here — see
management-frontend/vite.config.ts.
"""

from __future__ import annotations

import logging
import os
from typing import Annotated, Any

import psycopg
from analytical_db import (
    db_conn,
    fraud_rejections_summary,
    list_fraud_rejections,
    list_process_logs,
    list_sim_swap_orders,
    sim_swap_status_summary,
    sim_swap_volume_by_day,
)
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from system_llm import ask_system_chatbot

load_dotenv()

logger = logging.getLogger(__name__)

app = FastAPI(title="Management Console API", version="0.1.0")

# Separate from Backend/app's CORS_ALLOW_ORIGINS so the two APIs can allow
# their own frontends' dev-server ports (5173 vs 5174) independently.
_cors_raw = os.getenv("MANAGEMENT_CORS_ALLOW_ORIGINS", "http://localhost:5174")
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]

if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    reply: str


@app.post("/api/v1/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    """Send one message to the Fraud Assistant and return its reply."""
    try:
        reply = await ask_system_chatbot(payload.message.strip())
    except Exception as exc:
        logger.error("Fraud Assistant run failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Fraud Assistant is currently unavailable",
        ) from exc
    return ChatResponse(reply=reply)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# --- Analytics -----------------------------------------------------------
# Reads from the analytics Postgres DB via analytical_db.py. Same DB
# Backend/analytics_api reads from; mirrors its route conventions.

analytics_router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])
Conn = Annotated[Any, Depends(db_conn)]


def _analytics_db_error(exc: Exception) -> HTTPException:
    logger.error("Analytics DB query failed: %s", exc)
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Analytics database is currently unavailable",
    )


@analytics_router.get("/audit-logs")
async def audit_logs(
    conn: Conn,
    process: str | None = None,
    environment: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    try:
        return list_process_logs(
            conn,
            process=process,
            environment=environment,
            created_from=created_from,
            created_to=created_to,
            limit=limit,
            offset=offset,
        )
    except psycopg.Error as exc:
        raise _analytics_db_error(exc) from exc


@analytics_router.get("/fraud-rejections")
async def fraud_rejections(
    conn: Conn,
    stage: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    try:
        return list_fraud_rejections(
            conn,
            stage=stage,
            msisdn=msisdn,
            created_from=created_from,
            created_to=created_to,
            limit=limit,
            offset=offset,
        )
    except psycopg.Error as exc:
        raise _analytics_db_error(exc) from exc


@analytics_router.get("/fraud-rejections/summary")
async def fraud_rejections_summary_route(
    conn: Conn,
    created_from: str | None = None,
    created_to: str | None = None,
) -> dict[str, Any]:
    try:
        rules = fraud_rejections_summary(conn, created_from=created_from, created_to=created_to)
    except psycopg.Error as exc:
        raise _analytics_db_error(exc) from exc
    return {"rules": rules}


@analytics_router.get("/sim-swap-orders")
async def sim_swap_orders(
    conn: Conn,
    status: str | None = None,
    msisdn: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    try:
        return list_sim_swap_orders(
            conn,
            status=status,
            msisdn=msisdn,
            created_from=created_from,
            created_to=created_to,
            limit=limit,
            offset=offset,
        )
    except psycopg.Error as exc:
        raise _analytics_db_error(exc) from exc


@analytics_router.get("/sim-swap-orders/status-summary")
async def sim_swap_orders_status_summary(
    conn: Conn,
    created_from: str | None = None,
    created_to: str | None = None,
) -> dict[str, Any]:
    try:
        statuses = sim_swap_status_summary(
            conn, created_from=created_from, created_to=created_to
        )
    except psycopg.Error as exc:
        raise _analytics_db_error(exc) from exc
    return {"statuses": statuses}


@analytics_router.get("/sim-swap-orders/volume-by-day")
async def sim_swap_orders_volume_by_day(conn: Conn, days: int = 14) -> dict[str, Any]:
    try:
        rows = sim_swap_volume_by_day(conn, days=days)
    except psycopg.Error as exc:
        raise _analytics_db_error(exc) from exc
    return {"days": rows}


app.include_router(analytics_router)
