"""Shared fakes for analytics_api's tests - a lightweight stand-in for a
psycopg dict_row connection, in the same spirit as
Backend/analytics_sync/test_sync.py's FakeCursor/FakeConnection, adapted so
fetchone()/fetchall() return dicts (dict_row shape) instead of tuples."""

from __future__ import annotations


def rendered(query) -> str:
    """Render a psycopg.sql.Composed (or plain str) to text for assertions."""
    return query if isinstance(query, str) else query.as_string(None)


class FakeCursor:
    """One `execute()` call consumes one entry from `results`, in order.
    Whichever of fetchone()/fetchall() is called next returns that entry
    as-is - the test supplies it already shaped as a dict or list of dicts."""

    def __init__(self, results: list | None = None):
        self._results = iter(results or [])
        self.executed: list[tuple] = []
        self._current = None

    def execute(self, query, params=None):
        self.executed.append((query, params))
        self._current = next(self._results)

    def fetchall(self):
        return self._current

    def fetchone(self):
        return self._current

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


class RaisingCursor:
    """A cursor whose execute() always raises - for simulating a table that
    doesn't exist yet in this deployment."""

    def __init__(self, exc: Exception):
        self._exc = exc

    def execute(self, query, params=None):
        raise self._exc

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


class FakeConnection:
    """Hands out cursors from a fixed sequence, one per `.cursor()` call -
    lets a test script exactly what each successive cursor returns."""

    def __init__(self, cursors: list | None = None):
        self._cursors = iter(cursors or [FakeCursor()])
        self.cursors_seen: list = []
        self.rollback_calls = 0

    def cursor(self):
        cur = next(self._cursors)
        self.cursors_seen.append(cur)
        return cur

    def rollback(self):
        self.rollback_calls += 1

    def close(self):
        pass
