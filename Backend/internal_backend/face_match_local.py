"""
Local (non-Azure) face comparison.

Fallback for `face_match.py` for when the Azure Face API's Limited Access
approval (see that module's docstring) isn't available yet. Set
FACE_MATCH_PROVIDER=local in .env to route Backend/internal_backend/main.py's
face-match endpoints here instead; face_match.py itself is untouched so
switching back to `azure` (the default) needs no code changes once access is
granted.

Uses ArcFace (the ResNet-100 model from the ONNX Model Zoo, run via
onnxruntime) rather than a bundled framework like DeepFace - same embedding
model and accuracy, without pulling in TensorFlow/Keras/Flask or requiring
the full opencv-python build DeepFace needs (this machine has no prebuilt
opencv wheel, which meant a 30+ minute source compile). Face detection and
the 68-point landmarks still come from dlib (already used elsewhere in this
module); those landmarks are reduced to the 5 points ArcFace's alignment
template expects and used to warp each face into a canonical 112x112 crop
before embedding - proper landmark alignment matters a lot for this model's
accuracy, more so than a plain bounding-box crop.

Two earlier versions of this module were tried and replaced:
  1. A landmark-ratio heuristic ported from
     https://github.com/AsanteNana/face-detection-comparison - produced
     frequent false matches (relative eye/nose/mouth distances aren't a
     robust identity signal on their own).
  2. dlib's own ResNet face-recognition model - a real embedding model, but
     older (2017) and not trained with an emphasis on cross-age robustness,
     which matters when comparing a years-old passport photo to a current
     selfie.

Preprocessing follows the model's own reference implementation exactly
(https://github.com/onnx/models/blob/main/validated/vision/body_analysis/arcface/dependencies/arcface_inference.ipynb):
5-point similarity-transform alignment to a 112x112 RGB crop, no pixel value
scaling (fed to the model as raw 0-255 floats), output embedding L2-normalized.
Faces are compared via cosine similarity of the normalized embeddings.

`confidence` is that cosine similarity (already in a sensible ~[-1, 1] range,
higher = better match). The default threshold of 0.5 is a starting point, not
an independently validated cutoff for this deployment - calibrate it against
labeled same-person / different-person pairs from your own passport/selfie
data before relying on it in production.

Requires two dlib model files plus the ArcFace ONNX model, all too large to
commit to git. Download once:
    curl -L -o Backend/internal_backend/models/shape_predictor_68_face_landmarks.dat.bz2 \\
        http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2
    bzip2 -d Backend/internal_backend/models/shape_predictor_68_face_landmarks.dat.bz2
    curl -L -o Backend/internal_backend/models/arcfaceresnet100-8.onnx \\
        https://github.com/onnx/models/raw/main/validated/vision/body_analysis/arcface/model/arcfaceresnet100-8.onnx

This module has not been validated against real ID photos at scale.
"""

from __future__ import annotations

import io
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
from face_match import FaceMatchResult
from PIL import Image, UnidentifiedImageError

if TYPE_CHECKING:
    import dlib

MODELS_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODELS_DIR / "shape_predictor_68_face_landmarks.dat"
ARCFACE_MODEL_PATH = MODELS_DIR / "arcfaceresnet100-8.onnx"

DEFAULT_CONFIDENCE_THRESHOLD = 0.5

# ArcFace's canonical 5-point alignment template (left eye, right eye, nose
# tip, left mouth corner, right mouth corner - "left"/"right" as seen in the
# image), for a 112x112 output crop. From the model's reference
# implementation; the +8.0 x-shift centers a template originally defined for
# a 96x112 output.
_ARCFACE_TEMPLATE = np.array(
    [
        [30.2946, 51.6963],
        [65.5318, 51.5014],
        [48.0252, 71.7366],
        [33.5493, 92.3655],
        [62.7299, 92.2041],
    ],
    dtype=np.float64,
)
_ARCFACE_TEMPLATE[:, 0] += 8.0


class LocalFaceMatchError(Exception):
    """Raised when a face could not be detected or an embedding could not be computed."""


@lru_cache(maxsize=1)
def _predictor() -> dlib.shape_predictor:
    import dlib

    if not MODEL_PATH.exists():
        raise LocalFaceMatchError(
            f"Missing dlib landmark model at {MODEL_PATH}. Download it with: "
            f"curl -L -o {MODEL_PATH}.bz2 "
            "http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2 "
            f"&& bzip2 -d {MODEL_PATH}.bz2"
        )
    return dlib.shape_predictor(str(MODEL_PATH))


@lru_cache(maxsize=1)
def _onnx_session():
    import onnxruntime

    if not ARCFACE_MODEL_PATH.exists():
        raise LocalFaceMatchError(
            f"Missing ArcFace ONNX model at {ARCFACE_MODEL_PATH}. Download it with: "
            f"curl -L -o {ARCFACE_MODEL_PATH} "
            "https://github.com/onnx/models/raw/main/validated/vision/body_analysis/"
            "arcface/model/arcfaceresnet100-8.onnx"
        )
    return onnxruntime.InferenceSession(str(ARCFACE_MODEL_PATH), providers=["CPUExecutionProvider"])


def _largest_face(faces) -> dlib.rectangle:
    """Treat the largest detected face as the subject (e.g. a selfie that also
    happens to catch a bystander) rather than whichever dlib returns first."""
    return max(faces, key=lambda f: (f.right() - f.left()) * (f.bottom() - f.top()))


