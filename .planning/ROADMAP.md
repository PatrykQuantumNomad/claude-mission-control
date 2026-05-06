# Roadmap: Claude Mission Control

## Milestones

- ✅ **v1.0 MVP** — Phases 1–11, 47 plans (shipped 2026-04-28) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Skills & Cost Intelligence** — Phases 12–17, 28 plans (shipped 2026-05-05) — see [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Depth & Polish** — Phases 18–23 (active, started 2026-05-05) — 13 requirements across 4 v1.1 lanes (skills polish, cost differentiators, alert differentiators, compare differentiators) plus a dedicated polish/cleanup phase

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–11) — SHIPPED 2026-04-28</summary>

- [x] Phase 1: Foundation & Database (7/7 plans) — completed 2026-04-25
- [x] Phase 2: Data Ingestion (6/6 plans) — completed 2026-04-26
- [x] Phase 3: Read-Only APIs (5/5 plans) — completed 2026-04-26
- [x] Phase 4: Stateful APIs (5/5 plans) — completed 2026-04-26
- [x] Phase 5: Frontend Shell & Design System (4/4 plans) — completed 2026-04-27
- [x] Phase 6: Observability & Activity Panels (5/5 plans) — completed 2026-04-27
- [x] Phase 7: Command Centre Panels (4/4 plans) — completed 2026-04-27
- [x] Phase 8: Mission Control Dispatcher (4/4 plans) — completed 2026-04-27
- [x] Phase 9: Telegram, Setup & Testing (5/5 plans) — completed 2026-04-28
- [x] Phase 10: Telegram Wiring Fixes (gap closure, 1/1 plan) — completed 2026-04-28
- [x] Phase 11: v1.0 Documentation & Env Polish (gap closure, 1/1 plan) — completed 2026-04-28

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 Skills & Cost Intelligence (Phases 12–17) — SHIPPED 2026-05-05</summary>

- [x] Phase 12: OTEL Skill Event Spike (2/2 plans) — completed 2026-05-02
- [x] Phase 13: Cost Foundation & Skill Ingest (6/6 plans) — completed 2026-05-03
- [x] Phase 14: Skills API & Page Panels (5/5 plans) — completed 2026-05-04
- [x] Phase 15: Alert Engine & UI (5/5 plans) — completed 2026-05-04
- [x] Phase 16: Session Comparison (4/4 plans) — completed 2026-05-05
- [x] Phase 17: Polish, Doctor & Tests (6/6 plans) — completed 2026-05-05

Full details: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

### 🚧 v1.2 Depth & Polish (Phases 18–23) — ACTIVE

- [x] **Phase 18: Polish & Carry-Forward Cleanup** — Discharge v1.1 carried debt; green CI baseline before feature work (POLI-06, POLI-07, POLI-08) (completed 2026-05-05)
- [ ] **Phase 19: Skills Per-Project, Deltas & Badges** — Per-project breakdown, period-over-period deltas, new/dormant badges; ships migration `0003_project_key` (SKLP-08, SKLP-09, SKLP-10)
- [ ] **Phase 20: Cost Forecast & Per-Project Card** — Monthly forecast (linear OLS) and per-project cost breakdown card; consumes `project_key` from Phase 19 (ANLY-06, ANLY-07)
- [ ] **Phase 21: Alert Anomaly Depth & NL Authoring** — Sliding-window anomaly detection extension and Haiku-backed NL alert authoring (ALRT-13, ALRT-14)
- [ ] **Phase 22: Skill Latency Overhead (spike-gated)** — Feasibility-gated body/subagent/tool latency decomposition; phase opens with mandatory spike, descopes cleanly to v1.3 if data is unreliable (SKLP-11)
- [ ] **Phase 23: Compare Depth & Milestone Close** — Per-skill latency delta and Cmd+K compare-with-previous shortcut; closes the milestone (CMPR-06, CMPR-07)

## Phase Details

