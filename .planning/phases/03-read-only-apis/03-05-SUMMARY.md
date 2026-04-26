---
phase: 03-read-only-apis
plan: 05
subsystem: api
tags: [fastapi, sqlalchemy, sqlite-window-functions, mcp, skills, pyyaml, single-flight]

# Dependency graph
requires:
  - phase: 03-read-only-apis
    provides: "Wave 0 (Plan 03-01) — schemas/mcp.py + schemas/skills.py DTOs, seeded_app+client fixtures, factory helpers, tail_otel_events SSE generator"
  - phase: 01-foundation-database
    provides: "mcp_stats + skills + tools + otel_events SQLModel tables (Plan 01-05); FastAPI factory + lifespan + register_error_handlers (Plan 01-06); cmc.core.paths.repo_root (Plan 01-04)"
  - phase: 02-data-ingestion
    provides: "tools table populated by JSONL parser (Plan 02-02); otel_events populated by /v1/logs OTLP ingest (Plan 02-03)"
provides:
  - "GET /api/mcp — list MCP servers (server-level rows, sorted by call_count desc)"
  - "GET /api/mcp/{server}/tools — list MCP tools per server (priority-ordered)"
  - "POST /api/mcp/sync — rebuild mcp_stats from 3 priority sources (single-flight)"
  - "POST /api/mcp/measure — best-effort schema_size_bytes measurement per server"
  - "GET /api/skills — list skills with environment + user_invocable filters"
  - "POST /api/skills/sync — scan ~/.claude/skills + repo_root()/skills, upsert (single-flight)"
  - "PATCH /api/skills/{name}/autonomy — update autonomy (Literal enum + name regex + dotdot block)"
  - "cmc.mcp.aggregator.rebuild_mcp_stats — three-source priority aggregator (reusable)"
  - "cmc.skills.scanner — symlink-safe, one-level-deep, 1000-capped skill scanner"
affects:
  - "Phase 5 (UI) — MCP tab + Skills tab consume these endpoints (OPNL-15, SKLP-*)"
  - "Phase 8 (Dispatcher) — DISP-04/11 reads autonomy from skills.autonomy (set via PATCH endpoint)"
  - "Future sync-style endpoints (any phase) — single-flight pattern via app.state.<feature>_sync_running"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-source priority aggregator: tool_decision events > tools table > attrs-only otel events. Higher source wins per (server, tool) pair; lower sources fill only the gaps."
    - "SQLite window-function percentiles: ROW_NUMBER() OVER (PARTITION BY ...) + COUNT(*) OVER (PARTITION BY ...), then GROUP BY with MAX(CASE WHEN rn = MAX(CAST(cnt * frac AS INT), 1) THEN duration_ms END). Replaces broken correlated-subquery LIMIT 1 OFFSET pattern."
    - "Single-flight sync guard: app.state.<feature>_sync_running boolean flag set in entry, cleared in finally; concurrent calls receive 409. Pattern reusable for any future POST /api/<x>/sync endpoint."
    - "Path-traversal defense in depth: regex (^[a-zA-Z0-9._-]+$ or ^[a-zA-Z0-9_-]+$) PLUS explicit '..' substring check. Regex alone permits 'bad..name' since '.' is allowed."
    - "PyYAML safe_load convention with silent None on parse errors — caller treats unparseable SKILL.md as 'not present' rather than as an error (errors counter stays 0)."
    - "Skill scanner Pitfall 5 hardening: symlinks rejected at BOTH directory AND SKILL.md file levels; one-level-deep walk only; MAX_SKILLS=1000 cap."
    - "Skills sync NEVER overwrites autonomy on resync — SKIL-03 PATCH is the canonical update path. Resyncing should not clobber a user's manual override."

