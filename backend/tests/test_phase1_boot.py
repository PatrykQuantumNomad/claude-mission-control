"""Phase 1 boot tests. Each Plan in Phase 1 appends tests here.

Plan 02 (this file): FOUND-04 (Settings load + pretty error + repo-root path resolution)
Plan 04 (DB engine): FOUND-02 (engine, pragmas, table creation)
Plan 05 (models + migration): FOUND-02 (15 tables present), FOUND-03 (column-exists helper)
Plan 06 (app factory + lifespan): FOUND-01 (app factory), FOUND-05 (lifespan disposes engine)
Plan 07 (smoke): FOUND-06 (SPA root + deep link + /api/health not shadowed)
"""
from __future__ import annotations

import pytest
from sqlalchemy import text

from cmc.config import Settings, load_settings
from cmc.db import create_engine_for_settings, make_sessionmaker


# ---- FOUND-04: pydantic-settings ----


def test_settings_defaults_with_no_env(clean_env):
    """FOUND-04: Settings loads sensible defaults when no env/.env present."""
    s = Settings()
    assert s.host == "127.0.0.1"
    assert s.port == 8765
    assert s.log_level == "INFO"


def test_settings_db_path_is_repo_root_anchored(clean_env, monkeypatch, tmp_path):
    """FOUND-04 + BLOCKER 1 fix: db_path is cwd-independent, anchored at repo root.

    The same default Settings() must produce the same absolute db_path whether the
    process cwd is the repo root or somewhere else (like backend/).
    """
    # First, capture the default from the actual repo root context
    s1 = Settings()
    # Now chdir into a tmp dir and re-instantiate — must produce IDENTICAL absolute path
    monkeypatch.chdir(tmp_path)
    s2 = Settings()
    assert s1.db_path == s2.db_path, f"db_path drifted with cwd: {s1.db_path} vs {s2.db_path}"
    assert s1.db_path.is_absolute()
    assert str(s1.db_path).endswith("data/cmc.db")


def test_settings_alembic_ini_path_is_repo_root_anchored(clean_env, monkeypatch, tmp_path):
    """FOUND-04 + BLOCKER 1 fix: alembic_ini_path is cwd-independent."""
    s1 = Settings()
    monkeypatch.chdir(tmp_path)
    s2 = Settings()
    assert s1.alembic_ini_path == s2.alembic_ini_path
    assert s1.alembic_ini_path.is_absolute()
    assert str(s1.alembic_ini_path).endswith("backend/alembic.ini")


def test_settings_pretty_error_on_invalid(clean_env, monkeypatch, capsys):
    """FOUND-04: Invalid env value triggers pretty error and SystemExit(1)."""
    monkeypatch.setenv("PORT", "not-a-number")
    with pytest.raises(SystemExit) as exc_info:
        load_settings()
    assert exc_info.value.code == 1
    captured = capsys.readouterr()
    # Must mention the field name
    assert "port" in captured.err.lower()
    # Must NOT leak the rejected value (Security Domain V7)
    assert "not-a-number" not in captured.err
    # Must be readable, not a Python traceback
    assert "Traceback" not in captured.err


def test_settings_env_var_override(clean_env, monkeypatch):
    """FOUND-04: Env vars override defaults."""
    monkeypatch.setenv("PORT", "9000")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")
    s = Settings()
    assert s.port == 9000
    assert s.log_level == "DEBUG"


def test_settings_absolute_db_path_preserved(clean_env, monkeypatch, tmp_path):
    """FOUND-04: User-supplied absolute DB_PATH is NOT clobbered by the repo-root resolver."""
    abs_db = tmp_path / "user.db"
    monkeypatch.setenv("DB_PATH", str(abs_db))
    s = Settings()
    assert s.db_path == abs_db


# ---- FOUND-02 (Plan 04): engine + pragmas ----


@pytest.mark.asyncio
async def test_engine_creation_and_disposal(test_settings):
    """FOUND-02: Engine creates without error and disposes cleanly."""
    engine = create_engine_for_settings(test_settings)
    try:
        assert engine is not None
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_wal_mode_active(test_settings):
    """FOUND-02: PRAGMA journal_mode returns 'wal' after first connect."""
    engine = create_engine_for_settings(test_settings)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("PRAGMA journal_mode"))
            row = result.fetchone()
            assert row[0].lower() == "wal"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_foreign_keys_enabled(test_settings):
    """FOUND-02: PRAGMA foreign_keys returns 1 (per Pitfall 1 — autocommit toggle works)."""
    engine = create_engine_for_settings(test_settings)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("PRAGMA foreign_keys"))
            row = result.fetchone()
            assert row[0] == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_sessionmaker_yields_working_session(test_settings):
    """FOUND-02: sessionmaker produces sessions that can execute queries."""
    engine = create_engine_for_settings(test_settings)
    sm = make_sessionmaker(engine)
    try:
        async with sm() as session:
            result = await session.execute(text("SELECT 1"))
            assert result.scalar() == 1
    finally:
        await engine.dispose()


# Plan 05 will append tests for the 15 tables + column-exists helper
# Plan 06 will append tests for app factory + lifespan
# Plan 07 will append tests for SPA root + deep link + /api/health
