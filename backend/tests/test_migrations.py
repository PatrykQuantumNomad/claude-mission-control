"""Phase 13 INGST-12 — migration upgrade/downgrade tests against ephemeral SQLite."""
import hashlib
import json
import os
import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config


def _alembic_cfg(db_path: Path) -> Config:
    repo_root = Path(__file__).resolve().parent.parent.parent
    cfg = Config(str(repo_root / "backend" / "alembic.ini"))
    # Use aiosqlite driver — env.py runs an async engine via async_engine_from_config.
    cfg.set_main_option("sqlalchemy.url", f"sqlite+aiosqlite:///{db_path}")
    cfg.set_main_option("script_location", str(repo_root / "backend" / "migrations"))
    return cfg


def test_0002_upgrade_from_0001(tmp_path):
    db = tmp_path / "test.db"
    cfg = _alembic_cfg(db)
    command.upgrade(cfg, "0001_initial")
    command.upgrade(cfg, "0002_v1_1_alerts_and_skills")
    conn = sqlite3.connect(str(db))
    tables = {
        r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert "pricing" in tables
    assert "alert_rules" in tables
    assert "alert_state" in tables
    cols = {r[1] for r in conn.execute("PRAGMA table_info(otel_events)")}
    assert "attrs_skill_name" in cols
    assert "otel_event_id" in cols
    s_cols = {r[1] for r in conn.execute("PRAGMA table_info(sessions)")}
    assert "tokens_cache_create_5m" in s_cols
    assert "tokens_cache_create_1h" in s_cols
    t_cols = {r[1] for r in conn.execute("PRAGMA table_info(token_usage)")}
    assert "tokens_cache_create_5m" in t_cols
    assert "tokens_cache_create_1h" in t_cols
    # Verify pricing.seed_hash column for Plan 05 drift check
    p_cols = {r[1] for r in conn.execute("PRAGMA table_info(pricing)")}
    assert "seed_hash" in p_cols, (
        "pricing.seed_hash missing — Plan 05 drift check will be unimplementable"
    )
    # Verify the 5 *_per_mtok columns also present
    for c in (
        "input_per_mtok",
        "output_per_mtok",
        "cache_read_per_mtok",
        "cache_create_5m_per_mtok",
        "cache_create_1h_per_mtok",
    ):
        assert c in p_cols, f"pricing.{c} missing"
    # Verify UNIQUE constraint exists on otel_events
    indexes = [r[1] for r in conn.execute("PRAGMA index_list(otel_events)")]
    assert any("uq_otel_events_session_seq" in i for i in indexes)
    conn.close()


def test_0002_downgrade_to_0001(tmp_path):
    db = tmp_path / "test.db"
    cfg = _alembic_cfg(db)
    command.upgrade(cfg, "0002_v1_1_alerts_and_skills")
    command.downgrade(cfg, "0001_initial")
    conn = sqlite3.connect(str(db))
    tables = {
        r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert "pricing" not in tables
    assert "alert_rules" not in tables
    assert "alert_state" not in tables
    cols = {r[1] for r in conn.execute("PRAGMA table_info(otel_events)")}
    assert "attrs_skill_name" not in cols
    assert "otel_event_id" not in cols
    s_cols = {r[1] for r in conn.execute("PRAGMA table_info(sessions)")}
    assert "tokens_cache_create_5m" not in s_cols
    assert "tokens_cache_create_1h" not in s_cols
    conn.close()


def test_0002_bug_b_backfill(tmp_path):
    """Verify the SQL backfill clause works on synthetic body shape."""
    db = tmp_path / "test.db"
    cfg = _alembic_cfg(db)
    command.upgrade(cfg, "0001_initial")
    # Insert 1 fake otel_events row with NULL session_id but session.id in body.
    conn = sqlite3.connect(str(db))
    body = {
        "record": {
            "attributes": [
                {"key": "session.id", "value": {"stringValue": "abc-123"}}
            ]
        }
    }
    conn.execute(
        "INSERT INTO otel_events "
        "(ts, event_name, session_id, body, received_at) VALUES (?, ?, ?, ?, ?)",
        (
            "2026-05-03T00:00:00",
            "api_request",
            None,
            json.dumps(body),
            "2026-05-03T00:00:00",
        ),
    )
    conn.commit()
    conn.close()
    # Run the upgrade — backfill should populate session_id.
    command.upgrade(cfg, "0002_v1_1_alerts_and_skills")
    conn = sqlite3.connect(str(db))
    sid = conn.execute("SELECT session_id FROM otel_events").fetchone()[0]
    conn.close()
    assert sid == "abc-123"


def _seed_session_for_0003(
    conn: sqlite3.Connection, session_id: str, cwd: str | None
) -> None:
    """Insert a minimal sessions row at revision 0002.

    Sets every NOT NULL column the schema requires after 0002 (started_at,
    synced_at, jsonl_mtime, jsonl_path, the 6 token counters that default to 0,
    the cache TTL split columns, etc.). Leaves cwd/ended_at flexible.
    """
    conn.execute(
        """
        INSERT INTO sessions (
            session_id, started_at, ended_at, synced_at, jsonl_mtime,
            jsonl_path, cwd, project_hash, model, source, outcome,
            tokens_input, tokens_output, tokens_cache_read, tokens_cache_create,
            tokens_cache_create_5m, tokens_cache_create_1h,
            tool_call_count, message_count, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, NULL)
        """,
        (
            session_id,
            "2026-05-06T00:00:00",
            None,
            "2026-05-06T00:00:00",
            "2026-05-06T00:00:00",
            f"/tmp/{session_id}.jsonl",
            cwd,
            None,
            None,
            "claude-code",
            None,
        ),
    )


def test_0003_upgrade_from_0002(tmp_path):
    """Migration 0003 adds project_key column with index and backfills existing rows.

    Steps:
      1. Initialize DB at revision 0002.
      2. Insert two seed rows: one with cwd='/tmp/proj/a', one with cwd=''.
      3. Upgrade to 0003 — backfill should populate the first, leave the second blank.
      4. Assert column + index exist; backfilled values match the inlined formula.
    """
    db = tmp_path / "test.db"
    cfg = _alembic_cfg(db)
    command.upgrade(cfg, "0002_v1_1_alerts_and_skills")

    seeded_cwd = "/tmp/proj/a"  # non-existent path — Pitfall 5 path
    conn = sqlite3.connect(str(db))
    _seed_session_for_0003(conn, "sess-with-cwd", seeded_cwd)
    _seed_session_for_0003(conn, "sess-empty-cwd", "")
    conn.commit()
    conn.close()

    command.upgrade(cfg, "0003_project_key")

    conn = sqlite3.connect(str(db))
    # 1. Column exists.
    cols = {r[1] for r in conn.execute("PRAGMA table_info(sessions)")}
    assert "project_key" in cols, "project_key column missing after 0003 upgrade"
    # 2. Index exists.
    indexes = [r[1] for r in conn.execute("PRAGMA index_list(sessions)")]
    assert "idx_sessions_project_key" in indexes, (
        "idx_sessions_project_key missing after 0003 upgrade"
    )
    # 3. Backfilled value matches sha1[:12](realpath(cwd.rstrip('/'))) — the
    # inline formula in the migration must agree with cmc.core.project_key.
    pk_with = conn.execute(
        "SELECT project_key FROM sessions WHERE session_id = ?",
        ("sess-with-cwd",),
    ).fetchone()[0]
    canonical = os.path.realpath(seeded_cwd.rstrip("/"))
    expected = hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:12]
    assert pk_with == expected, (
        f"backfilled project_key mismatch: got {pk_with!r}, expected {expected!r}"
    )
    assert len(pk_with) == 12, f"expected 12-char key, got {len(pk_with)}"
    # 4. Empty-cwd row keeps the empty default — no backfill, no error.
    pk_empty = conn.execute(
        "SELECT project_key FROM sessions WHERE session_id = ?",
        ("sess-empty-cwd",),
    ).fetchone()[0]
    assert pk_empty == "", (
        f"empty-cwd session should have project_key='', got {pk_empty!r}"
    )
    conn.close()


def test_0003_downgrade_to_0002(tmp_path):
    """Downgrade removes the column and index without error."""
    db = tmp_path / "test.db"
    cfg = _alembic_cfg(db)
    command.upgrade(cfg, "0003_project_key")
    # Confirm pre-downgrade state.
    conn = sqlite3.connect(str(db))
    cols_before = {r[1] for r in conn.execute("PRAGMA table_info(sessions)")}
    assert "project_key" in cols_before
    indexes_before = [r[1] for r in conn.execute("PRAGMA index_list(sessions)")]
    assert "idx_sessions_project_key" in indexes_before
    conn.close()

    command.downgrade(cfg, "0002_v1_1_alerts_and_skills")

    conn = sqlite3.connect(str(db))
    cols_after = {r[1] for r in conn.execute("PRAGMA table_info(sessions)")}
    assert "project_key" not in cols_after, (
        "project_key column should be dropped on downgrade"
    )
    indexes_after = [r[1] for r in conn.execute("PRAGMA index_list(sessions)")]
    assert "idx_sessions_project_key" not in indexes_after, (
        "idx_sessions_project_key should be dropped on downgrade"
    )
    conn.close()