key-files:
  created:
    - "backend/cmc/mcp/__init__.py — package marker for MCP aggregator"
    - "backend/cmc/mcp/aggregator.py — rebuild_mcp_stats async function with priority-ordered SQL"
    - "backend/cmc/skills/__init__.py — package marker for skill scanner"
    - "backend/cmc/skills/scanner.py — find_skill_files, parse_skill, scan_all + MAX_SKILLS"
    - "backend/cmc/api/routes/mcp.py — 4 MCP endpoints"
    - "backend/cmc/api/routes/skills.py — 3 Skills endpoints"
  modified:
    - "backend/cmc/api/routes/__init__.py — registered mcp_router + skills_router (preserved 5 sibling Wave 1 routers)"
    - "backend/tests/test_phase3_mcp.py — 7 new tests (1 importable + 6 implementation)"
    - "backend/tests/test_phase3_skills.py — 8 new tests (1 importable + 7 implementation)"

key-decisions:
  - "MCP three-source priority order LOCKED: tool_decision > tools > otel (per RESEARCH §2.5 Open Q2/A3). Documented in cmc/mcp/aggregator.py module docstring."
  - "Server-level call_count = SUM across per-tool merged rows (priority already deduped); server-level p50/p95/max from highest-priority SRV query (true percentile per source). Reflects must-have 'across ALL of a server's calls' while honoring 'NOT max-of-per-tool' (checker WARNING 4)."
  - "Plan SQL was broken against SQLite (correlated-subquery COUNT() in OFFSET → 'misuse of aggregate function'). Replaced with window-function pattern (ROW_NUMBER + COUNT OVER PARTITION BY)."
  - "Path-traversal regex for both routers PERMITS '.' (server names like 'context7.io' are valid), so explicit '..' substring check added on top of the regex (defense in depth)."
  - "Skills sync does NOT clobber existing autonomy values — SKIL-03 PATCH is canonical. Documented in skills_sync docstring."
  - "Skills sync `errors` counter stays 0 for unparseable SKILL.md files; scanner returns None silently and the count just decreases. errors counter is reserved for actual exceptions during DB upsert."

patterns-established:
  - "Pattern A — Window-function percentiles for SQLite: when computing p50/p95 grouped by partition, ROW_NUMBER + COUNT OVER PARTITION BY then GROUP BY with MAX(CASE WHEN rn = MAX(CAST(cnt * frac AS INTEGER), 1) THEN value END) is the correct shape. SQLite 3.47+ supports this. Future plans needing percentiles should follow."
  - "Pattern B — Single-flight sync endpoints: any POST /api/<x>/sync that does long work should set app.state.<x>_sync_running in entry path, clear in finally. Concurrent calls receive 409 with 'detail: <x> sync already running'."
  - "Pattern C — Defense-in-depth path validation: regex + explicit '..' check. The regex defines the alphabet; the dotdot check rejects literal traversal."
  - "Pattern D — Three-source priority aggregator: when multiple tables/event-streams describe the same conceptual entity at different fidelity, build a merged dict keyed by entity ID and iterate sources high→low, only writing if key is absent. Source labels are preserved on the row for downstream introspection."

# Metrics
duration: ~25 min
completed: 2026-04-26
---

# Phase 3 Plan 05: MCP + Skills Routers Summary

**Two new routers (7 endpoints) backed by a three-source priority MCP aggregator and a Pitfall-5-hardened skill filesystem scanner; window-function percentiles in SQLite; single-flight guards on both sync endpoints.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-26T13:24:00Z
- **Completed:** 2026-04-26T13:51:00Z
- **Tasks:** 2 (TDD — 4 commits: 2 RED + 2 GREEN)
- **Files created:** 5 (2 new packages with __init__.py + scanner/aggregator + 2 routers)
- **Files modified:** 3 (routes/__init__.py + 2 phase3 test files)

## Accomplishments

