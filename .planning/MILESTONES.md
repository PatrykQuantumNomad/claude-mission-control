# Milestones: Claude Mission Control

Reverse-chronological log of shipped milestones. Each entry is a sentence-length record; full archives live under `.planning/milestones/`.

---

## v1.3 Surface Redesign (Shipped: 2026-05-17)

**Delivered:** Rebuilt the dashboard's UX from the ground up — closed the three named overflow bugs (panels exceeding viewport, Sheets/Popovers escaping bounds, data overflowing card edges), replaced the IDE-references aesthetic (Linear/Raycast/Vercel) with dashboard-product references (Honeycomb/Datadog/PostHog/Grafana family) via a new collapsible sidebar shell + 3-tier `[data-density]` toggle + Radix-Portal-universal overlay primitives, and unlocked four targeted new capabilities — server-persisted saved views with edit-vs-fork semantics + per-route default + pinned favorites + Cmd+K group (Alembic migration `0004_saved_views` + 5 CRUD endpoints + `validateSearch` on 7 routes), global time picker with Grafana-style relative syntax + auto-refresh + Cmd+Shift+C/V copy-paste + brush-zoom + compare-to-previous overlay (TIME-01..05), layout customization with per-panel show/hide + 1D drag-reorder + split-pane resize via `react-resizable-panels@4.11.0` + Reset Layout escape hatch (LAYO-01..04, all state piggybacking on saved-view `state_json`, zero new DB table), and Cmd+K extensions (CMDK-02..04) — plus closed three v1.2 carried tech debts cleanly (TDBT-01 `project_key` wire exposure on `SessionListItemFull`+`SessionCompareSide`; TDBT-02 `KNOWN_METRICS` removal + runtime API-contract test replacing build-time grep; TDBT-03 NL composer 503 retry UX honoring the V11 collapsed-failure-mode lock — backend route UNCHANGED, Queue UX intentionally NOT shipped). Every existing URL, deep link, API contract, and test suite continued working — APPEND-ONLY `validateSearch` was enforced by `tests/test_url_contract.py` + `docs/url-contract.md` bidirectional gate (Pitfall 13 lock). Each phase closed behind a formal visual checkpoint (138 PNGs total across 5 phases × 3 densities × 2 themes) + axe-core gate via PHASE_24..28 NET_CLASS_MARKERS inversion + Lighthouse 9/9 baseline (LCP 559-586ms, CLS 0-0.003, performance 1.0) + perf budget (DOM-identity zero-rerender probe) + URL contract pytest.

**Phases completed:** 24–28 (5 phases) — 42 plans total

**Key accomplishments:**

- **Shell + density + containment primitives (Phase 24, 7 plans):** New collapsible Sidebar (Cmd+B + active-route 3px border-left bar surviving 240→52px collapse flip) + `AppShellHeader` extraction + 3-tier `[data-density]` toggle on `<html>` via `lib/density.ts` (CSS-only swap, no React re-renders, `:root` cascade into Radix Portal descendants) + three named overflow fixes (`BoundedPanelCard` + `.cmc-page--bounded` page modifier for viewport bound; Radix Portal universal for Sheet/Popover/DropdownMenu containment; global `min-width: 0` on `.cmc-card` CSS Grid implicit min-content for card-edge overflow) + 4 docs (`docs/z-index-ladder.md`, `docs/url-contract.md`, `docs/affordance-checklist.md` 15+ keyboard affordances, `docs/testid-registry.md`) + 2 ESLint custom rules (`testid-registry-only`, `no-raw-z-index`) + visual checkpoint pattern (POLI-09) + axe-core gate + Lighthouse perf budget + `backend/tests/test_url_contract.py`. 36 PNGs at close, operator verdict PASS.

