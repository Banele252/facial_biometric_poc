# Backend/scripts/migrate_audit.py
"""Database migration script for audit log tables."""
from __future__ import annotations

import contextlib
import sys
from pathlib import Path

# Add repo root to path so we can import Backend.app.db
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from Backend.app.db import get_db

_ZERO64 = "0" * 64

_SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS audit_logs (
                                              event_id TEXT PRIMARY KEY,
                                              event_type TEXT NOT NULL,
                                              timestamp TEXT NOT NULL,
                                              session_id TEXT NOT NULL,
                                              user_id TEXT,
                                              msisdn TEXT,
                                              device_id TEXT NOT NULL,
                                              app_version TEXT,
                                              os_version TEXT,
                                              screen TEXT,
                                              action TEXT,
                                              outcome TEXT CHECK(outcome IN ('success', 'failure', 'blocked', 'pending')),
        reason TEXT,
        metadata TEXT,
        integrity_hash TEXT NOT NULL,
        previous_hash TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        synced_at TEXT,
        source TEXT DEFAULT 'backend' CHECK(source IN ('mobile', 'backend'))
        )
    """,
    "CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id, timestamp DESC)",
    "CREATE INDEX IF NOT EXISTS idx_audit_msisdn ON audit_logs(msisdn, timestamp DESC)",
    "CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_logs(session_id, timestamp ASC)",
    "CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_logs(event_type, timestamp DESC)",
    "CREATE INDEX IF NOT EXISTS idx_audit_integrity ON audit_logs(integrity_hash)",
    """
    CREATE TABLE IF NOT EXISTS audit_chain_control (
                                                       id INTEGER PRIMARY KEY CHECK (id = 1),
        last_hash TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
        )
    """,
    f"INSERT OR IGNORE INTO audit_chain_control (id, last_hash) VALUES (1, '{_ZERO64}')",
)


def migrate() -> None:
    """Run audit table migrations."""
    db = get_db()
    db.executescript(_SCHEMA)

    # Add msisdn column if it doesn't exist (for older databases)
    with contextlib.suppress(Exception):
        db.execute("ALTER TABLE audit_logs ADD COLUMN msisdn TEXT")

    print("Audit tables migrated successfully.")


if __name__ == "__main__":
    migrate()