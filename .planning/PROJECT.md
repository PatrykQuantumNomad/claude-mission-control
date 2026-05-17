# Claude Mission Control

## What This Is

A production-grade local dashboard and command centre for Claude Code, shipped as v1.0 on 2026-04-28, extended through v1.1 (Skills & Cost Intelligence) on 2026-05-05, deepened through v1.2 (Depth & Polish) on 2026-05-09, and rebuilt around a dashboard-product surface through v1.3 (Surface Redesign) on 2026-05-17. Ingests session JSONLs and OTEL telemetry from the user's Mac, stores everything in SQLite (WAL), and renders a dense, dark-themed React UI at `localhost:8765` with a collapsible sidebar shell + 3-tier density toggle + global time picker + server-persisted saved views (URL-shareable, per-route, with edit-vs-fork semantics + pinned favorites + Cmd+K group) + per-route layout customization (panel show/hide + 1D drag-reorder + split-pane resize on `/sessions/compare`). Includes a Mission Control task dispatcher with classic + stream execution modes, a human-in-the-loop decisions/inbox system, scheduled task automation with cron + natural-language input, live session monitoring, a hysteresis-aware skill-level alert engine (sliding-window anomaly detection + Haiku-backed natural-language rule authoring with V11 collapsed-failure-mode lock) and Telegram ack flow, two-up session comparison with per-skill latency deltas + Cmd+K compare-with-previous shortcut + split-pane resize, a read-time cost engine with 5-SKU pricing, monthly forecast (Decimal-only OLS) and per-project cost breakdown card with TIME-04 CompareToggle, project-keyed skill observability (per-project breakdown, 7d-vs-prev-7d delta pills, new/dormant badges) backed by a normalized `project_key` (sha1[:12] of `realpath(cwd)`) now authoritatively exposed on wire shapes, and an optional Telegram bridge with full Approve/Reject/Snooze callback parity. Runs entirely on localhost — no cloud, no accounts, no outbound telemetry.

## Core Value

A solo Claude Code developer can see what every agent session is doing, how tokens and tools are performing, what each skill costs and how often it fails, queue and approve tasks, compare two sessions side-by-side, get paged when metrics breach thresholds, and kill runaway sessions — all from one browser tab without maintaining external infrastructure.

(Verified at v1.0 ship, re-verified at v1.1 ship, re-verified at v1.2 ship, and re-verified at v1.3 ship: the v1.3 Surface Redesign rebuilt every visible surface around dashboard-product conventions (Honeycomb/Datadog/PostHog/Grafana family) without breaking a single URL, API contract, or test suite — and the resulting product still answers exactly the same one-tab daily-use question. Core value did not shift during v1.3; the milestone changed the surface, not the substance.)

## Current State

**v1.3 Surface Redesign shipped 2026-05-17** at git `1614f4d` — 8-day milestone (2026-05-09 → 2026-05-17), 5 phases (24–28), 42 plans, 994 files changed vs v1.2, +177,800 / -7,268 lines. ~87,531 LOC at close (~41,187 Python + ~46,344 TypeScript/TSX). Test suites green at close: 690 backend + 754 frontend + 320 Playwright e2e tests in 19 spec files (vs v1.2 baseline 661/326/13). Lighthouse 9/9 PASS at median (LCP 559-586ms, CLS 0-0.003, performance 1.0); axe 0 phase-attributable violations across 13 close-gate scans; portal containment 7/7 PASS; URL contract pytest 2/2 PASS at every phase close (APPEND-ONLY `validateSearch` enforced by `tests/test_url_contract.py` bidirectional gate). Audit verified 45/45 active v1.3 requirements + 5/5 phases + 6/7 cross-phase integration wiring claims (1 documentation WARNING, no functional break) + 4/5 E2E flows complete + 1 documented Accepted Exception (TIME-04 DeltaPill column on `/cost` — backend bucketed endpoint deferred to v1.4+). One Alembic migration (`0004_saved_views`); zero new top-level routes; 6 new runtime frontend deps at exact pins (`@radix-ui/react-popover@1.1.15`, `@radix-ui/react-dropdown-menu@2.1.16`, `sonner@2.0.7`, `react-day-picker@10.0.0`, `date-fns@4.1.0`, `react-resizable-panels@4.11.0`); zero new Python dependencies. 13 Accepted Exceptions operator-acknowledged as forward-compatible tech debt deferred to v1.4+ (see `milestones/v1.3-MILESTONE-AUDIT.md` Tech Debt Summary).

## Next Milestone: v1.4 — TBD

To be defined via `/gsd:new-milestone`. Likely candidates from v1.4+ backlog:

