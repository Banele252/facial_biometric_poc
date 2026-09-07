"""
RICA store – stub implementation for development.
Replace with real database logic when ready.
"""
from typing import Any, Dict, List, Optional

def verify(id_number: str, phone_number: str) -> Dict[str, Any]:
    """Placeholder RICA verification."""
    return {
        "verified": True,
        "message": "RICA verification passed (placeholder)",
        "id_number": id_number,
        "phone_number": phone_number,
    }

def get_by_msisdn(msisdn: str) -> Optional[Dict[str, Any]]:
    """Retrieve a RICA record by mobile number."""
    # In a real implementation, query the database.
    # For now, return a dummy record.
    return {
        "msisdn": msisdn,
        "id_number": "8107255492089",
        "verified": True,
        "created_at": "2026-01-01T00:00:00Z",
    }

def list_records() -> List[Dict[str, Any]]:
    """List all RICA records (stub)."""
    return [
        {
            "msisdn": "+27826151983",
            "id_number": "8107255492089",
            "verified": True,
            "created_at": "2026-01-01T00:00:00Z",
        }
    ]

def upsert_record(data: Dict[str, Any]) -> Dict[str, Any]:
    """Insert or update a RICA record (stub)."""
    # Return the same data with a timestamp.
    return {
        **data,
        "updated_at": "2026-08-21T12:00:00Z",
        "operation": "upsert_stub",
    }
