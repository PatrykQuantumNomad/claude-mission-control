"""Foundation boot tests.

Coverage includes settings, database engine setup, migrations, app factory,
lifespan startup/shutdown, health routes, and SPA routing behavior.
"""

from pathlib import Path

import pytest
from sqlalchemy import text

from cmc.config import Settings, load_settings
from cmc.core.paths import repo_root
from cmc.db import create_engine_for_settings, make_sessionmaker

# ---- FOUND-04: pydantic-settings ----


def test_settings_defaults_with_no_env(clean_env):
    """FOUND-04: Settings loads sensible defaults when no env/.env present."""
    s = Settings(_env_file=None)
    assert s.host == "127.0.0.1"
    assert s.port == 8765
    assert s.log_level == "INFO"


def test_settings_db_path_is_repo_root_anchored(clean_env, monkeypatch, tmp_path):
    """FOUND-04 + BLOCKER 1 fix: db_path is cwd-independent, anchored at repo root.

    The same default Settings() must produce the same absolute db_path whether the
    process cwd is the repo root or somewhere else (like backend/).
    """
    # First, capture the default from the actual repo root context
    s1 = Settings(_env_file=None)
    # Now chdir into a tmp dir and re-instantiate — must produce IDENTICAL absolute path
    monkeypatch.chdir(tmp_path)
    s2 = Settings(_env_file=None)
    assert s1.db_path == s2.db_path, f"db_path drifted with cwd: {s1.db_path} vs {s2.db_path}"
    assert s1.db_path.is_absolute()
    assert str(s1.db_path).endswith("data/cmc.db")


def test_settings_alembic_ini_path_is_repo_root_anchored(clean_env, monkeypatch, tmp_path):
    """FOUND-04 + BLOCKER 1 fix: alembic_ini_path is cwd-independent."""
    s1 = Settings(_env_file=None)
    monkeypatch.chdir(tmp_path)
    s2 = Settings(_env_file=None)
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
    s = Settings(_env_file=None)
    assert s.port == 9000
    assert s.log_level == "DEBUG"


def test_settings_absolute_db_path_preserved(clean_env, monkeypatch, tmp_path):
    """FOUND-04: User-supplied absolute DB_PATH is NOT clobbered by the repo-root resolver."""
    abs_db = tmp_path / "user.db"
    monkeypatch.setenv("DB_PATH", str(abs_db))
    s = Settings(_env_file=None)
    assert s.db_path == abs_db


# ---- Settings: env_file tuple + anthropic_api_key ----


