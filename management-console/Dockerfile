# syntax=docker/dockerfile:1.7
#
# Standalone image for the management console - frontend and backend served
# from one FastAPI process (same pattern as the root Dockerfile / see
# management-backend/main.py's _mount_frontend()).
# Build from the REPO ROOT so this can reach pyproject.toml/uv.lock:
#
#   docker build -f management-console/Dockerfile -t facial-biometric-management-console .
#   docker run -p 8001:8001 --env-file .env facial-biometric-management-console

# ---------- Stage 1: build the frontend bundle ----------
FROM node:26.5.1-bookworm-slim AS frontend

WORKDIR /build

# Install deps from the lockfile first so this layer caches across source edits.
COPY management-console/management-frontend/package.json management-console/management-frontend/package-lock.json ./
RUN npm ci

COPY management-console/management-frontend/ ./
RUN npm run build


# ---------- Stage 2: resolve Python dependencies ----------
FROM python:3.12.9-slim-bookworm AS deps

# Pinned to match the uv version that generated uv.lock (schema version 1,
# revision 3) - older uv releases (e.g. 0.5.29, used elsewhere in this repo)
# fail to parse it ("Failed to parse `uv.lock`").
COPY --from=ghcr.io/astral-sh/uv:0.11.3 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY pyproject.toml uv.lock ./
# --no-dev keeps pytest/ruff out of the runtime image. management-backend's
# dependencies (fastapi, uvicorn, psycopg, pydantic, dotenv, openai-agents)
# are already declared in the shared root pyproject.toml/uv.lock, so no
# separate lockfile is needed here.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project


# ---------- Stage 3: runtime ----------
FROM python:3.12.9-slim-bookworm AS runtime

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
    PORT=8001

COPY --from=deps --chown=10001:10001 /app/.venv /app/.venv
# Only this service's own directory - it runs standalone with flat imports,
# independent of Backend/app and the other services.
COPY --chown=10001:10001 management-console/management-backend/ ./management-console/management-backend/
COPY --from=frontend --chown=10001:10001 /build/dist /app/static

WORKDIR /app/management-console/management-backend

USER 10001:10001

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
