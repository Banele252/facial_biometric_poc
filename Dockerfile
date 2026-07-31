# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build the frontend bundle ----------
FROM node:22.14.0-bookworm-slim AS frontend

WORKDIR /build

# Install deps from the lockfile first so this layer caches across source edits.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ---------- Stage 2: resolve Python dependencies ----------
FROM python:3.14.6-slim-bookworm AS deps

COPY --from=ghcr.io/astral-sh/uv:0.5.29 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY pyproject.toml uv.lock ./
# --no-dev keeps pytest/ruff out of the runtime image.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project


# ---------- Stage 3: runtime ----------
FROM python:3.14.6-slim-bookworm AS runtime

# Patch base image CVEs, then drop apt caches to keep the layer small.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# High UID — Defender for DevOps flags low-numbered UIDs as host-user collisions.
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin app

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH" \
    STATIC_DIR=/app/static \
    PORT=8000

COPY --from=deps --chown=10001:10001 /app/.venv /app/.venv
COPY --chown=10001:10001 Backend/ ./Backend/
COPY --from=frontend --chown=10001:10001 /build/dist /app/static

# Writable state for the dependency-free defaults. Without DATABASE_URL the app
# creates a SQLite file under ./data at startup, and without
# AZURE_STORAGE_CONNECTION_STRING it writes selfies to ./data/selfies — both
# inside a WORKDIR the app user cannot write to. The container then exits
# before binding a port. Deployed environments override both with Postgres and
# Blob, but the image has to stand up on its own.
RUN mkdir -p /app/data/selfies && chown -R 10001:10001 /app/data

USER 10001:10001

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["sh", "-c", "exec uvicorn Backend.app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
