---
phase: 24-shell-density-containment-primitives
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/package.json
  - frontend/pnpm-lock.yaml
  - frontend/src/styles.css
  - frontend/src/lib/density.ts
  - frontend/src/main.tsx
autonomous: true

must_haves:
  truths:
    - "Density tokens cascade through Radix Portal because they live on :root"
    - "Z-index integers no longer scattered as raw numbers in styles.css overlay rules"
    - "Cards no longer overflow grid tracks horizontally (min-width: 0 fix)"
    - "Button hover no longer creates a transform containing-block trap for Radix Portals"
    - "applyDensity() runs before ReactDOM.createRoot, matching applyTheme() pattern"
  artifacts:
    - path: "frontend/src/lib/density.ts"
      provides: "Density type + getDensity/setDensity/applyDensity functions (mirror of theme.ts)"
      exports: ["Density", "DEFAULT_DENSITY", "getDensity", "setDensity", "applyDensity"]
    - path: "frontend/src/styles.css"
      provides: "Density token block on :root + [data-density='compact'|'cozy'] overrides; --cmc-z-* ladder; min-width: 0 on .cmc-card; non-transform .cmc-btn:hover"
      contains: "[data-density=\"compact\"]"
    - path: "frontend/package.json"
      provides: "Locked dep additions: @radix-ui/react-popover, @radix-ui/react-dropdown-menu, @lhci/cli, @axe-core/playwright"
      contains: "@radix-ui/react-dropdown-menu"
  key_links:
    - from: "frontend/src/main.tsx"
      to: "frontend/src/lib/density.ts"
      via: "applyDensity() call before createRoot"
      pattern: "applyDensity\\(\\)"
    - from: "frontend/src/styles.css :root"
      to: "all density-aware rules"
      via: "CSS variable cascade"
      pattern: "var\\(--cmc-(space|size|control-height|row-height|padding-card|padding-cell|line-height|icon-size|z)-"
---

<objective>
Lay every CSS-variable foundation, install the four locked deps, and wire `lib/density.ts` so all later plans can build on a stable substrate. Three of the three reported overflow-bug root causes are surgically fixed at the CSS level here:

1. **CONT-03 one-liner:** `min-width: 0` on `.cmc-card` so grid tracks shrink correctly when a card contains an unbreakable string (long session-id, cwd path, skill-name).
2. **CONT-02 transform-containing-block:** `.cmc-btn:hover` swapped from `transform: translateY(-2px)` to `box-shadow` + `top: -2px; position: relative` so hovered buttons no longer become the containing block for Radix Portal-mounted Tooltips/DropdownMenus.
3. **CONT-05 z-index ladder:** all overlay rules switch from raw integers to `--cmc-z-*` CSS variables. Tooltip/CommandPalette `50` collision resolved (Tooltip → 30, CommandPalette → 80).

Density tokens land on `:root` (with Compact + Cozy overrides via `[data-density="..."]`) so subsequent plans can call `applyDensity()` without further CSS work. **Density tokens MUST live on `:root`** (locked invariant — Radix Portal cascade).

Purpose: De-risk every later plan. After this plan ships, plan 02 (DensityToggle) is ~80 lines of TSX, plan 03 (containment primitives) is purely additive to styles.css, plan 04 (Sidebar) consumes density tokens without further token work.

Output:
- `frontend/src/lib/density.ts` (new, mirrors `lib/theme.ts`).
- `frontend/src/main.tsx` calls `applyDensity()` before `applyTheme()`.
- `frontend/src/styles.css` augmented with: density tokens on `:root`, Compact/Cozy overrides, `--cmc-z-*` ladder on `:root`, replacement of every raw integer in `.cmc-tooltip`/`.cmc-sheet*`/`.cmc-alert-dialog*`/`.cmc-cmdk` z-index, `min-width: 0` on `.cmc-card`, `.cmc-btn:hover` transform→box-shadow swap, base `.cmc-density-toggle` + `.cmc-dropdown` CSS skeleton (consumed by plan 02).
- 4 locked deps installed (`@radix-ui/react-popover@^1.1.15`, `@radix-ui/react-dropdown-menu@^2.1.16`, `@lhci/cli@^0.15.1`, `@axe-core/playwright@^4.11.2`).
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/24-shell-density-containment-primitives/24-CONTEXT.md
@.planning/phases/24-shell-density-containment-primitives/24-RESEARCH.md

