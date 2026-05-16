---
phase: 24-shell-density-containment-primitives
verified: 2026-05-10T00:00:00Z
status: passed
score: 5/5
overrides_applied: 0
---

# Phase 24: Shell + Density + Containment Primitives — Verification Report

**Phase Goal:** Lay every primitive and quality-gate the rest of v1.3 will consume — fix the three overflow bugs globally, establish 3-tier density, extract `AppShellHeader`, install Radix Popover/DropdownMenu, document z-index ladder + URL contract + testid registry, and gate every future phase behind a formal visual checkpoint + axe-core + perf budget pattern. No per-route work.
**Verified:** 2026-05-10T00:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | User toggles density (Compact / Comfortable / Cozy) via top-bar control and the entire dashboard re-spaces with no flash, no layout shift, no React re-renders (CSS-only swap), and the choice persists across reloads | VERIFIED | `DensityToggle.tsx` uses Radix DropdownMenu wired to `setDensity()` which writes `localStorage['cmc.density']` + `<html data-density>`. `DensityProvider` is explicitly NOT a React Context; density consumers read CSS cascade only. `main.tsx` calls `applyDensity()` before `ReactDOM.createRoot`. DOM-identity probe (24-VISUAL-CHECK.md perf table): 3/3 chart markers + 15/15 card markers preserved across two density flips — zero React re-mounts. CSS tokens verified: `--cmc-padding-card` 24→16→32px; `--cmc-size-body` 14→13→16px. v13-density.spec.ts: 2/2 PASS — localStorage + `dataset.density` persistence + cascade to Radix Portal DropdownMenu (cozy 16px). |
| 2  | User opens any Sheet, Popover, or DropdownMenu on any existing route and the overlay renders inside the viewport with correct z-index, never clipped by an ancestor's `overflow: hidden` and never escaping the stacking context | VERIFIED | `styles.css` line 364: `.cmc-btn:hover:not(:disabled)` replaced with `top: -2px; box-shadow` (no transform). All 11 `--cmc-z-*` CSS variables defined on `:root` (lines 88-99) matching `docs/z-index-ladder.md` exactly. 24-TRANSFORM-AUDIT.md documents every transform site; only `.cmc-btn:hover` was a real offender — mitigated in Plan 01. v13-portal-containment.spec.ts: 3/3 PASS (density dropdown, cmdk palette, button hover regression guard). No raw `zIndex: <number>` literals found in any `.tsx` file. `@radix-ui/react-popover` and `@radix-ui/react-dropdown-menu` installed in `node_modules`. |
| 3  | User scrolls a long table inside any panel and the panel itself stays bounded — internal scroll appears, the page does not grow taller than the viewport, and long cell content truncates with tooltip-on-hover (primitives shipped, per-route adoption Phase 26/27) | VERIFIED (primitive-availability basis per phase contract) | `BoundedPanelCard.tsx` ships as a substantive React component wrapping `PanelCard bounded`. `PanelCard` has `bounded?: boolean` prop emitting `.cmc-card--bounded` class. `.cmc-card--bounded` + `.cmc-page--bounded` CSS classes defined in `styles.css` lines 2030-2065 with correct `min-height:0 / overflow-y:auto` containment ladder. `.cmc-card` gets `min-width:0` (line 333). `TruncatedCell.tsx` uses ResizeObserver-driven `scrollWidth > clientWidth` overflow detection, wraps in Radix Tooltip when overflowing. `CopyIconButton.tsx` implements hover-revealed clipboard copy with `stopPropagation`. `DataTable.tsx` imports and applies `TruncatedCell` on string columns (line 175). vitest coverage: 4 BoundedPanelCard + 4 TruncatedCell + 4 CopyIconButton unit tests pass. Per phase design contract, no route adopts these yet — adoption is Phase 26/27. |
| 4  | User collapses the new left sidebar to icon-only via toggle or keyboard shortcut, the choice persists in localStorage across reloads, and the active route stays visually highlighted in either expanded or icon-only mode | VERIFIED | `Sidebar.tsx` implements Cmd+B/Ctrl+B `window.addEventListener('keydown')` + chrome button `sidebar-collapse-toggle`. `lib/sidebar.ts` writes `localStorage['cmc.sidebar.collapsed']` + `<html data-sidebar-collapsed>`. `main.tsx` calls `applySidebar()` before `ReactDOM.createRoot` (no width-flash). `SidebarNavLink.tsx` uses TanStack Router `activeProps` for `cmc-sidebar__navlink--active` class; `3px border-left` accent-blue survives collapse. `SidebarNavLink` wraps in Radix Tooltip (`side="right"`) when collapsed. NavBar.tsx confirmed DELETED. 24-VISUAL-CHECK.md operator notes: Cmd+B measured sidebar at 53px (target 52, border tolerance); `localStorage['cmc.sidebar.collapsed'] === 'true'` + persistence across reload; active bar 3px `border-left-width` + `rgba(77,124,255,0.1)` background. v13-sidebar.spec.ts: 2/2 PASS. vitest Sidebar: 5 tests pass. |
| 5  | Phase ships with: `docs/z-index-ladder.md`, `docs/url-contract.md` + `tests/test_url_contract.py`, `docs/affordance-checklist.md` (15 affordances), `docs/testid-registry.md` + ESLint rule; axe-core wired into Playwright; perf evidence; visual checkpoint at correct path; backend pytest + frontend vitest + Playwright e2e all green vs Phase 18 baseline | VERIFIED | All four docs exist and are substantive (verified by read). `backend/tests/test_url_contract.py` exists with two bidirectional tests. `frontend/eslint-rules/testid-registry-only.cjs` and `no-raw-z-index.cjs` exist with full implementations; wired via `frontend/eslint.config.js` as `'cmc/testid-registry-only': 'error'` and `'cmc/no-raw-z-index': 'error'`. `@axe-core/playwright ^4.11.3` in `package.json` + installed in `node_modules`; `v13-a11y.spec.ts` runs 30 runs (5 routes × 3 densities × 2 themes). `frontend/lighthouserc.json` exists with 3-URL CWV assertions (LCP 2500ms, CLS 0.1, performance 0.9). 9 Lighthouse reports in `.lighthouseci/` — representative runs: LCP 572/565/586ms, CLS 0/0.003/0, perf score 1.0. Visual checkpoint at `.planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md` (operator PASS signed 2026-05-12, 42 PNGs including 36 matrix + 6 operator screenshots). Test counts: backend 663/0/0 (+2 vs v1.2 baseline 661); frontend vitest 353/0/0 (+27 vs v1.2 baseline 326). 7 v13-*.spec.ts Playwright specs present (20 total tests: 18 pass + 2 forward-compat SKIP). |

