---
phase: 02-data-ingestion
plan: 02
subsystem: ingest
tags:
  - backend
  - parsing
  - tdd
  - phase-2
requirements:
  - INGST-02
  - INGST-03
  - INGST-06
dependency_graph:
  requires:
    - "02-01-SUMMARY.md (Settings.jsonl_root, golden_jsonl_session fixture, single-test-file convention)"
  provides:
    - "cmc.ingest.jsonl_parser.parse_session_file (pure-sync; the entry contract for Plan 02-04's scheduler)"
    - "cmc.ingest.jsonl_parser.iter_jsonl, parse_iso_z, split_mcp (helpers reused by Plan 02-03 OTLP parser fallback)"
    - "cmc.ingest package marker (Plans 02-03..05 add submodules)"
  affects:
    - "Plan 02-03 (OTLP router) imports split_mcp for INGST-08 fallback path"
    - "Plan 02-04 (scheduler) wraps parse_session_file in asyncio.to_thread() and feeds result into upsert helpers"
tech_stack:
  added: []
  patterns:
    - "Pure-function parser (no DB, no async, no I/O beyond reading the file) so Plan 02-04 can wrap it in asyncio.to_thread() without surprises"
    - "Per-line JSONDecodeError -> warn + continue (INGST-06): a corrupted line MUST NOT crash the sync cycle"
    - "Tool pairing buffered until end-of-file: tool_use and tool_result are gathered into separate dicts keyed by tool_use_id, then joined — no ordering assumption"
    - "10-minute duration clamp (max 600_000 ms) on paired tool_calls to keep outliers (sleep, long compile) from skewing downstream charts"
    - "Daily token_usage_buckets keyed on ts.astimezone().date() (local tz, not UTC) — INGST-05 prep"
key_files:
  created:
    - "backend/cmc/ingest/__init__.py"
    - "backend/cmc/ingest/jsonl_parser.py"
  modified:
    - "backend/tests/test_phase2_ingest.py"
decisions:
  - "Parser is the pure-sync entry contract for Plan 02-04 — scheduler MUST call it via asyncio.to_thread(parse_session_file, path); module docstring + key_links record this"
  - "Returned dict translates usage keys (cache_read/cache_create -> tokens_cache_read/tokens_cache_create) ONCE, in the return-dict construction, not at each accumulation site — keeps the inner loop free of column-name churn"
  - "split_mcp is the canonical mcp__server__tool splitter; Plan 02-03 OTLP parser will import it for the INGST-08 fallback path"
  - "_last_message_ts stays in the session dict (prefixed with _ to flag as private/transient); Plan 02-04 scheduler pops it when computing ended_at from mtime + Settings.session_idle_minutes"
metrics:
  duration: "~3 min"
  completed_date: "2026-04-25"
  tasks: 2
  files: 3
---

# Phase 2 Plan 02-02: JSONL Parser Library Summary

Pure-function JSONL transcript parser exposing `iter_jsonl`, `parse_session_file`, `parse_iso_z`, and `split_mcp` from `cmc.ingest.jsonl_parser` — the entry contract Plan 02-04's scheduler will wrap in `asyncio.to_thread()` to feed sessions/tool_calls/token_usage upserts without blocking the event loop.

## What Landed

- **Package marker** `backend/cmc/ingest/__init__.py` — empty by design so Plan 02-03 (OTLP router) and 02-04 (scheduler) can land submodules in parallel without re-export churn.
- **Parser module** `backend/cmc/ingest/jsonl_parser.py` (~290 lines) — 4 public functions plus a `_summarize_input` private helper.
- **Test growth** in `backend/tests/test_phase2_ingest.py` — appended a `# ---- Plan 02-02 ----` section with 6 new tests (+164 lines). Phase 2 test count: 1 -> 7. Full suite: 26 -> 32.

## Public API

```python
def iter_jsonl(path: Path) -> Iterator[dict]: ...
def parse_iso_z(ts: str) -> datetime: ...
def split_mcp(tool_name: str | None) -> tuple[str | None, str | None]: ...
def parse_session_file(path: Path) -> dict: ...
```

