"""Shared pytest fixtures for backend tests."""

import os
from pathlib import Path

import pytest

from cmc.config import Settings


@pytest.fixture
def clean_env(monkeypatch):
    """Strip CMC-related env vars so Settings() falls back to defaults.

    Also strip ANTHROPIC_API_KEY and TELEGRAM_* so tests don't pick up
    developer-machine values via Settings's env-file selection. Belt-and-suspenders
    alongside the per-call-site `_env_file=None` audit.
    """
    for k in list(os.environ.keys()):
        if k.upper() in {
            "HOST",
            "PORT",
            "DB_PATH",
            "DB_ECHO",
            "LOG_LEVEL",
            "CMC_ENV",
            "STATIC_DIR",
            "ALEMBIC_INI_PATH",
            "ANTHROPIC_API_KEY",
            "TELEGRAM_BOT_TOKEN",
            "TELEGRAM_CHAT_ID",
            "TELEGRAM_ALLOWED_USER_IDS",
        }:
            monkeypatch.delenv(k, raising=False)


@pytest.fixture
def tmp_db_path(tmp_path: Path) -> Path:
    """Per-test fresh DB path."""
    return tmp_path / "cmc.db"


@pytest.fixture
def test_settings(clean_env, tmp_db_path) -> Settings:
    """Settings instance with a tmp DB path.

    Note: tmp_db_path is absolute, so Settings' repo-root resolver leaves it untouched.

    Pass `_env_file=None` so Settings.model_config.env_file cannot leak the
    developer's real install env into test runs.
    """
    return Settings(_env_file=None, db_path=tmp_db_path)


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


# ---- Ingestion fixtures ----

import json
from datetime import UTC, datetime, timedelta


@pytest.fixture
def fake_jsonl_dir(tmp_path: Path) -> Path:
    """Mimic the ~/.claude/projects/<project-hash>/<session>.jsonl layout.

    Returns a directory that contains one or more `<hash>/<session>.jsonl` files.
    Scheduler tests override Settings.jsonl_root to this dir for hermetic testing.
    """
    root = tmp_path / "projects"
    root.mkdir()
    return root


@pytest.fixture
def golden_jsonl_session(fake_jsonl_dir: Path) -> Path:
    """Write a synthetic session JSONL with a known event mix.

    Contents:
      - 1 user message (start)
      - 2 assistant messages (each with a usage block, one with a tool_use)
      - 1 user message containing a tool_result that pairs with the tool_use
      - 1 assistant message with a SECOND tool_use (no tool_result — unpaired/pending)
      - 1 corrupted (truncated) line in the middle
      - 1 trailing assistant message after the corruption (must still be parsed)

    Returns the absolute Path to the .jsonl file.

    Used by INGST-02 (token usage), INGST-03 (tool pairing), INGST-06 (corruption skip).
    """
    proj = fake_jsonl_dir / "-Users-test-project"
    proj.mkdir()
    f = proj / "11111111-2222-3333-4444-555555555555.jsonl"

    base_ts = datetime(2026, 4, 25, 17, 0, 0, tzinfo=UTC)
    sid = "11111111-2222-3333-4444-555555555555"

    def iso(t: datetime) -> str:
        return t.isoformat().replace("+00:00", "Z")

    lines = [
        # user start
        json.dumps({
            "type": "user", "uuid": "u1", "sessionId": sid,
            "timestamp": iso(base_ts), "cwd": "/Users/test/project",
            "message": {"role": "user", "content": "hello"},
        }),
        # assistant turn with usage + tool_use
        json.dumps({
            "type": "assistant", "uuid": "a1", "sessionId": sid,
            "timestamp": iso(base_ts + timedelta(seconds=1)), "cwd": "/Users/test/project",
            "message": {
                "role": "assistant", "model": "claude-opus-4-7",
                "usage": {
                    "input_tokens": 10, "output_tokens": 20,
                    "cache_read_input_tokens": 100, "cache_creation_input_tokens": 50,
                },
                "content": [
                    {"type": "text", "text": "running tool"},
                    {"type": "tool_use", "id": "tu_paired", "name": "Bash",
                     "input": {"command": "ls"}},
                ],
            },
        }),
        # user reflects tool_result back
        json.dumps({
            "type": "user", "uuid": "u2", "sessionId": sid,
            "timestamp": iso(base_ts + timedelta(seconds=3)), "cwd": "/Users/test/project",
            "message": {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "tu_paired",
                     "is_error": False, "content": "file1\nfile2"},
                ],
            },
        }),
        # ---- corrupted line (mid-file, per Pitfall about partial writes) ----
        '{"type": "assist',
        # assistant turn with second tool_use (no result -> pending)
        json.dumps({
            "type": "assistant", "uuid": "a2", "sessionId": sid,
            "timestamp": iso(base_ts + timedelta(seconds=5)), "cwd": "/Users/test/project",
            "message": {
                "role": "assistant", "model": "claude-opus-4-7",
                "usage": {
                    "input_tokens": 5, "output_tokens": 8,
                    "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
                },
                "content": [
                    {"type": "tool_use", "id": "tu_pending",
                     "name": "mcp__notebooklm-mcp__notebook_get",
                     "input": {"document_id": "abc"}},
                ],
            },
        }),
    ]
    f.write_text("\n".join(lines) + "\n")
    return f


