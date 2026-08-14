"""Management console API — currently just the System Chatbot endpoint.

Backed by the Fraud Assistant agent in system_llm.py.

Run locally with (from this directory):
    uv run uvicorn main:app --reload --port 8001

Then open http://127.0.0.1:8001/docs for interactive Swagger docs. The
management-frontend Vite dev server (port 5174) proxies /api here — see
management-frontend/vite.config.ts.

In the container image (management-console/Dockerfile), the built frontend
bundle is served from this same process instead — see _mount_frontend()
below, which mirrors Backend/app/main.py's approach.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Annotated, Any

import psycopg
from analytical_db import (
    db_conn,
    fraud_rejections_summary,
    get_connection,
    list_fraud_rejections,
    list_process_logs,
    list_sim_swap_orders,
    list_transactions,
    sim_swap_status_summary,
    sim_swap_volume_by_day,
    transaction_status_summary,
    transaction_volume_by_day,
)
from auth import authenticate_user, ensure_users_table
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
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


@app.on_event("startup")
def _ensure_users_table() -> None:
    """Runs once at process startup, outside any request - uses its own
    connection rather than the per-request `db_conn` dependency."""
    conn = get_connection()
    try:
        ensure_users_table(conn)
    finally:
        conn.close()


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


@analytics_router.get("/transactions")
async def transactions(
    conn: Conn,
    status: str | None = None,
    msisdn: str | None = None,
    transaction_kind: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    try:
        return list_transactions(
            conn,
            status=status,
            msisdn=msisdn,
            transaction_kind=transaction_kind,
            created_from=created_from,
            created_to=created_to,
            limit=limit,
            offset=offset,
        )
    except psycopg.Error as exc:
        raise _analytics_db_error(exc) from exc


@analytics_router.get("/transactions/status-summary")
async def transactions_status_summary(
    conn: Conn,
    created_from: str | None = None,
    created_to: str | None = None,
) -> dict[str, Any]:
    try:
        statuses = transaction_status_summary(conn, created_from=created_from, created_to=created_to)
    except psycopg.Error as exc:
        raise _analytics_db_error(exc) from exc
    return {"statuses": statuses}


@analytics_router.get("/transactions/volume-by-day")
async def transactions_volume_by_day(conn: Conn, days: int = 14) -> dict[str, Any]:
    try:
        rows = transaction_volume_by_day(conn, days=days)
    except psycopg.Error as exc:
        raise _analytics_db_error(exc) from exc
    return {"days": rows}


app.include_router(analytics_router)


# --- Auth ------------------------------------------------------------------
# Plaintext credential check against the `users` table - see auth.py.

auth_router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


@auth_router.post("/login")
async def login(payload: LoginRequest, conn: Conn) -> dict[str, Any]:
    try:
        user = authenticate_user(conn, payload.username, payload.password)
    except psycopg.Error as exc:
        raise _analytics_db_error(exc) from exc
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    return user


app.include_router(auth_router)


# --- Frontend (container image only) ---------------------------------------


def _mount_frontend() -> None:
    """Serve the built SPA if a bundle is present.

    Absent during local API-only development (`uv run uvicorn ...`); present
    in the container image, where the node build stage writes it to
    STATIC_DIR. Mirrors Backend/app/main.py's approach.
    """
    static_dir = Path(os.getenv("STATIC_DIR", "static"))
    index_file = static_dir / "index.html"
    if not index_file.is_file():
        logger.info("No frontend bundle at %s - serving API only", static_dir)
        return

    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> FileResponse:
        """Return index.html for client-side routes.

        API routes are registered above and match first, so they are unaffected.
        """
        if full_path:
            candidate = (static_dir / full_path).resolve()
            # Reject traversal outside the bundle (e.g. ../../etc/passwd).
            if candidate.is_file() and candidate.is_relative_to(static_dir.resolve()):
                return FileResponse(candidate)
        return FileResponse(index_file)


_mount_frontend()
