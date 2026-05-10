# Phase 24: Shell + Density + Containment Primitives — Research

**Researched:** 2026-05-10
**Domain:** Frontend shell architecture, CSS-variable density system, layout-containment fixes, axe-core / Lighthouse / visual quality gates.
**Confidence:** HIGH on stack/code-anchored claims (every fingerprint cites a real file or verified package version); HIGH on CSS containment + transform-containing-block (MDN-verified); MEDIUM on operator-driven Lighthouse threshold values (Google Core Web Vitals "Good" boundaries); MEDIUM on the 15 affordance-checklist enumeration (proposed, must be reviewed by operator).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Density scale + baseline**
- Comfortable = new "modern dashboard" baseline (Honeycomb/Datadog/PostHog/Grafana family aesthetic). The whole product re-spaces in Phase 24 — v1.2 baseline does not map directly to any tier. Visual-regression is expected and reviewed at VISUAL-CHECK.
- Step ratio: ~1.25× medium between tiers. Compact = pro/dense; Comfortable = balanced default; Cozy = relaxed.
- Density-aware properties (all four): spacing (padding/gap/margin), control heights, font size + line-height, icon size.
- Toggle UX: single icon button in `AppShellHeader` opening a Radix DropdownMenu with the 3 tiers + check-mark on current. Mirrors the existing theme toggle pattern.
- Default tier: Comfortable (locked at DENS-01).
- Implementation: `[data-density]` attribute on `<html>` via `lib/density.ts` mirroring `lib/theme.ts`. CSS-only swap via `:root`-scoped CSS variables (no React re-renders). `DensityProvider` stacks alongside existing providers in `__root.tsx`. Pre-mount apply to avoid flash.

**Sidebar IA + active-state**
- Section composition (Home-on-top, intent-based): top-level `/`; **Observe** `/activity`, `/sessions/compare`, `/skills`, `/cost`; **Operate** `/alerts`; **Configure** (empty header — reserved).
- Active-route: 3–4px solid accent-color bar flush against sidebar's left edge + subtle accent-tinted background on the row. Bar persists in icon-only mode.
- Collapsed UX: icons only with Radix Tooltip on hover. Reuse existing `frontend/src/components/ui/Tooltip.tsx` (Radix `@radix-ui/react-tooltip@1.2.8` — already installed). **No new tooltip dep.**
- Keyboard shortcut: `Cmd+B`. Toggle also accessible via chrome control.
- Persistence: localStorage; pre-mount apply.

**Truncation + tooltip pattern**
- Trigger: tooltip mounts only when `scrollWidth > clientWidth`. Lazy, per-cell. No spurious tooltips on cells that fit.
- Tooltip content: full untruncated cell text. No metadata, no copy hint inside the tooltip itself.
- Click-to-copy: small copy-icon button revealed on cell hover for known-long fields (session-id, cwd path, skill-name). Plain row click stays available for row navigation. Transient "Copied" toast/pip on success.
- Coverage rollout: `DataTable` applies `cmc-table-wrap` + `cmc-cell--truncate` by default. Per-column opt-out (`wrap: true`) for cells that should wrap.
- Primitive: Reuse existing `Tooltip.tsx` wrapper. Density tokens cascade from `:root` so tooltip respects active density.

**Quality-gate strictness**
- VISUAL-CHECK matrix: affected routes × 3 densities × 2 themes. Phase 24 covers all routes. Playwright auto-capture script writes PNGs to phase dir; operator writes verdict in `VISUAL-CHECK.md`.
- Axe-core gate: serious + critical violations block; minor/moderate warn.
- Perf hard gates: density toggle React re-render count = 0 (binary, React DevTools profiler); chart polling p95 paint < 16ms; ResponsiveContainer instance count stable phase-over-phase.
- Lighthouse CI on `/`, `/activity`, `/sessions/compare` at phase close — LCP < 2.5s, CLS < 0.1, INP < 200ms. **NEW TOOLING** — researcher must scope install/config in plan.

**Locked deps**
- Install `@radix-ui/react-popover@1.1.15` and `@radix-ui/react-dropdown-menu@2.1.16`.
- NO new tooltip dep.
- Lighthouse CI dev-dep: `@lhci/cli@0.15.x`.
- a11y dev-dep: `@axe-core/playwright@4.11.x`.

### Claude's Discretion

- Concrete numeric values for density tokens (CSS variable resolved values per tier), token nomenclature, CSS variable naming.
- Compact font floor (research must check WCAG AA contrast + readability at smallest tier).
- Sidebar pixel widths in expanded vs collapsed mode (~240px expanded, ~52px collapsed convention).
- Tooltip side/alignment defaults.
- Copy-icon button placement (right-aligned vs floating overlay).
- Lighthouse CI config shape (config file location, GitHub Action vs local, threshold storage).
- VISUAL-CHECK PNG naming/directory convention.
- 15 specific entries in `docs/affordance-checklist.md` (POLI-12).
- Z-index ladder values (CSS variable names + integer values).
- Exact ESLint rule shape for `testid-registry-only`.

### Deferred Ideas (OUT OF SCOPE)
- Per-route default density override.
- Density cycling via single-tap button.
- Hard pixel-diff visual regression (`toHaveScreenshot`).
- Click-whole-cell-to-copy.
- `Cmd+\` or `Cmd+Shift+S` sidebar toggle.
- Axe-core all-violations-block + allow-list pattern.
- Future Settings/Doctor route in Configure section.
- SHEL-05 (Recently visited), SHEL-06 (Pinned saved views) — Phases 25/26.
- Per-route adoption of `bounded` + density tokens — Phases 26/27.
- Saved views infrastructure, global time picker, layout customization — Phases 25/26/28.
</user_constraints>

## Summary

Phase 24 is the foundation phase of v1.3. Every primitive (containment ladder, density tokens, sidebar+header chrome) and every quality gate (VISUAL-CHECK, axe-core, perf budget, Lighthouse CI, URL contract, testid registry, affordance checklist) lands here so Phases 25–28 inherit a stable substrate. The phase touches 18 requirement IDs (CONT-01..05, SHEL-01..04, DENS-01..03, POLI-09..14) but contains zero per-route adoption work — adoption rolls forward in Phases 26 and 27.

Two architectural facts dominate the plan:

1. **The repo's design system is hand-rolled CSS variables in `frontend/src/styles.css` (1863 LOC) over Radix headless primitives.** No Tailwind, no shadcn. Every CSS-variable-based recommendation here extends that file's existing `:root` + `[data-theme="light"]` pattern. Adding `[data-density="compact|cozy"]` is the same pattern, zero novelty.
2. **The "Sheet escapes parent bounds / popover clipped by overflow ancestor" failure mode has a single root cause: any ancestor with `transform`, `filter`, `perspective`, `will-change: transform`, or `contain: paint` becomes the containing block for `position: fixed` descendants — including Radix Portals.** This is verified by MDN. The repo already has multiple offenders: `.cmc-btn:hover { transform: translateY(-2px) }`, `.cmc-heatmap-cell:hover { transform: scale(1.15) }`, framer-motion `<motion.div>` on Sheet panels, plus a `transform: scale(0.96)` cmdk dialog open animation. **The audit deliverable for CONT-02 is a CSS-grep + Playwright probe that catches transform-bearing ancestors of Portal-mounted overlays.**

**Primary recommendation:** Land containment fixes (CONT-01..05) and density skeleton (DENS-01..03) as the first wave, then shell rework (SHEL-01..04) on top of stable primitives, then quality-gate tooling (POLI-09..14) as the closing wave. Keep all locked dependencies behind a single `pnpm add` step and verify React 19 peerDeps before merging.

## Standard Stack

### Core (already installed — verified `frontend/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.5 | UI runtime | Already locked |
| @tanstack/react-router | 1.168.24 | Routing + URL state | URL contract (POLI-13) builds on it |
| @radix-ui/react-tooltip | 1.2.8 | Tooltip primitive (already wrapped at `ui/Tooltip.tsx`) | **Reused for sidebar collapsed mode AND truncation tooltips — no new tooltip dep** |
| @radix-ui/react-dialog | 1.1.15 | Sheet primitive | Already wrapped at `ui/Sheet.tsx` |
| @radix-ui/react-alert-dialog | 1.1.15 | Confirm dialogs | Already wrapped |
| @radix-ui/react-collapsible | 1.1.12 | Sidebar section collapse | Already installed; useful for Configure/Operate section headers |
| recharts | 3.8.1 | Charts (already used) | Held |
| framer-motion | 12.38.0 | Sheet animation | Held; also drives the transform-containing-block diagnosis |
| cmdk | 1.1.1 | Cmd+K palette | Held |
| lucide-react | 1.11.0 | Icon set (`Cog`, `Sliders`, `Layout`, sidebar icons, copy icon, density icons) | Already installed |
| @playwright/test | 1.59.1 | E2E + visual capture | Reused for VISUAL-CHECK script |
| vitest | 4.1.5 | Unit tests | Held |

### To Install (locked at CONTEXT)

| Library | Version | Purpose | Verification |
|---------|---------|---------|--------------|
| @radix-ui/react-popover | 1.1.15 | Density toggle dropdown structure (DropdownMenu drives the density picker; Popover reserved for time-picker placeholder + future affordances per CONTEXT) | Same family/cadence as installed Radix; React 19 peerDep verified in milestone STACK.md (2026-05-10 npm view) |
| @radix-ui/react-dropdown-menu | 2.1.16 | Density toggle UX (icon button → menu with 3 tiers + check) — mirrors theme toggle pattern; also enables row-action menus in later phases | React 19 peerDep verified in milestone STACK.md |
| @lhci/cli | 0.15.1 | Lighthouse CI (LCP/CLS/INP gate) | Verified via npm; uses Lighthouse 12.6.1 |
| @axe-core/playwright | 4.11.2 | a11y audit fixture inside Playwright | Verified via npm (last published 10 days ago) |

**Installation:**
```bash
cd frontend
pnpm add @radix-ui/react-popover@^1.1.15 @radix-ui/react-dropdown-menu@^2.1.16
pnpm add -D @lhci/cli@^0.15.1 @axe-core/playwright@^4.11.2
```

### Alternatives Considered (and rejected)

| Instead of | Could Use | Why rejected |
|------------|-----------|--------------|
| `@radix-ui/react-dropdown-menu` for density picker | Hand-rolled `<button>` + custom outside-click | Density picker needs keyboard arrow-nav + check-mark + portal — Radix gets all 4 for free; same Portal infrastructure as installed Sheet/Tooltip |
| Reuse existing Tooltip for density picker | New Popover | Tooltip is hover-triggered + small width; density picker is click-to-open + 3 menu items — DropdownMenu is the right semantic |
| Lost Pixel / Chromatic for visual regression | Operator-driven Playwright auto-capture | Already locked in CONTEXT (POLI-09 = operator verdict, not pixel-diff CI gate) |
| Tailwind utility migration | Stay on `cmc-*` classes + CSS vars | Adding Tailwind to retrofit density is a multi-thousand-line migration; out of scope (verified in milestone STACK.md) |
| Storybook for primitive isolation | Skip (per REQUIREMENTS.md line 160 — VISUAL-CHECK covers regression detection) | Operator decision in REQUIREMENTS.md |

