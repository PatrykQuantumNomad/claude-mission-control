# Phase 28 — VISUAL-CHECK

**Operator:** Patryk Golabek
**Date capture run:** 2026-05-17
**Date verdict signed:** _PENDING_ — operator fills after live walkthrough
**Phase:** 28 — Layout Customization
**Plan that produced this evidence:** 06 (close gate)
**Status:** **PROVISIONAL** — awaiting operator-signed verdict via live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001

**Capture commands:**

```
cd backend && uv run pytest
cd backend && uv run pytest tests/test_url_contract.py -v
cd frontend && pnpm test --run
cd frontend && pnpm exec playwright test
cd frontend && pnpm exec playwright test tests/e2e/v13-visual-capture.spec.ts -g "Phase 28"
cd frontend && pnpm exec playwright test tests/e2e/v13-a11y.spec.ts -g "Phase 28"
cd frontend && pnpm exec playwright test tests/e2e/v13-portal-containment.spec.ts
cd frontend && pnpm exec playwright test tests/e2e/v13-layout.spec.ts
cd frontend && pnpm exec vite build
```

**Captured PNGs:** `.planning/phases/28-layout-customization/visual-check/` (18 files: 3 surfaces × 3 densities × 2 themes — layout-default, layout-customized, compare-resized). Combined v1.3 visual surface to close: **138 PNGs** (36 Phase 24 + 30 Phase 25 + 30 Phase 26 + 24 Phase 27 + 18 Phase 28). Pitfall 10 cap honored exactly.

---

## ROADMAP Success Criteria Mapping

| SC# | Criterion (verbatim from ROADMAP Phase 28) | Status | Evidence |
|-----|-------------------------------------------|--------|----------|
| SC#1 | User opens the panel header DropdownMenu on `/`, hides "System Pressure", saves the layout into a saved view (or just leaves the URL state), navigates away, returns, and the panel stays hidden — the hidden state lives inside the saved view's `state_json` (additive, opaque, no schema break) | PASS (provisional pending operator) | v13-layout.spec.ts hide-and-persist tests on /, /activity, /cost, /skills, /alerts (5 LAYO-01 tests) + round-trip-with-saved-view test (1 test); SaveViewDialog UNTOUCHED — Phase 25 auto-capture pipeline round-trips hidden_panels via state_json (Pitfall 3 lock honored). Plan 28-03 closing commits e669258 + eccb5a7 + 45ab4c7. |
| SC#2 | User drags the divider on `/sessions/compare` to resize the left/right panes, refreshes the page, and the resize persists into URL state and the loaded saved view; double-click on the divider resets to the default 50/50 split | PASS (provisional pending operator) | v13-layout.spec.ts LAYO-03 4 tests (pointer-drag URL write, refresh restore 70/30, dblclick prune, chart svg DOM identity across 3 drag-cycles) + 1 NEW perf-probe (ResponsiveContainer DOM identity preserved); APPEND-ONLY validateSearch ?split_sizes via asSplitSizes (Pitfall 2 bare-URL gate); ResizablePanelGroup wrapper uses v4 vocabulary verbatim (Pitfall 1 grep gate clean). Plan 28-05 closing commits 5e26a5c + 8af2cae + 8bde9d9 + e908f0d. |
| SC#3 | User reorders panels within a column via 1D drag on `/cost` (no cross-column movement), the new order persists into the active saved view, and the reset-to-default affordance in the panel DropdownMenu clears layout overrides cleanly | PASS (provisional pending operator) | v13-layout.spec.ts LAYO-02 4 tests (mouse-drag on /cost + keyboard reorder on / and /cost + Escape-cancel on /cost) + LAYO-04 per-panel reset test on /cost (drops the three layout keys while time_from/time_to/compare_panels/range/a/b/schemaVersion survive verbatim — Pitfall 11 destructuring-delete lock validated end-to-end) + LAYO-04 SavedViewMenu Reset Layout test (skipped: chrome out of scope per Plan 28-02 escape-hatch path). cross-column drop REJECTED by handleDrop's source-vs-target columnId match (T-28-08 mitigated). Plan 28-04 closing commits 59a4c03 + 13880b7 + 2a0c594; Plan 28-02 commits 951cc92 + 0b48595 + e042402; Plan 28-03 commits e669258 + 45ab4c7. |
| SC#4 | `react-resizable-panels@4.11.0` is the only new runtime dependency added in Phase 28 — no `react-grid-layout`, no `dnd-kit`, no `@shadcn/ui`, no Tailwind; React DevTools profiler shows zero chart re-mounts during a layout drag (data memoized; `ResponsiveContainer` count unchanged); axe-core remains clean; visual checkpoint at `.planning/phases/28/VISUAL-CHECK.md` documents the closed milestone | PASS (provisional pending operator) | `pnpm list react-resizable-panels` → `4.11.0` exactly (single new runtime dep); `grep -c react-grid-layout package.json` → 0; `grep -c "@dnd-kit" package.json` → 0 (DraggablePanelWrap is native HTML5 dnd, 233 LOC); `grep -rE "^[[:space:]]*<ResponsiveContainer" frontend/src/components/panels/*.tsx \| wc -l` → 8 (Phase 24/26/27 lock); chart-svg DOM identity preserved across 3 drag-cycles on /sessions/compare per v13-layout.spec.ts:638; axe Phase-28-attributable blocking = 0 across 13 scans (5 default grip + 1 default split-pane + 5 layout-customized + 1 close-gate split-pane + 1 drag-grip aria). |
| SC#5 | Backend pytest + frontend vitest + Playwright e2e all green at phase close vs every prior v1.3 phase baseline; URL contract test (`tests/test_url_contract.py`) confirms every preserved URL pattern still resolves; v1.3 milestone close gate met | PASS (provisional pending operator) | backend pytest 690/0/0 (= Phase 27 close; no new backend tests in Phase 28 — expected, no schema changes); frontend vitest 754/0/0 (vs Phase 27 close 662 → +92 across Plans 28-01..06); Playwright 320 tests in 19 files (vs Phase 27 close ~243 → +77 net including 18 visual-capture + 7 a11y close-gate + 16 v13-layout + 6 v13-a11y Phase 28 default-state scans across Plans 28-04/05); URL contract pytest 2/2 PASS — all Phase 28 search-param extensions append-only per Pitfall 13 lock. |

