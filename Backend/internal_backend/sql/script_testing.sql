/*INSERT INTO audit (
    environment,
    ID_length_valid,
    ID_numeric_valid,
    ID_birth_date_numeric,
    eleventh_digit_zero_or_one,
    twelfth_digit_zero_or_one,
    ID_valid_luhn,
    final_outcome
) VALUES (
    'production',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    TRUE,
    'PASS'
);*/



select *
from audit
limit 100


--ALTER TABLE audit ADD identity_number VARCHAR(250);