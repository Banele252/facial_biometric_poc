"""Vector-search storage for process/system documentation (RAG for the
System Chatbot).

One row per file in the repo-root `process_document/` folder. Lives in the
same analytics Postgres as `analytical_db.py`/`auth.py` (see `config.py`) -
a separate module because this one owns a schema (`CREATE EXTENSION vector`
plus a `vector` column) and does writes, whereas `analytical_db.py` is
read-only with no schema of its own.

Population happens offline, via `index_process_docs.py` - NOT here and NOT
at app startup (see `main.py`'s `_ensure_process_docs_table`, which only
creates the extension/table so container boot stays filesystem- and
OpenAI-independent).

No ivfflat/hnsw index on `embedding`: at the expected scale here (roughly
one row per backend process, a few dozen total), a sequential scan with
exact cosine distance is both simpler and more accurate than an
approximate index tuned for a much larger row count.
"""

from __future__ import annotations

from typing import Any

import psycopg
from embeddings import EMBEDDING_DIM
from pgvector.psycopg import register_vector
from psycopg import sql


def ensure_process_docs_table(conn: psycopg.Connection) -> None:
    """Create the pgvector extension and `process_docs` table if missing."""
    with conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
        cur.execute(
            sql.SQL(
                "CREATE TABLE IF NOT EXISTS process_docs ("
                "id serial PRIMARY KEY, "
                "slug text NOT NULL UNIQUE, "
                "title text NOT NULL, "
                "content text NOT NULL, "
                "embedding vector({}) NOT NULL, "
                "updated_at timestamptz NOT NULL DEFAULT now())"
            ).format(sql.Literal(EMBEDDING_DIM))
        )
    conn.commit()


def upsert_process_doc(
    conn: psycopg.Connection,
    *,
    slug: str,
    title: str,
    content: str,
    embedding: list[float],
) -> None:
    """Insert or update one `process_docs` row, keyed by `slug` - safe to
    re-run after editing a `process_document/*.txt` file."""
    register_vector(conn)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO process_docs (slug, title, content, embedding, updated_at) "
            "VALUES (%s, %s, %s, %s::vector, now()) "
            "ON CONFLICT (slug) DO UPDATE SET "
            "title = EXCLUDED.title, content = EXCLUDED.content, "
            "embedding = EXCLUDED.embedding, updated_at = now()",
            (slug, title, content, embedding),
        )
    conn.commit()


def delete_process_docs_not_in(conn: psycopg.Connection, slugs: list[str]) -> None:
    """Remove rows for `.txt` files that no longer exist, so a deleted or
    renamed `process_document` file doesn't linger in search results."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM process_docs WHERE slug != ALL(%s)", (slugs,))
    conn.commit()


def get_process_docs(conn: psycopg.Connection, slugs: list[str]) -> list[dict[str, Any]]:
    """Exact-slug lookup - used when the relevant docs are already known
    (e.g. from a transaction's check names) rather than found by embedding
    similarity - see search_process_docs for the similarity-based path."""
    if not slugs:
        return []
    with conn.cursor() as cur:
        cur.execute(
            "SELECT slug, title, content FROM process_docs WHERE slug = ANY(%s)",
            (slugs,),
        )
        return cur.fetchall()


def search_process_docs(
    conn: psycopg.Connection, query_embedding: list[float], limit: int = 5
) -> list[dict[str, Any]]:
    """The `limit` process_docs rows most similar to `query_embedding`,
    closest (smallest cosine distance) first."""
    register_vector(conn)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT slug, title, content, embedding <=> %s::vector AS distance "
            "FROM process_docs ORDER BY distance LIMIT %s",
            (query_embedding, limit),
        )
        return cur.fetchall()
