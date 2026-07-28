"""Characterisation tests for the existing id_validation rules.

These lock in current behaviour so the CI gate catches regressions. They are
deliberately not asserting what the rules *should* do — see the PR notes on
`is_12th_digit_zero_or_one`.
"""

import pytest

from Backend.internal_backend.id_validation import id_validation

# 13 digits, Luhn-valid, citizenship digit 0, 12th digit 8.
VALID_ID = "9001015001083"


class TestLength:
    def test_thirteen_digits_is_valid(self):
        assert id_validation(id=VALID_ID).is_id_length_valid() is True

    @pytest.mark.parametrize("value", ["", "123", "90010150010831"])
    def test_other_lengths_are_invalid(self, value):
        assert id_validation(id=value).is_id_length_valid() is False


class TestNumeric:
    def test_digits_only_is_numeric(self):
        assert id_validation(id=VALID_ID).is_id_numeric() is True

    @pytest.mark.parametrize("value", ["90010150010ab", "9001015001 83", ""])
    def test_non_digits_are_not_numeric(self, value):
        assert id_validation(id=value).is_id_numeric() is False


class TestDateOfBirth:
    def test_plausible_date_passes(self):
        assert id_validation(id=VALID_ID).is_first_six_digit_valid_month() is True

    @pytest.mark.parametrize(
        "value",
        [
            "9013015001083",  # month 13
            "9001325001083",  # day 32
            "9000015001083",  # month 00
        ],
    )
    def test_implausible_dates_fail(self, value):
        assert id_validation(id=value).is_first_six_digit_valid_month() is False

    def test_non_numeric_raises(self):
        """Documents current behaviour: the rule raises rather than returning False."""
        with pytest.raises(ValueError):
            id_validation(id="abcdef5001083").is_first_six_digit_valid_month()


class TestCitizenshipDigit:
    @pytest.mark.parametrize("digit", ["0", "1"])
    def test_zero_or_one_passes(self, digit):
        value = VALID_ID[:10] + digit + VALID_ID[11:]
        assert id_validation(id=value).is_11th_digit_zero_or_one() is True

    def test_other_digit_fails(self):
        value = VALID_ID[:10] + "5" + VALID_ID[11:]
        assert id_validation(id=value).is_11th_digit_zero_or_one() is False

    def test_short_id_fails_safely(self):
        assert id_validation(id="900").is_11th_digit_zero_or_one() is False


class TestTwelfthDigit:
    @pytest.mark.parametrize("digit", ["8", "9"])
    def test_eight_or_nine_passes(self, digit):
        value = VALID_ID[:11] + digit + VALID_ID[12:]
        assert id_validation(id=value).is_12th_digit_zero_or_one() is True

    def test_other_digit_fails(self):
        value = VALID_ID[:11] + "0" + VALID_ID[12:]
        assert id_validation(id=value).is_12th_digit_zero_or_one() is False


class TestLuhn:
    def test_valid_checksum(self):
        assert id_validation(id=VALID_ID).is_valid_luhn() is True

    def test_invalid_checksum(self):
        tampered = VALID_ID[:-1] + ("4" if VALID_ID[-1] != "4" else "5")
        assert id_validation(id=tampered).is_valid_luhn() is False

    def test_non_numeric_fails_safely(self):
        assert id_validation(id="abcdefghijklm").is_valid_luhn() is False
