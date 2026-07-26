from datetime import date

from document_match import DocumentType, match_user_input_to_document
from ocr_validator import OCRResult


def make_ocr_result(full_name="Thabo Nkosi", document_number="9001015011082"):
    return OCRResult(
        success=True,
        document_type="idDocument",
        first_name=full_name.split()[0],
        last_name=" ".join(full_name.split()[1:]),
        full_name=full_name,
        document_number=document_number,
        date_of_birth=date(1990, 1, 1),
    )


def test_sa_id_exact_match_passes():
    result = match_user_input_to_document(
        DocumentType.SA_ID, "9001015011082", "Thabo Nkosi", make_ocr_result()
    )
    assert result.overall_match is True
    assert result.id_number_match is True
    assert result.name_match is True


def test_sa_id_number_mismatch_fails():
    result = match_user_input_to_document(
        DocumentType.SA_ID, "9001015011099", "Thabo Nkosi", make_ocr_result()
    )
    assert result.overall_match is False
    assert result.id_number_match is False
    assert any("ID number" in r for r in result.reasons)


def test_name_typo_still_matches_within_threshold():
    # Minor OCR/typing noise (case + extra space) should still pass.
    result = match_user_input_to_document(
        DocumentType.SA_ID, "9001015011082", "  thabo   nkosi ", make_ocr_result()
    )
    assert result.name_match is True


def test_very_different_name_fails():
    result = match_user_input_to_document(
        DocumentType.SA_ID, "9001015011082", "Zanele Dlamini", make_ocr_result()
    )
    assert result.overall_match is False
    assert result.name_match is False


def test_passport_holder_skips_id_number_check():
    ocr = make_ocr_result(full_name="John Smith", document_number="P1234567")
    result = match_user_input_to_document(
        DocumentType.PASSPORT, user_id_number="", user_full_name="John Smith", ocr_result=ocr
    )
    assert result.id_number_match is None
    assert result.overall_match is True


def test_failed_ocr_result_fails_match():
    ocr = OCRResult(success=False, error="No identity document detected in the image.")
    result = match_user_input_to_document(DocumentType.SA_ID, "9001015011082", "Thabo Nkosi", ocr)
    assert result.overall_match is False
    assert "Document data unavailable" in result.reasons[0]