def _detect_face(image_bytes: bytes) -> tuple[np.ndarray, dlib.rectangle]:
    """Detect the largest face in an image. Returns (RGB image array, dlib rectangle).

    Upsamples once before detection - dlib's HOG-based detector otherwise
    misses smaller or non-fully-frontal faces surprisingly often, especially
    in images that contain more than one face.
    """
    import dlib

    try:
        rgb = np.array(Image.open(io.BytesIO(image_bytes)).convert("RGB"))
    except UnidentifiedImageError as exc:
        raise LocalFaceMatchError("Could not decode image.") from exc
    faces = dlib.get_frontal_face_detector()(rgb, 1)
    if not faces:
        raise LocalFaceMatchError("No face detected in the supplied image.")
    return rgb, _largest_face(faces)


def _five_point_landmarks(landmarks) -> np.ndarray:
    """Reduce dlib's 68 points to the 5 points ArcFace's alignment template
    expects: left eye, right eye, nose tip, left mouth corner, right mouth
    corner (image-left/right, matching the template's own point order)."""

    def _mean_point(indices: range) -> list[float]:
        xs = [landmarks.part(i).x for i in indices]
        ys = [landmarks.part(i).y for i in indices]
        return [sum(xs) / len(xs), sum(ys) / len(ys)]

    left_eye = _mean_point(range(36, 42))
    right_eye = _mean_point(range(42, 48))
    nose_tip = [landmarks.part(30).x, landmarks.part(30).y]
    mouth_left = [landmarks.part(48).x, landmarks.part(48).y]
    mouth_right = [landmarks.part(54).x, landmarks.part(54).y]
    return np.array([left_eye, right_eye, nose_tip, mouth_left, mouth_right], dtype=np.float64)


def _umeyama(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """Least-squares similarity transform (rotation + uniform scale +
    translation) mapping `src` points onto `dst` points. Returns a 2x3 matrix."""
    src_mean = src.mean(axis=0)
    dst_mean = dst.mean(axis=0)
    src_centered = src - src_mean
    dst_centered = dst - dst_mean

    covariance = (dst_centered.T @ src_centered) / len(src)
    u, s, vt = np.linalg.svd(covariance)
    sign_fix = np.diag([1.0, float(np.sign(np.linalg.det(u @ vt)) or 1.0)])
    rotation = u @ sign_fix @ vt

    var_src = (src_centered**2).sum() / len(src)
    scale = np.trace(np.diag(s) @ sign_fix) / var_src

    translation = dst_mean - scale * rotation @ src_mean

    matrix = np.zeros((2, 3))
    matrix[:2, :2] = scale * rotation
    matrix[:, 2] = translation
    return matrix


def _align_face(rgb: np.ndarray, landmarks) -> np.ndarray:
    """Warp a face to a canonical 112x112 crop via 5-point similarity
    alignment - the alignment ArcFace was trained on, not just a
    bounding-box crop."""
    forward = _umeyama(_five_point_landmarks(landmarks), _ARCFACE_TEMPLATE)
    forward_3x3 = np.vstack([forward, [0.0, 0.0, 1.0]])
    # PIL's Image.AFFINE wants the output->input (inverse) mapping.
    inverse = np.linalg.inv(forward_3x3)[:2, :].flatten()

    aligned = Image.fromarray(rgb).transform(
        (112, 112), Image.AFFINE, inverse.tolist(), resample=Image.Resampling.BILINEAR
    )
    return np.array(aligned)


def _embed(aligned_rgb: np.ndarray) -> np.ndarray:
    """Run an aligned 112x112 RGB face crop through ArcFace and L2-normalize
    the resulting 512-d embedding. No pixel scaling - matches the reference
    implementation, which feeds the model raw 0-255 values."""
    session = _onnx_session()
    input_name = session.get_inputs()[0].name
    chw = np.transpose(aligned_rgb, (2, 0, 1)).astype(np.float32)
    batched = np.expand_dims(chw, axis=0)
    embedding = session.run(None, {input_name: batched})[0][0]
    norm = np.linalg.norm(embedding)
    return embedding / norm if norm > 0 else embedding


def _face_descriptor(image_bytes: bytes) -> np.ndarray:
    """Detect a face, align it, and return its L2-normalized 512-d ArcFace embedding."""
    rgb, face = _detect_face(image_bytes)
    landmarks = _predictor()(rgb, face)
    aligned = _align_face(rgb, landmarks)
    return _embed(aligned)


def match_face_to_document(
    selfie_bytes: bytes,
    document_image_bytes: bytes,
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> FaceMatchResult:
    """Compare a live selfie against the photo on an ID document / passport.

    Local ArcFace-embedding equivalent of face_match.match_face_to_document -
    same FaceMatchResult contract, no Azure call.
    """
    if not selfie_bytes or not document_image_bytes:
        return FaceMatchResult(
            success=False, error="Both a selfie and a document image are required."
        )

    try:
        descriptor1 = _face_descriptor(selfie_bytes)
        descriptor2 = _face_descriptor(document_image_bytes)
    except LocalFaceMatchError as exc:
        return FaceMatchResult(success=False, error=str(exc))
    except Exception as exc:  # dlib/Pillow/onnxruntime errors
        return FaceMatchResult(success=False, error=f"Local face match failed: {exc}")

    confidence = round(float(np.dot(descriptor1, descriptor2)), 4)
    is_match = confidence >= confidence_threshold

    return FaceMatchResult(success=True, is_match=is_match, confidence=confidence)