- **Saved views: backend + frontend (Phase 25, 11 plans):** Alembic migration `0004_saved_views` (id/name/description/route/state_json/schema_version/created_at/updated_at) + 5 CRUD endpoints + 50-view-per-route cap + UNIQUE(route, name) rejection + `validateSearch` on 6 new routes (`/`, `/activity`, `/skills`, `/skills/$name`, `/cost`, `/alerts`) with `schemaVersion` field + `SavedViewMenu` chrome with Radix DropdownMenu trigger + `SaveViewDialog` (Radix Dialog NOT AlertDialog per Pitfall 4) + `EditOrForkDialog` 3-button (save/fork/discard — no silent overwrite) + `UnsavedPip` indicator with `schemaVersion`-stripping `stableStringify` divergence detection + `LoadedViewContext` + `DefaultViewLoader` zero-render effect with Pitfall 8 deep-link-wins lock + `RecentStateTracker` zero-render effect (FIFO 50-cap with structural JSON.stringify dedupe) + Sidebar `PinnedViewsSection` with pathname+search MATCH active-state + Cmd+K Saved Views group with current-route-first ordering. 30 NEW PNGs (96 total) at close, operator verdict PASS.

- **Per-route adoption I + time + Cmd+K (Phase 26, 9 plans):** Global `TimePicker` (Radix Popover + 3-group `PresetList` × 13 presets + `CustomRangeCalendar` react-day-picker mode="range" dual-month) + `RefreshDropdown` (off/30s/1m/5m + Paused on absolute time_from + opacity-only pulse) + `AutoRefreshController` zero-render effect firing `queryClient.invalidateQueries` on `isTimeAnchoredKey` predicate + window-level Cmd+Shift+C/V hotkeys via `serializeRange`/`parseRangeFromText` + sonner `Toaster` mount + APPEND-ONLY `validateSearch` `time_from?`/`time_to?`/`compare_panels?` on `/`, `/activity`, `/sessions/compare` per Pitfall 13 + `useRouteRange` URL→backend-Range bridge hook + 21 panels migrated to `BoundedPanelCard bounded` mode + `useChartBrush` + `ResetZoomButton` chrome on `/activity` `ChartsStrip` + Cmd+K Recents/Time-range/Density Command.Groups with locked JSX order (Pitfall 10: Recents → Saved Views → Pages → Time range → Density → Actions) + sidebar `RecentlyVisitedSection` between Pinned and Configure + `TokenUsageCard` prior-period overlay (TIME-04) via `useTokens('30d')` + client-side slice `[-14, -7)` with `stackId='prior'` + `fillOpacity=0.25`. URL-as-broadcast-bus pattern verified end-to-end (single URL write fans out to ResetZoomButton + Paused refresh + TimePicker absolute label without any React Context bridge). 30 NEW PNGs (126 total) at close, operator verdict PASS.

- **Per-route adoption II + tech debt (Phase 27, 9 plans):** Tail-end routes (`/skills`, `/skills/$name`, `/cost`, `/alerts`) adopt Phase 24 primitives + Phase 25 saved views + Phase 26 time picker — APPEND-ONLY `validateSearch` (time_from/time_to/compare_panels on all 4 routes; `/skills/$name` PRESERVES `range` per Pitfall 2 LOCK) + `.cmc-page--bounded` on all 4 root sections + ~25 panels migrated to bounded + `TruncatedCell` wraps long skill names + `useRouteRangeVocab<V extends string>` generic URL→Vocab bridge with `snapToSkillRange`/`snapToCostRange`/`snapToAlertRange` snappers (ZERO-REFACTOR INVARIANT — Phase 26's `useRouteRange` byte-identical, 9 prior call sites unaffected) + `CompareToggle` mounted in `CostByProjectCard` chrome (URL round-trip ships even though DeltaPill column deferred per Accepted Exception #2) + `AlertEventsList` vocab-bridge migration (drops localStorage `RangeToggle persistKey`) + `hasGlobalPicker` ternary pattern (global picker WINS WHEN PRESENT, route-local `?range=` is fallback) on 4 detail panels. TDBT closures: TDBT-01 surfaces `project_key: str` (sha1[:12] of realpath(cwd)) on `SessionListItem`+`SessionCompareSide` wire shapes + frontend `ComparePicker` filter switches from `row.cwd === scopeCwd` to `row.project_key === scopeProjectKey` (scopeCwd source-grep = 0 after Plan 03); TDBT-02 deletes `FALLBACK_KNOWN_METRICS` from `AlertRuleForm.tsx` + replaces backend `test_alerts_metrics_sync.py` build-time grep with runtime API-contract `test_alerts_metrics_contract.py` asserting `sorted(_SCOPE_EXTRACTORS.keys()) == sorted(GET /api/alerts/metrics → metrics)`; TDBT-03 `AlertNlInput` 503 branch replaced with `<div role='alert'>` block containing honest non-specific copy + Retry button + `hadError` latched-state (works around React Query's `isError→false` reset on next `mutate()`) — V11 collapsed-failure-mode lock preserved verbatim (backend route UNCHANGED, Queue UX intentionally NOT shipped per LOCKED OPERATOR DECISION 3). Includes verification-discovered Rule-1 fix `d76a95b` for `SkillLatencySnapshot` success-state `cmc-card--bounded` (mirrors Phase 26 `e838135` close-gate precedent). 24 NEW PNGs (120 total) at close, operator verdict PASS via live Chrome DevTools MCP walkthrough.

