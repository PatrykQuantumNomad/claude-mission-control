---
phase: 16-session-comparison
plan: 01
subsystem: backend-api
tags: [fastapi, sqlalchemy, pydantic-v2, decimal, pricing, sessions, otel-events, tdd]

# Dependency graph
requires:
  - phase: 13-cost-foundation
    provides: cmc.pricing.compute_cost + load_rates (Decimal cost engine, lookup-miss tolerant)
  - phase: 14-skills-analytics
    provides: otel_events.attrs_skill_name + bare 'skill_activated' event_name (post-prefix-strip ingest convention)
  - phase: 15-alerts
    provides: project-wide UTCDatetime PlainSerializer in cmc/api/schemas/common.py (when_used='json' gate forcing Z suffix on JSON output without breaking model_dump() for SQLAlchemy)
provides:
  - GET /api/sessions/compare?a={uuid}&b={uuid} endpoint mounted on existing sessions_router
  - SessionCompareSide / SkillSetDiff / SessionCompareResponse Pydantic v2 schemas in backend/cmc/api/schemas/sessions.py
  - _build_compare_side helper + _COMPARE_SKILLS_SQL / _COMPARE_OUTCOME_SQL / _COMPARE_TOOL_COUNTS_SQL templates (mounted at sessions.py module level)
  - 10 atomic pytest cases covering CMPR-01 happy path + CMPR-04 over-cap fallback + 400/404 error shapes + Decimal-string serialization + outcome classification + null-skill filter + unpriced-model zero-cost
