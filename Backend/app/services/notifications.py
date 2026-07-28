"""Notifications — HT2-24 (Approval) and HT2-25 (Rejection).

Per the hackathon decision, delivery is in-app plus a log line, behind a
pluggable ``Notifier`` interface so an email or SMS channel can be added later
without changing callers. Each notification is persisted to the inbox
(``notifications`` table) so the frontend can display it and so there is an
audit trail of decisions communicated to the customer.
"""

from __future__ import annotations

import logging

from Backend.app import repository
from Backend.app.config import Settings, get_settings

logger = logging.getLogger(__name__)

APPROVAL = "approval"
REJECTION = "rejection"
# The face match provider can return "In Review", which is neither an approval
# nor a rejection — the customer is told it is still being checked.
REVIEW = "review"


class Notifier:
    channel = "base"

    def send(
        self, id_number: str, type_: str, message: str, attempt_id: str | None = None
    ) -> dict:
        raise NotImplementedError


class InAppNotifier(Notifier):
    """Records the notification to the inbox and emits a log line."""

    channel = "inapp"

    def send(
        self, id_number: str, type_: str, message: str, attempt_id: str | None = None
    ) -> dict:
        # id_number is sensitive; log only that a notification was sent, not the value.
        logger.info("Sending %s notification via %s channel", type_, self.channel)
        return repository.create_notification(
            id_number=id_number,
            type_=type_,
            channel=self.channel,
            message=message,
            attempt_id=attempt_id,
        )


def get_notifier(settings: Settings | None = None) -> Notifier:
    # Only the in-app channel exists today; the factory keeps the seam for
    # future email/SMS channels selected via configuration.
    _ = settings or get_settings()
    return InAppNotifier()


def notify_decision(
    id_number: str, outcome: str | bool, method: str, attempt_id: str | None = None
) -> dict:
    """Compose and send the notification for a decision.

    ``outcome`` accepts the status string ("approved" / "rejected" / "review")
    or a legacy boolean, so existing callers keep working.
    """
    if isinstance(outcome, bool):
        outcome = "approved" if outcome else "rejected"

    if outcome == "approved":
        message = (
            "Your identity verification was approved"
            + (" via fallback review." if method == "fallback" else ".")
        )
        return get_notifier().send(id_number, APPROVAL, message, attempt_id)

    if outcome == "review":
        message = (
            "Your identity verification needs a further check. We will let you "
            "know as soon as it is complete — no action is needed from you."
        )
        return get_notifier().send(id_number, REVIEW, message, attempt_id)

    message = (
        "Your identity verification could not be completed and was rejected. "
        "Please retry or contact support."
    )
    return get_notifier().send(id_number, REJECTION, message, attempt_id)
