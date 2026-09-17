# Backend/internal_backend/id_validation.py
"""
Validation rules for South African ID numbers (HT2-27).
Each rule is called defensively because some assume a well-formed 13-digit
numeric string and raise on shorter or non-numeric input.
"""


class IdValidation:
    def __init__(self, id: str):
        self.id = id
        self.id_list = list(id)

    def is_id_length_valid(self) -> bool:
        """Validate the length of an ID (must be exactly 13 digits)."""
        return len(self.id_list) == 13

    def is_id_numeric(self) -> bool:
        return self.id.isnumeric()

    def is_first_six_digit_valid_month(self) -> bool:
        """Check that YYMMDD is a plausible date of birth."""
        try:
            yy = int(self.id[:2])
            mm = int(self.id[2:4])
            dd = int(self.id[4:6])
            return (1 <= yy <= 99) and (1 <= mm <= 12) and (1 <= dd <= 31)
        except (ValueError, IndexError):
            return False

    def is_11th_digit_zero_or_one(self) -> bool:
        """11th digit: 0 = female, 1 = male (citizenship/sex digit)."""
        try:
            eleventh_digit = self.id[10]
            return eleventh_digit in ("0", "1")
        except IndexError:
            return False

    def is_12th_digit_zero_or_one(self) -> bool:
        """12th digit: historical SA ID digit (now typically 8 or 0)."""
        try:
            twelfth_digit = self.id[11]
            return twelfth_digit in ("8", "9", "0", "1")
        except IndexError:
            return False

    def is_valid_luhn(self) -> bool:
        """Validate the ID number using the Luhn checksum algorithm."""
        try:
            digits = [int(d) for d in self.id]
            total = 0
            for i, digit in enumerate(reversed(digits)):
                if i % 2 == 1:
                    digit *= 2
                    if digit > 9:
                        digit -= 9
                total += digit
            return total % 10 == 0
        except (ValueError, IndexError):
            return False


# Smoke test
if __name__ == "__main__":
    id_validator = IdValidation(id="9001015011082")
    print(f"Luhn: {id_validator.is_valid_luhn()}")
    print(f"11th digit: {id_validator.is_11th_digit_zero_or_one()}")
    print(f"12th digit: {id_validator.is_12th_digit_zero_or_one()}")
    print(f"Numeric: {id_validator.is_id_numeric()}")
    print(f"Length: {id_validator.is_id_length_valid()}")