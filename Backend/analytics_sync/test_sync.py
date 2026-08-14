import pytest
import sync
from psycopg.types.json import Json


class FakeCursor:
    def __init__(self, fetchall_result=None, fetchone_result=None):
        self.executed = []
        self._fetchall_result = fetchall_result or []
        self._fetchone_result = fetchone_result

    def execute(self, query, params=None):
        self.executed.append((query, params))

    def executemany(self, query, seq_of_params):
        self.executed.append((query, list(seq_of_params)))

    def fetchall(self):
        return self._fetchall_result

    def fetchone(self):
        return self._fetchone_result

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


class FakeConnection:
    """A connection whose `.cursor()` hands out cursors from a fixed sequence,
    one per call - lets a test script exactly what each successive cursor
    (columns lookup, PK lookup, watermark lookup, data SELECT, ...) returns."""

    def __init__(self, cursors: list[FakeCursor] | None = None):
        self._cursors = iter(cursors or [FakeCursor()])
        self._last_cursor = None
        self.committed = False

    def cursor(self):
        self._last_cursor = next(self._cursors)
        return self._last_cursor

    def commit(self):
        self.committed = True


def _rendered(query) -> str:
    """Render a psycopg.sql.Composed (or plain str) to text for assertions."""
    return query if isinstance(query, str) else query.as_string(None)


class RecordingConnection(FakeConnection):
    """Like FakeConnection, but remembers every cursor it ever handed out so
    tests can inspect all executed queries across the whole call, not just
    the last cursor."""

    def __init__(self, cursors: list[FakeCursor] | None = None):
        super().__init__(cursors)
        self._cursors_seen: list[FakeCursor] = []

    def cursor(self):
        cur = super().cursor()
        self._cursors_seen.append(cur)
        return cur


def test_list_source_tables_returns_table_names_alphabetical():
    source = FakeConnection([FakeCursor(fetchall_result=[("rica_records",), ("api_call_log",)])])
    assert sync.list_source_tables(source) == ["rica_records", "api_call_log"]


def test_table_columns_returns_name_type_pairs():
    source = FakeConnection([FakeCursor(fetchall_result=[("id", "bigint"), ("payload", "jsonb")])])
    assert sync._table_columns(source, "api_call_log") == [("id", "bigint"), ("payload", "jsonb")]


def test_primary_key_columns_returns_names_in_order():
    source = FakeConnection([FakeCursor(fetchall_result=[("msisdn",)])])
    assert sync._primary_key_columns(source, "active_sims") == ["msisdn"]


def test_watermark_column_returns_updated_at_when_present():
    columns = [("id", "text"), ("created_at", "text"), ("updated_at", "text")]
    assert sync._watermark_column(columns) == "updated_at"


def test_watermark_column_ignores_created_at():
    """created_at is deliberately never trusted as a watermark, even alone -
    a table can get UPDATEs that don't touch created_at (selfies,
    sim_swap_orders), and information_schema alone can't tell those apart
    from a genuinely insert-only table."""
    columns = [("id", "text"), ("created_at", "text")]
    assert sync._watermark_column(columns) is None


def test_watermark_column_none_when_no_updated_at():
    columns = [("id", "text"), ("status", "text")]
    assert sync._watermark_column(columns) is None


def test_adapt_row_wraps_dict_and_list_values_for_jsonb_columns():
    """A jsonb source column comes back from `fetchall()` as a plain dict/list
    - psycopg needs it wrapped in Json() to write it back out, or executemany
    raises 'cannot adapt type dict'."""
    adapted = sync._adapt_row((1, {"a": 1}, [1, 2], "text", None))
    assert adapted[0] == 1
    assert isinstance(adapted[1], Json)
    assert isinstance(adapted[2], Json)
    assert adapted[3] == "text"
    assert adapted[4] is None


def test_ensure_table_mirror_maps_known_types_and_adds_primary_key():
    dest = RecordingConnection()
    sync.ensure_table_mirror(
        dest,
        "widgets",
        [("id", "bigint"), ("name", "character varying"), ("meta", "jsonb")],
        pk_columns=["id"],
    )
    query, _ = dest._cursors_seen[0].executed[0]
    rendered = _rendered(query)
    assert 'CREATE TABLE IF NOT EXISTS "widgets"' in rendered
    assert '"id" bigint' in rendered
    assert '"name" text' in rendered  # character varying -> text
    assert '"meta" jsonb' in rendered
    assert 'PRIMARY KEY ("id")' in rendered
    assert dest.committed is True


def test_ensure_table_mirror_omits_primary_key_clause_when_source_has_none():
    dest = RecordingConnection()
    sync.ensure_table_mirror(dest, "widgets", [("id", "bigint")], pk_columns=[])
    query, _ = dest._cursors_seen[0].executed[0]
    assert "PRIMARY KEY" not in _rendered(query)


