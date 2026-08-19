"""Report-writing agent for the per-transaction "Trust Platform activity
report" PDF.

Built on the OpenAI Agents SDK, same conventions as system_llm.py's Fraud
Assistant - no tools, since report_data.py gathers all context
deterministically beforehand and inlines it into one prompt; that is
simpler and more reliable than a tool-calling loop for a one-shot report.
"""

from __future__ import annotations

import logging

from agents import Agent, Runner
from pydantic import BaseModel
from report_data import ReportContext

logger = logging.getLogger(__name__)


class ReportNarrative(BaseModel):
    executive_summary: str
    process_narrative: str
    conclusion: str


report_writer = Agent(
    name="Trust Platform Report Writer",
    instructions=(
        "You write formal audit-report prose for a per-transaction "
        "'Trust Platform activity report' PDF, for a facial-biometric "
        "identity-verification and telecom SIM-swap/number-port system. "
        "Write plain prose only - no Markdown, no bullet characters, no "
        "headings - this text goes directly into a PDF layout.\n\n"
        "You will be given: (1) process/system documentation excerpts "
        "describing what the relevant checks actually do, (2) the "
        "transaction's own fields, and (3) either a list of checks that "
        "ran for this identity's verification journey (each with a name, "
        "status, and detail) or an explicit note that no journey history "
        "could be correlated to this transaction.\n\n"
        "Write three sections:\n"
        "executive_summary: 2-4 sentences introducing what this system "
        "does, grounded strictly in the supplied documentation - do not "
        "invent capabilities it does not describe.\n"
        "process_narrative: clearly state, by name, which checks "
        "completed (and their outcome - passed, failed, flagged for "
        "review, or skipped) and which did not run at all. Be specific "
        "and factual; do not summarise vaguely.\n"
        "conclusion: explicitly state whether the identity associated "
        "with this transaction completed all checks. If not, name "
        "exactly which checks did not complete (were not run, or did not "
        "pass). If no process history could be correlated to this "
        "transaction at all, say so plainly and state that process-check "
        "data is not available on record for this transaction - do not "
        "invent or assume any checks occurred."
    ),
    output_type=ReportNarrative,
)


def _build_prompt(context: ReportContext) -> str:
    txn = context.transaction
    lines = ["Process/system documentation:"]
    for doc in context.process_docs:
        lines.append(f"- {doc['title']}: {doc['content']}")

    lines.append("")
    lines.append("Transaction:")
    lines.append(f"- id: {txn['id']}")
    lines.append(f"- id_number: {txn['id_number']}")
    lines.append(f"- msisdn: {txn['msisdn']}")
    lines.append(f"- transaction_kind: {txn['transaction_kind']}")
    lines.append(f"- status: {txn['status']}")
    lines.append(f"- reason: {txn['reason']}")
    lines.append(f"- created_at: {txn['created_at']}")

    lines.append("")
    if not context.correlation_found:
        lines.append(
            "No verification-journey history could be correlated to this "
            "transaction's identity number within a sensible time window."
        )
    else:
        lines.append(f"Overall verification decision: {context.decision_status}")
        lines.append(f"Decision reason: {context.decision_reason}")
        lines.append("Checks that ran, in order:")
        for check in context.checks:
            lines.append(
                f"- name={check.get('name')}, label={check.get('label')}, "
                f"status={check.get('status')}, detail={check.get('detail')}"
            )
    return "\n".join(lines)


def _fallback_narrative(context: ReportContext) -> ReportNarrative:
    """Deterministic, LLM-free narrative used if the agent call fails, so
    report generation never breaks the download (same "must not break the
    flow" principle as Backend/app/services/audit.py's record_event)."""
    if not context.correlation_found:
        conclusion = (
            "No process-check history is available on record for this "
            "transaction; completion status cannot be determined."
        )
        process_narrative = "No process-check history is available on record for this transaction."
    else:
        not_completed = [
            c.get("label", c.get("name", "unknown"))
            for c in context.checks
            if c.get("status") in ("fail", "skipped", "review")
        ]
        conclusion = (
            "All checks were completed successfully for this identity."
            if not not_completed
            else "The following checks were not completed: " + ", ".join(not_completed) + "."
        )
        process_narrative = "\n".join(
            f"{c.get('label', c.get('name'))}: {c.get('status')} - {c.get('detail')}"
            for c in context.checks
        )

    return ReportNarrative(
        executive_summary=(
            "This report summarises the verification and transaction "
            "activity recorded for this identity on the Trust Platform."
        ),
        process_narrative=process_narrative,
        conclusion=conclusion,
    )


async def generate_report_narrative(context: ReportContext) -> ReportNarrative:
    prompt = _build_prompt(context)
    try:
        result = await Runner.run(report_writer, prompt)
        return result.final_output
    except Exception as exc:  # pragma: no cover - must not break the download
        logger.warning("Report narrative generation failed, using fallback: %s", exc)
        return _fallback_narrative(context)
