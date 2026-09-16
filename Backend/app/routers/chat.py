# Backend/app/routers/chat.py
"""Fraud Assistant chat endpoint for the console's System Chatbot page.

Serves console/src/hooks/useChatbot.ts, which POSTs
{message, conversation_id?, history[]} and renders {reply, conversation_id}.

GROUNDING: every answer is derived from the same `console_queries` reads that
back /audit-logs, /fraud-intelligence and /transactions. The assistant can
therefore never contradict the page the operator is looking at, and it needs
no second data path to keep in sync.

LLM IS OPTIONAL. With OPENAI_API_KEY set, the snapshot below is handed to a
model for phrasing. Without one, the same snapshot is reported directly. The
deterministic path is the default rather than an error state on purpose: the
numbers an analyst asks for are counts and lookups over rows we already hold,
and a console that answers them offline is more useful than one that returns
502 until someone provisions a key.

This is deliberately NOT a port of the management-console branch's agent,
which reads an analytics Postgres mirror and a RAG corpus that neither exist
on this branch.
"""
from __future__ import annotations

import logging
import os
import re
import uuid
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/management", tags=["management"])

# How far back a question reaches when it does not say. Matches the
# fraud-intelligence page's default window so the two agree by default.
DEFAULT_WINDOW_DAYS = 14

# Only the last few turns are worth sending: the snapshot carries the facts,
# history only needs to carry what "it" and "that one" refer to.
MAX_HISTORY_TURNS = 8


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None
    history: list[ChatTurn] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str


# ---------------------------------------------------------------------------
# Snapshot
# ---------------------------------------------------------------------------

def _window_start(days: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=days)


def _requested_days(message: str) -> int:
    """Read a window out of the question, e.g. "last 30 days" -> 30."""
    match = re.search(r"(\d+)\s*(day|week|month)", message, re.IGNORECASE)
    if not match:
        return DEFAULT_WINDOW_DAYS

    value, unit = int(match.group(1)), match.group(2).lower()
    days = value * {"day": 1, "week": 7, "month": 30}[unit]

    # Same ceiling the management routes enforce, so the assistant cannot
    # quietly run a heavier query than the pages allow.
    return max(1, min(days, 90))


def _find_msisdn(message: str) -> str | None:
    match = re.search(r"(\+?27\d{9}|0\d{9})", message)
    return match.group(1) if match else None


def _snapshot(message: str) -> dict[str, Any]:
    """Collect the facts an answer may need, from the console's own reads.

    Each section degrades independently: a failing table yields an empty
    section and a logged warning rather than a failed request, matching how
    console_queries already treats a missing audit table.
    """
    from Backend.app.routers.management import (
        _load_audit_entries,
        _load_fraud_decisions,
        _load_sim_swap_orders,
    )

    days = _requested_days(message)
    since = _window_start(days)
    msisdn = _find_msisdn(message)

    snapshot: dict[str, Any] = {"window_days": days, "msisdn": msisdn}

    try:
        fraud = _load_fraud_decisions(since)
        counts = Counter(row["decision"] for row in fraud)
        reasons = Counter(
            reason for row in fraud for reason in (row.get("reasons") or [])
        )
        scores = [float(row["risk_score"]) for row in fraud]
        snapshot["fraud"] = {
            "total": len(fraud),
            "approved": counts.get("APPROVE", 0),
            "rejected": counts.get("REJECT", 0),
            "review": counts.get("REFER", 0),
            "mean_risk_score": round(sum(scores) / len(scores), 1) if scores else None,
            "top_reasons": reasons.most_common(5),
        }
    except Exception:
        logger.warning("chat.snapshot.fraud_failed", exc_info=True)
        snapshot["fraud"] = None

    try:
        orders = _load_sim_swap_orders(since)
        snapshot["transactions"] = {
            "total": len(orders),
            "by_status": Counter(
                str(row["status"]).lower() for row in orders
            ).most_common(),
        }
    except Exception:
        logger.warning("chat.snapshot.transactions_failed", exc_info=True)
        snapshot["transactions"] = None

    try:
        entries, _, total = _load_audit_entries(
            session_id=None,
            msisdn=msisdn,
            event_type=None,
            outcome=None,
            since=since,
            until=None,
            limit=25,
            cursor=None,
        )
        snapshot["audit"] = {
            "total": total,
            "by_event_type": Counter(
                entry.get("event_type") for entry in entries
            ).most_common(8),
            "recent": [
                {
                    "event_type": entry.get("event_type"),
                    "outcome": entry.get("outcome"),
                    "screen": entry.get("screen"),
                    "timestamp": entry.get("timestamp"),
                }
                for entry in entries[:5]
            ],
        }
    except Exception:
        logger.warning("chat.snapshot.audit_failed", exc_info=True)
        snapshot["audit"] = None

    return snapshot


# ---------------------------------------------------------------------------
# Deterministic answering
# ---------------------------------------------------------------------------