## REQ-ID Closure

| REQ-ID | Description | Plan(s) | Status |
|--------|-------------|---------|--------|
| LAYO-01 | Per-route panel show/hide menu accessible via DropdownMenu in panel header (or page chrome). Hidden state persists into saved view's `state_json` (additive, opaque). | 28-03 | Complete |
| LAYO-02 | 1D drag-reorder of panels within columns (single-column reorder; no cross-column movement). Persists into saved view's `state_json`. | 28-04 | Complete |
| LAYO-03 | Split-pane resize via `react-resizable-panels@4.11.0` on `/sessions/compare` (left/right resize) and per-route shells where useful. Single new dep covers this. Drag handle + double-click to reset. | 28-05 | Complete |
| LAYO-04 | Reset-to-default affordance on every layout-customizable surface — "Reset layout" button in DropdownMenu clears `state_json` layout overrides. Prevents corrupt-state lock-in. | 28-02 (SavedViewMenu escape hatch — chrome half) + 28-03 (PanelHeaderMenu per-panel half) | Complete |

## Automated Evidence Summary

| Metric | Phase 27 close baseline | Phase 28 close measured | Delta | Status |
|--------|------------------------|-------------------------|-------|--------|
| Backend pytest | 690 / 0 / 0 | **690 / 0 / 0** | 0 | PASS — no new backend tests in Phase 28 (expected; Phase 28 ships zero backend changes — no migrations, no endpoints, no schemas) |
| Frontend vitest | 662 / 0 / 0 | **754 / 0 / 0** | +92 | PASS — Plans 28-01..06 vitest deltas: Plan 28-01 +52 todos consumed across Plans 02-05; Plan 28-02 +32; Plan 28-03 +5; Plan 28-04 +15; Plan 28-05 +6 (= +58 net Plan-28-attributable); cumulative 662 → 754 across all incremental waves |
| Playwright e2e | ~243 tests (24 NEW v13-tail-routes + 18 extensions = +42) | **320 tests in 19 files** | +77 net | PASS — Plan 28-01 +16 LAYO scaffolds; Plan 28-04 +5 Phase 28 axe scans (default grip); Plan 28-05 +5 Phase 28 axe scan (default split-pane) + +1 perf probe; Plan 28-06 +18 visual-capture + +7 a11y close-gate = +52 Plan-28-attributable + carry-over deltas |
| Bundle size (frontend/dist) | Phase 27 close baseline (CommandPalette chunk 389 kB / gzip 121 kB unchanged; Phase 27 ships ZERO new runtime deps) | **1.3 MB total dist; CommandPalette gzip 124.16 kB; SessionCompareView gzip 117.17 kB; panels gzip 38.64 kB; index gzip 106.30 kB; CSS gzip 9.39 kB** | +10.4 kB gzipped on SessionCompareView chunk (Plan 28-05 measured); other chunks within Phase-27 baseline | PASS — Pitfall 10 bundle delta budget ≤ 15 kB gzipped honored; the single new runtime dep (react-resizable-panels@4.11.0, ~10 kB minified+gzipped per npm registry maintainer disclosure) lives inside SessionCompareView's lazy-loaded chunk |
| Axe (Phase-28-attributable blocking) | 0 (PHASE_25 + PHASE_26 + PHASE_27 inversion) | **0** | 0 | PASS — PHASE_28_NET_CLASS_MARKERS inversion (Plan 28-04 added cmc-draggable-wrap + cmc-panel-grip + panel-drag-grip + panel-header-menu + panel-hide-* + panel-reset-layout-* + panel-grid-*) gates all 13 Phase 28 scans clean. v1.2 carry-overs (8 contrast + 2 Phase 06 vintage semantic patterns) continue flowing through unflagged (Pitfall 7 rebalance window — deferred to v1.4+ candidate). |
| Portal containment | 7/7 PASS (Phase 27 close — added +1 sentinel) | **7/7 PASS** | 0 | PASS — Plan 28-03's PanelHeaderMenu portal landing did NOT add a new attributable sentinel because the existing fixtures cover the cmc-dropdown class family (documented in 28-03-SUMMARY.md). This is an Accepted Exception below — the plan expected 8/8 but the actual sentinel count stays 7/7 because PanelHeaderMenu reuses the existing DropdownMenu portal infrastructure verified by Plans 24/25's tests. |
| URL contract pytest | 2/2 PASS | **2/2 PASS** | 0 | PASS — Phase 28 validateSearch extensions are APPEND-ONLY (hidden_panels + panel_order on /, /activity, /cost, /skills, /alerts; split_sizes on /sessions/compare) per Pitfall 13 lock; docs/url-contract.md extended in Plan 28-01 commit 8442e16 |
| Visual capture PNG total | 120 (96 + 24 Phase 27 tail routes) | **138** | +18 | PASS — Pitfall 10 cap of 18 NEW PNGs honored exactly (3 surfaces × 3 densities × 2 themes); cumulative v1.3 visual budget = 138 at milestone close |
| ResponsiveContainer count | 8 across 8 panel files | **8 across 8 panel files** | 0 | PASS — Phase 24/26/27 lock preserved; Phase 28 added zero charts (DraggablePanelWrap is HTML5 dnd, not a chart; ResizablePanelGroup wraps existing PanelCard contents without introducing new ResponsiveContainer instances) |
| Frontend `pnpm tsc --noEmit` | clean | **clean** | — | PASS |
| Frontend `pnpm eslint --max-warnings 0` | clean | **clean** | — | PASS |
| Frontend `pnpm exec vite build` | clean | **clean** (built in 369ms) | — | PASS — no Vite asset-budget warnings; SessionCompareView chunk +10.4 KB gzipped over Phase 27 baseline (budget ≤15 KB) |