@frontend/src/lib/theme.ts
@frontend/src/main.tsx
@frontend/src/styles.css
@frontend/package.json

<interfaces>
<!-- The pattern density.ts mirrors. Keep exported names identical to theme.ts. -->

From frontend/src/lib/theme.ts:
```typescript
export type Theme = 'dark' | 'light'
export const DEFAULT_THEME: Theme = 'dark'
export function getTheme(): Theme            // reads localStorage 'cmc.theme', defaults 'dark'
export function setTheme(theme: Theme): void  // writes localStorage + document.documentElement.dataset.theme
export function applyTheme(): void            // boot-time apply (no localStorage write)
```

From frontend/src/main.tsx (current):
```typescript
import { applyTheme } from './lib/theme'
// ...
applyTheme()
ReactDOM.createRoot(...).render(...)
```

Density.ts MUST mirror this signature (replace `theme` → `density`, key `cmc.theme` → `cmc.density`, default `'dark'` → `'comfortable'`, attribute `data-theme` → `data-density`).

Existing styles.css landmarks (verified by grep):
- Line 218: `.cmc-card { ... }` — needs `min-width: 0` appended
- Line 222: `padding: var(--space-lg)` inside `.cmc-card` — leave as-is in this plan; aliased token swap is later (plan 03+ if needed)
- Line 251: `.cmc-btn:hover { transform: translateY(-2px) }` — replace with non-transform variant
- Line 330: `.cmc-tooltip { z-index: 50 }` — switch to var
- Line 396: `.cmc-sheet__overlay { z-index: 40 }` — switch to var
- Line 404: `.cmc-sheet__panel { z-index: 41 }` — switch to var
- Line 466: `.cmc-cmdk { z-index: 50 }` — switch to var
- Line 1368: `.cmc-alert-dialog__overlay { z-index: 45 }` — switch to var
- Line 1385: `.cmc-alert-dialog__panel { z-index: 46 }` — switch to var
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install locked dependencies and write lib/density.ts</name>
  <files>frontend/package.json, frontend/pnpm-lock.yaml, frontend/src/lib/density.ts, frontend/src/main.tsx</files>
  <action>
1. Install runtime + dev deps from `frontend/`:
   ```bash
   cd frontend
   pnpm add @radix-ui/react-popover@^1.1.15 @radix-ui/react-dropdown-menu@^2.1.16
   pnpm add -D @lhci/cli@^0.15.1 @axe-core/playwright@^4.11.2
   ```
   Verify React 19.2 peerDeps resolved without warnings (research milestone STACK.md confirms compat).

2. Create `frontend/src/lib/density.ts` mirroring `frontend/src/lib/theme.ts` exactly (same SSR guards, same JSDoc style). Exports MUST match this signature exactly (downstream plans depend on it):
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
   The header docstring should call out: "Mirror of `lib/theme.ts`. Density tokens MUST live on `:root` so Radix Portal-mounted content (Tooltip, Sheet, DropdownMenu) inherits them — see DENS-02 invariant."

3. Edit `frontend/src/main.tsx` — add `import { applyDensity } from './lib/density'` and call `applyDensity()` on the line BEFORE `applyTheme()` so initial paint matches localStorage. Do not introduce any other change to main.tsx.

DO NOT add any React component, hook, or context in this task. Density UX (toggle button + provider) is plan 02. This task only ships the lib + boot wiring.

Why call order matters: density tokens cascade into theme-conditional rules in styles.css (`[data-theme="light"]` overrides may reference density-tier-aware values once plan 03+ migrates). Apply density first, theme second so neither attribute fights for first paint.
  </action>
  <verify>
    <automated>cd frontend && pnpm install --frozen-lockfile && pnpm tsc --noEmit && grep -q "applyDensity" src/main.tsx && grep -q "export function applyDensity" src/lib/density.ts && grep -q "@radix-ui/react-dropdown-menu" package.json && grep -q "@lhci/cli" package.json && grep -q "@axe-core/playwright" package.json</automated>
  </verify>
  <done>4 deps appear in `package.json`; `pnpm install` clean; `tsc --noEmit` clean; `frontend/src/lib/density.ts` exports `Density`, `DEFAULT_DENSITY`, `getDensity`, `setDensity`, `applyDensity`; `main.tsx` calls `applyDensity()` before `applyTheme()`.</done>
</task>

