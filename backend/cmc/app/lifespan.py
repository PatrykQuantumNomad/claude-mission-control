"""FastAPI lifespan: engine + alembic upgrade + sessions + Phase 2 ingestion task.

Phase 1 layers (unchanged): engine creation with pragma listener, alembic upgrade
to head, session factory wiring, dispose on exit.

Phase 2 layers (added by Plan 02-05):
  - Boot-time `sync_once` so the dashboard has data immediately (INGST-01 first half).
  - `asyncio.create_task(periodic_sync_loop(...))` for the 120s recurring scrape
    stored as `app.state.sync_task` (INGST-01 second half).
  - Clean cancellation on shutdown so uvicorn ^C exits without zombie warnings.

Per research §3 + Pitfall 7: the periodic loop is sleep-first inside, so the
boot-time sync_once won't be immediately duplicated by the loop's first iteration.

Boot-sync error handling: if sync_once raises at boot (e.g. transient FS error,
DB lock during alembic-stamped schema), the lifespan logs but STILL starts the
periodic loop and yields. The loop will retry every 120s anyway — a one-time
boot failure shouldn't prevent the server from coming up.

Path resolution: `settings.alembic_ini_path` and `settings.db_path` are
already ABSOLUTE paths anchored at the repo root (Plan 02's model_validator
runs `resolve_under_repo_root()` on them). The lifespan trusts them as-is —
no cwd-relative fallbacks here. If alembic.ini is genuinely missing,
RuntimeError is the right behavior (CI/dev would surface it immediately).
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI

from cmc.db import create_engine_for_settings, make_sessionmaker
from cmc.ingest.scheduler import periodic_sync_loop, sync_once

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = app.state.settings

    # Phase 3 SAPI-02 reads this for uptime calc; set BEFORE alembic upgrade so
    # it's the moment the process started serving.
    app.state.boot_time = datetime.now(timezone.utc)

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

    # Phase 2: boot-time sync + periodic loop. Wrap boot sync in try/except so a
    # transient FS error doesn't prevent the server from coming up — research
    # rationale: the loop will retry every 120s anyway.
    try:
        boot_summary = await sync_once(app.state.sessions, settings)
        log.info("ingest.boot_sync %s", boot_summary)
    except Exception:
        log.exception("ingest.boot_sync_failed")

    sync_task = asyncio.create_task(
        periodic_sync_loop(app.state.sessions, settings, interval_s=120),
        name="cmc-periodic-sync",
    )
    app.state.sync_task = sync_task

    try:
        yield
    finally:
        # Cancel the periodic sync task BEFORE disposing the engine — otherwise the
        # in-flight cycle could try to use a disposed engine and log spurious errors.
        # Pattern proven by Plan 02-04 Test 6 (clean cancellation): cancel + await +
        # swallow CancelledError so no "Task was destroyed but it is pending" warnings.
        sync_task = getattr(app.state, "sync_task", None)
        if sync_task is not None:
            sync_task.cancel()
            try:
                await sync_task
            except asyncio.CancelledError:
                pass
        await engine.dispose()
