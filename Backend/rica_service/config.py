"""Runtime configuration for the mock RICA service.

*** Enter your Azure Postgres connection details in .env, not here. ***
Reads DATABASE_URL directly if it's set. Otherwise falls back to building
one from the postgres_host / postgres_port / postgres_username /
postgres_password / database variables already used by the other standalone
services' db_logger.py (see .env) - so no new secrets need to be added.
Falls back to a local SQLite file when neither is set, which keeps
`uv run uvicorn main:app` usable with zero configuration for quick local
testing.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_url: str


def _database_url_from_env() -> str:
    explicit = os.getenv("DATABASE_URL")
    if explicit:
        return explicit

    host = os.getenv("postgres_host")
    user = os.getenv("postgres_username")
    password = os.getenv("postgres_password")
    dbname = os.getenv("database")
    port = os.getenv("postgres_port", "5432")
    if host and user and password and dbname:
        return f"postgresql://{user}:{password}@{host}:{port}/{dbname}?sslmode=require"

    return f"sqlite:///{(Path('data') / 'rica_records.db').as_posix()}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(database_url=_database_url_from_env())