def test_ensure_table_mirror_falls_back_to_text_for_unknown_types():
    dest = RecordingConnection()
    sync.ensure_table_mirror(dest, "widgets", [("weird_col", "some_future_pg_type")], pk_columns=[])
    query, _ = dest._cursors_seen[0].executed[0]
    assert '"weird_col" text' in _rendered(query)


def test_mirror_table_upserts_only_rows_newer_than_watermark():
    """A table with an updated_at column and an existing watermark should
    only SELECT rows newer than it, and UPSERT (not truncate) them."""
    source = RecordingConnection(
        [
            FakeCursor(fetchall_result=[("id", "text"), ("updated_at", "text")]),  # columns
            FakeCursor(fetchall_result=[("id",)]),  # primary key
            FakeCursor(fetchall_result=[("1", "2026-08-10T10:00:00+00:00")]),  # data SELECT
        ]
    )
    dest = RecordingConnection(
        [
            FakeCursor(),  # ensure_table_mirror
            FakeCursor(fetchone_result=("2026-08-10T09:00:00+00:00",)),  # _get_watermark
            FakeCursor(),  # upsert
            FakeCursor(),  # _set_watermark
        ]
    )

    copied = sync.mirror_table(source, dest, "active_sims")

    assert copied == 1
    select_query, select_params = source._cursors_seen[2].executed[0]
    rendered_select = _rendered(select_query)
    assert "WHERE" in rendered_select
    assert '"updated_at" > %s::text' in rendered_select
    assert select_params == ("2026-08-10T09:00:00+00:00",)

    upsert_query, upsert_rows = dest._cursors_seen[2].executed[0]
    rendered_upsert = _rendered(upsert_query)
    assert "INSERT INTO" in rendered_upsert
    assert "ON CONFLICT" in rendered_upsert
    assert "DO UPDATE SET" in rendered_upsert
    assert upsert_rows == [("1", "2026-08-10T10:00:00+00:00")]

    watermark_query, watermark_params = dest._cursors_seen[3].executed[0]
    assert "_sync_state" in _rendered(watermark_query)
    assert watermark_params == ("active_sims", "2026-08-10T10:00:00+00:00")


def test_mirror_table_updated_at_table_first_run_reads_everything():
    """A table with updated_at but no watermark stored yet (first run) reads
    the whole table - same as any other first run - but still goes through
    the watermark lookup, unlike a table with no updated_at at all."""
    source = RecordingConnection(
        [
            FakeCursor(fetchall_result=[("id", "text"), ("updated_at", "text")]),
            FakeCursor(fetchall_result=[("id",)]),
            FakeCursor(fetchall_result=[]),
        ]
    )
    dest = RecordingConnection(
        [
            FakeCursor(),
            FakeCursor(fetchone_result=None),  # no watermark stored yet
        ]
    )

    copied = sync.mirror_table(source, dest, "active_sims")

    assert copied == 0
    select_query, select_params = source._cursors_seen[2].executed[0]
    assert "WHERE" not in _rendered(select_query)
    assert select_params == ()


def test_mirror_table_skips_null_watermark_values():
    """A row with a NULL updated_at (schema says NOT NULL, but a row can
    still slip through outside the app's own INSERT paths) must not crash
    the max() watermark calculation - it's still upserted like any other
    row, just excluded when picking the new watermark."""
    source = RecordingConnection(
        [
            FakeCursor(fetchall_result=[("id", "text"), ("updated_at", "text")]),  # columns
            FakeCursor(fetchall_result=[("id",)]),  # primary key
            FakeCursor(
                fetchall_result=[
                    ("1", "2026-08-10T10:00:00+00:00"),
                    ("2", None),
                ]
            ),  # data SELECT
        ]
    )
    dest = RecordingConnection(
        [
            FakeCursor(),  # ensure_table_mirror
            FakeCursor(fetchone_result=None),  # _get_watermark
            FakeCursor(),  # upsert
            FakeCursor(),  # _set_watermark
        ]
    )

    copied = sync.mirror_table(source, dest, "active_sims")

    assert copied == 2
    upsert_query, upsert_rows = dest._cursors_seen[2].executed[0]
    assert upsert_rows == [("1", "2026-08-10T10:00:00+00:00"), ("2", None)]

    watermark_query, watermark_params = dest._cursors_seen[3].executed[0]
    assert "_sync_state" in _rendered(watermark_query)
    assert watermark_params == ("active_sims", "2026-08-10T10:00:00+00:00")