<task type="auto">
  <name>Task 2: Write z-index ladder + density tokens + transform-mitigation + min-width fix into styles.css</name>
  <files>frontend/src/styles.css</files>
  <action>
Make the following surgical edits to `frontend/src/styles.css`. All edits are additive or in-place replacements — preserve every existing rule not explicitly listed.

**Edit A — Density tokens block at the top of the existing `:root { ... }` declaration.** Append the following lines (Comfortable values are the new defaults — research §"Token table"):

```css
:root {
  /* … existing tokens preserved … */

  /* Density tokens — DENS-01..03 (Comfortable defaults). */
  --cmc-space-2xs: 4px;
  --cmc-space-xs: 8px;
  --cmc-space-sm: 12px;
  --cmc-space-md: 16px;
  --cmc-space-lg: 24px;
  --cmc-space-xl: 32px;
  --cmc-space-2xl: 48px;
  --cmc-control-height-sm: 28px;
  --cmc-control-height-md: 32px;
  --cmc-control-height-lg: 40px;
  --cmc-row-height-table: 40px;
  --cmc-row-height-list: 36px;
  --cmc-padding-card: 24px;
  --cmc-padding-cell: 8px 12px;
  --cmc-size-label: 12px;
  --cmc-size-body: 14px;
  --cmc-size-heading: 18px;
  --cmc-size-display: 28px;
  --cmc-line-height-body: 1.5;
  --cmc-line-height-tight: 1.25;
  --cmc-icon-size-sm: 14px;
  --cmc-icon-size-md: 16px;
  --cmc-icon-size-lg: 20px;

  /* Z-index ladder — CONT-05. Spaced by 10 so future additions slot in. */
  --cmc-z-base: 0;
  --cmc-z-sticky: 10;
  --cmc-z-sidebar: 20;
  --cmc-z-header: 20;
  --cmc-z-tooltip: 30;
  --cmc-z-popover: 40;
  --cmc-z-dropdown: 50;
  --cmc-z-sheet: 60;
  --cmc-z-dialog: 70;
  --cmc-z-cmdk: 80;
  --cmc-z-toast: 90;
  --cmc-z-banner: 100;
}
```

**Edit B — Compact and Cozy density overrides** (place immediately after the existing `[data-theme="light"]` block, OR create a new section commented `/* Density tier overrides — DENS-02 */`):

```css
[data-density="compact"] {
  --cmc-space-2xs: 2px;
  --cmc-space-xs: 6px;
  --cmc-space-sm: 10px;
  --cmc-space-md: 12px;
  --cmc-space-lg: 18px;
  --cmc-space-xl: 24px;
  --cmc-space-2xl: 36px;
  --cmc-control-height-sm: 24px;
  --cmc-control-height-md: 28px;
  --cmc-control-height-lg: 32px;
  --cmc-row-height-table: 32px;
  --cmc-row-height-list: 28px;
  --cmc-padding-card: 16px;
  --cmc-padding-cell: 6px 8px;
  --cmc-size-label: 11px;
  --cmc-size-body: 13px; /* WCAG AA floor — do not go below 12px without contrast re-check */
  --cmc-size-heading: 16px;
  --cmc-size-display: 24px;
  --cmc-line-height-body: 1.4;
  --cmc-line-height-tight: 1.2;
  --cmc-icon-size-sm: 12px;
  --cmc-icon-size-md: 14px;
  --cmc-icon-size-lg: 16px;
}

[data-density="cozy"] {
  --cmc-space-2xs: 6px;
  --cmc-space-xs: 12px;
  --cmc-space-sm: 16px;
  --cmc-space-md: 20px;
  --cmc-space-lg: 32px;
  --cmc-space-xl: 40px;
  --cmc-space-2xl: 60px;
  --cmc-control-height-sm: 32px;
  --cmc-control-height-md: 40px;
  --cmc-control-height-lg: 48px;
  --cmc-row-height-table: 48px;
  --cmc-row-height-list: 44px;
  --cmc-padding-card: 32px;
  --cmc-padding-cell: 10px 16px;
  --cmc-size-label: 13px;
  --cmc-size-body: 16px;
  --cmc-size-heading: 22px;
  --cmc-size-display: 36px;
  --cmc-line-height-body: 1.6;
  --cmc-line-height-tight: 1.3;
  --cmc-icon-size-sm: 16px;
  --cmc-icon-size-md: 20px;
  --cmc-icon-size-lg: 24px;
}
```