---

## Visual capture verdict — Phase 28 new layout-customization chrome (18 NEW PNGs)

Operator: open each PNG in alpha order under `.planning/phases/28-layout-customization/visual-check/`, mark PASS/FAIL, add notes. Pass criteria: layout-default renders without customization; layout-customized clearly shows the hidden panel removed + reorder applied; compare-resized clearly shows the 70/30 split; density tokens visibly differ (compact tighter / cozy roomier vs comfortable reference); theme parity preserved across dark/light variants.

| PNG | Surface | Density | Theme | Operator verdict |
|-----|---------|---------|-------|------------------|
| compare-resized__comfortable__dark.png | compare-resized (split:70/30) | comfortable | dark | [ ] |
| compare-resized__comfortable__light.png | compare-resized (split:70/30) | comfortable | light | [ ] |
| compare-resized__compact__dark.png | compare-resized (split:70/30) | compact | dark | [ ] |
| compare-resized__compact__light.png | compare-resized (split:70/30) | compact | light | [ ] |
| compare-resized__cozy__dark.png | compare-resized (split:70/30) | cozy | dark | [ ] |
| compare-resized__cozy__light.png | compare-resized (split:70/30) | cozy | light | [ ] |
| layout-customized__comfortable__dark.png | layout-customized (token-usage hidden + reorder) | comfortable | dark | [ ] |
| layout-customized__comfortable__light.png | layout-customized (token-usage hidden + reorder) | comfortable | light | [ ] |
| layout-customized__compact__dark.png | layout-customized (token-usage hidden + reorder) | compact | dark | [ ] |
| layout-customized__compact__light.png | layout-customized (token-usage hidden + reorder) | compact | light | [ ] |
| layout-customized__cozy__dark.png | layout-customized (token-usage hidden + reorder) | cozy | dark | [ ] |
| layout-customized__cozy__light.png | layout-customized (token-usage hidden + reorder) | cozy | light | [ ] |
| layout-default__comfortable__dark.png | layout-default (bare URL) | comfortable | dark | [ ] |
| layout-default__comfortable__light.png | layout-default (bare URL) | comfortable | light | [ ] |
| layout-default__compact__dark.png | layout-default (bare URL) | compact | dark | [ ] |
| layout-default__compact__light.png | layout-default (bare URL) | compact | light | [ ] |
| layout-default__cozy__dark.png | layout-default (bare URL) | cozy | dark | [ ] |
| layout-default__cozy__light.png | layout-default (bare URL) | cozy | light | [ ] |

