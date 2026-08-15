"""Embeds process_document/*.txt and upserts them into process_docs.

Run manually, from this directory, after adding or editing any
process_document/*.txt file - changes do NOT take effect until this is
re-run:

    uv run python index_process_docs.py

Requires OPENAI_API_KEY and the same analytics DB env vars config.py
already reads (ANALYTICS_DATABASE_URL, or analytics_postgres_host/etc).
Never part of the container build - management-console/Dockerfile only
copies this directory, not the repo-root process_document/ folder, so
indexing always happens offline, outside the deployed container.
"""

from __future__ import annotations

from pathlib import Path

from analytical_db import get_connection
from dotenv import load_dotenv
from embeddings import embed_text
from process_docs_db import (
    delete_process_docs_not_in,
    ensure_process_docs_table,
    upsert_process_doc,
)

load_dotenv()

_DOCS_DIR = Path(__file__).resolve().parents[2] / "process_document"


def _title_from_content(text: str, fallback: str) -> str:
    first_line = text.strip().splitlines()[0] if text.strip() else ""
    return first_line.strip() or fallback


def main() -> None:
    conn = get_connection()
    try:
        ensure_process_docs_table(conn)
        paths = sorted(_DOCS_DIR.glob("*.txt"))
        if not paths:
            raise SystemExit(f"No .txt files found in {_DOCS_DIR}")
        for path in paths:
            slug = path.stem
            content = path.read_text(encoding="utf-8")
            title = _title_from_content(content, fallback=slug)
            embedding = embed_text(content)
            upsert_process_doc(conn, slug=slug, title=title, content=content, embedding=embedding)
            print(f"Indexed {slug} ({len(content)} chars)")
        delete_process_docs_not_in(conn, [p.stem for p in paths])
    finally:
        conn.close()


if __name__ == "__main__":
    main()
