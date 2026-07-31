"""
main.py

FastAPI service exposing the three InsightFace-based modules:
  - FaceAnalyzer     -> POST /analyze
  - IDPhotoExtractor -> POST /extract
  - FaceMatcher      -> POST /compare, POST /match

Run locally:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Then open http://localhost:8000/docs for interactive Swagger UI.
"""

import os
import tempfile
import uuid

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.responses import FileResponse

from face_analyzer import FaceAnalyzer
from id_photo_extractor import IDPhotoExtractor
from face_matcher import FaceMatcher

app = FastAPI(
    title="Face Recognition API",
    description="Face analysis, ID photo extraction, and face matching powered by InsightFace",
    version="1.0.0",
)

# --------------------------------------------------------------------------
# Load each model once at startup and reuse across requests.
# NOTE: each class loads its own InsightFace model instance. If memory is a
# concern, these could be refactored to share a single FaceAnalysis instance.
# --------------------------------------------------------------------------
analyzer = FaceAnalyzer(ctx_id=-1)      # ctx_id=-1 (CPU) by default; set 0 for GPU
extractor = IDPhotoExtractor(ctx_id=-1)
matcher = FaceMatcher(ctx_id=-1)

# Directory for temp uploads and generated crops
TMP_DIR = tempfile.gettempdir()


def _save_upload(file: UploadFile) -> str:
    """Save an UploadFile to a temp path and return the path."""
    ext = os.path.splitext(file.filename)[1] or ".jpg"
    path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}{ext}")
    with open(path, "wb") as f:
        f.write(file.file.read())
    return path


def _cleanup(*paths):
    for p in paths:
        try:
            if p and os.path.exists(p):
                os.remove(p)
        except OSError:
            pass


@app.get("/")
def root():
    return {
        "message": "Face Recognition API",
        "endpoints": ["/analyze", "/extract", "/compare", "/match"],
        "docs": "/docs",
    }


@app.post("/analyze")
async def analyze_face(file: UploadFile = File(...), verbose: bool = Query(False)):
    """
    Detect faces in an uploaded image and return attributes
    (bounding box, embedding, age, gender) for each detected face.
    """
    path = _save_upload(file)
    try:
        faces = analyzer.analyze(path, verbose=verbose)

        if not faces:
            return {"faces_found": 0, "faces": []}

        response = []
        for f in faces:
            response.append({
                "bbox": [float(v) for v in f["bbox"]],
                "embedding": f["embedding"].tolist(),
                "age": int(f["age"]) if f["age"] is not None else None,
                "gender": "male" if f["gender"] == 1 else "female",
            })

        return {"faces_found": len(response), "faces": response}
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        _cleanup(path)


@app.post("/extract")
async def extract_photo(file: UploadFile = File(...), padding: int = Query(20)):
    """
    Detect the face on an uploaded ID card image, crop it out,
    and return the cropped photo as an image file.
    """
    in_path = _save_upload(file)
    out_path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}_cropped.jpg")
    try:
        success = extractor.extract(in_path, out_path, padding=padding)
        if not success:
            raise HTTPException(status_code=422, detail="No face detected on the ID")

        return FileResponse(out_path, media_type="image/jpeg", filename="cropped_photo.jpg")
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        _cleanup(in_path)
        # out_path is intentionally left for FileResponse to stream;
        # OS temp cleanup will reclaim it. For heavy production use,
        # consider a background task to delete it after the response is sent.


@app.post("/compare")
async def compare_faces(image1: UploadFile = File(...), image2: UploadFile = File(...)):
    """
    Compare two uploaded images and return the cosine similarity
    between their primary detected faces, as a percentage.
    """
    path1 = _save_upload(image1)
    path2 = _save_upload(image2)
    try:
        similarity = matcher.compare_faces(path1, path2)
        return {"similarity_percent": round(similarity, 2)}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        _cleanup(path1, path2)


@app.post("/match")
async def match_faces(
    image1: UploadFile = File(...),
    image2: UploadFile = File(...),
    threshold: float = Query(30.0, description="Minimum similarity percentage to count as a match"),
):
    """
    Compare two uploaded images and return whether they are considered
    a match based on a similarity threshold (percentage).
    """
    path1 = _save_upload(image1)
    path2 = _save_upload(image2)
    try:
        matched, similarity = matcher.is_match(path1, path2, threshold=threshold)
        return {
            "match": matched,
            "similarity_percent": round(similarity, 2),
            "threshold": threshold,
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        _cleanup(path1, path2)