---

## Backend pytest gate

**Run:** `cd backend && uv run pytest --tb=no`
**Result:** **690 passed, 0 failed, 0 skipped, 32 warnings** (= Phase 27 close baseline; Phase 28 ships zero backend changes)

Breakdown vs Phase 27 close:
- Phase 28 added zero backend tests (no new migrations, no new endpoints, no schema changes). All layout state lives in URL search params + saved view `state_json` (opaque to backend per VIEW-03 contract).
- Net: 0 backend pytest delta — expected.

The 32 warnings remain Phase 06-vintage aiosqlite Python 3.12+ datetime adapter deprecations — pre-existing carry-over, not phase-attributable.

---

## Frontend vitest gate

**Run:** `cd frontend && pnpm test --run`
**Result:** **754 passed, 0 failed, 0 skipped** across 112 test files (vs Phase 27 close 662 → delta +92 across Plans 28-01..06)

Plan-by-plan deltas captured in each 28-XX-SUMMARY.md; net +92 across the 5 implementation plans + 1 close-gate plan (Plan 28-06 is e2e-only; vitest delta zero).

---

## Frontend typecheck + lint + build

| Check | Result |
| ----- | ------ |
| `pnpm tsc --noEmit` | **clean** (no output / exit 0) |
| `pnpm exec eslint src --max-warnings 0` | **exit 0** |
| `pnpm exec vite build` | **clean** (built in 369ms; CommandPalette chunk gzip 124.16 kB; SessionCompareView gzip 117.17 kB — +10.4 kB on SessionCompareView vs Phase 27 close, attributable to react-resizable-panels@4.11.0 lazy-loaded with the route chunk; total dist 1.3 MB; no Vite asset-budget warnings) |

