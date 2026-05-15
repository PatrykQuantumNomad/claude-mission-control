---
phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
plan: 05
subsystem: ui
tags: [react, tanstack-router, vitest, time-picker, vocab-bridge, compare-toggle, sc-2, bounded-panel-card, truncated-cell, anly-07, time-04]

# Dependency graph
requires:
  - phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
    provides: "Plan 27-01 useRouteRangeVocab + snapToCostRange (4-tier '1d'|'7d'|'14d'|'30d' bands at 48h/192h/504h)"
  - phase: 26-per-route-adoption-i-command-activity-sessions-time-cmd-k
    provides: "asTimeToken + asComparePanels shared validators in lib/searchSchemas.ts; CompareToggle component (Plan 26-07 TIME-04 URL CSV contract); per-route adoption pattern (Plan 26-08 BoundedPanelCard + cmc-page--bounded)"
  - phase: 24-shell-density-containment-primitives
    provides: "BoundedPanelCard + PanelCard `bounded` prop (CONT-04); TruncatedCell (CONT-03); cmc-page--bounded + cmc-card--bounded CSS modifiers"
provides:
  - "/cost route SC#2 surface: validateSearch APPEND-ONLY extension (time_from? + time_to? + compare_panels?) + cmc-page--bounded + 2 panels adopted bounded + CostByProjectCard URL-driven range via useRouteRangeVocab + TruncatedCell on project_key column + CompareToggle in panel chrome"
  - "Accepted Exception precedent (escape path (i)) — CompareToggle ships for URL round-trip parity even when prior-period data isn't computable; saved-view + bookmark + deep-link contracts land regardless"
