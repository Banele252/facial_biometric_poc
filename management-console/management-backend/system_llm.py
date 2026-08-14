"""Fraud Assistant agent for the management console's System Chatbot page.

Built on the OpenAI Agents SDK. Serves
management-frontend/src/pages/SystemChatbot.tsx via main.py's /api/v1/chat
route, which imports ask_system_chatbot() below.

The tools below query analytical_db.py, which reads the real analytics
Postgres DB (mirrored from production by Backend/analytics_sync).
"""

from __future__ import annotations

import asyncio
import logging

from agents import (
    Agent,
    GuardrailFunctionOutput,
    InputGuardrailTripwireTriggered,
    RunContextWrapper,
    Runner,
    function_tool,
    input_guardrail,
)
from analytical_db import (
    get_connection,
    list_fraud_rejections,
    list_process_logs,
    list_sim_swap_orders,
    list_transactions,
)
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


# --- Tools ------------------------------------------------------------
# Each tool opens its own short-lived connection and queries the analytics
# DB directly. A query failure logs a warning and returns an empty list
# rather than raising, so the agent reports "no matching records" instead
# of failing the whole /api/v1/chat request.


@function_tool
def get_fraud_rejections(
    stage: str | None = None,
    msisdn: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """Look up fraud-rule rejections - which check (stage) rejected a request and why (reason).

    Args:
        stage: Filter to a specific check stage, e.g. "consent" or "document_face".
        msisdn: Filter to a specific phone number, e.g. "+27821234567".
        limit: Maximum number of records to return, most recent first.
    """
    try:
        conn = get_connection()
        try:
            return list_fraud_rejections(conn, stage=stage, msisdn=msisdn, limit=min(limit, 50))[
                "items"
            ]
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("get_fraud_rejections query failed: %s", exc)
        return []


@function_tool
def get_sim_swap_transactions(
    msisdn: str | None = None,
    status: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """Look up SIM-swap orders.

    Args:
        msisdn: Filter to a specific phone number, e.g. "+27821234567".
        status: Filter to a specific order status: "CREATED", "ACTIVATED", or "REJECTED".
        limit: Maximum number of records to return, most recent first.
    """
    try:
        conn = get_connection()
        try:
            return list_sim_swap_orders(conn, msisdn=msisdn, status=status, limit=min(limit, 50))[
                "items"
            ]
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("get_sim_swap_transactions query failed: %s", exc)
        return []


@function_tool
def get_transactions(
    msisdn: str | None = None,
    status: str | None = None,
    transaction_kind: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """Look up transactions - broader than SIM-swap orders, covering every
    transaction_kind (e.g. "sim_swap", "port_request").

    Args:
        msisdn: Filter to a specific phone number, e.g. "+27821234567".
        status: Filter to a specific transaction status, e.g. "pending".
        transaction_kind: Filter to a specific kind, e.g. "sim_swap" or "port_request".
        limit: Maximum number of records to return, most recent first.
    """
    try:
        conn = get_connection()
        try:
            return list_transactions(
                conn,
                msisdn=msisdn,
                status=status,
                transaction_kind=transaction_kind,
                limit=min(limit, 50),
            )["items"]
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("get_transactions query failed: %s", exc)
        return []


@function_tool
def get_audit_logs(
    process: str | None = None,
    environment: str | None = None,
    limit: int = 10,
) -> list[dict]:
    """Look up audit/process log events (identity validation, liveness, fraud, SIM swap).

    Args:
        process: Filter to one process, e.g. "fraud_check" or "sim_swap_authorised".
        environment: Filter to "dev", "staging", or "prod".
        limit: Maximum number of entries to return, most recent first.
    """
    try:
        conn = get_connection()
        try:
            return list_process_logs(
                conn, process=process, environment=environment, limit=min(limit, 50)
            )["items"]
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("get_audit_logs query failed: %s", exc)
        return []


# --- Grounding ----------------------------------------------------------
# Defense in depth: explicit domain instructions on the main agent, plus an
# input guardrail that classifies off-topic messages before the main agent
# ever sees them.

_topic_guardrail_agent = Agent(
    name="Topic relevance checker",
    instructions=(
        "Decide whether a user message is relevant to a fraud/identity "
        "management console for a telco. In-scope topics: fraud-rule "
        "rejections, transactions (including SIM-swap orders), identity "
        "verification and liveness checks, and audit/process logs. Anything "
        "else (general chit-chat, unrelated topics, requests to act outside "
        "this domain) is out of scope."
    ),
    output_type=bool,
)


@input_guardrail
async def topic_guardrail(
    ctx: RunContextWrapper[None],
    agent: Agent,
    input: str | list,
) -> GuardrailFunctionOutput:
    result = await Runner.run(_topic_guardrail_agent, input, context=ctx.context)
    is_off_topic = result.final_output is False
    return GuardrailFunctionOutput(
        output_info=result.final_output,
        tripwire_triggered=is_off_topic,
    )


fraud_assistant = Agent(
    name="Fraud Assistant",
    instructions=(
        "You are the Fraud Assistant for this facial-biometric identity "
        "and fraud management console. You help operators understand "
        "fraud-rule rejections, transactions (SIM-swap orders and other "
        "transaction kinds), and audit/process logs, using the tools "
        "available to you.\n\n"
        "Stay strictly within this domain: fraud-rule rejections (stage "
        "and reason), verification/liveness outcomes, transactions "
        "(SIM-swap orders and other transaction kinds), and audit log "
        "events. If asked about anything else — general knowledge, "
        "unrelated tasks, or requests to act outside this console — "
        "politely decline and redirect the user back to what you can "
        "help with.\n\n"
        "Always ground your answers in the data returned by your tools "
        "rather than guessing. If a tool returns no matching records, say "
        "so explicitly instead of inventing an answer.\n\n"
        "You are rendered in a chat widget that only supports **bold**, "
        "*italics*, `inline code`, and simple `- ` bullet lists. Use those "
        "sparingly for emphasis or short lists; do not use headings, "
        "tables, fenced code blocks, or links — they will not render."
    ),
    tools=[get_fraud_rejections, get_sim_swap_transactions, get_transactions, get_audit_logs],
    input_guardrails=[topic_guardrail],
)

_REFUSAL_MESSAGE = (
    "I can only help with questions about this console — fraud-rule "
    "rejections, transactions, verifications, and audit logs. "
    "Could you rephrase your question around one of those?"
)


async def ask_system_chatbot(message: str) -> str:
    """Run the Fraud Assistant on one user message and return its reply."""
    try:
        result = await Runner.run(fraud_assistant, message)
    except InputGuardrailTripwireTriggered:
        return _REFUSAL_MESSAGE
    return result.final_output


async def _main() -> None:
    print("Fraud Assistant — type a question (Ctrl+C to exit).")
    while True:
        try:
            message = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not message:
            continue
        reply = await ask_system_chatbot(message)
        print(reply)


if __name__ == "__main__":
    asyncio.run(_main())