---

## URL contract gate (POLI-13)

**Run:** `cd backend && uv run pytest tests/test_url_contract.py -v`
**Result:** **2/2 PASS**

Phase 28 added 3 new APPEND-ONLY search params per Pitfall 13:
- `hidden_panels?: string` on / + /activity + /cost + /skills + /alerts (LAYO-01, validateSearch via asHiddenPanels)
- `panel_order?: string` on / + /activity + /cost + /skills + /alerts (LAYO-02, validateSearch via asPanelOrder)
- `split_sizes?: string` on /sessions/compare (LAYO-03, validateSearch via asSplitSizes)

All optional, default `undefined`. Bidirectional doc-route contract intact: every documented route resolves to a file in `frontend/src/routes/`; every route file is documented in `docs/url-contract.md` (Plan 28-01 commit 8442e16 extended Phase 28 effects section + Locked invariants subsection).

---

## Phase 28 e2e cascade summary

The Phase 28 close gate adds **18 NEW visual-capture PNGs** in `v13-visual-capture.spec.ts` + **7 NEW close-gate axe scans** in `v13-a11y.spec.ts` on top of the v13-layout test family that Plans 28-01..05 incrementally landed:

| Spec | Phase 27 close | Phase 28 close (NEW Phase-28-attributable) | Status |
| ---- | -------------- | ------------------------------------------ | ------ |
| `v13-layout.spec.ts` (NEW Phase 28) | — | **16 tests** (15 pass + 1 skip; Plan 28-02 SavedViewMenu Reset Layout chrome out of scope) | NEW |
| `v13-a11y.spec.ts` | 44 (43 pass + 1 env-skip) | +6 Plan 28-04/05 default-state grip + split-pane scans + +7 Plan 28-06 close-gate scans (5 layout-customized + 1 close-gate split-pane + 1 drag-grip aria) = **57 total Phase 28 = 13 / overall ~62 tests** | extended |
| `v13-visual-capture.spec.ts` | 120 PNG-generating tests | **+18 Plan 28-06 close-gate PNGs (layout-default × 6 + layout-customized × 6 + compare-resized × 6)** = 138 total | extended |
| `v13-portal-containment.spec.ts` | 7 tests | **7 tests (unchanged)** — PanelHeaderMenu portal landing reuses existing DropdownMenu cmc-dropdown class family covered by Plan 24/25 fixtures; documented in 28-03-SUMMARY.md | unchanged |

**Total Playwright at Phase 28 close:** 320 tests in 19 files (vs Phase 27 close ~243 → +77 net).

**Skips note:** v13-layout.spec.ts:517 (SavedViewMenu Reset Layout chrome) is intentionally skipped — Plan 28-02 ships the SavedViewMenu Reset Layout escape hatch as the LAYO-04 chrome half, but the in-spec test is out of scope per the plan's RESEARCH §7 + A2 documentation. The per-panel PanelHeaderMenu Reset Layout path (Plan 28-03) covers the same LAYO-04 contract end-to-end and IS exercised; the SavedViewMenu chrome is functionally identical and validated by its component-level vitest cases.

---

## Accepted Exceptions

Phase 24 + Phase 25 + Phase 26 + Phase 27 close's Accepted Exceptions tables are **carried forward unchanged**.

### Pre-positioned Accepted Exception #1 (deferred to v1.4+)

**`/skills/$name` show/hide deferred to v1.4** — RESEARCH.md §5 + Question 11 Pitfall 12 documented that `/skills/$name` is single-column-stack (4 + 1 panels in one column) where show/hide provides marginal value over the global reset path. The route is intentionally OUT of `PANEL_REGISTRY` for layout-customization (RESEARCH §5 A3) — `useLayoutState.isHidden` returns false unconditionally for unknown routes (defense in depth — `isValidPanelId` returns false). SavedViewMenu's Reset Layout `safeRouteSlug()` try/catch handles the out-of-scope route gracefully (renders no Reset Layout item there).

**Operator action:** confirm acceptance.