@pytest.fixture
def otlp_log_payload() -> dict:
    """Minimal valid OTLP/HTTP JSON ExportLogsServiceRequest with two log records:
    one ordinary tool_result, one MCP tool_result that should populate
    `attrs_mcp_server` and `attrs_mcp_tool` columns (INGST-08)."""
    return {
        "resourceLogs": [{
            "resource": {"attributes": [
                {"key": "service.name", "value": {"stringValue": "claude-code"}},
            ]},
            "scopeLogs": [{
                "scope": {"name": "com.anthropic.claude_code.events"},
                "logRecords": [
                    {
                        "timeUnixNano": "1745601281385000000",
                        "body": {"stringValue": "tool_result"},
                        "attributes": [
                            {
                                "key": "event.name",
                                "value": {"stringValue": "claude_code.tool_result"},
                            },
                            {"key": "session_id", "value": {"stringValue": "sess-1"}},
                            {"key": "tool_name", "value": {"stringValue": "Bash"}},
                            {"key": "success", "value": {"stringValue": "true"}},
                            {"key": "duration_ms", "value": {"intValue": "8486"}},
                        ],
                    },
                    {
                        "timeUnixNano": "1745601282385000000",
                        "body": {"stringValue": "tool_result"},
                        "attributes": [
                            {
                                "key": "event.name",
                                "value": {"stringValue": "claude_code.tool_result"},
                            },
                            {"key": "session_id", "value": {"stringValue": "sess-1"}},
                            {
                                "key": "tool_name",
                                "value": {"stringValue": "mcp__myserver__do_thing"},
                            },
                            {
                                "key": "tool_parameters",
                                "value": {
                                    "stringValue": json.dumps(
                                        {
                                            "mcp_server_name": "myserver",
                                            "mcp_tool_name": "do_thing",
                                        }
                                    )
                                },
                            },
                        ],
                    },
                ],
            }],
        }],
    }


@pytest.fixture
def otlp_metric_payload() -> dict:
    """Minimal valid OTLP/HTTP JSON ExportMetricsServiceRequest covering all three
    metric kinds (sum, gauge, histogram) used by INGST-09."""
    return {
        "resourceMetrics": [{
            "resource": {"attributes": [
                {"key": "service.name", "value": {"stringValue": "claude-code"}},
            ]},
            "scopeMetrics": [{
                "scope": {"name": "com.anthropic.claude_code.metrics"},
                "metrics": [
                    {
                        "name": "claude_code.token.usage",
                        "unit": "tokens",
                        "sum": {
                            "aggregationTemporality": 2,
                            "isMonotonic": True,
                            "dataPoints": [{
                                "timeUnixNano": "1745601281385000000",
                                "asInt": "47855",
                                "attributes": [
                                    {"key": "type", "value": {"stringValue": "input"}},
                                ],
                            }],
                        },
                    },
                    {
                        "name": "claude_code.session.count",
                        "gauge": {
                            "dataPoints": [{
                                "timeUnixNano": "1745601281385000000",
                                "asInt": "3",
                            }],
                        },
                    },
                    {
                        "name": "tool.duration",
                        "unit": "ms",
                        "histogram": {
                            "aggregationTemporality": 2,
                            "dataPoints": [{
                                "timeUnixNano": "1745601281385000000",
                                "count": "10",
                                "sum": 8542.3,
                                "bucketCounts": ["1", "3", "4", "2"],
                                "explicitBounds": [100, 500, 2000],
                            }],
                        },
                    },
                ],
            }],
        }],
    }


