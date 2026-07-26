# ---- Base image ----
FROM python:3.12-slim AS base

# Install uv by copying the prebuilt binary (fast, no pip needed)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# ---- Install dependencies first (better layer caching) ----
# Only copy dependency files so this layer is cached unless they change
COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# ---- Copy the rest of the application ----
COPY . .

# Install the project itself (separate from deps for better caching)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ---- Run as non-root user ----
RUN useradd --create-home appuser
USER appuser

# Make sure the venv's binaries are on PATH
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

# ---- Start the app ----
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]