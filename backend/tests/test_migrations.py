"""Phase 13 INGST-12 — migration upgrade/downgrade tests against ephemeral SQLite."""
import json
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