# ---- Shared app/client fixtures ----
#
# Provides a shared `seeded_app` fixture and a httpx ASGITransport-backed
# `client` fixture so router test files can exercise endpoints without
# re-bootstrapping. The `make_*` factories return plain dicts suitable for
# either ORM construction OR raw INSERT statements (they are NOT fixtures,
# just module-level helpers callable from any test).


import httpx
import pytest_asyncio


@pytest_asyncio.fixture
async def seeded_app(test_settings):
    """FastAPI app with the full router set wired in and lifespan ready to enter.

    Returns (app, lifespan_cm) — caller wraps `async with cm:` to start the
    lifespan (which runs alembic upgrade + boot-time sync_once + starts the
    periodic loop).

    Hermetic guarantees:
      - jsonl_root is auto-redirected to a tmp nonexistent path when it
        defaults to `~/.claude/projects`.
      - static_dir is left as-is — factory.create_app skips the SPA mount
        when the directory has no index.html, which is the test default.
      - boot_time defensive write: lifespan ALREADY sets app.state.boot_time
        on startup (Task 1a), but we additionally pre-seed it here with a
        deterministic 42-seconds-ago timestamp BEFORE entering the lifespan,
        so any test that inspects boot_time before the lifespan starts gets
        a sensible value. The lifespan WILL overwrite this on startup with
        the true `datetime.now(timezone.utc)`.

    Tests typically destructure this fixture as:
        app, cm = seeded_app
        async with cm:
            ... # use app.state.sessions, app.state.engine, etc.

    For HTTP-level tests, prefer the `client` fixture below — it handles
    ASGITransport + lifespan entry for you.
    """
    from cmc.app.factory import create_app

    # Never ingest user data in tests. Detect the default and replace with a
    # tmp-path nonexistent dir so sync_once early-returns harmlessly.
    if str(test_settings.jsonl_root).endswith(".claude/projects"):
        test_settings = test_settings.model_copy(update={
            "jsonl_root": test_settings.db_path.parent / "no-jsonl-here",
        })

    app = create_app(test_settings)
    # Defensive pre-seed (the lifespan will overwrite on startup).
    app.state.boot_time = datetime.now(UTC) - timedelta(seconds=42)

    return app, app.router.lifespan_context(app)


@pytest_asyncio.fixture
async def client(seeded_app):
    """httpx.AsyncClient bound to seeded_app via ASGITransport.

    Yields an httpx.AsyncClient pinned to base_url='http://testserver'.
    The lifespan runs alembic upgrade + boot-time sync (against the
    redirected jsonl_root, which early-returns on missing dir) before the
    first request is dispatched, so /api/health and other DB-touching
    endpoints work immediately.
    """
    app, cm = seeded_app
    async with cm:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver"
        ) as ac:
            yield ac


# ---- Phase 13 fixtures (Plan 06 — wires Plan 01's deferred async tests) ----
#
# Plan 01 left two async test cases as `pytest.skip` stubs because conftest
# didn't yet have a shared async-session fixture for tests that DON'T need
# the HTTP layer. Plan 06 lands the fixtures.
#
# `db_session` is the basic shape: a fresh AsyncSession opened against the
# same app/engine the `client` fixture uses (so the lifespan ALREADY auto-
# seeded `data/pricing.json` into the pricing table by the time the test
# runs). Tests that verify load_seed idempotency or pricing-window math
# operate on that pre-seeded state.
#
# `seed_pricing` is a marker fixture — the actual seeding is done by the
# lifespan; this fixture just asserts the precondition (5 rows present)
# and returns the count, so tests that depend on it read intent-revealing.
#
# `seed_token_usage` is unused outside the e2e test; tests that need
# token_usage rows seed inline (matching test_cost_router.py's pattern).