Returned shape (consumed by Plan 02-04's repository as `**kwargs` to upsert helpers):

```python
{
  "session": {
    "session_id": str | None,
    "started_at": datetime,                 # UTC, aware
    "cwd": str | None,
    "model": str | None,
    "tokens_input": int,                    # SUM of message.usage.input_tokens
    "tokens_output": int,
    "tokens_cache_read": int,
    "tokens_cache_create": int,
    "message_count": int,
    "tool_call_count": int,
    "_last_message_ts": datetime | None,    # popped by scheduler
  },
  "tool_calls": [                           # one entry per tool_use block
    {
      "tool_use_id": str,
      "tool_name": str,
      "started_at": datetime,
      "ended_at": datetime | None,          # None when unpaired (status='pending')
      "duration_ms": int | None,            # capped at 600_000 (10 min)
      "status": "ok" | "error" | "pending",
      "mcp_server_name": str | None,        # via split_mcp
      "mcp_tool_name": str | None,
      "input_summary": str | None,          # JSON-serialised tool input, truncated to 200 chars
    },
    ...
  ],
  "token_usage_buckets": [                  # one entry per (local-day, model)
    {
      "day": datetime.date,                 # ts.astimezone().date() — local tz
      "model": str,
      "source": "claude-code",
      "tokens_input": int,
      "tokens_output": int,
      "tokens_cache_read": int,
      "tokens_cache_create": int,
    },
    ...
  ],
}
```

## Plan 02-04 Entry Contract

`parse_session_file` is **pure-sync**. The scheduler in Plan 02-04 MUST call it through `asyncio.to_thread`:

```python
parsed = await asyncio.to_thread(parse_session_file, jsonl_path)
last_ts = parsed["session"].pop("_last_message_ts")
ended_at = decide_ended_at(jsonl_path, last_ts, settings.session_idle_minutes)
parsed["session"]["ended_at"] = ended_at
await sessions_repo.upsert(**parsed["session"])
await tools_repo.upsert_many(parsed["tool_calls"])
await token_usage_repo.upsert_many(parsed["token_usage_buckets"])
```

Notes:

- The parser does **not** decide `session.ended_at` — that is the scheduler's job because it depends on file mtime + `Settings.session_idle_minutes`. The parser exposes `_last_message_ts` (underscore-prefixed to flag it as transient) for the scheduler to consume.
- The parser does **not** call any DB code, does **not** import async libraries, and does **not** read anything other than the file path it is given. This makes it trivially testable with `tmp_path` and lets Plan 02-04 focus on orchestration.
- Daily bucket keys use `ts.astimezone().date()` (local tz). When Plan 02-04 receives the `token_usage_buckets` list, it can pass each row straight through to the `token_usage` table without further timezone gymnastics.

## TDD Gate Compliance

- **RED commit:** `155f405` — `test(02-02): add failing JSONL parser tests (INGST-02, INGST-03, INGST-06)`. Confirmed failing with `ModuleNotFoundError: No module named 'cmc.ingest'` before any implementation existed.
- **GREEN commit:** `720bf80` — `feat(02-02): implement pure JSONL parser library (INGST-02, INGST-03, INGST-06)`. All 6 new tests pass; full suite `pytest -q` = 32 passed.
- **REFACTOR:** Skipped. `parse_session_file` is ~80 lines after blank lines/comments — under the ~120-line threshold the plan called out for extraction. The single-loop structure is readable as-is; refactoring would obscure the sequence of effects (pair-buffer + bucket update inside one walk).

## Test Coverage

| Test | Requirement | Asserts |
|---|---|---|
| `test_jsonl_parser_token_usage_extraction` | INGST-02 | tokens_input=15, tokens_output=28, cache_read=100, cache_create=50, message_count=4, model='claude-opus-4-7' |
| `test_jsonl_parser_tool_pairing_paired` | INGST-03 | tu_paired (Bash) -> status='ok', duration_ms=2000, mcp_*=None, ended_at set |
| `test_jsonl_parser_unpaired_tool_use_pending` | INGST-03 | tu_pending -> status='pending', ended_at=None, duration_ms=None, mcp_server='notebooklm-mcp', mcp_tool='notebook_get' |
| `test_jsonl_parser_mcp_split` | INGST-08 fallback | non-mcp -> (None,None); 2-segment -> tuple; 1-segment -> (None,None); maxsplit=2 preserves trailing __; None/'' -> (None,None) |
| `test_jsonl_parser_duration_capped_at_ten_minutes` | INGST-03 | 30-min raw delta clamped to duration_ms=600_000 |
| `test_jsonl_parser_corrupted_line_skipped` | INGST-06 | tokens_output >= 28 (post-corruption message included); iter_jsonl on valid/corrupt/valid yields exactly 2 dicts |

## Verification

- `cd backend && pytest -q tests/test_phase2_ingest.py` — 7/7 passed (1 from Plan 02-01 + 6 new).
- `cd backend && pytest -q` — 32/32 passed (Phase 1's 25 + 26 baseline holdover + 6 new). All Plan 01 / Plan 02-01 tests still green.
- `python -c "from cmc.ingest.jsonl_parser import iter_jsonl, parse_session_file, parse_iso_z, split_mcp; print('ok')"` — prints `ok`.
- No DB or async imports in `jsonl_parser.py` — `grep -E "^import|^from" backend/cmc/ingest/jsonl_parser.py` shows only `json`, `logging`, `collections.defaultdict`, `datetime`, `pathlib.Path`, `typing.Iterator`. Pure.

## Deviations from Plan

None — plan executed exactly as written.

The plan's source code skeleton in the `<implementation>` block was used verbatim (with the documented translation of usage keys -> tokens_* keys at the return-dict construction site). Test names and structure follow the `<behavior>` block. No `Rule 1/2/3` auto-fixes were needed — every test passed on the first GREEN run.

## Coordination with Parallel Plan 02-03

Plan 02-03 was running in parallel and shares two files: `backend/cmc/ingest/__init__.py` and `backend/tests/test_phase2_ingest.py`. To avoid clobbering:

- `cmc/ingest/__init__.py`: created empty (per plan spec). Plan 02-03 can append its own export lines (or leave it empty too — the docstring already documents the convention).
- `tests/test_phase2_ingest.py`: appended below a clearly-marked `# ---- Plan 02-02 ----` section. Existing seed test (`test_phase2_settings_fields_present`) untouched. Plan 02-03 should similarly append below a `# ---- Plan 02-03 ----` marker.

Both files are append-safe at this point — no shared symbol or import would conflict with Plan 02-03's anticipated `from .otel_parser import ...` line in `__init__.py` if it adds one.

## Threat Flags

None — pure parsing of a file already on disk with no network surface, no auth, no schema mutations. INGST-06 (corruption resilience) is the security-relevant property and is covered by the test suite.

## Self-Check: PASSED

Files created/modified verified on disk:

- `backend/cmc/ingest/__init__.py` — FOUND (12 lines, package marker docstring)
- `backend/cmc/ingest/jsonl_parser.py` — FOUND (~290 lines, 4 public functions + helper)
- `backend/tests/test_phase2_ingest.py` — FOUND (modified, +164 lines under Plan 02-02 marker)

Commits verified in git log:

- `155f405` — RED commit, FOUND
- `720bf80` — GREEN commit, FOUND