### Pre-positioned Accepted Exception #2 (deferred to v1.4+)

**LAYO-05 (full 2D grid via `react-grid-layout`)** — DEFERRED per REQUIREMENTS.md to v1.4+; blocked by GitHub Issue #2045 (React 19.2 key-prop warnings). Show/hide + 1D reorder + split-pane resize ship in v1.3 (LAYO-01..04 all satisfied) and cover the expected need per the v1.3 success criteria. Re-evaluate only after upstream resolves Issue #2045 AND v1.3 ships prove the 1D approach insufficient.

**Operator action:** confirm acceptance.

### Pre-positioned Accepted Exception #3 (out of scope)

**CMPR-10 (3+ way compare)** — DEFERRED per REQUIREMENTS.md, OUT OF SCOPE for v1.3. No reference product (Honeycomb/Datadog/PostHog/Grafana/Linear) ships >2-way compare; layout collapses below 1024px; value-per-pane drops sharply. Re-evaluate only if user names a concrete triangulation workflow.

**Operator action:** confirm acceptance.

### Pre-positioned Accepted Exception #4 (portal containment count carry-forward)

**Portal containment stays at 7/7 PASS (not 8/8 as initially anticipated)** — Plan 28-03 introduced PanelHeaderMenu (Radix DropdownMenu) on every panel header on 5 in-scope routes. The plan's anticipated "+1 sentinel" did NOT materialize because PanelHeaderMenu reuses the existing `cmc-dropdown` class family covered by Plan 24/25's portal-containment fixtures — the existing 7 fixtures cover the new portal landing transitively. No regression risk: the portal containment test suite asserts no transform-ancestor traps any Radix Portal content; the Phase 28 DropdownMenu instances are subject to the same assertion via the existing density-toggle / command-palette fixtures.

**Operator action:** confirm acceptance OR escalate to gap-closure plan adding a Phase-28-attributable sentinel (PanelHeaderMenu DropdownMenu content) to v13-portal-containment.spec.ts.

### Pre-positioned Accepted Exception #5 (deviation — already documented in Plan 28-05)