@pytest_asyncio.fixture
async def db_session(seeded_app, request):
    """Yield an AsyncSession opened on the seeded app's engine after lifespan ran.

    The lifespan auto-seeds `data/pricing.json` into the pricing table, so any
    test using this fixture starts with the 5 SKUs already present. To verify
    `load_seed` itself, tests can call it again — it MUST be idempotent
    (Plan 01 ANLY-02 contract).

    Coexistence with `client`: the `client` fixture (when also requested by
    the same test) is the one that enters the lifespan context manager. Both
    fixtures share the SAME `seeded_app` tuple (function-scoped fixture
    caching), so `client` enters `cm` once and `db_session` just opens a
    fresh session on the already-running app's engine. When `db_session` is
    used WITHOUT `client`, this fixture enters `cm` itself.
    """
    app, cm = seeded_app
    # Detect coexistence: if the test also requested `client`, that fixture
    # owns the lifespan entry; we just open a session on the running app.
    using_client = "client" in request.fixturenames
    if using_client:
        async with app.state.sessions() as session:
            yield session
    else:
        async with cm:
            async with app.state.sessions() as session:
                yield session


@pytest_asyncio.fixture
async def seed_pricing(db_session):
    """Marker fixture — asserts the lifespan seed ran (5 SKUs present).

    Plan 04's test_cost_router.py relies on the implicit lifespan seed via
    the `client` fixture; Plan 06 makes the dependency explicit via this
    fixture so test signatures read self-documenting.
    """
    from sqlalchemy import func, select

    from cmc.db.models.pricing import PricingRow

    n = (
        await db_session.execute(select(func.count()).select_from(PricingRow))
    ).scalar()
    assert n == 5, f"Phase 13 lifespan seed regression: expected 5 pricing rows, got {n}"
    return n


# ---- Factory helpers (NOT fixtures — plain module-level helpers) ----
#
# These return dicts shaped to match the corresponding ORM model's __init__
# kwargs, so callers can either:
#   - construct an ORM instance:  Session(**make_session_row())
#   - emit raw SQL INSERT bind params:  conn.execute(insert(Session), [row])
# Pitfall 4 awareness: defaults use timezone-aware UTC datetimes, NEVER
# datetime.utcnow() (deprecated path).


def make_session_row(
    session_id: str = "sess-1",
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
    cwd: str = "/Users/test/proj",
    model: str | None = "claude-opus-4-7",
    source: str | None = "claude-code",
    outcome: str | None = None,
    tokens_input: int = 0,
    tokens_output: int = 0,
    tokens_cache_read: int = 0,
    tokens_cache_create: int = 0,
    tool_call_count: int = 0,
    message_count: int = 0,
    error_message: str | None = None,
) -> dict:
    """Return a dict suitable for Session ORM construction or raw insert."""
    if started_at is None:
        started_at = datetime.now(UTC)
    return {
        "session_id": session_id,
        "started_at": started_at,
        "ended_at": ended_at,
        "synced_at": started_at,
        "jsonl_mtime": started_at,
        "jsonl_path": f"/tmp/{session_id}.jsonl",
        "cwd": cwd,
        "model": model,
        "source": source,
        "outcome": outcome,
        "tokens_input": tokens_input,
        "tokens_output": tokens_output,
        "tokens_cache_read": tokens_cache_read,
        "tokens_cache_create": tokens_cache_create,
        "tool_call_count": tool_call_count,
        "message_count": message_count,
        "error_message": error_message,
    }


def make_otel_event(
    id: int | None = None,
    ts: datetime | None = None,
    event_name: str = "claude_code.tool_result",
    session_id: str | None = None,
    body: dict | None = None,
    attrs_mcp_server: str | None = None,
    attrs_mcp_tool: str | None = None,
) -> dict:
    """Return a dict suitable for OtelEvent ORM construction or raw insert.

    `id` is left None by default — the DB autogenerates the rowid.
    """
    if ts is None:
        ts = datetime.now(UTC)
    row: dict = {
        "ts": ts,
        "event_name": event_name,
        "session_id": session_id,
        "body": body or {},
        "attrs_mcp_server": attrs_mcp_server,
        "attrs_mcp_tool": attrs_mcp_tool,
        "received_at": ts,
    }
    if id is not None:
        row["id"] = id
    return row