**Score:** 5/5 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/lib/density.ts` | getDensity, setDensity, applyDensity exports | VERIFIED | All three exports present; `setDensity` writes localStorage + `<html data-density>` |
| `frontend/src/lib/sidebar.ts` | isSidebarCollapsed, setSidebarCollapsed, applySidebar exports | VERIFIED | All three exports; mirrors density.ts pattern exactly |
| `frontend/src/components/shell/DensityProvider.tsx` | Non-context mount-time applyDensity caller | VERIFIED | Explicit `INTENTIONALLY NOT A CONTEXT` comment; `useEffect(() => applyDensity(), [])` |
| `frontend/src/components/shell/DensityToggle.tsx` | Radix DropdownMenu with three density tiers | VERIFIED | `@radix-ui/react-dropdown-menu` import; 3 `DropdownMenu.Item` elements; portal-mounted content |
| `frontend/src/components/shell/Sidebar.tsx` | Collapsed sidebar, Cmd+B, active-route, SidebarSection/SidebarNavLink composition | VERIFIED | 136 lines; window-level keydown; `isSidebarCollapsed` + `setSidebarCollapsed` wired |
| `frontend/src/components/shell/SidebarNavLink.tsx` | TanStack Link with activeProps + Radix Tooltip in collapsed mode | VERIFIED | `activeProps` + `Tooltip` when `collapsed === true` |
| `frontend/src/components/shell/SidebarSection.tsx` | Section header wrapper | VERIFIED | Optional children for Configure section |
| `frontend/src/components/shell/AppShellHeader.tsx` | Extracted top-bar with DensityToggle, placeholder buttons | VERIFIED | `time-picker-trigger` + `save-view-button` as `display:none` placeholders |
| `frontend/src/components/shell/AppShell.tsx` | DensityProvider in provider stack; Sidebar + AppShellHeader | VERIFIED | Provider stack: ActiveSessionProvider > TaskComposerProvider > DensityProvider > shell layout |
| `frontend/src/components/ui/BoundedPanelCard.tsx` | PanelCard wrapper with bounded forced true | VERIFIED | 30-line substantive component |
| `frontend/src/components/ui/TruncatedCell.tsx` | ResizeObserver overflow detection + Tooltip + CopyIconButton | VERIFIED | ResizeObserver + scrollWidth > clientWidth check; 4 rendering paths documented |
| `frontend/src/components/ui/CopyIconButton.tsx` | Clipboard write + stopPropagation + 1200ms state | VERIFIED | navigator.clipboard.writeText; `data-state="copied"` for 1200ms |
| `frontend/src/components/ui/DataTable.tsx` | TruncatedCell integration | VERIFIED | Imported and used on line 175 for string-valued columns |
| `frontend/src/components/ui/PanelCard.tsx` | bounded?: boolean prop + cmc-card--bounded class | VERIFIED | Opt-in `bounded` prop; `className={bounded ? 'cmc-card--bounded' : ''}` |
| `frontend/src/styles.css` | density tokens on :root, --cmc-z-* ladder, .cmc-page--bounded, .cmc-card--bounded, min-width:0 on .cmc-card | VERIFIED | All verified: lines 55-171 (density), 88-99 (z-index), 2030-2065 (bounded), 333 (min-width:0) |
| `docs/z-index-ladder.md` | 11 named layers, ESLint enforcement section | VERIFIED | All 11 layers documented; conflict history section present |
| `docs/url-contract.md` | 7-row route table, stability rules, test gate description | VERIFIED | Bidirectional contract; Phase 24 effects section; future-proof additive rules |
| `docs/affordance-checklist.md` | 15 enumerated affordances | VERIFIED | Exactly 15 rows in table; Phase 24-introduced affordances noted |
| `docs/testid-registry.md` | Static + dynamic testid registry | VERIFIED | Phase 24 shell testids + v1.2 baseline testids; skip count locked at 2 |
| `backend/tests/test_url_contract.py` | Two bidirectional URL contract pytest tests | VERIFIED | `test_url_contract_documented_routes_exist` + `test_url_contract_route_tree_is_documented` |
| `frontend/tests/e2e/v13-visual-capture.spec.ts` | 36-PNG matrix capture spec | VERIFIED | 6 routes × 3 densities × 2 themes |
| `frontend/tests/e2e/v13-a11y.spec.ts` | axe-core 30-run matrix | VERIFIED | 5 routes × 3 densities × 2 themes; serious/critical violations block |
| `frontend/tests/e2e/v13-portal-containment.spec.ts` | 3 portal containment tests | VERIFIED | Density dropdown, cmdk, button hover regression guard |
| `frontend/tests/e2e/v13-sidebar.spec.ts` | Sidebar collapse + persistence + active-route + tooltip tests | VERIFIED | 2 tests passing |
| `frontend/tests/e2e/v13-density.spec.ts` | Density persistence + Portal cascade tests | VERIFIED | 2 tests passing |
| `frontend/tests/e2e/v13-truncation.spec.ts` | TruncatedCell overflow + tooltip e2e | VERIFIED | Forward-compat SKIP by design when no overflow in demo data |
| `frontend/tests/e2e/v13-copy-cell.spec.ts` | CopyIconButton e2e | VERIFIED | Forward-compat SKIP by design when no copyable cells in demo data |
| `frontend/lighthouserc.json` | CWV assertions for 3 URLs | VERIFIED | LCP 2500ms / CLS 0.1 / performance 0.9 assertions; INP excluded with documented rationale |
| `frontend/eslint.config.js` | Flat config with cmc/testid-registry-only + cmc/no-raw-z-index as errors | VERIFIED | Both rules at `'error'` severity on `src/**` + `tests/**` |
| `frontend/eslint-rules/testid-registry-only.cjs` | Registry-loading ESLint rule | VERIFIED | Parses `docs/testid-registry.md`; handles static + dynamic template testids |
| `frontend/eslint-rules/no-raw-z-index.cjs` | z-index integer ban rule | VERIFIED | Bans `zIndex: <number>` in JSX inline style |
| `frontend/src/components/shell/NavBar.tsx` | Must NOT exist (deleted) | VERIFIED | File absent — confirmed via filesystem check |
| `.planning/phases/24-shell-density-containment-primitives/visual-check/` | 36+ PNG files | VERIFIED | 42 files present (36 matrix + 6 operator screenshots) |
| `frontend/.lighthouseci/manifest.json` | 9 Lighthouse reports | VERIFIED | 9 runs; representative runs: LCP 572/565/586ms, CLS 0/0.003/0, perf 1.0 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `main.tsx` | `lib/density.ts`.applyDensity | direct import + call before ReactDOM.createRoot | WIRED | Lines 5 + 16 in main.tsx |
| `main.tsx` | `lib/sidebar.ts`.applySidebar | direct import + call before ReactDOM.createRoot | WIRED | Lines 7 + 18 in main.tsx |
| `AppShell.tsx` | `DensityProvider` | import + JSX in provider stack | WIRED | Provider stack wraps all shell children |
| `DensityToggle.tsx` | `lib/density.ts`.setDensity / getDensity | direct import; called in onSelect + useEffect | WIRED | `setDensity(t.value)` in `DropdownMenu.Item.onSelect` |
| `Sidebar.tsx` | `lib/sidebar.ts`.setSidebarCollapsed / isSidebarCollapsed | direct import; called in toggle() + useEffect | WIRED | Both keydown handler and click handler call setSidebarCollapsed |
| `SidebarNavLink.tsx` | `Tooltip` (Radix-portaled) | conditional wrapper when `collapsed === true` | WIRED | `return collapsed ? <Tooltip ...>{link}</Tooltip> : link` |
| `AppShellHeader.tsx` | `DensityToggle` | direct import + JSX render | WIRED | `<DensityToggle />` in right action area |
| `BoundedPanelCard.tsx` | `PanelCard` bounded prop | `<PanelCard<T> {...props} bounded />` | WIRED | Forces bounded=true on all BoundedPanelCard instances |
| `DataTable.tsx` | `TruncatedCell` | import + conditional JSX on line 175 | WIRED | Auto-wraps string-valued cells; `copyable={col.copyable}` propagated |
| `PanelCard.tsx` | `.cmc-card--bounded` CSS class | `className={bounded ? 'cmc-card--bounded' : ''}` | WIRED | Connects React prop to CSS containment chain |
| `eslint.config.js` | `eslint-rules/index.cjs` | `createRequire` + plugin registration | WIRED | Both rules registered at `'error'` severity |
| `testid-registry-only.cjs` | `docs/testid-registry.md` | `fs.readFileSync` at rule init | WIRED | Registry loaded once; exact + pattern sets populated |
| `backend/tests/test_url_contract.py` | `docs/url-contract.md` + `frontend/src/routes/` | `parse_doc_urls()` + `derive_route_urls()` | WIRED | Bidirectional; test skips gracefully when doc absent |
| `v13-a11y.spec.ts` | `@axe-core/playwright` | `import AxeBuilder from '@axe-core/playwright'` | WIRED | `new AxeBuilder({ page }).withTags([...]).analyze()` |

---

## Data-Flow Trace (Level 4)

Level 4 is not applicable to Phase 24's deliverables. This phase ships infrastructure primitives (CSS variables, library functions, shell components, ESLint rules, test scaffolding) rather than components that render dynamic data from APIs. The DensityToggle reads from localStorage (not a remote API). The Sidebar renders static nav structure from hardcoded route config. No artifact in this phase fetches and renders dynamic data that requires tracing from DB to render output.

---

## Behavioral Spot-Checks

Static checks only — no running servers available for behavioral checks. The 24-VISUAL-CHECK.md documents operator-performed behavioral checks against the live dev server (http://localhost:5173 with backend on 8765):

| Behavior | Evidence Source | Result |
|----------|----------------|--------|
| Density toggle re-spaces dashboard, no re-renders | DOM-identity probe (VISUAL-CHECK.md perf table) | PASS — 3/3 charts + 15/15 cards marker-preserved across 2 flips |
| Sidebar Cmd+B collapse + persistence across reload | Operator notes #2 (VISUAL-CHECK.md) | PASS — 53px width, localStorage confirmed, reload persisted |
| Active-route accent bar in collapsed mode | Operator notes #4 (VISUAL-CHECK.md) | PASS — 3px border-left + rgba(77,124,255,0.1) at /activity |
| Radix Tooltip on collapsed sidebar icon (Portal) | Operator notes #3 (VISUAL-CHECK.md) | PASS — Portal-mounted text node outside complementary subtree |
| Density DropdownMenu opens with three tiers | Operator notes #5 (VISUAL-CHECK.md) | PASS — Compact / Comfortable / Cozy in Portal subtree |
| Lighthouse CWV gates | 9 `.lighthouseci/` JSON reports | PASS — LCP 559-586ms (under 2500ms), CLS 0-0.003 (under 0.1), perf 1.0 |
| Backend URL contract pytest | VISUAL-CHECK.md URL contract section | PASS — 2/2 bidirectional tests |
| Portal containment (no transform ancestor traps) | v13-portal-containment.spec.ts 3/3 PASS | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| CONT-01 | Plan 03 | `.cmc-page--bounded` page modifier, `min-height:0` flex ladder, internal panel scroll | SATISFIED | CSS lines 2030-2044 in styles.css; REQUIREMENTS.md marked complete |
| CONT-02 | Plans 01+03 | Radix Portal universal; transform audit complete; `.cmc-btn:hover` fix | SATISFIED | 24-TRANSFORM-AUDIT.md; styles.css line 364 fix; v13-portal-containment.spec.ts 3/3 PASS |
| CONT-03 | Plan 03 | `min-width:0` on `.cmc-card`; DataTable truncation; TruncatedCell | SATISFIED | styles.css line 333; TruncatedCell.tsx; DataTable.tsx line 175 |
| CONT-04 | Plan 03 | BoundedPanelCard + bounded prop + .cmc-card--bounded | SATISFIED | BoundedPanelCard.tsx; PanelCard.tsx bounded prop; CSS lines 2049-2065 |
| CONT-05 | Plans 01+06 | z-index ladder doc + ESLint no-raw-z-index rule | SATISFIED | docs/z-index-ladder.md; eslint-rules/no-raw-z-index.cjs; all overlay z-indices use CSS vars |
| SHEL-01 | Plan 04 | Persistent collapsible left sidebar with section grouping | SATISFIED | Sidebar.tsx; SidebarSection.tsx; NavBar.tsx deleted |
| SHEL-02 | Plan 04 | AppShellHeader with top-bar action area | SATISFIED | AppShellHeader.tsx; placeholder buttons pre-registered |
| SHEL-03 | Plan 04 | Active-route indicator in sidebar | SATISFIED | SidebarNavLink activeProps; 3px border-left accent bar |
| SHEL-04 | Plans 04+05 | Sidebar collapse to icon-only, Cmd+B, localStorage persistence | SATISFIED | lib/sidebar.ts; Sidebar.tsx keyboard handler; v13-sidebar.spec.ts 2/2 PASS |
| DENS-01 | Plans 01+02 | 3-tier density toggle, CSS-only swap, no React re-renders | SATISFIED | DensityToggle.tsx; DensityProvider not a React Context; DOM-identity probe PASS |
| DENS-02 | Plans 01+02 | Density tokens on :root for Radix Portal cascade | SATISFIED | styles.css :root blocks; v13-density.spec.ts Portal cascade test PASS |
| DENS-03 | Plan 02 | localStorage persistence + pre-mount apply | SATISFIED | lib/density.ts; main.tsx applyDensity() before createRoot; DensityProvider mount |
| POLI-09 | Plans 05+07 | Formal visual checkpoint pattern with screenshots | SATISFIED | 24-VISUAL-CHECK.md operator PASS; 42 PNGs in visual-check/ |
| POLI-10 | Plans 05+07 | axe-core a11y matrix, Phase-24 regressions cleared | SATISFIED | v13-a11y.spec.ts 30-run matrix; 3 Phase-24 regressions cleared; 6 pre-existing deferred to Phase 26/27 |
| POLI-11 | Plans 05+07 | Perf budget — zero re-renders, Lighthouse CWV, ResponsiveContainer count | SATISFIED | DOM-identity probe; Lighthouse 9/9 PASS; ResponsiveContainer count stable at 26 |
| POLI-12 | Plan 06 | Affordance checklist (15 affordances) | SATISFIED | docs/affordance-checklist.md; 15 rows verified |
| POLI-13 | Plans 05+06 | URL contract doc + pytest gate | SATISFIED | docs/url-contract.md; test_url_contract.py 2/2 PASS |
| POLI-14 | Plan 06 | testid-registry doc + ESLint rule | SATISFIED | docs/testid-registry.md; testid-registry-only.cjs; pnpm lint exit 0 |

All 18/18 mapped requirements satisfied.

---

## Anti-Patterns Found

No blockers found. The following were inspected and cleared:

| File | Concern | Finding |
|------|---------|---------|
| `DensityProvider.tsx` | Could be an empty/stub provider | Not a stub — `applyDensity()` called in useEffect; intentional non-Context design documented |
| `AppShellHeader.tsx` | Placeholder buttons with `display:none` | Intentional Phase 25/26 placeholders; pre-registered testids per POLI-14 contract; not stubs — they serve as registry entries |
| `v13-truncation.spec.ts` | Forward-compat SKIP | By design: primitive tested by vitest; e2e activates in Phase 26/27 column adoption. Acknowledged in VISUAL-CHECK.md |
| `v13-copy-cell.spec.ts` | Forward-compat SKIP | Same rationale as truncation — SKIP is the expected state pre-Phase 26/27 |
| `styles.css` `cmc-page-in` transform | Deferred transform mitigation | Documented in 24-TRANSFORM-AUDIT.md as "Follow-up Phase 26/27" with explicit trigger condition and mitigation playbook |
| `.cmc-heatmap-cell:hover transform: scale(1.15)` | Conditional transform | Accepted per TRANSFORM-AUDIT.md — no Portal children on heatmap cells in v1.3 |

---

### Human Verification Required

No items requiring human verification remain. All automated gates passed; operator-performed manual verification (VISUAL-CHECK.md 2026-05-12 PASS signature) covers the items that could not be CI-gated (visual layout quality, React DevTools profiler substitute via DOM-identity probe, Cmd+B keyboard feel).

---

## Gaps Summary

No gaps. All 5 success criteria are VERIFIED with documentary evidence across:
- Source files (TypeScript/CSS components and library modules)
- Vitest unit tests (353 passing, +27 vs v1.2 baseline)
- Playwright e2e tests (7 v13-*.spec.ts specs, 18 pass + 2 forward-compat SKIP by design)
- Backend pytest (663 passing, +2 vs v1.2 baseline)
- Operator visual verification (36/36 matrix PNGs PASS, signed 2026-05-12)
- Lighthouse CI (9 reports, all LCP/CLS/performance assertions passing)

The two forward-compat SKIPs (`v13-truncation` + `v13-copy-cell`) are not gaps — they are correctly designed to SKIP until Phase 26/27 wires `wrap:true` / `copyable:true` per column. The primitive behavior is covered by vitest unit tests that pass today.

---

_Verified: 2026-05-10T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