**v4 Layout shape + 5 Rule-1 fixes during Plan 28-05 ResizablePanelGroup integration** — Plan 28-05 closed with 6 documented Rule-1 deviations (v4 Layout type is `{[panelId]: number}` not `number[]` as RESEARCH.md §1 stated; Separator data-testid override via id prop; Panel sizes as STRINGS '50%' not numeric 50 — numeric resolves to PIXELS per v4 docs; data-panel boolean marker not value-bearing → switched to #side-a id selector; URL-encoded %3A/%2C regex acceptance; eslint-disable cmc/testid-registry-only for mock-internal rrp-* testids). All are self-healed during the originating plan and documented in 28-05-SUMMARY.md.

**Operator action:** confirm acceptance.

### Pre-positioned Accepted Exception #6 (deviation — already documented in Plan 28-04)

**3 Rule-1 fixes during Plan 28-04 DraggablePanelWrap integration** — Plan 28-04 closed with 3 documented Rule-1 deviations (data-panel-id collision → wrapper attribute renamed to data-drag-wrap-id; display: contents grid layout collision → switched to position: relative + absolute grip overlay; /alerts registry vocabulary fix: alert-events-list 'main' → 'below' to mirror the route's two-grid layout). All are self-healed during the originating plan and documented in 28-04-SUMMARY.md.

**Operator action:** confirm acceptance.

### Pre-positioned Accepted Exception #7 (verification-discovered fix, if any)

If the operator walkthrough surfaces any Rule-1 self-heal during the live session, document the discovery here with: (1) what surfaced; (2) what was fixed; (3) the commit hash. Mirror the Phase 26 `e838135` / Phase 27 `d76a95b` close-gate precedent — close-gate fixes are accepted as Rule-1 deviations landing inside the close-gate cascade itself.

**Operator action:** N/A unless a fix is needed during walkthrough.

---

## Manual operator steps (require browser)

The automated gates above ground the close-gate decision in evidence. The operator's role mirrors Phase 24/25/26/27 close-gates: spot-check the visual matrix, exercise the interactive flows, and sign the verdict.

### 1. Boot the dev stack

```bash
cd backend && uv run uvicorn cmc.app.factory:create_app --factory --host 127.0.0.1 --port 8765 &
cd frontend && pnpm dev &
```

Open http://localhost:5173 in Chrome (or Chrome DevTools MCP-controlled session).

### 2. Visual matrix review (~5-10 min for the 18 NEW Phase 28 PNGs)

Open `.planning/phases/28-layout-customization/visual-check/` in Finder. Iterate through all 18 PNGs in alpha order. For each:

- **PASS** if:
  - `layout-default` renders with all default panels visible (no customization)
  - `layout-customized` clearly shows the token-usage panel REMOVED + remaining panels in the cache-efficiency/session-outcomes-leading order
  - `compare-resized` clearly shows the left pane wider than the right (~70/30 ratio) with the Separator drawn between
  - Density tokens visibly differ (compact tighter / cozy roomier vs comfortable reference)
  - Theme parity preserved across dark/light variants
- **FAIL** if any of the above breaks.

Mark each row in the **Visual capture verdict** table above.

### 3. Interactive exercise (LAYO-01..04 success criteria)

**LAYO-01 — Show/hide:**

1. Navigate to `/` — verify panel headers show the Settings-icon DropdownMenu trigger (`cmc-density-toggle` style, mounted in panel header chrome slot).
2. Open a panel's menu (e.g., token-usage) → click "Hide" → verify panel disappears AND URL gains `?hidden_panels=token-usage`.
3. Repeat on `/activity`, `/cost`, `/skills`, `/alerts` (one panel each).

**LAYO-04 — Per-panel Reset:**

4. With a panel hidden on `/`, open another visible panel's menu → click "Reset layout" → verify hidden panel reappears + sonner toast "Layout reset" + URL drops `hidden_panels` + `panel_order` + `split_sizes` keys + `time_from`/`time_to`/`compare_panels` preserved (set range via the TimePicker first to verify preservation).

**LAYO-04 — SavedViewMenu Reset (escape hatch):**

5. Hide every panel on `/cost` (only 2 panels — should be trivial to hide both).
6. Without a panel header to access, open SavedViewMenu from AppShellHeader → click "Reset layout" → verify all panels reappear + toast.

**LAYO-02 — Drag-reorder:**

7. On `/cost`, drag the panel grip on `cost-by-project` up above `cost-forecast` → verify visual reorder + URL gains `panel_order=main:cost-by-project,cost-forecast`.
8. Reload → verify order persists.
9. Keyboard test: Tab to a grip, press Space (`aria-pressed=true`, screen-reader-equivalent announcement appears via DevTools as a status role with new text), ArrowDown, Enter → verify reorder committed.
10. Press Esc on a grabbed grip → verify cancel announces "Reorder canceled" via the aria-live region.

**LAYO-03 — Split-pane:**

11. Navigate to `/sessions/compare?a=<a>&b=<b>` (pick two valid session ids from `GET /api/sessions?limit=2`).
12. Drag the Separator between the two sides → verify URL gains `split_sizes=compare:<a>,<b>` on release (release-only writes per Plan 28-05 Pitfall 6 perf gate).
13. Reload → verify dragged ratio persists.
14. Double-click the Separator → verify 50/50 reset + URL drops `split_sizes` entirely (Pitfall 2 bare-URL gate).

**Round-trip via saved view:**

15. Hide a panel on `/`, save view as "Compact home" via SaveViewDialog.
16. Navigate to `/cost`, open SavedViewMenu → select "Compact home" → verify URL has `hidden_panels=...` + the panel is hidden (state_json round-trip via Phase 25 auto-capture pipeline, no SaveViewDialog edits — Pitfall 3 lock).

### 4. Console errors review

Open browser DevTools Console. Navigate around (/, /activity, /sessions/compare, /skills, /cost, /alerts). Exercise hide / reorder / split-pane / reset flows. **PASS condition:** no NEW errors attributable to Phase 28 work. The pre-existing 404 pattern on `/api/system/state?key=emergency_stop` (Phase 26 close baseline) remains acceptable.

### 5. Acknowledge Accepted Exceptions

Confirm sign-off on Accepted Exceptions #1-7 above (or escalate any).

### 6. Sign the verdict

Fill the Visual capture verdict table (column 5 — operator's per-cell PASS/FAIL/EXCEPTION).

Then complete the **Phase verdict** block below (replace `_PENDING_` with PASS or FAIL + today's date).

If any LAYO behavior failed in steps 1-16: do NOT sign PASS; instead, return to the planner via "blocked: <failure>" so a gap-closure plan can run.

---

## Phase verdict

**Operator verdict:** _PENDING_ — signed _YYYY-MM-DD_ by Patryk Golabek via live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001.

**v1.3 milestone close:** Phase 28 close advances v1.3 from 4/5 phases to 5/5 phases; 41/45 → 45/45 active requirements; v1.3 milestone shipped — all LAYO-01..04 satisfied with the single agreed runtime dep (`react-resizable-panels@4.11.0` at exact pin) and APPEND-ONLY URL contract preserved across all v1.3 phases (Pitfall 13 lock).

---

## Self-Check (automated artifacts produced by Plan 28-06)

- [x] 18 NEW v13-visual-capture.spec.ts Phase 28 test cells authored (3 surfaces × 3 densities × 2 themes) — 18/18 PASS at run; PNGs landed at `.planning/phases/28-layout-customization/visual-check/` (gitignored)
- [x] 7 NEW v13-a11y.spec.ts close-gate scans authored (5 layout-customized URL variants + 1 close-gate split-pane + 1 drag-grip aria attribute contract) — 7/7 PASS at run
- [x] 28-VISUAL-CHECK.md authored with all 9 required sections per RESEARCH.md §8: (1) front matter, (2) capture commands, (3) captured PNGs directory + count, (4) ROADMAP SC mapping table (5 rows SC#1..SC#5), (5) REQ-ID closure table (4 rows LAYO-01..04), (6) automated evidence summary, (7) visual capture verdict (18 rows), (8) Accepted Exceptions, (9) Operator verdict line (PENDING — operator fills)
- [x] Backend `uv run pytest` 690/0/0 (= Phase 27 close; Phase 28 ships zero backend changes — expected)
- [x] Frontend `pnpm test --run` 754/0/0 (+92 vs Phase 27 close)
- [x] Frontend `pnpm tsc --noEmit` clean
- [x] Frontend `pnpm exec eslint src --max-warnings 0` clean
- [x] Frontend `pnpm exec vite build` clean (built in 369ms; SessionCompareView chunk +10.4 KB gzipped over Phase 27 baseline; budget ≤15 KB honored)
- [x] Backend `uv run pytest tests/test_url_contract.py` 2/2 PASS
- [x] ResponsiveContainer count = 8 across 8 panel files (= Phase 24/26/27 lock preserved; Phase 28 added zero charts)
- [x] PHASE_28_NET_CLASS_MARKERS inversion filter wired into base axe matrix (Plan 28-04); all 13 Phase 28 axe scans PASS Phase-28-attributable check
- [x] Pre-positioned Accepted Exceptions: (#1) /skills/$name show/hide deferred to v1.4; (#2) LAYO-05 deferred to v1.4+; (#3) CMPR-10 OUT OF SCOPE; (#4) portal containment stays 7/7 (PanelHeaderMenu reuses cmc-dropdown class family fixtures); (#5) 6 Plan 28-05 Rule-1 deviations carried over; (#6) 3 Plan 28-04 Rule-1 deviations carried over; (#7) verification-discovered fix placeholder
- [ ] **Operator visual matrix verdict** — PENDING — operator fills the Visual capture verdict table after live walkthrough
- [ ] **Operator interactive criteria 1-5 verification** — PENDING — operator runs live Chrome DevTools MCP walkthrough against http://localhost:5173 + backend on :8001
- [ ] **Operator verdict signature** — PENDING — operator replaces `_PENDING_` with PASS + signed date