def make_token_usage_bucket(
    day: str | None = None,
    model: str = "claude-opus-4-7",
    source: str = "claude-code",
    tokens_input: int = 1000,
    tokens_output: int = 500,
    tokens_cache_read: int = 0,
    tokens_cache_create: int = 0,
    sessions_count: int = 1,
) -> dict:
    """Return a dict suitable for TokenUsageDaily ORM construction.

    `day` defaults to today's date in system tz, matching the local-day bucket
    convention used by ingestion rollups.
    """
    from datetime import date as _date

    if day is None:
        day = _date.today().isoformat()
    return {
        "day": day,
        "model": model,
        "source": source,
        "tokens_input": tokens_input,
        "tokens_output": tokens_output,
        "tokens_cache_read": tokens_cache_read,
        "tokens_cache_create": tokens_cache_create,
        "sessions_count": sessions_count,
    }


def make_tool_call(
    tool_use_id: str = "tu-1",
    session_id: str = "sess-1",
    tool_name: str = "Bash",
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
    duration_ms: int | None = None,
    status: str = "ok",
    error_message: str | None = None,
    input_summary: str | None = None,
    mcp_server_name: str | None = None,
    mcp_tool_name: str | None = None,
    decision: str | None = None,
) -> dict:
    """Return a dict suitable for ToolCall ORM construction or raw insert."""
    if started_at is None:
        started_at = datetime.now(UTC)
    return {
        "tool_use_id": tool_use_id,
        "session_id": session_id,
        "tool_name": tool_name,
        "started_at": started_at,
        "ended_at": ended_at,
        "duration_ms": duration_ms,
        "status": status,
        "error_message": error_message,
        "input_summary": input_summary,
        "mcp_server_name": mcp_server_name,
        "mcp_tool_name": mcp_tool_name,
        "decision": decision,
    }


# ---- Workflow factories + fixtures ----


def make_decision_row(
    dedup_key: str = "dk-1",
    prompt: str = "test decision prompt",
    options: list | None = None,
    status: str = "pending",
    session_id: str | None = None,
    task_id: int | None = None,
    answer: str | None = None,
    answered_at: datetime | None = None,
    answered_by: str | None = None,
) -> dict:
    """Return a dict suitable for Decision ORM construction or raw insert."""
    return {
        "dedup_key": dedup_key,
        "prompt": prompt,
        "options": options if options is not None else [],
        "status": status,
        "session_id": session_id,
        "task_id": task_id,
        "answer": answer,
        "answered_at": answered_at,
        "answered_by": answered_by,
        "created_at": datetime.now(UTC),
    }


def make_inbox_row(
    body: str = "test inbox body",
    subject: str | None = None,
    session_id: str | None = None,
    task_id: int | None = None,
    read: bool = False,
    read_at: datetime | None = None,
    reply: str | None = None,
    replied_at: datetime | None = None,
) -> dict:
    """Return a dict suitable for InboxMessage ORM construction or raw insert."""
    return {
        "body": body,
        "subject": subject,
        "session_id": session_id,
        "task_id": task_id,
        "read": read,
        "read_at": read_at,
        "reply": reply,
        "replied_at": replied_at,
        "created_at": datetime.now(UTC),
    }


def make_task_row(
    title: str = "test task",
    description: str = "",
    status: str = "pending",
    priority: int = 3,
    quadrant: str | None = None,
    approval: str = "auto",
    risk: str | None = None,
    dry_run: bool = False,
    model: str | None = None,
    execution_mode: str = "interactive",
    skill: str | None = None,
    scheduled_for: datetime | None = None,
    schedule_id: int | None = None,
    pid: int | None = None,
    stdout_path: str | None = None,
    error_message: str | None = None,
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
    approved_at: datetime | None = None,
    timeout_s: int | None = None,
) -> dict:
    """Return a dict suitable for Task ORM construction or raw insert.

    `timeout_s` is forwarded for dispatcher classic-timeout tests. Default
    None preserves backward compatibility for callers that do not set it.
    """
    return {
        "title": title,
        "description": description,
        "status": status,
        "priority": priority,
        "quadrant": quadrant,
        "approval": approval,
        "risk": risk,
        "dry_run": dry_run,
        "model": model,
        "execution_mode": execution_mode,
        "skill": skill,
        "scheduled_for": scheduled_for,
        "schedule_id": schedule_id,
        "pid": pid,
        "stdout_path": stdout_path,
        "error_message": error_message,
        "created_at": datetime.now(UTC),
        "started_at": started_at,
        "ended_at": ended_at,
        "approved_at": approved_at,
        "timeout_s": timeout_s,
    }


