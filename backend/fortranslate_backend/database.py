from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import hashlib
import hmac
import secrets
from typing import Iterator


SCHEMA = """
CREATE TABLE IF NOT EXISTS glossary_terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL COLLATE NOCASE UNIQUE,
    target TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens >= 0),
    token_id INTEGER,
    billing_units INTEGER NOT NULL DEFAULT 0 CHECK(billing_units >= 0)
);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);
CREATE TABLE IF NOT EXISTS access_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_hint TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    quota_units INTEGER NOT NULL DEFAULT 5000000 CHECK(quota_units >= 0),
    used_units INTEGER NOT NULL DEFAULT 0 CHECK(used_units >= 0)
);
CREATE INDEX IF NOT EXISTS idx_access_tokens_enabled ON access_tokens(enabled);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript(SCHEMA)
            self._ensure_column(connection, "access_tokens", "quota_units", "INTEGER NOT NULL DEFAULT 5000000")
            self._ensure_column(connection, "access_tokens", "used_units", "INTEGER NOT NULL DEFAULT 0")
            self._ensure_column(connection, "usage_events", "token_id", "INTEGER")
            self._ensure_column(connection, "usage_events", "billing_units", "INTEGER NOT NULL DEFAULT 0")
            connection.execute("CREATE INDEX IF NOT EXISTS idx_usage_events_token_id ON usage_events(token_id)")

    @staticmethod
    def _ensure_column(connection: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = {row["name"] for row in connection.execute(f"PRAGMA table_info({table})")}
        if column not in columns:
            connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def list_terms(self) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT id, source, target, note, created_at, updated_at FROM glossary_terms ORDER BY source"
            ).fetchall()
        return [dict(row) for row in rows]

    def upsert_term(self, source: str, target: str, note: str = "") -> dict:
        now = utc_now()
        with self.connect() as connection:
            connection.execute(
                """INSERT INTO glossary_terms(source, target, note, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(source) DO UPDATE SET
                     target = excluded.target, note = excluded.note, updated_at = excluded.updated_at""",
                (source, target, note, now, now),
            )
            row = connection.execute(
                "SELECT id, source, target, note, created_at, updated_at FROM glossary_terms WHERE source = ?",
                (source,),
            ).fetchone()
        return dict(row)

    def delete_term(self, term_id: int) -> bool:
        with self.connect() as connection:
            cursor = connection.execute("DELETE FROM glossary_terms WHERE id = ?", (term_id,))
        return cursor.rowcount > 0

    def matching_terms(self, *texts: str) -> list[dict]:
        combined = "\n".join(texts).casefold()
        return [term for term in self.list_terms() if term["source"].casefold() in combined]

    def create_access_token(self, name: str, quota_units: int = 5_000_000) -> tuple[dict, str]:
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Token name is required")
        token = f"ft_{secrets.token_urlsafe(32)}"
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        now = utc_now()
        with self.connect() as connection:
            cursor = connection.execute(
                """INSERT INTO access_tokens(name, token_hash, token_hint, enabled, created_at, quota_units)
                   VALUES (?, ?, ?, 1, ?, ?)""",
                (clean_name, digest, f"{token[:7]}…{token[-4:]}", now, quota_units),
            )
            row = connection.execute(
                """SELECT id, name, token_hint, enabled, created_at, last_used_at, quota_units, used_units
                   FROM access_tokens WHERE id = ?""",
                (cursor.lastrowid,),
            ).fetchone()
        return dict(row), token

    def list_access_tokens(self) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                """SELECT t.id, t.name, t.token_hint, t.enabled, t.created_at, t.last_used_at,
                          t.quota_units, t.used_units, COUNT(u.id) AS requests,
                          COALESCE(SUM(u.input_tokens), 0) AS input_tokens,
                          COALESCE(SUM(u.output_tokens), 0) AS output_tokens
                   FROM access_tokens t LEFT JOIN usage_events u ON u.token_id = t.id
                   GROUP BY t.id ORDER BY t.id"""
            ).fetchall()
        return [dict(row) for row in rows]

    def set_access_token_enabled(self, token_id: int, enabled: bool) -> bool:
        with self.connect() as connection:
            cursor = connection.execute(
                "UPDATE access_tokens SET enabled = ? WHERE id = ?",
                (1 if enabled else 0, token_id),
            )
        return cursor.rowcount > 0

    def revoke_access_token(self, token_id: int) -> bool:
        with self.connect() as connection:
            cursor = connection.execute("DELETE FROM access_tokens WHERE id = ?", (token_id,))
        return cursor.rowcount > 0

    def authenticate_access_token(self, token: str) -> dict | None:
        if not token:
            return None
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with self.connect() as connection:
            row = connection.execute(
                """SELECT id, name, token_hash, token_hint, enabled, created_at, last_used_at,
                          quota_units, used_units
                   FROM access_tokens WHERE token_hash = ? AND enabled = 1""",
                (digest,),
            ).fetchone()
            if row is None or not hmac.compare_digest(row["token_hash"], digest):
                return None
            connection.execute(
                "UPDATE access_tokens SET last_used_at = ? WHERE id = ?",
                (utc_now(), row["id"]),
            )
        result = dict(row)
        result.pop("token_hash", None)
        return result

    def has_available_quota(self, token_id: int) -> bool:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT enabled, quota_units, used_units FROM access_tokens WHERE id = ?",
                (token_id,),
            ).fetchone()
        return row is not None and bool(row["enabled"]) and row["used_units"] < row["quota_units"]

    def record_usage(self, endpoint: str, source: str, model: str, input_tokens: int,
                     output_tokens: int, token_id: int | None = None, billing_units: int = 0) -> None:
        with self.connect() as connection:
            connection.execute(
                """INSERT INTO usage_events(created_at, endpoint, source, model, input_tokens, output_tokens,
                                             token_id, billing_units)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (utc_now(), endpoint, source, model, input_tokens, output_tokens, token_id, billing_units),
            )
            if token_id is not None:
                connection.execute(
                    "UPDATE access_tokens SET used_units = used_units + ? WHERE id = ?",
                    (billing_units, token_id),
                )

    def token_usage(self, token_id: int, recent_limit: int = 10) -> dict | None:
        with self.connect() as connection:
            token = connection.execute(
                """SELECT id, name, token_hint, enabled, created_at, last_used_at, quota_units, used_units
                   FROM access_tokens WHERE id = ?""", (token_id,),
            ).fetchone()
            if token is None:
                return None
            totals = connection.execute(
                """SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS input_tokens,
                          COALESCE(SUM(output_tokens), 0) AS output_tokens
                   FROM usage_events WHERE token_id = ?""", (token_id,),
            ).fetchone()
            recent = connection.execute(
                """SELECT created_at, endpoint, source, model, input_tokens, output_tokens, billing_units
                   FROM usage_events WHERE token_id = ? ORDER BY id DESC LIMIT ?""",
                (token_id, recent_limit),
            ).fetchall()
        return dict(token) | dict(totals) | {"recent": [dict(row) for row in recent]}

    def token_balance(self, token_id: int) -> dict | None:
        with self.connect() as connection:
            row = connection.execute(
                """SELECT t.id, t.name, t.quota_units, t.used_units,
                          COUNT(u.id) AS requests,
                          COALESCE(SUM(u.input_tokens), 0) AS input_tokens,
                          COALESCE(SUM(u.output_tokens), 0) AS output_tokens
                   FROM access_tokens t
                   LEFT JOIN usage_events u ON u.token_id = t.id
                   WHERE t.id = ? AND t.enabled = 1
                   GROUP BY t.id""",
                (token_id,),
            ).fetchone()
        return dict(row) if row is not None else None

    def add_token_quota(self, token_id: int, units: int) -> bool:
        with self.connect() as connection:
            cursor = connection.execute(
                "UPDATE access_tokens SET quota_units = quota_units + ? WHERE id = ?", (units, token_id),
            )
        return cursor.rowcount > 0

    def set_token_quota(self, token_id: int, units: int) -> bool:
        with self.connect() as connection:
            cursor = connection.execute(
                "UPDATE access_tokens SET quota_units = ? WHERE id = ?", (units, token_id),
            )
        return cursor.rowcount > 0

    def reset_token_usage(self, token_id: int) -> bool:
        with self.connect() as connection:
            cursor = connection.execute("UPDATE access_tokens SET used_units = 0 WHERE id = ?", (token_id,))
        return cursor.rowcount > 0

    def usage_summary(self) -> dict:
        with self.connect() as connection:
            totals = connection.execute(
                """SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS input_tokens,
                          COALESCE(SUM(output_tokens), 0) AS output_tokens
                   FROM usage_events"""
            ).fetchone()
            groups = connection.execute(
                """SELECT endpoint, COUNT(*) AS requests, SUM(input_tokens) AS input_tokens,
                          SUM(output_tokens) AS output_tokens
                   FROM usage_events GROUP BY endpoint ORDER BY endpoint"""
            ).fetchall()
        result = dict(totals)
        result["total_tokens"] = result["input_tokens"] + result["output_tokens"]
        result["by_endpoint"] = [dict(row) | {"total_tokens": row["input_tokens"] + row["output_tokens"]} for row in groups]
        return result
