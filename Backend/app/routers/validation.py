"""Offline structural validation of a South African ID number.

This wraps the existing `id_validation` rules unchanged. Each rule is called
defensively because some of them assume a well-formed 13-digit numeric string
and raise on shorter or non-numeric input.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from Backend.app.dependencies.security import get_correlation_id, require_biometric_read
from Backend.internal_backend.id_validation import IdValidation

router = APIRouter(prefix="/api/v1", tags=["validation"])

# Rule name -> method on id_validation. Order is the order results are reported.
RULES: tuple[tuple[str, str], ...] = (
    ("length_is_13", "is_id_length_valid"),
    ("is_numeric", "is_id_numeric"),
    ("date_of_birth_plausible", "is_first_six_digit_valid_month"),
    ("citizenship_digit_valid", "is_11th_digit_zero_or_one"),
    ("race_digit_valid", "is_12th_digit_zero_or_one"),
    ("luhn_checksum", "is_valid_luhn"),
)


class ValidationRequest(BaseModel):
    id_number: str = Field(
        ...,
        min_length=1,
        max_length=32,
        description="South African ID number, digits only",
    )


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


@router.post(
    "/validate-id",
    response_model=ValidationResponse,
    dependencies=[Depends(require_biometric_read)])
def validate_id(payload: ValidationRequest, correlation_id: str = Depends(get_correlation_id)) -> ValidationResponse:
    id_number = payload.id_number.strip()
    valid, checks, failed = run_structural_checks(id_number)

    return ValidationResponse(
        id_number_length=len(id_number),
        valid=valid,
        checks=checks,
        failed_checks=failed,
    )