**Edit C — Replace raw z-index integers with `--cmc-z-*` variables in EXISTING rules.** Only these six declarations change; do not add new rules:

| Rule | Current | New |
|------|---------|-----|
| `.cmc-tooltip` (line ~330) | `z-index: 50;` | `z-index: var(--cmc-z-tooltip);` |
| `.cmc-sheet__overlay` (line ~396) | `z-index: 40;` | `z-index: var(--cmc-z-sheet);` |
| `.cmc-sheet__panel` (line ~404) | `z-index: 41;` | `z-index: calc(var(--cmc-z-sheet) + 1);` |
| `.cmc-cmdk` (line ~466) | `z-index: 50;` | `z-index: var(--cmc-z-cmdk);` |
| `.cmc-alert-dialog__overlay` (line ~1368) | `z-index: 45;` | `z-index: var(--cmc-z-dialog);` |
| `.cmc-alert-dialog__panel` (line ~1385) | `z-index: 46;` | `z-index: calc(var(--cmc-z-dialog) + 1);` |

This resolves the Tooltip/CommandPalette `50` collision (Tooltip → 30, CommandPalette → 80) and reorders AlertDialog above DropdownMenu/Sheet.

**Edit D — `min-width: 0` on `.cmc-card`** (line ~218). Append a single line inside the existing `.cmc-card { ... }` block:

```css
.cmc-card {
  /* … existing rules preserved … */
  min-width: 0;  /* CONT-03 — allow grid track to shrink below intrinsic min-content for long unbreakable strings */
}
```

**Edit E — `.cmc-btn:hover` transform mitigation** (line ~251). Replace ONLY the `transform` declaration:

```css
.cmc-btn:hover {
  /* … other existing hover rules preserved (color/border/etc) … */
  /* WAS: transform: translateY(-2px); */
  /* NEW (CONT-02 mitigation — avoid creating a containing block for Radix Portal descendants): */
  position: relative;
  top: -2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
```

If the existing rule already has `position` or `box-shadow`, preserve those values and only ensure the `transform` line is removed. The visual effect is preserved; the behavioral fix is that hovered buttons no longer become the containing block for `position: fixed` Radix Portal children.

**Edit F — Density toggle + dropdown skeleton** (append at the bottom of the file under a `/* Density picker — DENS-01 (consumed by DensityToggle.tsx in plan 02) */` comment):

```css
.cmc-density-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--cmc-control-height-md);
  height: var(--cmc-control-height-md);
  background: transparent;
  border: 1px solid var(--cmc-border);
  border-radius: 6px;
  color: var(--cmc-text-dim);
  cursor: pointer;
  transition: color 120ms ease-out, border-color 120ms ease-out;
}
.cmc-density-toggle:hover { color: var(--cmc-text); border-color: var(--cmc-border-strong, var(--cmc-text-dim)); }

.cmc-dropdown {
  background: var(--cmc-surface);
  border: 1px solid var(--cmc-border);
  border-radius: 8px;
  padding: var(--cmc-space-2xs);
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  z-index: var(--cmc-z-dropdown);
}
.cmc-dropdown__item {
  display: flex;
  align-items: center;
  gap: var(--cmc-space-sm);
  padding: var(--cmc-space-xs) var(--cmc-space-sm);
  color: var(--cmc-text);
  font-size: var(--cmc-size-body);
  border-radius: 4px;
  cursor: pointer;
  outline: none;
}
.cmc-dropdown__item[data-highlighted] { background: var(--cmc-surface-2, rgba(255,255,255,0.04)); }
```

These styles are consumed by `DensityToggle.tsx` in plan 02 and any future row-action DropdownMenu.

