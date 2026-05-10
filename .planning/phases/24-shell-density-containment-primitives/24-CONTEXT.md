# Phase 24: Shell + Density + Containment Primitives - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Lay every primitive (containment, density, shell chrome) and every quality-gate (visual checkpoint, axe-core, perf budget, URL contract, testid registry) that Phases 25-28 will consume. No per-route adoption work. No saved views. No layout customization.

Requirements in scope: CONT-01..05, SHEL-01..04, DENS-01..03, POLI-09..14 (18 total — see REQUIREMENTS.md).

Out of scope and deferred to:
- SHEL-05 (Recently visited sidebar section) → Phase 26
- SHEL-06 (Pinned saved views in sidebar) → Phase 25
- Per-route adoption of `bounded` + density tokens → Phases 26 (Command/Activity/Sessions) and 27 (Skills/Cost/Alerts)
- Saved views infrastructure → Phase 25
- Global time picker → Phase 26
- Layout customization → Phase 28

</domain>

<decisions>
## Implementation Decisions

### Density scale + baseline

- **Comfortable = new "modern dashboard" baseline** (Honeycomb/Datadog/PostHog/Grafana family aesthetic). The whole product re-spaces in Phase 24 — v1.2 baseline does not map directly to any tier. Visual-regression is expected and reviewed at VISUAL-CHECK.
- **Step ratio: ~1.25× medium** between tiers. Compact = pro/dense; Comfortable = balanced default; Cozy = relaxed. Standard dashboard density convention.
- **Density-aware properties (all four):**
  - Spacing — padding, gap, margin (card padding, panel gap, row padding, control padding)
  - Control heights — buttons, inputs, selects, table rows
  - Font size + line-height — body, table cells, labels
  - Icon size — including icon-only-button size
- **Toggle UX:** single icon button in `AppShellHeader` opening a Radix DropdownMenu with the 3 tiers + check-mark on current. Mirrors the existing theme toggle pattern. (Cmd+K density command from CMDK-02 lands in Phase 26.)
- **Default tier:** Comfortable (locked at DENS-01).
- **Implementation:** `[data-density]` attribute on `<html>` via `lib/density.ts` mirroring `lib/theme.ts`. CSS-only swap via `:root`-scoped CSS variables (no React re-renders). `DensityProvider` stacks alongside existing providers in `__root.tsx`. Pre-mount apply to avoid flash. (All locked at DENS-01..03.)

### Sidebar IA + active-state

- **Section composition (Home-on-top, intent-based):**
  - Top-level (above sections): `/` (Mission Control / Home)
  - **Observe:** `/activity`, `/sessions/compare`, `/skills`, `/cost`
  - **Operate:** `/alerts`
  - **Configure:** (empty — reserved for future Settings/Doctor; section header still rendered to anchor the IA)
