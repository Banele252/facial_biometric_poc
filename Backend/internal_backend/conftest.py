import os
import sys

# This service's modules use flat imports (e.g. `import ocr_validator`) and
# run standalone via `uv run uvicorn main:app` from this directory. The
# repo-root __init__.py package structure added elsewhere makes pytest's
# default import mode resolve this directory's test modules relative to the
# repo root instead, breaking those flat imports - put the directory back on
# sys.path so its tests collect correctly regardless of where pytest is
# invoked from.
sys.path.insert(0, os.path.dirname(__file__))
