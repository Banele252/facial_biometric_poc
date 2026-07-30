from types import SimpleNamespace

import ocr_validator


def fake_field(value, confidence=0.98):
    return SimpleNamespace(value_string=value, content=value, confidence=confidence)


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
