# Backend/app/main.py
"""FastAPI application entrypoint."""
import logging
import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from Backend.app.config import get_settings
from Backend.app.db import init_db
from Backend.app.middleware.zero_trust import ZeroTrustMiddleware, api_key_header, bearer_auth
from Backend.app.routers import (
    audit,
    auth,
    health,
    iccid,
    notifications,
    selfies,
    sim_swap,
    validation,
    verification,
    verifications,
)
from Backend.rica_service.main import router as rica_router

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(
    title="Facial Biometric API",
    docs_url=None,
    redoc_url="/redoc",
    swagger_ui_assets_path=None,
)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    openapi_schema["components"]["securitySchemes"] = {
        "bearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Paste only the JWT (Swagger adds 'Bearer ' automatically)",
        },
        "apiKey": {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-Key",
            "description": "Sandbox or production API key for Tier-1 operations",
        },
    }

    # Rewrite FastAPI's auto-generated scheme names (HTTPBearer / APIKeyHeader)
    # to the names we defined above, so Swagger UI can attach the token.
    for path_item in openapi_schema.get("paths", {}).values():
        for operation in path_item.values():
            if not isinstance(operation, dict):
                continue
            security = operation.get("security")
            if not security:
                continue
            new_security = []
            for requirement in security:
                new_req = {}
                for scheme_name, scopes in requirement.items():
                    if scheme_name in ("HTTPBearer", "bearerAuth"):
                        new_req["bearerAuth"] = scopes
                    elif scheme_name in ("APIKeyHeader", "apiKey"):
                        new_req["apiKey"] = scopes
                    else:
                        new_req[scheme_name] = scopes
                if new_req:
                    new_security.append(new_req)
            operation["security"] = new_security

    # Global default
    openapi_schema["security"] = [{"bearerAuth": []}]

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi

_cors_raw = os.getenv("CORS_ALLOW_ORIGINS", "")
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-API-Key",
            "X-Correlation-Id",
            "X-Device-Fingerprint",
            "X-Geo-Fence",
            "X-Request-Nonce",
        ],
        expose_headers=["X-Correlation-Id", "X-RateLimit-Remaining", "X-Request-ID"],
        max_age=600,
    )

app.add_middleware(ZeroTrustMiddleware)

# Routers
app.include_router(health)
app.include_router(auth)
app.include_router(validation, dependencies=[Depends(bearer_auth)])
app.include_router(verification, dependencies=[Depends(bearer_auth)])
app.include_router(selfies, dependencies=[Depends(bearer_auth)])
app.include_router(verifications, dependencies=[Depends(bearer_auth)])
app.include_router(notifications, dependencies=[Depends(bearer_auth)])
app.include_router(iccid, dependencies=[Depends(bearer_auth)])
app.include_router(sim_swap, dependencies=[Depends(bearer_auth), Depends(api_key_header)])
app.include_router(audit, dependencies=[Depends(bearer_auth)])
app.include_router(rica_router, dependencies=[Depends(bearer_auth)])

init_db()


def _mount_frontend() -> None:
    static_dir = get_settings().static_dir
    index_file = static_dir / "index.html"
    if not index_file.is_file():
        logging.getLogger(__name__).info(
            "No frontend bundle at %s -- serving API only", static_dir
        )
        return
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> FileResponse:
        if full_path:
            candidate = (static_dir / full_path).resolve()
            if candidate.is_file() and candidate.is_relative_to(static_dir.resolve()):
                return FileResponse(candidate)
        return FileResponse(index_file)


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui():
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="Facial Biometric API",
        swagger_ui_parameters={"syntaxHighlight": False, "dom_id": "#swagger-ui"},
    )


_mount_frontend()