def _plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def _answer_locally(message: str, snap: dict[str, Any]) -> str:
    text = message.lower()
    days = snap["window_days"]
    window = f"the last {_plural(days, 'day')}"
    parts: list[str] = []

    wants_fraud = any(
        word in text for word in ("fraud", "risk", "reject", "decline", "approve", "refer")
    )
    wants_txn = any(
        word in text for word in ("transaction", "swap", "sim", "order", "volume")
    )
    wants_audit = any(
        word in text for word in ("audit", "log", "event", "session", "journey", "screen")
    )

    # An open question ("what's going on?") gets the fraud + transaction
    # headline, which is what the other pages lead with.
    if not (wants_fraud or wants_txn or wants_audit):
        wants_fraud = wants_txn = True

    if wants_fraud:
        fraud = snap.get("fraud")
        if not fraud:
            parts.append("Fraud decisions are unavailable — the audit table could not be read.")
        elif fraud["total"] == 0:
            parts.append(f"No fraud decisions were recorded in {window}.")
        else:
            line = (
                f"Over {window} there were {_plural(fraud['total'], 'fraud decision')}: "
                f"{fraud['approved']} approved, {fraud['review']} referred for review, "
                f"and {fraud['rejected']} rejected."
            )
            if fraud["mean_risk_score"] is not None:
                line += f" Mean risk score {fraud['mean_risk_score']}."
            parts.append(line)

            if fraud["top_reasons"]:
                reasons = ", ".join(
                    f"{reason} ({count})" for reason, count in fraud["top_reasons"]
                )
                parts.append(f"Most common reasons: {reasons}.")

    if wants_txn:
        txn = snap.get("transactions")
        if not txn:
            parts.append("SIM swap orders are unavailable — the orders table could not be read.")
        elif txn["total"] == 0:
            parts.append(f"No SIM swap orders were created in {window}.")
        else:
            breakdown = ", ".join(f"{status} {count}" for status, count in txn["by_status"])
            parts.append(
                f"{_plural(txn['total'], 'SIM swap order')} in {window} — {breakdown}."
            )

    if wants_audit:
        audit = snap.get("audit")
        if not audit:
            parts.append("Audit logs are unavailable — the audit table could not be read.")
        elif not audit["by_event_type"]:
            parts.append(f"No audit events were recorded in {window}.")
        else:
            types = ", ".join(
                f"{event_type} ({count})" for event_type, count in audit["by_event_type"]
            )
            parts.append(f"Audit events in {window}: {types}.")

            if audit["recent"]:
                latest = audit["recent"][0]
                parts.append(
                    f"Most recent: {latest['event_type']} "
                    f"({latest.get('outcome') or 'no outcome'}) at {latest['timestamp']}."
                )

    if snap.get("msisdn"):
        parts.append(f"Figures above are filtered to {snap['msisdn']} where the data supports it.")

    parts.append(
        "Ask about fraud outcomes, SIM swap transactions, or audit events — "
        "and name a window like \"last 30 days\" to widen the view."
    )

    return " ".join(parts)


# ---------------------------------------------------------------------------
# Optional LLM layer
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are the Fraud Assistant inside MTN's Biometric Trust \
management console. You answer an operator's questions about SIM swap fraud \
decisions, transactions and audit events.

Answer ONLY from the SNAPSHOT provided. It is the same data the console's \
pages render, so your answer must never contradict it. If the snapshot does \
not contain what was asked, say so plainly and name which console page would \
show it. Never invent a number, an MSISDN or a reason code.

Be concise: an operator is reading this beside a dashboard, not instead of one.
"""


async def _answer_with_llm(
    message: str,
    history: list[ChatTurn],
    snap: dict[str, Any],
) -> str | None:
    """Phrase the snapshot with an LLM. Returns None if unavailable."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.info("chat.llm.sdk_missing — falling back to deterministic answer")
        return None

    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [
        {"role": turn.role, "content": turn.content}
        for turn in history[-MAX_HISTORY_TURNS:]
    ]
    messages.append({"role": "user", "content": f"SNAPSHOT:\n{snap}\n\nQUESTION: {message}"})

    try:
        client = AsyncOpenAI(api_key=api_key)
        completion = await client.chat.completions.create(
            model=os.getenv("CHAT_MODEL", "gpt-4o-mini"),
            messages=messages,
            temperature=0.2,
            max_tokens=500,
        )
        return (completion.choices[0].message.content or "").strip() or None
    except Exception:
        # A provider outage must not take the page down when we can still
        # answer from the snapshot ourselves.
        logger.warning("chat.llm.failed — falling back to deterministic answer", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    """Answer one operator question about fraud, transactions or audit events."""
    message = payload.message.strip()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty.",
            headers={"X-Error-Code": "EMPTY_MESSAGE"},
        )

    conversation_id = payload.conversation_id or str(uuid.uuid4())
    snapshot = _snapshot(message)

    reply = await _answer_with_llm(message, payload.history, snapshot)
    if reply is None:
        reply = _answer_locally(message, snapshot)

    logger.info(
        "chat.answered conversation=%s window_days=%s llm=%s",
        conversation_id,
        snapshot["window_days"],
        reply is not None and os.getenv("OPENAI_API_KEY") is not None,
    )

    return ChatResponse(reply=reply, conversation_id=conversation_id)
