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

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status
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
