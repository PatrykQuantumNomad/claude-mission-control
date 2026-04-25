"""Pytest fixtures for Phase 1.

Plans 04-06 will extend this with engine/session/app fixtures. For Plan 02
we just need test settings and a tmp-path fixture for db_path.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from cmc.config import Settings


@pytest.fixture
def clean_env(monkeypatch):
    """Strip CMC-related env vars so Settings() falls back to defaults."""
    for k in list(os.environ.keys()):
        if k.upper() in {
            "HOST",
            "PORT",
            "DB_PATH",
            "DB_ECHO",
            "LOG_LEVEL",
            "STATIC_DIR",
            "ALEMBIC_INI_PATH",
        }:
            monkeypatch.delenv(k, raising=False)


@pytest.fixture
def tmp_db_path(tmp_path: Path) -> Path:
    """Per-test fresh DB path. Plans 04-06 use this."""
    return tmp_path / "cmc.db"


@pytest.fixture
def test_settings(clean_env, tmp_db_path) -> Settings:
    """Settings instance with a tmp DB path. Plans 04-06 use this.

    Note: tmp_db_path is absolute, so Settings' repo-root resolver leaves it untouched.
    """
    return Settings(db_path=tmp_db_path)


@pytest.fixture
def tmp_static_dir(tmp_path: Path) -> Path:
    """Create a fake frontend/dist with a minimal index.html for SPA tests."""
    static = tmp_path / "dist"
    static.mkdir()
    (static / "index.html").write_text(
        '<!DOCTYPE html><html><body>'
        '<div id="root">test-spa-marker</div>'
        '</body></html>'
    )
    return static


@pytest.fixture
def test_settings_with_static(test_settings, tmp_static_dir) -> Settings:
    """Variant of test_settings with a real static_dir set.

    Uses model_copy(update=...) (NOT a fresh Settings(...)) so we don't re-trigger
    Pydantic env loading and pick up CMC_* env vars outside clean_env's scope.
    The base test_settings fixture already chained clean_env, so all CMC env vars
    are already stripped at this point — model_copy preserves that state and only
    overrides static_dir. (BLOCKER 4 fix.)
    """
    return test_settings.model_copy(update={"static_dir": tmp_static_dir})
