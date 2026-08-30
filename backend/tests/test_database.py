import sqlite3

from fortranslate_backend.database import Database


def test_existing_database_is_migrated_with_default_quota(tmp_path):
    path = tmp_path / "legacy.db"
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE access_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            token_hint TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            last_used_at TEXT
        );
        CREATE TABLE usage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO access_tokens(name, token_hash, token_hint, enabled, created_at)
        VALUES ('existing-user', 'hash', 'ft_test…test', 1, '2026-08-30T00:00:00+00:00');
        """
    )
    connection.commit()
    connection.close()

    database = Database(path)
    database.initialize()
    token = database.list_access_tokens()[0]
    assert token["name"] == "existing-user"
    assert token["quota_units"] == 5_000_000
    assert token["used_units"] == 0

    with database.connect() as migrated:
        usage_columns = {row["name"] for row in migrated.execute("PRAGMA table_info(usage_events)")}
    assert {"token_id", "billing_units"} <= usage_columns