- **LAYO-05** — full 2D drag-resize grid via `react-grid-layout` (blocked by GitHub Issue #2045: React 19.2 key-prop warnings; unblock when issue resolves)
- **ANLY-08** — confidence band on monthly cost forecast (residual-stddev-derived ± range)
- **ANLY-09** — per-project cost budgets with alert integration (cross-lane, bridges cost ↔ alerts)
- **SKLP-11 retry** — per-skill body/subagent/tool latency overhead breakdown, still gated on upstream OTEL data availability change (Phase 22 spike CT-1 coverage probe is the unblock condition)
- **SKLP-12** — SKLP-11 percentile-split (p50 / p95 / p99 per overhead category)
- **SKLP-13** — heatmap toggle on per-project skill breakdown
- **ALRT-15** — predictive alerts (forecast × anomaly combination — tabled until false-positive UX validated)
- **ALRT-16** — NL queries beyond AlertRule schema (separate-milestone candidate; NL2SQL)
- **CMPR-08** — sessions-table right-click "compare with previous" (LOW differentiator vs existing Cmd+K)
- **CMPR-09** — per-skill cost delta in compare (depends on per-skill cost rollup not yet wired)
- **PLAT-01** — Linux / systemd support (currently macOS-only)
- **AUTO-01..03** — NL schedules beyond cron, auto-retry policy for failed scheduled tasks, task dependencies

**v1.3 tech debt carried for v1.4 planning visibility:**

- `CostByProjectCard` DeltaPill column needs backend bucketed-cost endpoint to render (Phase 27 Accepted Exception #2; URL round-trip contract already lands)
- `CostForecastCard` MTD-only — `range` param on `/api/cost/forecast` would enable explicit re-query (Phase 27 Accepted Exception #1)
- `SkillLatencySnapshot` stays on route-local `?range=` until single-skill snapshot refactor (Phase 27 Accepted Exception #5)
- Same-tab `PinnedViewsSection` write requires page reload (Phase 25 limitation — needs custom event or Zustand-style store)
- `DefaultViewLoader` v1 limitation on `/skills/$name` (Phase 25 Accepted Exception (a) — `validateSearch` populates default `range`, blocking Pitfall-8 deep-link-wins auto-apply)
- 8 v1.2-baseline contrast/aria carry-overs (Phase 25 Pitfall 7 rebalance window — Phase 28+ candidate)
- REQUIREMENTS.md doc-drift: line 12 said "3 baseline deps" — actual = 6 runtime deps across v1.3 (documentation inaccuracy only; zero Python deps still satisfied)
- No standalone `28-VERIFICATION.md` from gsd-verifier — substituted by `28-VISUAL-CHECK.md` + operator-signed `28-06-SUMMARY.md`. Functionally equivalent; artifact-shape gap only

**Out of scope for v1.4+ (carried from v1.3 invariants):** Multi-user collaboration, NL2SQL, 3+ way session comparison, CSV/Parquet export, Sankey diagrams, per-project budgets that block invocation, cost stamping at ingest time, cost stored as $, Tailwind migration, `@shadcn/ui` adoption, `react-grid-layout-19` community fork, `dnd-kit`, mobile drag-resize, cloud-sync of saved views/density/layout state, per-panel time override (anti-feature — Honeycomb explicitly removed this), auto-density-by-viewport-width.

## Requirements

### Validated

**v1.0 baseline (148 requirements — see `.planning/milestones/v1.0-REQUIREMENTS.md` for full list):**

- ✓ Ingest session JSONLs from `~/.claude/projects/` on boot and every 120s — v1.0
- ✓ Receive OTEL telemetry via `/v1/logs` and `/v1/metrics` endpoints (OTLP/HTTP JSON, always-200 contract) — v1.0
- ✓ Store all data in a single SQLite file with WAL mode + Alembic migrations — v1.0
- ✓ Serve pre-built React frontend as static files from FastAPI with SPA catch-all routing — v1.0
- ✓ Show system health strip, KPI row, and attention bar on every page load — v1.0 (OPNL-01..03)
- ✓ Display live sessions with tool-call timeline drawer and follow-up messaging for stream-mode sessions — v1.0 (OPNL-04)
- ✓ Show token usage with daily stacked bars (today/7d/30d) by model and source — v1.0 (OPNL-05)
- ✓ Show cache efficiency with hit rate, daily trend, and low-sample badge — v1.0 (OPNL-06)
- ✓ Show session outcomes as stacked daily bars — v1.0 (OPNL-07)
- ✓ Show per-tool latency with p50/p95/max/error-rate sorted by p95 — v1.0 (OPNL-08)
- ✓ Show hook activity with daily fires and paired-duration estimates — v1.0 (OPNL-09)
- ✓ Show project breakdown by cwd — v1.0 (OPNL-10)
- ✓ Show agent fanout, edit acceptance rates, productivity counters, system pressure — v1.0 (OPNL-11..14)
- ✓ Provide MCP server drill-down with per-server and per-tool latency — v1.0 (OPNL-15 + SKLP-01)
- ✓ Show context health (read-only scan of settings.json + CLAUDE.md) — v1.0 (SKLP-03)
- ✓ Provide skill registry with autonomy controls — v1.0 (SKLP-04)
- ✓ Show activity heatmap, 14-day token charts, OTEL firehose, unified failure view, sessions table — v1.0 (ACTV-01..03, ACTV-05, ACTV-06)
- ✓ Implement HITL decisions queue with pending/answered flow — v1.0 (HPNL-01, 5s polling)
- ✓ Implement HITL inbox for agent-to-user messaging — v1.0 (HPNL-02, 10s polling)
- ✓ Implement task board with full lifecycle — v1.0 (TPNL-01..02)
- ✓ Implement schedule system with cron composer + NL-cron — v1.0 (TPNL-03..04)
- ✓ Implement Mission Control dispatcher with stream/classic execution modes — v1.0 (DISP-01..12)
- ✓ Implement emergency stop with PID-validated SIGTERM — v1.0 (ESTOP-01..04)
- ✓ Implement Telegram bridge with notifier + handler + callback dispatch — v1.0 (TELE-01..07)
- ✓ Provide command palette (Cmd+K) with fuzzy search — v1.0 (FESH-07)
- ✓ Support collapsible sections + framer-motion polish — v1.0 (FESH-03)
- ✓ Deliver production-grade dark theme matching Linear/Raycast/Vercel quality bar — v1.0 (DESG-01..06)
- ✓ Provide `install.sh` + `cmc` CLI shim + `doctor.py` deterministic health check — v1.0 (SETUP-01..07)
- ✓ Include Playwright e2e tests covering main pages, command palette, schedule composer, theme toggle — v1.0 (TEST-01..04)

**v1.1 — see `.planning/milestones/v1.1-REQUIREMENTS.md` for full list (41 requirements):**

- ✓ Confirm `claude_code.skill_activated` event shape from real ingest (verbatim SQL output) — v1.1 (SPIK-01, Phase 12)
- ✓ `cmc.pricing.compute_cost` Decimal-only math + 5-SKU pricing table with `effective_from`/`effective_until` window logic; never store $ in derived tables — v1.1 (ANLY-01..03, Phase 13)
- ✓ `GET /api/cost/summary` + `/api/cost/breakdown?dim=model|skill|project` with cache-tier accounting; "Rates as of YYYY-MM-DD" UI caption; doctor warns on stale pricing rows — v1.1 (ANLY-04..05, Phase 13/14)
- ✓ `attrs_skill_name` indexed column + `(session_id, otel_event_id)` UNIQUE for idempotent skill-event ingest; single Alembic migration 0002 for skill column + alert tables — v1.1 (INGST-11..13, Phase 13)
- ✓ Skills API surface: `/api/skills/usage`, `/api/skills/{name}/cost|latency|runs` with Pattern 4 SQL CTEs — v1.1 (SKIL-04..07, Phase 14)
- ✓ TopSkills panel reactivated (closes ACTV-04 v1.0 placeholder); SkillCostCard reactivated (closes SKLP-02 v1.0 placeholder) — v1.1 (Phase 14)
- ✓ SkillLatencyTable + SkillTimeline + per-skill detail route `/skills/$name` (first file-based dynamic route in the codebase) — v1.1 (SKLP-05..07, Phase 14)
- ✓ Hysteresis-aware alert engine with `alert_rules` + `alert_state` tables; `evaluate_alerts(db)` invoked once per dispatcher tick after stamp_tick + e-stop; try/except isolation — v1.1 (ALRT-01..04, Phase 15)
- ✓ EWMA z-score detector with 24h warm-up suppression; stable `dedup_key = f"alert:{rule_id}:{scope_key}"` reusing `notification_log` UNIQUE; auto-resolve via `decisions.status='answered'` + `answered_by='alert_engine'` — v1.1 (ALRT-05..07, Phase 15)
- ✓ Telegram `ack_alert` callback verb (sha256[:8] under 64-byte cap) with 1h re-notification suppression; `cmc/telegram/callback_verbs.py` central StrEnum — v1.1 (ALRT-08, Phase 15)
- ✓ `/api/alerts` full CRUD + `/api/alerts/events?range=` history; `/alerts` UI page with rules list + discriminated-union form + events history — v1.1 (ALRT-09..10, Phase 15)
- ✓ Plain-text alert messages enforced by directory-wide `parse_mode=` grep test; alert engine NEVER imports `cmc.dispatcher.tasks` — v1.1 (ALRT-11..12, Phase 15/17)
- ✓ Single-round-trip `/api/sessions/compare?a=&b=` (≤9 SQL/request) with 200-with-flag over-cap fallback at 500 tool calls — v1.1 (CMPR-01, CMPR-04, Phase 16)
- ✓ Two-up `SessionCompareView` panel + `/sessions/compare` deep-linkable route (first `validateSearch` use, hand-written UUID validator) — v1.1 (CMPR-02, Phase 16)
- ✓ Cmd+K context-aware "Compare with…" + sessions-table per-row Compare button + ComparePicker Sheet drawer — v1.1 (CMPR-03, Phase 16)
- ✓ Tabular-only compare (recharts side-by-side, no diff library, no raw message rendering) — v1.1 (CMPR-05, Phase 16)
- ✓ `cmc doctor` warnings for stale pricing / unpriced tokens / unset OTEL_LOG_TOOL_DETAILS; `parse_mode=` directory-wide CI guard — v1.1 (POLI-01..02, Phase 13/17)
- ✓ CallbackVerb round-trip tests parametrized over enum; alert lifecycle integration test (1 decision + 1 notification_log) — v1.1 (POLI-03..04, Phase 17)
- ✓ Playwright e2e for `/alerts` (create→fire→ack with async-trigger 35s polling + cleanup) and `/sessions/compare` (both picker entry points) — v1.1 (TEST-05, Phase 17)
- ✓ Updated in-repo docs (README + .env.example) covering pricing seed workflow, OTEL spike findings, v1.1 panels — v1.1 (POLI-05, Phase 17; companion guide externally maintained per line 94)

**v1.2 — see `.planning/milestones/v1.2-REQUIREMENTS.md` for full list (12 active + 1 honestly deferred):**

- ✓ Per-project skill breakdown on `/skills/$name` via `GET /api/skills/{name}/projects` with `project_key` normalization (sha1[:12] of `realpath(cwd)`) — v1.2 (SKLP-08, Phase 19)
- ✓ 7d-vs-prev-7d delta pills on TopSkills, SkillCostCard, per-skill detail page via prev-period CTE — v1.2 (SKLP-09, Phase 19)
- ✓ "new this week" / "dormant" badges with cold-start suppression for skills <14 days old; DST-safe UTC windowing — v1.2 (SKLP-10, Phase 19)
- ✓ Monthly cost forecast (Decimal-only OLS, 14d baseline) via `cmc/cost/forecast.py` + `GET /api/cost/forecast`; `insufficient_data` when `<7` days elapsed; `partial_month_bias` banner during week 1 — v1.2 (ANLY-06, Phase 20)
- ✓ Per-project cost breakdown card on new `/cost` route via existing `/api/cost/breakdown?dim=project` (refactored to GROUP BY `s.project_key`); 7d/30d toggle; 4-layer path-leakage defense — v1.2 (ANLY-07, Phase 20)
- ✓ Sliding-window anomaly detection via `params_json.window_kind` discriminator inside single `evaluate_anomaly` (no parallel detector); AST static-import test pinning the single-detector invariant — v1.2 (ALRT-13, Phase 21)
- ✓ Natural-language alert authoring via `POST /api/alerts/parse-nl` (Haiku-backed, lazy AsyncAnthropic, `_SCOPE_EXTRACTORS.keys()` injected into system prompt, `None` on hallucination — no fallback rule); `GET /api/alerts/metrics` dynamic vocabulary; `useParseAlertNl` + `useAlertMetrics` hooks; cross-language drift guard `test_alerts_metrics_sync.py` — v1.2 (ALRT-14, Phase 21)
- ✓ Per-skill latency delta in `/sessions/compare` via `_build_compare_side` extension; `low_sample_a/b` flags suppress delta at <30 samples; preserves CMPR-04 9-SQL-per-request budget — v1.2 (CMPR-06, Phase 23)
- ✓ Cmd+K "compare with previous session" via `GET /api/sessions/{sid}/previous` (project_key + ended_at ordering, 404-as-empty-state); cmdk action gated by previous-session existence; `ActiveSessionContext` for cross-Sheet active-session signal — v1.2 (CMPR-07, Phase 23)
- ✓ POLI-06: Replace `datetime.utcnow` deprecation across 22 sites via centralized `cmc/core/time.py::now_utc`; ~1429 deprecation warnings → 0; `ruff check --select UP` clean — v1.2 (Phase 18)
- ✓ POLI-07: Stabilize `SchedulesCard.test.tsx > stale row` time-of-day flake via `vi.spyOn(Date, 'now')` + sentinel-default test factories — v1.2 (Phase 18)
- ✓ POLI-08: Disambiguate Playwright strict-mode collision via `data-testid="schedule-composer-name"` on source component; `feature-component-element` kebab-case convention documented in `frontend/tests/e2e/README.md` — v1.2 (Phase 18)
- ⊘ SKLP-11: Per-skill body/subagent/tool latency overhead breakdown — **honestly deferred to v1.3** (Phase 22 spike negative finding; ROADMAP SC#3 explicitly contemplated this branch; `22-01-SPIKE-FINDINGS.md` commit `07abcfa` anchors the descope; `duration_ms` structurally absent from data needed for body/subagent/tool decomposition); **still deferred at v1.3 close** — upstream OTEL data availability change remains the unblock condition (carried into v1.4+ backlog)

**v1.3 — see `.planning/milestones/v1.3-REQUIREMENTS.md` for full list (45 active requirements, all SATISFIED):**

- ✓ Containment overhauls (CONT-01..05) — bounded panel viewport via `.cmc-page--bounded` + `min-height: 0` flex ladder; Radix Portal containment for Sheet/Popover/DropdownMenu; global `min-width: 0` on `.cmc-card` (CSS Grid implicit min-content); `BoundedPanelCard` primitive + `bounded` opt-in prop; z-index ladder doc + `cmc/no-raw-z-index` ESLint rule — v1.3 (Phase 24)
- ✓ Shell rework (SHEL-01..06) — collapsible Sidebar (Cmd+B + 3px active-route border-left) + `AppShellHeader` extraction + recently-visited section + pinned saved views; `NavBar.tsx` deleted — v1.3 (Phase 24 SHEL-01..04 + Phase 25 SHEL-06 + Phase 26 SHEL-05)
- ✓ 3-tier density (DENS-01..03) — `[data-density]` attribute on `<html>` via `lib/density.ts`; `:root` cascade into Radix Portal; `DensityProvider` intentionally NOT a React Context (POLI-11 zero-rerender invariant); pre-mount apply for no-flash — v1.3 (Phase 24)
- ✓ Saved Views (VIEW-01..09) — Alembic migration `0004_saved_views` + 5 CRUD endpoints + `validateSearch` on 6 new routes + `SavedViewMenu` chrome + `SaveViewDialog` (Radix Dialog per Pitfall 4 deviation) + `EditOrForkDialog` 3-button no-silent-overwrite + `UnsavedPip` + `LoadedViewContext` + `DefaultViewLoader` (Pitfall 8 deep-link-wins lock) + `RecentStateTracker` (FIFO 50-cap structural dedupe) — v1.3 (Phase 25)
- ✓ Time-anchored navigation (TIME-01..05) — global `TimePicker` (Radix Popover + react-day-picker calendar) + `RefreshDropdown` + `AutoRefreshController` + Cmd+Shift+C/V copy-paste + `TokenUsageCard` prior-period overlay + `useChartBrush` brush-zoom on `/activity` — v1.3 (Phase 26)
- ✓ Layout customization (LAYO-01..04) — per-panel show/hide via `PanelHeaderMenu` Radix DropdownMenu + 1D drag-reorder via `DraggablePanelWrap` (HTML5 dnd + keyboard a11y) + split-pane resize via `react-resizable-panels@4.11.0` on `/sessions/compare` + two-surface Reset Layout escape hatch; layout state piggybacks on saved-view `state_json` (no new DB table) — v1.3 (Phase 28)
- ✓ Cmd+K extensions (CMDK-01..04) — Saved Views group + Density command + Time range commands (Copy/Paste reusing TIME-03 clipboard helpers) + Recents group (last 5 routes + last 5 ad-hoc states); locked JSX order Recents→Saved Views→Pages→Time range→Density→Actions (Pitfall 10) — v1.3 (Phase 25 CMDK-01 + Phase 26 CMDK-02..04)
- ✓ Polish & Quality (POLI-09..14) — formal per-phase visual checkpoint pattern (138 PNGs across milestone) + axe-core per-phase + Lighthouse perf budget (9/9 PASS at median) + 15 affordance checklist + `docs/url-contract.md` + `tests/test_url_contract.py` 2/2 PASS bidirectional gate + `docs/testid-registry.md` + `cmc/testid-registry-only` ESLint rule — v1.3 (Phase 24)
- ✓ Tech debt closure (TDBT-01..03) — `project_key` surfaces on `SessionListItemFull` + `SessionCompareSide` wire shapes (ComparePicker switches from `cwd === scopeCwd` to `project_key === scopeProjectKey`) + `KNOWN_METRICS` deleted with runtime API-contract test (`test_alerts_metrics_contract.py`) replacing build-time grep + NL composer 503 retry UX with V11 collapsed-failure-mode lock preserved (backend route UNCHANGED, Queue UX intentionally NOT shipped per LOCKED OPERATOR DECISION 3) — v1.3 (Phase 27)

**v1.0 audit verification:** 148/148 requirements, 11/11 phases, 8/8 cross-phase integration checks, 8/8 E2E flows passed (re-audited 2026-04-28).
**v1.1 audit verification:** 41/41 requirements, 6/6 phases, 9/9 cross-phase integration checks, 6/6 E2E flows passed (audited 2026-05-05).
**v1.2 audit verification:** 12/12 active requirements + 1/1 honestly deferred (SKLP-11), 6/6 phases, 12/12 cross-phase integration checks, 5/5 E2E flows passed (audited 2026-05-09).
**v1.3 audit verification:** 45/45 active requirements, 5/5 phases, 6/7 integration wiring claims (1 doc WARNING, no functional break), 4/5 E2E flows complete + 1 documented Accepted Exception (TIME-04 DeltaPill column deferred to v1.4+) passed (audited 2026-05-17).

### Active

v1.4 milestone TBD — define via `/gsd:new-milestone`. No active requirements at v1.3 close (all 45 shipped). Carried v1.4+ backlog enumerated in "Next Milestone" section above.

### Out of Scope

- Posture audits panel — community-only feature, not part of this build
- Cloud deployment / remote access — localhost-only by design (privacy model still valid post-v1.1)
- WebSockets for observability — SSE + polling proved sufficient at v1.0/v1.1; reasoning still valid
- PostgreSQL / Supabase / external databases — SQLite single-file is the right tool (validated under real-world ingest at v1.0 and v1.1 alert/skill workloads)
- External auth / OAuth — no auth needed, localhost-only
- Mobile app — browser-only dashboard
- Voice interfaces / agent avatars — dense data UI, not conversational
- Real-time WebSocket session streaming — SSE + polling sufficient
- Multi-user support — single-user tool by design
- Multi-user / leaderboard skills — community-style features off-mission (locked v1.1)
- Hard cost caps that block invocation — alerts only; user owns the budget decision (locked v1.1)
- Auto-pause / auto-remediation on alert — decisions queue handles human action; "alerts are sensors, not actuators" (ALRT-12 invariant, locked v1.1)
- Multi-channel notifications (Slack, email, SMS) — Telegram + decisions queue only (locked v1.1)
- 3+ way session comparison — layout collapses; Linear/Honeycomb/Langfuse all stop at 2 (locked v1.1)
- Sub-30s polling for skill panels — 30s lockstep with existing observability cadence; firehose covers live needs (locked v1.1)
- Auto-fetch of model pricing from Anthropic page — manual seed + doctor warning (locked v1.1)
- SLO / error budget tracking — threshold alerts cover the legitimate single-user need (locked v1.1)
- Per-skill alert message templates — single plain-text format (locked v1.1)
- Saved-comparison bookmarks — URL state is sufficient (locked v1.1)
- Raw LLM message diff in comparison — privacy-leaky and visually overwhelming (CMPR-05 invariant, locked v1.1)
- Post-hoc annotation / tagging of OTEL events — events are immutable (locked v1.1)
- Cost stamping at ingest time — read-time only; `/v1/logs` MUST always return 200 (locked v1.1)
- Cost stored as $ in DB — tokens stored, $ computed at read time; pricing edits self-correct historical totals (locked v1.1)
- ALRT-13 as parallel detector function — extend `evaluate_anomaly`; never add a sibling or third `kind` (locked v1.2)
- ALRT-14 fallback rule on hallucination — return `None`; never ship a "best-guess" AlertRule (locked v1.2)
- Raw `cwd` as project grouping key — must use `project_key` (sha1 hash) to prevent cardinality blowup and path leakage (locked v1.2)
- New top-level routes added wholesale per milestone — v1.2 was depth, not breadth; sole new route was `/cost` (locked v1.2); v1.3 honored this — zero new top-level routes; surface redesign happened entirely inside existing routes
- New external dependencies (numpy, scipy, pandas, instructor, date-fns) added without explicit STACK research justification — v1.2 STACK research confirmed zero new deps needed (locked v1.2); v1.3 added 6 frontend deps at exact pins after explicit STACK research per phase (Phase 24: 2 Radix; Phase 26: sonner/react-day-picker/date-fns; Phase 28: react-resizable-panels — `date-fns` moved from "out-of-scope without justification" to "in-scope with Phase 26 STACK research justification")
- APPEND-ONLY `validateSearch` is the absolute invariant — TanStack route file renames, parent layout insertion, non-additive `validateSearch` changes are FORBIDDEN; every new search param defaults to `undefined`; enforced by `tests/test_url_contract.py` bidirectional gate + `docs/url-contract.md` doc⇄route parity (Pitfall 13 locked v1.3)
- Density tokens scoped to subtree instead of `:root` — Radix Portal cascade requirement (locked v1.3)
- All Sheet/Popover/DropdownMenu content rendered without Radix Portal — bare positioning leaks across overflow ancestors (locked v1.3)
- Density toggle re-renders React tree — POLI-11 zero-rerender invariant; `DensityProvider` must remain NOT-a-React-Context (locked v1.3)
- `BoundedPanelCard` opt-out via `bounded={false}` removed — backward compatibility for legacy "scroll whole page" behavior must stay; never mass-flip to opt-out (locked v1.3)
- Saved view `state_json` schema validated at backend — must remain opaque to backend; schema validation lives in route's `validateSearch` on read (locked v1.3)
- `data-testid` without registry entry — Playwright selector stability invariant; `cmc/testid-registry-only` ESLint rule enforces (locked v1.3)
- More than 50 saved views per route OR more than 50 recent ad-hoc states — bounded localStorage growth + bounded backend table size (locked v1.3)
- Tailwind CSS migration — multi-week migration; conflicts with established `cmc-*` BEM CSS-variable system (locked v1.3)
- `@shadcn/ui` adoption — not present in repo; would require Tailwind first (anti-pattern); use raw `@radix-ui/*` primitives directly (locked v1.3)
- `react-grid-layout` (full 2D drag-resize grid) — React 19.2 compat broken (Issue #2045 open); single-user ROI questionable; show/hide + 1D reorder + split-pane covers expected need (deferred v1.3 → revisit when issue resolves)
- `dnd-kit` for layout drag — stale (last published 2024-12-05); HTML5 drag API + react-resizable-panels suffice for 1D reorder + split-pane (locked v1.3)
- Per-panel time override — anti-feature; Honeycomb explicitly removed this; global time picker syncs all panels by design (locked v1.3)
- Auto-density-by-viewport-width — single-screen local context; would be noise, not signal (locked v1.3)
- 3+ way session compare — no reference product ships >2-way; layout collapses below 1024px; value-per-pane drops (locked v1.3, was already locked v1.1)
- NL fallback for Cmd+K commands — hard-validated commands only; mirrors v1.2 ALRT-14 invariant ("return None on hallucination, no fallback") (locked v1.3)
- TDBT-03 Queue UX (NL composer 503 path) — V11 collapsed-failure-mode lock preserved verbatim; non-specific copy + Retry button is the entire surface (locked v1.3 per LOCKED OPERATOR DECISION 3)

(Removed from out-of-scope at v1.1 ship: ACTV-04 functional TopSkills panel and SKLP-02 functional SkillCostCard — both reactivated by Phase 14 once the OTEL spike confirmed the literal `claude_code.skill_activated` event shape.)
(Re-affirmed at v1.3 ship: cost stored as $ in DB and cost stamping at ingest time remain hard-locked — the v1.3 surface redesign added Phase 27 `CompareToggle` URL round-trip without violating the read-time invariant; client-side prior-period slicing on `CostByProjectCard` was the natural escape path when backend bucketed support is absent.)

## Context

**v1.0 shipped 2026-04-28** at git `a771a0a` — 4-day milestone, 11 phases (9 base + 2 audit gap-closure), 47 plans, 745 files changed, 172,853 insertions, ~39,800 LOC. Test suites green at close: 388+ backend + 234+ frontend + 6 Playwright e2e specs. Visual quality bar approved by user at Phases 5/6/7 close-outs.

**v1.1 shipped 2026-05-05** at git `af6d308` — 4-day milestone, 6 phases (12–17), 28 plans, 666 files changed vs v1.0, +81,397 / -13,435 lines. ~56,232 LOC at close. Test suites green at close: 552 backend + 292 frontend + 8 Playwright e2e specs. Audit verified 41/41 requirements + 6/6 phases + 9/9 integration + 6/6 flows.

**v1.2 shipped 2026-05-09** at git `f00d349` — 4-day milestone, 6 phases (18–23), 22 plans, 178 files changed vs v1.1, +31,281 / -2,375 lines. ~62,883 LOC at close. Test suites green at close: 661 backend + 326 frontend + 13 Playwright e2e specs. Audit verified 12/12 active requirements + 1/1 honestly deferred (SKLP-11 → v1.3) + 6/6 phases + 12/12 integration + 5/5 flows. Spike-gated phase pattern (Phase 22) validated for the first time — feasibility branch resolved NO with verbatim sqlite3 evidence and Phase 23 began on schedule.

**v1.3 shipped 2026-05-17** at git `1614f4d` — 8-day milestone, 5 phases (24–28), 42 plans, 994 files changed vs v1.2, +177,800 / -7,268 lines. ~87,531 LOC at close (~41,187 Python + ~46,344 TypeScript/TSX). Test suites green at close: 690 backend + 754 frontend + 320 Playwright e2e tests in 19 spec files (vs v1.2 baseline 661/326/13 — frontend vitest +428 reflects a deliberate pattern-shift toward dense unit coverage; Playwright +307 reflects the new visual checkpoint + axe + portal containment + URL contract + Phase 26 v13-time-picker + Phase 28 v13-layout suites). Lighthouse 9/9 PASS at median (LCP 559-586ms, CLS 0-0.003, performance 1.0); axe 0 phase-attributable violations across 13 close-gate scans via PHASE_24..28 NET_CLASS_MARKERS inversion filter; portal containment 7/7 PASS; URL contract pytest 2/2 PASS throughout. Visual capture matrix: 138 PNGs total across 5 phase close gates (36+30+30+24+18). Audit verified 45/45 active requirements + 5/5 phases + 6/7 integration wiring claims (1 documentation WARNING, no functional break) + 4/5 E2E flows complete + 1 documented Accepted Exception (TIME-04 DeltaPill column on `/cost` — backend bucketed endpoint deferred to v1.4+). One Alembic migration (`0004_saved_views`); zero new top-level routes; 6 new runtime frontend deps at exact pins; zero new Python deps. ResponsiveContainer count reduced 26 → 8 (Phase 26 consolidation) and held across Phases 27 + 28.

The user already runs a version of this dashboard daily; v1.0 is a from-scratch rebuild as the reference implementation, v1.1 deepened the skills/cost/alerts/compare lanes to the same quality bar, v1.2 differentiated each lane (per-project breakdown, deltas, badges, forecast, anomaly detection, NL alert authoring, per-skill compare deltas, Cmd+K compare-with-previous), and v1.3 rebuilt every visible surface around dashboard-product conventions (Honeycomb/Datadog/PostHog/Grafana family) without breaking a single URL, API contract, or test suite. The companion guide (`build-your-own-dashboard-guide.html`) positions it as a "build your own" prompt that produces a working clone — externally maintained outside this repo.

**Data sources are already on disk:**

- Session JSONLs at `~/.claude/projects/<project-hash>/<session-id>.jsonl` — one per session, line-delimited JSON events
- OTEL telemetry via `CLAUDE_CODE_ENABLE_TELEMETRY=1` pointed at the dashboard's `/v1/logs` and `/v1/metrics` endpoints (cache TTL split, `attrs_skill_name` indexed column landed v1.1)

**FastAPI chassis foundation (validated at v1.0 + v1.1 + v1.2):**
The backend follows patterns from the user's `fastapi-chassis` repo: app factory with builder pattern, Pydantic v2 `BaseSettings` for configuration, lifespan context manager for resource lifecycle, structured logging with request context, and middleware stack ordering. Adapted for this project's needs (SQLAlchemy 2.0 async + SQLModel instead of the chassis's plain stack, SQLite-only, no auth layer). v1.1 added the `cmc.pricing` lifespan auto-seed and Alembic migration 0002 (auto-applied via `command.upgrade(alembic_cfg, "head")` in `lifespan.py:98-100`). v1.2 added Alembic migration 0003 (`project_key` VARCHAR(12) on `sessions`, indexed, Python-loop `realpath` backfill — migration inlines sha1[:12] logic for runnability against historical revisions) and the `cmc.core.time::now_utc` centralized naive-UTC helper across 22 sites.

**Frontend is pre-built:**
Vite builds to `frontend/dist/` which FastAPI serves as static files (SPA mount registered AFTER routers per Phase 1 Pitfall 8). No SSR. React Query polls at locked cadences (5s for decisions, 10s for inbox, 30s for most observability data including alerts) — locked in `lib/queries.ts`; v1.3 added `AutoRefreshController` zero-render effect firing `queryClient.invalidateQueries` on `isTimeAnchoredKey` predicate so the global `TimePicker`'s `RefreshDropdown` (off/30s/1m/5m) drives time-anchored panel re-anchors without a separate polling cadence. TanStack Router provides file-based routing with v1.0 base pages (Command, Activity, Skills), v1.1 additions (`/skills/$name` per-skill detail, `/alerts` page, `/sessions/compare?a=&b=` deep-linkable compare), v1.2 additions (`/cost` dashboard route hosting `CostForecastCard` + `CostByProjectCard`; `SkillProjectsTable` panel mount on `/skills/$name`; `ActiveSessionContext` for cross-Sheet active-session signal supporting Cmd+K compare-with-previous), and v1.3 surface-level additions across every route (collapsible sidebar shell with Recently Visited + Pinned saved views, `AppShellHeader` with global `TimePicker` + `RefreshDropdown` + density toggle + theme toggle + `SavedViewMenu` chrome, APPEND-ONLY `validateSearch` on every route per Pitfall 13 lock with `time_from`/`time_to`/`compare_panels`/`hidden_panels`/`panel_order` + `split_sizes` on `/sessions/compare`, `useRouteRange` + `useRouteRangeVocab<V>` URL→Range bridges, `useLayoutState` hook for show/hide + reorder + split-pane state). URL is the single persistence layer for navigation/layout/range/density-anchored state (URL-as-broadcast-bus pattern verified end-to-end); localStorage holds only sidebar collapse, density, theme, pin order, recently-visited ring, and recent ad-hoc states.

**v1.3 saved views infrastructure:**
Alembic migration `0004_saved_views` ships a `saved_views` table (id/name/description/route/state_json/schema_version/created_at/updated_at; UNIQUE(route, name); 50-per-route cap enforced at API layer). Five CRUD endpoints (`GET /api/views?route=`, `POST`, `GET /{id}`, `PATCH`, `DELETE`); `state_json` is opaque to backend — schema validation lives in route's `validateSearch` on read. Phase 28 layout state (hidden_panels/panel_order/split_sizes) piggybacks on this `state_json` via the existing Phase 25 auto-capture pipeline — `SaveViewDialog` UNTOUCHED across all 4 LAYO requirements per Pitfall 3 lock. `DefaultViewLoader` zero-render effect applies per-route default's `state_json` via `navigate({to, search, replace:true})` when entering a route with empty search (only `schemaVersion`) per Pitfall 8 deep-link-wins lock.

**v1.3 quality-gate infrastructure (POLI-09..14 — locked):**
Every phase closes behind: (1) operator-driven visual checkpoint matrix at `.planning/phases/{N}/{N}-VISUAL-CHECK.md` with 9 required sections (front matter, capture commands, captured PNGs directory + count, ROADMAP SC mapping, REQ-ID closure, automated evidence summary, visual capture verdict matrix, Accepted Exceptions, operator verdict line); (2) axe-core gate with PHASE_24..28 NET_CLASS_MARKERS inversion filter (each phase adds only its own attributable class markers to the violation filter — v1.2-baseline contrast classes flow through Phase 25's filter into Phase 26/27 rebalance windows); (3) Lighthouse 9/9 CWV (LCP/CLS/perf) with `lighthouserc.json` 3-URL gate; (4) DOM-identity zero-rerender probe (3/3 chart + 15/15 card markers preserved across 2 density flips — substitute for React DevTools profiler per Plan 24-02 architectural backing of no-React-Context `DensityProvider`); (5) portal containment (7/7 PASS across 4 portal-mounting surfaces: Sheet/Popover/DropdownMenu/Cmd+K); (6) URL contract pytest `tests/test_url_contract.py` bidirectional gate against `docs/url-contract.md` (2/2 PASS throughout); (7) `pnpm exec vite build` clean with chunk size deltas tracked against per-phase budgets; (8) `pnpm tsc --noEmit` + `pnpm exec eslint` (custom rules `cmc/testid-registry-only` + `cmc/no-raw-z-index`) clean; (9) `docs/affordance-checklist.md` (16 keyboard/interaction affordances after Phase 26 added Cmd+Shift+C/V row 16); (10) ResponsiveContainer count delta tracked (locked at 8 since Phase 26 consolidation reduced from 26).

**Database stack (locked Phase 1, validated v1.0 + v1.1 + v1.2):**
SQLAlchemy 2.0 async + SQLModel + Alembic. SQLModel classes (one per resource) define all tables (15 in v1.0; +pricing/alert_rules/alert_state in v1.1 migration 0002; +sessions.project_key indexed column in v1.2 migration 0003). The async engine uses `sqlite+aiosqlite://` with WAL mode, foreign_keys=ON, and busy_timeout pragmas applied at connect time via a pragma listener. Schema management is Alembic (`0001_initial.py` + `0002_v1_1_alerts_and_skills.py` + `0003_project_key.py`). v1.1 ingest writes via `INSERT ... ON CONFLICT DO NOTHING` for idempotent skill-event capture. v1.2 adds `_SESSION_MUTABLE_COLS` includes `project_key` so cwd corrections after first sync re-key correctly (Pitfall 9).

**Dispatcher is a separate process:**
Mission Control runs via launchd (120s heartbeat). It claims pending tasks atomically, materializes scheduled tasks, runs `claude -p` (classic) or `claude` (stream) as subprocesses, parses DECISION:/INBOX: markers, routes unassigned tasks to skills via Haiku, and gates execution on a per-skill autonomy level. v1.1 added `cmc/dispatcher/alerts.py::evaluate_alerts(db)` invoked once per tick after `stamp_tick` and after the e-stop early-return (try/except isolated so alert failures never kill the cycle).

**Cost engine (v1.1):**
`cmc.pricing.compute_cost(model, input, output, cache_read, cache_create_5m, cache_create_1h) -> Decimal` is the single source of truth. Read-time computation only — `/v1/logs` always returns 200, never blocking on price lookups. The `pricing` table uses `effective_from`/`effective_until` so adding/correcting rates self-corrects historical totals. 5 SKUs seeded from `data/pricing.json` at lifespan boot: `claude-opus-4-7`, `claude-opus-4-7[1m]`, `claude-sonnet-4-6`, `claude-sonnet-4-6[1m]`, `claude-haiku-4-5`.

**Alert engine (v1.1 + v1.2):**
Hysteresis-aware threshold + EWMA z-score + sliding-window rolling-mean-±-stddev detector (stdlib `math` only — Welford variance recurrence reused verbatim). Stable `dedup_key = f"alert:{rule_id}:{scope_key}"` reuses `notification_log` UNIQUE(kind, entity_id, chat_id) constraint and `decisions` partial-unique on dedup_key WHERE status='pending' — no new state machine. Alerts emit decisions only; the user gates action via existing autonomy controls (ALRT-12 invariant). Auto-resolve writes `decisions.status='answered'` with `answered_by='alert_engine'`. 3 v1.0 metrics in `_SCOPE_EXTRACTORS` table: `cost_usd_24h` / `skill_p95_latency_ms` / `dispatcher_failed_tasks_5m`. v1.2 adds `params_json.window_kind: "ewma" | "sliding"` discriminator inside the single `evaluate_anomaly` function (no parallel detector; no third `kind` value — pinned by AST static-import test) and Haiku-backed natural-language rule authoring via `cmc/alerts/nl_parser.py` (lazy `AsyncAnthropic`, `_SCOPE_EXTRACTORS.keys()` injected verbatim into system prompt, hard-validates via `is_known_metric()`, returns `None` on hallucination — never ships a fallback rule). `GET /api/alerts/metrics` serves the dynamic vocabulary; `test_alerts_metrics_sync.py` is the cross-language drift guard between backend `_SCOPE_EXTRACTORS` and the frontend `FALLBACK_KNOWN_METRICS` constant.

**Cost engine extensions (v1.2):**
`cmc/cost/forecast.py` ships a Decimal-only OLS module + `GET /api/cost/forecast` endpoint with `CostForecastResponse`. Returns `insufficient_data` when `days_elapsed < 7` (UI renders explanatory message, not a misleading number); `partial_month_bias` server flag drives the week-1 banner; baseline excludes today. Per-project cost card lives on the new `/cost` route alongside the forecast card; `_BREAKDOWN_BY_PROJECT_SQL` was refactored to GROUP BY `s.project_key` + `WHERE s.project_key != ''` (no new endpoint — UI-only addition, consumes Phase 19's `0003_project_key` migration).

**Known v1.3 outstanding human-verify items (non-blocking, operational):**

- Apply Alembic migration `0004_saved_views` to live `data/cmc.db` (auto-applies on next `cmc start` via lifespan)
- 13 Accepted Exceptions documented as v1.4+ candidates with explicit unblock conditions — see `milestones/v1.3-MILESTONE-AUDIT.md` Tech Debt Summary
- No standalone `28-VERIFICATION.md` from gsd-verifier — substituted by `28-VISUAL-CHECK.md` + operator-signed `28-06-SUMMARY.md`. Functionally equivalent; artifact-shape gap only

**v1.3 closed v1.2 carried tech debt:**

- ✓ TDBT-01: Phase 23 frontend compare picker `cwd`-proxy upgraded to authoritative `project_key` (Phase 27 — `SessionListItemFull` + `SessionCompareSide` wire shapes now expose `project_key`; `scopeCwd` source-grep = 0 after Plan 27-03)
- ✓ TDBT-02: `KNOWN_METRICS` frontend fallback constant DELETED + drift guard rewritten from build-time grep (`test_alerts_metrics_sync.py` DELETED) to runtime API-contract test (`test_alerts_metrics_contract.py` CREATED) per LOCKED OPERATOR DECISION 2 (Phase 27)
- ✓ TDBT-03: Phase 21-03 NL composer 503 silent error replaced with honest non-specific copy + Retry button + `hadError` latched-state across retry's pending window; V11 collapsed-failure-mode lock preserved verbatim — backend route UNCHANGED, Queue UX intentionally NOT shipped per LOCKED OPERATOR DECISION 3 (Phase 27)

**Known v1.3 tech debt (carried forward to v1.4+):**

- `CostByProjectCard` DeltaPill column not rendered — CompareToggle URL round-trip ships but client-side prior-period slicing impossible without backend bucketed-cost endpoint (Phase 27 Accepted Exception #2; backend extension is the unblock condition)
- `CostForecastCard` MTD-only — SC#2 "re-query" satisfied as "re-render"; literal range-shifted re-query requires backend `range` param on `/api/cost/forecast` (Phase 27 Accepted Exception #1)
- `SkillLatencySnapshot` stays on route-local `?range=` path — operator-locked decision documented inline at `skills_.$name.tsx:242-246`; lift when SkillLatencySnapshot extracted to own component (Phase 27 Accepted Exception #5)
- `DefaultViewLoader` v1 limitation on `/skills/$name` — `validateSearch` always populates `range=14d`, so any URL search is non-empty and the Pitfall-8 deep-link-wins lock short-circuits auto-apply (Phase 25 Accepted Exception (a))
- 8 v1.2-baseline contrast/aria carry-overs — Pitfall 7 rebalance window deferred to v1.4+ (Phase 25)
- Same-tab `PinnedViewsSection` pin-write requires page reload (`PinnedViewsSection` reads localStorage on render; same-tab writes don't broadcast `storage` event) — deferred to v1.4+ via custom event or Zustand-style store
- `/skills/$name` show/hide deferred to v1.4 — single-column-stack route out of `PANEL_REGISTRY` (Phase 28 Accepted Exception #1)
- LAYO-05 (full 2D grid via `react-grid-layout`) deferred to v1.4+ — blocked by GitHub Issue #2045 (React 19.2 key-prop warnings); show/hide + 1D reorder + split-pane cover v1.3 success criteria (Phase 28 Accepted Exception #2)
- 6 Plan 28-05 Rule-1 deviations carried over: v4 Layout shape `{[panelId]: number}` not `number[]`; Separator data-testid override via id prop; Panel sizes as STRINGS '50%'; data-panel boolean marker switched to `#side-a` id selector; URL-encoded `%3A`/`%2C` regex acceptance; eslint-disable for mock-internal `rrp-*` testids
- 3 Plan 28-04 Rule-1 deviations carried over: `data-panel-id` collision (renamed to `data-drag-wrap-id`); `display:contents` grid collision (switched to `position:relative` + absolute grip overlay); `/alerts` registry vocabulary fix (alert-events-list 'main' → 'below')
- REQUIREMENTS.md line 12 dep-count constraint text says "3 baseline deps" but 6 runtime deps were actually added (Phase 24: 2 Radix; Phase 26: sonner+react-day-picker+date-fns; Phase 28: react-resizable-panels). Documentation inaccuracy only; zero Python deps still satisfied. Suggest update at v1.4 milestone start

**Known v1.2 tech debt carried forward (NOT closed by v1.3 — informational for v1.4 planning):**

- REQUIREMENTS.md doc-drift: line 30 (v1.2 archive) says CMPR-07 endpoint resolves "most-recent same-cwd session" — code uses `project_key` correctly; only the requirements wording lagged (audit-noted)
- 3 `_utcnow_naive()` local helpers in `cmc/dispatcher/alerts.py:73`, `cmc/api/routes/alerts.py:77`, `tests/test_doctor.py:20` — duplicate `now_utc()` logic but use `datetime.now(UTC).replace(tzinfo=None)` (NOT deprecated `datetime.utcnow`). No POLI-06 violation; stylistic redundancy only
- `'localtime'` modifier in pre-existing sparkline SQL (`_USAGE_TOP_SQL`, `_COST_TREND_*` at skills.py:444, 752, 773) — display-only day bucketing, NOT threshold arithmetic. DST test confirms badge classification is unaffected
- Cosmetic: `TO_BE_UPDATED_BY_SUMMARY` placeholder in `22-01-SPIKE-FINDINGS.md` Preamble metadata field (line 26). The SUMMARY recorded the commit (`07abcfa`) but did not write it back into SPIKE-FINDINGS.md. Cosmetic; commit SHA is verifiable from `git log`

**Carried v1.0 tech debt:**

- `answer_poll` uses 2s DB polling rather than file-watch (works for single-host)
- No CI gate for `npm run test:e2e` in v1 (Q6 LOCKED — manual gate by design)
- `FollowUpPump` queue keyed on `task_id` but dashboard `/api/sessions/live/{sid}/message` writes session_id-keyed queue
- `reply_inbox` callback is NOOP at dash_router (Telegram Reply button is UX dead-end)
- Orphan `api.ts` client functions (cosmetic)
- `test_phase4_estop` pre-existing flake

## Constraints

- **Platform**: macOS only (launchd, JSONL paths, install script) — Linux deferred to v2 (PLAT-01)
- **Python**: 3.13+ (chassis patterns)
- **Runtime**: Single-machine, single-user, localhost:8765
- **Database**: SQLite with WAL mode, single `.db` file in `data/`
- **ORM**: SQLAlchemy 2.0 async + SQLModel; raw SQL only when stepping outside the ORM is unavoidable. `aiosqlite` is the async driver under the hood.
- **No external services**: No cloud, no accounts, no outbound network (except optional Telegram)
- **Frontend build**: Pre-built `frontend/dist/` served as static, no SSR
- **Quality bar**: Linear / Raycast / Vercel level — dense signal, dark theme, dialed-in typography, tasteful motion, production-grade polish (validated at v1.0 + v1.1)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| FastAPI chassis patterns (app factory, builder, settings, lifespan) | User's established production patterns | ✓ Good — held up across 17 phases; no rework needed |
| SQLAlchemy 2.0 async + SQLModel + Alembic | Type-safe queries + versioned migrations + aiosqlite async | ✓ Good — type-safe queries paid off across 60+ endpoints; no schema regressions across 2 migrations |
| Python 3.13 | User preference; chassis targets 3.13+ | ✓ Good — only env-only test flake on 3.11 (pinned ≥3.13) |
| SQLite single-file with WAL | Local-only, no multi-server, excellent read concurrency | ✓ Good — handled real-world ingest at v1.0 close + v1.1 alert/skill workloads |
| PID files for emergency stop targeting | macOS 12+ restricts env disclosure; PID files are reliable | ✓ Good — ESTOP-01..04 ship with ps-validation |
| TanStack Router (file-based) + React Query (30s poll) | Modern routing + efficient data fetching without WebSocket complexity | ✓ Good — locked polling cadences worked across 26+ panels (21 v1.0 + 5 v1.1) |
| Launchd for daemon management | macOS-native, no third-party dependency | ✓ Good — 4 launchd plists ship in install.sh |
| SSE for firehose, polling everywhere else | Simpler than WebSockets, sufficient for single-user local | ✓ Good — `useFirehose` extended to skill_activated stream in v1.1 |
| Plain text Telegram messages (no parse_mode) | DB-sourced content has unescaped backticks | ✓ Good — Pitfall P3 enforced by `inspect.signature()` grep test in 09-01 + extended to alert paths in v1.1 (POLI-02) |
| `cmc` CLI shim (renamed from `cc`) | Avoids `/usr/bin/cc` (clang) collision | ✓ Good — clean install verified end-to-end |
| 2-phase audit gap closure (Phases 10–11) over deferred-items list | Audit found integration + flow gaps — close in-milestone | ✓ Good — re-audit returned 148/148 + 8/8 + 8/8 |
| **Cost stored as tokens, $ computed at read time** (v1.1) | Pricing changes self-correct historical totals via window logic; `/v1/logs` MUST always return 200 (Pitfall 4); never store $ in derived tables | ✓ Good — 5 SKUs seeded from `data/pricing.json`; 41/41 v1.1 reqs shipped without backfill events |
| **Single Alembic migration 0002 bundling skills + alerts + cache TTL** (v1.1) | Avoids mid-milestone migration ordering issues across Phases 13/15 | ✓ Good — ephemeral-DB tests prove BUG-B backfill correctness; live-DB apply is operational on next `cmc start` |
| **Alerts emit decisions only — ALRT-12 invariant** (v1.1) | "Sensors, not actuators"; user gates action via existing autonomy controls; alert engine NEVER imports `cmc.dispatcher.tasks` | ✓ Good — ast-based static-import audit test in dispatcher suite enforces invariant |
| **Stable `dedup_key = f"alert:{rule_id}:{scope_key}"`** (v1.1) | Reuses `notification_log` UNIQUE + `decisions` partial-unique; no new state machine | ✓ Good — POLI-04 integration test asserts exactly 1 decision + 1 notification_log per firing condition |
| **`UTCDatetime` PlainSerializer with `when_used='json'` gate** (v1.1) | Pydantic v2 default serializer omitted Z suffix → JS `new Date(naiveISO)` interpreted as LOCAL time → "in 4 hours" UI bug | ✓ Good — project-wide drop-in for 8 schemas / 37 datetime fields; native datetime preserved for SQLAlchemy INSERT/UPDATE |
| **`cmc/telegram/callback_verbs.py` central StrEnum** (v1.1) | Centralized verb dispatch; refactored `dash_router.py` + `handler.py` to use enum | ✓ Good — POLI-03 round-trip test parametrizes over enum; sha256[:8] keeps callback_data under 64-byte cap |
| **Hand-written `validateSearch` UUID validator** (v1.1) | First `validateSearch` use in codebase; deliberately avoided pulling in zod/valibot for one regex check | ✓ Good — sets the precedent; `routes/sessions_.compare.tsx` uses UUID_RE strict check + typeof string |
| **TanStack parent-layout opt-out via trailing-underscore filenames** (v1.1) | `skills.tsx` and `sessions.tsx` (when added) render their own page bodies without `<Outlet/>` so standard nested-file syntax breaks detail mounting | ✓ Good — `skills_.$name.tsx` and `sessions_.compare.tsx` keep public URLs unchanged; pattern documented for future deep-link routes |
| **CMPR-04 over-cap = render branch, not error branch** (v1.1) | HTTP 200 + `over_cap=true` + empty `tool_counts={}` so client templates EmptyState while KPIs survive | ✓ Good — single render branch the client templates as fallback, NOT 413/422 refusal |
| **CMPR-05 tabular-only compare** (v1.1) | No react-diff-viewer / jsdiff; metadata only; raw LLM message diff is privacy-leaky and visually overwhelming | ✓ Good — vitest + DevTools Sources scan (0/43 scripts match diff/jsdiff) hard-locks the constraint |
| **Wave-1/wave-2 single-writer convention for REQUIREMENTS.md** (v1.1) | Phase 16-04 + 17-06 serialize REQUIREMENTS.md edits behind on-disk verified artifacts from parallel wave-1 plans | ✓ Good — eliminates last-write-wins corruption risk that motivated the wave-1/wave-2 split (planner-checker Blocker 2) |
| **`cmc/core/time::now_utc` is the canonical naive-UTC factory** (v1.2) | Pydantic v2 deprecated `datetime.utcnow`; SQLite-compatible naive datetime is the project-wide convention; centralized helper enables single-line bisect-friendly mechanical sweep | ✓ Good — Phase 18 Plan 02 commit `c3d792f` swept 22 sites in one atomic commit; ~1429 deprecation warnings → 0; `ruff --select UP` + `git grep` zero verify gates locked the structural invariant |
| **`project_key = sha1[:12](realpath(cwd))` is the project-identity normalization** (v1.2) | Raw `cwd` causes cardinality blowup (every realpath variant counts as a different project) AND leaks filesystem paths through any per-project endpoint; sha1 hash + truncation is bounded, normalized, and path-leakage-safe | ✓ Good — migration `0003_project_key` shipped with Python-loop backfill; SKLP-08/09/10 + ANLY-07 + CMPR-07 all consume `project_key`; structural no-path-leakage tests at backend (response shape) AND frontend (runtime DOM regex) |
| **Migration 0003 inlines sha1[:12] backfill instead of importing `compute_project_key`** (v1.2) | Alembic migrations must remain runnable against historical revisions even if `cmc.core.project_key` is renamed/moved/restructured. Mirrors how 0002 inlined `json_extract` for session_id backfill | ✓ Good — `test_matches_inline_sha1_logic` in `test_core_project_key.py` pins formula equality so helper and migration cannot silently diverge |
| **Empty-string sentinel for `compute_project_key(None)` and `compute_project_key('')`** (v1.2) | `sessions.project_key` column is NOT NULL; the empty string is the natural "no canonical project" marker; queries naturally exclude `WHERE project_key != ''`. Mirrors COALESCE pattern in cost.py:168 | ✓ Good — never raises; ANLY-07 GROUP BY excludes empty string at the query level |
| **`_resolve_alpha` helper inside `evaluate_anomaly` (single function, no parallel detector)** (v1.2) | ALRT-13's PITFALLS-locked invariant: extending the existing function via `params_json.window_kind` discriminator preserves call-site clarity and prevents two anomaly detectors from drifting; AST static-import test pins the single-detector invariant | ✓ Good — Welford variance recurrence reused verbatim; sliding=`1/N`, ewma=`2/(N+1)` formulas locked in `_resolve_alpha`; warmup-boundary returns `INSUFFICIENT` (semantically correct — no baseline yet) |
| **NL alert parser returns `None` on hallucination — no fallback rule** (v1.2) | ALRT-14's PITFALLS-locked invariant: shipping a "best-guess" AlertRule on parser hallucination would silently install a wrong threshold/scope. Hard-validation via `is_known_metric()` against `_SCOPE_EXTRACTORS.keys()` is the only acceptable contract | ✓ Good — `cmc/alerts/nl_parser.py` returns `None`; `POST /api/alerts/parse-nl` returns 503 on credentials missing; UI surfaces honest "could not parse" message instead of silent rule install |
| **Decimal-only OLS in `cmc/cost/forecast.py` — no numpy/scipy** (v1.2) | Preserves the v1.1 "no float drift" cost invariant; stdlib-only avoids dependency creep; volume of math is small enough that numpy doesn't pay for itself | ✓ Good — 26 unit + 5 integration tests prove `insufficient_data` guard, `partial_month_bias` flag accuracy, day-boundary correctness; zero new external dependencies in v1.2 |
| **`/cost` is the only new top-level route in v1.2 — sole exception to "extend existing pages"** (v1.2) | Forecast card + per-project card needed a hosting page; existing `/skills/$name` and `/sessions/compare` already have crowded layouts; cost is the lane that earned its own dashboard | ✓ Good — NavBar Cost link added; route mounts both v1.2 cost cards; pattern documented for future "lane that earned a dashboard" promotions |
| **CMPR-06 single-rollup-SQL-per-side preserves CMPR-04's 9-SQL-per-request budget** (v1.2) | Per-skill latency dict via N+1 query pattern would have blown the budget; single rollup with GROUP BY skill_name + low-sample flag computation in Python keeps the budget intact | ✓ Good — per-request SQL counter assertion in tests; 200-with-flag over-cap fallback still holds; per-skill section suppressed entirely when low-sample on either side |
| **`ActiveSessionContext` lives in React Context, not a route parameter** (v1.2) | CMPR-07 needs a cross-Sheet active-session signal (LiveSessionsCard + SkillRunsTable both open Sheets); URL-driven activeSessionId source is `/sessions/compare?a=<sid>` per D-10; inventing routes for Sheets would balloon the routing surface | ✓ Good — both Sheets opt-in to `ActiveSessionContext` for Cmd+K eligibility; URL stays single source of truth for compare state |
| **`feature-component-element` kebab-case path-style `data-testid` convention, decorate-on-collision-only** (v1.2) | Pre-decorating every component with testids is anti-pattern (maintenance burden, no signal); decorate only when Playwright strict mode actually collides; convention makes testids predictable and grep-able | ✓ Good — POLI-08 fixed exactly one collision (`schedule-composer-name`); convention documented in `frontend/tests/e2e/README.md` (NOT CONTRIBUTING.md — rule lives next to the tooling that enforces it) |
| **Spike-gated phase pattern: mandatory data-availability spike with binary YES/NO outcome banner** (v1.2) | Phase 22 SKLP-11 — feasibility had to be proven before stacking 3 plans of implementation work on it. Spike outcome committed in `22-01-SPIKE-FINDINGS.md` with `## Outcome: NO — descope SKLP-11 to v1.3` banner. Descope plan was authored in advance so phase closes cleanly on either branch | ✓ Good — first spike-gated phase in the project; resolved NO with verbatim sqlite3 evidence; Phase 23 unblocked on schedule. Pattern reusable for future requirements with uncertain data foundations |
| **`BASELINE.md` lives in the phase directory, not at `.planning/` root, with verifier rules embedded as prose-with-bounds** (v1.2) | Phase 18 Plan 05 — a future "Phase 24 Polish v2" or similar would write its own baseline in *its* phase directory rather than mutating Phase 18's frozen baseline. Verifier rules embedded inside the same file (single source of truth) | ✓ Good — pytest 566 / vitest 293 / Playwright 7+1-skipped + warning deltas tracked; downstream phases (19, 23) compared cleanly against this baseline at close |
| **APPEND-ONLY `validateSearch` enforced by `tests/test_url_contract.py` + `docs/url-contract.md` bidirectional gate** (v1.3) | Pitfall 13 lock — TanStack route file renames, parent layout insertion, and non-additive `validateSearch` changes are FORBIDDEN; every new search param defaults to `undefined`; the milestone added 6 new search params across 6 routes without breaking a single existing URL | ✓ Good — 2/2 pytest PASS throughout milestone; zero broken URLs at v1.3 ship; Telegram deep-links + browser bookmarks across v1.0/v1.1/v1.2 surface area all continued working |
| **Density tokens scoped to `:root` (NOT subtree) so they cascade into Radix Portal** (v1.3) | Phase 24 — would have been a footgun if scoped to subtree; portal-rendered Sheets/Popovers would have rendered at default density. Locked invariant for v1.4+ | ✓ Good — Playwright fixture verifies cascade at runtime per documented happy-dom limitation |
| **`DensityProvider` is intentionally NOT a React Context** (v1.3) | Phase 24 — single `useEffect` re-applies `[data-density]` on `<html>` element for HMR safety; POLI-11 zero-rerender invariant locked architecturally instead of measured. DOM-identity zero-rerender probe substituted for React DevTools profiler at every phase close | ✓ Good — 3/3 chart + 15/15 card markers preserved across 2 density flips throughout milestone; ResponsiveContainer count delta 0 at every phase close |
| **All Sheet/Popover/DropdownMenu content goes through Radix Portal** (v1.3) | Phase 24 — `recharts` `ResponsiveContainer` transform creates new containing block for `position: fixed` descendants; Radix Portal escape hatch lands at document.body so density `:root` cascade still applies. Locked invariant | ✓ Good — portal containment 7/7 PASS across 4 portal-mounting surfaces (Sheet/Popover/DropdownMenu/Cmd+K); Phase 28 PanelHeaderMenu Radix DropdownMenu transitively covered by existing `cmc-dropdown` fixtures (Accepted Exception #4) |
| **`BoundedPanelCard` is opt-in via `bounded` prop — backward-compatible default** (v1.3) | Phase 24 — legacy "scroll the whole page" behavior preserved on un-migrated routes; flipped opt-in per-route during Phase 26 (`/`, `/activity`, `/sessions/compare`) and Phase 27 (`/skills`, `/skills/$name`, `/cost`, `/alerts`). Locked invariant: never mass-flip to opt-out | ✓ Good — zero broken routes during the multi-phase adoption sweep; `/skills/$name` heatmap and `OtelPanel` live SSE opted out cleanly |
| **Saved view `state_json` is opaque to backend; schema validation lives in route's `validateSearch` on read** (v1.3) | Phase 25 — backend never parses; frontend can extend search shape without backend migration; Phase 28 added 3 new search params (`hidden_panels`/`panel_order`/`split_sizes`) without touching `0004_saved_views` migration | ✓ Good — `SaveViewDialog` UNTOUCHED across Phase 28 per Pitfall 3 lock; git history confirms zero Phase 26/27/28 commits touched the dialog |
| **`SaveViewDialog` opaque-capture pipeline round-trips all 6 v1.3 search params** (v1.3) | Pitfall 3 lock — `time_from`/`time_to`/`compare_panels`/`hidden_panels`/`panel_order`/`split_sizes` all persist into `state_json` via existing Phase 25 auto-capture without any Phase 26/27/28 dialog edits | ✓ Good — Playwright round-trip Playwright in Plan 28-03 verifies hide → save view → navigate → reopen → panel stays hidden end-to-end |
| **URL is the single persistence layer for navigation/layout/range/density-anchored state** (v1.3) | Phase 26-28 — `useRouteRange` + `useRouteRangeVocab<V>` + `useLayoutState` all read/write URL search via `useRouterState` + `useNavigate` function-form; `RangeToggle` `persistKey` props dropped wholesale; localStorage holds only sidebar collapse, density, theme, pin order, recently-visited ring, and recent ad-hoc states | ✓ Good — URL-as-broadcast-bus pattern verified end-to-end: single URL write fans out to `ResetZoomButton` + Paused refresh + `TimePicker` absolute label without any React Context bridge or `EventTarget` plumbing |
| **`useRouteRangeVocab<V extends string>` ships alongside Phase 26's `useRouteRange` (ZERO-REFACTOR INVARIANT)** (v1.3) | Phase 27 Plan 01 — generic hook lands as a sibling instead of refactoring; 9 prior call sites stay byte-identical; pre-baked snappers `snapToSkillRange`/`snapToCostRange`/`snapToAlertRange` cover the 3 tail-route vocabularies | ✓ Good — `git diff --stat frontend/src/lib/time/useRouteRange.ts` empty after Phase 27 lands |
| **`project_key` is the authoritative project identity on wire shapes; `cwd` is the human-readable display label** (v1.3) | Phase 27 TDBT-01 — `SessionListItemFull` + `SessionCompareSide` gain additive required `project_key: str`; `ComparePicker` filter switches from `row.cwd === scopeCwd` to `row.project_key === scopeProjectKey`; description copy switches to "Showing sessions in the same project" (no 12-char hex leak) | ✓ Good — `scopeCwd` source-grep = 0, `scopeProjectKey` = 12 in `CommandPalette.tsx`; cwd realpath differences without sha1 collision now resolve correctly |
| **`KNOWN_METRICS` runtime API-contract test replaces build-time regex grep** (v1.3) | Phase 27 TDBT-02 LOCKED OPERATOR DECISION 2 — `test_alerts_metrics_sync.py` DELETED + `test_alerts_metrics_contract.py` CREATED with 2 async tests asserting `sorted(_SCOPE_EXTRACTORS.keys()) == sorted(GET /api/alerts/metrics → metrics)` | ✓ Good — cross-language drift now caught at API level, not source level; backend pytest 690/0/0 throughout |
| **V11 collapsed-failure-mode lock preserved verbatim across TDBT-03** (v1.3) | Phase 27 TDBT-03 LOCKED OPERATOR DECISION 3 — backend `/api/alerts/parse-nl` route UNCHANGED; Queue UX intentionally NOT shipped; non-specific copy + Retry button + `hadError` latched-state working around React Query's `isError→false` reset on next `mutate()` | ✓ Good — `git diff backend/cmc/api/routes/alerts.py` returns 0 lines; zero leaked terms ("credentials missing" / "Anthropic" / "API key" / "ANTHROPIC_API_KEY" all absent honoring V11 lock) |
| **Two-surface Reset Layout coverage (chrome-level + per-panel)** (v1.3) | Phase 28 LAYO-04 — `SavedViewMenu` Reset Layout DropdownMenu.Item handles "all panels hidden" corrupt-state lock-in escape (via `safeRouteSlug()` try/catch wrapping `normalizeRouteId` so it mounts on out-of-scope routes); `PanelHeaderMenu` Reset Layout item handles the normal per-panel case. Both surfaces destructure-delete the three layout keys (`hidden_panels`/`panel_order`/`split_sizes`) while preserving `time_from`/`time_to`/`compare_panels`/`range`/`a`/`b`/`schemaVersion` per Pitfall 11 | ✓ Good — Playwright LAYO-04 per-panel reset on `/cost` validates the destructuring-delete contract end-to-end; operator can always escape regardless of whether any panels remain visible |
| **`react-resizable-panels@4.11.0` v4 vocabulary lock (`Group/Panel/Separator/orientation`, NOT v0/v1 `PanelGroup/PanelResizeHandle/direction`)** (v1.3) | Phase 28 Pitfall 1 — grep gate enforces v4 vocab only; single new runtime dep this milestone; blocking-human npmjs.com legitimacy gate before install (maintainer bvaughn / weekly DLs 32M+ / no postinstall script / peer deps `react ^18 || ^19` compatible with React 19.2.5) | ✓ Good — installed at EXACT pin via Plan 28-05; bundle delta +10.4 KB gzipped on `SessionCompareView` chunk (≤15 KB budget); 6 documented Rule-1 deviations (v4 Layout shape `{[panelId]: number}` not `number[]`; Separator id-prop strategy; Panel STRING percentages not numeric pixels; etc.) |
| **Layout state piggybacks on saved-view `state_json` (no new DB table)** (v1.3) | Phase 28 — `hidden_panels`/`panel_order`/`split_sizes` are URL-only state; `useLayoutState` reads/writes URL search via `useRouterState` + `useNavigate` function-form; persistence into saved views happens through Phase 25's existing auto-capture pipeline. No new endpoint, no new migration, no new DB column | ✓ Good — Phase 28 backend pytest = Phase 27 close baseline (690/0/0 — zero backend changes expected); 4 LAYO requirements ship without touching `0004_saved_views` migration |
| **`PHASE_NN_NET_CLASS_MARKERS` axe inversion filter pattern** (v1.3) | Phase 24-28 — each phase adds only its own attributable class markers to the violation filter; v1.2-baseline contrast classes flow through Phase 25's filter into Phase 26/27 rebalance windows. Pattern enforces "phase ships clean against its own NEW surface" while honestly carrying pre-existing classes as Accepted Exceptions | ✓ Good — axe 0 phase-attributable violations across 13 close-gate scans throughout milestone; `violationTouchesPhaseNN` helper extended in Phase 28 to honor all four phases (25/26/27/28) |
| **Formal per-phase visual checkpoint (POLI-09) with 9-section operator-signed `VISUAL-CHECK.md`** (v1.3) | Phase 24 introduced; Phases 25/26/27/28 applied. Each phase ends with operator-driven Chrome DevTools MCP walkthrough against `http://localhost:5173`; live walkthrough is where verification-discovered Rule-1 fixes surface (Phase 26 `e838135`, Phase 27 `d76a95b` — Phase 28 cascade was clean) | ✓ Good — 138 PNGs total across milestone (36+30+30+24+18); operator verdict PASS at every phase close; Phase 28 substituted `28-VISUAL-CHECK.md` + operator-signed `28-06-SUMMARY.md` for missing standalone `28-VERIFICATION.md` artifact (functionally equivalent coverage; artifact-shape gap only) |
| **`sonner@2.0.7` is the toast library lock-in (Radix portal compat)** (v1.3) | Phase 26 Plan 01 ADR — chosen over `react-hot-toast` for Radix portal compatibility; `<Toaster>` mounted in `AppShell` as sibling of `<CommandPalette>` | ✓ Good — 4 toast call sites across TIME-03 (Cmd+Shift+C/V) + LAYO-04 (Reset Layout × 2 surfaces) with zero portal-clipping bugs |

---

*Last updated: 2026-05-17 after v1.3 Surface Redesign milestone shipped*