- **MCP-01..04 (4 endpoints):** GET list servers, GET per-server tools, POST sync (rebuild from priority sources with single-flight 409 protection), POST measure (best-effort schema_size_bytes).
- **SKIL-01..03 (3 endpoints):** GET list with filters, POST sync (single-flight; walks both user + project skill roots), PATCH autonomy (regex + dotdot block + Literal enum).
- **Three-source MCP aggregator** in cmc/mcp/aggregator.py: tool_decision otel events (highest fidelity, has decision + duration) > tools table (paired tool_use/tool_result with duration) > attrs-only otel events (lowest fidelity, no duration). Window-function percentiles computed per (server, tool) and per server.
- **Skill scanner** in cmc/skills/scanner.py: yaml.safe_load-only frontmatter parser, symlink-rejecting one-level walker, 1000-entry cap.
- **Both routers wired** into cmc.api.routes.all_routers() preserving all 5 sibling Wave 1 routers (health/sync/mcp/sessions/observability/system) — read-before-edit discipline observed despite parallel-agent concurrency.
- **15 new tests pass** (7 MCP + 8 Skills). Pre-existing 70 tests still green; full suite at 130 passing.

## Task Commits

Each task was TDD (RED → GREEN), producing 2 commits per task:

1. **Task 1 RED — MCP failing tests** — `cc1c7a4` (test)
2. **Task 1 GREEN — MCP aggregator + router** — `3a2c3a0` (feat)
3. **Task 2 RED — Skills failing tests** — `485a75e` (test)
4. **Task 2 GREEN — Skills scanner + router** — `8aa09be` (feat)

## Files Created/Modified

### Created

- `backend/cmc/mcp/__init__.py` — Package marker for MCP aggregator (8 lines, docstring only).
- `backend/cmc/mcp/aggregator.py` — `rebuild_mcp_stats(db) -> dict` with three priority sources (tool_decision otel events / tools table / attrs-only otel events) and window-function p50/p95/max queries for both per-(server, tool) and per-server aggregates. Returns `{servers, tools, source_counts, duration_ms}`.
- `backend/cmc/skills/__init__.py` — Package marker for skill scanner (10 lines, docstring only).
- `backend/cmc/skills/scanner.py` — `find_skill_files(root)`, `parse_skill(path, default_env)`, `scan_all(user_dir, project_dir, max_skills)` + `MAX_SKILLS=1000` constant. `_FRONTMATTER_RE` matches `^---$\n<yaml>\n^---$` with DOTALL+MULTILINE flags.
- `backend/cmc/api/routes/mcp.py` — 4 endpoints (GET /mcp, GET /mcp/{server}/tools, POST /mcp/sync, POST /mcp/measure). Server name validated with `^[a-zA-Z0-9._-]+$` regex + explicit `..` block.
- `backend/cmc/api/routes/skills.py` — 3 endpoints (GET /skills, POST /skills/sync, PATCH /skills/{name}/autonomy). Skill name validated with `^[a-zA-Z0-9_-]+$` regex + explicit `..` block. Sync intentionally does not clobber existing autonomy.

### Modified

- `backend/cmc/api/routes/__init__.py` — Added `mcp_router` AND `skills_router` to imports + all_routers() return list. Preserves Wave 1 siblings (`system_router`, `sessions_router`, `observability_router`).
- `backend/tests/test_phase3_mcp.py` — Added 6 implementation tests (priority sources sync, server list ordering, per-tool priority routing, single-flight 409, measure write, direct aggregator priority lock). Plus the pre-existing schema-importable smoke = 7 total.
- `backend/tests/test_phase3_skills.py` — Added 7 implementation tests (scanner symlink/one-level/cap, mocked sync upserts, real-filesystem end-to-end sync, list filters, PATCH happy/404/400/422). Plus the pre-existing schema-importable smoke = 8 total.

## Sample Response Shapes

**GET /api/mcp:**
```json
{ "items": [
  { "server_name": "github", "call_count": 4, "error_count": 0,
    "latency_p50_ms": 200.0, "latency_p95_ms": 500.0, "latency_max_ms": 500.0,
    "source_priority": "aggregate", "computed_at": "2026-04-26T13:50:00Z" }
] }
```

