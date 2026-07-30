import face_match_local
import numpy as np
import pytest
from face_match_local import _largest_face, _umeyama, match_face_to_document


class FakeRect:
    def __init__(self, left, right, top, bottom):
        self._left, self._right, self._top, self._bottom = left, right, top, bottom

    def left(self):
        return self._left

    def right(self):
        return self._right

    def top(self):
        return self._top

    def bottom(self):
        return self._bottom


def test_largest_face_is_picked_over_first():
    small_first = FakeRect(0, 20, 0, 20)
    large_second = FakeRect(0, 200, 0, 200)
    assert _largest_face([small_first, large_second]) is large_second


def test_umeyama_identity_mapping():
    points = np.array([[10.0, 10.0], [50.0, 10.0], [30.0, 40.0]])
    transform = _umeyama(points, points)
    np.testing.assert_allclose(transform[:, :2], np.eye(2), atol=1e-8)
    np.testing.assert_allclose(transform[:, 2], [0.0, 0.0], atol=1e-8)


def test_umeyama_recovers_known_scale_and_translation():
    src = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])
    dst = src * 2.0 + np.array([5.0, -3.0])  # scale 2x, translate (5, -3), no rotation
    transform = _umeyama(src, dst)
    np.testing.assert_allclose(transform[:, :2], np.eye(2) * 2.0, atol=1e-8)
    np.testing.assert_allclose(transform[:, 2], [5.0, -3.0], atol=1e-8)


def test_missing_images_fails_fast():
    result = match_face_to_document(b"", b"doc-bytes")
    assert result.success is False
    assert "Both a selfie and a document image" in result.error


def test_identical_embeddings_are_a_match(monkeypatch):
    vector = np.full(512, 0.6)
    vector = vector / np.linalg.norm(vector)
    descriptors = iter([vector, vector])
    monkeypatch.setattr(face_match_local, "_face_descriptor", lambda img: next(descriptors))

    result = match_face_to_document(b"selfie-bytes", b"doc-bytes")
    assert result.success is True
    assert result.is_match is True
    assert result.confidence == 1.0


def test_orthogonal_embeddings_are_not_a_match(monkeypatch):
    v1 = np.zeros(512)
    v1[0] = 1.0
    v2 = np.zeros(512)
    v2[1] = 1.0
    descriptors = iter([v1, v2])
    monkeypatch.setattr(face_match_local, "_face_descriptor", lambda img: next(descriptors))

    result = match_face_to_document(b"selfie-bytes", b"doc-bytes")
    assert result.success is True
    assert result.is_match is False
    assert result.confidence == 0.0


def test_no_face_detected(monkeypatch):
    def _raise(image_bytes):
        raise face_match_local.LocalFaceMatchError("No face detected in the supplied image.")

    monkeypatch.setattr(face_match_local, "_detect_face", _raise)

    result = match_face_to_document(b"selfie-bytes", b"doc-bytes")
    assert result.success is False
    assert "No face detected" in result.error


def test_missing_landmark_model_gives_actionable_error(monkeypatch, tmp_path):
    monkeypatch.setattr(face_match_local, "MODEL_PATH", tmp_path / "does-not-exist.dat")
    face_match_local._predictor.cache_clear()
    try:
        with pytest.raises(
            face_match_local.LocalFaceMatchError, match="Missing dlib landmark model"
        ):
            face_match_local._predictor()
    finally:
        face_match_local._predictor.cache_clear()


def test_missing_arcface_model_gives_actionable_error(monkeypatch, tmp_path):
    monkeypatch.setattr(face_match_local, "ARCFACE_MODEL_PATH", tmp_path / "does-not-exist.onnx")
    face_match_local._onnx_session.cache_clear()
    try:
        with pytest.raises(
            face_match_local.LocalFaceMatchError, match="Missing ArcFace ONNX model"
        ):
            face_match_local._onnx_session()
    finally:
        face_match_local._onnx_session.cache_clear()
