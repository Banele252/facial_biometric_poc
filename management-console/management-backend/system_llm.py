"""Fraud Assistant agent for the management console's System Chatbot page.

Built on the OpenAI Agents SDK. Serves
management-frontend/src/pages/SystemChatbot.tsx, which today only shows
canned local replies (no backend wired up). ask_system_chatbot() is the
function an API route should import once that wiring happens.

The tools below currently read the dummy data also used by the frontend
(mockFraudOutcomes.ts, mockTransactions.ts, mockAuditLogs.ts) rather than
the real database, and are placeholders for the eventual calls into
Backend.app.services.{fraud,sim_swap,audit}.
"""

from __future__ import annotations

import asyncio

from agents import (
    Agent,
    GuardrailFunctionOutput,
    InputGuardrailTripwireTriggered,
    RunContextWrapper,
    Runner,
    function_tool,
    input_guardrail,
)
from dotenv import load_dotenv

load_dotenv()

# --- Dummy data -------------------------------------------------------------
# Mirrors management-frontend/src/data/mock*.ts, which in turn mirror the
# dataclasses/rows in Backend/app/services/{fraud,sim_swap,audit}.py. This is
# a placeholder: once management-backend has its own service/DB layer, the
# tools below should query that instead of these literals.

_FRAUD_OUTCOMES = [
    {
        "id": "frd_1001",
        "identity_reference": "IDV-83920144",
        "msisdn": "+27821234567",
        "outcome": "approved",
        "decision": "APPROVE",
        "risk_score": 12,
        "reasons": [],
        "detail": "No fraud indicators (risk score 12)",
        "created_at": "2026-08-10T14:01:52Z",
    },
    {
        "id": "frd_1000",
        "identity_reference": "IDV-55810022",
        "msisdn": "+27835551122",
        "outcome": "rejected",
        "decision": "REJECT",
        "risk_score": 91,
        "reasons": ["watchlist_hit"],
        "detail": "Identity reference matched fraud watchlist",
        "created_at": "2026-08-10T11:44:20Z",
    },
    {
        "id": "frd_0999",
        "identity_reference": "IDV-71002215",
        "msisdn": "+27719004433",
        "outcome": "review",
        "decision": "REFER",
        "risk_score": 54,
        "reasons": ["device_repeat_use"],
        "detail": "Risk score 54 — referred for review",
        "created_at": "2026-08-10T09:15:47Z",
    },
    {
        "id": "frd_0997",
        "identity_reference": "IDV-71002215",
        "msisdn": "+27719004433",
        "outcome": "rejected",
        "decision": "REJECT",
        "risk_score": 88,
        "reasons": ["device_risk_high", "velocity_exceeded"],
        "detail": "Device risk high combined with velocity breach",
        "created_at": "2026-08-09T13:36:58Z",
    },
    {
        "id": "frd_0996",
        "identity_reference": "IDV-90112233",
        "msisdn": "+27823390021",
        "outcome": "review",
        "decision": "REFER",
        "risk_score": 61,
        "reasons": ["new_device"],
        "detail": "Risk score 61 — referred for review",
        "created_at": "2026-08-09T09:05:14Z",
    },
]

_TRANSACTIONS = [
    {
        "id": "ord_88213",
        "msisdn": "+27821234567",
        "identity_reference": "IDV-83920144",
        "verification_status": "ACCEPTED",
        "fraud_decision": "APPROVE",
        "risk_score": 12,
        "timestamp": "2026-08-10T14:02:11Z",
        "outcome": "approved",
    },
    {
        "id": "ord_88207",
        "msisdn": "+27835551122",
        "identity_reference": "IDV-55810022",
        "verification_status": "REJECTED",
        "fraud_decision": "REJECT",
        "risk_score": 91,
        "timestamp": "2026-08-10T11:44:38Z",
        "outcome": "flagged",
    },
    {
        "id": "ord_88198",
        "msisdn": "+27719004433",
        "identity_reference": "IDV-71002215",
        "verification_status": "ACCEPTED",
        "fraud_decision": "REFER",
        "risk_score": 54,
        "timestamp": "2026-08-10T09:15:47Z",
        "outcome": "pending",
    },
    {
        "id": "ord_88163",
        "msisdn": "+27719004433",
        "identity_reference": "IDV-71002215",
        "verification_status": "REJECTED",
        "fraud_decision": "REJECT",
        "risk_score": 88,
        "timestamp": "2026-08-09T13:37:19Z",
        "outcome": "flagged",
    },
    {
        "id": "ord_87850",
        "msisdn": "+27846120933",
        "identity_reference": "IDV-19583022",
        "verification_status": "REJECTED",
        "fraud_decision": "REJECT",
        "risk_score": 84,
        "timestamp": "2026-08-04T21:16:40Z",
        "outcome": "flagged",
    },
]