**GET /api/mcp/github/tools:**
```json
{ "server_name": "github", "items": [
  { "server_name": "github", "tool_name": "list_repos",
    "call_count": 3, "error_count": 0, "latency_p50_ms": 200.0,
    "source_priority": "tools", "schema_size_bytes": null },
  { "server_name": "github", "tool_name": "merge_pr",
    "call_count": 1, "error_count": 0, "latency_p50_ms": 500.0,
    "source_priority": "tool_decision", "schema_size_bytes": null }
] }
```

**POST /api/mcp/sync:**
```json
{ "status": "ok", "servers": 2, "tools": 3,
  "source_counts": { "tool_decision": 1, "tools": 1, "otel": 1 },
  "duration_ms": 12 }
```

**POST /api/mcp/measure:**
```json
{ "status": "ok", "servers_measured": 2, "duration_ms": 4 }
```

**GET /api/skills?environment=personal:**
```json
{ "items": [
  { "name": "skill-beta", "environment": "personal",
    "user_invocable": true, "autonomy": "review",
    "description": "beta", "path": "/.../skill-beta/SKILL.md",
    "updated_at": "2026-04-26T13:51:00Z" }
] }
```

**POST /api/skills/sync:**
```json
{ "status": "ok", "found": 2, "upserted": 2, "unchanged": 0,
  "errors": 0, "duration_ms": 8 }
```

**PATCH /api/skills/my-skill/autonomy {"autonomy":"auto"}:**
```json
{ "name": "my-skill", "autonomy": "auto",
  "updated_at": "2026-04-26T13:51:00Z" }
```

## Path-Traversal Regexes (Locked)

- MCP server name: `^[a-zA-Z0-9._-]+$` + explicit `".." in name` block.
- Skill name:      `^[a-zA-Z0-9_-]+$`  + explicit `".." in name` block.

The `.` permitted in MCP server names allows things like `context7.io`; the `..` check explicitly rejects literal traversal sequences.

## Single-Flight Pattern (Locked)

Both `POST /api/mcp/sync` and `POST /api/skills/sync` use:

```python
if getattr(request.app.state, "<feature>_sync_running", False):
    raise HTTPException(409, detail="<feature> sync already running")
request.app.state.<feature>_sync_running = True
try:
    ...
finally:
    request.app.state.<feature>_sync_running = False
```

Future POST /api/<x>/sync endpoints (Phases 6-8 likely candidates) should follow this pattern.

## SKILL.md Frontmatter Convention

```
---
name: my-skill
environment: personal      # or "project" or "mcp"
user_invocable: true
autonomy: manual           # auto | review | manual (PATCHable via SKIL-03)
description: optional human description
---
<body markdown>
```

`yaml.safe_load` only — never `yaml.load` (V12 mitigation against arbitrary Python object construction).

## Decisions Made

- **MCP three-source priority order locked**: tool_decision > tools > otel. Lower-fidelity sources only fill (server, tool) pairs the higher source did not produce. (RESEARCH §2.5 Open Q2/A3 → enforced in cmc/mcp/aggregator.py module docstring.)
- **Server-level metrics strategy**: `call_count` = SUM over per-tool merged rows (priority dedupes); `latency p50/p95/max` from highest-priority server-level SRV query. Avoids the "max-of-per-tool" anti-pattern flagged in checker WARNING 4 while satisfying the must-have "across ALL of a server's calls".
- **Skill scanner cap defaults**: `MAX_SKILLS=1000`, one-level deep, no symlinks (Pitfall 5 — module constant, not magic number).
- **Resync does not clobber autonomy**: SKIL-03 PATCH is canonical for autonomy; resyncing the catalog only updates environment/user_invocable/description/path/frontmatter. Documented in `skills_sync` route docstring.
- **Errors counter scoped to DB exceptions**: Unparseable SKILL.md files return None from parse_skill (silent skip; not counted as errors). Only DB upsert exceptions increment `errors` in the sync response.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan-prescribed SQL was broken against SQLite ("misuse of aggregate function COUNT()")**

