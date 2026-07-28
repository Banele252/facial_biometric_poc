"""
Database logging for API request/response audit trail.

Logs a structured summary of each API call (endpoint, method, request
fields, response body, status) to Postgres, per the audit/tracing
requirement in the RDS ("record transaction events using date and time").

IMPORTANT: never pass raw image bytes into `request_summary` - use
`summarize_upload()` for any UploadFile, which records only filename,
content type, and size. This service handles ID document and selfie
images; the IRS doc explicitly flagged (twice) that a "selfie code" should
be stored instead of the raw image, and logging actual biometric image
bytes to this audit table is exactly what that requirement warns against.

Best-effort: a DB outage or missing credentials never breaks the API - the
call just goes unlogged, with a warning printed to the service's logs.

Requires the following environment variables (see .env):
    postgres_host, postgres_port, postgres_username, postgres_password,
    database
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger("db_logger")

_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS api_call_log (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    service TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    request_summary JSONB,
    response_summary JSONB
)
"""


def _get_connection():
    """Returns None (rather than raising) if Postgres isn't configured."""
    host = os.getenv("postgres_host")
    port = os.getenv("postgres_port", "5432")
    user = os.getenv("postgres_username")
    password = os.getenv("postgres_password")
    dbname = os.getenv("database")

    if not all([host, user, password, dbname]):
        return None

    import psycopg

    return psycopg.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=dbname,
        connect_timeout=5,
    )


def ensure_table() -> None:
    """
    Call once at service startup. Best-effort - if Postgres isn't
    configured or isn't reachable, logs a warning and lets the service
    keep running without DB logging rather than failing to start.
    """
    conn = None
    try:
        conn = _get_connection()
        if conn is None:
            logger.warning(
                "Postgres env vars not set - API call logging to the database is disabled."
            )
            return
        with conn.cursor() as cur:
            cur.execute(_TABLE_DDL)
        conn.commit()
    except Exception as exc:  # DB down, bad creds, network, etc.
        logger.warning("Could not initialize api_call_log table: %s", exc)
    finally:
        if conn is not None:
            conn.close()


def log_call(
    service: str,
    endpoint: str,
    method: str,
    request_summary: dict[str, Any],
    response_summary: dict[str, Any],
    status_code: int,
) -> None:
    """
    Best-effort insert of one API call record. Never raises - intended to
    be run via FastAPI BackgroundTasks so a logging failure or slow DB
    never affects the API response itself.
    """
    conn = None
    try:
        conn = _get_connection()
        if conn is None:
            return
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO api_call_log
                    (occurred_at, service, endpoint, method, status_code,
                     request_summary, response_summary)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    datetime.now(UTC),
                    service,
                    endpoint,
                    method,
                    status_code,
                    json.dumps(request_summary, default=str),
                    json.dumps(response_summary, default=str),
                ),
            )
        conn.commit()
    except Exception as exc:
        logger.warning("Failed to log API call to database: %s", exc)
    finally:
        if conn is not None:
            conn.close()


def summarize_upload(filename: str | None, content_type: str | None, size_bytes: int) -> dict:
    """
    Metadata-only summary of an uploaded file for logging - never the file
    bytes themselves. See the module docstring for why.
    """
    return {
        "filename": filename,
        "content_type": content_type,
        "size_bytes": size_bytes,
    }
