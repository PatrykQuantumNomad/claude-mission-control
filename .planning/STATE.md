---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Depth & Polish
status: Phase 19 complete + operator-approved (4/4 plans + 2 hotfixes); Phase 18 BASELINE.md verifier rules preserved (pytest 598/0/32, datetime.utcnow=0; vitest 306/0; playwright 7/2/0).
stopped_at: Phase 19 closed and human-verified; ready for Phase 20 (cost-forecast-and-per-project-card).
last_updated: "2026-05-06T10:35:00Z"
last_activity: 2026-05-06 — Phase 19 closed after operator approval. Two in-browser hotfixes landed during human verification: dad754a (raise /api/skills/usage limit cap 50→200 + key qk.skillUsage by limit so the four production callers limit=1/10/20/200 don't share a cache entry) and da592ff (relax /skills/{name}/projects registry 404 → 200 + rows=[] for events-only skills, mirroring /cost/latency/runs regex-only validation). VERIFICATION.md status flipped to passed.
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 9
  completed_plans: 9
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05 after v1.1 ship)

**Core value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, what each skill costs and how often it fails, queue and approve tasks, compare two sessions side-by-side, get paged when metrics breach thresholds, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

**Current focus:** v1.2 Depth & Polish — roadmap written 2026-05-05. 6 phases (18–23) covering 13 requirements across 4 v1.1 lanes (skills polish, cost differentiators, alert differentiators, compare differentiators) plus polish/cleanup. Phase 22 is spike-gated for SKLP-11; descopes cleanly to v1.3 if `tools` temporal-JOIN derivation proves unreliable.

## Current Position

Phase: 19 — Skills Per-Project, Deltas & Badges (complete, 4/4 plans shipped)
Plan: Phase 19 closed; ready for Phase 20 (Cost Forecast & Per-Project Card, ANLY-06/07)
Status: Phase 19 complete end-to-end — backend (Plans 19-01..03) + frontend (Plan 19-04) wired; ROADMAP success criteria #1, #3, #4 satisfied user-side (#5 satisfied server-side in Plan 19-03); Phase 18 BASELINE.md verifier rules preserved across the phase
Last activity: 2026-05-06 — Plan 19-04 executed (commits 2333b46 DeltaPill primitive + 5092e51 SkillProjectsTable + 5092e51 mount + b729ecc TopSkills/SkillCostCard/SkillsRegistry wiring + Playwright e2e); vitest 293→306 (+13); playwright 7/2/0; pytest unchanged 598/0/32; SUMMARY at .planning/phases/19-skills-per-project-deltas-badges/19-04-SUMMARY.md

Progress: [██████████] 100% (Phase 19; v1.2 milestone 33% — 2/6 phases)

## Accumulated Context

### Decisions

Cumulative decision log lives in `.planning/PROJECT.md` Key Decisions table. v1.2 plan-execution decisions (Phase 18 Plan 01):

- **`cmc.core.time` is the canonical home for naive-UTC time concerns.** `now_utc()` returns `datetime.now(UTC).replace(tzinfo=None)`; `UTCDatetime` PlainSerializer is colocated. `cmc.api.schemas.common` re-exports `UTCDatetime` (one-line, `# noqa: F401`) so the 8 existing schema importers keep working without an 8-file cosmetic sweep (D-Pitfall-9). `cmc.core` re-exports `now_utc` for ergonomic access.
- **No speculative time helpers.** Only `now_utc` and `UTCDatetime` ship in Phase 18 (D-Module-shape). Future helpers (`today_utc`, `parse_iso_utc`) promote inline if/when Plan 02's sweep finds 3+ uses of a pattern.
- **Two-commit migration enforced.** Plan 01 creates the helper; Plan 02 owns the 22-site mechanical replace. Bisect-friendly; the sweep commit can be uniform mechanical.

Phase 18 Plan 02 (utcnow sweep, POLI-06):

