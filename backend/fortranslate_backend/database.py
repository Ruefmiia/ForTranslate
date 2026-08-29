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
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens >= 0)
);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);
CREATE TABLE IF NOT EXISTS access_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_hint TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    created_at TEXT NOT NULL,
    last_used_at TEXT
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

    def create_access_token(self, name: str) -> tuple[dict, str]:
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Token name is required")
        token = f"ft_{secrets.token_urlsafe(32)}"
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        now = utc_now()
        with self.connect() as connection:
            cursor = connection.execute(
                """INSERT INTO access_tokens(name, token_hash, token_hint, enabled, created_at)
                   VALUES (?, ?, ?, 1, ?)""",
                (clean_name, digest, f"{token[:7]}…{token[-4:]}", now),
            )
            row = connection.execute(
                """SELECT id, name, token_hint, enabled, created_at, last_used_at
                   FROM access_tokens WHERE id = ?""",
                (cursor.lastrowid,),
            ).fetchone()
        return dict(row), token

    def list_access_tokens(self) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                """SELECT id, name, token_hint, enabled, created_at, last_used_at
                   FROM access_tokens ORDER BY id"""
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
                """SELECT id, name, token_hash, token_hint, enabled, created_at, last_used_at
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

    def record_usage(self, endpoint: str, source: str, model: str, input_tokens: int, output_tokens: int) -> None:
        with self.connect() as connection:
            connection.execute(
                """INSERT INTO usage_events(created_at, endpoint, source, model, input_tokens, output_tokens)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (utc_now(), endpoint, source, model, input_tokens, output_tokens),
            )

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