- **Found during:** Task 1 (Aggregator GREEN phase — first test run after implementing).
- **Issue:** Plan 03-05's `_SRC1_SQL`/`_SRC2_SQL`/`_SRV1_SQL`/`_SRV2_SQL` blocks used a correlated-subquery percentile pattern: `(SELECT duration_ms FROM td td2 WHERE ... ORDER BY duration_ms LIMIT 1 OFFSET MAX(CAST(COUNT(*) * 0.5 AS INTEGER) - 1, 0))`. The `COUNT(*)` inside the OFFSET expression refers to the OUTER query's GROUP BY context, but SQLite cannot evaluate an aggregate from the outer query inside a subquery's OFFSET — it raises `sqlite3.OperationalError: misuse of aggregate function COUNT()`.
- **Fix:** Rewrote all four queries to use the SQLite 3.47+ window-function pattern: a `ranked` CTE that adds `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY duration_ms)` and `COUNT(*) OVER (PARTITION BY ...)` columns, followed by a top-level GROUP BY with `MAX(CASE WHEN rn = MAX(CAST(cnt * frac AS INTEGER), 1) THEN duration_ms END)` for each percentile. Numerically equivalent for `N >= 2`; for `N == 1` both forms return the single value (the inner `MAX(..., 1)` ensures rank 1 is picked, never rank 0).
- **Files modified:** `backend/cmc/mcp/aggregator.py`.
- **Verification:** All 6 MCP implementation tests pass after the rewrite (priority routing, single-flight 409, measure, direct aggregator unit test).
- **Committed in:** `3a2c3a0` (Task 1 GREEN).

**2. [Rule 1 - Bug] Path-traversal regex permitted "bad..name" (regex allows `.` so `..` slipped through)**

- **Found during:** Task 1 (Aggregator GREEN phase — path-traversal test).
- **Issue:** Plan threat-model claim "Server name regex `^[a-zA-Z0-9._-]+$` rejects `..` and slashes" is wrong about `..`. The regex permits `.`, so `bad..name` (or any string containing `..`) passes the regex. Without an explicit dotdot check, the route would happily accept `bad..name` as a "server name" and feed it to the SQL query unchanged.
- **Fix:** Added explicit `or ".." in name` check on top of the regex in BOTH MCP `server_tools` and Skills `patch_autonomy`. Defense in depth: regex defines the alphabet, dotdot check rejects literal traversal sequences. Updated test to use `bad..name` (a single segment with the dotdot pattern) instead of `..%2Fetc%2Fpasswd` (which the ASGI router decodes and routes elsewhere before the route ever sees it).
- **Files modified:** `backend/cmc/api/routes/mcp.py`, `backend/cmc/api/routes/skills.py`, `backend/tests/test_phase3_mcp.py`.
- **Verification:** Test `test_mcp_server_tools_priority_routing` asserts both `/api/mcp/bad..name/tools` → 400 and `/api/mcp/has@symbol/tools` → 400.
- **Committed in:** `3a2c3a0` (Task 1 GREEN) and `8aa09be` (Task 2 GREEN).

**3. [Rule 1 - Bug] Server-level call_count interpretation: priority-only would underreport "across ALL of a server's calls"**

- **Found during:** Task 1 (Aggregator GREEN phase — server list test).
- **Issue:** The plan's per-server SRV1/SRV2/SRV3 queries used the same priority-merging pattern as per-tool queries: highest-priority source that has data wins, exclusively. But this means a server with 1 tool_decision row (for tool A) and 3 tools rows (for tool B) shows `call_count=1` at the server level — the 3 calls of tool B vanish because source 2 was lower priority than source 1 and was therefore ignored. The must-have wording "server-level p50/p95/max are aggregated across ALL of a server's calls" requires summing across sources for call_count.
- **Fix:** Decoupled call_count from latency: `call_count` and `error_count` SUM across per-tool merged rows for each server (priority already deduplicates a single call across sources, so summing per-tool rows = true per-server total). `latency p50/p95/max` continue to come from the highest-priority server-level SRV query (true percentile per source — preserves the "NOT max-of-per-tool" requirement from checker WARNING 4).
- **Files modified:** `backend/cmc/mcp/aggregator.py`.
- **Verification:** Test `test_mcp_list_servers_returns_server_level_rows` confirms github=4 calls (3 list_repos + 1 merge_pr), context7=2 calls (2 attrs-only), sorted desc.
- **Committed in:** `3a2c3a0` (Task 1 GREEN).

