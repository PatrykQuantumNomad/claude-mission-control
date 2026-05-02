# Testing Patterns

**Analysis Date:** 2026-05-02

## Test Framework

**Runner:**
- pytest 9.0+
- Config: `backend/pyproject.toml` under `[tool.pytest.ini_options]`

**Key configuration:**
```toml
testpaths = ["tests"]
asyncio_mode = "auto"      # all async tests run without @pytest.mark.asyncio decorator
addopts = "-q"
```

**Async:**
- pytest-asyncio 0.24+ in `auto` mode — `async def test_*` functions run automatically without decoration
- When explicit decoration is present (`@pytest.mark.asyncio`), it is redundant but not harmful

**Additional plugins:**
- `pytest-cov` 7.1.0+ — coverage reporting
- `pytest-freezer` 0.4 — deterministic time for local-day bucket tests
- `pytest-asyncio` 0.24+

**Run Commands:**
```bash
cd backend && uv run pytest                   # Run all tests
cd backend && uv run pytest -x                # Stop on first failure
cd backend && uv run pytest tests/test_tasks_router.py  # Single file
make test-backend                             # Via Makefile
make test-backend PYTEST_ARGS="-x tests/test_foundation_boot.py"  # Scoped run
```

## Test File Organization

**Location:** All tests in `backend/tests/` — separate from source, not co-located

**Naming:** `test_{domain}.py` where domain mirrors the code area:
- `test_foundation_boot.py` — settings, engine, migrations, app factory, lifespan
- `test_tasks_router.py` — tasks CRUD API (TASK-01..08)
- `test_dispatcher.py` — dispatcher settings, state, sweep, claim, materialize, heartbeat
- `test_ingest.py` — JSONL parsing, OTLP ingestion, repository, scheduler
- `test_telegram_units.py` — Telegram API helpers, formatters, plist rendering
- `test_telegram_handler.py` — Telegram update handler integration
- `test_telegram_notifier.py` — Telegram notifier
- `test_telegram_setup.py` — Telegram setup wizard CLI
- `test_emergency_stop.py` — ESTOP-01..04 system stop/resume
- `test_production_chassis.py` — FastAPI builder, readiness, security headers, rate limit
- `test_hitl_router.py` — HITL decisions + inbox
- `test_sessions_router.py` — sessions read API
- `test_observability_router.py` — OTLP ingestion endpoints
- `test_observability_extensions.py` — observability extensions
- `test_schedules_router.py` — schedule CRUD
- `test_skills_router.py` — skills scan/list
- `test_mcp_router.py` — MCP aggregator
- `test_system_router.py` — system state read
- `test_context_router.py` — context API
- `test_attention_metrics.py` — attention/metrics

**Fixtures directory:** `backend/tests/fixtures/` contains fake subprocess binaries:
- `fake_claude_classic.py` — fake `claude` CLI for classic-mode dispatcher tests
- `fake_claude_stream.py` — fake `claude` CLI for stream-mode dispatcher tests (emits NDJSON events)

**Shared fixtures:** `backend/tests/conftest.py`

## Test Structure

**Module docstring convention:**
```python
"""Tasks router tests — TASK-01..07.

Coverage includes:
  - TASK-01: list with filters
  - TASK-02: create
  ...

Pitfall awareness:
  - r.json()["error"] (NOT "detail") — the error handler emits {error: ...}.
  - tz-aware UTC datetimes when seeding (Pitfall 4).
"""
```

**Test function docstrings:**
```python
async def test_task03_patch_illegal_transition(client) -> None:
    """done is terminal — cannot transition to anything (including pending)."""
```

**Naming:** `test_{spec_id}_{description}` where spec_id is the requirement code:
- `test_task01_list_default`
- `test_task03_patch_illegal_transition`
- `test_estop01_stop_with_no_pids_or_running_tasks`
- `test_estop02_validate_pid_is_claude_positive`

**Section markers:** Tests within a file are grouped with `# ---------- TASK-01: GET /api/tasks ----------` divider comments.

## Fixtures

### Core fixtures (defined in `backend/tests/conftest.py`)

**`clean_env`** — strips all CMC/Anthropic/Telegram env vars via `monkeypatch.delenv()` so Settings falls back to defaults. Use in any test that constructs `Settings()`.

**`tmp_db_path`** — per-test fresh `Path` object pointing to a tmp SQLite file. Never shared across tests.