### Phase 18: Polish & Carry-Forward Cleanup
**Goal**: Discharge accumulated v1.1 carried debt so every subsequent v1.2 phase runs against a green CI baseline with no false-signal noise from time-of-day flakes, deprecated stdlib calls, or Playwright strict-mode collisions.
**Depends on**: Nothing (first phase of v1.2; v1.1 shipped at `af6d308`)
**Requirements**: POLI-06, POLI-07, POLI-08
**Success Criteria** (what must be TRUE):
  1. `Field(default_factory=datetime.utcnow)` is gone from the codebase; all 18+ sites call a centralized `cmc/core/time.py` helper returning `datetime.now(UTC).replace(tzinfo=None)`, and `ruff check --select UP` passes clean.
  2. `SchedulesCard.test.tsx > stale row` runs deterministically across all clock conditions (verified by running the suite with `TZ=UTC` and `TZ=America/New_York` at simulated 23:55 boundary), using `vi.spyOn(Date, 'now')` rather than `vi.useFakeTimers`.
  3. `schedule-composer.spec.ts` and `alerts.spec.ts` (firehose `Filter skill name`) both pass Playwright strict-mode without selector ambiguity, with a `data-testid` convention documented in CONTRIBUTING.md or the e2e README.
  4. Backend (`pytest`) and frontend (`vitest run` + `playwright test`) suites are green at phase close; verifier records baseline pass counts for downstream phases to compare against.
**Plans**: 5 plans
  - [x] 18-01-time-helper-and-test-PLAN.md — Create `cmc/core/time.py` with `now_utc()` + colocated `UTCDatetime`; add unit tests; re-export to preserve 9 import sites (helper-first commit per D-Sweep-style) — completed 2026-05-05
  - [x] 18-02-utcnow-sweep-PLAN.md — Mechanical sweep of all 22 `datetime.utcnow` call sites (20 Field defaults + 2 inline calls); dual verify gate (ruff UP + git grep zero) + drop ~1429 deprecation warnings to 0
  - [x] 18-03-schedules-card-determinism-PLAN.md — Migrate `SchedulesCard.test.tsx > stale row` to `vi.spyOn(Date, 'now')` + fix bit-rotted fixture; verify under TZ=UTC and TZ=America/New_York at 23:55 boundary — completed 2026-05-05
  - [x] 18-04-playwright-strict-mode-and-readme-PLAN.md — Add `data-testid` to source components for the strict-mode collision in schedule-composer; create `frontend/tests/e2e/README.md` documenting the `feature-component-element` convention
  - [x] 18-05-baseline-and-phase-close-PLAN.md — Record `BASELINE.md` (pytest/vitest/playwright counts + deprecation-warning delta) for Phase 19+ verifier comparison; confirm all 4 ROADMAP success criteria green

### Phase 19: Skills Per-Project, Deltas & Badges
**Goal**: User can drill into any skill on `/skills/$name` and see *where* it runs (per-project breakdown), *how its trajectory is changing* (period-over-period deltas), and *whether it's freshly active or going dormant* (badges) — backed by a normalized `project_key` that prevents cwd cardinality blowup and path leakage.
**Depends on**: Phase 18 (green CI baseline; no flakes obscuring new test signal)
**Requirements**: SKLP-08, SKLP-09, SKLP-10
**Success Criteria** (what must be TRUE):
  1. User opens `/skills/<name>` and sees a sortable per-project table (cost / latency / count columns) populated from `GET /api/skills/{name}/projects`, where projects are keyed by `project_key` (sha1[:12] of `realpath(cwd.rstrip('/'))`) — never raw `cwd` — and the response shape leaks no filesystem paths.
  2. Migration `0003_project_key` lands in this phase: `sessions.project_key VARCHAR(12) NOT NULL DEFAULT ''`, backfilled, indexed; available for ANLY-07 in Phase 20 to consume without migration churn.
  3. TopSkills panel, SkillCostCard, and per-skill detail page each render a 7d-vs-prev-7d delta pill (↑/↓ with absolute delta + percent) for cost and usage count, derived via prev-period CTE in the existing skills router.
  4. Skills with `first_activated_at` within the last 7 days display a "new this week" badge, and skills with `last_activated_at` older than 30 days display a "dormant" badge — with cold-start suppression for skills <14 days old (no false-positive "dormant" on a freshly-installed skill).
  5. DST day-boundary windowing is correct: badge thresholds use SQLite `datetime('now', '-N days')` (UTC), not local-time arithmetic, verified by a unit test crossing the spring-forward boundary.
