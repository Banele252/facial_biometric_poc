from types import SimpleNamespace

import face_match


def test_missing_images_fails_fast():
    result = face_match.match_face_to_document(b"", b"doc-bytes")
    assert result.success is False
    assert "Both a selfie and a document image" in result.error


def test_matching_faces(monkeypatch):
    monkeypatch.setattr(face_match, "_detect_face_id", lambda client, img: "fake-face-id")

    class FakeClient:
        def verify_face_to_face(self, face_id1, face_id2):
            return SimpleNamespace(is_identical=True, confidence=0.9)

    monkeypatch.setattr(face_match, "_get_client", lambda: FakeClient())

    result = face_match.match_face_to_document(b"selfie-bytes", b"doc-bytes")
    assert result.success is True
    assert result.is_match is True
    assert result.confidence == 0.9


def test_low_confidence_match_is_rejected(monkeypatch):
    class FakeClient:
        def verify_face_to_face(self, face_id1, face_id2):
            return SimpleNamespace(is_identical=True, confidence=0.5)

    monkeypatch.setattr(face_match, "_get_client", lambda: FakeClient())
    monkeypatch.setattr(face_match, "_detect_face_id", lambda client, img: "fake-face-id")

    result = face_match.match_face_to_document(b"selfie-bytes", b"doc-bytes", confidence_threshold=0.75)
    assert result.success is True
    assert result.is_match is False


def test_no_face_detected(monkeypatch):
    def raise_no_face(client, img):
        raise face_match.FaceMatchError("No face detected in the supplied image.")

    monkeypatch.setattr(face_match, "_get_client", lambda: object())
    monkeypatch.setattr(face_match, "_detect_face_id", raise_no_face)

    result = face_match.match_face_to_document(b"selfie-bytes", b"doc-bytes")
    assert result.success is False
    assert "No face detected" in result.error