**4. [Rule 1 - Bug] Test assertions used `detail` key but factory error handler rewrites HTTPException to `{"error": ...}`**

- **Found during:** Task 1 (Aggregator GREEN phase — single-flight 409 test).
- **Issue:** Pre-existing `cmc.core.errors.register_error_handlers` (Plan 01-06) rewrites every HTTPException response body to `{"error": exc.detail}`. The plan's test assertions used `resp.json()["detail"]` as if FastAPI's default error envelope was in effect.
- **Fix:** Updated assertions in test_phase3_mcp.py to use `resp.json()["error"]` (with comment explaining the factory handler).
- **Files modified:** `backend/tests/test_phase3_mcp.py`.
- **Verification:** test_mcp_sync_returns_409_when_already_running passes.
- **Committed in:** `3a2c3a0` (Task 1 GREEN).

---

**Total deviations:** 4 auto-fixed (all Rule 1 - Bug fixes)
**Impact on plan:** All deviations corrected plan-prescribed code that was technically incorrect (broken SQL syntax, regex gap, semantic mismatch with must-haves, error envelope mismatch). Behavior matches plan intent and must_haves; documented in code comments + this Summary so the plan-checker can apply lessons.

## Issues Encountered

- **Parallel Wave 1 coordination:** Routes/__init__.py was modified by sibling plans (03-02, 03-03, 03-04) WHILE this plan was running. Read-before-edit discipline preserved sibling registrations on every edit; final state has all 7 Wave 1 routers (health/sync/mcp/sessions/observability/system/skills) registered without duplication or loss.
- **Sibling plan test failures (out of scope):** During mid-execution test runs, several `test_phase3_observability.py` and `test_phase3_sessions.py` tests were observed failing (sibling plans 03-04 and 03-03). These were NOT caused by this plan and were resolved by the time the final full-suite run completed (130 passing). Per scope-boundary rule: not auto-fixed by this executor.

## Self-Check: PASSED

- File `backend/cmc/mcp/__init__.py`: FOUND
- File `backend/cmc/mcp/aggregator.py`: FOUND
- File `backend/cmc/skills/__init__.py`: FOUND
- File `backend/cmc/skills/scanner.py`: FOUND
- File `backend/cmc/api/routes/mcp.py`: FOUND
- File `backend/cmc/api/routes/skills.py`: FOUND
- File `backend/cmc/api/routes/__init__.py`: present (mcp_router + skills_router both registered alongside Wave 1 siblings)
- Commit cc1c7a4 (test RED MCP): FOUND
- Commit 3a2c3a0 (feat GREEN MCP): FOUND
- Commit 485a75e (test RED Skills): FOUND
- Commit 8aa09be (feat GREEN Skills): FOUND

## Next Phase Readiness

- Phase 3 Wave 1 plans 03-02 + 03-03 + 03-04 + 03-05 all landed → Phase 3 router surface is complete: 7 Phase-3 routers registered, all endpoints reachable via /api prefix.
- MCP catalog auto-rebuilds on demand via POST /api/mcp/sync; Phase 5 (UI) can wire the MCP tab to GET /api/mcp + GET /api/mcp/{server}/tools and a sync button.
- Skills catalog auto-syncs on demand via POST /api/skills/sync; Phase 5 Skills tab can wire GET /api/skills with environment + user_invocable filters; PATCH endpoint ready for Phase 8 dispatcher (DISP-04/11).
- Single-flight pattern + path-traversal regex+dotdot pattern + window-function percentile pattern all available as templates for any future sync/route/aggregation endpoints.

---
*Phase: 03-read-only-apis*
*Completed: 2026-04-26*
