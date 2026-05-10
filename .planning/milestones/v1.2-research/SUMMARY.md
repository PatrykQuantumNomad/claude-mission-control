# Project Research Summary

**Project:** Claude Mission Control v1.2 — Depth & Polish
**Domain:** Local-only single-user observability dashboard for Claude Code sessions (depth pass on v1.1 Skills, Cost, Alerts, Compare lanes)
**Researched:** 2026-05-05
**Confidence:** HIGH

## Executive Summary

Claude Mission Control v1.2 is a tightly-scoped depth pass over four existing v1.1 product lanes. Every one of the ten carried backlog items (SKLP-08..11, ANLY-06..07, ALRT-13..14, CMPR-06..07) extends code that already ships; no new product lanes, no new top-level routes, no new dependencies. The guiding principle is "finish what v1.1 started" — after one usage cycle, the Skills page still lacks per-project breakdown and activity badges, the Cost dashboard has no forecast, the Alerts engine exposes only one anomaly algorithm, and Compare requires the user to remember two session IDs. v1.2 closes all four gaps. The implementation model is pure SQL-CTE extension, read-time analytics, and Haiku-backed NL input following the established `nlcron.py` / `skill_router.py` pattern — Linear/Raycast-level density without adding framework weight.

The recommended build order from ARCHITECTURE is: **Phase 18 (Polish cleanup) → Phase 19 (SKLP-08/09/10) → Phase 20 (ANLY-06/07) + Phase 21 (ALRT-13/14) in parallel → Phase 22 (SKLP-11, with spike) → Phase 23 (CMPR-06/07)**. This is grounded in dependency analysis: the datetime/test cleanup (Phase 18) gives a green CI baseline for everything else; SKLP-11's temporal-containment derivation is riskier than the other skills work so it sits behind Phase 19's established CTE patterns; the cost and alerts phases are independent of each other and can run concurrently. FEATURES.md proposes a different ordering (ANLY-07 before skills), but ARCHITECTURE's ordering prevails because it is grounded in actual code dependencies and risk sequencing.

The primary risks are: (1) SKLP-11's latency overhead decomposition requires a feasibility spike — the necessary `body_ms`/`subagent_ms` decomposition data does not exist as a first-class field and must be derived via temporal JOIN; (2) ALRT-13 must extend the existing `evaluate_anomaly` function rather than add a parallel detector, using Welford variance to avoid numerical drift at scale; (3) ANLY-07/SKLP-08 must normalize `cwd` to a `project_key` via a small migration — this conflicts with ARCHITECTURE's "zero migrations" claim, and PITFALLS prevails on this data-integrity issue.

---

## Conflict Resolution (Cross-Document Issues)

Four conflicts surfaced during synthesis. Resolutions are locked here so the roadmapper does not have to adjudicate them.

### Conflict 1: ALRT-13 framing — "new detector" vs "extend existing"

ARCHITECTURE says: stay inside `kind=anomaly`, discriminate new detectors by `params_json.detector`.
PITFALLS says: extend `evaluate_anomaly` via `params_json.window_kind`, never a sibling function.

**Resolution: consistent, not contradictory.** Unified guidance: keep `kind` as `threshold | anomaly` (no third value); ALRT-13 adds `params_json.window_kind: "ewma" | "sliding"` inside the single `evaluate_anomaly` function; no new function, no new `kind`, no new dispatch branch.

### Conflict 2: "Zero migrations needed" vs `project_key` migration

ARCHITECTURE says: migrations needed = 0.
PITFALLS Pitfall 7 says: ANLY-07 and SKLP-08 must add `sessions.project_key` via migration to prevent cwd cardinality blowup and path leakage.

**Resolution: PITFALLS prevails.** Migration `0003_project_key` is required: add `sessions.project_key VARCHAR(12) NOT NULL DEFAULT ''`, backfill as `sha1(realpath(cwd.rstrip('/')))[:12]`, add index. Belongs in Phase 19 (first phase that needs it).

### Conflict 3: Phase ordering — FEATURES vs ARCHITECTURE