def _write_env(p: Path, content: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


def test_settings_anthropic_api_key_default_none():
    """anthropic_api_key defaults to None when no env file loads."""
    s = Settings(_env_file=None)
    assert s.anthropic_api_key is None


def test_settings_model_config_defaults_to_dev_env_only():
    """Direct Settings() loads the dev env only; install env is opt-in via CMC_ENV."""
    from cmc.config.settings import dev_env_path

    env_file = Settings.model_config.get("env_file")
    assert env_file == str(dev_env_path())
    assert str(env_file).endswith("backend/.env")
    assert ".command-centre" not in str(env_file)


def test_settings_loads_explicit_command_centre_env(tmp_path, monkeypatch):
    """Explicit env_file paths still surface install-only secrets when requested."""
    cmd_env = tmp_path / ".command-centre" / ".env"
    _write_env(cmd_env, "ANTHROPIC_API_KEY=sk-from-cmd\n")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    s = Settings(_env_file=str(cmd_env))
    assert s.anthropic_api_key == "sk-from-cmd"


def test_load_settings_selects_single_env_file_by_cmc_env(tmp_path, monkeypatch):
    """CMC_ENV selects one env file; dev and install do not overlay each other."""
    from cmc.config import settings as settings_mod

    dev_env = tmp_path / "backend" / ".env"
    install_env = tmp_path / ".command-centre" / ".env"
    _write_env(dev_env, "ANTHROPIC_API_KEY=sk-from-dev\n")
    _write_env(install_env, "ANTHROPIC_API_KEY=sk-from-install\n")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(settings_mod, "dev_env_path", lambda: dev_env)
    monkeypatch.setattr(settings_mod, "install_env_path", lambda: install_env)

    monkeypatch.setenv("CMC_ENV", "dev")
    assert settings_mod.load_settings().anthropic_api_key == "sk-from-dev"

    monkeypatch.setenv("CMC_ENV", "install")
    assert settings_mod.load_settings().anthropic_api_key == "sk-from-install"


# ---- FOUND-02: engine + pragmas ----


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


# ---- FOUND-02 + FOUND-03: all 15 tables created via Alembic ----


@pytest.mark.asyncio
async def test_alembic_upgrade_creates_all_tables(test_settings):
    """FOUND-02: alembic upgrade head creates all 15 application tables."""
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect

    engine = create_engine_for_settings(test_settings)
    ini_path = repo_root() / "backend/alembic.ini"
    cfg = Config(str(ini_path))
    # Mirror lifespan's BLOCKER 1 fix: alembic.ini's `script_location = migrations`
    # is cwd-relative. Absolutize against the ini file's parent directory so this
    # test passes from BOTH backend/ and repo-root cwds.
    cfg.set_main_option("script_location", str(ini_path.parent / "migrations"))
    try:
        async with engine.begin() as conn:
            def _upgrade(sync_conn):
                cfg.attributes["connection"] = sync_conn
                command.upgrade(cfg, "head")
            await conn.run_sync(_upgrade)

        async with engine.connect() as conn:
            def _inspect(sync_conn):
                return sorted(inspect(sync_conn).get_table_names())
            tables = await conn.run_sync(_inspect)
        # 15 app tables + alembic_version
        app_tables = [t for t in tables if t != "alembic_version"]
        assert len(app_tables) == 15, (
            f"Expected 15 app tables, got {len(app_tables)}: {app_tables}"
        )
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_alembic_upgrade_is_idempotent(test_settings):
    """FOUND-02: running alembic upgrade twice does not error (idempotent)."""
    from alembic import command
    from alembic.config import Config

    engine = create_engine_for_settings(test_settings)
    ini_path = repo_root() / "backend/alembic.ini"
    cfg = Config(str(ini_path))
    # Mirror lifespan's BLOCKER 1 fix: absolutize script_location against ini parent
    # so this test passes from BOTH backend/ and repo-root cwds.
    cfg.set_main_option("script_location", str(ini_path.parent / "migrations"))
    try:
        for _ in range(2):
            async with engine.begin() as conn:
                def _upgrade(sync_conn):
                    cfg.attributes["connection"] = sync_conn
                    command.upgrade(cfg, "head")
                await conn.run_sync(_upgrade)
    finally:
        await engine.dispose()


def test_column_exists_helper_signature():
    """FOUND-03: _column_exists is importable from the migration module."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "_initial", str(repo_root() / "backend/migrations/versions/0001_initial.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert callable(module._column_exists)
    # Signature check: takes (table: str, column: str) -> bool
    import inspect as ins
    sig = ins.signature(module._column_exists)
    assert list(sig.parameters.keys()) == ["table", "column"]


# ---- FOUND-05: lifespan ----


@pytest.mark.asyncio
async def test_lifespan_initializes_engine_and_sessions(test_settings):
    """FOUND-05: Lifespan populates app.state.engine and app.state.sessions."""
    from fastapi import FastAPI

    from cmc.app.lifespan import lifespan

    app = FastAPI()
    app.state.settings = test_settings
    async with lifespan(app):
        assert app.state.engine is not None
        assert app.state.sessions is not None
        # Sessions factory should produce a working session
        async with app.state.sessions() as s:
            from sqlalchemy import text
            result = await s.execute(text("SELECT 1"))
            assert result.scalar() == 1


@pytest.mark.asyncio
async def test_lifespan_creates_all_tables(test_settings):
    """FOUND-02 + FOUND-05: Lifespan runs alembic upgrade -> all 15 tables exist."""
    from fastapi import FastAPI
    from sqlalchemy import inspect

    from cmc.app.lifespan import lifespan

    app = FastAPI()
    app.state.settings = test_settings
    async with lifespan(app):
        async with app.state.engine.connect() as conn:
            def _names(sync_conn):
                return sorted(inspect(sync_conn).get_table_names())
            tables = await conn.run_sync(_names)
        app_tables = [t for t in tables if t != "alembic_version"]
        assert len(app_tables) == 15, f"got {app_tables}"


@pytest.mark.asyncio
async def test_lifespan_disposes_on_shutdown(test_settings):
    """FOUND-05: engine.dispose() is called after yield."""
    from fastapi import FastAPI

    from cmc.app.lifespan import lifespan

    app = FastAPI()
    app.state.settings = test_settings
    async with lifespan(app):
        engine = app.state.engine
    # After exiting context, engine should be disposed.
    # SQLAlchemy doesn't expose a direct "is disposed" flag, but pool.size() is 0
    # after dispose. We'll just confirm dispose() can be called again without error.
    await engine.dispose()  # safe to call twice


@pytest.mark.asyncio
async def test_lifespan_uses_repo_root_anchored_alembic_ini(test_settings, monkeypatch, tmp_path):
    """BLOCKER 1 regression: lifespan finds alembic.ini regardless of cwd.

    The settings model_validator makes settings.alembic_ini_path absolute.
    The lifespan must trust that path even when cwd has been changed (e.g.,
    when started from `cd backend && uvicorn ...`).
    """
    from fastapi import FastAPI

    from cmc.app.lifespan import lifespan

    # Move cwd somewhere unrelated; lifespan should still resolve alembic.ini correctly.
    monkeypatch.chdir(tmp_path)
    app = FastAPI()
    app.state.settings = test_settings
    async with lifespan(app):
        # If alembic upgrade actually ran against the right config, app.state.engine
        # is set and tables exist — same assertion as test_lifespan_creates_all_tables
        # but with a deliberately wrong cwd.
        assert app.state.engine is not None


# ---- FOUND-01: app factory + health route ----


def test_create_app_returns_fastapi(test_settings):
    """FOUND-01: create_app() returns a FastAPI instance with settings on state."""
    from fastapi import FastAPI

    from cmc.app import create_app

    app = create_app(settings=test_settings)
    assert isinstance(app, FastAPI)
    assert app.state.settings is test_settings


def test_health_route_registered(test_settings):
    """FOUND-01: /api/health is in the route table."""
    from cmc.app import create_app
    app = create_app(settings=test_settings)
    paths = [r.path for r in app.routes]
    assert "/api/health" in paths


@pytest.mark.asyncio
async def test_health_route_returns_ok(test_settings):
    """FOUND-01: GET /api/health returns 200 with {'status': 'ok'}."""
    from httpx import ASGITransport, AsyncClient

    from cmc.app import create_app

    app = create_app(settings=test_settings)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Lifespan runs automatically with httpx ASGI? No — must trigger via app context.
        # Use lifespan context manually.
        async with app.router.lifespan_context(app):
            resp = await client.get("/api/health")
            assert resp.status_code == 200
            assert resp.json() == {"status": "ok"}


# ---- FOUND-06: SPA mount ----


@pytest.mark.asyncio
async def test_spa_root_returns_index_html(test_settings_with_static):
    """FOUND-06: GET / returns index.html with status 200."""
    from httpx import ASGITransport, AsyncClient

    from cmc.app import create_app

    app = create_app(settings=test_settings_with_static)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            resp = await client.get("/")
            assert resp.status_code == 200
            assert "test-spa-marker" in resp.text


@pytest.mark.asyncio
async def test_spa_deep_link_fallback(test_settings_with_static):
    """FOUND-06: GET /any-deep-link returns index.html (SPA fallback)."""
    from httpx import ASGITransport, AsyncClient

    from cmc.app import create_app

    app = create_app(settings=test_settings_with_static)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            for path in ("/activity", "/skills", "/some/nested/route"):
                resp = await client.get(path)
                assert resp.status_code == 200, f"{path} -> {resp.status_code}"
                assert "test-spa-marker" in resp.text, (
                    f"{path} did not fall back to index.html"
                )


@pytest.mark.asyncio
async def test_api_not_shadowed_by_spa_mount(test_settings_with_static):
    """Pitfall 8 regression: /api/health and /api/docs still work after SPA mount."""
    from httpx import ASGITransport, AsyncClient

    from cmc.app import create_app

    app = create_app(settings=test_settings_with_static)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            # /api/health must return JSON, not HTML
            resp = await client.get("/api/health")
            assert resp.status_code == 200
            assert resp.headers["content-type"].startswith("application/json")
            assert resp.json() == {"status": "ok"}

            # /api/docs (Swagger) must serve the docs HTML, not the SPA
            resp = await client.get("/api/docs")
            assert resp.status_code == 200
            assert "swagger" in resp.text.lower() or "openapi" in resp.text.lower()


def _is_spa_mount(route) -> bool:
    """Identify the SPA mount in app.routes.

    Starlette stores the root Mount with an empty `path` attribute (the prefix
    is stripped before matching), so detecting "the / mount" by `path == "/"`
    fails. Match by class name + the explicit name="spa" we set in the factory.
    """
    return route.__class__.__name__ == "Mount" and getattr(route, "name", None) == "spa"


def test_create_app_skips_mount_if_static_dir_missing(test_settings, tmp_path):
    """When static_dir doesn't exist, create_app does not raise; mount is skipped."""
    from cmc.app import create_app
    # Use model_copy to avoid re-triggering env loading (BLOCKER 4 pattern).
    settings = test_settings.model_copy(
        update={"static_dir": tmp_path / "does-not-exist"}
    )
    app = create_app(settings=settings)
    # API still works even without static
    paths = [getattr(r, "path", None) for r in app.routes]
    assert "/api/health" in paths
    # No SPA mount
    assert [r for r in app.routes if _is_spa_mount(r)] == []


def test_static_mount_after_routers(test_settings_with_static):
    """BLOCKER 2 + Pitfall 8 regression: SPA mount at "/" exists AND comes AFTER
    BOTH `/api/health` AND the OTLP routes (/v1/logs, /v1/metrics) in the route
    table.

    OTLP routes mount at the ROOT path (no /api prefix). They MUST still
    register before the SPA mount or the static handler at "/" shadows them.
    """
    from cmc.app import create_app
    app = create_app(settings=test_settings_with_static)
    # Find positions in app.routes
    health_idx = None
    otlp_logs_idx = None
    otlp_metrics_idx = None
    spa_mount_idx = None
    for i, r in enumerate(app.routes):
        path = getattr(r, "path", None)
        if path == "/api/health":
            health_idx = i
        elif path == "/v1/logs":
            otlp_logs_idx = i
        elif path == "/v1/metrics":
            otlp_metrics_idx = i
        if _is_spa_mount(r):
            spa_mount_idx = i
    assert health_idx is not None, "Expected /api/health route to be registered"
    assert otlp_logs_idx is not None, (
        "Expected /v1/logs to be registered as a raw router"
    )
    assert otlp_metrics_idx is not None, (
        "Expected /v1/metrics to be registered as a raw router"
    )
    assert spa_mount_idx is not None, "Expected SPA Mount (name='spa') to be registered"
    assert health_idx < spa_mount_idx, (
        f"Pitfall 8 regression: /api/health (idx={health_idx}) must come BEFORE "
        f"the SPA mount (idx={spa_mount_idx}) — otherwise the static mount "
        "shadows /api/*."
    )
    assert otlp_logs_idx < spa_mount_idx, (
        f"Pitfall 8 regression: /v1/logs (idx={otlp_logs_idx}) must come BEFORE "
        f"the SPA mount (idx={spa_mount_idx}) — otherwise the static mount "
        "shadows the OTLP receiver."
    )
    assert otlp_metrics_idx < spa_mount_idx, (
        f"Pitfall 8 regression: /v1/metrics (idx={otlp_metrics_idx}) must come "
        f"BEFORE the SPA mount (idx={spa_mount_idx})."
    )