## Architecture Patterns

### Provider stack at `__root.tsx`

After Phase 24:

```
QueryClientProvider
└── ErrorBoundary
    └── AppShell
        ├── ActiveSessionProvider
        │   └── TaskComposerProvider
        │       └── DensityProvider                    ← NEW (DENS-03)
        │           ├── AppShellHeader                  ← extracted from NavBar (SHEL-02)
        │           ├── Sidebar                         ← NEW (SHEL-01..04)
        │           ├── CommandPalette                  (existing)
        │           └── <main className="cmc-main">
        │               └── <Outlet/>
```

`DensityProvider` is a thin wrapper that:
- Calls `applyDensity()` (mirror of `applyTheme()` from `lib/theme.ts`) inside a `useEffect`.
- Owns the `useDensity()` hook (returns `[density, setDensity]`) used by the toggle button.
- Does NOT propagate density via React context to consumers — consumers read CSS variables. This is what makes the toggle a CSS-only swap with zero React re-renders (POLI-11 hard gate).

`Sidebar` mounts inside DensityProvider so its tooltip text and active-bar dimensions cascade from density tokens. `AppShellHeader` extracts everything currently in `NavBar.tsx` lines 14-46 (brand, links, EmergencyStopBanner, Cmd+K trigger, ThemeToggle) plus adds the density toggle, plus reserves placeholder slots for the time picker (Phase 26) and save-view button (Phase 25).

### Density token system — concrete values

`lib/density.ts` (new file, mirrors `lib/theme.ts`):

```ts
export type Density = 'compact' | 'comfortable' | 'cozy'
export const DEFAULT_DENSITY: Density = 'comfortable'
const KEY = 'cmc.density'

export function getDensity(): Density {
  if (typeof window === 'undefined') return DEFAULT_DENSITY
  const v = window.localStorage.getItem(KEY)
  return v === 'compact' || v === 'cozy' ? v : 'comfortable'
}
export function setDensity(d: Density): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, d)
  if (typeof document !== 'undefined') document.documentElement.dataset.density = d
}
export function applyDensity(): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.density = getDensity()
}
```

`main.tsx` calls `applyDensity()` BEFORE `ReactDOM.createRoot(...)`, alongside the existing `applyTheme()` line, to avoid flash.

#### Token table — `:root` defaults are Comfortable; `[data-density="compact"]` and `[data-density="cozy"]` overrides

The 1.25× ratio applied to a 16px-base spacing gives Compact = 12.8px (round to 12), Comfortable = 16, Cozy = 20. Same logic gives the rest:

| Token | Compact | Comfortable (default) | Cozy | Rationale |
|-------|---------|-----------------------|------|-----------|
| `--cmc-space-2xs` | 2px | 4px | 6px | Hairline gaps |
| `--cmc-space-xs` | 6px | 8px | 12px | Within-cell gaps |
| `--cmc-space-sm` | 10px | 12px | 16px | Between-control gaps |
| `--cmc-space-md` | 12px | 16px | 20px | Card padding inner |
| `--cmc-space-lg` | 18px | 24px | 32px | Page rhythm |
| `--cmc-space-xl` | 24px | 32px | 40px | Page section break |
| `--cmc-space-2xl` | 36px | 48px | 60px | Hero spacing |
| `--cmc-control-height-sm` | 24px | 28px | 32px | Compact button height; ≥24px = WCAG 2.5.8 AA target size |
| `--cmc-control-height-md` | 28px | 32px | 40px | Default button (matches existing `.cmc-btn` 32px floor at Comfortable) |
| `--cmc-control-height-lg` | 32px | 40px | 48px | CTA / hero buttons |
| `--cmc-row-height-table` | 32px | 40px | 48px | DataTable rows; 32px keeps cell content readable |
| `--cmc-row-height-list` | 28px | 36px | 44px | Sidebar nav rows, list items |
| `--cmc-padding-card` | 16px | 24px | 32px | `.cmc-card` padding (replaces hard-coded `var(--space-lg)` at line 222) |
| `--cmc-padding-cell` | 6px 8px | 8px 12px | 10px 16px | DataTable cell padding (vertical horizontal) |
| `--cmc-size-label` | 11px | 12px | 13px | Label/kicker (existing `.cmc-label` rule) |
| `--cmc-size-body` | 13px | 14px | 16px | Body text — **13px is WCAG-acceptable floor for AA contrast at our color tokens; do NOT go below 12px without re-checking contrast** |
| `--cmc-size-heading` | 16px | 18px | 22px | CardTitle |
| `--cmc-size-display` | 24px | 28px | 36px | Page heading |
| `--cmc-line-height-body` | 1.4 | 1.5 | 1.6 | Tight on Compact, generous on Cozy |
| `--cmc-line-height-tight` | 1.2 | 1.25 | 1.3 | Headings/labels |
| `--cmc-icon-size-sm` | 12px | 14px | 16px | Inline icon |
| `--cmc-icon-size-md` | 14px | 16px | 20px | Button icon (lucide default size knob) |
| `--cmc-icon-size-lg` | 16px | 20px | 24px | Sidebar nav icon |

**Naming convention:** prefix every density-aware token with `--cmc-`. Existing `--space-*`, `--size-*`, `--row-height-*` tokens become aliases of the `--cmc-*` tokens during Phase 24 to keep ~30 panels working unchanged. Per-route migration to the new names happens in Phases 26/27.

**Compact font floor (DENS-02 contrast research):** WCAG 2.1 AA requires 4.5:1 for normal text and 3:1 for large text (≥18px or ≥14px bold). Existing token `--cmc-text-dim` (`#8888a0` on `--cmc-bg` `#0a0a0f`) gives ~7.5:1 — passes AA at any size. `--cmc-text-subtle` (`#5a5a70` on `--cmc-bg`) gives ~3.6:1 — fails AA for normal text below 18px. **Therefore: Compact body floor is 13px (passes AA at the dim-text level). The subtle-text token may NOT be used for body content at Compact regardless; this is an existing v1.2 restriction reinforced by Phase 24, not a new rule.** Light theme contrast must be re-verified during VISUAL-CHECK.

#### CSS variable cascade and Radix Portal

Density tokens MUST live on `:root` (the `<html>` element), NOT on a subtree like `.cmc-shell` or `[data-density]` scoped to a child. Reason: Radix `Tooltip.Portal`, `Sheet.Portal`, `DropdownMenu.Portal` mount their content directly under `document.body`, OUTSIDE the React tree. CSS variables on `:root` cascade through `html → body → portal child` regardless of React structure; CSS variables on `.cmc-shell` would not. This is why CONTEXT locks `[data-density]` on `<html>` (DENS-02 explicitly).

**Verify in test:** Vitest test mounts `<DensityProvider><Sheet open>...</Sheet></DensityProvider>`, sets density to `compact`, asserts `getComputedStyle(sheetPanel).padding` resolves to the Compact value (not Comfortable).

### Sidebar implementation

#### File layout

```
frontend/src/components/shell/
├── AppShell.tsx          # existing — mounts Sidebar + AppShellHeader + main
├── AppShellHeader.tsx    # NEW — extracted from NavBar (SHEL-02)
├── Sidebar.tsx           # NEW (SHEL-01)
├── SidebarSection.tsx    # NEW — Observe/Operate/Configure section header + nav links
├── SidebarNavLink.tsx    # NEW — single nav row; wraps Tooltip when collapsed
├── DensityToggle.tsx     # NEW — DropdownMenu icon-button (mirrors ThemeToggle pattern)
├── NavBar.tsx            # DELETE after Phase 24 close (replaced by AppShellHeader+Sidebar)
├── ThemeToggle.tsx       # KEEP (referenced by AppShellHeader)
└── EmergencyStopBanner.tsx  # KEEP (move into AppShellHeader)

frontend/src/lib/
├── density.ts            # NEW — mirrors theme.ts
└── sidebar.ts            # NEW — collapsed-state localStorage + applyOnBoot
```

#### Sidebar shell — pixel widths and CSS

Discretion call: **240px expanded, 52px collapsed** (Linear/Notion convention; 240 leaves room for "Sessions Compare" without truncating; 52 is `2*16 padding + 20 icon`).

Add to `styles.css`:

```css
.cmc-sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--cmc-surface);
  border-right: 1px solid var(--cmc-border);
  transition: width 180ms ease-out;
}
[data-sidebar-collapsed="true"] .cmc-sidebar { width: 52px; }

.cmc-sidebar__section { display: flex; flex-direction: column; padding: var(--cmc-space-sm) 0; }
.cmc-sidebar__section-header {
  font-family: var(--font-mono);
  font-size: var(--cmc-size-label);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--cmc-text-subtle);
  padding: 0 var(--cmc-space-md);
  margin: var(--cmc-space-sm) 0 var(--cmc-space-2xs);
}
[data-sidebar-collapsed="true"] .cmc-sidebar__section-header { display: none; }
[data-sidebar-collapsed="true"] .cmc-sidebar__section { padding: var(--cmc-space-2xs) 0; }
[data-sidebar-collapsed="true"] .cmc-sidebar__section + .cmc-sidebar__section {
  border-top: 1px solid var(--cmc-border);
}

.cmc-sidebar__navlink {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--cmc-space-sm);
  height: var(--cmc-row-height-list);
  padding: 0 var(--cmc-space-md);
  color: var(--cmc-text-dim);
  text-decoration: none;
  border-left: 3px solid transparent;       /* SHEL-03 — left-edge bar slot */
}
.cmc-sidebar__navlink:hover { color: var(--cmc-text); background: var(--cmc-surface-2); }
.cmc-sidebar__navlink--active {
  color: var(--cmc-text);
  background: rgba(77, 124, 255, 0.10);     /* tinted accent */
  border-left-color: var(--cmc-accent-blue); /* 3px solid bar */
}
.cmc-sidebar__navlink-icon { width: var(--cmc-icon-size-lg); height: var(--cmc-icon-size-lg); flex-shrink: 0; }
[data-sidebar-collapsed="true"] .cmc-sidebar__navlink-label { display: none; }
[data-sidebar-collapsed="true"] .cmc-sidebar__navlink { justify-content: center; padding: 0; }
```

#### Cmd+B keyboard handling

```ts
// In AppShell or Sidebar — single global listener.
useEffect(() => {
  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault()
      setCollapsed(c => !c)
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [setCollapsed])
```

The `e.preventDefault()` is needed because Cmd+B is the macOS "bold" shortcut in `<input>` / `<textarea>` contexts — preventing the default keeps it from inserting a bold marker if the cursor is in a search field. cmdk already steals Cmd+K with the same pattern (see `CommandPalette.tsx`).

