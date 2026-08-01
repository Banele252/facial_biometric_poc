from datetime import date
from types import SimpleNamespace

import ocr_validator


def fake_field(value, confidence=0.98):
    return SimpleNamespace(value_string=value, content=value, confidence=confidence)


# Fields as the real SDK actually returns them: the parsed value lands on a
# type-specific attribute and `value_string` is left unset, while `content`
# holds the raw text off the document. `fake_field` above models a plain
# string field only - using it for dates/countries is what hid the bug where
# only `value_string` was read.
def fake_date_field(value: date, content: str, confidence=0.98):
    return SimpleNamespace(value_date=value, content=content, confidence=confidence)


def fake_country_field(value: str, content: str, confidence=0.98):
    return SimpleNamespace(value_country_region=value, content=content, confidence=confidence)


def make_fake_result(
    first_name="Thabo", last_name="Nkosi", document_number="9001015011082", dob="1990-01-01"
):
    doc = SimpleNamespace(
        doc_type="idDocument",
        fields={
            "FirstName": fake_field(first_name),
            "LastName": fake_field(last_name),
            "DocumentNumber": fake_field(document_number),
            "DateOfBirth": fake_field(dob),
            "CountryRegion": fake_field("ZAF"),
        },
    )
    return SimpleNamespace(documents=[doc])


def test_successful_extraction(monkeypatch):
    monkeypatch.setattr(ocr_validator, "_analyze_document", lambda b: make_fake_result())
    result = ocr_validator.extract_id_fields(b"fake-image-bytes")
    assert result.success is True
    assert result.full_name == "Thabo Nkosi"
    assert result.document_number == "9001015011082"
    assert result.date_of_birth.isoformat() == "1990-01-01"


def test_no_document_detected(monkeypatch):
    monkeypatch.setattr(ocr_validator, "_analyze_document", lambda b: SimpleNamespace(documents=[]))
    result = ocr_validator.extract_id_fields(b"fake-image-bytes")
    assert result.success is False
    assert "No identity document detected" in result.error


def test_empty_input_fails_fast():
    result = ocr_validator.extract_id_fields(b"")
    assert result.success is False
    assert "No document image" in result.error


def test_azure_call_failure_is_caught(monkeypatch):
    def boom(_):
        raise RuntimeError("simulated Azure outage")

    monkeypatch.setattr(ocr_validator, "_analyze_document", boom)
    result = ocr_validator.extract_id_fields(b"fake-image-bytes")
    assert result.success is False
    assert "OCR extraction failed" in result.error


def _realistic_result():
    """A document shaped the way Azure really returns one."""
    doc = SimpleNamespace(
        doc_type="idDocument",
        fields={
            "FirstName": fake_field("Thabo"),
            "LastName": fake_field("Nkosi"),
            "DocumentNumber": fake_field("9001015011082"),
            # Non-ISO `content`, exactly as printed on the document.
            "DateOfBirth": fake_date_field(date(1990, 1, 1), content="01 JAN 90"),
            "CountryRegion": fake_country_field("ZAF", content="ZAF"),
        },
    )
    return SimpleNamespace(documents=[doc])


def test_date_of_birth_read_from_typed_value(monkeypatch):
    monkeypatch.setattr(ocr_validator, "_analyze_document", lambda b: _realistic_result())
    result = ocr_validator.extract_id_fields(b"fake-image-bytes")
    assert result.date_of_birth == date(1990, 1, 1)


def test_country_region_read_from_typed_value(monkeypatch):
    monkeypatch.setattr(ocr_validator, "_analyze_document", lambda b: _realistic_result())
    result = ocr_validator.extract_id_fields(b"fake-image-bytes")
    assert result.country_region == "ZAF"
    assert result.field_confidence["country_region"] == 0.98


def test_untyped_date_falls_back_to_parsing_printed_text(monkeypatch):
    """When Azure can't type the field, the raw printed text is still parsed."""
    doc = SimpleNamespace(
        doc_type="idDocument",
        fields={"DateOfBirth": SimpleNamespace(content="15/03/1990", confidence=0.7)},
    )
    monkeypatch.setattr(
        ocr_validator, "_analyze_document", lambda b: SimpleNamespace(documents=[doc])
    )
    result = ocr_validator.extract_id_fields(b"fake-image-bytes")
    assert result.date_of_birth == date(1990, 3, 15)


def test_unparseable_date_is_none_not_an_error(monkeypatch):
    doc = SimpleNamespace(
        doc_type="idDocument",
        fields={"DateOfBirth": SimpleNamespace(content="not a date", confidence=0.3)},
    )
    monkeypatch.setattr(
        ocr_validator, "_analyze_document", lambda b: SimpleNamespace(documents=[doc])
    )
    result = ocr_validator.extract_id_fields(b"fake-image-bytes")
    assert result.success is True
    assert result.date_of_birth is None