affects: [16-02-frontend-lib, 16-03-frontend-page, 16-04-cleanup, phase-17-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compare-style read endpoint composition: load both sides via single load_rates() + per-side ORM lookup + per-side read-time SQL (skills/outcome/tool_counts) + Decimal cost — single AsyncSession, ≤9 SQL statements per request"
    - "Over-cap render-branch on a 200 response: CMPR-04 over_cap=true + tool_counts={} (NOT 413/422 — render branch, not error branch)"
    - "_coerce_effective_from(rates, model) helper cloned from cost.py:57 / skills.py:621 (router independence convention — NEVER cross-import between routers)"
    - "rates_as_of as max(effective_from across both models touched), promoted from date to UTC midnight datetime so UTCDatetime serializer emits ISO with Z suffix (Phase 15 e3e7838 carry-forward)"

key-files:
  created: []
  modified:
    - backend/cmc/api/schemas/sessions.py
    - backend/cmc/api/routes/sessions.py
    - backend/tests/test_sessions_router.py

key-decisions:
  - "Cost-module path: actual codebase truth is cmc.pricing (Phase 13 Plan 01); REQUIREMENTS.md / ROADMAP.md text still reads 'cmc/cost/engine.py' which does NOT exist. Plan 16-04 documentation pass should clean up the reference. Decision recorded in 16-RESEARCH §9 + Plan decisions §9. NO cmc/cost/engine.py shim created."
  - "Over-cap status code: HTTP 200 with over_cap=true + tool_counts={} (NOT 413/422). The 'summary metrics fallback' is a render branch the client switches on, not a refusal. Decisions §locked in research."
  - "Self-compare (a==b): rejected 400 server-side with detail 'cannot compare a session with itself' (decisions §7). Frontend will also disable the button (Plan 16-03)."
  - "Tool counts shape: full dict {tool_name: count} of every distinct tool name for the side (no top-N truncation). Bounded by ≤500 tool calls cap and ≤30 distinct names in practice."
  - "rates_as_of granularity: single top-level field = max(effective_from) across both models touched. Per-side adds noise."
  - "cost_usd JSON shape: Decimal-string (Pydantic v2 default for Decimal). Frontend MUST template-literal display, NEVER Number(...) — Phase 13/14 lock carries forward (Pitfall 1 in 16-RESEARCH)."

patterns-established:
  - "Two-side compose pattern with shared rates dict: single load_rates() call shared across _build_compare_side(sess_a) + _build_compare_side(sess_b) — avoids redundant pricing-table reads"
  - "Cap check uses denormalized sessions.tool_call_count column (Pitfall 11 in 16-RESEARCH) — never COUNT(tools.*); reading the column is O(1), counting tools is O(n)"
  - "Outcome classification SQL keeps the 'claude_code.' prefix (Pitfall 2) — outcome event_names are NOT skill events, the prefix-strip is skill-event-specific. Mirrors observability._OUTCOMES_SQL exactly."
  - "Skill-set query filters on bare 'skill_activated' (post-prefix-strip) AND attrs_skill_name IS NOT NULL (Pitfall 6 — legacy rows from before LOCK-2 may have null skill name)"
  - "rates_as_of date->datetime promotion: UTCDatetime serializer expects datetime, so date(2026,5,3) is promoted to datetime(2026,5,3,0,0,0,tzinfo=UTC) before passing to SessionCompareResponse"

# Metrics
duration: 9 min
completed: 2026-05-05
---

# Phase 16 Plan 01: Backend Session Compare Endpoint Summary

**GET /api/sessions/compare?a={uuid}&b={uuid} returns paired session metrics + skill-set diff + read-time-computed cost (Decimal-string) in a single round trip with 500-tool-call cap fallback (CMPR-04).**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-05T10:29:12Z
- **Completed:** 2026-05-05T10:38:55Z
- **Tasks:** 2 (Task 1 RED + Task 2 GREEN)
- **Files modified:** 3 (sessions.py route, sessions.py schema, test_sessions_router.py)

## Accomplishments

- Shipped the backend `GET /api/sessions/compare` endpoint mounted on the existing `sessions_router` (auto-registered via `cmc/api/routes/__init__.py:46` — no edit there needed). One single-round-trip request returns both sides + skill diff + cost + rates_as_of.
- Added three Pydantic v2 schemas (`SessionCompareSide`, `SkillSetDiff`, `SessionCompareResponse`) in `cmc/api/schemas/sessions.py`. Every datetime uses `UTCDatetime` (Phase 15 hotfix carry-forward); `cost_usd: Decimal` so JSON serializes as string (Phase 13/14 lock).
- Implemented CMPR-04 over-cap fallback as a 200-with-flag (not 413/422): when `sessions.tool_call_count > 500` on either side, that side returns `over_cap=true` + `tool_counts={}`, summary KPIs (cost, tokens, duration, outcome) still present; top-level `over_cap=true` and `cap=500`.
- Locked the error contract: 400 'invalid session_id format' on either malformed UUID, 400 'cannot compare a session with itself' on a==b, 404 'session not found' on either row missing.
- 10 new pytest cases — all green; full backend suite 540 → 550 (no regressions).

## Task Commits

1. **Task 1 (RED): Add Pydantic v2 schemas + 10 failing tests** — `102c7d6` (test) — schemas land + tests fail because endpoint not yet registered (SPA catch-all returns index.html, json() raises).
2. **Task 2 (GREEN): Implement compare_sessions endpoint** — `b506804` (feat) — endpoint, helper, three SQL templates, cost integration; all 10 RED tests now pass.

## Files Created/Modified

- `backend/cmc/api/schemas/sessions.py` — Added `SessionCompareSide`, `SkillSetDiff`, `SessionCompareResponse` Pydantic v2 models. `cost_usd: Decimal` (JSON-string serialization), `rates_as_of: UTCDatetime | None`, every datetime field uses `UTCDatetime` for Z-suffix serialization. +73 lines.
- `backend/cmc/api/routes/sessions.py` — Added `compare_sessions` async handler, `_build_compare_side` helper, three module-level `text()` SQL templates (`_COMPARE_SKILLS_SQL`, `_COMPARE_OUTCOME_SQL`, `_COMPARE_TOOL_COUNTS_SQL`), `_coerce_effective_from` helper, `SESSION_COMPARE_CAP=500` constant. Added `from cmc.pricing import compute_cost, load_rates` + `from datetime import date` to existing imports. Endpoint placed BEFORE `/sessions/{session_id}/details` so the literal `compare` segment matches before falling into the `{session_id}` parameter route (FastAPI evaluates routes in registration order). +226 lines, -1 (re-ordered import block).
- `backend/tests/test_sessions_router.py` — Added 10 atomic pytest cases under a clearly-marked `# Phase 16 Plan 01: GET /api/sessions/compare (CMPR-01..04)` section. Reuses existing fixtures (`client`, lifespan-seeded pricing) + helpers (`make_session_row`, `make_otel_event`, `make_tool_call`, `_seed`, `_new_uuid`). +321 lines.

## Decisions Made

All 9 decisions came pre-resolved in the plan's `<decisions>` block. The two backend-relevant ones surfaced in implementation:

- **Cost-module path drift (decisions §9)** — REQUIREMENTS.md / ROADMAP.md reference `cmc/cost/engine.py` which does NOT exist; the actual module is `cmc/pricing.py` (Phase 13 Plan 01). Used `from cmc.pricing import compute_cost, load_rates` directly — same line as `cost.py:41` and `skills.py:59`. NO shim file created. Phase 17 docs scope cleans up the REQUIREMENTS/ROADMAP text.
- **Over-cap as 200-with-flag (decisions § Over-cap status code)** — implemented `over_cap=true` + `tool_counts={}` on the over-cap side, both sides keep summary KPIs (cost, tokens, duration, outcome). Top-level `over_cap` is `side_a.over_cap or side_b.over_cap`. The roadmap text "show summary metrics fallback" is a render branch, not an error.

## Cost-Module Deviation Callout

**REQUIREMENTS.md / ROADMAP.md reference `cmc/cost/engine.py` — that path does NOT exist in the current tree.** The cost engine module is `backend/cmc/pricing.py` (Phase 13 Plan 01). Every Phase 13 router (`cost.py`) and Phase 14 router (`skills.py` SKIL-05) imports via `from cmc.pricing import compute_cost, load_rates`. This plan locks `cmc.pricing` and recommends Phase 17 docs scope clean up the REQUIREMENTS/ROADMAP citation. No shim file was created — the code path is the source of truth.

## Over-Cap (CMPR-04) Decision Note

The roadmap text "sessions exceeding the cap show a 'session too long for full diff' fallback with summary metrics only" describes a **render branch on a 200 response**, NOT a 413/422 refusal. Implementation:

- `over_cap = sess.tool_call_count > 500` (denormalized column — Pitfall 11)
- `tool_counts = {}` on the over-cap side (skip the JOIN — cheap path)
- Summary KPIs (cost, tokens, duration, outcome, message_count) still present from the `sessions` row alone
- Top-level `over_cap = side_a.over_cap or side_b.over_cap` so the client templates one fallback EmptyState across either-or-both
- HTTP 200 throughout; `cap` echoed at top level so the client renders deterministic copy ("Session too long for full diff (>500 tool calls)")

This locks the contract the frontend (Plan 16-02 / 16-03) will template.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ruff RUF002 ambiguous unicode minus character**
- **Found during:** Task 1 RED commit (pre-commit hook)
- **Issue:** Used unicode `−` (U+2212 MINUS SIGN) in the `SkillSetDiff` docstring (`only_a = a − b`); ruff's `RUF002` rejected it as visually ambiguous with `-` (HYPHEN-MINUS).
- **Fix:** Replaced unicode `−` with ASCII `-` in the docstring; reworded slightly: `shared = a ∩ b, only_a = a - b, only_b = b - a (sorted ASC).`
- **Files modified:** `backend/cmc/api/schemas/sessions.py`
- **Verification:** ruff check passed; commit landed.
- **Committed in:** `102c7d6` (Task 1 commit, after fix)

---

**Total deviations:** 1 auto-fixed (1 blocking lint).
**Impact on plan:** Cosmetic only — no behavior change, no scope creep. The unicode `∩` (intersection) character was kept because it's not flagged by RUF001/002/003 (genuinely distinct from any ASCII char) and adds clarity.

## Issues Encountered

None. Both tasks executed exactly as written. RED phase confirmed all 10 tests fail with the expected SPA-fallback signal (route not registered → catch-all returns index.html → json() raises `JSONDecodeError`). GREEN phase: all 10 tests passed on first run; no debugging cycle needed.

## Verification Receipts

- `cd backend && pytest tests/test_sessions_router.py -k compare` → **10 passed** (all 10 new tests green)
- `cd backend && pytest tests/test_sessions_router.py` → **30 passed** (20 existing SESS-* + 10 new compare; no regressions in adjacent file)
- `cd backend && pytest tests/` → **550 passed in 165.84s** (was 540 baseline → +10 = exactly the new compare tests; ZERO regressions across the rest of the suite)
- `cd backend && ruff check cmc/api/routes/sessions.py cmc/api/schemas/sessions.py tests/test_sessions_router.py` → All checks passed
- `cd backend && python -c "from cmc.api.schemas.sessions import SessionCompareResponse, SessionCompareSide, SkillSetDiff; print('ok')"` → ok
- pre-commit hooks (backend pyright + ruff) green on both `102c7d6` and `b506804`.

## Self-Check: PASSED

- Files exist:
  - `backend/cmc/api/schemas/sessions.py` ✓ (modified — schemas added)
  - `backend/cmc/api/routes/sessions.py` ✓ (modified — endpoint + helper added)
  - `backend/tests/test_sessions_router.py` ✓ (modified — 10 tests added)
- Commits exist:
  - `102c7d6` ✓ (`test(16-01): add failing tests for /api/sessions/compare endpoint`)
  - `b506804` ✓ (`feat(16-01): implement /api/sessions/compare paired-metrics endpoint`)

## TDD Gate Compliance

Plan type: `tdd`. Both gate commits present in correct order:

1. **RED gate** — `test(16-01): add failing tests for /api/sessions/compare endpoint` — `102c7d6` (10 tests fail because endpoint not yet registered)
2. **GREEN gate** — `feat(16-01): implement /api/sessions/compare paired-metrics endpoint` — `b506804` (all 10 tests pass)
3. **REFACTOR gate** — not needed; the GREEN implementation is already clean (proper helper extraction, named SQL templates, single rates dict shared across sides). No refactor commit landed.

## User Setup Required

None — no external service configuration required. The endpoint reads from the existing `sessions` / `otel_events` / `tools` / `pricing` tables; lifespan seed populates pricing automatically.

## Next Phase Readiness

- **Plan 16-02 (frontend lib plumbing) ready:** the contract is locked. Plan 16-02 mirrors Phase 14 Plan 02 / Phase 15 Plan 04 — add `SessionCompareResponse` interface to `frontend/src/lib/api.ts`, `api.sessionCompare(a, b)` fetcher, `qk.sessionCompare` + `useSessionCompare` hook in `frontend/src/lib/queries.ts`. Use kebab-prefix `'session-compare'` per Pitfall 5 (Phase 14 carry-forward).
- **Plan 16-03 (frontend page) ready:** route file `frontend/src/routes/sessions_.compare.tsx` (trailing-underscore parent-layout opt-out per decisions §1); render two-up KPI strip + recharts BarChart side-by-side + skill-diff three-column table + tool_counts diff DataTable (hidden when `over_cap=true`).
- **Plan 16-04 (docs cleanup) ready:** add the cost-module path note to REQUIREMENTS.md / ROADMAP.md (replace `cmc/cost/engine.py` references with `cmc/pricing.py`).
- **No blockers.** Phase 17 polish + Playwright unaffected.

---
*Phase: 16-session-comparison*
*Completed: 2026-05-05*