FEATURES implies ANLY-07 (shovel-ready) should come early. ARCHITECTURE puts it in Phase 20 after Phase 19 skills.

**Resolution: follow ARCHITECTURE's ordering.** ARCHITECTURE's reasoning is code-dependency-grounded; ANLY-07's "shovel-ready" status is a complexity observation, not a dependency argument. Order: 18→19→(20‖21)→22→23.

### Conflict 4: `project_key` migration ownership

Both SKLP-08 (Phase 19) and ANLY-07 (Phase 20) need the `project_key` normalization. Migration belongs in **Phase 19** (runs first).

---

## Key Findings

### Recommended Stack

v1.2 ships against the frozen v1.1 lockfile with **zero net-new dependencies**. Every feature is implementable with existing tools: stdlib `math` + `Decimal` for forecast OLS and Welford variance; SQLAlchemy 2.0 CTEs for per-project breakdowns; `cmdk` + TanStack Router for Cmd+K shortcuts; existing `anthropic` SDK 0.97 for ALRT-14 NL parsing. Explicitly rejected: numpy/scipy/pandas (wheel bloat for trivially-small datasets), instructor/pydantic-ai (one-shot JSON-mode parse doesn't need an agent framework), date-fns/dayjs (already absent; SQLite `datetime('now', '-N days')` covers badge arithmetic).

**Core technologies (all carried from v1.1):**
- Python 3.13 + FastAPI 0.136.1 + Pydantic 2.13.3 — hold at current pinned versions
- SQLAlchemy 2.0.49 + SQLModel 0.0.38 + aiosqlite 0.22.1 — async SQLite WAL; CTEs cover all v1.2 analytics
- React 19.2.5 + Vite 8.0.10 + TanStack Router 1.168.24 / Query 5.100.5 — all extension points proven
- `cmdk` 1.1.1 + recharts 3.8.1 — no new chart types needed
- `anthropic` SDK 0.97.0 — `claude-haiku-4-5` confirmed supported
- vitest 4.1.5 + Playwright 1.59.1 — `vi.useFakeTimers` + `getByTestId` patterns cover all flake fixes

### Expected Features

All ten carried items are P1 (table stakes). The FEATURES research also identified a prioritized differentiator list; top-priority differentiators (partial-month bias banner, dormancy reactivation toast, grammar templates, CMPR-07 right-click) are LOW complexity and can be bundled as stretch goals in their respective phases.

**Must have (all P1 table stakes):**
- SKLP-08 per-project skill breakdown — sortable table on `/skills/$name`; new `/api/skills/{name}/projects` endpoint
- SKLP-09 period-over-period delta pills — 7d-vs-prev-7d on TopSkills, SkillCostCard, per-skill detail
- SKLP-10 "new this week" / "dormant" badges — backend-computed from otel_events; `skills.first_seen_at` migration
- SKLP-11 latency overhead breakdown — stacked bar (body/subagent/tool); requires feasibility spike
- ANLY-06 monthly cost forecast — 14d rolling baseline OLS; `insufficient_data` guard for <7 days
- ANLY-07 per-project cost card — `ProjectCostCard.tsx`; endpoint already ships
- ALRT-13 rolling-mean anomaly — extend `evaluate_anomaly` with `window_kind`; Welford variance; warmup guard
- ALRT-14 NL alert authoring — `POST /api/alerts/parse-nl`; vocabulary-in-prompt; preview modal before save
- CMPR-06 per-skill latency delta — extend `_build_compare_side`; `low_sample_a/b` flags suppress delta
- CMPR-07 Cmd+K compare-with-previous — `/api/sessions/{id}/previous`; same-cwd; ended_at IS NOT NULL

**Should have (differentiators — add if time permits):**
1. ANLY-06 partial-month bias banner (LOW — suppress forecast day 1–3)
2. CMPR-07 sessions-table right-click (LOW — second entry point)
3. SKLP-10 dormancy reactivation toast (LOW — charming detail)
4. ALRT-14 grammar templates in Cmd+K (LOW — cold-start UX)
5. ANLY-06 confidence band on forecast chart (MEDIUM)
6. SKLP-08 heatmap toggle (MEDIUM)

**Defer to v1.3+:**
- Predictive alerts (ANLY-06 forecast × ALRT-13 anomaly combination — false-positive design problem)
- NL queries beyond AlertRule schema (NL2SQL is its own milestone)
- SKLP-11 percentile-split breakdown (LARGE; only if table stakes SKLP-11 lands)
- Three-up or N-up compare (two-up is intentional)

### Architecture Approach

v1.2 is a pure read-path extension. Net new backend modules: 2 (`cmc/cost/forecast.py`, `cmc/alerts/nl_parser.py`). Net new endpoints: 5. Net new frontend panels: 4. Net new routes: 0. One migration: `0003_project_key`.

**Major components for v1.2:**
1. `cmc/cost/forecast.py` (new) — stdlib OLS on `token_usage` daily rollup; 14d rolling baseline; Decimal-only math
2. `cmc/alerts/nl_parser.py` (new) — mirrors `nlcron.py`; lazy AsyncAnthropic; `_SCOPE_EXTRACTORS` vocabulary in prompt; `is_known_metric()` hard-validation; None on hallucination
3. `cmc/alerts/detector.py` (extend) — `window_kind: "ewma" | "sliding"` inside `evaluate_anomaly`; Welford recurrence; warmup-boundary PENDING_FIRE guard
4. `cmc/api/routes/skills.py` (extend) — `/projects` + `/overhead` siblings; prev-period CTEs; `first_activated_at` / `last_activated_at`
5. `cmc/api/routes/sessions.py` (extend) — `skill_latencies` dict in `_build_compare_side`; `/previous` endpoint
6. Migration `0003_project_key` — `sessions.project_key VARCHAR(12)`, backfill, index

### Critical Pitfalls

Top priority for roadmap phase planning (full 20-pitfall list in PITFALLS.md):

1. **SKLP-11 data doesn't exist (Pitfall 10)** — `skill_activated.duration_ms` is a single end-to-end measurement; no decomposition exists. Phase 22 MUST open with a feasibility spike. If the `tools` temporal JOIN is unreliable, descope to v1.3.

2. **ALRT-13 parallel detector (Pitfall 1)** — never add a new function or new `kind`. One function, `params_json.window_kind` discriminator. Phase plan must answer "extending or adding?" in front-matter.

3. **ALRT-13 Welford variance (Pitfall 2)** — naive `E[X²] − E[X]²` loses precision after ~3 weeks of ticks. Reuse the shipped Welford recurrence at `detector.py:226-229` verbatim.

4. **`project_key` migration required (Pitfall 7)** — raw `cwd` grouping causes cardinality blowup and path leakage. Migration `0003_project_key` is non-negotiable; belongs in Phase 19.

5. **ALRT-14 Haiku vocabulary drift (Pitfall 4)** — inject `_SCOPE_EXTRACTORS.keys()` verbatim into system prompt; hard-validate via `is_known_metric()`; never ship a fallback rule on hallucination.

6. **`datetime.utcnow` → naive UTC (Pitfall 13)** — replacement must use `datetime.now(UTC).replace(tzinfo=None)` centralized in `cmc/core/time.py`. Aware datetime breaks SQLite comparisons throughout.

7. **ANLY-06 partial-month bias (Pitfall 6)** — use 14d rolling baseline; suppress forecast when `days_elapsed < 7`.

---

## Implications for Roadmap

### Phase 18: Polish & Carry-Forward Cleanup
**Rationale:** Green CI baseline before feature work. Datetime deprecation (18+ sites), SchedulesCard test flake (`vi.spyOn(Date, 'now')` not `vi.useFakeTimers`), Playwright `data-testid` convention, REQUIREMENTS.md writer role assigned. Single-day phase; no dependencies.
**Delivers:** `cmc/core/time.py` naive-UTC helper; all `datetime.utcnow` sites cleaned; test flakes fixed; `data-testid` convention documented.
**Avoids:** Pitfalls 13, 14, 15, 20

### Phase 19: Skills Per-Project, Deltas & Badges (SKLP-08, SKLP-09, SKLP-10)
**Rationale:** Shared SQL CTE pattern in `skills.py`; shared badge infrastructure. Delivers `0003_project_key` migration (needed by Phase 20 ANLY-07 as well). SKLP-08 → SKLP-09 → SKLP-10 dependency order.
**Delivers:** `/api/skills/{name}/projects`; prev-period CTEs; `first_activated_at`/`last_activated_at`; `SkillProjectsTable`, delta pills, new/dormant badges; migration `0003_project_key`.
**Avoids:** Pitfalls 7 (project_key migration), 8 (DST day-boundary windowing), 9 (cold-start badge suppression)

### Phase 20: Cost Forecast & Per-Project Card (ANLY-06, ANLY-07)
**Rationale:** Fully independent of skills/alerts work (different routers, different tables). ANLY-07 is UI-only (endpoint exists from Phase 13). Can run in parallel with Phase 21.
**Delivers:** `cmc/cost/forecast.py`; `GET /api/cost/forecast`; `CostForecastCard.tsx`; `ProjectCostCard.tsx`.
**Avoids:** Pitfall 6 (14d rolling baseline; `insufficient_data` when <7 days)

### Phase 21: Alert Anomaly Depth & NL Authoring (ALRT-13, ALRT-14)
**Rationale:** ALRT-13 before ALRT-14 — NL parser needs the extended `AlertRuleCreate` vocabulary. Independent of skills/cost work; can run in parallel with Phase 20.
**Delivers:** `evaluate_anomaly` extended with `window_kind`; `cmc/alerts/nl_parser.py`; `POST /api/alerts/parse-nl`; AlertRuleForm NL input with preview modal; KNOWN_METRICS dynamic endpoint or CI sync test.
**Avoids:** Pitfalls 1, 2, 3, 4, 5, 16, 18, 19

### Phase 22: Skill Latency Overhead (SKLP-11) — spike-gated
**Rationale:** Riskiest feature. Opens with mandatory feasibility spike: does `tools` temporal JOIN reliably decompose `skill_activated.duration_ms`? If not, descope to v1.3. Sequenced after Phase 19 for CTE pattern reuse.
**Delivers:** (spike-contingent) `GET /api/skills/{name}/overhead`; `SkillOverheadCard.tsx` stacked bar; `low_sample` badge.
**Avoids:** Pitfall 10 (no fake decomposition via ratio guesswork)

### Phase 23: Compare Depth (CMPR-06, CMPR-07)
**Rationale:** Independent of skills/cost/alerts; benefits from SKLP-11 being resolved before CMPR-06 is written (optional reuse). Closes the v1.2 milestone.
**Delivers:** `skill_latencies` dict in `SessionCompareSide`; `low_sample_a/b` flags; latency-delta block in `SessionCompareView.tsx`; `GET /api/sessions/{sid}/previous`; Cmd+K "Compare with previous" shortcut.
**Avoids:** Pitfalls 11, 12, 17

### Phase Ordering Rationale

- Phase 18 first: flaky tests create false-signal noise on every verifier run.
- Phase 19 before Phase 22: SKLP-11 derivation SQL is harder; Phase 19 establishes CTE + panel patterns SKLP-11 reuses.
- Phases 20 and 21 are independent; run concurrently or in either order based on sprint capacity.
- Phase 23 last: optionally consumes Phase 22's overhead work; clean milestone close.

### Research Flags

**Needs `/gsd-research-phase` during planning:**
- **Phase 22 (SKLP-11):** Feasibility spike IS the research. SPIKE-01 plan must precede any implementation plan. Acceptance criterion: phase plan front-matter cites the SQL column or derivation source for each of `body_ms` / `subagent_ms` / `tool_ms`.
- **Phase 21 (ALRT-13/14):** Research the `_SCOPE_EXTRACTORS` vocabulary expansion before writing the NL parser system prompt. Grammar edge cases (unit ambiguity, implicit metrics, nested conditions) need explicit handling.

**Standard patterns (skip research-phase):**
- **Phase 18:** Pure tech-debt repayment; all patterns documented.
- **Phase 19:** SQL CTEs, shadcn badges, delta pills — established patterns.
- **Phase 20:** ANLY-07 is UI-only; ANLY-06 OLS math is stdlib and documented in STACK research.
- **Phase 23:** Both items have locked definitions from PITFALLS research.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All deps verified against npm registry + PyPI + Context7 on 2026-05-05. Zero net-new deps confirmed. |
| Features | HIGH | All 10 items have analogs in Datadog/Langfuse/Grafana. NL grammar edge cases are the one MEDIUM area. |
| Architecture | HIGH | All integration points verified by reading v1.1 source. SKLP-11 temporal-containment derivation is MEDIUM — sound in theory, unvalidated against real data. |
| Pitfalls | HIGH | All 20 pitfalls cite specific file:line in v1.1 codebase. Not speculative. |

**Overall confidence:** HIGH

### Gaps to Address

- **SKLP-11 feasibility:** Phase 22 spike resolves this. Roadmap must accommodate "spike-only, SKLP-11 → v1.3" outcome without blocking Phase 23.
- **ALRT-13 sliding-window state:** STACK rejects `deque` (restart re-seed problem); EWMA state dict extension is preferred. Phase 21 plan must lock this in front-matter.
- **KNOWN_METRICS dynamic endpoint timing:** Pitfall 16 recommends shipping `GET /api/alerts/metrics` in Phase 21 (first phase with new metrics). If deferred, CI sync test must be in place as fallback.
- **NL grammar edge cases:** Unit ambiguity, implicit metrics, nested conditions, time-window vs duration confusion — all need explicit system prompt handling. MEDIUM confidence until tested against real prompts.

---

## Sources

### Primary (HIGH confidence)
- Context7 `/dip/cmdk` — `useCommandState` + conditional rendering for CMPR-07
- Context7 `/anthropics/anthropic-sdk-python` — JSON-mode + `claude-haiku-4-5` for ALRT-14
- Context7 `/vitest-dev/vitest` — fake-timer semantics (`advanceTimersByTimeAsync` vs sync)
- Context7 `/microsoft/playwright` — strict-mode + `getByTestId` recommendation
- Context7 `/pydantic/pydantic` — `datetime.now(UTC)` migration guidance
- npm registry + PyPI JSON API — all package versions verified 2026-05-05
- Datadog Anomaly + Forecast Monitor docs — algorithm choices, window guidelines, confidence bounds
- AWS Cost Explorer docs — run-rate forecast methodology
- Grafana 12.2 release notes + Grafana Assistant blog — NL alert creation precedent

### Secondary (MEDIUM confidence)
- OpenObserve anomaly detection guide — rolling window size recommendations
- FinOps School run-rate forecasting — weekday-weighted baseline methodology
- Linear changelog — "New" badge UX patterns

### In-Repository (HIGH confidence — all verified by file read)
- `backend/cmc/alerts/detector.py` — Welford recurrence present; stdlib-only lock confirmed
- `backend/cmc/alerts/scopes.py` — `_SCOPE_EXTRACTORS` + `is_known_metric()` confirmed
- `backend/cmc/api/routes/cost.py` — `_BREAKDOWN_BY_PROJECT_SQL` + `dim=project` confirmed
- `backend/cmc/api/routes/skills.py` — `_USAGE_TOP_SQL`, `MIN_LATENCY_SAMPLES=30` confirmed
- `backend/cmc/api/routes/sessions.py` — `_build_compare_side` composition confirmed
- `backend/cmc/schedules/nlcron.py` + `skill_router.py` — Haiku pattern confirmed
- `frontend/src/components/ui/CommandPalette.tsx` — context-aware compare branch confirmed
- `frontend/src/components/panels/AlertRuleForm.tsx` — `KNOWN_METRICS` + sync-risk comment confirmed
- `.planning/STATE.md` + `.planning/MILESTONES.md` — v1.2 scope + carried-debt list

---
*Research completed: 2026-05-05*
*Ready for roadmap: yes*
