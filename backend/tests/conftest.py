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
    """Strip CMC-related env vars so Settings() falls back to defaults.

    Phase 11 (Pitfall A): also strip ANTHROPIC_API_KEY and TELEGRAM_* so
    tests don't pick up developer-machine values via Settings's broadened
    env_file tuple. Belt-and-suspenders alongside the per-call-site
    `_env_file=None` audit.
    """
    for k in list(os.environ.keys()):
        if k.upper() in {
            "HOST",
            "PORT",
            "DB_PATH",
            "DB_ECHO",
            "LOG_LEVEL",
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
    """Per-test fresh DB path. Plans 04-06 use this."""
    return tmp_path / "cmc.db"


@pytest.fixture
def test_settings(clean_env, tmp_db_path) -> Settings:
    """Settings instance with a tmp DB path. Plans 04-06 use this.

    Note: tmp_db_path is absolute, so Settings' repo-root resolver leaves it untouched.

    Phase 11 (Pitfall A): pass `_env_file=None` so the broadened env_file tuple
    in Settings.model_config (which now includes ~/.command-centre/.env) cannot
    leak the developer's real install env into test runs.
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


# ---- Phase 2 fixtures ----

import json
from datetime import datetime, timedelta, timezone


@pytest.fixture
def fake_jsonl_dir(tmp_path: Path) -> Path:
    """Mimic the ~/.claude/projects/<project-hash>/<session>.jsonl layout.

    Returns a directory that contains one or more `<hash>/<session>.jsonl` files.
    Plan 04 (scheduler) overrides Settings.jsonl_root to this dir for hermetic testing.
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

    base_ts = datetime(2026, 4, 25, 17, 0, 0, tzinfo=timezone.utc)
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
                            {"key": "event.name", "value": {"stringValue": "claude_code.tool_result"}},
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
                            {"key": "event.name", "value": {"stringValue": "claude_code.tool_result"}},
                            {"key": "session_id", "value": {"stringValue": "sess-1"}},
                            {"key": "tool_name", "value": {"stringValue": "mcp__myserver__do_thing"}},
                            {"key": "tool_parameters", "value": {"stringValue":
                                json.dumps({"mcp_server_name": "myserver", "mcp_tool_name": "do_thing"})}},
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


# ---- Phase 3 Wave 0 fixtures (Plan 03-01 Task 3) ----
#
# Promotes the Phase 2 _bootstrap_app helper to a shared `seeded_app` fixture
# and adds a httpx ASGITransport-backed `client` fixture so all five Phase 3
# router test files can exercise endpoints without re-bootstrapping. The
# four `make_*` factories return plain dicts suitable for either ORM
# construction OR raw INSERT statements (they are NOT fixtures — just module-
# level helpers callable from any test).

from typing import Optional

import httpx
import pytest_asyncio


@pytest_asyncio.fixture
async def seeded_app(test_settings):
    """Phase 3 shared fixture: a FastAPI app with the full router set wired in
    via cmc.app.factory.create_app and lifespan ready to enter.

    Returns (app, lifespan_cm) — caller wraps `async with cm:` to start the
    lifespan (which runs alembic upgrade + boot-time sync_once + starts the
    periodic loop).

    Hermetic guarantees:
      - jsonl_root is auto-redirected to a tmp nonexistent path when it
        defaults to `~/.claude/projects` (mirrors Phase 2 _bootstrap_app's
        BLOCKER-3-style protection).
      - static_dir is left as-is — factory.create_app skips the SPA mount
        when the directory has no index.html, which is the test default.
      - boot_time defensive write: lifespan ALREADY sets app.state.boot_time
        on startup (Task 1a), but we additionally pre-seed it here with a
        deterministic 42-seconds-ago timestamp BEFORE entering the lifespan,
        so any test that inspects boot_time before the lifespan starts gets
        a sensible value. The lifespan WILL overwrite this on startup with
        the true `datetime.now(timezone.utc)`.

    Wave 1 plans (03-02..03-05) typically destructure this fixture as:
        app, cm = seeded_app
        async with cm:
            ... # use app.state.sessions, app.state.engine, etc.

    For HTTP-level tests, prefer the `client` fixture below — it handles
    ASGITransport + lifespan entry for you.
    """
    from cmc.app.factory import create_app

    # Mirror the Phase 2 _bootstrap_app jsonl_root override (Pitfall: never
    # ingest user data in tests). Detect the default and replace with a
    # tmp-path nonexistent dir so sync_once early-returns harmlessly.
    if str(test_settings.jsonl_root).endswith(".claude/projects"):
        test_settings = test_settings.model_copy(update={
            "jsonl_root": test_settings.db_path.parent / "no-jsonl-here",
        })

    app = create_app(test_settings)
    # Defensive pre-seed (the lifespan will overwrite on startup).
    app.state.boot_time = datetime.now(timezone.utc) - timedelta(seconds=42)

    return app, app.router.lifespan_context(app)


@pytest_asyncio.fixture
async def client(seeded_app):
    """Phase 3 shared fixture: httpx.AsyncClient bound to seeded_app via
    ASGITransport so the lifespan is properly entered.

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
    started_at: Optional[datetime] = None,
    ended_at: Optional[datetime] = None,
    cwd: str = "/Users/test/proj",
    model: Optional[str] = "claude-opus-4-7",
    source: Optional[str] = "claude-code",
    outcome: Optional[str] = None,
    tokens_input: int = 0,
    tokens_output: int = 0,
    tokens_cache_read: int = 0,
    tokens_cache_create: int = 0,
    tool_call_count: int = 0,
    message_count: int = 0,
    error_message: Optional[str] = None,
) -> dict:
    """Return a dict suitable for Session ORM construction or raw insert."""
    if started_at is None:
        started_at = datetime.now(timezone.utc)
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
    id: Optional[int] = None,
    ts: Optional[datetime] = None,
    event_name: str = "claude_code.tool_result",
    session_id: Optional[str] = None,
    body: Optional[dict] = None,
    attrs_mcp_server: Optional[str] = None,
    attrs_mcp_tool: Optional[str] = None,
) -> dict:
    """Return a dict suitable for OtelEvent ORM construction or raw insert.

    `id` is left None by default — the DB autogenerates the rowid.
    """
    if ts is None:
        ts = datetime.now(timezone.utc)
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
    day: Optional[str] = None,
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
    convention from Plan 02-04.
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
    started_at: Optional[datetime] = None,
    ended_at: Optional[datetime] = None,
    duration_ms: Optional[int] = None,
    status: str = "ok",
    error_message: Optional[str] = None,
    input_summary: Optional[str] = None,
    mcp_server_name: Optional[str] = None,
    mcp_tool_name: Optional[str] = None,
    decision: Optional[str] = None,
) -> dict:
    """Return a dict suitable for ToolCall ORM construction or raw insert."""
    if started_at is None:
        started_at = datetime.now(timezone.utc)
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


# ---- Phase 4 factories + fixtures (Plan 04-01) ----


def make_decision_row(
    dedup_key: str = "dk-1",
    prompt: str = "test decision prompt",
    options: Optional[list] = None,
    status: str = "pending",
    session_id: Optional[str] = None,
    task_id: Optional[int] = None,
    answer: Optional[str] = None,
    answered_at: Optional[datetime] = None,
    answered_by: Optional[str] = None,
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
        "created_at": datetime.now(timezone.utc),
    }


def make_inbox_row(
    body: str = "test inbox body",
    subject: Optional[str] = None,
    session_id: Optional[str] = None,
    task_id: Optional[int] = None,
    read: bool = False,
    read_at: Optional[datetime] = None,
    reply: Optional[str] = None,
    replied_at: Optional[datetime] = None,
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
        "created_at": datetime.now(timezone.utc),
    }


def make_task_row(
    title: str = "test task",
    description: str = "",
    status: str = "pending",
    priority: int = 3,
    quadrant: Optional[str] = None,
    approval: str = "auto",
    risk: Optional[str] = None,
    dry_run: bool = False,
    model: Optional[str] = None,
    execution_mode: str = "interactive",
    skill: Optional[str] = None,
    scheduled_for: Optional[datetime] = None,
    schedule_id: Optional[int] = None,
    pid: Optional[int] = None,
    stdout_path: Optional[str] = None,
    error_message: Optional[str] = None,
    started_at: Optional[datetime] = None,
    ended_at: Optional[datetime] = None,
    approved_at: Optional[datetime] = None,
    timeout_s: Optional[int] = None,
) -> dict:
    """Return a dict suitable for Task ORM construction or raw insert.

    Phase 8 addition: `timeout_s` (Optional[int]) is forwarded for DISP-05
    classic-timeout tests. Default None preserves backward compatibility for
    every Phase 4 caller.
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
        "created_at": datetime.now(timezone.utc),
        "started_at": started_at,
        "ended_at": ended_at,
        "approved_at": approved_at,
        "timeout_s": timeout_s,
    }


