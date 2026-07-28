# syntax=docker/dockerfile:1.7
#
# Standalone image for the SIM Swap order service (create + activate).
# Build from the REPO ROOT so this can reach pyproject.toml/uv.lock:
#
#   docker build -f Backend/sim_swap_service/Dockerfile -t facial-biometric-simswap .
#   docker run -p 8000:8000 --env-file .env facial-biometric-simswap

# ---------- Stage 1: resolve Python dependencies ----------
FROM python:3.12.9-slim-bookworm AS deps

COPY --from=ghcr.io/astral-sh/uv:0.5.29 /uv /bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

COPY pyproject.toml uv.lock ./
# --no-dev keeps pytest/ruff out of the runtime image.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project


# ---------- Stage 2: runtime ----------
FROM python:3.12.9-slim-bookworm AS runtime

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
    PORT=8000

COPY --from=deps --chown=10001:10001 /app/.venv /app/.venv
# Only this service's own directory - it runs standalone with flat imports,
# independent of Backend/app and the other services.
COPY --chown=10001:10001 Backend/sim_swap_service/ ./Backend/sim_swap_service/

WORKDIR /app/Backend/sim_swap_service

USER 10001:10001

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