- **D-Sweep atomic commit (c3d792f).** Tasks 1+2 merged into a single bisect-friendly mechanical-replacement commit. The 22-site replacement either fully reverts or fully applies — no half-migrated intermediate state on the bisect timeline. Per the locked two-commit migration: Plan 01 created the helper, Plan 02 adopts it across the codebase.
- **Docstring substring discipline.** When a verify gate uses `git grep`, prose mentioning the banned API must paraphrase. Three docstring blocks in `cmc/core/time.py` and one in `tests/test_core_time.py` were reworded ("the deprecated stdlib naive-UTC factory") to clear the POLI-06 structural verify gate while preserving explanatory intent.
- **Adjacent lint cleanup folds into the sweep when the same file is already touched.** Pre-existing I001 import-sort errors in `tests/test_core_time.py` (Plan 18-01 carry-over) blocked the pre-commit ruff hook on the sweep commit; auto-fixed via `ruff check --select I --fix` and folded into the same commit (vs. a separate "lint" commit on a single file already in the sweep's modification set).
- **Did not activate ruff DTZ** (Open-Question 3 deferred — would surface 38 unrelated DTZ findings out of POLI-06 scope).
- **Did not introduce a Field constants module / NOW_UTC sentinel.** Kept all 19 default_factory= references as direct function imports — matches D-Field-factories.

Phase 18 Plan 03 (SchedulesCard determinism, POLI-07):

- **`vi.spyOn(Date, 'now')` is the locked clock-pin mechanism for boundary-threshold tests** (NOT `vi.useFakeTimers`). Narrowest blast radius — targets exactly the one `Date.now()` call the production code reads, no interaction with React-Query or userEvent timer scheduling. Used describe-scoped in `SchedulesCard.test.tsx` with `NOW_MS = 2026-05-05T23:55:00Z`.
- **Test factories MUST default time-dependent fields to a sentinel ('never run' = `null`), never a hard-coded ISO string.** Hard-coded ISO defaults age with calendar time and silently flip "fresh" fixtures to "stale" — exactly the bit-rot that broke `SchedulesCard.test.tsx > stale row` 8 days after the original timestamp was written.
- **No cleanup-sweep migrations beyond SchedulesCard.** Audited 9 other component tests using `Date.now()`; all use it for relative timestamps without threshold/boundary assertions, so no flake risk. `RelativeTime.test.tsx` and `EmergencyStopBanner.test.tsx` left untouched per Pitfall 3 (load-bearing useFakeTimers usage).

Phase 18 Plan 04 (Playwright strict-mode + e2e README, POLI-08):

- **`data-testid` lives on the source React component, not test-only wrappers.** `data-testid="schedule-composer-name"` ships on `ScheduleComposer.tsx:193`. Specs reach it via `page.getByTestId('feature-component-element')`. Test wrappers were rejected to avoid render-layer maintenance burden.
- **`feature-component-element` kebab-case path-style is the locked testid convention** (e.g., `schedule-composer-name`, `alerts-firehose-skill-filter`, `skills-detail-projects-table`). Documented in `frontend/tests/e2e/README.md` (NOT `CONTRIBUTING.md`) per CONTEXT D-Documentation-location lock — rule lives next to the tooling that enforces it.
- **Decorate only when strict mode collides — pre-decoration is anti-pattern.** Full-suite strict-mode run found exactly one collision (`getByLabel('Name')` matched both ScheduleComposer wrap and SkillTimeline aria-label). Only that selector got a testid; `getByLabel('Advanced cron')`, `getByRole('button', {name: 'Create schedule'})`, `getByRole('button', {name: '+ New'})` all stayed as-is.
- **Steady-state alerts.spec.ts skip preserved (Pitfall 6).** README documents that "1 skipped" (alerts TEST-05a) is the baseline so verifiers don't regress on it.

Phase 18 Plan 05 (baseline-and-phase-close, phase-exit artifact):

- **BASELINE.md lives in the phase directory, not at `.planning/` root.** Per CONTEXT D-Verifier-baseline. A future "Phase 24 Polish v2" or similar would write its own baseline in *its* phase directory rather than mutating Phase 18's frozen baseline.
- **Verifier rules embedded as prose-with-bounds inside BASELINE.md** (e.g., `passed >= 566 → pass`, `warnings_datetime_utcnow > 0 → fail`, `total_warnings > 132 → warn`). Single source of truth: a downstream verifier reads one file and gets both the baseline counts AND the comparison thresholds.
- **Warning-delta is a load-bearing baseline metric.** Pytest total warnings (32) AND `datetime.utcnow`-specific warnings (0) are both recorded; the second is the load-bearing POLI-06 reverse-direction signal; the first gives a 100-warning headroom before flagging an investigation.
- **Dev-DB context capture for state-dependent skips.** Recorded `failed_tasks_total=1` and `failed_tasks_recent_5min=0` to explain the alerts.spec.ts steady-state skip. Lets future verifiers distinguish "baseline preserved" from "state drifted" (skipped >= 2 → human review).
- **Even ad-hoc inspection scripts respect the POLI-06 ban.** The dev-DB capture script uses `cmc.core.time.now_utc` (not `datetime.utcnow`) — structural enforcement is across the codebase, not just shipped code.

Phase 19 Plan 01 (migration 0003_project_key + project_key helper + ingest wiring, SKLP-08 foundation):

- **Migration 0003 INLINES the sha1[:12] backfill logic instead of importing `compute_project_key`.** Defensive against future helper refactors — Alembic migrations must remain runnable against historical revisions even if `cmc.core.project_key` is renamed/moved/restructured. Mirrors how 0002 inlined `json_extract` for session_id backfill instead of importing from `cmc.ingest.parser`. The unit test `test_matches_inline_sha1_logic` in `test_core_project_key.py` pins the formula equality so the helper and the migration cannot silently diverge.
- **Empty-string sentinel for `compute_project_key(None)` and `compute_project_key('')`.** Both return `''` (never raises). The `sessions.project_key` column is NOT NULL, so the empty string is the natural "no canonical project" marker — queries naturally exclude `WHERE project_key != ''`. Mirrors the COALESCE pattern in cost.py:168.
- **Python-loop backfill for filesystem-aware migrations.** SQLite has no `realpath` builtin, so the migration iterates rows in Python and calls `os.path.realpath` per row. Pure-SQL backfill (the 0002 idiom for session_id) was unavailable because the canonicalization crosses into the filesystem layer.
- **`_SESSION_MUTABLE_COLS` includes `project_key`.** Pitfall 9 — the migration is one-shot; ingest must keep the column fresh on every re-sync, including rows where the cwd value arrives or is corrected later. Without this, a session with cwd corrected after first sync would never get re-keyed.
- **Helper-first / wiring-second commit split (53fe578 + 95bd1df).** Two atomic commits on `main`: Task 1 lands compute_project_key + 11 unit tests in isolation; Task 2 lands the migration + sessions model + scheduler/repository wiring + 2 migration tests as one unit. Bisect-friendly: a regression in either layer is attributable to one commit.
- **Test count grew from 7 (plan) to 11 (delivered).** Each addition pins an invariant the original 7 didn't: re-export shape (`test_reexport_via_cmc_core`), formula equality vs inlined migration code (`test_matches_inline_sha1_logic`, drift guard), parametric falsy-input coverage. No deviation cost — pure-function tests run in 0.02s combined.

Phase 19 Plan 03 (SKLP-09/10 deltas + badges + DST spring-forward correctness):

- **DeltaPill is the canonical period-over-period primitive going forward.** `curr/prev/delta/delta_pct/direction` shape works for both integer counts (usage) AND Decimal cost (money). `delta_pct=None` invariant when `prev=0` — server's job to decide '—' vs '+inf%' (RESEARCH §Pattern 3, server is source of truth, frontend never re-derives). Reusable for cost forecasts (Phase 20 ANLY-08), alert frequency comparisons, compare-mode session diffs — anywhere a curr/prev/delta/direction shape is needed.
- **Python-side badge classification (over pure SQL CASE WHEN).** The plan offered both as acceptable; Python won on readability + unit-testability of the cold-start gate. The DST safety property still holds: SQL emits UTC-clean MIN/MAX(ts) (verified by grep guard) and Python does timedelta arithmetic (DST-immune by construction). Documented in `_derive_badges` docstring.
- **Cost-delta windows are LITERAL in SQL, not parameterized.** Four new dedicated SQL fragments (`_COST_DELTA_CURR_REQUEST_SQL` / `_PREV` / `_CURR_SESSION` / `_PREV_SESSION`) with hardcoded `datetime('now', '-7 days')` / `'-14 days'` bounds. Could have parameterized the existing `_COST_*_SCOPED_SQL` pair — risked Pitfall 2 (caller binds `?range=` to delta windows). Hardcoding the 7d horizon in SQL is the structural guard.
- **`_USAGE_DELTA_BADGE_SQL_PORTABLE` uses skills_seen UNION + LEFT JOIN trio.** SQLite < 3.39 lacks FULL OUTER JOIN; the portable form gives the same result and ships everywhere. The FULL OUTER form preserved as source-only documentation.
- **DST test combines Python helper assertion + structural grep guard.** Either alone is insufficient: helper-only misses an SQL regression that swaps to `'localtime'` and corrupts the inputs; grep-only misses a Python regression that drops timezone info. Together they form the load-bearing structural guard for ROADMAP success criterion #5. Adversarial-mutation verification (in-place sed in `'localtime'`, observe RED, restore, observe GREEN) proved the guard isn't vacuous.
- **The 30d window literal is NOT in route SQL.** Dormant threshold runs in Python against `MIN/MAX(ts)` hoisted out of SQL. The DST positive-presence assertion was scoped to `-7 days` / `-14 days` (which DO appear as delta CTE bounds); the `-30 days` arithmetic is pinned by the Python helper's UTC-anchored timedelta math.
- **`cost_delta` emitted on the empty-case branch.** Frontend never has to special-case "this response has no delta" — the field is always present (flat-zero pill). Mirrors Plan 19-02's path-leakage-by-construction discipline: structural property of the response shape rather than a runtime invariant the consumer must remember to check.
- **Atomic three-commit task split (ee662cb schema + ea0d1cb handlers + 68aeb5c tests).** Task 1's commit landed required new fields temporarily failing one existing test; Task 2's handlers populated them; Task 3 fixed the existing test + added 12 new ones. Bisect-friendly — a regression in any layer attributable to one commit. The intermediate test-failing state on Task 1's commit is acceptable per plan's explicit sequence (the plan never claims tests are green between commits, only that they're green at plan-close).

Phase 19 Plan 04 (SKLP-08/09/10 frontend wiring — DeltaPill + SkillProjectsTable + badges + e2e):

- **Section-wrapped PanelCard for stable e2e hooks.** PanelCard does NOT pass-through `data-testid`; the wrapping `<section data-testid='skills-detail-projects-table'>` survives all four PanelCard render branches (loading/empty/error/data). The inner table only mounts on the data branch. Reusable for any future panel needing branch-stable e2e identification.
- **DeltaPill is decoupled from the wire shape.** The primitive accepts `delta: number` + `deltaPct: number | null`, NOT the full DeltaPill DTO `{ curr, prev, delta, delta_pct, direction }`. Callers Number-coerce the Decimal-as-JSON-string at the call site and pass primitives. Rationale: the primitive can be reused for client-side-derived deltas (compare diffs, etc.) without conflating with the server-side schema. The internal `direction` derives locally from `delta` so the primitive stays decoupled from the wire shape.
- **delta_pct=null renders as `(—)` (parens preserved); aria-label includes the em-dash so screen readers announce the un-comparable percent honestly rather than going silent.**
- **Dual structural guard for ROADMAP success criterion #1 (path-leakage).** Three layers now: (1) backend SkillProjectRow schema enumerates 7 fields, no cwd/path/display_path; (2) backend `test_skill_projects_no_path_leakage` programmatic key+value scan; (3) frontend vitest `container.textContent` regex `/\b\/[A-Za-z][\w/.-]+/`; (4) Playwright e2e same regex on `getByTestId('skills-detail-projects-table').textContent`. Adversarial-mutation verification done unit-side (RED on injected `/Users/foo/bar/baz`, GREEN on restore) — locks the assertion's load-bearingness for both vitest and e2e layers.
- **SkillsRegistry data-source merge by skill_name.** The registry endpoint (/api/skills) has no badges field; the SKLP-10 badges live on /api/skills/usage. Joining at render time via a `Map<name, badges[]>` from `useSkillUsage(14d, 200)` gives consistent badge state across TopSkills + SkillsRegistry without backend coupling. limit=200 widens join coverage so registry rows below the default top-10 still get markers; rows below the activity threshold render no badge by design.
- **Cost rendered to 4 decimals on per-project rollups (`$0.0021`).** Per-project sums can be sub-cent; 2 decimals would round-to-zero and look like a free run. Sort uses parseFloat-coerced value but display passes through the formatted 4-decimal string.
- **Steady-state 2-skip baseline on Playwright** — alerts.spec.ts (existing, requires recently-failed task) + skills-detail.spec.ts (new, requires ≥1 skill in dev DB). Phase verifiers compare failed counts only, not skip counts; both skips documented in `frontend/tests/e2e/README.md`.
- **Existing-test-fixture extension pattern locked.** When adding a required field to a schema, existing test fixtures get a single `_flatPill` constant (or equivalent default) inlined. No fixture-builder helper layer; comments explain that the new field is exercised by dedicated tests, not the patched existing ones. Three files patched (TopSkills.test.tsx, SkillCostCard.test.tsx, SkillLatencyTable.test.tsx).
- **Atomic three-commit task split (2333b46 primitive+types+hook + 5092e51 panel+mount+test + b729ecc wiring+e2e).** Bisect-friendly: a regression in any layer is attributable to one commit. Commit 1 includes the test-fixture patches because tsc fails without them, blocking the next commit.

Phase 19 Plan 02 (SKLP-08 per-project endpoint, GET /api/skills/{name}/projects):

- **Path-leakage prohibition is enforced TWICE — schema + runtime test.** `SkillProjectRow` enumerates exactly 7 fields (`project_key`, `count`, `p50_ms`, `p95_ms`, `cost_usd`, `cost_attribution`, `low_sample`); no `cwd`/`path`/`display_path` exists, ever. The `test_skill_projects_no_path_leakage` test programmatically scans every row's keys AND values for filesystem-shape leakage (no `/`-prefixed string, no occurrence of the seeded secret cwd, no segment substring). LOAD-BEARING for ROADMAP success criterion #1. New project-keyed responses elsewhere in cmc.api SHOULD ship the same dual guard.
- **Per-project endpoint is session-scoped only — no Path R / request-scoped fallback.** Per-project rollups aggregate across many sessions, so the request-scoped JOIN (Path R in `skill_cost`) buys no meaningful precision at the project granularity but doubles SQL cost. `cost_attribution` literal is `"session" | "approximate"` (priced vs. unpriced model), distinct from `skill_cost`'s `"request" | "session"` pair.
- **Two-CTE split (`_PROJECTS_PERCENTILE_SQL` + `_PROJECTS_TOKEN_SQL`) instead of a single mega-query.** Mixing window-function percentiles (PARTITION BY project_key for p50/p95) with SUM aggregation (GROUP BY project_key for tokens) in one CTE would force awkward double-aggregation. The split keeps each query single-purpose and reuses `_LATENCY_SQL`'s proven window pattern verbatim. Python merges the two row-sets keyed by project_key. Reusable pattern for any future per-project skill rollup (e.g. Plan 22's SKLP-11 if the spike clears).
- **Originally added a registry-existence 404 (regex 400 layered on top); removed in hotfix da592ff.** The plan's must_have read "rejects unknown skills with 404 (mirrors /skills/{name}/cost behavior)" — but `/cost`, `/latency`, `/runs` all skip the registry check, doing regex-only validation and returning empty data for unregistered names. Operator hit a 404 on `/skills/analyze/projects` for an events-only skill (skill in `otel_events.skill_activated` but absent from the catalog — legacy/uningested data). Hotfix relaxed `/projects` to mirror its peers: regex-only, returns 200 + rows=[] for unregistered names. Path-leakage and project_key-only contracts remain enforced by the schema + runtime test.
- **Range Literal `"14d"|"30d"` only — `"7d"` reserved for Plan 19-03 delta CTE.** Pitfall 2 from STATE.md is honored at the schema level (`SkillRange` already narrows correctly). The dedicated `test_skill_projects_invalid_range_returns_422` exercises both `7d` and `2d` to lock the rejection contract.
- **Test count: 7 vs. plan's 5.** Two extras (`invalid_range_returns_422` + `path_traversal_rejected`) mirror the canonical guards every existing SKIL-* router endpoint ships with — omitting them would leave a structural hole that a future verifier might flag. Pure-edge-case tests; no deviation cost.

Phase 19 in-browser hotfixes (during human verification, 2026-05-06):

- **Hotfix dad754a — `/api/skills/usage` limit cap 50 → 200 + key `qk.skillUsage` by limit.** `SkillsRegistry.tsx` calls `useSkillUsage('14d', 200)` to widen the badge-join coverage; backend was capped at `Query(le=50)` → 422. Independently, `qk.skillUsage(range)` omitted `limit` from the queryKey so the four production callers (limit=1/10/20/200) shared a single cache entry — the 422 from the limit=200 caller corrupted the cache for the limit=1 `SkillCostCardForTopSkill` caller, surfacing as "Couldn't load skill cost data" on /skills even though the failing URL was the usage endpoint. Both fixes shipped together; pinned by an updated `test_skills_usage_limit_clamping` (201 fails, 200 succeeds) and a new `qk.skillUsage('14d', 1) !== qk.skillUsage('14d', 200)` test in queries.test.ts.
- **Hotfix da592ff — `/skills/{name}/projects` registry 404 → 200 + rows=[].** Plan 19-02 implementation diverged from its own must_have ("mirrors /skills/{name}/cost behavior"). Operator hit a spurious 404 on /skills/analyze for an events-only skill. Removed the registry lookup so /projects matches /cost, /latency, /runs (regex-only validation). Path-leakage guard preserved.
- **Cache-key discipline locked.** Whenever a TanStack-Query hook accepts a query parameter that affects the response shape, that parameter MUST be in the `queryKey`. Otherwise siblings with the same key fight over a single cache entry and a failure in one corrupts all. This is the second time we've shipped this bug class; future hooks should be code-reviewed against the rule explicitly.
- **Plan must_haves that say "mirrors X" must be verified against X's actual behavior, not its docstring.** Plan 19-02 cited "mirrors /cost" but added a stricter check than /cost actually has. Future plan-checker should grep the cited reference's source for the claimed behavior before locking the must_have.

v1.2 roadmap-time decisions:

- **Phase 22 is spike-gated for SKLP-11.** Phase opens with a mandatory feasibility spike (`tools` temporal JOIN against `skill_activated.duration_ms`); negative finding descopes SKLP-11 to v1.3 cleanly without blocking Phase 23. No fake decomposition ships under any circumstance (PITFALLS Pitfall 10).
- **Migration `0003_project_key` is owned by Phase 19.** Both SKLP-08 (Phase 19) and ANLY-07 (Phase 20) need `project_key` normalization (sha1[:12] of `realpath(cwd.rstrip('/'))`); migration ships in Phase 19 since it runs first (PITFALLS Pitfall 7 prevails over ARCHITECTURE's "zero migrations" claim).
- **ALRT-13 extends `evaluate_anomaly` via `params_json.window_kind`.** No third `kind` value, no parallel detector function, no second dispatch branch — single-detector invariant carried from v1.1 (PITFALLS Pitfall 1; SUMMARY Conflict 1 resolution).
- **ALRT-14 returns `None` on Haiku hallucination.** No fallback rule, no "best-guess" save path; UI surfaces honest "could not parse" message. Hard-validation against `_SCOPE_EXTRACTORS.keys()` via `is_known_metric()`.
- **Phase ordering follows ARCHITECTURE: 18 → 19 → (20 ‖ 21) → 22 → 23.** Phase 18 first for green CI baseline; Phase 19 before Phase 22 to establish CTE patterns SKLP-11 reuses; Phase 23 last to close the milestone.
- **Zero net-new dependencies.** Every v1.2 feature implementable with existing tools (stdlib `math`/`Decimal` for OLS + Welford, SQLAlchemy CTEs, existing `cmdk` + `anthropic` SDK 0.97, vitest + Playwright). STACK research confirmed.

v1.1 carried decisions (still active):

- Cost stored as tokens, $ computed at read time (window logic via `effective_from`/`effective_until`)
- ALRT-12 invariant: alert engine NEVER imports `cmc.dispatcher.tasks`
- Stable `dedup_key = f"alert:{rule_id}:{scope_key}"` reusing `notification_log` UNIQUE
- `UTCDatetime` PlainSerializer with `when_used='json'` gate
- CMPR-04 over-cap = render branch (HTTP 200 + `over_cap=true`), not error branch
- CMPR-05 tabular-only compare (no diff library, no raw message rendering)
- Wave-1/wave-2 single-writer convention for REQUIREMENTS.md

### Pending Todos

- ~~Phase 19 plan owns migration `0003_project_key`~~ — **landed in Phase 19 Plan 01 (commit 95bd1df, 2026-05-06)**. `sessions.project_key VARCHAR(12) NOT NULL DEFAULT ''` + `idx_sessions_project_key` + Python-loop backfill; ingest path keeps it fresh via scheduler.py and repository.py. Phase 20 ANLY-07 unblocked.
- ~~Phase 19 Plan 02 (SKLP-08 endpoint, per-project rollup)~~ — **landed in Phase 19 Plan 02 (commits b6d73a7 schemas + 056141b endpoint+7tests, 2026-05-06)**. `GET /api/skills/{name}/projects` returns the path-leakage-resistant per-project rollup; ROADMAP success criterion #1 satisfied on the backend side.
- ~~Phase 19 Plan 03 (SKLP-09/10 deltas + badges + DST spring-forward unit test)~~ — **landed in Phase 19 Plan 03 (commits ee662cb DeltaPill schema + ea0d1cb handlers/CTEs + 68aeb5c 12 tests, 2026-05-06)**. `usage_delta` + `badges` on `/api/skills/usage`; `cost_delta` on `/api/skills/{name}/cost`; ROADMAP success criteria #3, #4, #5 satisfied on the backend side. DST test load-bearing — adversarial-mutation verified.
- ~~Phase 19 Plan 04 (frontend wiring — DeltaPill + SkillProjectsTable + badges on TopSkills/SkillsRegistry + Playwright e2e)~~ — **landed in Phase 19 Plan 04 (commits 2333b46 DeltaPill primitive + api/queries hook + 5092e51 SkillProjectsTable + mount + b729ecc TopSkills/SkillCostCard/SkillsRegistry wiring + Playwright e2e, 2026-05-06)**. ROADMAP success criteria #1, #3, #4 satisfied user-visible. Phase 19 closed; Phase 20 unblocked.
- Phase 22 plan front-matter MUST cite SQL columns or temporal-JOIN derivation source for body_ms / subagent_ms / tool_ms before any UI work begins (Pitfall 10 acceptance criterion).
- Phase 23 closes the milestone — audit hooks (full pytest + vitest + playwright green; `cmc doctor` clean; REQUIREMENTS.md traceability 13/13 or honest 12/13 + descope) belong in the final phase plan.
- v1.2 verifiers (Phase 19+) MUST read `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` at phase-close time and apply the embedded per-suite verifier rules (pytest >= 566, vitest >= 293, playwright >= 7, `warnings_datetime_utcnow > 0` → fail).

### Blockers/Concerns

None blocking roadmap → planning. Risk register:

- **SKLP-11 feasibility unknown until Phase 22 spike.** Roadmap accommodates "spike-only, descope to v1.3" outcome; Phase 23 has no hard dependency on SKLP-11.
- **NL grammar edge cases (ALRT-14).** Unit ambiguity, implicit metrics, nested conditions, time-window vs duration confusion — all need explicit system-prompt handling. MEDIUM confidence until tested against real prompts in Phase 21.
- **KNOWN_METRICS sync drift.** Phase 21 plan must lock either `GET /api/alerts/metrics` dynamic endpoint or CI sync test before merging.

Two operational human-verify items still carry forward (non-blocking, auto-discharging):

- Apply Alembic migrations 0002 and 0003 to live `data/cmc.db` — auto-applies on next `cmc start` via `lifespan.py:98-100`. `0003_project_key` (Phase 19 Plan 01) will backfill existing sessions on first boot post-merge.
- Phase 14 visual checkpoint per Plan 14-05 (visual rendering on `/activity` TopSkills, `/skills` 3 panels, `/skills/$name` detail) — operator-driven dashboard navigation.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Skills (v1.3+) | SKLP-12 percentile-split overhead breakdown (only if SKLP-11 ships) | v1.3 candidate | 2026-05-05 |
| Skills (v1.3+) | SKLP-13 heatmap toggle on per-project breakdown | v1.3 candidate | 2026-05-05 |
| Cost (v1.3+) | ANLY-08 confidence band on monthly forecast | v1.3 candidate | 2026-05-05 |
| Cost (v1.3+) | ANLY-09 per-project cost budgets with alert integration | v1.3 candidate | 2026-05-05 |
| Alerts (v1.3+) | ALRT-15 predictive alerts (forecast × anomaly combination) | v1.3 candidate | 2026-05-05 |
| Alerts (v1.3+) | ALRT-16 NL queries beyond AlertRule schema (NL2SQL) | v1.3 candidate | 2026-05-05 |
| Compare (v1.3+) | CMPR-08 sessions-table right-click "compare with previous" | v1.3 candidate | 2026-05-05 |
| Compare (v1.3+) | CMPR-09 per-skill cost delta in compare | v1.3 candidate | 2026-05-05 |
| Platform | PLAT-01 (Linux/systemd) | v2 | 2026-04-28 (carried from v1.0) |
| Automation | AUTO-01..03 (NL schedules beyond cron, auto-retry, task dependencies) | v2 | 2026-04-28 (carried from v1.0) |

## Performance Metrics

**v1.0 baseline:** 47 plans, 4 days (2026-04-25 → 2026-04-28), ~39,800 LOC.
**v1.1:** 28 plans, 4 days (2026-05-02 → 2026-05-05), +81,397 / -13,435 lines vs v1.0, ~56,232 LOC at close.
**v1.2:** Phases 18–23 defined (6 phases, 13 requirements). **Phase 18 complete (5/5 plans, 2026-05-05)**: Plan 01 ~10 min (cmc.core.time helper + 5 unit tests), Plan 02 ~42 min (atomic 22-site sweep `datetime.utcnow` → `now_utc`, commit c3d792f), Plan 03 ~3 min (`vi.spyOn(Date, 'now')` pin in SchedulesCard.test.tsx), Plan 04 ~5 min (Playwright strict-mode disambiguation + e2e/README.md), Plan 05 ~9 min (BASELINE.md phase-exit artifact). Final phase-18 baseline: backend pytest 566 passed / 0 failed / 32 warnings / 0 datetime.utcnow lines; frontend vitest 293 passed / 66 files; Playwright 7 passed / 1 skipped (alerts steady-state) / 0 failed. Pytest deprecation-warning delta ~1429 → 0. Net-zero dependency change across the phase. POLI-06/POLI-07/POLI-08 all green; BASELINE.md (`.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md`) is the canonical reference for v1.2 phases 19+ verifiers. **Phase 19 complete (4/4 plans, 2026-05-06)**: Plan 01 ~8 min (commits 53fe578 helper + 95bd1df migration/wiring): `cmc.core.project_key.compute_project_key` helper (11 unit tests), Alembic migration `0003_project_key` (sessions.project_key VARCHAR(12) NOT NULL DEFAULT '' + indexed + Python-loop backfill via realpath), sessions model field, scheduler.py + repository.py wiring; pytest 579 passed / 0 failed / 32 warnings / 0 datetime.utcnow (+13 vs baseline), ruff clean. Plan 02 ~16 min (commits b6d73a7 schemas + 056141b endpoint+7tests): `SkillProjectRow` + `SkillProjectsResponse` DTOs (path-leakage-resistant by enumeration), `GET /api/skills/{name}/projects` endpoint with two-CTE rollup (`_PROJECTS_PERCENTILE_SQL` window-CTE adapted from `_LATENCY_SQL` + `_PROJECTS_TOKEN_SQL` per-project token sums), 7 tests including the LOAD-BEARING `test_skill_projects_no_path_leakage` programmatic key+value scan; pytest 586 passed / 0 failed / 32 warnings / 0 datetime.utcnow (+7 vs 19-01, +20 vs Phase 18 baseline), ruff clean. Plan 03 ~23 min (commits ee662cb DeltaPill schema + ea0d1cb handlers/CTEs + 68aeb5c 12 tests): `DeltaPill` Pydantic primitive (curr/prev/delta/delta_pct/direction; delta_pct=None when prev=0), `SkillUsageRow.usage_delta` + `.badges`, `SkillCostResponse.cost_delta`, module constants `_DELTA_WINDOW_DAYS=7` / `_BADGE_NEW_DAYS=7` / `_BADGE_DORMANT_DAYS=30` / `_BADGE_COLDSTART_DAYS=14`, `_build_delta_pill` + `_derive_badges` + `_compute_cost_delta` helpers, `_USAGE_DELTA_BADGE_SQL_PORTABLE` (skills_seen UNION + LEFT JOIN trio for SQLite <3.39 compatibility) + four cost-delta SQL fragments (curr/prev × request/session) with LITERAL `datetime('now', '-7 days')` / `'-14 days'` bounds (Pitfall 2 enforced at the SQL level — `?range=` cannot bind to delta windows), 12 tests covering delta math (4) + badge boundaries (3) + cold-start suppression (1) + DST spring-forward (1, LOAD-BEARING for ROADMAP success criterion #5; combines Python helper UTC-arithmetic assertion + structural grep guard asserting source contains NO `'localtime'` modifier on any 7d/14d/30d window; adversarial-mutation verified RED→GREEN) + cost_delta on growth+empty (2) + default-pill invariant (1); pytest 598 passed / 0 failed / 32 warnings / 0 datetime.utcnow (+12 vs 19-02, +32 vs Phase 18 baseline), ruff + pyright clean. Plan 04 ~19 min (commits 2333b46 DeltaPill primitive + api/queries hook + 5092e51 SkillProjectsTable + mount + b729ecc TopSkills/SkillCostCard/SkillsRegistry wiring + Playwright e2e): `frontend/src/components/ui/DeltaPill.tsx` pure presentation primitive (↑/↓/· + abs + pct, integer | currency formats; '—' for null deltaPct) with 7 vitest cases, `SkillProjectsTable.tsx` sortable per-project rollup panel with section-level data-testid (`skills-detail-projects-table`), `useSkillProjects` + `qk.skillProjects` + `api.skillProjects` + `fetchSkillProjects` (60s/45s cadence), `SkillProjectsResponse` + `SkillProjectRow` + `DeltaPill` TS types mirroring backend, TopSkills DeltaPill + new/dormant Badges (top-skills-delta-pill / top-skills-new-badge / top-skills-dormant-badge), SkillCostCard DeltaPill in Total cost KpiTile (skill-cost-card-delta-pill, format=currency), SkillsRegistry badges merged from useSkillUsage(14d, 200) by skill_name (skills-registry-new-badge / skills-registry-dormant-badge), `frontend/tests/e2e/skills-detail.spec.ts` load-bearing path-leakage assertion (regex on getByTestId textContent) with adversarial-mutation verification done unit-side; existing test fixtures patched with `_flatPill` constants to satisfy new required schema fields (TopSkills + SkillCostCard + SkillLatencyTable tests); vitest 293 → 306 (+13: 7 DeltaPill + 6 SkillProjectsTable); playwright 7 passed / 2 skipped (alerts steady-state + new skills-detail when no skills seeded) / 0 failed; backend pytest unchanged at 598 / 0 / 32; tsc clean. ROADMAP success criteria #1, #3, #4 satisfied user-side; #5 satisfied server-side in Plan 19-03.
**Cumulative:** 75 plans across 17 phases (11 v1.0 + 6 v1.1) over 8 calendar days of active development pre-v1.2.

## Session Continuity

Last session: 2026-05-06T15:55:00Z
Stopped at: Phase 19 Plan 04 (frontend-deltas-projects-badges, SKLP-08/09/10 frontend) complete; Phase 19 closed end-to-end; ready for Phase 20 (cost-forecast-and-per-project-card, ANLY-06/07).
Resume file: None

---

*v1.0 shipped 2026-04-28 — see `.planning/milestones/v1.0-ROADMAP.md` for full phase history.*
*v1.1 shipped 2026-05-05 — see `.planning/milestones/v1.1-ROADMAP.md` for full phase history.*
*v1.2 active — see `.planning/ROADMAP.md` Phase Details section for current milestone scope.*