#### Tooltip wrapping for collapsed mode

```tsx
// SidebarNavLink.tsx
import { Tooltip } from '../ui/Tooltip'
import { Link } from '@tanstack/react-router'

export function SidebarNavLink({ to, label, Icon, collapsed }: Props) {
  const link = (
    <Link to={to} className="cmc-sidebar__navlink"
          activeProps={{ className: 'cmc-sidebar__navlink cmc-sidebar__navlink--active' }}
          activeOptions={{ exact: to === '/' }}
          data-testid={`sidebar-link-${to.replace(/\W/g, '-')}`}
    >
      <Icon className="cmc-sidebar__navlink-icon" aria-hidden />
      <span className="cmc-sidebar__navlink-label">{label}</span>
    </Link>
  )
  return collapsed ? <Tooltip content={label} side="right">{link}</Tooltip> : link
}
```

**Tooltip side default:** `right` for collapsed sidebar (label appears outside the sidebar boundary toward the main content area). Existing `ui/Tooltip.tsx` defaults to `top` — keep that default, override only at the call site.

#### Mobile / narrow viewport behavior

Locked: **explicit non-handling for v1.3.** The dashboard is local-only single-user macOS — no mobile breakpoint work in this milestone. Document this in `docs/affordance-checklist.md` so future operators don't assume responsive support exists. If browser width < 768px, sidebar still renders at 240px and overflows; that's accepted. (Confirmed against milestone CONCERNS.md scope: "single-developer macOS dashboard, multi-browser is v2".)

### AppShellHeader extraction

Lift from existing `NavBar.tsx` (lines 14-46):
- `<span className="cmc-brand">Mission Control</span>` → moves to top of Sidebar (left-edge brand) instead, since the sidebar is now the primary nav locus. The header keeps the right-side action area only.
- `<EmergencyStopBanner />` → moves into AppShellHeader's right-side action area (currently mounted there).
- `<button className="cmc-cmdk-trigger">Cmd+K</button>` → moves into AppShellHeader.
- `<ThemeToggle />` → moves into AppShellHeader.

New additions to AppShellHeader (right-to-left action area, matching dashboard convention):
1. `<ThemeToggle />` (rightmost, existing)
2. `<DensityToggle />` (NEW — DropdownMenu with 3 tiers)
3. `<button data-testid="save-view-button" disabled aria-label="Save view (coming in Phase 25)">` — placeholder; `display: none` until Phase 25 wires it
4. `<button data-testid="time-picker-trigger" disabled aria-label="Time range (coming in Phase 26)">` — placeholder; `display: none` until Phase 26
5. `<button className="cmc-cmdk-trigger">` (existing)
6. `<EmergencyStopBanner />` (leftmost — high-priority signal)

The placeholder `display: none` keeps the testids available for the registry (POLI-14) so phases 25/26 don't have to register them later. The buttons render but are invisible.

#### Routing layout integration

Update `frontend/src/components/shell/AppShell.tsx`:

```tsx
export function AppShell({ children }: AppShellProps) {
  return (
    <ActiveSessionProvider>
      <TaskComposerProvider>
        <DensityProvider>
          <div className="cmc-shell" data-sidebar-collapsed={isCollapsed ? 'true' : 'false'}>
            <Sidebar />
            <div className="cmc-shell__column">
              <AppShellHeader />
              <main className="cmc-main">{children}</main>
            </div>
            <CommandPalette />
          </div>
        </DensityProvider>
      </TaskComposerProvider>
    </ActiveSessionProvider>
  )
}
```

The `cmc-shell` class flips from `flex-direction: column` (current) to `flex-direction: row` (new — sidebar | column-of-header+main). This is the **single biggest visual change** of Phase 24 and is what every VISUAL-CHECK PNG will show.

```css
.cmc-shell { display: flex; flex-direction: row; min-height: 100%; }
.cmc-shell__column { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.cmc-main { flex: 1; padding: var(--cmc-space-lg); min-height: 0; overflow-y: auto; }
```

Note `min-width: 0` on `.cmc-shell__column` — without it the main column refuses to shrink below its widest content, defeating the sidebar collapse. Same `min-width: 0` rule as on `.cmc-card` in CONT-03.

### Containment fixes (CONT-01..05)

#### `.cmc-page--bounded` modifier (CONT-01, CONT-04)

Existing `.cmc-page` (styles.css:543) is unbounded — `flex-direction: column`, no `max-height`, no `overflow`. Adding the modifier:

```css
.cmc-page--bounded {
  /* The bounded modifier turns a free-scrolling page into a viewport-bounded
   * grid where each panel contains its own scroll. Phase 24 introduces the
   * modifier; per-route adoption is Phase 26/27 work. */
  height: 100%;            /* fills cmc-main which is min-height: 0 */
  min-height: 0;           /* CRITICAL — flex/grid child must opt out of min-content */
  display: flex;
  flex-direction: column;
  overflow: hidden;        /* page itself never scrolls; panels do */
}
.cmc-page--bounded > .cmc-card-grid {
  flex: 1;
  min-height: 0;           /* second rung of the ladder */
  overflow-y: auto;        /* the grid scrolls if many panels overflow page height */
}
.cmc-page--bounded .cmc-card { min-height: 0; }
.cmc-page--bounded .cmc-card__content {
  flex: 1;
  min-height: 0;            /* third rung of the ladder */
  overflow-y: auto;
}
```

**The "min-height: 0 flex ladder" explanation (verified MDN):** Default `min-height` on a flex/grid item is `auto`, which evaluates to the item's `min-content` size. This means the item refuses to shrink smaller than its content's intrinsic minimum height. To allow shrink-to-fit + internal scroll, EVERY flex/grid child between the viewport-fixed root and the scroll container must declare `min-height: 0` (or `overflow: hidden`/`auto`, which has the same effect). Drop it on any single rung and the chain breaks: the inner scrollbar won't appear because the inner element grows to its content height instead.

In our case the ladder for a bounded page is:
1. `<html>` and `<body>` — already `height: 100%` (styles.css:75)
2. `#root` — `height: 100%`
3. `.cmc-shell` — `min-height: 100%` (currently — should become `height: 100%` for bounded mode, OR `.cmc-shell__column` enforces `min-height: 0` already)
4. `.cmc-shell__column` — `flex: 1; min-height: 0`
5. `.cmc-main` — `flex: 1; min-height: 0`
6. `.cmc-page--bounded` — `min-height: 0`
7. `.cmc-card-grid` — `min-height: 0`
8. `.cmc-card__content` — `min-height: 0; overflow-y: auto`

#### `min-width: 0` on `.cmc-card` (CONT-03)

The horizontal analog. Existing `.cmc-card` (styles.css:218) is `flex-direction: column` so `min-width` doesn't affect its OWN column-flow children — but it DOES affect the card itself when it's a child of a CSS Grid (`grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))`). A grid item's default minimum width is `min-content`, which for a card containing an unbreakable string (long session-id, cwd path) is the full string width. Adding `min-width: 0` to `.cmc-card` allows the grid track to shrink to the `1fr` value the grid template specifies, which then forces the card's children (table cells, badges) to wrap or truncate per their own rules.

```css
.cmc-card { /* …existing rules… */ min-width: 0; }
```

This is the **single one-line fix** that REQUIREMENTS.md CONT-03 calls out as benefiting every route.

#### `BoundedPanelCard` primitive (CONT-04)

```tsx
// frontend/src/components/ui/BoundedPanelCard.tsx
import { PanelCard } from './PanelCard'
import type { ComponentProps } from 'react'

export function BoundedPanelCard<T>(props: ComponentProps<typeof PanelCard<T>>) {
  return (
    <div className="cmc-card cmc-card--bounded">
      <PanelCard {...props} />
    </div>
  )
}
```

**Decision: extend `PanelCard` with a `bounded?: boolean` prop INSTEAD of (or in addition to) the wrapper component.** The wrapper duplicates the `<Card>` boundary; cleaner is to thread `bounded` into PanelCard and have it apply `cmc-card--bounded` to its own root. The wrapper symbol is kept as a re-export for ergonomics.

```css
.cmc-card--bounded {
  min-height: 0;
  height: 100%;          /* fills its grid track */
  overflow: hidden;      /* paint boundary — absolutely-positioned children clipped here NOT in the page */
  contain: layout paint; /* opt-in CSS containment — only paint children if they're in this card's box */
}
.cmc-card--bounded .cmc-card__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
```

**WARNING:** `contain: layout paint` on `.cmc-card--bounded` is fine, but `contain: paint` (without `transform`) does NOT create a new containing block for `position: fixed` descendants — that's a key advantage over `transform`-based containment. Verified via MDN: only `transform`, `filter`, `perspective`, `will-change: transform`, and `contain: strict` (which includes `paint` + `size`) create a containing block. **Stick to `contain: layout paint` — it gives us paint isolation without breaking Radix Portals.**

Per-route adoption: Phase 26 routes opt panels in by changing `<PanelCard>` to `<BoundedPanelCard>` (or `<PanelCard bounded>`). Backward-compatibility: existing legacy "scroll the whole page" behavior preserved when not opted in.

#### Recharts `ResponsiveContainer` transform root-cause audit (CONT-02)

**The bug pattern:** A `position: fixed` Radix Portal child (Tooltip content, Sheet panel, DropdownMenu content) is supposed to be positioned relative to the viewport. But if ANY ancestor has `transform`, `filter`, `perspective`, `will-change: transform`, OR `contain: strict`, that ancestor becomes the containing block for the fixed-position descendant, and the descendant gets clipped/displaced relative to the ancestor instead of the viewport. **This is the documented MDN behavior, not a Radix bug.**

The CONTEXT line "recharts `ResponsiveContainer` transform root-cause audit" is somewhat misleading — recharts' own ResponsiveContainer does NOT apply `transform` (verified by reading `node_modules/recharts/lib/component/ResponsiveContainer.js`; no `transform` reference). The actual offenders in this codebase are:

| File | Line | Offending CSS | Risk |
|------|------|---------------|------|
| `styles.css` | 251 | `.cmc-btn:hover { transform: translateY(-2px) }` | **HIGH** — every button creates a containing block on hover. If a Tooltip is mounted while user hovers a button, the tooltip clips/displaces. |
| `styles.css` | 706 | `.cmc-heatmap-cell:hover { transform: scale(1.15) }` | MEDIUM — only on hover; heatmap cells have no Radix children typically. |
| `styles.css` | 333-334 | `@keyframes cmc-tooltip-in { transform: translateY(4px) }` | LOW — animation is on the tooltip itself, not an ancestor. |
| `styles.css` | 481-482 | `@keyframes` for cmdk dialog (`transform: scale(0.96)`) | MEDIUM — Cmd+K palette open animation. |
| `Sheet.tsx` | 47, 49 | `<motion.div>` `initial={{ x: '100%' }} animate={{ x: 0 }}` | **HIGH** — framer-motion applies `transform: translateX(...)` to the Sheet panel. If the Sheet panel itself has Radix Portal children (e.g., a DropdownMenu inside the Sheet body), those children's `position: fixed` will be clipped to the Sheet panel, NOT the viewport. |
| `EditAcceptanceCard.tsx`, etc. | misc | recharts `<ResponsiveContainer>` does NOT use `transform`. **No risk from recharts itself.** |

