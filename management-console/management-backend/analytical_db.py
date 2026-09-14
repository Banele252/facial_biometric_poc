"""Analytics DB connection for the management console.

Backs only the `users` (login, see auth.py) and `process_docs` (RAG chatbot
store, see process_docs_db.py) tables now - neither was ever part of the prod
mirror (see auth.py's and process_docs_db.py's own docstrings), so they stay
on this database. Everything that used to be analytics-mirrored reporting
data (audit logs, fraud rejections, SIM-swap orders, transactions) is read
from Backend/app's own API instead - see prod_api_client.py.
"""

from __future__ import annotations

from collections.abc import Iterator

import psycopg
from config import get_database_url
from psycopg.rows import dict_row


def get_connection() -> psycopg.Connection:
    return psycopg.connect(get_database_url(), row_factory=dict_row)


def db_conn() -> Iterator[psycopg.Connection]:
    """FastAPI dependency: one connection per request, closed after."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()
