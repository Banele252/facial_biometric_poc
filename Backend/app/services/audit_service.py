# Backend/app/services/audit_service.py
"""Hash-chain audit service for immutable, tamper-evident audit logs.
Provides cryptographic verification of audit event integrity and chain continuity.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

from Backend.app.config import get_settings
from Backend.app.db import get_db, new_id, utcnow_iso

# Server-side secret for HMAC — must be in .env
_AUDIT_SECRET = get_settings().audit_secret_key.encode()


class AuditService:
    """Manages hash-chained audit log entries with cryptographic verification."""

    def __init__(self) -> None:
        self._init_control_table()

    def _init_control_table(self) -> None:
        """Initialize the audit chain control table with a genesis hash."""
        db = get_db()
        db.execute(
            "INSERT OR IGNORE INTO audit_chain_control (id, last_hash) VALUES (?, ?)",
            (1, "0" * 64),
        )

    def _compute_hash(self, payload: str, previous_hash: str | None = None) -> str:
        """Compute HMAC-SHA256 hash for an audit entry."""
        data = f"{payload}:{previous_hash or '0' * 64}"
        return hmac.new(_AUDIT_SECRET, data.encode(), hashlib.sha256).hexdigest()

    def _verify_entry_hash(self, entry: dict[str, Any]) -> bool:
        """Verify the integrity hash of a single audit entry."""
        payload = json.dumps(
            {
                "event_type": entry.get("event_type"),
                "timestamp": entry.get("timestamp"),
                "session_id": entry.get("session_id"),
                "user_id": entry.get("user_id"),
                "device_id": entry.get("device_id"),
                "app_version": entry.get("app_version"),
                "os_version": entry.get("os_version"),
                "screen": entry.get("screen"),
                "action": entry.get("action"),
                "outcome": entry.get("outcome"),
                "reason": entry.get("reason"),
                "metadata": entry.get("metadata"),
                "previous_hash": entry.get("previous_hash"),
            },
            sort_keys=True,
            default=str,
        )
        computed = self._compute_hash(payload, entry.get("previous_hash"))
        return computed == entry.get("integrity_hash")

    def log(
            self,
            event_type: str,
            session_id: str,
            device_id: str,
            *,
            user_id: str | None = None,
            outcome: str | None = None,
            reason: str | None = None,
            metadata: dict[str, Any] | None = None,
            screen: str | None = None,
            action: str | None = None,
            source: str = "backend",
    ) -> str:
        """Log a single audit event and update the chain head."""
        db = get_db()
        row = db.query_one(
            "SELECT last_hash FROM audit_chain_control WHERE id = ?", (1,)
        )
        previous_hash = row["last_hash"] if row else "0" * 64
        event_id = new_id()
        timestamp = utcnow_iso()

        payload = json.dumps(
            {
                "event_type": event_type,
                "timestamp": timestamp,
                "session_id": session_id,
                "user_id": user_id,
                "device_id": device_id,
                "screen": screen,
                "action": action,
                "outcome": outcome,
                "reason": reason,
                "metadata": metadata or {},
                "previous_hash": previous_hash,
            },
            sort_keys=True,
            default=str,
        )
        integrity_hash = self._compute_hash(payload, previous_hash)

        db.execute(
            "INSERT INTO audit_logs ("
            "event_id, event_type, timestamp, session_id, user_id, device_id, "
            "app_version, os_version, screen, action, outcome, reason, "
            "metadata, integrity_hash, previous_hash, source"
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                event_id,
                event_type,
                timestamp,
                session_id,
                user_id,
                device_id,
                None,
                None,
                screen,
                action,
                outcome,
                reason,
                json.dumps(metadata or {}, default=str),
                integrity_hash,
                previous_hash,
                source,
            ),
        )
        db.execute(
            "UPDATE audit_chain_control SET last_hash = ?, updated_at = ? WHERE id = ?",
            (integrity_hash, utcnow_iso(), 1),
        )
        return event_id

    def ingest_batch(self, entries: list[dict[str, Any]], expected_batch_hash: str) -> dict[str, Any]:
        """Ingest a batch of audit events from mobile with hash verification."""
        db = get_db()
        row = db.query_one(
            "SELECT last_hash FROM audit_chain_control WHERE id = ?", (1,)
        )
        chain_head = row["last_hash"] if row else "0" * 64
        valid_entries: list[dict[str, Any]] = []
        batch_hashes: list[str] = []

        for entry in entries:
            if not self._verify_entry_hash(entry):
                continue

            payload = json.dumps(
                {
                    "event_type": entry["event_type"],
                    "timestamp": entry["timestamp"],
                    "session_id": entry["session_id"],
                    "user_id": entry.get("user_id"),
                    "device_id": entry["device_id"],
                    "app_version": entry.get("app_version"),
                    "os_version": entry.get("os_version"),
                    "screen": entry.get("screen"),
                    "action": entry.get("action"),
                    "outcome": entry.get("outcome"),
                    "reason": entry.get("reason"),
                    "metadata": entry.get("metadata"),
                    "previous_hash": chain_head,
                },
                sort_keys=True,
                default=str,
            )
            backend_hash = self._compute_hash(payload, chain_head)
            batch_hashes.append(backend_hash)
            valid_entries.append(
                {
                    **entry,
                    "integrity_hash": backend_hash,
                    "previous_hash": chain_head,
                    "source": "mobile",
                    "synced_at": utcnow_iso(),
                }
            )
            chain_head = backend_hash

        computed_batch = hashlib.sha256("".join(batch_hashes).encode()).hexdigest()
        if computed_batch != expected_batch_hash:
            raise ValueError("Batch hash mismatch — possible tampering")

        for entry in valid_entries:
            db.execute(
                "INSERT INTO audit_logs ("
                "event_id, event_type, timestamp, session_id, user_id, device_id, "
                "app_version, os_version, screen, action, outcome, reason, "
                "metadata, integrity_hash, previous_hash, source, synced_at"
                ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    entry["event_id"],
                    entry["event_type"],
                    entry["timestamp"],
                    entry["session_id"],
                    entry.get("user_id"),
                    entry["device_id"],
                    entry.get("app_version"),
                    entry.get("os_version"),
                    entry.get("screen"),
                    entry.get("action"),
                    entry.get("outcome"),
                    entry.get("reason"),
                    json.dumps(entry.get("metadata") or {}, default=str),
                    entry["integrity_hash"],
                    entry["previous_hash"],
                    "mobile",
                    entry["synced_at"],
                ),
            )

        if valid_entries:
            db.execute(
                "UPDATE audit_chain_control SET last_hash = ?, updated_at = ? WHERE id = ?",
                (chain_head, utcnow_iso(), 1),
            )

        return {
            "accepted": len(valid_entries),
            "rejected": len(entries) - len(valid_entries),
            "new_chain_head": chain_head,
        }

    def export_user_data(self, user_id: str) -> dict[str, Any]:
        """Export all audit data for a specific user."""
        db = get_db()
        rows = db.query(
            "SELECT * FROM audit_logs WHERE user_id = ? ORDER BY timestamp DESC",
            (user_id,),
        )
        export_payload = json.dumps(rows, sort_keys=True, default=str)
        export_hash = hashlib.sha256(export_payload.encode()).hexdigest()
        return {
            "user_id": user_id,
            "entries": rows,
            "export_hash": export_hash,
            "generated_at": utcnow_iso(),
            "count": len(rows),
        }

    def verify_chain(self, session_id: str) -> dict[str, Any]:
        """Verify the integrity of an entire audit chain for a session."""
        db = get_db()
        rows = db.query(
            "SELECT * FROM audit_logs WHERE session_id = ? ORDER BY timestamp ASC",
            (session_id,),
        )
        if not rows:
            return {
                "session_id": session_id,
                "valid": True,
                "entry_count": 0,
                "broken_at": None,
            }

        broken_at: str | None = None
        for i, entry in enumerate(rows):
            if i == 0:
                if entry.get("previous_hash") and entry["previous_hash"] != "0" * 64:
                    broken_at = entry["event_id"]
                    break
            else:
                prev = rows[i - 1]
                if entry.get("previous_hash") != prev["integrity_hash"]:
                    broken_at = entry["event_id"]
                    break
            if not self._verify_entry_hash(entry):
                broken_at = entry["event_id"]
                break

        return {
            "session_id": session_id,
            "valid": broken_at is None,
            "entry_count": len(rows),
            "broken_at": broken_at,
        }

    def get_fraud_signals(self, session_id: str) -> list[dict[str, Any]]:
        """Retrieve fraud-related audit events for a session."""
        db = get_db()
        return db.query(
            "SELECT event_type, timestamp, outcome, metadata, reason "
            "FROM audit_logs "
            "WHERE session_id = ? AND event_type IN ("
            "'FRAUD_CHECK_INITIATED', 'FRAUD_RULE_TRIGGERED', 'FRAUD_DECISION', "
            "'LIVENESS_FAILED', 'FACIAL_MATCH_FAILED', 'ID_VALIDATION_FAILED'"
            ") ORDER BY timestamp ASC",
            (session_id,),
        )


# Singleton
audit_service = AuditService()