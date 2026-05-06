# Requirements: Claude Mission Control

**Defined:** 2026-05-05
**Milestone:** v1.2 Depth & Polish
**Core Value:** A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, what each skill costs and how often it fails, queue and approve tasks, compare two sessions side-by-side, get paged when metrics breach thresholds, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

## v1.2 Requirements

13 requirements across 5 categories. All are P1 (table stakes) — closing visible gaps in v1.1 lanes during one-cycle daily use.

### Skills Polish

- [x] **SKLP-08**: User can see per-project breakdown of skill usage on `/skills/$name` (sortable table by cost / latency / count; backed by `/api/skills/{name}/projects` endpoint; uses `project_key` normalization to prevent cwd cardinality blowup and path leakage) — complete end-to-end 2026-05-06 (backend Phase 19 Plan 02 commits b6d73a7 + 056141b; frontend Phase 19 Plan 04 commits 5092e51 SkillProjectsTable + path-leakage scan, b729ecc Playwright e2e)
- [x] **SKLP-09**: User can see period-over-period delta pills (7d-vs-prev-7d) for skill cost and usage count on TopSkills panel, SkillCostCard, and per-skill detail page (prev-period CTE, ↑/↓ pill with absolute delta + percent) — complete end-to-end 2026-05-06 (backend Phase 19 Plan 03 commits ee662cb + ea0d1cb + 68aeb5c; frontend Phase 19 Plan 04 commits 2333b46 DeltaPill primitive + b729ecc TopSkills/SkillCostCard wiring)
- [x] **SKLP-10**: User sees "new this week" / "dormant" badges on skills (backend-computed from `first_activated_at` / `last_activated_at`; thresholds: 7d for "new", 30d for "dormant"; cold-start suppression for skills <14 days old) — complete end-to-end 2026-05-06 (backend Phase 19 Plan 03 commits ee662cb + ea0d1cb + 68aeb5c; frontend Phase 19 Plan 04 commit b729ecc TopSkills + SkillsRegistry badge wiring via useSkillUsage merge)
- [ ] **SKLP-11**: User can see per-skill latency overhead breakdown (body / subagent / tool stacked bar) — **spike-gated**: Phase 22 opens with mandatory feasibility check via `tools` temporal JOIN against `skill_activated.duration_ms`; if derivation unreliable, descopes to v1.3

### Cost Differentiators

- [x] **ANLY-06**: User sees monthly cost forecast on the cost dashboard (linear extrapolation, 14d rolling baseline, Decimal-only OLS, `insufficient_data` guard when <7 days elapsed; partial-month bias banner during week 1) — complete end-to-end 2026-05-06 (backend Phase 20 Plan 02 commits 01b25a1 + 10e0757 + 54f922b + 2765f07: `cmc/cost/forecast.py` module + `GET /api/cost/forecast` endpoint with `CostForecastResponse`, 26 unit + 5 integration tests; frontend Phase 20 Plan 03 commits f90ec21 types+api+qk+hooks + 1fc13e1 `CostForecastCard` panel + `/cost` route mount in 96ea120; bias banner driven by server `partial_month_bias` flag — Pitfall 7 adversarially tested)
- [x] **ANLY-07**: User sees per-project cost breakdown card with cost and token volume by `project_key` over 7d/30d (UI-only addition; backend endpoint `/api/cost/breakdown?dim=project` SQL refactor in Phase 20 Plan 01 commits 96dbc9e + 17e162f + 3b33b2d to GROUP BY sessions.project_key + WHERE != ''; frontend `CostByProjectCard` in Phase 20 Plan 03 commits 1fc13e1 panel + 96ea120 /cost route mount; sortable DataTable with 7d/30d toggle, runtime-DOM path-leakage guard mirrors Phase 19 SKLP-08 dual-guard pattern)

### Alert Differentiators