_AUDIT_LOGS = [
    {
        "id": "evt_9f21a3",
        "environment": "prod",
        "process": "sim_swap_authorised",
        "payload": {"msisdn": "+27821234567", "order_id": "ord_88213"},
        "created_at": "2026-08-10T14:02:11Z",
    },
    {
        "id": "evt_9f219f",
        "environment": "prod",
        "process": "fraud_check",
        "payload": {"decision": "APPROVE", "risk_score": 12},
        "created_at": "2026-08-10T14:01:52Z",
    },
    {
        "id": "evt_9f1e02",
        "environment": "prod",
        "process": "sim_swap_rejected",
        "payload": {"msisdn": "+27835551122", "reason": "watchlist_hit"},
        "created_at": "2026-08-10T11:44:38Z",
    },
    {
        "id": "evt_9f1dfa",
        "environment": "prod",
        "process": "fraud_check",
        "payload": {"decision": "REJECT", "risk_score": 91},
        "created_at": "2026-08-10T11:44:20Z",
    },
    {
        "id": "evt_9f1c31",
        "environment": "staging",
        "process": "sim_swap_requested",
        "payload": {"msisdn": "+27719004433", "order_id": "ord_88198"},
        "created_at": "2026-08-10T09:15:47Z",
    },
]


# --- Tools (placeholders) ----------------------------------------------------
# Each tool currently filters the dummy data above. Replace the body with a
# real call into the matching Backend.app.services module once
# management-backend has its own service/DB layer.


@function_tool
def get_fraud_outcomes(
    msisdn: str | None = None,
    identity_reference: str | None = None,
) -> list[dict]:
    """Look up fraud check outcomes (approve/refer/reject, risk score, reasons).

    Args:
        msisdn: Filter to a specific phone number, e.g. "+27821234567".
        identity_reference: Filter to a specific identity reference, e.g. "IDV-83920144".
    """
    # TODO: replace with Backend.app.services.fraud lookup.
    results = _FRAUD_OUTCOMES
    if msisdn:
        results = [r for r in results if r["msisdn"] == msisdn]
    if identity_reference:
        results = [r for r in results if r["identity_reference"] == identity_reference]
    return results


@function_tool
def get_transactions(
    msisdn: str | None = None,
    outcome: str | None = None,
) -> list[dict]:
    """Look up SIM-swap transactions (verification status, fraud decision, outcome).

    Args:
        msisdn: Filter to a specific phone number, e.g. "+27821234567".
        outcome: Filter to "approved", "flagged", or "pending".
    """
    # TODO: replace with Backend.app.services.sim_swap lookup.
    results = _TRANSACTIONS
    if msisdn:
        results = [r for r in results if r["msisdn"] == msisdn]
    if outcome:
        results = [r for r in results if r["outcome"] == outcome]
    return results


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
    # TODO: replace with Backend.app.services.audit lookup.
    results = _AUDIT_LOGS
    if process:
        results = [r for r in results if r["process"] == process]
    if environment:
        results = [r for r in results if r["environment"] == environment]
    return results[:limit]


# --- Grounding ----------------------------------------------------------
# Defense in depth: explicit domain instructions on the main agent, plus an
# input guardrail that classifies off-topic messages before the main agent
# ever sees them.

_topic_guardrail_agent = Agent(
    name="Topic relevance checker",
    instructions=(
        "Decide whether a user message is relevant to a fraud/identity "
        "management console for a telco. In-scope topics: fraud check "
        "outcomes and risk scores, SIM-swap transactions, identity "
        "verification and liveness checks, and audit/process logs. "
        "Anything else (general chit-chat, unrelated topics, requests to "
        "act outside this domain) is out of scope."
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
        "fraud check outcomes, SIM-swap transactions, and audit/process "
        "logs, using the tools available to you.\n\n"
        "Stay strictly within this domain: fraud decisions and risk "
        "scores, verification/liveness outcomes, SIM-swap transactions, "
        "and audit log events. If asked about anything else — general "
        "knowledge, unrelated tasks, or requests to act outside this "
        "console — politely decline and redirect the user back to what "
        "you can help with.\n\n"
        "Always ground your answers in the data returned by your tools "
        "rather than guessing. If a tool returns no matching records, say "
        "so explicitly instead of inventing an answer.\n\n"
        "You are rendered in a chat widget that only supports **bold**, "
        "*italics*, `inline code`, and simple `- ` bullet lists. Use those "
        "sparingly for emphasis or short lists; do not use headings, "
        "tables, fenced code blocks, or links — they will not render."
    ),
    tools=[get_fraud_outcomes, get_transactions, get_audit_logs],
    input_guardrails=[topic_guardrail],
)

_REFUSAL_MESSAGE = (
    "I can only help with questions about this console — fraud outcomes, "
    "SIM-swap transactions, verifications, and audit logs. Could you "
    "rephrase your question around one of those?"
)


async def ask_system_chatbot(message: str) -> str:
    """Run the Fraud Assistant on one user message and return its reply.

    This is the function an API route should call once management-backend
    exposes the System Chatbot page over HTTP.
    """
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