affects:
  - 27-06-alert-events-global-picker-adoption
  - 27-09-close-gate

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-line vocab-bridge adoption when route has no Phase 25 first-class filter: const range = useRouteRangeVocab('7d', snapToCostRange) — no hasGlobalPicker ternary needed because /cost has no ?range= filter to preserve (contrast with /skills/$name's Pitfall 2 LOCK)"
    - "CompareToggle URL-round-trip-only ship pattern: mount the toggle in panel chrome even when the prior-period column can't render — preserves the URL/saved-view/bookmark contract, lets the column land additively when backend support arrives, avoids leaving the URL surface inconsistent across panels"
    - "Defensive TruncatedCell wrap: wrap project_key in TruncatedCell even though the value is currently uniform 12-char hex — SC text reads 'long project paths truncate cleanly', and a future schema change wider than 12 chars now collapses with tooltip-on-hover instead of overflowing"
    - "RangeToggle removal pattern: dropping panel-internal RangeToggle + localStorage persistKey when URL state is the new persistence layer — pre-seeded localStorage MUST be ignored (URL default wins), test asserts the regression"

key-files:
  created:
    - "frontend/src/components/panels/__tests__/CostByProjectCard.compareOverlay.test.tsx (6 vitest cases — mounts toggle, off default, click write round-trip, deep-link read round-trip, independence invariant, escape-path-(i) data-shape limitation pin)"
  modified:
    - "frontend/src/routes/cost.tsx — APPEND-ONLY validateSearch (time_from? + time_to? + compare_panels?); cmc-page--bounded modifier on root <section>"
    - "frontend/src/components/panels/CostForecastCard.tsx — PanelCard bounded; TIME-04 opt-out documented inline (MTD projection has no historical timeline)"
    - "frontend/src/components/panels/CostByProjectCard.tsx — useRouteRangeVocab('7d', snapToCostRange) replaces useState<CostRange>('7d') + RangeToggle persistKey='cost-by-project' localStorage round-trip; PanelCard bounded; TruncatedCell wraps project column; CompareToggle mounted in trailing chrome (URL-round-trip-only per escape path (i))"
    - "frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx — vi.mock('@tanstack/react-router') with useRouterState + useNavigate; SC#2 URL-driven range fetch test replaces RangeToggle click test; SC#2 localStorage-NOT-source-of-truth test added"
    - "docs/url-contract.md — /cost row updated with Phase 27 search-param shape (time_from + time_to + compare_panels); Phase 27 effects section extended with /cost append-only + TIME-04 Accepted Exception documentation"

key-decisions:
  - "Escape path (i) adopted (Accepted Exception): CostBreakdownResponse rows are rolled-up per-project totals with no time bucketing — CostBreakdownRow has only key + tokens_* + cost_usd (no `day` axis). Client-side prior-period slicing requires bucketed data (mirror of TokenUsageCard's useTokens which returns items: [{day, ...}]). Without backend support, escape (ii) would require a backend extension and escape (iii) would require an unrelated bucketed endpoint to be aggregated per-project on the client. Chose (i) — ship CompareToggle for URL contract + saved-view forward-compat, document the limitation, defer the column rendering to a future plan that lands the backend bucketed endpoint"
  - "Pitfall 8 LOCK preserved: even setting aside the data-shape limitation, the plan's locked decision was DeltaPill HTML column NOT a chart overlay (Phase 24 ResponsiveContainer count must stay at 8 across the panels/ directory — the rg -c gate). The escape-path (i) ship preserves the lock trivially because NO column lands at all this plan"
  - "RangeToggle DROP: replacing useState<CostRange>('7d') + <RangeToggle persistKey='cost-by-project' .../> with useRouteRangeVocab('7d', snapToCostRange) removes the panel-internal toggle entirely. The global TimePicker is the new control surface. Mirrors Phase 26 Plan 08's TokenUsageCard pattern where the localStorage persistKey was kept as a UX continuity (Phase 26 was a transitional sweep) — Phase 27 fully migrates the persistence layer to URL since the global picker is now the universal control"
  - "No hasGlobalPicker ternary needed on /cost (contrast with /skills/$name Plan 27-04): /cost has no Phase 25 first-class ?range= filter to preserve. The Pitfall 2 LOCK doesn't apply here — useRouteRangeVocab's routeDefault='7d' fallback handles both 'URL empty' and 'URL has valid window snapping to 7d' identically, which is the desired behavior. Simpler 1-line idiom suffices"
  - "TruncatedCell defensive wrap on uniform 12-char hex: r.key is currently always exactly 12 chars (project_key sha1[:12] from Phase 19 SKLP-08 + Plan 20-01). Wrapping in TruncatedCell adds a ResizeObserver + a span — minor cost. Rationale: SC#2 spec reads 'long project paths truncate cleanly', and a future Phase 28+ schema widening (e.g. switching to display_name) would silently overflow without this wrap. Cost is the inverse of fragility — accepted"
  - "CostForecastCard opts OUT of CompareToggle (documented inline): MTD projection is a single-point forecast — there is no historical timeline against which a 'previous period' overlay would be meaningful. The forecast already encodes its own confidence via partial_month_bias. Saved-view fork-save of the whole /cost route URL still works — compare_panels just won't include 'cost-forecast' because there's no toggle to write it"

patterns-established:
  - "Vocab-bridge adoption on a route without a first-class filter: single-line const range = useRouteRangeVocab(routeDefault, snapper) — no presence flag, no ternary. Plan 27-06 (/alerts AlertEventsList) can mirror this verbatim since /alerts also has no Phase 25 first-class filter (current alerts.tsx is 'none in v1.2')"
  - "URL-round-trip-only CompareToggle ship: when prior-period data isn't computable client-side, the toggle still mounts and writes to the URL — preserves saved-view fork-save + deep-link parity with TokenUsageCard. The escape-path (i) test pattern (assert NO .cmc-delta-pill renders + NO 'vs prior period' header text) pins the limitation so future work can't silently regress the data-shape contract"

# Metrics
duration: 6 min
completed: 2026-05-15
---

# Phase 27 Plan 05: /cost Per-Route Adoption + CompareToggle (TIME-04 URL Round-Trip) Summary

**SC#2 surface fully landed: /cost adopts cmc-page--bounded + APPEND-ONLY validateSearch extension (time_from + time_to + compare_panels); CostByProjectCard migrates from useState<CostRange>('7d') + localStorage RangeToggle to URL-driven useRouteRangeVocab('7d', snapToCostRange); both panels (CostForecastCard + CostByProjectCard) adopt bounded; TruncatedCell wraps project_key column defensively; CompareToggle mounts in CostByProjectCard chrome for URL-round-trip parity (Accepted Exception: prior-period DeltaPill column deferred because CostBreakdownRow lacks time bucketing — escape path (i)); Phase 24 ResponsiveContainer count UNCHANGED at 8/8 across 8 panel files; CostForecastCard explicitly opts out of CompareToggle (MTD projection has no historical timeline).**

## Performance

- **Duration:** 6 min (367s wall-clock)
- **Started:** 2026-05-15T20:27:13Z
- **Completed:** 2026-05-15T20:33:20Z
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 5 (1 route + 2 panels + 1 panel test + 1 docs)
- **Files created:** 1 (1 new panel test)
- **LOC delta:** approximately +470 / -47 across both tasks

## Accomplishments

- **Task 1 — /cost adoption sweep + vocab bridge:**
  - APPEND-ONLY validateSearch extension on `/cost`: `CostSearch` now accepts `time_from?` + `time_to?` + `compare_panels?` (all default-`undefined` per Pitfall 13) alongside the existing `schemaVersion?`. `SCHEMA_VERSION` stays at 1.
  - Root `<section>` gains `cmc-page--bounded` modifier so the CONT-04 viewport-height flex ladder activates on /cost.
  - **CostByProjectCard URL migration:** replaces the v1.2 `useState<CostRange>('7d')` + `<RangeToggle persistKey="cost-by-project" .../>` localStorage pair with `const range = useRouteRangeVocab('7d', snapToCostRange)`. The URL is now the canonical persistence layer — reload preserves the choice via `?time_from=now-30d&time_to=now`, the global TimePicker re-anchors the panel, and the stale `cost-by-project` localStorage key is dropped silently (test asserts it's NOT consulted).
  - **CostByProjectCard bounded + TruncatedCell:** `PanelCard bounded` adopted; project_key column cell renderer wraps the value in `<TruncatedCell value={r.key} />` defensively. Outer `<code className="cmc-numeric">` styling preserved so the monospace + 12-char-hex visual contract is identical.
  - **CostForecastCard bounded + TIME-04 opt-out:** `PanelCard bounded` adopted; inline comment block documents the TIME-04 opt-out — single-point MTD projection has no historical timeline against which prior-period overlay would be meaningful, and the forecast already encodes its own confidence via the `partial_month_bias` banner.
  - **CostByProjectCard.test.tsx rewrite:** `vi.mock('@tanstack/react-router')` with mutable `mockSearch` closure + `setSearch` helper (Phase 26 Plan 08 + Plan 27-04 pattern); two SC#2 tests added — (a) `?time_from=now-30d&time_to=now` snaps via `snapToCostRange` to `'30d'` and fires the 30d fetch, (b) pre-seeded `localStorage['cost-by-project'] = '1d'` is IGNORED (URL default `'7d'` wins). The previous RangeToggle-click test is replaced by the URL-window-snap test since the RangeToggle no longer exists.
  - **docs/url-contract.md:** `/cost` row updated to document the new search-param shape; Phase 27 effects section extended with the `/cost` append-only entry (alongside the existing `/skills` + `/skills/$name` entries from Plan 27-04).

- **Task 2 — CostByProjectCard CompareToggle + Accepted Exception:**
  - **CompareToggle mounted:** `<CompareToggle panelId="cost-by-project" />` in the PanelCard's `trailing` chrome slot. Reads/writes the shared `?compare_panels=` CSV URL param via Phase 26 Plan 07's contract (sorted + de-duped serialization for deterministic saved-view fork-save).
  - **Accepted Exception (escape path (i)):** The prior-period DeltaPill column is NOT rendered. Verified at execution time via `frontend/src/lib/api.ts:605-623` + `queries.ts:383-389` — `useCostBreakdown` returns `CostBreakdownResponse` where `rows: CostBreakdownRow[]` and each row contains only `key`, `tokens_*`, `cost_usd` (rolled-up totals). NO time bucketing — no `day` axis, no per-period breakdown — so client-side prior-period slicing is impossible without a backend window-shift or bucketed-cost endpoint. The toggle still mounts so the URL contract + saved-view round-trip parity with `TokenUsageCard` (Phase 26 Plan 07) is preserved; column rendering can be added additively when backend support exists.
  - **Pitfall 8 LOCK preserved:** even setting aside the data-shape limitation, the plan's LOCKED DECISION was DeltaPill HTML column NOT a chart overlay. The escape-path (i) ship preserves the lock trivially because NO column lands this plan. `rg -c "<ResponsiveContainer" frontend/src/components/panels/` returns 8 across 8 files (unchanged baseline).
  - **CostByProjectCard.test.tsx mock extension:** `useNavigate` stub added to the existing `vi.mock` so the CompareToggle's render-time hook chain resolves without throwing (the existing render-only suite doesn't click the toggle — the new sibling file owns the click round-trip via a full router).
  - **CostByProjectCard.compareOverlay.test.tsx (NEW, 6 vitest cases):** mounts toggle in chrome with the dynamic-testid pattern + off default + click writes URL (full in-memory router + `aria-pressed` flip waitFor assertion) + initial `?compare_panels=cost-by-project` deep-link shows toggle pressed + independence invariant (unrelated panel id `token-usage` leaves cost-by-project inactive) + Accepted Exception pin (no `.cmc-delta-pill` rendered + no "vs prior period" header text — pins the data-shape limitation so a future patch that adds the column without bucketed data flags as a regression).
  - **Dynamic testid:** `compare-overlay-toggle-cost-by-project` matches the `compare-overlay-toggle-{panel-id}` pattern already registered in `docs/testid-registry.md` from Phase 26 Plan 07 — no new registry entry required.

## Task Commits

1. **Task 1: /cost route — validateSearch append + cmc-page--bounded + CostByProjectCard vocab bridge + TruncatedCell** — `b35fece` (feat)
2. **Task 2: CostByProjectCard CompareToggle (TIME-04 URL round-trip only; DeltaPill column deferred per escape path (i))** — `2fabade` (feat)

Each task committed atomically per execute-plan convention. The split is deliberate: Task 1 lands the route shell + per-panel adoption (bounded + vocab bridge + TruncatedCell) so /cost works under the new URL/density contract immediately; Task 2 layers the CompareToggle on top with the Accepted Exception documentation inline.

## Files Modified

### Route (1 file)
- `frontend/src/routes/cost.tsx` (+22 / -5) — APPEND-ONLY validateSearch + cmc-page--bounded on root section.

### Panels (2 files)
- `frontend/src/components/panels/CostByProjectCard.tsx` (+45 / -22) — useRouteRangeVocab + bounded + TruncatedCell project column + CompareToggle mount + PANEL_ID constant + Accepted Exception inline doc.
- `frontend/src/components/panels/CostForecastCard.tsx` (+11 / 0) — PanelCard bounded + TIME-04 opt-out inline comment block.

### Tests (1 modified + 1 created)
- `frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx` (+62 / -19) — vi.mock router (useRouterState + useNavigate); RangeToggle click test replaced by URL-window-snap test; localStorage-NOT-source-of-truth test added.
- `frontend/src/components/panels/__tests__/CostByProjectCard.compareOverlay.test.tsx` (NEW, 273 LOC) — 6 vitest cases for the CompareToggle round-trip + Accepted Exception pin.

### Docs (1 file)
- `docs/url-contract.md` (+2 / -1) — /cost row updated + Phase 27 effects section extended.

## Verifications

| Check | Command | Result |
|-------|---------|--------|
| URL contract pytest | `cd backend && uv run pytest tests/test_url_contract.py` | **2/2 PASS** (after both task commits) |
| Frontend typecheck | `cd frontend && pnpm tsc --noEmit` | **clean** (no output / exit 0) |
| Frontend lint | `cd frontend && pnpm lint --max-warnings 0` | **exit 0** |
| Frontend vitest (cost panels) | `pnpm test --run src/components/panels/__tests__/CostByProjectCard.test.tsx src/components/panels/__tests__/CostByProjectCard.compareOverlay.test.tsx src/components/panels/__tests__/CostForecastCard.test.tsx` | **3 files / 11 tests PASS** (5 CostByProjectCard + 5 CostForecastCard + new file separately 6) |
| Frontend vitest (full panels sweep) | `pnpm test --run src/components/panels/__tests__` | **43 files / 206 tests PASS** |
| Pre-commit hooks (frontend tsc) | git commit triggers tsc | **Passed** on both task commits |
| Success-criteria grep 1 | `grep "cmc-page--bounded" frontend/src/routes/cost.tsx` | **1 hit** |
| Success-criteria grep 2 | `grep -c "bounded" frontend/src/components/panels/CostByProjectCard.tsx frontend/src/components/panels/CostForecastCard.tsx` | **CostByProjectCard=3, CostForecastCard=3** (≥2 — each file has bounded usage + bounded inline comment + bounded ref) |
| Success-criteria grep 3 (snapToCostRange) | `rg snapToCostRange frontend/src/components/panels/CostByProjectCard.tsx` | **3 hits** (import + call + doc) |
| Pitfall 8 LOCK preservation | `rg -c "<ResponsiveContainer" frontend/src/components/panels/` | **8 files × 1 each = 8 total UNCHANGED** (baseline 8; Phase 24 lock preserved) |
| RangeToggle removal | `rg "RangeToggle" frontend/src/components/panels/CostByProjectCard.tsx` | **0 code hits** (1 doc comment hit referencing the removed pattern) |
| useNavigate mock | CostByProjectCard renders unconditionally with CompareToggle | **navigateSpy + useRouterState both stubbed**; full panel suite 206/206 PASS |

## Decisions Made

1. **Escape path (i) adopted (Accepted Exception)** — `CostBreakdownResponse` is rolled-up per-project totals with no time bucketing. Verified at execution time by reading `frontend/src/lib/api.ts:607-615` and `queries.ts:383-389`. The plan's Step 3 of Task 2 explicitly enumerates three escape paths; (i) ships the CompareToggle for URL contract + saved-view forward-compat without rendering the column. Escape (ii) was rejected because Phase 27 RESEARCH guardrails defer backend extensions; escape (iii) (aggregating a sibling bucketed endpoint per-project on the client) was rejected because it would smuggle cost-attribution policy into the frontend (the backend is the single source of truth for cost rollup grouping per Plan 20-01).
2. **Pitfall 8 LOCK preserved trivially** — even setting aside the data-shape limitation, the plan's LOCKED decision was DeltaPill HTML column NOT a chart overlay (ResponsiveContainer count must stay at 8 across the panels/ directory). Escape-path (i) doesn't add either; baseline 8 → 8 is verified post-Task-2.
3. **RangeToggle dropped wholesale (no transitional kept-as-override)** — the plan's Step 4 of Task 1 said "DROP the `<RangeToggle persistKey='cost-by-project' .../>` entirely. The URL is now the persistence layer". No localOverride state kept (contrast with Phase 26 Plan 08's SessionsTable + Plan 27-04's SkillLatencyTable where localOverride was preserved as a per-panel scope-down UX affordance). Rationale: CostByProjectCard's RangeToggle was the v1.2-era panel-internal default; with the global TimePicker as the universal control surface, a per-panel scope-down would create two competing time controls on /cost (TimePicker in chrome + a redundant RangeToggle in the panel header). Cleaner to remove.
4. **TruncatedCell defensive wrap accepted** — r.key is currently uniform 12-char hex (project_key = sha1[:12] from Phase 19 SKLP-08). Plan's Step 5 of Task 1 acknowledged "short and uniform" but called for the wrap defensively because the SC text reads "long project paths truncate cleanly". Cost is one ResizeObserver + one span per row. The outer `<code className="cmc-numeric">` styling is preserved by nesting TruncatedCell INSIDE the code element rather than replacing it — keeps the monospace + 12-char-hex visual contract identical.
5. **No hasGlobalPicker ternary (contrast with Plan 27-04 detail-route pattern)** — /cost has no Phase 25 first-class `?range=` filter to preserve (contrast with /skills/$name's Pitfall 2 LOCK). The 3-line ternary idiom from Plan 27-04 (`useRouteRangeVocab unconditional + useRouterState presence flag + ternary select`) collapses to a single line here because there's no second range source to weigh against. This is documented inline as the simpler-route adoption pattern.
6. **CostForecastCard OPTS OUT of CompareToggle with inline comment** — MTD projection is a single-point forecast (data point: `projected_month_total_usd`). There's no historical timeline against which a "previous period" overlay would be meaningful. The plan's `must_haves.truths[7]` explicitly required this opt-out; documented inline in the panel header comment block so future readers know the omission is intentional, not an oversight.
7. **CostByProjectCard.test.tsx useNavigate stub added preemptively** — even though the render-only suite doesn't click the CompareToggle, the toggle's render path calls `useNavigate()` unconditionally during component mount. Without the stub the `vi.mock` factory would leave `useNavigate` undefined and `useNavigate()` would throw `TypeError: useNavigate is not a function`. The new `navigateSpy = vi.fn()` is a no-op spy that satisfies the contract; the sibling `compareOverlay.test.tsx` file owns the actual click round-trip with a full in-memory router.

## Deviations from Plan

None — plan executed exactly as written.

The plan's Task 2 Step 3 explicitly anticipated this outcome ("**CRITICAL — if `useCostBreakdown` does NOT return time-bucketed data**, the prior-period overlay is NOT computable client-side without a backend extension. Three escape paths: (i) ... (ii) ... (iii) ...") and pre-authorized escape path (i) as the ship route. Reading `frontend/src/lib/api.ts:605-623` + `frontend/src/lib/queries.ts:383-389` at execution time confirmed the data shape limitation: `CostBreakdownRow` has only `key` + `tokens_*` + `cost_usd` (no time axis), and `useCostBreakdown` returns the single rolled-up `CostBreakdownResponse` with `rows: CostBreakdownRow[]`. No `day` field, no `bucketed_periods` field. Therefore escape (i) was the correct ship — documented as an Accepted Exception in the panel, in `docs/url-contract.md`, in the new vitest's data-shape-limitation pin test, and in this SUMMARY's Accepted Exception block.

The plan's Step 5 of Task 2 (CSS for the new column header) was SKIPPED because no column lands. The plan's Step 6 (testid registration) was VERIFIED-IN-REGISTRY (no new entries needed — the dynamic pattern from Plan 26-07 covers `compare-overlay-toggle-cost-by-project`).

## Accepted Exception — Prior-Period DeltaPill Column Deferred

**What:** `CostByProjectCard` mounts `<CompareToggle panelId="cost-by-project" />` in its chrome but does NOT render a prior-period DeltaPill column when the toggle is active.

**Why:** `useCostBreakdown('project', range)` returns `CostBreakdownResponse` where `rows: CostBreakdownRow[]`, and each row has only `key` + `tokens_*` + `cost_usd` — rolled-up totals over the requested window with NO time bucketing. Computing a "vs prior period" delta client-side requires bucketed data (mirror of `TokenUsageCard`'s `useTokens` which returns `items: [{day, ...}]` — a 30d fetch contains the prior 7 days of bucketed data that slicing `[-14, -7)` can extract). The cost endpoint has no bucketing dimension. Implementing this server-side would require either an `offset` param on `/api/cost/breakdown` or a new endpoint that returns per-day cost breakdown per project — backend work that the plan's Step 3 of Task 2 explicitly identified as out-of-scope for Phase 27 ("RESEARCH guardrail says 'no backend SkillRange widening'").

**Impact:** The CompareToggle's URL-write contract still lands — clicking writes `?compare_panels=cost-by-project` to the URL, reload preserves it, saved-view fork-save round-trips. A user toggling Compare on /cost sees no visible change in the panel today, but the URL state is preserved for forward compatibility. When the backend exposes bucketed cost-by-project data (future Phase 28+ ANLY-* requirement), adding the DeltaPill column is a localized panel change that doesn't break the existing URL contract.

**Pin:** New vitest case `'SC#2 (Accepted Exception escape path (i)): no prior-period DeltaPill column renders — data shape lacks bucketing'` asserts `container.querySelectorAll('.cmc-delta-pill').length === 0` AND `screen.queryByText(/vs prior period/i) === null` when `?compare_panels=cost-by-project` is set. This pins the current behavior — a future patch that adds the column without also wiring real prior-period data flags as a regression in CI.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Plan 27-05 ships clean. SC#2 surface FULLY SATISFIED at the URL-round-trip level + 80% at the visual-rendering level (the DeltaPill column is the deferred 20% per Accepted Exception). Ready for Plan 27-06 to apply the same vocab-bridge pattern on `/alerts` (AlertEventsList).**

- **Plan 27-06** (`/alerts` + AlertEventsList) can mirror the single-line adoption idiom verbatim — `useRouteRangeVocab('7d', snapToAlertRange)` (Plan 27-01 ships `snapToAlertRange` with identical bands to `snapToCostRange`). The `hasGlobalPicker` ternary is NOT needed because `/alerts` has no Phase 25 first-class filter (current alerts.tsx is "none in v1.2" per `docs/url-contract.md`). The CompareToggle pattern — including the escape-path (i) ship route if AlertEventsList's data shape lacks bucketing — is now precedent-set.
- **Plan 27-09** (close gate) will need to verify the Accepted Exception is correctly documented in `27-VISUAL-CHECK.md` (saved-view fork-save smoke test on `/cost` with `?compare_panels=cost-by-project` must succeed even though no column renders). The toggle's URL-round-trip contract is verified by `CostByProjectCard.compareOverlay.test.tsx`.
- **Future Phase 28+** can land the DeltaPill column additively if/when the backend exposes a bucketed cost-by-project endpoint. No URL contract changes needed at that time — only the panel internals.

**Parallel-safety note:** Wave 3 sibling plans (Plan 27-06 / 27-07) modify their own route files (`alerts.tsx` and others) — no file overlap with this plan. `cost.tsx` and `Cost*` panel files are exclusively owned by Plan 27-05.

**Phase 27 SC mapping:** SC#2 ("`/cost` 7d/30d picker re-query via global picker + long project paths truncate cleanly + compare-to-previous overlay (TIME-04) renders against last week / last 30d") is now satisfied at:
- ✅ Bounded surface (`cmc-page--bounded` on /cost + bounded on both panels)
- ✅ URL-driven range (global TimePicker re-anchors CostByProjectCard via snapToCostRange)
- ✅ TruncatedCell on project column (defensive wrap honors "long project paths truncate cleanly")
- ✅ CompareToggle mounted + URL-round-trip works (TIME-04 contract surface)
- ⚠️ DeltaPill column rendering DEFERRED (Accepted Exception — data-shape limitation, escape path (i))

End-to-end SC#2 verification will land in Plan 27-09 close gate via Playwright happy-path on `/cost` (TimePicker re-anchor + compare-toggle URL round-trip; visual capture pins the no-DeltaPill-column state as expected).

**REQ-ID coverage:** Plan 27-05 satisfies no direct REQ-ID (it's the adoption sweep; SC#2 is a route-adoption checklist, not a numbered requirement). REQ-IDs land in dependency closure at Plan 27-09 close.

## Self-Check: PASSED

- `[ -f frontend/src/routes/cost.tsx ]` → FOUND (modified)
- `[ -f frontend/src/components/panels/CostByProjectCard.tsx ]` → FOUND (modified)
- `[ -f frontend/src/components/panels/CostForecastCard.tsx ]` → FOUND (modified)
- `[ -f frontend/src/components/panels/__tests__/CostByProjectCard.test.tsx ]` → FOUND (modified)
- `[ -f frontend/src/components/panels/__tests__/CostByProjectCard.compareOverlay.test.tsx ]` → FOUND (new)
- `[ -f docs/url-contract.md ]` → FOUND (modified)
- `git log --oneline --all | grep b35fece` → FOUND (`feat(27-05): /cost route — validateSearch append + cmc-page--bounded + CostByProjectCard vocab bridge + TruncatedCell`)
- `git log --oneline --all | grep 2fabade` → FOUND (`feat(27-05): CostByProjectCard CompareToggle (TIME-04 URL round-trip only; DeltaPill column deferred per escape path (i))`)
- `grep "cmc-page--bounded" frontend/src/routes/cost.tsx` → 1 hit
- `grep -c "bounded" frontend/src/components/panels/CostByProjectCard.tsx frontend/src/components/panels/CostForecastCard.tsx` → CostByProjectCard=3, CostForecastCard=3 (≥2 each)
- `rg snapToCostRange frontend/src/components/panels/CostByProjectCard.tsx` → 3 hits (import + call + doc)
- `rg -c "<ResponsiveContainer" frontend/src/components/panels/` → 8 files × 1 each = 8 total (unchanged baseline; Phase 24 lock preserved)
- `pnpm tsc --noEmit + pnpm lint --max-warnings 0 + pnpm test --run src/components/panels/__tests__ + backend pytest tests/test_url_contract.py` — all clean (43/43 files, 206/206 tests, 2/2 url contract)

---
*Phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt*
*Completed: 2026-05-15*
