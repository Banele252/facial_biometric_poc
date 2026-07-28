CREATE TABLE audit (
    record_id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    environment VARCHAR(250),
    ID_length_valid BOOLEAN NOT NULL,
    ID_numeric_valid BOOLEAN NOT NULL,
    ID_birth_date_numeric BOOLEAN NOT NULL,
    eleventh_digit_zero_or_one BOOLEAN NOT NULL,
    twelfth_digit_zero_or_one BOOLEAN NULL,
    ID_valid_luhn BOOLEAN NOT NULL,
    final_outcome VARCHAR(250) NOT NULL
);