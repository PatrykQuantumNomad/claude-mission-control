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
