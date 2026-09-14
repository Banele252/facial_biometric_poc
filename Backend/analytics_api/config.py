"""Runtime configuration for the analytics read API.

*** Enter your Azure Postgres connection details in .env, not here. ***
Reads ANALYTICS_DATABASE_URL directly if it's set. Otherwise builds one from
the analytics_postgres_host / analytics_postgres_port /
analytics_postgres_username / analytics_postgres_password /
analytics_database variables - the same names Backend/analytics_sync uses
for its destination database, since this API reads what that Function
writes.

Unlike the other Backend/*_service configs, there's no SQLite fallback here:
this service only ever reads tables that Backend/analytics_sync creates
dynamically from whatever's in production, so there's no fixed schema a
local SQLite file could stand in for. Tests mock the DB layer instead (see
test_*.py), matching analytics_sync's own approach.
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
    return Settings(database_url=_database_url_from_env())
