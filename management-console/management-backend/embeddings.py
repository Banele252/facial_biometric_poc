"""Shared OpenAI embeddings client.

Single source of truth for the embedding model and dimension, used by both
index_process_docs.py (offline indexing of process_document/*.txt) and
system_llm.py's search_process_documentation tool (runtime query
embedding) - so process_docs_db.py's vector(N) column always matches what
both sides actually write/query with.
"""

from __future__ import annotations

import os
from functools import lru_cache

from openai import OpenAI

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def embed_text(text: str) -> list[float]:
    response = _client().embeddings.create(model=EMBEDDING_MODEL, input=text)
    return response.data[0].embedding