def make_schedule_row(
    name: str = "sched-1",
    cron: str = "0 9 * * *",
    enabled: bool = True,
    next_run_at: datetime | None = None,
    last_run_at: datetime | None = None,
    task_template: dict | None = None,
    skill: str | None = None,
) -> dict:
    """Return a dict suitable for Schedule ORM construction or raw insert."""
    now = datetime.now(UTC)
    return {
        "name": name,
        "cron": cron,
        "enabled": enabled,
        "next_run_at": next_run_at,
        "last_run_at": last_run_at,
        "task_template": task_template if task_template is not None else {},
        "skill": skill,
        "created_at": now,
        "updated_at": now,
    }


@pytest.fixture
def tmp_pid_dir(tmp_path: Path) -> Path:
    """Per-test fresh PID directory for ESTOP tests. Mirrors the prod path
    shape (.tmp/mission-control-queue/pids/) but anchored to tmp_path so
    tests never touch real /Users/.../.tmp/."""
    d = tmp_path / "pids"
    d.mkdir(parents=True, exist_ok=True)
    return d


@pytest.fixture
def mock_anthropic_client(monkeypatch):
    """Replaces nl_to_cron's AsyncAnthropic constructor with an AsyncMock.

    Yields a configurable mock; tests set
        mock_anthropic_client.messages.create.return_value = ...
    to control the response. Auto-sets ANTHROPIC_API_KEY so the function
    actually attempts the call (rather than early-returning None).
    """
    from unittest.mock import AsyncMock, MagicMock

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    fake_client = MagicMock()
    fake_msg = MagicMock()
    fake_msg.content = [MagicMock(text="* * * * *")]
    fake_client.messages.create = AsyncMock(return_value=fake_msg)
    # Patch the AsyncAnthropic constructor inside the local import in
    # cmc.schedules.nlcron. Each test can overwrite content[0].text.
    original_import = __import__

    def _patched_import(name, *args, **kwargs):
        module = original_import(name, *args, **kwargs)
        if name == "anthropic":
            module.AsyncAnthropic = MagicMock(return_value=fake_client)
        return module

    monkeypatch.setattr("builtins.__import__", _patched_import)
    return fake_client


# ---- Dispatcher fixtures ----


@pytest.fixture
def tmp_pid_dir_monkey(tmp_path, monkeypatch):
    """PID dir fixture that also monkeypatches dispatcher PID-dir bindings."""
    d = tmp_path / "pids"
    d.mkdir()
    monkeypatch.setattr("cmc.core.process.pid_dir", lambda: d)
    monkeypatch.setattr("cmc.dispatcher.state._process_pid_dir", lambda: d)
    return d


@pytest.fixture
def mock_psutil_pids(monkeypatch):
    """Returns a callable that registers a set[int] of PIDs psutil should consider alive.

    Patches BOTH `cmc.dispatcher.state.psutil.pid_exists` and
    `cmc.dispatcher.sweep.psutil.pid_exists` so either consumer sees the mock.
    """
    live: set[int] = set()

    def _register(pids: set[int]) -> None:
        live.clear()
        live.update(pids)

    # Patch the global psutil module's pid_exists (covers all `import psutil`
    # consumers since they share the same module object).
    monkeypatch.setattr("psutil.pid_exists", lambda pid: pid in live)
    return _register


def make_task_orm(**overrides):
    """Return a Task ORM instance instead of a dict."""
    from cmc.db.models.tasks import Task

    defaults = dict(
        title="test task",
        description="",
        status="pending",
        priority=3,
        approval="auto",
        dry_run=False,
        execution_mode="classic",
        created_at=datetime.now(UTC),
    )
    defaults.update(overrides)
    return Task(**defaults)


def make_schedule_orm(**overrides):
    """Return a Schedule ORM instance."""
    from cmc.db.models.schedules import Schedule

    now = datetime.now(UTC)
    defaults = dict(
        name="test schedule",
        cron="*/5 * * * *",
        enabled=True,
        task_template={
            "title": "from schedule",
            "description": "auto",
            "execution_mode": "classic",
        },
        next_run_at=now,
        created_at=now,
        updated_at=now,
    )
    defaults.update(overrides)
    return Schedule(**defaults)