**Audit method (deliverable for CONT-02):**

1. **Static CSS grep:** `rg -n "transform:\s*(?!none)" frontend/src/styles.css` — list every transform-bearing class. Triage as acceptable (animation that doesn't outlive Radix child mount) or risky.

2. **Static React grep:** `rg -n "motion\.\w+|framer-motion" frontend/src/components/` — list every framer-motion `<motion.*>` in the tree. For each, verify whether it can contain a Radix Portal-mounted child.

3. **Runtime Playwright probe:** add `tests/e2e/v13-portal-containment.spec.ts` that:
   - For every route × every Sheet/DropdownMenu/Tooltip mount path: open the overlay, then walk `document.body` for any element whose `getComputedStyle().transform !== 'none'` AND that is an ancestor of the Portal-mounted content. Fail if found.

4. **The hover bug specifically:** because `.cmc-btn:hover` only sets `transform` on hover, the Playwright probe must hover a button while a tooltip is mounted on a sibling element to reproduce. Easier mitigation: **change `.cmc-btn:hover` from `transform: translateY(-2px)` to `box-shadow` + `margin-top: -2px`** or use `top: -2px` with `position: relative`, both of which avoid creating a containing block. Verify there are no Radix Portal children inside `<button>` elements (there shouldn't be).

5. **The Sheet bug specifically:** if a DropdownMenu must open INSIDE a Sheet, mount the DropdownMenu's `<DropdownMenu.Portal>` with `container={document.body}` (Radix's default) — but verify the framer-motion ancestor doesn't trap it. If trapping is unavoidable, the alternative is to **drop framer-motion from Sheet and use CSS keyframe animation** that animates a non-transform property (e.g., `right: -480px` → `right: 0`), at the cost of less smooth animation. **Phase 24 recommendation: leave Sheet as-is for now (no Radix Portal children inside Sheet exist in v1.2; verified by grep). Add the Playwright probe so future violations are caught.**

#### DataTable truncation+tooltip (CONT-03)

**`scrollWidth > clientWidth` lazy detection pattern:**

```tsx
// frontend/src/components/ui/TruncatedCell.tsx
import { useEffect, useRef, useState } from 'react'
import { Tooltip } from './Tooltip'

interface Props {
  value: string
  onCopy?: () => void  // optional copy-icon affordance for known-long fields
}

export function TruncatedCell({ value, onCopy }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const measure = () => setIsOverflowing(el.scrollWidth > el.clientWidth)
    measure()                 // initial
    const ro = new ResizeObserver(measure)  // re-measure on layout change
    ro.observe(el)
    return () => ro.disconnect()
  }, [value])

  const inner = (
    <span ref={ref} className="cmc-cell--truncate">{value}</span>
  )

  if (!isOverflowing && !onCopy) return inner
  if (!isOverflowing && onCopy) {
    // No tooltip needed (fits) but still show copy affordance.
    return (
      <span className="cmc-cell--copyable">
        {inner}
        <CopyIconButton value={value} onCopy={onCopy} />
      </span>
    )
  }
  // Overflowing — wrap in tooltip + copy-icon.
  return (
    <Tooltip content={value} side="top">
      <span className="cmc-cell--copyable">
        {inner}
        {onCopy ? <CopyIconButton value={value} onCopy={onCopy} /> : null}
      </span>
    </Tooltip>
  )
}
```

**Why ResizeObserver, not requestAnimationFrame:** ResizeObserver fires only when the element's box actually changes size (layout-driven). rAF would fire 60×/sec regardless. ResizeObserver is the canonical browser API for this; supported everywhere modern (Chrome 64+, Safari 13.1+, FF 69+).

**Why measure on every render:** The `useEffect`'s dep array has `value`, so re-measuring on value change handles the case where row data updates (long text becomes short or vice versa).

**Anti-pattern to avoid:** Don't put the ResizeObserver on the `<table>` or `<tr>` — table cells are rendered inside layout-controlled flow and `scrollWidth` only reports correctly on the inline element with `overflow: hidden; text-overflow: ellipsis`.

#### CSS for truncation

```css
.cmc-table-wrap { width: 100%; overflow-x: auto; }
.cmc-table { width: 100%; table-layout: fixed; }      /* table-layout: fixed is what makes cells respect their column widths */
.cmc-cell--truncate {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.cmc-cell--copyable { display: inline-flex; align-items: center; gap: var(--cmc-space-2xs); }
.cmc-cell--copyable .cmc-cell__copy-btn {
  opacity: 0;
  transition: opacity 120ms ease-out;
}
.cmc-cell--copyable:hover .cmc-cell__copy-btn,
.cmc-cell--copyable:focus-within .cmc-cell__copy-btn {
  opacity: 1;
}
```

**Copy-icon button placement:** **Inline, right-aligned, hover-revealed inside a `display: inline-flex` cell wrapper.** GitHub commit-SHA pattern. Floating-overlay (absolutely positioned) was considered but rejected — it competes with row-click semantics and risks being clipped by `overflow: hidden` ancestors during truncation.

```tsx
// frontend/src/components/ui/CopyIconButton.tsx
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopyIconButton({ value, onCopy }: { value: string; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button"
      className="cmc-cell__copy-btn"
      data-testid="cell-copy-btn"
      aria-label={`Copy "${value}"`}
      onClick={(e) => {
        e.stopPropagation()                       // don't fire row-click
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          onCopy?.()
          setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      {copied ? <Check size="var(--cmc-icon-size-sm)" /> : <Copy size="var(--cmc-icon-size-sm)" />}
    </button>
  )
}
```

The `stopPropagation()` is critical: tables that have row-click handlers (LiveSessionsCard, SkillRunsTable open a Sheet on row-click) must not trigger the row-click when the copy icon is clicked.

**DataTable per-column opt-out (CONT-03 contract):**

```ts
export interface DataTableColumn<T> {
  // …existing fields…
  /** When true, cell content wraps to multiple lines instead of truncating with tooltip.
   * Default: false (truncate). Use for notes/description columns. */
  wrap?: boolean
  /** When true, render copy-icon affordance for the cell value. Used for session-id, cwd, skill-name. */
  copyable?: boolean
}
```

DataTable's `<td>` rendering applies `cmc-cell--truncate` by default; if `col.wrap === true`, it omits the class and lets content wrap.

### Z-index ladder (CONT-05)

#### Existing values (verified `styles.css`)

| Layer | z-index | Source |
|-------|---------|--------|
| Tooltip | 50 (line 330) | `.cmc-tooltip` |
| Sheet overlay | 40 (line 396) | `.cmc-sheet__overlay` |
| Sheet panel | 41 (line 404) | `.cmc-sheet__panel` |
| AlertDialog overlay | 45 (line 1368) | `.cmc-alert-dialog__overlay` |
| AlertDialog panel | 46 (line 1385) | `.cmc-alert-dialog__panel` |
| CommandPalette | 50 (line 466) | `.cmc-cmdk` |
| EmergencyStopBanner | 50 (referenced from PITFALLS milestone notes) | — |

**Conflict:** Tooltip (50) === CommandPalette (50). If a tooltip is open and Cmd+K opens, render order determines stacking. Should be fixed.

**Conflict 2:** AlertDialog (45/46) is BELOW Tooltip (50) which means a tooltip mounted from inside an AlertDialog can be above the dialog overlay — but the tooltip's portal mounts at `document.body`, so its stacking context is the root, and the AlertDialog overlay above it would obscure the tooltip. This works correctly today only because no tooltip-in-dialog interactions exist.

#### Proposed ladder — concrete integers and CSS variable names

Add to `:root` in `styles.css`:

```css
:root {
  /* Z-index ladder — Phase 24 (CONT-05). Spaced by 10 so future
   * additions can slot in without breaking ordering. Higher = on top. */
  --cmc-z-base:        0;     /* default flow */
  --cmc-z-sticky:     10;     /* sticky table headers, sticky page chrome */
  --cmc-z-sidebar:    20;     /* sidebar — above page content, below overlays */
  --cmc-z-header:     20;     /* AppShellHeader — same plane as sidebar */
  --cmc-z-tooltip:    30;     /* tooltip on page elements */
  --cmc-z-popover:    40;     /* popover (time picker, info popovers) */
  --cmc-z-dropdown:   50;     /* DropdownMenu (density picker, row actions) */
  --cmc-z-sheet:      60;     /* Sheet (overlay 60, panel 61) */
  --cmc-z-dialog:     70;     /* AlertDialog (overlay 70, panel 71) */
  --cmc-z-cmdk:       80;     /* Cmd+K palette — above Sheet, above dialog */
  --cmc-z-toast:      90;     /* future toast/pip — Copied confirmation */
  --cmc-z-banner:    100;     /* EmergencyStopBanner — always above everything */
}
```

Apply via existing class declarations:

```css
.cmc-tooltip       { z-index: var(--cmc-z-tooltip); }
.cmc-sheet__overlay { z-index: var(--cmc-z-sheet); }
.cmc-sheet__panel  { z-index: calc(var(--cmc-z-sheet) + 1); }
.cmc-alert-dialog__overlay { z-index: var(--cmc-z-dialog); }
.cmc-alert-dialog__panel   { z-index: calc(var(--cmc-z-dialog) + 1); }
.cmc-cmdk          { z-index: var(--cmc-z-cmdk); }
.cmc-sidebar       { z-index: var(--cmc-z-sidebar); }
.cmc-app-shell-header { z-index: var(--cmc-z-header); }
```

#### `docs/z-index-ladder.md` skeleton

```markdown
# Z-index ladder

This document is the single source of truth for stacking order in CMC's surface.
Every overlay primitive MUST use a `--cmc-z-*` CSS variable; raw integers are forbidden
in `frontend/src/styles.css` and component-level inline `style={{ zIndex: ... }}`.

## Order (low → high)

| Layer            | CSS variable          | Value | Use case |
|------------------|------------------------|------:|----------|
| Base flow        | `--cmc-z-base`         |     0 | Default content |
| Sticky chrome    | `--cmc-z-sticky`       |    10 | Sticky table headers; sticky filter bar |
| Shell chrome     | `--cmc-z-sidebar` / `--cmc-z-header` | 20 | Sidebar + AppShellHeader |
| Tooltip          | `--cmc-z-tooltip`      |    30 | Hover/focus tooltips |
| Popover          | `--cmc-z-popover`      |    40 | Time picker, info popovers |
| DropdownMenu     | `--cmc-z-dropdown`     |    50 | Density picker, row actions |
| Sheet            | `--cmc-z-sheet` (+1)   | 60/61 | Side-drawer overlays + panel |
| AlertDialog      | `--cmc-z-dialog` (+1)  | 70/71 | Destructive confirms |
| Cmd+K palette    | `--cmc-z-cmdk`         |    80 | Above all routine overlays |
| Toast / pip      | `--cmc-z-toast`        |    90 | Transient notifications |
| Emergency banner | `--cmc-z-banner`       |   100 | Top-priority safety signal |

## Rules
- **Never use a raw integer for z-index** in component CSS. Use a `--cmc-z-*` variable.
- **Never break the ladder.** New layers slot into the gaps (10, 35, 55, etc.) by adding
  a new variable in `styles.css` `:root` and updating this doc.
- **Tooltips inside Sheets/Dialogs:** the tooltip's portal mounts at `document.body`, so
  its stacking context is the root. Tooltip z-index (30) is BELOW Sheet (60) — meaning
  a tooltip mounted while a Sheet is open will be hidden behind the Sheet. This is the
  intended behavior for v1.3.

## ESLint enforcement
A custom ESLint rule (`cmc/no-raw-z-index`) bans raw integers in `style={{ zIndex: <num> }}`
and CSS class declarations matching `z-index: \d+` (except inside `:root`).
```

### Quality-gate tooling (POLI-09..14)

#### Lighthouse CI (NEW tooling — researcher scope)

**Install:**
```bash
cd frontend
pnpm add -D @lhci/cli@^0.15.1
```

**Config** at `frontend/lighthouserc.json` (JSON form chosen over JS for simplicity; matches existing `playwright.config.ts` pattern of single root config):

```json
{
  "ci": {
    "collect": {
      "url": [
        "http://127.0.0.1:4173/",
        "http://127.0.0.1:4173/activity",
        "http://127.0.0.1:4173/sessions/compare?a=demo-a&b=demo-b"
      ],
      "startServerCommand": "pnpm preview -- --port 4173 --strictPort --host 127.0.0.1",
      "startServerReadyPattern": "ready in",
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop",
        "throttlingMethod": "provided"
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["warn", { "minScore": 0.9 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift":  ["error", { "maxNumericValue": 0.1 }],
        "interaction-to-next-paint": ["error", { "maxNumericValue": 200 }]
      }
    },
    "upload": {
      "target": "filesystem",
      "outputDir": ".lighthouseci"
    }
  }
}
```

**Why filesystem upload, not GitHub Action / temporary public storage:** the dashboard is single-user local-only, no CI server, no external sharing. Operator runs `npx lhci autorun` at phase close, reviews `.lighthouseci/manifest.json` + the per-URL HTML reports, and references the verdict in `VISUAL-CHECK.md`. Add `.lighthouseci/` to `.gitignore`.

**Rationale for thresholds:** LCP < 2.5s, CLS < 0.1, INP < 200ms are Google's Core Web Vitals "Good" boundaries. They are **NOT aggressive** — they're the standard pass bar. For a localhost dashboard these are easy to hit; the value is catching regressions (e.g., a future phase adds 300kB of unbundled charts and LCP jumps).

**Sessions-compare URL note:** the `?a=demo-a&b=demo-b` query string requires demo session IDs to exist. Phase 24 plan must seed those into the test database for Lighthouse to render the route fully — otherwise LCP measures the empty-state page, not the real surface. Coordinate with `tests/e2e/sessions-compare.spec.ts` fixtures.

**Operator-driven, not CI-blocking:** Lighthouse CI's `assert` section will exit non-zero if a threshold fails — but the workflow is operator runs `npx lhci autorun` at phase close, not on every PR. This matches the locked CONTEXT decision (Lighthouse CI runs at phase close).

#### Axe-core integration (Playwright fixture)

Decision: **`@axe-core/playwright` over `axe-playwright` or vitest plugin.** Reasons:
- Tests run against the production build (`vite preview`) which catches CSS regressions vitest+jsdom can't (computed `font-size`, `color`, contrast all need a real browser).
- Axe-core needs the actual rendered DOM with stylesheets applied; jsdom can't compute contrast accurately.
- Single tooling family with existing `playwright.config.ts`.

**Install:**
```bash
pnpm add -D @axe-core/playwright@^4.11.2
```

**Fixture** at `frontend/tests/e2e/v13-a11y.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const ROUTES = ['/', '/activity', '/skills', '/cost', '/alerts'] as const

test.describe('POLI-10: a11y — serious + critical violations block', () => {
  for (const route of ROUTES) {
    test(`${route} — no serious or critical axe violations`, async ({ page }) => {
      await page.goto(route)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      const blocking = results.violations.filter(v =>
        v.impact === 'serious' || v.impact === 'critical'
      )
      const warnings = results.violations.filter(v =>
        v.impact === 'moderate' || v.impact === 'minor'
      )

      // Log warnings for VISUAL-CHECK.md inclusion.
      if (warnings.length > 0) {
        console.warn(`${route}: ${warnings.length} moderate/minor a11y warnings`)
        for (const w of warnings) console.warn(`  - ${w.id}: ${w.help}`)
      }

      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([])
    })
  }
})
```

**Density × theme matrix:** for Phase 24 specifically, repeat the test for each density × theme pair (3 × 2 = 6 runs per route). This catches contrast-failure regressions that only manifest in Compact + light theme.

#### Playwright visual auto-capture script (POLI-09)

```ts
// frontend/tests/e2e/v13-visual-capture.spec.ts
import { test, expect } from '@playwright/test'
import path from 'node:path'

const ROUTES = [
  { path: '/',                slug: 'command' },
  { path: '/activity',         slug: 'activity' },
  { path: '/skills',           slug: 'skills' },
  { path: '/cost',             slug: 'cost' },
  { path: '/alerts',           slug: 'alerts' },
  { path: '/sessions/compare?a=demo-a&b=demo-b', slug: 'sessions-compare' },
] as const
const DENSITIES = ['compact', 'comfortable', 'cozy'] as const
const THEMES = ['dark', 'light'] as const
const PHASE = '24'
const PHASE_DIR = path.resolve(__dirname, `../../../.planning/phases/${PHASE}-shell-density-containment-primitives/visual-check`)

test.describe('POLI-09: visual auto-capture — Phase 24 matrix (5 routes × 3 densities × 2 themes = 30 PNGs)', () => {
  for (const route of ROUTES) {
    for (const density of DENSITIES) {
      for (const theme of THEMES) {
        test(`capture ${route.slug} density=${density} theme=${theme}`, async ({ page }) => {
          // Pre-mount apply via localStorage — main.tsx reads these before paint.
          await page.addInitScript(([d, t]) => {
            window.localStorage.setItem('cmc.density', d)
            window.localStorage.setItem('cmc.theme', t)
          }, [density, theme])
          await page.goto(route.path)
          await page.waitForLoadState('networkidle')
          await page.screenshot({
            path: path.join(PHASE_DIR, `${route.slug}__${density}__${theme}.png`),
            fullPage: true,
          })
        })
      }
    }
  }
})
```

**PNG naming convention:** `{route-slug}__{density}__{theme}.png` — double-underscore separator, lowercase, slug-safe. Operator scans the dir alphabetically: routes group together. Add to `.gitignore` (or commit if operator wants visual evidence in history; CONTEXT is silent, recommend gitignore + reference in VISUAL-CHECK.md).

**VISUAL-CHECK.md skeleton** at `.planning/phases/24-shell-density-containment-primitives/24-VISUAL-CHECK.md`:

```markdown
# Phase 24 — VISUAL-CHECK

**Operator:** {name}
**Date:** {YYYY-MM-DD}
**Capture command:** `cd frontend && pnpm test:e2e tests/e2e/v13-visual-capture.spec.ts`
**Captured PNGs:** `.planning/phases/24-shell-density-containment-primitives/visual-check/` (30 files)

## Verdict

| Route × Density × Theme | Verdict | Notes |
|--|--|--|
| / × compact × dark | PASS / FAIL | … |
| … (29 more rows) | | |

## Axe-core results
…

## Lighthouse CI results
…

## Perf budget
| Gate | Result |
|--|--|
| Density toggle React re-render count = 0 | PASS / FAIL (evidence: React DevTools profiler screenshot) |
| Chart polling p95 paint < 16ms | PASS / FAIL |
| ResponsiveContainer instance count stable | PASS / FAIL |
```

#### Perf budget — React re-render measurement (POLI-11)

**Density-toggle zero re-render gate:** binary. Method:
1. Open `/activity` (chart-heavy route).
2. Open React DevTools → Profiler tab → Start recording.
3. Click density toggle (Comfortable → Compact).
4. Stop recording.
5. **Pass condition:** zero React commits show in the profiler timeline.

The reason this is achievable: density tokens cascade via CSS variables on `:root`. The toggle calls `setDensity('compact')` which calls `document.documentElement.dataset.density = 'compact'` — a DOM mutation that triggers a CSS recalc, NOT a React render. The `useDensity()` hook stores the value in local state for the toggle button's check-mark UI, so ONE component (the toggle) re-renders, but no chart, no panel, no table re-renders. **Verify the toggle button is below `<DensityProvider>`'s children and isolated** — don't put `density` in a context that other components consume.

**Chart polling p95 paint < 16ms:** measure with Chrome DevTools Performance tab. Open `/`, record 60s of polling activity, scan the Frames row for any paint > 16ms. Record p95 in VISUAL-CHECK.md.

**ResponsiveContainer count stable:** baseline = current count from `rg -c "ResponsiveContainer" frontend/src/components/panels/ | awk -F: '{s+=$2}END{print s}'`. Phase 24 should NOT add or remove any. Report in VISUAL-CHECK.md as integer.

### POLI artifacts

#### `docs/affordance-checklist.md` — 15 entries (POLI-12)

Proposed enumeration (operator may reorder/swap):

```markdown
# Affordance checklist

15 keyboard / pointer / a11y affordances every route must honor. Verified at every phase close.

| # | Affordance | Verification |
|--:|------------|--------------|
| 1 | `Cmd+K` opens command palette from any route | `tests/e2e/command-palette.spec.ts` |
| 2 | `Esc` closes Sheet, AlertDialog, DropdownMenu, Cmd+K | Manual + axe-core checks `keyboard` rule |
| 3 | `Cmd+B` toggles sidebar collapsed state | `tests/e2e/v13-sidebar.spec.ts` |
| 4 | Click outside Sheet/Popover/DropdownMenu closes it | Radix default — verified by Playwright fixture |
| 5 | `Tab` cycles focus inside Sheet without escaping | Radix default; assert focus stays in Sheet panel |
| 6 | Closing Sheet returns focus to its trigger | Radix default; assert `document.activeElement === trigger` |
| 7 | `Tab` reaches every interactive element on every route | Playwright tab-walk fixture |
| 8 | Visible focus ring on every focusable element | axe-core `focus-order-semantics` |
| 9 | Theme toggle persists via localStorage `cmc.theme` | `tests/e2e/theme-toggle.spec.ts` |
| 10 | Density toggle persists via localStorage `cmc.density` | `tests/e2e/v13-density.spec.ts` |
| 11 | Sidebar collapsed state persists via localStorage `cmc.sidebar.collapsed` | `tests/e2e/v13-sidebar.spec.ts` |
| 12 | Click-to-copy on session-id / cwd / skill-name shows confirmation pip | `tests/e2e/v13-copy-cell.spec.ts` |
| 13 | Truncated cells show full value on hover via tooltip | `tests/e2e/v13-truncation.spec.ts` |
| 14 | Active route highlighted in sidebar (left-edge bar + tinted bg) | `tests/e2e/v13-sidebar.spec.ts` (DOM + computed style) |
| 15 | Sheet body scrolls internally; outer page does not gain a scrollbar | `tests/e2e/v13-containment.spec.ts` |
```

#### `docs/testid-registry.md` + ESLint rule (POLI-14)

Skeleton:

```markdown
# data-testid registry

Every Playwright-targeted DOM element MUST have its `data-testid` value listed here.
Adding a new testid without updating this doc fails the `cmc/testid-registry-only`
ESLint rule.

## Shell
- `theme-toggle` — `frontend/src/components/shell/ThemeToggle.tsx`
- `density-toggle-trigger` — `frontend/src/components/shell/DensityToggle.tsx`
- `density-option-compact`, `density-option-comfortable`, `density-option-cozy` — DropdownMenu items
- `sidebar-collapse-toggle` — `frontend/src/components/shell/Sidebar.tsx`
- `sidebar-link-{slug}` — auto-generated per route (slug = `to.replace(/\W/g, '-')`)
- `save-view-button` — placeholder in AppShellHeader (Phase 25 wires it)
- `time-picker-trigger` — placeholder in AppShellHeader (Phase 26 wires it)

## Tables (existing v1.2 baseline)
- `cell-copy-btn` — `frontend/src/components/ui/CopyIconButton.tsx`
- … (full v1.2 baseline list — extracted by registry-bootstrap script)

## Skip count
- v1.2 baseline: 2 known skips. Skip count locked at 2 — exceeding it fails CI.
```

**ESLint rule** `frontend/eslint-rules/testid-registry-only.cjs`:

```js
// Custom ESLint rule — POLI-14.
// Forbids JSX `data-testid={"…"}` literals not present in docs/testid-registry.md.
// Implementation strategy:
//   1. Load docs/testid-registry.md once on rule-init; parse all bullet items
//      starting with backtick-quoted IDs.
//   2. Visit every JSXAttribute with name="data-testid" and value as a string literal
//      (or template literal with no expressions); check membership.
//   3. For dynamic values (template with expression, e.g., `sidebar-link-${slug}`),
//      require a `data-testid-pattern` annotation comment that matches a registered pattern.
module.exports = {
  meta: { type: 'problem', schema: [], messages: {
    unregistered: 'data-testid "{{id}}" is not registered in docs/testid-registry.md',
    dynamicRequiresPattern: 'dynamic data-testid requires // eslint-disable-line cmc/testid-registry-only OR a registered pattern in docs/testid-registry.md',
  } },
  create(context) {
    const registered = loadRegistry()  // parse markdown once at rule init
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'data-testid') return
        const v = node.value
        if (v?.type === 'Literal' && typeof v.value === 'string') {
          if (!registered.has(v.value)) {
            context.report({ node, messageId: 'unregistered', data: { id: v.value } })
          }
        }
        // (template/expression handling elided)
      }
    }
  }
}
```

**Wire into existing ESLint config:** if no ESLint config exists in the repo (verified: `find -name "eslint*"` returned nothing in source dirs), Phase 24 plan must scope ESLint setup as a sub-task. Add `frontend/eslint.config.js` (flat config — ESLint 9 default for new repos in 2026), register the custom rule via `plugins: { cmc: { rules: require('./eslint-rules') } }`, and add a `lint` script to `package.json`.

#### `docs/url-contract.md` + `tests/test_url_contract.py` (POLI-13)

`docs/url-contract.md` skeleton:

```markdown
# URL contract

Every URL pattern in this list is preserved across phases. Breaking a pattern requires
explicit migration planning.

## Routes

| URL pattern | File | Description | validateSearch shape |
|-------------|------|-------------|----------------------|
| `/` | `routes/index.tsx` | Mission Control / home | none |
| `/activity` | `routes/activity.tsx` | Activity heatmap + sessions | none in v1.3 (search-param schema added in Phase 26) |
| `/skills` | `routes/skills.tsx` | Skills registry | none |
| `/skills/$name` | `routes/skills_.$name.tsx` | Skill detail | none |
| `/sessions/compare` | `routes/sessions_.compare.tsx` | Session compare (TWO-arg required) | `{ a: string, b: string }` validated by hand-written `validateSearch` |
| `/cost` | `routes/cost.tsx` | Cost analytics | none |
| `/alerts` | `routes/alerts.tsx` | Alert rules + events | none |

## Stability rules
- Adding a search param to an existing route is BACKWARDS-COMPATIBLE if the new param has a default.
- Removing a search param requires a deprecation phase.
- Renaming a route file requires a phase-level migration plan + a redirect from old to new.
```

**`tests/test_url_contract.py`** — Python-based CI gate (the existing pytest harness covers the URL constants by greping the route tree):

```python
# tests/test_url_contract.py — POLI-13
# Asserts every URL pattern in docs/url-contract.md still exists in the route tree.
# Reads route files; greps for `path:`, `to:`, or filename-derived URL.
# Fails CI if a documented pattern has no corresponding route file.

import re, pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
URL_DOC = REPO_ROOT / "docs" / "url-contract.md"
ROUTE_DIR = REPO_ROOT / "frontend" / "src" / "routes"

def parse_doc_urls() -> set[str]:
    text = URL_DOC.read_text()
    # Match table rows: | `/path` | …
    return set(re.findall(r"\|\s*`(/[\w$./-]+)`", text))

def derive_route_urls() -> set[str]:
    urls = set()
    for f in ROUTE_DIR.glob("*.tsx"):
        if f.name == "__root.tsx" or f.name == "routeTree.gen.ts": continue
        # Trailing-underscore opt-out + dollar-prefix params follow TanStack Router file-based conventions.
        slug = f.stem.replace("_.", "/").replace(".", "/").replace("$", ":") if False else \
               "/" + f.stem.replace("_.", "/").replace(".", "/").replace("$", ":")
        if slug == "/index": slug = "/"
        urls.add(slug)
    return urls

def test_url_contract_documented_routes_exist():
    documented = parse_doc_urls()
    actual = derive_route_urls()
    missing = documented - actual
    assert not missing, f"Documented URLs missing from route tree: {missing}"
```

(The route-derivation regex is illustrative — Phase 24 task implementing it must verify against TanStack Router file-based conventions. The existing `routeTree.gen.ts` may be a more reliable source than parsing filenames.)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Density picker dropdown | Custom `<button>` + outside-click handler | `@radix-ui/react-dropdown-menu` | Free: arrow-key nav, type-ahead, focus trap, Portal, escape-to-close |
| Sidebar collapsed-mode tooltip | Custom hover detection + positioning | Existing `ui/Tooltip.tsx` (Radix) | Already in repo; Radix handles delay, dismissal, collision detection |
| Cell-overflow detection | `setInterval` + element measurement | `ResizeObserver` + lazy mount | Browser-native, fires only on actual size change, no polling overhead |
| Scroll-to-fit flex layout | Per-page `min-height` calculations | The `min-height: 0` flex ladder + a single shared `.cmc-page--bounded` class | One CSS rule fixes all pages; per-page calculations drift |
| Visual regression infrastructure | Storybook + Chromatic + per-PR diff CI | Operator-driven Playwright auto-capture + verdict in MD | Locked in CONTEXT (POLI-09); single-user repo doesn't need CI integration |
| z-index conflict resolution | Per-component magic numbers | `--cmc-z-*` CSS variables in `:root` | Single source of truth; ESLint rule enforces it |
| Lighthouse perf measurement | Custom puppeteer + manual stopwatch | `@lhci/cli` autorun | Wraps Lighthouse's measurement protocol with retry, multi-run averaging |
| a11y violation detection | Manual VoiceOver passes | `@axe-core/playwright` fixture | Catches WCAG violations in CI, not just at phase close |
| Pre-mount density apply | `useEffect` setting `data-density` after first render | `applyDensity()` called from `main.tsx` BEFORE `createRoot()` | Mirrors `applyTheme()`; avoids flash of wrong density |

**Key insight:** The Phase 24 stack is intentionally minimalist. Every gap is filled by either (a) a primitive already in `frontend/package.json`, or (b) one of the four locked installs. There is NO temptation to hand-roll any of the listed problems — every alternative has known pitfalls documented in the milestone PITFALLS.md research.

## Common Pitfalls

### Pitfall 1: localStorage pre-mount race condition

**What goes wrong:** `applyDensity()` runs synchronously in `main.tsx` BEFORE `ReactDOM.createRoot(...)`. Cool. But if the operator uses `pnpm dev` with HMR, on a hot reload `main.tsx` is re-executed; meanwhile, the existing React tree's `<DensityProvider>` may have already updated the `data-density` attribute via a re-render. Race: pre-mount apply (reads localStorage, sets attr) vs. component-driven apply (reads state, sets attr). If localStorage contains `compact` but the in-memory state is `cozy`, the attribute flickers.

**Why it happens:** The same race shipped in v1.2 for theme — but since theme rarely changes mid-session, nobody noticed. Density toggle is more frequent.

**How to avoid:**
1. `DensityProvider`'s `useEffect` runs `setDensity(getDensity())` on mount — which writes localStorage AND attribute. After the first effect, in-memory state, localStorage, and attribute are all in sync. This eliminates the race after the first paint.
2. The toggle button writes through `setDensity()` (the lib function), NOT directly to React state — so React state, localStorage, and attribute always update together.
3. **Do not** use a React Context for density. The CSS-only swap is what makes POLI-11's zero-re-render gate achievable. If a context propagates `density`, every consumer re-renders on every toggle.

**Warning signs:**
- A density toggle test fails intermittently in CI.
- The `<html>` `data-density` attribute differs from `localStorage.getItem('cmc.density')` after a render.

### Pitfall 2: Transform-bearing ancestor breaks Radix Portal

**What goes wrong:** Detailed in the CONT-02 audit section above. Hover-state `transform: translateY(-2px)` on `.cmc-btn` is the most visible offender today.

**Why it happens:** Designers/developers don't know that `transform: none` is special. MDN's `position` page calls this out, but it's easy to miss.

**How to avoid:**
1. Replace `.cmc-btn:hover { transform: translateY(-2px); }` with `box-shadow` + `margin-top: -2px` (or `top: -2px; position: relative;`). Visual effect identical; no containing block created.
2. Add a Playwright probe (described in CONT-02 audit method).
3. Document the rule in `frontend/src/components/ui/AGENTS.md`: "Never apply `transform`, `filter`, `perspective`, or `will-change: transform` to a class that wraps Radix Portal-mounted content."

**Warning signs:**
- A Tooltip appears to the upper-left of where it should (offset by the button's hover translate).
- A DropdownMenu inside a Sheet renders behind the Sheet panel.
- Cmd+K palette shifts when the page is mid-animation.

### Pitfall 3: CSS variable cascade scoped to a child accidentally breaks Radix Portal

**What goes wrong:** A developer adds density tokens to `.cmc-shell` instead of `:root`, thinking "shell is the highest level". Radix Portal mounts at `document.body` — OUTSIDE `.cmc-shell`. Tooltips, Sheets, DropdownMenus render with the DEFAULT density tokens (whatever's on `:root`), not the active density.

**Why it happens:** The intuition "scope to my app shell" is correct for most styling. CSS variables work the same way — but the portal pattern bypasses the React tree, and the developer forgets.

**How to avoid:**
1. **Always** put density tokens on `:root` (or `[data-density="compact"]` selector at root level). Never on a subtree.
2. Add a Vitest test: mount `<DensityProvider><Sheet open>...</Sheet></DensityProvider>`, set density to `compact`, query the Sheet panel via `document.querySelector('.cmc-sheet__panel')`, assert `getComputedStyle(panel).getPropertyValue('--cmc-padding-card').trim() === '16px'` (Compact value).
3. Document in `frontend/src/lib/AGENTS.md`: "Density and theme tokens MUST live on `:root` so Radix Portals cascade them."

**Warning signs:**
- A Compact-mode test passes for in-shell components but fails for Sheet/Tooltip content.
- VISUAL-CHECK PNGs show inconsistent spacing between in-shell and overlay content.

### Pitfall 4: Sidebar collapse breaks layout containment

**What goes wrong:** Sidebar collapse changes `.cmc-sidebar { width: 240px → 52px }`. The main column reflows. If `.cmc-shell__column` has not been given `min-width: 0`, the main content refuses to shrink with the available space and the page gets a horizontal scrollbar.

**Why it happens:** Default `min-width: auto` on flex children evaluates to `min-content`, which for a wide table or chart is the full content width.

**How to avoid:** Add `min-width: 0` to `.cmc-shell__column` (already covered in the AppShell rewrite section above). This is the horizontal twin of the `min-height: 0` flex ladder.

**Warning signs:** Toggling sidebar with Cmd+B causes a horizontal scrollbar to appear.

### Pitfall 5: Lighthouse CI fails on `/sessions/compare` because demo data isn't seeded

**What goes wrong:** `/sessions/compare?a=demo-a&b=demo-b` requires those session IDs to exist in the test DB. Without seeding, the route renders an error/empty state and Lighthouse measures the wrong page. LCP threshold may pass spuriously (empty page is fast) or fail spuriously (error state has different paint behavior).

**How to avoid:**
1. Plan task: include a `seed-demo-data.ts` script invoked by `lighthouserc.json`'s `startServerCommand` chain.
2. OR replace `/sessions/compare` with a different chart-heavy route in the Lighthouse target list.

**Warning signs:** First Lighthouse run produces inconsistent results between local and CI.

### Pitfall 6: Skipped Cmd+B in input fields actually submits a form

**What goes wrong:** Cmd+B in a `<textarea>` is the macOS bold shortcut. If the listener `e.preventDefault()` works, sidebar toggles. If the listener doesn't fire (e.g., focus is in a Radix Sheet that traps keys), the bold shortcut fires INSIDE the focused input. This isn't dangerous but confuses users.

**How to avoid:**
1. Listen on `window`, not on a specific element — captures the event before any element-level handler.
2. `e.preventDefault()` unconditionally on the event match.
3. Test with focus inside a Sheet, a `<textarea>`, and the Cmd+K palette.

### Pitfall 7: Axe-core fails on Compact density due to color contrast at smallest font size

**What goes wrong:** Compact body text is 13px. WCAG AA requires 4.5:1 contrast for normal text below 18px. The `--cmc-text-subtle` token (`#5a5a70` on `--cmc-bg` `#0a0a0f`) gives ~3.6:1 — fails AA.

**How to avoid:** Disallow `--cmc-text-subtle` for body content at any density. Limit it to label/kicker usage where the text is 12px+ but in mono font with letter-spacing (which axe-core's contrast check tolerates better). Verify ALL color × size pairs in light theme too — light theme contrast was added in v1.2 as "minimal palette flip" with a deferred polish note in `lib/theme.ts` — Phase 24 may need to revise light-theme tokens.

**Warning signs:** axe-core `color-contrast` violations appear only on Compact + dim text + light theme combo.

## Code Examples

### Density toggle DropdownMenu (mirrors ThemeToggle pattern)

```tsx
// frontend/src/components/shell/DensityToggle.tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Sliders } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getDensity, setDensity, type Density } from '../../lib/density'

const TIERS: { value: Density; label: string }[] = [
  { value: 'compact',     label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'cozy',        label: 'Cozy' },
]

export function DensityToggle() {
  const [density, setLocal] = useState<Density>('comfortable')
  useEffect(() => { setLocal(getDensity()) }, [])

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button"
          className="cmc-density-toggle"
          data-testid="density-toggle-trigger"
          aria-label={`Density: ${density}`}
        >
          <Sliders size="var(--cmc-icon-size-md)" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="cmc-dropdown" sideOffset={6} align="end">
          {TIERS.map(t => (
            <DropdownMenu.Item key={t.value}
              data-testid={`density-option-${t.value}`}
              onSelect={() => { setDensity(t.value); setLocal(t.value) }}
              className="cmc-dropdown__item"
            >
              <span style={{ width: 16 }} aria-hidden>
                {density === t.value ? <Check size={14} /> : null}
              </span>
              {t.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
```

### `lib/density.ts` (mirror of `lib/theme.ts`)

```ts
// frontend/src/lib/density.ts — DENS-01..03.
export type Density = 'compact' | 'comfortable' | 'cozy'
export const DEFAULT_DENSITY: Density = 'comfortable'
const KEY = 'cmc.density'

export function getDensity(): Density {
  if (typeof window === 'undefined') return DEFAULT_DENSITY
  const v = window.localStorage.getItem(KEY)
  return v === 'compact' || v === 'cozy' ? v : 'comfortable'
}
export function setDensity(d: Density): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, d)
  if (typeof document !== 'undefined') document.documentElement.dataset.density = d
}
export function applyDensity(): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.density = getDensity()
}
```

### `main.tsx` change

```ts
// Add line BEFORE ReactDOM.createRoot:
applyDensity()  // density first so initial paint matches localStorage
applyTheme()
```

### `:root` density token block (in `styles.css`)

```css
:root {
  /* Comfortable defaults (DENS-01 default tier). */
  --cmc-space-2xs: 4px;   --cmc-space-xs: 8px;     --cmc-space-sm: 12px;
  --cmc-space-md: 16px;   --cmc-space-lg: 24px;    --cmc-space-xl: 32px;
  --cmc-space-2xl: 48px;
  --cmc-control-height-sm: 28px;  --cmc-control-height-md: 32px;  --cmc-control-height-lg: 40px;
  --cmc-row-height-table: 40px;   --cmc-row-height-list: 36px;
  --cmc-padding-card: 24px;       --cmc-padding-cell: 8px 12px;
  --cmc-size-label: 12px;  --cmc-size-body: 14px;  --cmc-size-heading: 18px;  --cmc-size-display: 28px;
  --cmc-line-height-body: 1.5;    --cmc-line-height-tight: 1.25;
  --cmc-icon-size-sm: 14px;  --cmc-icon-size-md: 16px;  --cmc-icon-size-lg: 20px;

  /* Z-index ladder — see docs/z-index-ladder.md */
  --cmc-z-base: 0;        --cmc-z-sticky: 10;     --cmc-z-sidebar: 20;    --cmc-z-header: 20;
  --cmc-z-tooltip: 30;    --cmc-z-popover: 40;    --cmc-z-dropdown: 50;
  --cmc-z-sheet: 60;      --cmc-z-dialog: 70;     --cmc-z-cmdk: 80;
  --cmc-z-toast: 90;      --cmc-z-banner: 100;
}

[data-density="compact"] {
  --cmc-space-2xs: 2px;   --cmc-space-xs: 6px;     --cmc-space-sm: 10px;
  --cmc-space-md: 12px;   --cmc-space-lg: 18px;    --cmc-space-xl: 24px;
  --cmc-space-2xl: 36px;
  --cmc-control-height-sm: 24px;  --cmc-control-height-md: 28px;  --cmc-control-height-lg: 32px;
  --cmc-row-height-table: 32px;   --cmc-row-height-list: 28px;
  --cmc-padding-card: 16px;       --cmc-padding-cell: 6px 8px;
  --cmc-size-label: 11px;  --cmc-size-body: 13px;  --cmc-size-heading: 16px;  --cmc-size-display: 24px;
  --cmc-line-height-body: 1.4;    --cmc-line-height-tight: 1.2;
  --cmc-icon-size-sm: 12px;  --cmc-icon-size-md: 14px;  --cmc-icon-size-lg: 16px;
}

[data-density="cozy"] {
  --cmc-space-2xs: 6px;   --cmc-space-xs: 12px;    --cmc-space-sm: 16px;
  --cmc-space-md: 20px;   --cmc-space-lg: 32px;    --cmc-space-xl: 40px;
  --cmc-space-2xl: 60px;
  --cmc-control-height-sm: 32px;  --cmc-control-height-md: 40px;  --cmc-control-height-lg: 48px;
  --cmc-row-height-table: 48px;   --cmc-row-height-list: 44px;
  --cmc-padding-card: 32px;       --cmc-padding-cell: 10px 16px;
  --cmc-size-label: 13px;  --cmc-size-body: 16px;  --cmc-size-heading: 22px;  --cmc-size-display: 36px;
  --cmc-line-height-body: 1.6;    --cmc-line-height-tight: 1.3;
  --cmc-icon-size-sm: 16px;  --cmc-icon-size-md: 20px;  --cmc-icon-size-lg: 24px;
}
```

## State of the Art

| Old approach (v1.2) | New approach (v1.3 Phase 24) | Why |
|---------------------|------------------------------|-----|
| Hard-coded `var(--space-lg)` in `.cmc-card` padding (line 222) | `var(--cmc-padding-card)` density-aware token | Density swap affects card padding |
| Top horizontal NavBar (`NavBar.tsx`) | Left vertical Sidebar + AppShellHeader | Dashboard-product convention; affords more vertical real estate per route |
| `transform: translateY(-2px)` on button hover | `box-shadow` + `margin-top: -2px` (or `top: -2px`) | Avoids creating containing block for descendant Radix Portals |
| z-index integers scattered across CSS (40, 41, 45, 46, 50) | `--cmc-z-*` CSS variables in `:root` | Single source of truth; ESLint-enforced |
| Implicit truncation behavior (overflow inherits from parent) | Explicit `cmc-cell--truncate` + `cmc-table-wrap` defaults on DataTable | Predictable; opt-out per column instead of opt-in per cell |
| No visual regression process | Operator-driven Playwright auto-capture matrix | Bounded operator time; reproducible PNGs |
| No a11y CI gate | `@axe-core/playwright` fixture per route × density × theme | Serious+critical violations block phase verification |
| No perf budget | Lighthouse CI at phase close + React DevTools profiler binary gate | Catches regressions before they ship |

## Open Questions

1. **Light theme contrast audit at Compact density**
   - What we know: dark theme contrast is verified at `--cmc-text` (7.5:1) and `--cmc-text-dim` (~7.5:1); `--cmc-text-subtle` fails at body sizes.
   - What's unclear: light theme tokens (`--cmc-bg: #ffffff`, `--cmc-text-dim: #4a4a58`) at Compact 13px body — likely passes but unverified.
   - Recommendation: VISUAL-CHECK matrix runs axe-core on every density × theme pair; if light + Compact + dim text fails, light theme tokens are revised in Phase 24 before phase close (NOT deferred).

2. **NavBar deletion timing**
   - What we know: AppShellHeader replaces NavBar; Sidebar replaces NavBar's link list.
   - What's unclear: whether to delete `NavBar.tsx` in Phase 24 or keep it as dead code through Phase 25 in case rollback is needed.
   - Recommendation: delete in Phase 24 to keep the codebase honest. `git revert` is the rollback mechanism.

3. **ResizeObserver browser support floor**
   - What we know: ResizeObserver is in all current browsers (Chrome 64+, Safari 13.1+, Firefox 69+).
   - What's unclear: macOS Safari 13.0 ships on macOS 10.15 Catalina; users on older macOS may hit it.
   - Recommendation: assume modern macOS (Sonoma 14+); document the floor in `affordance-checklist.md` row 13.

4. **Demo data seeding for Lighthouse `/sessions/compare`**
   - What we know: the route requires `?a=...&b=...` to render content.
   - What's unclear: whether to seed demo sessions or substitute a different chart-heavy route.
   - Recommendation: substitute `/skills` for `/sessions/compare` in the Lighthouse target list — `/skills` has charts and doesn't require search params.

5. **ESLint config bootstrap**
   - What we know: no ESLint config exists in the repo today.
   - What's unclear: whether to ship the full ESLint setup (flat config, plugin discovery, IDE integration) in Phase 24, or just the custom rule + minimal config.
   - Recommendation: minimal ESLint setup that runs only the `cmc/testid-registry-only` rule + the `cmc/no-raw-z-index` rule on commit hook. Full lint sweep is deferred.

## Suggested Wave / File Ordering for the Planner

**Wave A — Foundation (no UX changes visible yet)**
1. Install locked deps (`@radix-ui/react-popover`, `@radix-ui/react-dropdown-menu`, `@lhci/cli`, `@axe-core/playwright`).
2. Add `--cmc-z-*` tokens to `:root` in `styles.css`. Replace existing integer z-indexes in `cmc-tooltip`, `cmc-sheet`, `cmc-alert-dialog`, `cmc-cmdk` rules with the new variables.
3. Add `min-width: 0` to `.cmc-card`. (CONT-03 one-liner.)
4. Add `--cmc-*` density tokens to `:root` (Comfortable values) + alias `--space-*`/`--size-*` to `--cmc-space-*`/`--cmc-size-*`.
5. Replace `.cmc-btn:hover { transform }` with non-transform variant. (Pitfall 2 mitigation.)
6. Write `lib/density.ts` + add `applyDensity()` call in `main.tsx`.

**Wave B — Density layer**
7. Add `[data-density="compact"]` and `[data-density="cozy"]` token overrides.
8. Build `<DensityToggle>` (DropdownMenu).
9. Build `<DensityProvider>` (no context — just a useEffect-based mount-time apply for hot reload safety).
10. Vitest test: density tokens cascade to Radix Portal content.

**Wave C — Containment**
11. Add `.cmc-page--bounded` modifier + min-height ladder rules.
12. Build `<BoundedPanelCard>` primitive + `bounded?` prop on PanelCard.
13. Add `cmc-table-wrap` + `cmc-cell--truncate` CSS classes.
14. Build `<TruncatedCell>` with ResizeObserver lazy detection.
15. Build `<CopyIconButton>` + `data-testid="cell-copy-btn"`.
16. Update `DataTable` to apply truncation by default + accept `wrap` / `copyable` per column.
17. Run static CSS-grep audit for `transform`-bearing classes — document in 24-VISUAL-CHECK.md.

**Wave D — Shell rework (the highly visible wave)**
18. Build `<AppShellHeader>` extracting from current NavBar.
19. Build `<Sidebar>` + `<SidebarSection>` + `<SidebarNavLink>`.
20. Build `lib/sidebar.ts` (collapsed-state localStorage + `applyOnBoot`).
21. Wire Cmd+B keyboard listener.
22. Update `AppShell.tsx` to mount Sidebar + AppShellHeader; flip `.cmc-shell` to `flex-direction: row`.
23. Delete `NavBar.tsx`.
24. Add testid placeholders for save-view-button / time-picker-trigger.

**Wave E — Quality gates**
25. Add `tests/e2e/v13-visual-capture.spec.ts` (matrix: 5 routes × 3 densities × 2 themes = 30 PNGs).
26. Add `tests/e2e/v13-a11y.spec.ts` (axe-core fixture).
27. Add `tests/e2e/v13-portal-containment.spec.ts` (transform-ancestor probe).
28. Add `tests/e2e/v13-sidebar.spec.ts` (Cmd+B + collapsed state).
29. Add `tests/e2e/v13-density.spec.ts` (toggle persists across reload).
30. Add `tests/e2e/v13-truncation.spec.ts` + `v13-copy-cell.spec.ts`.
31. Add `frontend/lighthouserc.json` config + `.lighthouseci/` to `.gitignore`.
32. Add `tests/test_url_contract.py` (Python pytest gate).

**Wave F — POLI documentation**
33. Write `docs/z-index-ladder.md`.
34. Write `docs/affordance-checklist.md` (15 entries).
35. Write `docs/url-contract.md`.
36. Write `docs/testid-registry.md` (bootstrap from v1.2 baseline grep).
37. Add `frontend/eslint.config.js` + custom rules (`testid-registry-only`, `no-raw-z-index`).
38. Add `lint` script to `package.json`; wire pre-commit (optional).

**Wave G — Phase close**
39. Run visual-capture matrix → review 30 PNGs.
40. Run axe-core matrix → confirm 0 serious + 0 critical.
41. Run `npx lhci autorun` → confirm thresholds.
42. Run React DevTools profiler on density toggle → confirm 0 commits.
43. Write 24-VISUAL-CHECK.md verdict.

**Cross-cutting note for the planner:** Waves A and B can interleave (dep install in A is parallel to lib/density.ts writing in B). Waves C and D can run partially in parallel (different files, both depend on Wave A primitives). Wave E depends on Waves B+C+D. Wave F is mostly text/config (parallelizable). Wave G is the close gate.

## Sources

### Primary (HIGH confidence)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/package.json` — verified actual installed deps and versions
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/lib/theme.ts` — pattern density.ts mirrors
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/main.tsx` — `applyTheme()` pre-mount call site
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/shell/NavBar.tsx` — AppShellHeader extraction source
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/ui/Tooltip.tsx` — primitive reused for sidebar collapsed mode AND truncation
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/ui/Sheet.tsx` — framer-motion `<motion.div>` containing-block source
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/ui/PanelCard.tsx` + `DataTable.tsx` — primitives extended in Phase 24
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/styles.css` — verified existing CSS-variable system, z-index integers, transform-on-hover offenders
- `/Users/patrykattc/work/git/claude-mission-control/.planning/research/STACK.md` (milestone) — version + peerDep verifications dated 2026-05-10
- `/Users/patrykattc/work/git/claude-mission-control/.planning/research/ARCHITECTURE.md` (milestone) — provider stack architecture
- `/Users/patrykattc/work/git/claude-mission-control/.planning/research/PITFALLS.md` (milestone) — three reported overflow bugs + transform/Portal interaction
- `/Users/patrykattc/work/git/claude-mission-control/.planning/REQUIREMENTS.md` — requirement IDs CONT-01..05, SHEL-01..04, DENS-01..03, POLI-09..14
- MDN — `position` and `transform` CSS reference: containing-block rule for `position: fixed` descendants of transform-bearing ancestors. https://developer.mozilla.org/en-US/docs/Web/CSS/position and https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block

### Secondary (MEDIUM confidence)
- @lhci/cli docs — https://googlechrome.github.io/lighthouse-ci/docs/configuration.html (config shape)
- @axe-core/playwright npm — https://www.npmjs.com/package/@axe-core/playwright (latest 4.11.2, 10 days ago)
- WCAG 2.1 AA — 4.5:1 normal text, 3:1 large text + UI components
- WCAG 2.5.8 (AA target size) — 24×24 logical px floor for interactive controls
- Google Core Web Vitals "Good" thresholds — LCP 2.5s, CLS 0.1, INP 200ms

### Tertiary (LOW confidence — flagged for validation)
- Lucide icon names for sidebar (`Home`, `Activity`, `GitCompare`, `Sparkles`, `DollarSign`, `Bell`, `Settings`) — verify by searching `lucide-react` icon list at planning time
- Sidebar pixel widths (240 / 52) — discretion call, can adjust during VISUAL-CHECK
- Tooltip side default for sidebar (`right`) — discretion call, can adjust

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified at milestone level + Phase 24 discrete deps verified via web search
- Architecture: HIGH — directly reads existing files; provider stack pattern already established for theme
- Density tokens (numeric values): MEDIUM — 1.25× ratio is a discretion call; values are reasonable but VISUAL-CHECK may force adjustments
- Containment fixes: HIGH — MDN-verified mechanism; existing offenders identified by grep
- Z-index ladder integers: MEDIUM — values are operator-acceptable but plan may revise
- Quality-gate tooling: HIGH for what to install / config shape; MEDIUM for exact thresholds (Google CWV "Good" boundaries)
- Pitfalls: HIGH — every fingerprint cites a real file or a verified MDN/Radix behavior

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (30 days for stable surface; sooner if Radix or recharts ships a major)