DO NOT migrate the existing `--space-*` / `--size-*` token usage in any rule (e.g., `.cmc-card { padding: var(--space-lg) }` line 222) to the new `--cmc-*` names in this plan. Per-route adoption is Phase 26/27 work; mid-phase rule migration breaks the v1.2 baseline before plan 04 ships the visual checkpoint. The new `--cmc-*` tokens coexist with the existing `--space-*` tokens.
  </action>
  <verify>
    <automated>cd frontend && pnpm vitest run --reporter=dot && grep -E '^\s*--cmc-space-md:\s*16px' src/styles.css | grep -v '^\s*#' | head -1 && grep -c '\[data-density="compact"\]' src/styles.css && grep -c '\[data-density="cozy"\]' src/styles.css && grep -c 'var(--cmc-z-tooltip)' src/styles.css && grep -c 'var(--cmc-z-sheet)' src/styles.css && grep -c 'var(--cmc-z-cmdk)' src/styles.css && grep -c 'var(--cmc-z-dialog)' src/styles.css && ! grep -E '^\s*\.cmc-btn:hover' -A 5 src/styles.css | grep -E 'transform:\s*translateY' && grep -E '\.cmc-card\s*{' -A 30 src/styles.css | grep -q 'min-width: 0' && grep -q 'cmc-density-toggle' src/styles.css && grep -q 'cmc-dropdown__item' src/styles.css</automated>
  </verify>
  <done>`styles.css` contains: `:root` density token block; `[data-density="compact"]` + `[data-density="cozy"]` overrides; `--cmc-z-*` ladder on `:root`; six z-index integers replaced with vars; `min-width: 0` on `.cmc-card`; `.cmc-btn:hover` no longer uses `transform: translateY`; `.cmc-density-toggle` + `.cmc-dropdown` + `.cmc-dropdown__item` rules present. `pnpm vitest run` passes (existing 326 tests still green vs Phase 18 baseline). `tsc --noEmit` clean (no styles.css impact, regression check).</done>
</task>

</tasks>

<verification>
After both tasks complete, run from repo root:

```bash
# Frontend type-check + unit tests must stay green vs Phase 18 baseline (326 vitest)
cd frontend && pnpm tsc --noEmit
cd frontend && pnpm vitest run --reporter=dot

# Sanity-check manually in dev — open localhost:5173, hover any .cmc-btn, confirm no flicker.
# Open DevTools, run:
#   document.documentElement.dataset.density = 'compact'
#   getComputedStyle(document.documentElement).getPropertyValue('--cmc-padding-card')  // should be "16px"
#   document.documentElement.dataset.density = 'cozy'
#   getComputedStyle(document.documentElement).getPropertyValue('--cmc-padding-card')  // should be "32px"
#   document.documentElement.dataset.density = ''  // back to Comfortable; should be "24px"

# Verify deps installed and pnpm-lock has 4 new entries.
cd frontend && pnpm list @radix-ui/react-popover @radix-ui/react-dropdown-menu @lhci/cli @axe-core/playwright
```

The runtime cascade test (DensityProvider → Sheet → padding) is plan 02. This plan validates: tokens exist, lib exports the expected API, deps are installed, transform-trap removed.
</verification>

<success_criteria>
1. 4 locked deps installed — `pnpm list` confirms `@radix-ui/react-popover@1.1.15`, `@radix-ui/react-dropdown-menu@2.1.16`, `@lhci/cli@0.15.x`, `@axe-core/playwright@4.11.x`.
2. `frontend/src/lib/density.ts` exports the exact 5 symbols (Density, DEFAULT_DENSITY, getDensity, setDensity, applyDensity).
3. `frontend/src/main.tsx` calls `applyDensity()` BEFORE `applyTheme()`.
4. `frontend/src/styles.css` `:root` declaration contains all 23 density tokens (Comfortable values) + all 11 z-index ladder vars.
5. `[data-density="compact"]` and `[data-density="cozy"]` selector blocks present with correct override values.
6. The 6 raw integer z-indexes (`50`, `40`, `41`, `50`, `45`, `46`) are replaced with `var(--cmc-z-*)` references.
7. `.cmc-card` declaration contains `min-width: 0`.
8. `.cmc-btn:hover` rule contains NO `transform: translateY` and DOES contain `top: -2px` (or equivalent non-transform vertical lift).
9. `.cmc-density-toggle` + `.cmc-dropdown` + `.cmc-dropdown__item` CSS rules exist.
10. `pnpm vitest run` reports 326 passing tests (Phase 18 baseline preserved).
11. `pnpm tsc --noEmit` exits 0.
</success_criteria>

<output>
After completion, create `.planning/phases/24-shell-density-containment-primitives/24-01-SUMMARY.md` per the standard SUMMARY template, recording:
- Final pnpm-lock.yaml dep versions
- Token block line ranges in styles.css
- Z-index ladder integer values (for cross-reference by plan 06's z-index-ladder.md)
- Any deviations from research's proposed numbers (and why)
</output>