**`test_settings`** — `Settings(_env_file=None, db_path=tmp_db_path)` — the standard settings object for unit tests. Chains `clean_env`.

**`test_settings_with_static`** — variant of `test_settings` with a real `static_dir` pointing to a minimal `index.html`. Uses `model_copy(update=...)` — NOT a new `Settings(...)` construction.

**`seeded_app`** — async fixture returning `(app, lifespan_context_manager)`. Wires the full router set, redirects `jsonl_root` to a nonexistent tmp dir (so sync_once never touches real user data), and pre-seeds `app.state.boot_time`.

**`client`** — `httpx.AsyncClient` backed by `httpx.ASGITransport` against `seeded_app`. The lifespan runs automatically, so Alembic migrations and startup sync execute before the first request. Use for all HTTP-level router tests.

```python
@pytest_asyncio.fixture
async def client(seeded_app):
    app, cm = seeded_app
    async with cm:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as ac:
            yield ac
```

**`tmp_pid_dir`** / **`tmp_pid_dir_monkey`** — PID directory fixtures for dispatcher and ESTOP tests. `_monkey` variant also monkeypatches `cmc.core.process.pid_dir` and `cmc.dispatcher.state._process_pid_dir`.

**`mock_psutil_pids`** — returns a callable `_register(pids: set[int])` that controls which PIDs `psutil.pid_exists()` reports as alive. Patches the global `psutil` module object.

**`mock_anthropic_client`** — replaces `AsyncAnthropic` constructor via `__import__` patching. Yields a `MagicMock` whose `messages.create` is an `AsyncMock`.

**`fake_jsonl_dir`** / **`golden_jsonl_session`** / **`otlp_log_payload`** / **`otlp_metric_payload`** — ingestion fixtures providing synthetic JSONL and OTLP payloads.

### Factory helpers (module-level functions, NOT fixtures)

Factory helpers return plain dicts suitable for ORM construction or raw INSERT. All are defined in `conftest.py` and imported in test files via `from .conftest import make_task_row`.

```python
make_session_row(**overrides) -> dict
make_otel_event(**overrides) -> dict
make_token_usage_bucket(**overrides) -> dict
make_tool_call(**overrides) -> dict
make_decision_row(**overrides) -> dict
make_inbox_row(**overrides) -> dict
make_task_row(**overrides) -> dict
make_schedule_row(**overrides) -> dict
make_task_orm(**overrides) -> Task   # returns ORM instance, not dict
make_schedule_orm(**overrides) -> Schedule
```

**Usage in tests:**
```python
from .conftest import make_task_row

async def _seed_task(client_fixture, **overrides) -> int:
    sessionmaker = client_fixture._transport.app.state.sessions
    row = make_task_row(**overrides)
    async with sessionmaker() as db:
        t = Task(**row)
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t.id
```

## Mocking

**Framework:** `unittest.mock` — `MagicMock`, `AsyncMock`, `patch` (via `monkeypatch` fixture)

**Pattern — pytest monkeypatch (preferred):**
```python
def test_task07_trigger_calls_subprocess_popen(client, tmp_path, monkeypatch) -> None:
    fake_proc = MagicMock(pid=12345)
    mock_popen = MagicMock(return_value=fake_proc)
    monkeypatch.setattr("cmc.tasks.spawn.repo_root", lambda: tmp_path)
    monkeypatch.setattr("cmc.tasks.spawn.subprocess.Popen", mock_popen)
```

**Critical rule:** Always patch where the name is IMPORTED, not where it is defined:
```python
# CORRECT — patches the router's local binding
monkeypatch.setattr("cmc.api.routes.system.emergency_stop_all", ...)

# WRONG — patches definition site; router already holds its own reference
monkeypatch.setattr("cmc.core.process.emergency_stop_all", ...)
```

**HTTP client mocking (httpx.MockTransport):**
```python
def handler(req: httpx.Request) -> Response:
    return Response(200, json={"ok": True, "result": {...}})

async with httpx.AsyncClient(transport=MockTransport(handler)) as client:
    res = await api.send_message("TKN", "1", "hello", client=client)
```

All Telegram API functions (`send_message`, `get_me`, `get_updates`) accept an optional `client=` kwarg, making them injectable for testing without needing monkeypatching.

