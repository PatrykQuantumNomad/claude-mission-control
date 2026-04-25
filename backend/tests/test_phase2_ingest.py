"""Phase 2 — Data Ingestion test suite.

Single test file per phase (Phase 1 convention). Each plan in Phase 2 appends
its INGST-* tests below the marker for that plan.

Sections:
  Plan 02-01 (this file's seed): settings sanity.
  Plan 02-02 (JSONL parser):       INGST-02, INGST-03, INGST-06 tests appended.
  Plan 02-03 (OTLP router):        INGST-07, INGST-08, INGST-09 tests appended.
  Plan 02-04 (scheduler/repo):     INGST-04, INGST-05 tests appended.
  Plan 02-05 (lifespan/manual):    INGST-01, INGST-10 tests appended.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path


# ---- Plan 02-01: settings sanity ----

def test_phase2_settings_fields_present(test_settings):
    """Plan 02-01: confirm the three new settings fields exist with expected defaults.

    Downstream plans rely on these defaults; if a future change drops them,
    this test catches it before the dependent code breaks.
    """
    assert test_settings.session_idle_minutes == 5
    assert test_settings.otlp_max_body_bytes == 10_000_000
    # jsonl_root is a Path; default contains ".claude/projects"
    assert ".claude/projects" in str(test_settings.jsonl_root)


# ---- Plan 02-02: JSONL parser (INGST-02, INGST-03, INGST-06) ----


def test_jsonl_parser_token_usage_extraction(golden_jsonl_session):
    """INGST-02: tokens summed across every assistant message.usage block.

    The fixture has two assistant turns:
      - turn 1: input=10, output=20, cache_read=100, cache_create=50
      - turn 2: input=5,  output=8,  cache_read=0,   cache_create=0
    Expected: 15 / 28 / 100 / 50.
    Message count counts only the 4 valid user+assistant lines (corrupted line skipped).
    Model is the most recent (or first) model name on assistant turns.
    """
    from cmc.ingest.jsonl_parser import parse_session_file

    result = parse_session_file(golden_jsonl_session)
    sess = result["session"]
    assert sess["tokens_input"] == 15
    assert sess["tokens_output"] == 28
    assert sess["tokens_cache_read"] == 100
    assert sess["tokens_cache_create"] == 50
    assert sess["message_count"] == 4
    assert sess["model"] == "claude-opus-4-7"


def test_jsonl_parser_tool_pairing_paired(golden_jsonl_session):
    """INGST-03: tool_use + tool_result pair on tool_use_id; status='ok' when not is_error.

    Fixture: tu_paired (Bash) at t+1s, tool_result at t+3s -> duration_ms == 2000.
    Non-MCP name -> mcp_server_name and mcp_tool_name both None.
    """
    from cmc.ingest.jsonl_parser import parse_session_file

    result = parse_session_file(golden_jsonl_session)
    paired = next(tc for tc in result["tool_calls"] if tc["tool_use_id"] == "tu_paired")
    assert paired["tool_name"] == "Bash"
    assert paired["status"] == "ok"
    assert paired["duration_ms"] == 2000
    assert paired["mcp_server_name"] is None
    assert paired["mcp_tool_name"] is None
    assert paired["ended_at"] is not None


def test_jsonl_parser_unpaired_tool_use_pending(golden_jsonl_session):
    """INGST-03: tool_use without matching tool_result -> status='pending'.

    Fixture: tu_pending (mcp__notebooklm-mcp__notebook_get) at t+5s, no result.
    Expect status='pending', ended_at=None, duration_ms=None.
    Also exercises the MCP split fallback (test_jsonl_parser_mcp_split below
    asserts it directly): server='notebooklm-mcp', tool='notebook_get'.
    """
    from cmc.ingest.jsonl_parser import parse_session_file

    result = parse_session_file(golden_jsonl_session)
    pending = next(tc for tc in result["tool_calls"] if tc["tool_use_id"] == "tu_pending")
    assert pending["tool_name"] == "mcp__notebooklm-mcp__notebook_get"
    assert pending["status"] == "pending"
    assert pending["ended_at"] is None
    assert pending["duration_ms"] is None
    # MCP attributes populated for downstream INGST-08 fallback
    assert pending["mcp_server_name"] == "notebooklm-mcp"
    assert pending["mcp_tool_name"] == "notebook_get"


def test_jsonl_parser_mcp_split():
    """INGST-08 fallback path: split_mcp behaviour.

    Direct unit on the helper to lock its semantics independently of the
    parser pipeline. maxsplit=2 means the third component preserves any
    trailing `__` separators.
    """
    from cmc.ingest.jsonl_parser import split_mcp

    assert split_mcp("Bash") == (None, None)
    assert split_mcp("mcp__myserver__do_thing") == ("myserver", "do_thing")
    assert split_mcp("mcp__weird") == (None, None)  # only one separator
    assert split_mcp("mcp__has__under__scores") == ("has", "under__scores")
    assert split_mcp(None) == (None, None)
    assert split_mcp("") == (None, None)


def test_jsonl_parser_duration_capped_at_ten_minutes(tmp_path):
    """INGST-03: duration_ms is clamped at 600_000 (10 min) even if the
    tool_result arrives 30 min after the tool_use.

    This protects downstream charts from outlier-skewed scales when a tool
    runs unattended (sleep, long compile) — research §3 calls this out.
    """
    from cmc.ingest.jsonl_parser import parse_session_file

    sid = "cap-test-session"
    base = datetime(2026, 4, 25, 12, 0, 0, tzinfo=timezone.utc)

    def iso(t: datetime) -> str:
        return t.isoformat().replace("+00:00", "Z")

    lines = [
        json.dumps({
            "type": "assistant", "uuid": "a1", "sessionId": sid,
            "timestamp": iso(base),
            "message": {
                "role": "assistant", "model": "claude-opus-4-7",
                "usage": {"input_tokens": 1, "output_tokens": 1},
                "content": [
                    {"type": "tool_use", "id": "tu_long", "name": "Bash",
                     "input": {"command": "sleep 1800"}},
                ],
            },
        }),
        json.dumps({
            "type": "user", "uuid": "u1", "sessionId": sid,
            # 30 minutes later -> raw delta 1_800_000 ms; expected clamp to 600_000
            "timestamp": iso(base + timedelta(minutes=30)),
            "message": {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "tu_long",
                     "is_error": False, "content": "done"},
                ],
            },
        }),
    ]
    f = tmp_path / "cap.jsonl"
    f.write_text("\n".join(lines) + "\n")

    result = parse_session_file(f)
    assert result["tool_calls"][0]["tool_use_id"] == "tu_long"
    assert result["tool_calls"][0]["duration_ms"] == 600_000


def test_jsonl_parser_corrupted_line_skipped(golden_jsonl_session, tmp_path):
    """INGST-06: a corrupted line in the MIDDLE must NOT crash the parser, AND
    the parser must continue past it so subsequent valid lines are still parsed.

    Two assertions:
      1. Using golden_jsonl_session (which contains '{"type": "assist' mid-file),
         tokens_output >= 28 — the +8 from the post-corruption assistant message
         was included, proving parsing continued.
      2. Direct unit on iter_jsonl: 3-line file (valid / corrupt / valid) yields
         exactly 2 dicts (the valid lines), no exception raised.
    """
    from cmc.ingest.jsonl_parser import iter_jsonl, parse_session_file

    # 1. Whole-file integration: corruption did not lose the trailing message.
    result = parse_session_file(golden_jsonl_session)
    assert result["session"]["tokens_output"] >= 28

    # 2. Unit: iter_jsonl skips the corrupted line and yields the surrounding ones.
    f = tmp_path / "mixed.jsonl"
    f.write_text(
        '{"a": 1}\n'
        '{"type": "assist\n'   # truncated, missing closing quote and brace
        '{"b": 2}\n'
    )
    parsed = list(iter_jsonl(f))
    assert len(parsed) == 2
    assert parsed[0] == {"a": 1}
    assert parsed[1] == {"b": 2}