- **Active-route visual treatment:** 3–4px solid accent-color bar flush against sidebar's left edge + subtle accent-tinted background on the row. The left-edge bar persists in icon-only mode (still visible to the left of the icon container). Datadog/Grafana-family convention.
- **Collapsed (icon-only) UX:** icons only with a Radix Tooltip on hover showing the route label. The existing `frontend/src/components/ui/Tooltip.tsx` wrapper around `@radix-ui/react-tooltip@1.2.8` (already installed) is reused — **no new Radix dep required despite SHEL-04's tooltip implication**. Section dividers visually compress in collapsed mode.
- **Keyboard shortcut for collapse/expand:** `Cmd+B` (VS Code / Linear / Notion convention). No `Cmd+\` or `Cmd+Shift+S`. Toggle also accessible via chrome control in sidebar header.
- **Persistence:** localStorage; pre-mount apply to avoid flash (mirrors theme/density pattern).

### Truncation + tooltip pattern

- **Trigger:** tooltip mounts only when content is actually truncated. Detection via `scrollWidth > clientWidth` measurement (lazy, per-cell). No spurious tooltips on cells that fit.
- **Tooltip content:** the full untruncated cell text. No metadata, no copy hint inside the tooltip itself.
- **Click-to-copy affordance:** small copy-icon button revealed on cell hover for known-long fields (session-id, cwd path, skill-name). Plain row click stays available for row navigation. Transient "Copied" toast/pip on success.
- **Coverage rollout:** `DataTable` applies `cmc-table-wrap` + `cmc-cell--truncate` by default to all cells. Per-column opt-out flag (e.g., `wrap: true`) for cells that should wrap instead of truncate (notes, descriptions, multi-line content).
- **Primitive choice:** Reuse existing `Tooltip.tsx` wrapper in `frontend/src/components/ui/`. Density tokens cascade from `:root` so tooltip respects the active density tier (DENS-02 cascade requirement).

### Quality gate strictness

- **VISUAL-CHECK matrix per phase:** affected routes × 3 densities (Compact / Comfortable / Cozy) × 2 themes (light / dark). Phase 24 covers all routes (full re-spacing); later phases narrow to the routes they touch. Highest visual-regression catch.
- **Capture method:** Playwright auto-capture script iterates the matrix and writes PNGs to `.planning/phases/{N}/visual-check/` (or similar). Operator reviews captured set and writes pass/fail verdict + notes in `VISUAL-CHECK.md`. Reproducible; bounded operator time.
- **Axe-core gate:** **serious + critical violations block** phase verification. Minor and moderate violations logged as warnings (not phase-blocking). Aligns with WCAG AA pragmatic gating for solo localhost product.
- **Perf budget — hard gates (binary or numeric pass/fail):**
  - Density toggle React re-render count = 0 (binary; via React DevTools profiler)
  - Chart polling p95 paint < 16ms (numeric)
  - `ResponsiveContainer` instance count stable phase-over-phase (numeric)
- **Perf budget — additional Lighthouse CI gate on key routes:**
  - Lighthouse CI runs at phase close on `/`, `/activity`, `/sessions/compare`
  - Thresholds: LCP < 2.5s, CLS < 0.1, INP < 200ms
  - **New tooling — researcher must scope Lighthouse CI install/config in Phase 24 plan** (not currently in the repo)
- **VISUAL-CHECK + axe + perf evidence** all attach to or are referenced from `VISUAL-CHECK.md` to give Verifier a single check surface.

### Claude's Discretion

- Concrete numeric values for density tokens (e.g., what `--cmc-space-md` resolves to per tier), token nomenclature, and CSS variable naming — research and planning will produce these from the 1.25× ratio + dashboard-product reference aesthetic.
- Exact Compact font floor (research must check WCAG AA contrast + readability at the smallest tier).
- Sidebar pixel widths in expanded vs collapsed mode (typical dashboard convention: ~240px expanded, ~52px collapsed).
- Tooltip side/alignment defaults (Radix Tooltip configuration).
- Copy-icon button placement within the cell (right-aligned vs floating overlay) — researcher to look at existing DataTable patterns.
- Lighthouse CI configuration shape (config file location, GitHub Action vs local, threshold storage).
- VISUAL-CHECK PNG naming/directory convention inside the phase dir.
- The 15 specific entries in `docs/affordance-checklist.md` (POLI-12 enumerates ~15 — exact list is a planning artifact).
- Z-index ladder values (CSS variable names + integer values for tooltip / popover / dropdown / sheet / dialog / cmd-k).
- Exact name of the ESLint rule for testid registry (`testid-registry-only` is named in POLI-14 — implementation detail).

</decisions>

<specifics>
## Specific Ideas

- **Aesthetic anchor:** dashboard-product family (Honeycomb / Datadog / PostHog / Grafana) — NOT the v1.0-era IDE references (Linear / Raycast / Vercel). This drives Comfortable as the new default look.
- **Density toggle pattern reference:** Linear / Honeycomb 3-tier dashboards. Single-button + dropdown matches existing theme toggle.
- **Sidebar reference:** Linear / Notion / VS Code icon-only-on-collapse + tooltip-on-hover. `Cmd+B` muscle memory.
- **Active-state reference:** Datadog / Grafana — left-edge accent bar that survives icon-only mode.
- **Click-to-copy reference:** GitHub commit-SHA copy button — small icon, transient confirmation, doesn't replace primary click target.
- **Lighthouse CI:** new tooling for this repo. Planner should evaluate `@lhci/cli` + GitHub Action vs local-only. Thresholds (LCP<2.5s / CLS<0.1 / INP<200ms) are Google Core Web Vitals "Good" boundaries — standard, not aggressive.
- **Tooltip primitive correction (vs requirements doc note):** `@radix-ui/react-tooltip@1.2.8` is already installed and wrapped at `frontend/src/components/ui/Tooltip.tsx`. The locked v1.3 dep budget (popover / dropdown-menu / react-resizable-panels) is **not** breached by sidebar tooltips or truncation tooltips.

</specifics>

<deferred>
## Deferred Ideas

- **Per-route default density override** (e.g., `/sessions/compare` always opens at Compact regardless of global setting) — deferred. Current scope is global-only density.
- **Density cycling via single-tap button** — rejected in favor of icon+dropdown. If we change our minds later, the affordance can land in CMDK-02 (Phase 26) without breaking the chrome.
- **Hard pixel-diff visual regression** (Playwright `toHaveScreenshot`) — rejected as too brittle for v1.3; Playwright auto-capture + operator verdict is the chosen pattern. Could revisit in v1.4+ if regressions slip through.
- **Click-whole-cell-to-copy** — rejected in favor of explicit copy-icon button to avoid conflicting with row navigation semantics in tables that have row-click handlers.
- **Cmd+\\ or Cmd+Shift+S sidebar toggle** — rejected; `Cmd+B` chosen.
- **Axe-core all-violations-block + allow-list pattern** — rejected as too high-maintenance; serious+critical blocking with minor/moderate warning is the chosen gate.
- **Future Settings/Doctor route in Configure section** — section header reserved but no route placed in v1.3. Add when a Settings or Doctor route lands.

</deferred>

---

*Phase: 24-shell-density-containment-primitives*
*Context gathered: 2026-05-10*