- [ ] **ALRT-13**: User can configure rolling-mean-±-stddev anomaly detection rules (extends `evaluate_anomaly` via `params_json.window_kind: "ewma" | "sliding"` discriminator inside the single function; Welford variance recurrence reused verbatim; warmup-boundary PENDING_FIRE guard; no new `kind` value, no parallel detector function)
- [ ] **ALRT-14**: User can author alert rules in natural language via `POST /api/alerts/parse-nl` ("alert me when haiku skill p95 exceeds 5s for 10 minutes" → preview modal showing the parsed AlertRule → save). Mirrors `nlcron.py` / `skill_router.py` pattern: lazy AsyncAnthropic, `_SCOPE_EXTRACTORS` vocabulary in system prompt, hard-validation via `is_known_metric()`, returns `None` on hallucination (no fallback rule)

### Compare Differentiators

- [ ] **CMPR-06**: User sees per-skill latency delta in `/sessions/compare` view (extends `_build_compare_side` with `skill_latencies` dict; `low_sample_a` / `low_sample_b` flags suppress delta when sample count <30; respects existing CMPR-04 9-SQL-per-request budget and 200-with-flag over-cap fallback)
- [ ] **CMPR-07**: User can jump from any session view to compare-with-previous via Cmd+K (`/api/sessions/{sid}/previous` endpoint returns most-recent same-cwd session with `ended_at IS NOT NULL`; cmdk context-aware action visible only when there is a previous session; reuses self-compare guard)

### Polish & Cleanup

- [x] **POLI-06**: Replace deprecated `Field(default_factory=datetime.utcnow)` with naive-UTC helper across 18+ sites — centralized `cmc/core/time.py` helper returning `datetime.now(UTC).replace(tzinfo=None)` to preserve SQLite-compatible naive datetime; Pydantic v2 / Python 3.13 forward-compatible; `ruff check --select UP` passes
- [x] **POLI-07**: Stabilize `SchedulesCard.test.tsx > stale row` time-of-day flake — fix is `vi.spyOn(Date, 'now')` (NOT `vi.useFakeTimers`); test runs deterministically across all clock conditions
- [x] **POLI-08**: Disambiguate `schedule-composer.spec.ts` strict-mode aria-label collision with Phase 14 firehose `Filter skill name` control — establish `data-testid` convention for colliding controls; convention documented in repo (CONTRIBUTING or e2e README); both Playwright suites pass strict-mode

## Future Requirements (deferred)

### Skills (v1.3+)
- **SKLP-12**: SKLP-11 percentile-split breakdown (p50 / p95 / p99 per overhead category) — only if SKLP-11 ships
- **SKLP-13**: Heatmap toggle on per-project skill breakdown (alternative view)

### Cost (v1.3+)
- **ANLY-08**: Confidence band on monthly cost forecast (residual-stddev-derived ± range)
- **ANLY-09**: Per-project cost budgets with alert integration

### Alerts (v1.3+)
- **ALRT-15**: Predictive alerts (forecast × anomaly combination — tabled until false-positive UX validated)
- **ALRT-16**: NL queries beyond AlertRule schema (its own milestone; NL2SQL is a separate concern)

### Compare (v1.3+)
- **CMPR-08**: Sessions-table right-click "compare with previous" entry point (LOW differentiator)
- **CMPR-09**: Per-skill cost delta (cost is currently rolled up; per-skill breakdown depends on Phase 14 panels)

