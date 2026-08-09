"""FastAPI application entrypoint.

Serves the JSON API and, in the container image, the built frontend bundle from
the same process — one image, one container, one Container App revision.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from Backend.app.config import get_settings
from Backend.app.db import init_db
from Backend.app.routers import (
    documents,
    health,
    notifications,
    selfies,
    sim_swap,
    validation,
    verification,
    verifications,
)
from Backend.internal_backend.db_logger import ensure_table
from Backend.rica_service import main as rica_main

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(
    title="Facial Biometric PoC",
    description="Identity validation and verification for subscription fraud prevention.",
    version=os.getenv("APP_VERSION", "0.1.0"),
    docs_url="/docs" if os.getenv("ENABLE_DOCS", "true").lower() == "true" else None,
    redoc_url=None,
)

# Same-origin in the container, so this is empty by default. Set
# CORS_ALLOW_ORIGINS to run the Vite dev server against a local API.
_cors_raw = os.getenv("CORS_ALLOW_ORIGINS", "")
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]

if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

app.include_router(health.router)
app.include_router(validation.router)
app.include_router(verification.router)
app.include_router(selfies.router)
app.include_router(verifications.router)
app.include_router(notifications.router)
# The mock RICA registry ships as its own runnable service, but the
# infrastructure deploys a single container, so it is mounted here rather than
# given a second port the platform has nowhere to route.
app.include_router(rica_main.router)
app.include_router(documents.router)
# The SIM swap and ICCID routers arrived unmounted, so their endpoints were
# unreachable.
app.include_router(sim_swap.router)

# The ICCID barcode reader needs pyzbar, which is a wrapper over the native
# zbar library — the Python wheel installs fine and then fails on import when
# libzbar0 is absent. The container installs it (see the Dockerfile), but a
# developer checkout or a CI runner usually will not have it, and one optional
# endpoint must not stop the whole API from starting. Same treatment as the
# other optional backends: warn, carry on without it.
try:
    from Backend.app.routers import iccid

    # The router declares its own "/iccid" prefix; mounting it under /api/v1
    # puts it with everything else the edge routes.
    app.include_router(iccid.router, prefix="/api/v1")
except ImportError as exc:
    logging.getLogger(__name__).warning(
        "ICCID barcode endpoint unavailable (%s). Install libzbar0 to enable it.", exc
    )

# Create the history/notification tables on startup. Cheap and idempotent; for
# the default local SQLite backend this needs no external service.
init_db()

# The document endpoints log each call to Postgres when it is configured.
# Best-effort by design: without Postgres this warns and the endpoints carry on
# without database logging, rather than refusing to start.
ensure_table()


def _mount_frontend() -> None:
    """Serve the built SPA if a bundle is present.

    Absent during local API-only development and during tests; present in the
    container image, where the node build stage writes it to STATIC_DIR.
    """
    static_dir = get_settings().static_dir
    index_file = static_dir / "index.html"
    if not index_file.is_file():
        logging.getLogger(__name__).info("No frontend bundle at %s — serving API only", static_dir)
        return

    app.mount(
        "/assets",
        StaticFiles(directory=static_dir / "assets"),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> FileResponse:
        """Return index.html for client-side routes.

        API routes are registered above and match first, so they are unaffected.
        """
        if full_path:
            candidate = (static_dir / full_path).resolve()
            # Reject traversal outside the bundle (e.g. ../../etc/passwd).
            if candidate.is_file() and candidate.is_relative_to(static_dir.resolve()):
                return FileResponse(candidate)
        return FileResponse(index_file)


_mount_frontend()
