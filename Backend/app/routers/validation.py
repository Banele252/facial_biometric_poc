"""Offline structural validation of a South African ID number.

This wraps the existing `id_validation` rules unchanged. Each rule is called
defensively because some of them assume a well-formed 13-digit numeric string
and raise on shorter or non-numeric input.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from Backend.internal_backend.id_validation import id_validation

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


def _run_rule(validator: id_validation, method_name: str) -> bool:
    """Call a rule, treating a raised exception as a failed check.

    Rules such as `is_first_six_digit_valid_month` call int() on slices of the
    ID and raise ValueError on malformed input rather than returning False.
    """
    try:
        return bool(getattr(validator, method_name)())
    except (ValueError, IndexError, TypeError):
        return False


@router.post("/validate-id", response_model=ValidationResponse)
def validate_id(payload: ValidationRequest) -> ValidationResponse:
    id_number = payload.id_number.strip()
    validator = id_validation(id=id_number)

    checks = {name: _run_rule(validator, method) for name, method in RULES}
    failed = [name for name, passed in checks.items() if not passed]

    return ValidationResponse(
        id_number_length=len(id_number),
        valid=not failed,
        checks=checks,
        failed_checks=failed,
    )