### Platform / Automation (v2.0+)
- **PLAT-01**: Linux / systemd support (currently macOS-only)
- **AUTO-01**: NL schedules beyond cron (e.g., "every business day at 9am unless I'm on PTO")
- **AUTO-02**: Auto-retry policy for failed scheduled tasks
- **AUTO-03**: Task dependencies (run B only after A succeeds)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user collaboration | Locked v1.0 — single-user tool by design |
| NL2SQL queries | Outside the AlertRule grammar; its own milestone if ever |
| 3+ way session comparison | Locked v1.1 — layout collapses; Linear/Honeycomb/Langfuse all stop at 2 |
| CSV / Parquet export | Localhost-only, browser is the surface; users can `.read .dump` SQLite directly |
| Sankey diagrams for skill→tool flow | Density wins over diagram-style at this UI bar |
| Per-project budgets that block invocation | Locked v1.1 — alerts are sensors, not actuators (ALRT-12 invariant) |
| New top-level routes | v1.2 is depth, not breadth — every feature extends an existing page |
| New external dependencies (numpy, scipy, pandas, instructor, date-fns) | STACK research confirmed zero new deps needed |
| Cost stamping at ingest time | Locked v1.1 — read-time only; `/v1/logs` MUST always return 200 |
| Cost stored as $ in DB | Locked v1.1 — tokens stored, $ computed at read time; pricing edits self-correct historical totals |
| ALRT-13 as parallel detector function | PITFALLS-locked — extend `evaluate_anomaly`; never add a sibling or third `kind` |
| ALRT-14 fallback rule on hallucination | PITFALLS-locked — return `None`; never ship a "best-guess" AlertRule |
| Raw `cwd` as project grouping key | PITFALLS-locked — must use `project_key` (sha1 hash) to prevent cardinality blowup and path leakage |

## Traceability

Mapped to v1.2 ROADMAP.md (Phases 18–23) on 2026-05-05.

| Requirement | Phase | Status |
|-------------|-------|--------|
| POLI-06 | Phase 18 | Complete |
| POLI-07 | Phase 18 | Complete (2026-05-05, commit 3457c32) |
| POLI-08 | Phase 18 | Complete |
| SKLP-08 | Phase 19 | Complete end-to-end (2026-05-06, backend b6d73a7 + 056141b; frontend 5092e51 + b729ecc) |
| SKLP-09 | Phase 19 | Complete end-to-end (2026-05-06, backend ee662cb + ea0d1cb + 68aeb5c; frontend 2333b46 + b729ecc) |
| SKLP-10 | Phase 19 | Complete end-to-end (2026-05-06, backend ee662cb + ea0d1cb + 68aeb5c; frontend b729ecc) |
| ANLY-06 | Phase 20 | Complete (2026-05-06, backend Plan 02: 01b25a1 + 10e0757 + 54f922b + 2765f07; frontend Plan 03: f90ec21 + 1fc13e1 + 96ea120) |
| ANLY-07 | Phase 20 | Complete (2026-05-06, backend Plan 01: 96dbc9e + 17e162f + 3b33b2d; frontend Plan 03: 1fc13e1 + 96ea120) |
| ALRT-13 | Phase 21 | Pending |
| ALRT-14 | Phase 21 | Pending |
| SKLP-11 | Phase 22 | Pending (spike-gated; descopes to v1.3 if feasibility fails) |
| CMPR-06 | Phase 23 | Pending |
| CMPR-07 | Phase 23 | Pending |

**Coverage:**
- v1.2 requirements: 13 total
- Mapped to phases: 13 ✓
- Unmapped: 0 ✓

**Phase distribution:**
- Phase 18 (Polish & Cleanup): 3 requirements (POLI-06, POLI-07, POLI-08)
- Phase 19 (Skills Per-Project/Deltas/Badges): 3 requirements (SKLP-08, SKLP-09, SKLP-10)
- Phase 20 (Cost Forecast & Per-Project Card): 2 requirements (ANLY-06, ANLY-07)
- Phase 21 (Alert Anomaly Depth & NL Authoring): 2 requirements (ALRT-13, ALRT-14)
- Phase 22 (Skill Latency Overhead, spike-gated): 1 requirement (SKLP-11)
- Phase 23 (Compare Depth & Milestone Close): 2 requirements (CMPR-06, CMPR-07)

---
*Requirements defined: 2026-05-05*
*Roadmap mapped: 2026-05-05 (Phases 18–23)*
*Last updated: 2026-05-05 after roadmap creation*