def make_schedule_row(
    name: str = "sched-1",
    cron: str = "0 9 * * *",
    enabled: bool = True,
    next_run_at: Optional[datetime] = None,
    last_run_at: Optional[datetime] = None,
    task_template: Optional[dict] = None,
    skill: Optional[str] = None,
) -> dict:
    """Return a dict suitable for Schedule ORM construction or raw insert."""
    now = datetime.now(timezone.utc)
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


# ---- Phase 8 dispatcher fixtures (additive — do NOT replace Phase 4 helpers) ----


@pytest.fixture
def tmp_pid_dir_monkey(tmp_path, monkeypatch):
    """Phase 8 variant of tmp_pid_dir: also monkeypatches cmc.core.process.pid_dir
    AND cmc.dispatcher.state._phase4_pid_dir so dispatcher modules see the tmp
    directory regardless of which import binding they use. Distinct from
    Phase 4's tmp_pid_dir(tmp_path) which only returns a path without
    monkeypatching."""
    d = tmp_path / "pids"
    d.mkdir()
    monkeypatch.setattr("cmc.core.process.pid_dir", lambda: d)
    monkeypatch.setattr("cmc.dispatcher.state._phase4_pid_dir", lambda: d)
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
    """Phase 8 variant: returns a Task ORM instance (not a dict).

    Phase 4's `make_task_row` returns a dict — kept intact for Phase 4 tests.
    New Phase 8 tests that need an ORM instance use this helper.
    """
    from cmc.db.models.tasks import Task

    defaults = dict(
        title="test task",
        description="",
        status="pending",
        priority=3,
        approval="auto",
        dry_run=False,
        execution_mode="classic",
        created_at=datetime.now(timezone.utc),
    )
    defaults.update(overrides)
    return Task(**defaults)


def make_schedule_orm(**overrides):
    """Phase 8 variant — Schedule ORM instance (sibling of make_task_orm)."""
    from cmc.db.models.schedules import Schedule

    now = datetime.now(timezone.utc)
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
