"""FastAPI lifespan: engine, migrations, sessions, and ingestion scheduling.

Startup work:
  - Engine creation with SQLite pragma listener.
  - Alembic upgrade to head.
  - Session factory wiring.
  - Boot-time `sync_once` so the dashboard has data immediately.
  - `asyncio.create_task(periodic_sync_loop(...))` for the 120s recurring scrape,
    stored as `app.state.sync_task`.
  - Clean cancellation on shutdown so uvicorn ^C exits without zombie warnings.

The periodic loop is sleep-first inside, so the boot-time sync_once is not
immediately duplicated by the loop's first iteration.

Boot-sync error handling: if sync_once raises at boot (e.g. transient FS error,
DB lock during alembic-stamped schema), the lifespan logs but STILL starts the
periodic loop and yields. The loop will retry every 120s anyway — a one-time
boot failure shouldn't prevent the server from coming up.

Path resolution: `settings.alembic_ini_path` and `settings.db_path` are
already ABSOLUTE paths anchored at the repo root by Settings. The lifespan
trusts them as-is — no cwd-relative fallbacks here. If alembic.ini is genuinely
missing, RuntimeError is the right behavior (CI/dev would surface it immediately).
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import httpx
from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI

from cmc.auth import JWTAuthService
from cmc.db import create_engine_for_settings, make_sessionmaker
from cmc.db.health import check_database_readiness
from cmc.ingest.scheduler import periodic_sync_loop, sync_once
from cmc.observability import instrument_database_engine
from cmc.readiness import ReadinessCheckResult, ReadinessRegistry

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = app.state.settings
    if not hasattr(app.state, "readiness_registry"):
        app.state.readiness_registry = ReadinessRegistry()
        app.state.readiness_registry.register("application", _application_ready)

    # System health reads this for uptime; set it before migrations so it
    # reflects process startup, not first successful request.
    app.state.boot_time = datetime.now(UTC)

    # Create the engine; the SQLite pragma listener is attached inside the helper.
    # settings.db_path is absolute, so cwd doesn't matter.
    engine = create_engine_for_settings(settings)
    instrument_database_engine(engine, settings)
    app.state.readiness_registry.register("database", check_database_readiness)

    http_client = httpx.AsyncClient(timeout=5.0)
    auth_service = JWTAuthService(settings, http_client)
    app.state.http_client = http_client
    app.state.auth_service = auth_service
    app.state.readiness_registry.register("auth", auth_service.readiness_check)
    try:
        await auth_service.warm_up()
    except Exception:
        log.exception("auth.warmup_failed")

    # settings.alembic_ini_path is absolute. If it doesn't exist, fail loud —
    # that means the repo layout broke or someone deleted alembic.ini.
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
    # alembic.ini's `script_location = migrations` is relative to cwd by default.
    # Absolutize it against the ini file's parent directory so startup works from
    # both repo root and backend/.
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

    # Phase 13 ANLY-02: idempotent pricing seed from data/pricing.json. Wrapped in
    # try/except so a malformed JSON cannot prevent boot — doctor surfaces the failure.
    from cmc.pricing import load_seed as load_pricing_seed
    async with app.state.sessions() as seed_session:
        try:
            seed_summary = await load_pricing_seed(seed_session)
            log.info("pricing.boot_seed %s", seed_summary)
        except Exception:
            log.exception("pricing.boot_seed_failed")

    # Boot-time sync + periodic loop. Wrap boot sync in try/except so a transient
    # filesystem or database error doesn't prevent the server from coming up; the
    # loop will retry every 120s.
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
        # Cancel + await + swallow CancelledError so no "Task was destroyed but
        # it is pending" warnings appear on shutdown.
        sync_task = getattr(app.state, "sync_task", None)
        if sync_task is not None:
            sync_task.cancel()
            try:
                await sync_task
            except asyncio.CancelledError:
                pass
        await http_client.aclose()
        await engine.dispose()


def _application_ready(app: FastAPI) -> ReadinessCheckResult:
    _ = app
    return ReadinessCheckResult.ok("application")
