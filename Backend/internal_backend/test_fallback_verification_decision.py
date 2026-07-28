from document_match import DocumentMatchResult
from face_match import FaceMatchResult
from fallback_verification_decision import DecisionStatus, evaluate_fallback_verification


def test_all_checks_pass_accepts():
    doc = DocumentMatchResult(
        overall_match=True, id_number_match=True, name_match=True, name_similarity=1.0
    )
    face = FaceMatchResult(success=True, is_match=True, confidence=0.95)
    decision = evaluate_fallback_verification(doc, face, reference_id="9001015011082")
    assert decision.status == DecisionStatus.ACCEPTED
    assert decision.reasons == []


def test_document_mismatch_rejects():
    doc = DocumentMatchResult(
        overall_match=False,
        id_number_match=False,
        name_match=True,
        name_similarity=1.0,
        reasons=["User-supplied ID number does not match the ID document."],
    )
    face = FaceMatchResult(success=True, is_match=True, confidence=0.95)
    decision = evaluate_fallback_verification(doc, face)
    assert decision.status == DecisionStatus.REJECTED
    assert "User-supplied ID number does not match the ID document." in decision.reasons


def test_face_mismatch_rejects():
    doc = DocumentMatchResult(
        overall_match=True, id_number_match=True, name_match=True, name_similarity=1.0
    )
    face = FaceMatchResult(success=True, is_match=False, confidence=0.42)
    decision = evaluate_fallback_verification(doc, face)
    assert decision.status == DecisionStatus.REJECTED
    assert any("did not match the document photo" in r for r in decision.reasons)


def test_face_service_failure_rejects():
    doc = DocumentMatchResult(
        overall_match=True, id_number_match=True, name_match=True, name_similarity=1.0
    )
    face = FaceMatchResult(success=False, error="No face detected in the supplied image.")
    decision = evaluate_fallback_verification(doc, face)
    assert decision.status == DecisionStatus.REJECTED
    assert any("could not be completed" in r for r in decision.reasons)


def test_both_checks_fail_reports_both_reasons():
    doc = DocumentMatchResult(
        overall_match=False,
        id_number_match=False,
        name_match=False,
        name_similarity=0.2,
        reasons=["Name similarity 0.20 is below the 0.85 threshold."],
    )
    face = FaceMatchResult(success=True, is_match=False, confidence=0.3)
    decision = evaluate_fallback_verification(doc, face)
    assert decision.status == DecisionStatus.REJECTED
    assert len(decision.reasons) == 2
