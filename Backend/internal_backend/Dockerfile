# syntax=docker/dockerfile:1

FROM python:3.11-slim

# System libraries needed by opencv-python-headless / onnxruntime / insightface
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast Python package manager)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Copy dependency file first for better layer caching
COPY pyproject.toml ./

# Install dependencies listed in pyproject.toml WITHOUT building/installing
# this project itself as a package (there's no face_api/ source dir to ship,
# it's just standalone scripts).
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy application source
COPY main.py face_analyzer.py id_photo_extractor.py face_matcher.py ./

# Pre-download InsightFace model weights at build time so the image is
# self-contained and the first request isn't slowed down by a cold download.
RUN python -c "from insightface.app import FaceAnalysis; app = FaceAnalysis(name='buffalo_l'); app.prepare(ctx_id=-1, det_size=(640, 640))"

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]