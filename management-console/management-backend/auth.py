"""Login authentication for the management console.

Checks submitted username/password against a `users` table in the analytics
Postgres DB - the same database `analytical_db.py`/`config.py` connect to.
This table has no counterpart in the source `biometric` DB, so
`Backend/analytics_sync/sync.py` (which only ever discovers and mirrors
tables it finds in the source) never sees, touches, or drops it.

Password check is plaintext for now, per current requirements - see the
commented-out block in `authenticate_user` for what a hashed comparison
would look like once that's wired in.
"""

from __future__ import annotations

from typing import Any

import psycopg

# from passlib.hash import bcrypt


def ensure_users_table(conn: psycopg.Connection) -> None:
    """Create the `users` table if it doesn't exist yet."""
    with conn.cursor() as cur:
        cur.execute(
            "CREATE TABLE IF NOT EXISTS users ("
            "id serial PRIMARY KEY, "
            "username text NOT NULL UNIQUE, "
            "name text NOT NULL, "
            "email text NOT NULL, "
            "password text NOT NULL)"
        )
    conn.commit()


def authenticate_user(conn: psycopg.Connection, username: str, password: str) -> dict[str, Any] | None:
    """The user's public fields (never the password) if `username`/`password`
    match a row in `users`, else None."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, username, name, email, password FROM users WHERE username = %s",
            (username,),
        )
        row = cur.fetchone()

    if row is None:
        return None

    # Plaintext comparison for now - no hashing/encryption yet.
    if row["password"] != password:
        return None
    # Hardened version would instead do:
    # if not bcrypt.verify(password, row["password"]):
    #     return None

    return {"id": row["id"], "username": row["username"], "name": row["name"], "email": row["email"]}
