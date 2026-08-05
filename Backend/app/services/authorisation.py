"""Authorisation tokens — the "Generate Authorisation token" step.

The process diagram does not go straight from a passing identity chain to
processing the SIM swap. It issues an authorisation token first, and the swap
is processed against that token. The distinction matters: the step that
actually changes a customer's SIM presents evidence that every check passed,
rather than trusting whatever called it to have run them.

Tokens are single-use and short-lived. A token that has expired or has already
been consumed is not an authorisation, and ``consume`` says so rather than
raising — the caller turns that into a rejection like any other failed check.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from Backend.app import repository

logger = logging.getLogger(__name__)

# Long enough to cover the rest of one journey, short enough that a leaked
# token is worthless by the time anyone finds it. The swap is processed
# immediately after issue, so this is slack, not a working window.
TOKEN_TTL_SECONDS = 300


@dataclass(frozen=True)
class AuthorisationToken:
    token: str
    id_number: str
    transaction: str
    expires_at: str


@dataclass(frozen=True)
class TokenCheck:
    valid: bool
    detail: str


def issue(
    id_number: str,
    transaction: str,
    msisdn: str | None = None,
    attempt_reference: str | None = None,
) -> AuthorisationToken:
    """Issue an authorisation token for a journey that passed every check."""
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(UTC) + timedelta(seconds=TOKEN_TTL_SECONDS)).isoformat()

    repository.create_authorisation_token(
        token=token,
        id_number=id_number,
        transaction=transaction,
        expires_at=expires_at,
        msisdn=msisdn,
        attempt_reference=attempt_reference,
    )
    # The token itself never goes to the log — that would defeat the point of
    # it being a credential.
    logger.info(
        "Authorisation token issued for %s transaction, expires %s", transaction, expires_at
    )
    return AuthorisationToken(
        token=token, id_number=id_number, transaction=transaction, expires_at=expires_at
    )


def consume(token: str, id_number: str, transaction: str) -> TokenCheck:
    """Spend a token, or explain why it is not spendable.

    Checks that it exists, has not been used, has not expired, and was issued
    for this identity and this transaction — a token for a number port is not
    an authorisation to swap a SIM.
    """
    record = repository.get_authorisation_token(token)
    if record is None:
        return TokenCheck(valid=False, detail="Authorisation token not recognised")
    if record["consumed_at"]:
        return TokenCheck(valid=False, detail="Authorisation token has already been used")
    if record["id_number"] != id_number:
        return TokenCheck(valid=False, detail="Authorisation token was issued to another identity")
    if record["transaction_kind"] != transaction:
        return TokenCheck(
            valid=False, detail="Authorisation token was issued for a different transaction"
        )

    expires_at = datetime.fromisoformat(record["expires_at"])
    if expires_at <= datetime.now(UTC):
        return TokenCheck(valid=False, detail="Authorisation token has expired")

    repository.mark_token_consumed(token)
    return TokenCheck(valid=True, detail="Authorisation token accepted")
