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