def test_mirror_table_advances_no_watermark_when_all_rows_null():
    """If every fetched row has a NULL updated_at, there's nothing usable to
    pick a new watermark from - the rows still get upserted, but
    _set_watermark must never be called."""
    source = RecordingConnection(
        [
            FakeCursor(fetchall_result=[("id", "text"), ("updated_at", "text")]),
            FakeCursor(fetchall_result=[("id",)]),
            FakeCursor(fetchall_result=[("1", None), ("2", None)]),
        ]
    )
    dest = RecordingConnection(
        [
            FakeCursor(),  # ensure_table_mirror
            FakeCursor(fetchone_result=None),  # _get_watermark
            FakeCursor(),  # upsert
        ]
    )

    copied = sync.mirror_table(source, dest, "active_sims")

    assert copied == 2
    upsert_query, upsert_rows = dest._cursors_seen[2].executed[0]
    assert upsert_rows == [("1", None), ("2", None)]
    # Only 3 destination cursors used (create-table, watermark-get, upsert) -
    # no _set_watermark call.
    assert len(dest._cursors_seen) == 3


def test_mirror_table_never_uses_created_at_as_watermark():
    """Regression test: a table shaped like `notifications` (primary key,
    created_at, no updated_at, never gets UPDATEd in this codebase today)
    must NOT be filtered on created_at. Filtering on it would be safe for
    notifications specifically, but the sync can't tell that table apart
    from selfies/sim_swap_orders-shaped tables (also have only created_at,
    but DO get updated) using information_schema alone - so created_at is
    never trusted, for any table. No watermark lookup should happen at all."""
    source = RecordingConnection(
        [
            FakeCursor(fetchall_result=[("id", "text"), ("created_at", "text")]),
            FakeCursor(fetchall_result=[("id",)]),
            FakeCursor(fetchall_result=[("1", "2026-08-10T10:00:00+00:00")]),
        ]
    )
    dest = RecordingConnection([FakeCursor(), FakeCursor()])

    copied = sync.mirror_table(source, dest, "notifications")

    assert copied == 1
    select_query, select_params = source._cursors_seen[2].executed[0]
    assert "WHERE" not in _rendered(select_query)
    assert select_params is None  # full_select is executed with no params at all
    # Exactly two destination cursors used (create-table, upsert) - no
    # watermark get/set for this table.
    assert len(dest._cursors_seen) == 2
    upsert_query, _ = dest._cursors_seen[1].executed[0]
    assert "ON CONFLICT" in _rendered(upsert_query)


def test_mirror_table_full_reload_reads_every_row_when_no_timestamp_column():
    """selfies/sim_swap_orders-shaped: has a primary key, gets updated, but no
    updated_at/created_at to filter on - every run reads the full table and
    still UPSERTs (not truncates) it."""
    source = RecordingConnection(
        [
            FakeCursor(fetchall_result=[("id", "text"), ("status", "text")]),
            FakeCursor(fetchall_result=[("id",)]),
            FakeCursor(fetchall_result=[("1", "done"), ("2", "pending")]),
        ]
    )
    dest = RecordingConnection([FakeCursor(), FakeCursor()])

    copied = sync.mirror_table(source, dest, "sim_swap_orders")

    assert copied == 2
    select_query, _ = source._cursors_seen[2].executed[0]
    assert "WHERE" not in _rendered(select_query)
    upsert_query, upsert_rows = dest._cursors_seen[1].executed[0]
    assert "ON CONFLICT" in _rendered(upsert_query)
    assert upsert_rows == [("1", "done"), ("2", "pending")]


def test_mirror_table_falls_back_to_truncate_when_source_has_no_primary_key():
    source = RecordingConnection(
        [
            FakeCursor(fetchall_result=[("id", "bigint"), ("payload", "jsonb")]),
            FakeCursor(fetchall_result=[]),  # no primary key
            FakeCursor(fetchall_result=[(1, "{}"), (2, "{}")]),
        ]
    )
    dest = RecordingConnection([FakeCursor(), FakeCursor()])

    copied = sync.mirror_table(source, dest, "legacy_log")

    assert copied == 2
    truncate_query, _ = dest._cursors_seen[1].executed[0]
    assert "TRUNCATE TABLE" in _rendered(truncate_query)
    insert_query, insert_rows = dest._cursors_seen[1].executed[1]
    assert "INSERT INTO" in _rendered(insert_query)
    assert "ON CONFLICT" not in _rendered(insert_query)
    assert insert_rows == [(1, "{}"), (2, "{}")]


def test_mirror_table_skips_table_with_no_visible_columns():
    source = RecordingConnection([FakeCursor(fetchall_result=[])])
    dest = RecordingConnection()
    copied = sync.mirror_table(source, dest, "ghost_table")
    assert copied == 0
    assert dest._cursors_seen == []  # never touched the destination


def test_connect_raises_on_missing_env(monkeypatch):
    monkeypatch.delenv("analytics_postgres_host", raising=False)
    monkeypatch.delenv("analytics_postgres_username", raising=False)
    monkeypatch.delenv("analytics_postgres_password", raising=False)
    monkeypatch.delenv("analytics_database", raising=False)

    with pytest.raises(sync.SyncConfigError):
        sync.dest_connection()
