"""Connection helper for the analytics read API.

Every query in this service is a read, so this deliberately stays a single
short function rather than the fuller sqlite/psycopg wrapper the other
services' db.py modules have (Backend/rica_service/db.py, Backend/app/db.py)
- there's no local schema to create or dialect to translate between, since
this only ever talks to the analytics Postgres that Backend/analytics_sync
populates.
"""

from __future__ import annotations

from collections.abc import Iterator

import psycopg
from psycopg.rows import dict_row

from Backend.analytics_api.config import get_settings


def get_connection() -> psycopg.Connection:
    return psycopg.connect(get_settings().database_url, row_factory=dict_row)


def db_conn() -> Iterator[psycopg.Connection]:
    """FastAPI dependency: one connection per request, closed after."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()
