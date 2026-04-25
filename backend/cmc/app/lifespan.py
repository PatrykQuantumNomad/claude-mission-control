"""FastAPI lifespan: engine creation, alembic upgrade, session factory, dispose.

Per RESEARCH.md Pattern 2 + the locked CONTEXT.md decision for FOUND-05.
Uses the Plan 04 shared-connection pattern so migrations run against the
same engine the app uses.

Path resolution: `settings.alembic_ini_path` and `settings.db_path` are
already ABSOLUTE paths anchored at the repo root (Plan 02's model_validator
runs `resolve_under_repo_root()` on them). The lifespan trusts them as-is —
no cwd-relative fallbacks here. If alembic.ini is genuinely missing,
RuntimeError is the right behavior (CI/dev would surface it immediately).
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI

from cmc.db import create_engine_for_settings, make_sessionmaker


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = app.state.settings

    # Create the engine (pragma listener attached inside helper, per Plan 04).
    # settings.db_path is absolute (Plan 02 model_validator), so cwd doesn't matter.
    engine = create_engine_for_settings(settings)

    # settings.alembic_ini_path is absolute (Plan 02 model_validator). If it
    # doesn't exist, fail loud — that means the repo layout broke or someone
    # deleted alembic.ini.
    ini_path = settings.alembic_ini_path
    if not ini_path.exists():
        await engine.dispose()
        raise RuntimeError(
            f"Alembic config not found at {ini_path}. "
            f"Expected backend/alembic.ini under repo root. "
            f"Run from repo root: `uvicorn --app-dir backend cmc.app:create_app --factory`."
        )

    alembic_cfg = AlembicConfig(str(ini_path))
    # Override sqlalchemy.url so standalone CLI fallback (in env.py) wouldn't
    # hit a different DB than the lifespan-created engine.
    alembic_cfg.set_main_option(
        "sqlalchemy.url", f"sqlite+aiosqlite:///{settings.db_path}"
    )
    # BLOCKER 1 follow-through: alembic.ini's `script_location = migrations` is
    # relative to cwd by default. To make the lifespan truly cwd-independent
    # (the contract Plan 02's repo-root path resolver guarantees), absolutize
    # script_location against the ini file's parent directory.
    alembic_cfg.set_main_option(
        "script_location", str(ini_path.parent / "migrations")
    )

    async with engine.begin() as conn:
        def _upgrade(sync_conn) -> None:
            alembic_cfg.attributes["connection"] = sync_conn
            command.upgrade(alembic_cfg, "head")
        await conn.run_sync(_upgrade)

    app.state.engine = engine
    app.state.sessions = make_sessionmaker(engine)

    try:
        yield
    finally:
        await engine.dispose()
