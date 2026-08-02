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
    health,
    notifications,
    selfies,
    validation,
    verification,
    verifications,
    external_validation,
)
from Backend.app.routers import external_validation
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
_cors_origins = [o for o in os.getenv("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
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
app.include_router(external_validation.router)

# Create the history/notification tables on startup. Cheap and idempotent; for
# the default local SQLite backend this needs no external service.
init_db()


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
