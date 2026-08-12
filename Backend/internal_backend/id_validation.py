# Bulding a validation rule script
# Objective: To build a validation script based on the rules listed on the subtask: HT2-27


class IdValidation:
    def __init__(self, id: str):
        self.id = id
        self.id_list = list(id)

    def is_id_length_valid(self) -> bool:
        """
        validate the lenght of an id

        Args:
            self.id_list: The ID number is a list, where each digit represents an element in the list

        Returns:

            True if the digit length is 13 else fales.
        """
        if len(self.id_list) == 13:
            return True
        else:
            return False

    def is_id_numeric(self) -> bool:
        return self.id.isnumeric()

    def is_first_six_digit_valid_month(self) -> bool:
        yy = int(self.id[:2])
        mm = int(self.id[2:4])
        dd = int(self.id[4:6])
        if (yy >= 1 and yy <= 99) and (mm >= 1 and mm <= 12) and (dd >= 1 and dd <= 31):
            return True
        else:
            return False

    def is_11th_digit_zero_or_one(self) -> bool:
        try:
            eleventh_digit = self.id[10]
            if eleventh_digit == "0" or eleventh_digit == "1":
                return True
            else:
                return False
        except Exception:
            return False

    def is_12th_digit_zero_or_one(self) -> bool:
        try:
            twelenth_digit = self.id[11]
            if twelenth_digit == "8" or twelenth_digit == "9":
                return True
            else:
                return False
        except IndexError:
            return False

    def is_valid_luhn(self) -> bool:
        """
        Validate a number string using the Luhn algorithm.

        Args:
            number: The ID number as a string (may contain spaces or dashes).

        Returns:
            True if the number passes the Luhn checksum, False otherwise.
        """

        try:
            digits = [int(d) for d in self.id]
            total = 0

            # Process digits from right to left; double every second digit
            for i, digit in enumerate(reversed(digits)):
                if i % 2 == 1:
                    digit *= 2
                    if digit > 9:
                        digit -= 9
                total += digit

            return total % 10 == 0
        except Exception:
            return False

    def senati_excutor(self):
        pass


# id_validator = IdValidation(id='')
# print(id_validator.is_valid_luhn())
# print(id_validator.is_11th_digit_zero_or_one())
# print(id_validator.is_12th_digit_zero_or_one())
# print(id_validator.is_id_numeric())
# print(id_validator.is_id_length_valid())
# print(id_validator.is_id_length_valid())
