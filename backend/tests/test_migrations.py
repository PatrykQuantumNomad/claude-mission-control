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


def test_0004_upgrade_from_0003(tmp_path):
    """Migration 0004 creates the saved_views table.

    Phase 25 (VIEW-02). Asserts the table, its 8 columns, the route index,
    and the UNIQUE (route, name) constraint all exist after upgrade. Mirrors
    the test_0003_* shape: tmp_path + _alembic_cfg + raw sqlite3 PRAGMA
    inspection — no live engine required.
    """
    db = tmp_path / "test.db"
    cfg = _alembic_cfg(db)
    command.upgrade(cfg, "0003_project_key")
    command.upgrade(cfg, "0004_saved_views")

    conn = sqlite3.connect(str(db))

    # 1. Table presence.
    tables = {
        r[0]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert "saved_views" in tables, "saved_views table missing after 0004 upgrade"

    # 2. All 8 columns present, none missing, none extra.
    cols = {r[1] for r in conn.execute("PRAGMA table_info(saved_views)")}
    assert cols == {
        "id",
        "name",
        "description",
        "route",
        "state_json",
        "schema_version",
        "created_at",
        "updated_at",
    }, f"saved_views columns mismatch: {cols!r}"

    # 3. Route index exists (non-unique, for per-route listing).
    indexes = [r for r in conn.execute("PRAGMA index_list(saved_views)")]
    # PRAGMA index_list returns: (seq, name, unique, origin, partial)
    index_by_name = {row[1]: row for row in indexes}
    assert "idx_saved_views_route" in index_by_name, (
        "idx_saved_views_route missing after 0004 upgrade"
    )
    assert index_by_name["idx_saved_views_route"][2] == 0, (
        "idx_saved_views_route should be non-unique (unique=0)"
    )

    # 4. UNIQUE (route, name) constraint enforcement.
    # SQLite stores a CREATE TABLE-level UNIQUE constraint as a named CONSTRAINT
    # in the table DDL plus an auto-generated `sqlite_autoindex_*` index. The
    # named constraint identity (uq_saved_views_route_name) lives in the DDL
    # string, and the enforcement lives in the unique autoindex on the same
    # columns. Assert both: the symbolic name in the DDL (for future migration
    # `op.drop_constraint("uq_saved_views_route_name")` to remain valid) AND a
    # unique index covering (route, name) for runtime enforcement.
    create_sql = conn.execute(
        "SELECT sql FROM sqlite_master "
        "WHERE type='table' AND name='saved_views'"
    ).fetchone()[0]
    assert "uq_saved_views_route_name" in create_sql, (
        "uq_saved_views_route_name constraint name missing from saved_views "
        f"CREATE TABLE DDL: {create_sql!r}"
    )
    assert "UNIQUE (route, name)" in create_sql, (
        f"UNIQUE (route, name) clause missing from DDL: {create_sql!r}"
    )

    # Runtime enforcement: any unique index covering exactly (route, name).
    unique_index_covers_route_name = False
    for _seq, idx_name, is_unique, _origin, _partial in indexes:
        if is_unique != 1:
            continue
        idx_cols = [
            r[2] for r in conn.execute(f"PRAGMA index_info({idx_name})")
        ]
        if idx_cols == ["route", "name"]:
            unique_index_covers_route_name = True
            break
    assert unique_index_covers_route_name, (
        "No unique index on (route, name) found — UNIQUE constraint is not "
        f"runtime-enforced. index_list={indexes!r}"
    )

    # Runtime probe: a duplicate (route, name) insert MUST raise IntegrityError.
    conn.execute(
        "INSERT INTO saved_views "
        "(name, description, route, state_json, schema_version, "
        "created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("v1", "", "/skills", "{}", 1,
         "2026-05-12T00:00:00", "2026-05-12T00:00:00"),
    )
    conn.commit()
    try:
        conn.execute(
            "INSERT INTO saved_views "
            "(name, description, route, state_json, schema_version, "
            "created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("v1", "", "/skills", "{}", 1,
             "2026-05-12T00:00:00", "2026-05-12T00:00:00"),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        pass  # expected
    else:
        raise AssertionError(
            "Duplicate (route, name) insert did NOT raise IntegrityError — "
            "UNIQUE (route, name) is not actually enforced."
        )

    conn.close()


def test_0004_downgrade_to_0003(tmp_path):
    """Downgrade removes the saved_views table cleanly.

    Asserts pre-downgrade presence, then post-downgrade absence of the
    saved_views table — the 0003 schema is otherwise untouched.
    """
    db = tmp_path / "test.db"
    cfg = _alembic_cfg(db)
    command.upgrade(cfg, "0004_saved_views")

    conn = sqlite3.connect(str(db))
    tables_before = {
        r[0]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert "saved_views" in tables_before, (
        "saved_views should exist at 0004 head before downgrade"
    )
    conn.close()

    command.downgrade(cfg, "0003_project_key")

    conn = sqlite3.connect(str(db))
    tables_after = {
        r[0]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert "saved_views" not in tables_after, (
        "saved_views should be dropped on downgrade to 0003"
    )
    conn.close()
