"""Runtime configuration for the management-backend.

*** Enter your Azure Postgres connection details in .env, not here. ***

`database_url` now backs only the `users` (login, see auth.py) and
`process_docs` (RAG chatbot store, see process_docs_db.py) tables - neither
was ever part of the prod mirror, so they stay on this DB. Everything that
used to be analytics-mirrored reporting data (audit logs, fraud rejections,
SIM-swap orders, transactions) is read from Backend/app's own API instead -
see prod_api_client.py - not from this database connection.

Reads ANALYTICS_DATABASE_URL directly if it's set. Otherwise builds one from
the analytics_postgres_host / analytics_postgres_port /
analytics_postgres_username / analytics_postgres_password /
analytics_database variables - the same names Backend/analytics_api and
Backend/analytics_sync use, since this reads the same analytics database.

This intentionally duplicates Backend/analytics_api/config.py's structure
rather than importing it: management-backend uses local bare imports and
runs standalone from its own directory (see main.py's docstring), whereas
Backend/analytics_api imports via full `Backend.analytics_api.*` paths.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


class ConfigError(Exception):
    """Raised when no analytics database connection can be built from the environment."""


@dataclass(frozen=True)
class Settings:
    database_url: str
    prod_api_base_url: str


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
def get_settings() -> Settings:
    return Settings(
        database_url=_database_url_from_env(),
        prod_api_base_url=os.getenv("PROD_API_BASE_URL", "http://localhost:8000"),
    )
