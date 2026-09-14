"""Runtime configuration for the management-backend.

*** Enter your Azure Postgres connection details in .env, not here. ***

Two independent settings, deliberately NOT bundled into one object: bundling
them previously meant a missing/misconfigured analytics DB env var raised
ConfigError out of get_settings() and broke prod_api_client.py too, even
though it never touches that database - every /api/v1/analytics/* route
that only needs the prod API (audit logs, fraud rejections, SIM-swap orders,
transactions) returned an unhandled 500. Each accessor below now raises (or
not) only for the config it actually needs.

`get_database_url()` backs only the `users` (login, see auth.py) and
`process_docs` (RAG chatbot store, see process_docs_db.py) tables - neither
was ever part of the prod mirror, so they stay on this DB. Reads
ANALYTICS_DATABASE_URL directly if it's set. Otherwise builds one from the
analytics_postgres_host / analytics_postgres_port / analytics_postgres_username
/ analytics_postgres_password / analytics_database variables - the same
names Backend/analytics_api and Backend/analytics_sync use, since this reads
the same analytics database.

This intentionally duplicates Backend/analytics_api/config.py's structure
rather than importing it: management-backend uses local bare imports and
runs standalone from its own directory (see main.py's docstring), whereas
Backend/analytics_api imports via full `Backend.analytics_api.*` paths.

`get_prod_api_base_url()` backs prod_api_client.py - everything that used to
be analytics-mirrored reporting data (audit logs, fraud rejections, SIM-swap
orders, transactions) is read from Backend/app's own API instead. Never
raises; defaults to the local dev API.
"""

from __future__ import annotations

import os
from functools import lru_cache


class ConfigError(Exception):
    """Raised when no analytics database connection can be built from the environment."""


def _database_url_from_env() -> str:
    explicit = os.getenv("ANALYTICS_DATABASE_URL")
    if explicit:
        return explicit

    host = os.getenv("analytics_postgres_host")
    port = os.getenv("analytics_postgres_port", "5432")
    user = os.getenv("analytics_postgres_username")
    password = os.getenv("analytics_postgres_password")
    dbname = os.getenv("analytics_database")
    if host and user and password and dbname:
        return f"postgresql://{user}:{password}@{host}:{port}/{dbname}?sslmode=require"

    raise ConfigError(
        "Missing ANALYTICS_DATABASE_URL, or one or more of "
        "analytics_postgres_host/_username/_password/analytics_database, in the environment."
    )


@lru_cache(maxsize=1)
def get_database_url() -> str:
    return _database_url_from_env()


@lru_cache(maxsize=1)
def get_prod_api_base_url() -> str:
    return os.getenv("PROD_API_BASE_URL", "http://localhost:8000")