**What to Mock:**
- `subprocess.Popen` / `subprocess.run` — never spawn real processes in tests
- `psutil.pid_exists` — use `mock_psutil_pids` fixture
- `emergency_stop_all` — stub at the router import site
- `AsyncAnthropic` — use `mock_anthropic_client` fixture
- External HTTP calls — use `httpx.MockTransport`

**What NOT to Mock:**
- SQLite database — real in-memory/tmp SQLite via `test_settings.db_path`
- Alembic migrations — run real migrations via `_bootstrap_db()` helper or `client` fixture
- FastAPI app / router wiring — use `seeded_app` and `client` fixtures against the full app

## DB Seeding Pattern

For router tests, data is seeded directly via the app's sessionmaker (accessed through `client._transport.app.state.sessions`), bypassing the API:

```python
async def _seed_task(client_fixture, **overrides) -> int:
    sessionmaker = client_fixture._transport.app.state.sessions
    row = make_task_row(**overrides)
    async with sessionmaker() as db:
        t = Task(**row)
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t.id
```

Post-action DB verification also goes direct to sessionmaker (not through the API):
```python
async with sessionmaker() as db:
    row = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one()
    assert row.status == "pending"
```

## Test Types

**Unit Tests:**
- Pure function tests: settings defaults, transitions matrix, JSONL parser, plist renderer, Telegram formatters
- No DB, no app, no HTTP — import the function and call it directly
- Examples: `test_settings_defaults_with_no_env`, `test_estop02_validate_pid_is_claude_positive`, `test_format_decision_returns_plain_text_and_kb`

**Integration Tests (Router Tests):**
- HTTP-level via `httpx.AsyncClient` against the full ASGI app
- Real SQLite DB with real Alembic migrations via `client` fixture
- Examples: all `test_task01_*` through `test_task08_*`, `test_sessions_router.py`, `test_hitl_router.py`

**E2E Tests:**
- Playwright-based frontend E2E in `frontend/` (via `pnpm run test:e2e`)
- Backend has no E2E test infrastructure — integration tests exercise the full backend stack

**Subprocess Integration Tests:**
- Dispatcher tests spawn real subprocesses using `fake_claude_classic.py` / `fake_claude_stream.py` as the `claude` binary
- Controlled via `settings.claude_bin` monkeypatched to point to the fake binary

## Coverage

**Requirements:** No enforced coverage threshold configured

**Run Coverage:**
```bash
cd backend && uv run pytest --cov=cmc --cov-report=term-missing
```

**Coverage tool:** pytest-cov 7.1.0+

## Common Patterns

**Async testing (auto mode — no decorator needed):**
```python
async def test_task01_list_default(client) -> None:
    r = await client.get("/api/tasks")
    assert r.status_code == 200
```

**Error response assertions — use `"error"` key, never `"detail"`:**
```python
assert r.status_code == 404
assert r.json()["error"] == "task not found"

assert r.status_code == 400
assert "invalid status transition" in r.json()["error"].lower()
```

**Verifying side effects in DB after API call:**
```python
sessionmaker = client._transport.app.state.sessions
from sqlalchemy import select as _sel
async with sessionmaker() as db:
    row = (await db.execute(_sel(Task).where(Task.id == task_id))).scalar_one()
    assert row.status == "pending"
```

**Settings clean-up in unit tests:**
```python
def test_settings_defaults_with_no_env(clean_env):
    s = Settings(_env_file=None)
    assert s.host == "127.0.0.1"
```

**Lifespan tests (without `client` fixture):**
```python
async def test_lifespan_initializes_engine_and_sessions(test_settings):
    app = FastAPI()
    app.state.settings = test_settings
    async with lifespan(app):
        assert app.state.engine is not None
```

**Testing SystemExit + stderr output:**
```python
def test_settings_pretty_error_on_invalid(clean_env, monkeypatch, capsys):
    monkeypatch.setenv("PORT", "not-a-number")
    with pytest.raises(SystemExit) as exc_info:
        load_settings()
    assert exc_info.value.code == 1
    captured = capsys.readouterr()
    assert "port" in captured.err.lower()
    assert "not-a-number" not in captured.err  # Security: no leaked values
```

**Signature/introspection tests:**
```python
def test_api_no_parse_mode_argument():
    """Pitfall P3: send_message MUST NOT accept parse_mode — grep gate."""
    import inspect
    sig = inspect.signature(api.send_message)
    assert "parse_mode" not in sig.parameters
```

---

*Testing analysis: 2026-05-02*
