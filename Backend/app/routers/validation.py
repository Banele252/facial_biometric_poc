"""Offline structural validation of a South African ID number.
Wraps the existing `id_validation` rules. Each rule is called defensively
because some assume a well-formed 13-digit numeric string.
"""
import hashlib
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from Backend.app.dependencies.security import (
    get_correlation_id,
    get_current_user,
    require_biometric_read,
)
from Backend.internal_backend.id_validation import IdValidation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["validation"])

RULES: tuple[tuple[str, str], ...] = (
    ("length_is_13", "is_id_length_valid"),
    ("is_numeric", "is_id_numeric"),
    ("date_of_birth_plausible", "is_first_six_digit_valid_month"),
    ("citizenship_digit_valid", "is_11th_digit_zero_or_one"),
    ("race_digit_valid", "is_12th_digit_zero_or_one"),
    ("luhn_checksum", "is_valid_luhn"),
)


class ValidationRequest(BaseModel):
    id_number: str = Field(..., min_length=1, max_length=32, description="South African ID number, digits only")


class ValidationResponse(BaseModel):
    id_number_length: int
    valid: bool
    checks: dict[str, bool]
    failed_checks: list[str]


def _run_rule(validator: IdValidation, method_name: str) -> bool:
    """Call a rule, treating a raised exception as a failed check."""
    try:
        return bool(getattr(validator, method_name)())
    except (ValueError, IndexError, TypeError):
        return False


def run_structural_checks(id_number: str) -> tuple[bool, dict[str, bool], list[str]]:
    """Run every structural rule for an ID number."""
    validator = IdValidation(id=id_number)
    checks = {name: _run_rule(validator, method) for name, method in RULES}
    failed = [name for name, passed in checks.items() if not passed]
    return (not failed), checks, failed


def _hash_id(id_number: str) -> str:
    """Hash ID number for logging without exposing PII."""
    return hashlib.sha256(id_number.encode()).hexdigest()[:12]


@router.post(
    "/validate-id",
    response_model=ValidationResponse,
    dependencies=[Depends(require_biometric_read)],
)
def validate_id(
        request: Request,
        payload: ValidationRequest,
        user: Annotated[dict, Depends(get_current_user)],
        correlation_id: Annotated[str, Depends(get_correlation_id)],
) -> ValidationResponse:
    """Validate the structural integrity of a South African ID number."""
    id_number = payload.id_number.strip()
    user_ref = user.get("sub", "anonymous")
    id_hash = _hash_id(id_number)

    logger.info(
        "validation.id.start correlation=%s user=%s id_hash=%s length=%d",
        correlation_id, user_ref, id_hash, len(id_number)
    )

    valid, checks, failed = run_structural_checks(id_number)

    logger.info(
        "validation.id.complete correlation=%s user=%s valid=%s failed_checks=%s",
        correlation_id, user_ref, valid, failed
    )

    return ValidationResponse(
        id_number_length=len(id_number),
        valid=valid,
        checks=checks,
        failed_checks=failed,
    )