# Local face match (`face_match_local.py`)

A drop-in replacement for `face_match.py` (Azure Face API) that runs entirely
locally, for use while Azure's Limited Access approval for Face
Identification/Verification isn't available (see `face_match.py`'s
docstring). Same `FaceMatchResult` contract, no cloud call, no Azure
credentials required.

## Enabling it

`main.py` picks a provider per request based on an env var - `face_match.py`
(Azure) is untouched and stays the default, so switching back once Azure
access is granted needs no code changes:

```bash
# .env
FACE_MATCH_PROVIDER=local   # unset or "azure" uses face_match.py instead
```

Affects both `POST /api/v1/verify/face-match` and the face-match step inside
`POST /api/v1/fallback-verification/verify`.

## Pipeline

1. **Detect** - dlib's HOG frontal-face detector, upsampled once (misses
   smaller/angled faces otherwise). If more than one face is found (e.g. a
   selfie that catches a bystander), the **largest** is treated as the
   subject.
2. **Landmark** - dlib's 68-point shape predictor, reduced to the 5 points
   (eyes, nose tip, mouth corners) ArcFace's alignment template expects.
3. **Align** - a least-squares similarity transform (rotation + uniform
   scale + translation, i.e. Umeyama's method) warps the face to a canonical
   112x112 crop matching what ArcFace was trained on. This is a real
   landmark alignment, not a bounding-box crop - that distinction matters a
   lot for this model's accuracy.
4. **Embed** - the aligned crop is fed through **ArcFace**
   (ResNet-100, [ONNX Model
   Zoo](https://github.com/onnx/models/tree/main/validated/vision/body_analysis/arcface),
   run via `onnxruntime`), producing a 512-d embedding, L2-normalized.
5. **Compare** - cosine similarity between the two embeddings. That
   similarity *is* `FaceMatchResult.confidence`.

## Setup

`Backend/internal_backend/Dockerfile` fetches both model files during the
image build (its own layer, ahead of the app source `COPY`, so a code change
doesn't force a ~360MB re-download) - a container built from it is
self-contained, nothing extra to do for a deployed instance.

For local/dev runs outside Docker, the two model files are required and are
**not committed to git** (too large; gitignored under
`Backend/internal_backend/models/`) - fetch them once yourself:

```bash
mkdir -p Backend/internal_backend/models

curl -L -o Backend/internal_backend/models/shape_predictor_68_face_landmarks.dat.bz2 \
    http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2
bzip2 -d Backend/internal_backend/models/shape_predictor_68_face_landmarks.dat.bz2

curl -L -o Backend/internal_backend/models/arcfaceresnet100-8.onnx \
    https://github.com/onnx/models/raw/main/validated/vision/body_analysis/arcface/model/arcfaceresnet100-8.onnx
```

If either is missing, the relevant endpoint returns a `FaceMatchResult` with
`success: false` and an `error` string containing the exact download command
- it fails loud and actionable rather than crashing the service.

`dlib` has no prebuilt wheel on PyPI (source-only), so `uv sync` will compile
it the first time - this can take 5-15 minutes depending on the machine.
`onnxruntime` is pinned to `<1.24` because newer releases dropped macOS
x86_64 wheels, which would otherwise force a source build on Intel Macs.

## Confidence and threshold

`confidence` is cosine similarity between two L2-normalized 512-d embeddings
- roughly in `[-1, 1]`, higher means more similar. `is_match` is
`confidence >= confidence_threshold`, default **0.5**.

**That default is a starting point, not a validated cutoff.** It hasn't been
calibrated against this deployment's actual data. Before relying on it:
collect a labeled set of real same-person and different-person pairs from
your own passport-photo / selfie population (ideally spanning realistic age
gaps and lighting), run them through `match_face_to_document`, and pick a
threshold that separates the two distributions well for *your* data - a
generic textbook cutoff won't necessarily transfer.

## Why ArcFace instead of dlib's own recognition model

Two earlier approaches were tried on this same fallback and replaced:

1. **A landmark-ratio heuristic** (ported from
   [face-detection-comparison](https://github.com/AsanteNana/face-detection-comparison)) -
   compared raw pixel distances (eye gap, nose width, etc.) between the two
   faces. Produced frequent false matches: those ratios aren't a real
   identity signal, and are sensitive to camera distance and pose.
2. **dlib's own ResNet face-recognition model** - a real embedding model,
   meaningfully better than the heuristic, but a smaller/older (2017)
   network not trained with particular emphasis on cross-age robustness.
   Given the actual use case here - comparing a passport photo that may be
   years old against a current selfie - that gap showed up as false
   positives/negatives across aging and lighting differences.

ArcFace is specifically benchmarked on cross-age matching (e.g. the CALFW
benchmark) and handles this scenario meaningfully better. The full
[`DeepFace`](https://github.com/serengil/deepface) library was considered as
a way to get ArcFace, but was skipped: it hard-requires the full
`opencv-python` (no prebuilt wheel on this machine → another 30-45 min
source compile), plus TensorFlow/Keras and Flask/gunicorn (it bundles its
own standalone API server, which is irrelevant here). Running the ONNX
model directly via `onnxruntime` gets the same embedding model without any
of that - reusing the dlib detection/landmark pipeline already in place.

## Known limitations

- Not validated against real ID photos at scale - the alignment math has
  self-consistency tests (`test_umeyama_*`), but embedding quality on actual
  passport-scan/selfie pairs hasn't been benchmarked.
- dlib's HOG detector, even upsampled, is still weaker than modern
  detectors (e.g. RetinaFace/MTCNN) on extreme angles, low light, or small
  faces.
- Single-model, CPU-only inference - no ensembling, no liveness/anti-spoof
  checks (that's a separate concern; see `Backend/app/services/liveness.py`).

## Testing

```bash
cd Backend/internal_backend
uv run pytest test_face_match_local.py -v
```

Tests mock out `_detect_face` / `_face_descriptor` (no real images or model
files needed to run them) and separately verify the `_umeyama` alignment
math against known synthetic transforms. They are not part of the root
`uv run pytest` run (`testpaths = ["tests"]` in `pyproject.toml`) - same as
the other `Backend/*_service` standalone modules, and not currently wired
into CI either.