**Plans**: 4 plans
  - [x] 19-01-migration-and-project-key-PLAN.md — Alembic migration `0003_project_key` (sessions.project_key VARCHAR(12) NOT NULL DEFAULT '', indexed, Python-loop backfill via realpath); `cmc.core.project_key.compute_project_key` helper; scheduler.py + repository.py wiring so new/re-synced sessions get keyed (completed 2026-05-06)
  - [x] 19-02-skills-projects-endpoint-PLAN.md — SKLP-08 `GET /api/skills/{name}/projects` endpoint returning `SkillProjectRow[]` (project_key, count, p50/p95, cost_usd, cost_attribution, low_sample); structural no-path-leakage test (response shape carries project_key only) (completed 2026-05-06)
  - [ ] 19-03-deltas-and-badges-PLAN.md — SKLP-09 prev-period CTE (7d-vs-prev-7d) extends `/skills/usage` and `/skills/{name}/cost`; SKLP-10 new/dormant badges via MIN/MAX(ts) with cold-start suppression; DST spring-forward unit test (ROADMAP success criterion #5)
  - [ ] 19-04-frontend-deltas-projects-badges-PLAN.md — DeltaPill primitive, SkillProjectsTable panel mount on `/skills/$name`, badges on TopSkills + SkillsRegistry, DeltaPill wiring on TopSkills + SkillCostCard, Playwright skills-detail spec with path-leakage guard
**UI hint**: yes

### Phase 20: Cost Forecast & Per-Project Card
**Goal**: User can see *where the month is heading* (monthly cost forecast) and *which projects are driving spend* (per-project cost card) on the cost dashboard, using read-time analytics consistent with the v1.1 "tokens stored, $ computed at read time" invariant.
**Depends on**: Phase 19 (consumes migration `0003_project_key` for ANLY-07; sequencing avoids duplicate migration ownership)
**Requirements**: ANLY-06, ANLY-07
**Success Criteria** (what must be TRUE):
  1. User loads the cost dashboard and sees a monthly forecast figure derived from a 14d rolling baseline via stdlib Decimal-only OLS in `cmc/cost/forecast.py`; backend returns `insufficient_data` when `days_elapsed < 7` and the UI renders an explanatory message instead of a misleading number.
  2. During the first week of any month the forecast card shows a partial-month bias banner so the user understands the projection is volatile; banner clears once `days_elapsed >= 7`.
  3. User sees a per-project cost card with cost and token volume by `project_key` over 7d/30d toggle, populated from the existing `GET /api/cost/breakdown?dim=project` endpoint shipped in v1.1 Phase 13 (no new endpoint needed; UI-only addition).
  4. No dollar values are stored in the database at any point; all cost figures are computed at read time via `cmc.pricing.compute_cost`, preserving the v1.1 self-correcting historical-totals property.
**Plans**: TBD
**UI hint**: yes

### Phase 21: Alert Anomaly Depth & NL Authoring
**Goal**: User can author richer alert rules — *both* by configuring a sliding-window rolling-mean ± stddev anomaly detector (alongside the existing EWMA z-score one) *and* by typing rules in natural language ("alert me when haiku skill p95 exceeds 5s for 10 minutes") — without the alert engine ever shipping a fallback rule on Haiku hallucination or a parallel detector function.
**Depends on**: Phase 18 (green CI baseline; ALRT lifecycle tests need clean signal). Independent of Phases 19/20; can run in parallel with Phase 20 if capacity allows.
**Requirements**: ALRT-13, ALRT-14
**Success Criteria** (what must be TRUE):
  1. ALRT-13 ships as a `params_json.window_kind: "ewma" | "sliding"` discriminator inside the existing `evaluate_anomaly` function — there is no third `kind` value, no parallel detector function, and no second dispatch branch; verified by an ast-based static-import test asserting only one anomaly detector exists.
  2. The sliding-window detector reuses the shipped Welford variance recurrence verbatim (no naive `E[X²] − E[X]²`), with a warmup-boundary `PENDING_FIRE` guard preventing spurious fires during the first window's worth of ticks.
  3. User can `POST /api/alerts/parse-nl` with a natural-language string and see a preview modal showing the parsed `AlertRule` (scope, metric, comparator, threshold, window) before saving; the parser mirrors `nlcron.py` / `skill_router.py` (lazy `AsyncAnthropic`, `_SCOPE_EXTRACTORS.keys()` injected verbatim into the system prompt).
  4. ALRT-14 hard-validates parser output against `_SCOPE_EXTRACTORS.keys()` via `is_known_metric()` and returns `None` on hallucination — there is no fallback rule, no "best-guess" save path, and the UI surfaces an honest "could not parse" message instead.
  5. KNOWN_METRICS stays in sync between backend `_SCOPE_EXTRACTORS` and the frontend AlertRuleForm constant, either via a new `GET /api/alerts/metrics` dynamic endpoint or a CI sync test that fails fast on drift.
**Plans**: TBD
**UI hint**: yes

### Phase 22: Skill Latency Overhead (spike-gated)
**Goal**: Feasibility-gated delivery of SKLP-11 — open with a mandatory data-availability spike against `tools` temporal JOIN vs `skill_activated.duration_ms`; if the derivation is reliable, ship the body/subagent/tool stacked-bar breakdown; if not, document the negative finding and descope SKLP-11 to v1.3 cleanly without blocking Phase 23.
**Depends on**: Phase 19 (reuses CTE patterns and `/skills/$name` panel scaffolding from skills work)
**Requirements**: SKLP-11
**Success Criteria** (what must be TRUE):
  1. Spike resolves yes/no with documented derivation source OR descope decision committed: phase plan front-matter cites the specific SQL column or temporal-JOIN derivation source for each of `body_ms` / `subagent_ms` / `tool_ms` — OR records a negative finding and commits SKLP-11's descope to v1.3 with REQUIREMENTS.md updated to match. No fake decomposition (ratio guesswork, fabricated event types, etc.) ships under any circumstance.
  2. **If spike succeeds:** User sees a stacked-bar overhead breakdown on `/skills/$name` populated from `GET /api/skills/{name}/overhead` showing body / subagent / tool components, with a `low_sample` badge when sample count is below the established `MIN_LATENCY_SAMPLES=30` threshold.
  3. **If spike fails:** SKLP-11 is marked descoped in REQUIREMENTS.md (status: `Deferred to v1.3`), the SPIKE plan's negative-finding document anchors the descope decision, and Phase 23 begins on schedule with no blocking dependency.
  4. No new top-level routes, no new dependencies, and no parallel skill-event types are introduced; any new endpoint slots into the existing `/api/skills/{name}/*` pattern.
**Plans**: TBD
**UI hint**: yes

### Phase 23: Compare Depth & Milestone Close
**Goal**: Close the v1.2 milestone by deepening the v1.1 compare lane — user sees per-skill latency delta in `/sessions/compare` *and* can jump from any session view to compare-with-previous via Cmd+K — then run the milestone-close audit (full test suite green, REQUIREMENTS.md traceability, archive-ready ROADMAP).
**Depends on**: Phase 22 (optional reuse of overhead-derivation work if SKLP-11 shipped; runs cleanly even if SKLP-11 descoped). Independent of Phases 19/20/21 from a code-dependency standpoint.
**Requirements**: CMPR-06, CMPR-07
**Success Criteria** (what must be TRUE):
  1. `GET /api/sessions/compare?a=&b=` returns a `skill_latencies` dict on each side via `_build_compare_side` extension, with `low_sample_a` / `low_sample_b` flags suppressing the delta calculation when either side has fewer than 30 samples; the existing CMPR-04 9-SQL-per-request budget and 200-with-flag over-cap fallback both still hold (verified by per-request SQL counter assertions).
  2. User can open Cmd+K from any session view and trigger "Compare with previous session"; backend `GET /api/sessions/{sid}/previous` returns the most-recent same-`project_key` session with `ended_at IS NOT NULL`, the cmdk action is conditionally visible only when a previous session exists, and the existing self-compare guard prevents `a=b` URLs.
  3. Milestone-close audit hooks pass: backend pytest, frontend vitest, and Playwright e2e suites are all green; `cmc doctor` returns clean; REQUIREMENTS.md traceability shows 13/13 v1.2 requirements as `Complete` (or honestly marked `Deferred to v1.3` for SKLP-11 if Phase 22 descoped); ROADMAP.md is archive-ready for `.planning/milestones/v1.2-ROADMAP.md`.
  4. CMPR-05 tabular-only invariant still holds (no diff library, no raw message rendering); DevTools Sources scan shows zero matches against `diff|jsdiff|react-diff`.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:** Phases execute in numeric order. Phase numbering is continuous across milestones (never restarts at 01).

| Phase | Milestone | Plans Complete | Status   | Completed  |
| ----- | --------- | -------------- | -------- | ---------- |
| 1. Foundation & Database | v1.0 | 7/7 | Complete | 2026-04-25 |
| 2. Data Ingestion | v1.0 | 6/6 | Complete | 2026-04-26 |
| 3. Read-Only APIs | v1.0 | 5/5 | Complete | 2026-04-26 |
| 4. Stateful APIs | v1.0 | 5/5 | Complete | 2026-04-26 |
| 5. Frontend Shell & Design System | v1.0 | 4/4 | Complete | 2026-04-27 |
| 6. Observability & Activity Panels | v1.0 | 5/5 | Complete | 2026-04-27 |
| 7. Command Centre Panels | v1.0 | 4/4 | Complete | 2026-04-27 |
| 8. Mission Control Dispatcher | v1.0 | 4/4 | Complete | 2026-04-27 |
| 9. Telegram, Setup & Testing | v1.0 | 5/5 | Complete | 2026-04-28 |
| 10. Telegram Wiring Fixes (gap closure) | v1.0 | 1/1 | Complete | 2026-04-28 |
| 11. v1.0 Documentation & Env Polish (gap closure) | v1.0 | 1/1 | Complete | 2026-04-28 |
| 12. OTEL Skill Event Spike | v1.1 | 2/2 | Complete | 2026-05-02 |
| 13. Cost Foundation & Skill Ingest | v1.1 | 6/6 | Complete | 2026-05-03 |
| 14. Skills API & Page Panels | v1.1 | 5/5 | Complete | 2026-05-04 |
| 15. Alert Engine & UI | v1.1 | 5/5 | Complete | 2026-05-04 |
| 16. Session Comparison | v1.1 | 4/4 | Complete | 2026-05-05 |
| 17. Polish, Doctor & Tests | v1.1 | 6/6 | Complete | 2026-05-05 |
| 18. Polish & Carry-Forward Cleanup | v1.2 | 5/5 | Complete   | 2026-05-05 |
| 19. Skills Per-Project, Deltas & Badges | v1.2 | 1/4 | In progress | — |
| 20. Cost Forecast & Per-Project Card | v1.2 | 0/? | Not started | — |
| 21. Alert Anomaly Depth & NL Authoring | v1.2 | 0/? | Not started | — |
| 22. Skill Latency Overhead (spike-gated) | v1.2 | 0/? | Not started | — |
| 23. Compare Depth & Milestone Close | v1.2 | 0/? | Not started | — |

**v1.0 milestone shipped: 47/47 plans, 11/11 phases verified (9 base + 2 audit gap-closure).**
**v1.1 milestone shipped: 28/28 plans, 6/6 phases verified, 41/41 requirements satisfied.**
**v1.2 milestone active: Phases 18–23 (6 phases, 13 requirements). Plan counts pending `/gsd-plan-phase` per phase.**