- **Layout customization (Phase 28, 6 plans):** `panelRegistry.ts` (39 panels across 6 in-scope routes) + `useLayoutState` hook (7 functions: isHidden/setHidden/orderedPanels/setOrder/splitSizes/setSplit/reset — preserves time_from/time_to/compare_panels/range/a/b/schemaVersion via destructuring-delete per LAYO-04 SC#3 + Pitfall 11 lock; URL-only state, NO localStorage) + 3 new APPEND-ONLY `validateSearch` params (`hidden_panels`/`panel_order` on 5 routes + `split_sizes` on `/sessions/compare`) + `PanelHeaderMenu` (Radix DropdownMenu Settings-icon trigger + Hide + Reset Layout items mounted in `PanelCard.headerMenu` chrome slot) wired across 36 panel mounts + `DraggablePanelWrap` (233 LOC, native HTML5 dnd mouse path + keyboard reorder grab-mode with Space toggle + ArrowUp/Down ±1 + Enter commit + Esc cancel + `aria-live` region announcing grab/move/drop/cancel; cross-column drops REJECTED) wrapped around 26 reorder-eligible main-column panel mounts + `ResizablePanelGroup` wrapper (v4 vocab verbatim Group/Panel/Separator/orientation per Pitfall 1 grep gate) wiring `react-resizable-panels@4.11.0` (single new runtime dep this phase, blocking-human npmjs.com legitimacy gate before install) into `SessionCompareView CompareBody` with `<Panel id="side-a/b" defaultSize="50%" minSize="20%">` (STRING percentages — v4 docs: "Numeric values are assumed to be pixels") + double-click reset detection (±1% tolerance) → `setSplit(groupId, null)` prune → URL drops `split_sizes` entirely per Pitfall 2 bare-URL gate + two-surface Reset Layout coverage (chrome-level `SavedViewMenu` Reset Layout DropdownMenu.Item + per-panel `PanelHeaderMenu` Reset Layout item, both with `panel-reset-layout-{route}` testid + sonner `toast.success('Layout reset')`). `SaveViewDialog` UNTOUCHED across all 4 LAYO requirements per Pitfall 3 lock — opaque-capture pipeline round-trips all 6 v1.3 search params automatically. 18 NEW PNGs (138 total) at close, operator verdict PASS via live Chrome DevTools MCP walkthrough; zero close-gate Rule-1 self-heals discovered (contrast with Phase 26 `e838135` + Phase 27 `d76a95b`).

**Stats:**

- 994 files changed, +177,800 / -7,268 lines vs v1.2
- ~87,531 LOC at close (~41,187 Python + ~46,344 TypeScript/TSX) — up ~24,648 from v1.2
- 5 phases, 42 plans, 45/45 active requirements satisfied (100%)
- 184 commits over 8 days (69 feat, 71 docs, 26 test, 10 fix, 1 chore)
- Backend tests 661 → 690 (+29); frontend tests 326 → 754 (+428 — pattern-shift from heavy E2E to dense vitest unit coverage); Playwright e2e 13 → 320 tests in 19 spec files
- Lighthouse 9/9 PASS at median (LCP 559-586ms, CLS 0-0.003, performance 1.0); axe 0 phase-attributable violations across 13 close-gate scans
- Visual capture matrix: 0 → 138 PNGs across 5 phase close gates (36 + 30 + 30 + 24 + 18)
- 8 days from v1.2 close to v1.3 ship (2026-05-09 → 2026-05-17)
- 1 Alembic migration (`0004_saved_views`); 0 new top-level routes; 6 new runtime frontend deps locked at exact pins (`@radix-ui/react-popover@1.1.15`, `@radix-ui/react-dropdown-menu@2.1.16`, `sonner@2.0.7`, `react-day-picker@10.0.0`, `date-fns@4.1.0`, `react-resizable-panels@4.11.0`); 0 new Python dependencies

**Git range:** `faaa23e` (v1.2 ship) → `1614f4d` (Phase 28-06 operator verdict PASS)

**Tag:** `v1.3`

**Archives:**

- `.planning/milestones/v1.3-ROADMAP.md` — full phase + plan history
- `.planning/milestones/v1.3-REQUIREMENTS.md` — 45 requirements with outcomes (45 active complete, 0 adjusted critical, 0 dropped; 13 Accepted Exceptions operator-acknowledged as forward-compatible tech debt)
- `.planning/milestones/v1.3-MILESTONE-AUDIT.md` — authoritative completion state (audited 2026-05-17, status: passed; 45/45 requirements, 5/5 phases, 6/7 integration wiring claims with 1 documentation WARNING, 4/5 E2E flows with 1 documented Accepted Exception)
- `.planning/milestones/v1.3-INTEGRATION-REPORT.md` — cross-phase integration evidence

**Outstanding human-verify items (non-blocking, carried to operations):**

- Apply Alembic migration `0004_saved_views` to live `data/cmc.db` (auto-applies on next `cmc start` via lifespan)
- 13 Accepted Exceptions documented as v1.4+ candidates with explicit unblock conditions — see `milestones/v1.3-MILESTONE-AUDIT.md` Tech Debt Summary
- REQUIREMENTS.md doc-drift on `dep-count` constraint (says "3 baseline deps" — actual = 6 runtime deps across the milestone; zero Python deps still satisfied) — update at v1.4 milestone start

**What's next:** TBD — define via `/gsd:new-milestone`. Likely candidates from v1.4+ backlog: LAYO-05 (full 2D grid via `react-grid-layout` — once GitHub Issue #2045 React 19.2 key-prop warnings resolve), ANLY-08/09 (forecast confidence band, per-project cost budgets bridging cost ↔ alerts), SKLP-11..13 (per-skill body/subagent/tool overhead — still gated on upstream OTEL data availability change; percentile-split; heatmap toggle), ALRT-15/16 (predictive alerts, NL2SQL — separate milestone candidate), CMPR-08/09 (sessions-table compare-with-previous, per-skill cost delta), PLAT-01 (Linux/systemd), AUTO-01..03 (NL schedules beyond cron, auto-retry, task dependencies).

---

## v1.2 Depth & Polish (Shipped: 2026-05-09)

**Delivered:** Closed v1.1's carried debt with a green CI baseline (centralized `cmc/core/time.py` naive-UTC helper across 22 sites, deterministic `vi.spyOn(Date, 'now')` for time-boundary tests, Playwright strict-mode `data-testid` convention), then deepened every v1.1 lane: per-project skill breakdown / 7d-vs-prev-7d delta pills / new+dormant badges via a normalized `project_key` (sha1[:12] of `realpath(cwd)`) shipping as Alembic migration `0003_project_key`; Decimal-only OLS monthly cost forecast and per-project cost card on a new `/cost` route; alert engine `evaluate_anomaly` extended with a `params_json.window_kind` discriminator (sliding window joins EWMA inside the same function, no parallel detector) and a Haiku-backed `POST /api/alerts/parse-nl` natural-language rule authoring path that hard-validates against `_SCOPE_EXTRACTORS.keys()` and returns `None` on hallucination (no fallback rule); a feasibility-gated SKLP-11 spike that resolved NO and was honestly descoped to v1.3; per-skill p95 latency deltas in `/sessions/compare`; Cmd+K "compare with previous session" backed by `GET /api/sessions/{sid}/previous` + `ActiveSessionContext`.

**Phases completed:** 18–23 (6 phases) — 22 plans total

**Key accomplishments:**

- **Polish & green-baseline cleanup (Phase 18):** Centralized `cmc/core/time.py::now_utc` + `UTCDatetime` PlainSerializer; mechanical 22-site sweep of `datetime.utcnow` in single bisect-friendly commit `c3d792f` (~1429 deprecation warnings → 0); `SchedulesCard.test.tsx > stale row` migrated to `vi.spyOn(Date, 'now')` with sentinel-default test factories; `data-testid="schedule-composer-name"` on source component + `feature-component-element` kebab-case convention documented in `frontend/tests/e2e/README.md`; `BASELINE.md` with verifier rules embedded as prose-with-bounds (pytest 566 / vitest 293 / Playwright 7+1-skipped + warning deltas) — single source of truth for downstream phase verifiers
- **Skills per-project + deltas + badges (Phase 19):** Migration `0003_project_key` (sessions.project_key VARCHAR(12) NOT NULL DEFAULT '', indexed, Python-loop `realpath` backfill); `cmc.core.project_key.compute_project_key` helper (sha1[:12]); `GET /api/skills/{name}/projects` endpoint with structural no-path-leakage test; prev-period CTE on `/skills/usage` and `/skills/{name}/cost` for 7d-vs-prev-7d delta pills; new/dormant badges via MIN/MAX(ts) with cold-start suppression for skills <14 days old; DST spring-forward unit test crossing the boundary; DeltaPill primitive; SkillProjectsTable panel mount on `/skills/$name`; runtime-DOM path-leakage regex guard
- **Cost forecast + per-project card (Phase 20):** `cmc/cost/forecast.py` Decimal-only OLS module + `GET /api/cost/forecast` endpoint with `insufficient_data` when `days_elapsed < 7` and `partial_month_bias` flag during week 1 (server-driven banner); `_BREAKDOWN_BY_PROJECT_SQL` refactored to GROUP BY `s.project_key` + `WHERE s.project_key != ''` (consumes Phase 19 column; no new migration); new `/cost` route + `CostForecastCard` + `CostByProjectCard` (7d/30d toggle); 4-layer path-leakage defense culminating in adversarial-mutation-verified Playwright `cost-dashboard.spec.ts` real-DOM regex; preserves v1.1 "tokens stored, $ computed at read time" invariant
- **Alert anomaly depth + NL authoring (Phase 21):** `_resolve_alpha` helper inside single `evaluate_anomaly` function (sliding=`1/N`, ewma=`2/(N+1)`); `params_json.window_kind` validator + `min_samples >= window_n` coupling on `AlertRuleCreate`/`AlertRulePatch`; AST static-import test pinning the single-detector invariant; `cmc/alerts/nl_parser.py` (lazy `AsyncAnthropic`, `_SCOPE_EXTRACTORS.keys()` injected verbatim into system prompt, `None` on hallucination — no fallback rule); `POST /api/alerts/parse-nl` (503 collapse on credentials missing) + `GET /api/alerts/metrics`; `useParseAlertNl` + `useAlertMetrics` React Query hooks; NL input + `AlertDialog` preview modal in `AlertRuleForm`; cross-language drift guard `test_alerts_metrics_sync.py`
- **SKLP-11 spike-gated descope (Phase 22):** Mandatory data-availability spike against `tools` temporal JOIN vs `skill_activated.duration_ms` resolved **NO** with verbatim sqlite3 evidence (CT-1 coverage probe failed: `duration_ms` structurally absent for the body/subagent/tool decomposition); `22-01-SPIKE-FINDINGS.md` (commit `07abcfa`) anchors the descope decision; Plan 22-02 honestly flipped SKLP-11 to `Deferred to v1.3` in REQUIREMENTS.md; Phase 23 unblocked on schedule. ROADMAP SC#3 explicitly contemplated this branch — descope is the success path when data is unreliable, not a quiet drop
- **Compare depth + milestone close (Phase 23):** `_build_compare_side` extended with per-side `skill_latencies` dict + `low_sample_a/b` flags (preserves CMPR-04 9-SQL-per-request budget; per-request SQL counter assertion); `GET /api/sessions/{sid}/previous` resolver (project_key + ended_at ordering, 404-as-empty-state); per-skill p95 latency section in `SessionCompareView` with delta suppression on low-sample; Cmd+K "Compare with previous session" gated by previous-session existence + project-scoped picker; new `ActiveSessionContext` for cross-Sheet active-session signal; Playwright TEST-23-CMPR-06/07 with preflight-driven branch annotations; milestone-close validation gates green (backend pytest 661/0/0 vs Phase 18 baseline 566; frontend vitest 326/0/0 vs 293; Playwright 13/0/2-skipped; cmc doctor clean)

**Stats:**

- 178 files changed, +31,281 / -2,375 lines vs v1.1
- ~62,883 LOC at close (~40,071 Python + ~22,812 TypeScript/TSX) — up ~6,651 from v1.1
- 6 phases, 22 plans, 12/12 active requirements (+1 honestly deferred to v1.3)
- 88 commits over 4 days (23 feat, 3 fix, 12 test, 47 docs)
- Backend tests 552 → 661 (+109); frontend tests 292 → 326 (+34); Playwright e2e 8 → 13 specs
- 4 days from v1.1 close to v1.2 ship (2026-05-05 → 2026-05-09)
- 1 Alembic migration (`0003_project_key`); 1 new top-level route (`/cost`); 0 new external dependencies

**Git range:** `af6d308` (v1.1 ship) → `f00d349` (Phase 23 verifier passed)

**Tag:** `v1.2`

**Archives:**

- `.planning/milestones/v1.2-ROADMAP.md` — full phase + plan history
- `.planning/milestones/v1.2-REQUIREMENTS.md` — 13 requirements with outcomes (12 active complete + 1 honestly deferred)
- `.planning/milestones/v1.2-MILESTONE-AUDIT.md` — authoritative completion state (audited 2026-05-09, status: passed; 12/12 active requirements + 1/1 honestly deferred, 6/6 phases, 12/12 integration, 5/5 flows)

**Outstanding human-verify items (non-blocking, carried to operations):**

- Two pre-existing Playwright skips at v1.2 close (`alerts.spec.ts:40 TEST-05a`, `skills-detail.spec.ts:25 SKLP-08/09/10`) — both dev-DB-state-dependent (no recent failed_task; no seeded skill row); not regressions, but the v1.3 baseline should re-record after seed refresh

**What's next:** TBD — define via `/gsd:new-milestone`. Likely candidates from v1.3 backlog: SKLP-11 retry (depends on upstream OTEL data availability change), SKLP-12/13 (percentile-split overhead, heatmap toggle), ANLY-08/09 (forecast confidence band, per-project budgets bridging cost/alerts), ALRT-15/16 (predictive alerts, NL2SQL), CMPR-08/09 (sessions-table compare-with-previous, per-skill cost delta), PLAT-01 Linux/systemd, AUTO-01..03 (NL schedules beyond cron, auto-retry, task dependencies).

---

## v1.1 Skills & Cost Intelligence (Shipped: 2026-05-05)

**Delivered:** A read-time cost engine (5-SKU pricing table, never-store-$ window logic), the full skills observability suite (TopSkills, SkillCostCard, SkillLatencyTable, SkillTimeline, per-skill detail route), a hysteresis-aware skill-level alert engine with Telegram ack flow + auto-resolve, and a single-round-trip session comparison view with deep-linkable URL state and dual picker entry points (Cmd+K + sessions-table row action).

**Phases completed:** 12–17 (6 phases) — 28 plans total

**Key accomplishments:**

- **OTEL skill event spike (Phase 12):** Verbatim capture of `claude_code.skill_activated` shape from real ingest data; SPIKE.md with LOCK-1..9 + BUG-A/BUG-B anchors every downstream phase plan; negative finding (skill body fired, zero OTEL events) handled cleanly via TENTATIVE/CITED locks
- **Cost foundation + skill ingest (Phase 13):** `cmc.pricing.compute_cost` (Decimal-only, no float drift) + 5-SKU pricing table with `effective_from`/`effective_until` for self-correcting historical totals; single Alembic migration 0002 (`attrs_skill_name` indexed column + alert tables + cache TTL split + UNIQUE(session_id, otel_event_id) + BUG-B backfill); doctor checks 9–14 for pricing freshness/unpriced tokens/OTEL_LOG_TOOL_DETAILS
- **Skills observability suite (Phase 14):** 4 new skills endpoints (`/api/skills/usage` + `/api/skills/{name}/cost|latency|runs`) with Pattern 4 SQL CTEs; reactivated v1.0 placeholder panels (TopSkills closes ACTV-04, SkillCostCard closes SKLP-02); 3 new panels (SkillLatencyTable with low-sample badge, SkillTimeline live firehose, SkillRunsTable); first file-based dynamic route in the codebase (`/skills/$name`)
- **Alert engine + UI (Phase 15):** Hand-rolled threshold + EWMA z-score detector (stdlib `math` only, ~100 LOC); dispatcher hook in `heartbeat.py::run_one_cycle` after stamp_tick + e-stop; stable `dedup_key = f"alert:{rule_id}:{scope_key}"` reusing existing `notification_log` UNIQUE constraint; `cmc/telegram/callback_verbs.py` central StrEnum + `ack_alert` verb (sha256[:8] under 64-byte cap); `/alerts` page with 3 panels (rules CRUD list, discriminated-union form, events history); ALRT-12 invariant — alert engine NEVER imports `cmc.dispatcher.tasks`; project-wide `UTCDatetime` PlainSerializer (8 schemas / 37 fields)
- **Session comparison (Phase 16):** Single-round-trip `GET /api/sessions/compare?a=&b=` (≤9 SQL/request, 200-with-flag over-cap fallback at 500 tool calls); first `validateSearch` use in the codebase (hand-written UUID validator, no zod added); two-up `SessionCompareView` panel (KPI strip × 2 + recharts BarChart × 2 + skill-set diff + tool-counts DataTable); first `useRouterState({ select })` usage; ComparePicker Sheet drawer with self-compare guard; CMPR-05 hard-locked tabular-only (DevTools Sources scan: 0/43 scripts match diff/jsdiff/react-diff)
- **Polish, doctor, tests (Phase 17):** POLI-04 lifecycle assertion (1 decision + 1 notification_log per heartbeat tick); `parse_mode=` directory-wide CI grep guard for `cmc/telegram/`; CallbackVerb round-trip tests parametrized over enum; 2 new Playwright e2e specs (`alerts.spec.ts` create→fire→ack with async-trigger 35s polling + cleanup; `sessions-compare.spec.ts` exercises both picker entry points in sequence); README + `.env.example` docs updated with v1.1 panels + pricing seed workflow + OTEL spike summary

**Stats:**

- 666 files changed, +81,397 / -13,435 lines vs v1.0
- ~56,232 LOC at close (35,701 Python + 20,531 TypeScript/TSX) — up ~16,400 from v1.0
- 6 phases, 28 plans, 41 requirements (all shipped)
- 125 commits over 4 days (42 feat, 5 fix, 19 test, 58 docs)
- Backend tests 388+ → 552; frontend tests 234+ → 292; Playwright e2e 6 → 8 specs
- 4 days from v1.0 close to v1.1 ship (2026-05-02 → 2026-05-05)

**Git range:** `52ea94c` (refactoring Telegram for local testing) → `af6d308` (Phase 17 verifier passed 5/5)

**Tag:** `v1.1`

**Archives:**

- `.planning/milestones/v1.1-ROADMAP.md` — full phase + plan history
- `.planning/milestones/v1.1-REQUIREMENTS.md` — 41 requirements with outcomes
- `.planning/milestones/v1.1-MILESTONE-AUDIT.md` — authoritative completion state (audited 2026-05-05, status: passed; 41/41 requirements, 6/6 phases, 9/9 integration, 6/6 flows)

**Outstanding human-verify items (non-blocking, carried to operations):**

- Apply Alembic migration 0002 to live `data/cmc.db` (auto-applies on next `cmc start` via lifespan)
- Phase 14 visual checkpoint per Plan 14-05 (operator-driven dashboard navigation)

**What's next:** TBD — define via `/gsd:new-milestone`. Likely candidates from v2 backlog: SKLP-08..11 (per-project skill breakdown, period-over-period deltas, "new this week" badges, latency overhead), ANLY-06..07 (monthly cost forecast, per-project cost card), ALRT-13..14 (full anomaly detection, NL-authored alert rules), CMPR-06..07 (per-skill latency delta, "compare with previous" shortcut), PLAT-01 Linux/systemd support, AUTO-01..03 (NL schedules beyond cron, auto-retry, task dependencies).

---

## v1.0 MVP (Shipped: 2026-04-28)

**Delivered:** A production-grade local dashboard and command centre for Claude Code at `localhost:8765` — ingests session JSONLs and OTEL telemetry, renders 21 observability/activity panels, runs a Mission Control task dispatcher with stream-mode DECISION/INBOX parsing, and pages over Telegram with full callback parity.

**Phases completed:** 1–11 (9 base + 2 audit gap-closure phases) — 47 plans total

**Key accomplishments:**

- FastAPI + SQLAlchemy 2.0 async + SQLModel + Alembic backend on SQLite WAL with 15-table schema, JSONL scraper (boot + 120s loop), and OTLP/HTTP `/v1/logs` + `/v1/metrics` ingest endpoints (always-200 contract)
- 50+ JSON API endpoints across system/sessions/observability/MCP/skills/HITL/tasks/schedules with PID-validated emergency stop, INSERT-OR-IGNORE decisions, and Haiku-backed natural-language → cron parser
- React + Vite + TanStack Router frontend with 21 panels (15 observability + 6 activity), full HITL command centre (decisions/inbox/task board/schedule composer), Cmd+K palette, framer-motion polish, and a dark theme matching Linear/Raycast/Vercel quality bar (visual quality bar approved by user)
- Mission Control Dispatcher: launchd 120s heartbeat with atomic task claim, classic + stream execution modes, fenced-code-aware DECISION/INBOX marker parsing, 3-task concurrency with autonomy gate, FollowUpPump for stdin injection, Haiku skill router, and PID-file safe emergency stop
- Telegram bridge: notifier (decisions/approvals/failures/overdue/inbox) + handler (long-poll, whitelisted users, callback dispatch via dash_router) with full Approve/Reject/Snooze parity and `answered_by='telegram'` audit-trail provenance
- Operational tooling: `install.sh` one-command installer, `cmc` CLI shim (renamed from `cc` to avoid `/usr/bin/cc`), `doctor.py` deterministic health check, BotFather + OTEL setup wizards, 4 launchd plists, and Playwright e2e suite (TEST-01..04, chromium-only, 6/6 passing)
- 388+ backend tests + 234+ frontend tests green at milestone close; v1.0 audit re-verified 148/148 requirements, 11/11 phases, 8/8 integration, 8/8 E2E flows

**Stats:**

- 745 files changed, 172,853 insertions across milestone
- 39,788 LOC (24,978 Python + 14,779 TypeScript/TSX)
- 11 phases (9 base + 2 gap closure), 47 plans
- 4 days from kickoff to ship (2026-04-25 → 2026-04-28)

**Git range:** `c743582` (initial commit) → `a771a0a` (Phase 11 verifier 9/9)

**Tag:** `v1.0`

**Archives:**

- `.planning/milestones/v1.0-ROADMAP.md` — full phase + plan history
- `.planning/milestones/v1.0-REQUIREMENTS.md` — 148 requirements with outcomes
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md` — authoritative completion state (re-audited 2026-04-28, status: passed)

**What's next:** TBD — define via `/gsd:new-milestone`. Likely candidates from v2 backlog: ANLYT-01..03 (cost estimation, anomaly detection, session comparison), PLAT-01 Linux/systemd support, AUTO-01..03 (NL schedules beyond cron, auto-retry, task dependencies), and resolution of v1 deferred items (ACTV-04/SKLP-02 functional skill panels once `claude_code.skill_invoked` OTEL event lands).

---
