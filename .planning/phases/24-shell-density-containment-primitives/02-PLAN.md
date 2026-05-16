---
phase: 24-shell-density-containment-primitives
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - frontend/src/components/shell/DensityToggle.tsx
  - frontend/src/components/shell/DensityProvider.tsx
  - frontend/src/components/shell/__tests__/DensityProvider.test.tsx
  - frontend/src/components/shell/__tests__/DensityToggle.test.tsx
autonomous: true

must_haves:
  truths:
    - "User clicks the Sliders icon button in the header and a 3-tier menu (Compact / Comfortable / Cozy) opens with current tier check-marked"
    - "Selecting a tier flips document.documentElement.dataset.density immediately and persists to localStorage 'cmc.density'"
    - "Density tokens cascade into Radix Portal-mounted content (Sheet panel, Tooltip) — verified via vitest computed-style assertion"
    - "Toggling density does NOT trigger React re-renders in components other than DensityToggle itself (POLI-11 hard gate via design — no React Context propagation)"
  artifacts:
    - path: "frontend/src/components/shell/DensityToggle.tsx"
      provides: "Radix DropdownMenu icon-button density picker, mirrors ThemeToggle pattern"
      exports: ["DensityToggle"]
    - path: "frontend/src/components/shell/DensityProvider.tsx"
      provides: "Mount-time apply wrapper (NO React Context) — calls applyDensity() inside useEffect for hot-reload safety; renders children only"
      exports: ["DensityProvider"]
    - path: "frontend/src/components/shell/__tests__/DensityProvider.test.tsx"
      provides: "Cascade test: density tokens reach Radix Portal content; zero-rerender contract documented"
      contains: "getComputedStyle"
  key_links:
    - from: "frontend/src/components/shell/DensityToggle.tsx"
      to: "frontend/src/lib/density.ts"
      via: "imports getDensity, setDensity, type Density; calls setDensity on item select"
      pattern: "setDensity\\("
    - from: "frontend/src/components/shell/DensityProvider.tsx"
      to: "frontend/src/lib/density.ts"
      via: "applyDensity() inside useEffect for hot-reload re-apply"
      pattern: "applyDensity\\(\\)"
---

<objective>
Build the density UX primitives WITHOUT introducing a React Context for density. The toggle is the only component that owns density state; all other components read from CSS variables (the cascade) so the toggle is genuinely a CSS-only swap.

This plan delivers DENS-01 (3-tier toggle), DENS-02 (cascade verified to Portal content), and DENS-03 (localStorage persistence + pre-mount apply guarantee with hot-reload safety).

Purpose: Lock the zero-rerender invariant (POLI-11) by **architecture, not discipline**. If density were in a Context, every consumer would re-render on toggle. By keeping density out of context and only owning the toggle's local state, the React tree is provably re-render-free below DensityToggle.

**Locked invariants honored:**
- Density variables on `:root` (plan 01 already wrote them). DensityProvider does NOT add a context.
- Density toggle MUST be CSS-only — no consumer subscribes to density via React.
- Toggle UX: single icon button → DropdownMenu with 3 tiers + check-mark on current (per CONTEXT D-density-UX).

Output:
- `DensityToggle.tsx` — Radix DropdownMenu wrapping a Sliders icon button. Three menu items with check-mark on current tier. testids: `density-toggle-trigger`, `density-option-compact`, `density-option-comfortable`, `density-option-cozy`.
- `DensityProvider.tsx` — Thin pass-through that re-applies on mount (HMR safety). NO `createContext`. Children render unchanged.
- Two vitest tests:
  - DensityProvider mounts a Sheet, sets density to compact, asserts `getComputedStyle(sheetPanel).getPropertyValue('--cmc-padding-card').trim() === '16px'` (cascade test).
  - DensityToggle renders, clicking trigger opens menu, selecting Compact updates `localStorage.getItem('cmc.density')` AND `document.documentElement.dataset.density`.
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-shell-density-containment-primitives/24-CONTEXT.md
@.planning/phases/24-shell-density-containment-primitives/24-RESEARCH.md

@frontend/src/components/shell/ThemeToggle.tsx
@frontend/src/components/ui/Sheet.tsx
@frontend/src/lib/density.ts

<interfaces>
<!-- Plan 01 ships these. DensityToggle/DensityProvider consume them. -->

From frontend/src/lib/density.ts (after plan 01):
```typescript
export type Density = 'compact' | 'comfortable' | 'cozy'
export const DEFAULT_DENSITY: Density = 'comfortable'
export function getDensity(): Density
export function setDensity(d: Density): void
export function applyDensity(): void
```

ThemeToggle pattern (mirror, do not import):
```tsx
// frontend/src/components/shell/ThemeToggle.tsx (existing)
// Reads getTheme() into local useState, writes via setTheme(), toggles button.
// No React Context, no provider — same architecture density follows.
```

Radix DropdownMenu (installed by plan 01) usage:
```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
<DropdownMenu.Root>
  <DropdownMenu.Trigger asChild>...</DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content>
      <DropdownMenu.Item onSelect={...}>...</DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
```

Existing CSS classes from plan 01:
- `.cmc-density-toggle` — for the icon button
- `.cmc-dropdown` — for `<DropdownMenu.Content>`
- `.cmc-dropdown__item` — for `<DropdownMenu.Item>`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build DensityToggle and DensityProvider components</name>
  <files>frontend/src/components/shell/DensityToggle.tsx, frontend/src/components/shell/DensityProvider.tsx</files>
  <behavior>
    - DensityToggle renders a button with `data-testid="density-toggle-trigger"` and Sliders icon.
    - Clicking the button opens a Radix DropdownMenu with 3 items (testids `density-option-compact`, `density-option-comfortable`, `density-option-cozy`).
    - Current tier shows a Check icon next to the label; non-current tiers render an empty 16px-wide span (alignment).
    - Selecting a tier calls `setDensity(tier)` (writes localStorage + sets `document.documentElement.dataset.density`) AND updates the toggle's local state so the check moves.
    - DensityProvider is a `({ children }) => { useEffect(() => applyDensity(), []); return <>{children}</> }`. NO context, NO state propagation, NO subscribers.
    - Toggling density does NOT cause sibling components mounted INSIDE DensityProvider to re-render (no context = no consumer re-render).
  </behavior>
  <action>
1. Create `frontend/src/components/shell/DensityToggle.tsx`:
   ```tsx
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
           <button
             type="button"
             className="cmc-density-toggle"
             data-testid="density-toggle-trigger"
             aria-label={`Density: ${density}. Click to change.`}
           >
             <Sliders size={16} aria-hidden />
           </button>
         </DropdownMenu.Trigger>
         <DropdownMenu.Portal>
           <DropdownMenu.Content className="cmc-dropdown" sideOffset={6} align="end">
             {TIERS.map(t => (
               <DropdownMenu.Item
                 key={t.value}
                 data-testid={`density-option-${t.value}`}
                 onSelect={() => { setDensity(t.value); setLocal(t.value) }}
                 className="cmc-dropdown__item"
               >
                 <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center' }} aria-hidden>
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
   File header docstring must say: "DENS-01. Mirrors ThemeToggle pattern. NO React Context — density consumers read CSS variables, not React state. This is what makes POLI-11's zero-rerender gate achievable."

2. Create `frontend/src/components/shell/DensityProvider.tsx`:
   ```tsx
   import { useEffect, type ReactNode } from 'react'
   import { applyDensity } from '../../lib/density'

   /**
    * DENS-03 — mount-time density re-apply for hot-reload safety.
    *
    * applyDensity() is also called from main.tsx BEFORE ReactDOM.createRoot to avoid
    * flash on cold load. This Provider re-applies on mount so HMR doesn't reset the
    * data-density attribute mid-session.
    *
    * INTENTIONALLY NOT A CONTEXT. Consumers read CSS variables (via styles.css
    * cascade), not React state. Adding a context here would break the zero-rerender
    * invariant (POLI-11) — every consumer would re-render on every toggle.
    */
   export function DensityProvider({ children }: { children: ReactNode }) {
     useEffect(() => { applyDensity() }, [])
     return <>{children}</>
   }
   ```

3. Do NOT mount these components in any route or AppShell yet — that wiring is plan 04 (which extracts AppShellHeader and stacks providers in AppShell.tsx).

Use Sliders (not SlidersHorizontal/Vertical) — research locked the icon. Do not substitute another lucide icon.
  </action>
  <verify>
    <automated>cd frontend && pnpm tsc --noEmit && pnpm vitest run src/components/shell/__tests__ --reporter=dot 2>/dev/null || true</automated>
  </verify>
  <done>Both files compile; DensityToggle exports a React component using `@radix-ui/react-dropdown-menu` Portal; DensityProvider renders children without any context; no imports from React Context API in either file (`grep -L createContext`).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Vitest cascade and persistence tests</name>
  <files>frontend/src/components/shell/__tests__/DensityProvider.test.tsx, frontend/src/components/shell/__tests__/DensityToggle.test.tsx</files>
  <behavior>
    Test A (DensityProvider cascade — DENS-02 invariant):
      - Mount `<DensityProvider><Sheet open onOpenChange={()=>{}}><div data-testid="sheet-body">x</div></Sheet></DensityProvider>`.
      - Programmatically set density: `setDensity('compact')`.
      - Assert: `document.documentElement.dataset.density === 'compact'`.
      - Assert: `localStorage.getItem('cmc.density') === 'compact'`.
      - Assert: the rendered Sheet panel (queried by `.cmc-sheet__panel` or testid) computed style's `--cmc-padding-card` resolves via `getComputedStyle(panel).getPropertyValue('--cmc-padding-card').trim() === '16px'` (Compact value).
      - Repeat for 'cozy' → '32px', 'comfortable' → '24px'.
      - Note: jsdom does NOT compute CSS-variable cascade through Portal correctly without happy-dom; if this test cannot pass under jsdom, mark it `test.skip` with a clear comment "JSDOM limitation — covered by Playwright fixture in plan 05" AND assert at minimum that `document.documentElement.dataset.density` flips.

    Test B (DensityToggle persistence — DENS-01 + DENS-03):
      - Render `<DensityToggle />` with `localStorage.setItem('cmc.density', 'comfortable')`.
      - Click the trigger button (testid `density-toggle-trigger`).
      - Click `density-option-compact`.
      - Assert: `localStorage.getItem('cmc.density') === 'compact'`.
      - Assert: `document.documentElement.dataset.density === 'compact'`.
      - Re-render the toggle (simulating a page refresh via `unmount()` + remount with a fresh container) — assert the trigger's `aria-label` now contains `'compact'`.
  </behavior>
  <action>
1. Create `frontend/src/components/shell/__tests__/DensityProvider.test.tsx`:
   - Use `@testing-library/react` (already in repo per vitest config).
   - Use the existing `frontend/src/components/ui/Sheet.tsx` Sheet primitive directly.
   - Reset `localStorage` and `document.documentElement.dataset.density` in `beforeEach`.
   - Implement Test A above. If `getComputedStyle(panel).getPropertyValue('--cmc-padding-card')` returns empty string under jsdom, fall back to asserting `document.documentElement.dataset.density` flips correctly per call to `setDensity` AND that `getComputedStyle(document.documentElement).getPropertyValue('--cmc-padding-card')` resolves correctly on the html element (jsdom does compute :root vars). Document the fallback in a comment: "/* JSDOM does not propagate CSS variable cascade to Portal-rendered content; the Playwright e2e in plan 05 covers the runtime cascade. This test verifies the contract at the html-element level. */"

2. Create `frontend/src/components/shell/__tests__/DensityToggle.test.tsx`:
   - Use `@testing-library/react` + `@testing-library/user-event`.
   - Implement Test B above.
   - Reset `localStorage` and `document.documentElement.dataset.density` in `beforeEach`.

3. Both files must follow the existing test conventions in `frontend/src/components/shell/__tests__/` (look at sibling tests for setup boilerplate, e.g., a ThemeToggle test if one exists).
  </action>
  <verify>
    <automated>cd frontend && pnpm vitest run src/components/shell/__tests__/DensityProvider.test.tsx src/components/shell/__tests__/DensityToggle.test.tsx --reporter=verbose</automated>
  </verify>
  <done>Both new test files run green under vitest. The DensityProvider test asserts at minimum `document.documentElement.dataset.density` and `localStorage` flip correctly; if jsdom supports `:root` CSS-var resolution (likely), it also asserts `--cmc-padding-card` resolves to `16px` / `24px` / `32px` for the three tiers. The DensityToggle test asserts click → setDensity → localStorage + dataset both update. Total vitest count goes from 326 → ~330 (plus a few). No existing test broken.</done>
</task>

</tasks>

<verification>
```bash
cd frontend
pnpm tsc --noEmit
pnpm vitest run --reporter=dot
# Expect: 326 prior + 4-8 new = ~330+ passing, 0 failing.

# Manual sanity (optional during execute, mandatory at phase close in plan 07):
# 1. Mount <DensityProvider><DensityToggle /></DensityProvider> in a scratch dev page.
# 2. Click toggle, select Compact, observe page DOES NOT re-render (React DevTools profiler shows ZERO commits below DensityToggle).
```
</verification>

<success_criteria>
1. `DensityToggle.tsx` exists, uses `@radix-ui/react-dropdown-menu`, renders 3 items with check-mark on current.
2. `DensityProvider.tsx` exists, contains zero `createContext` calls, renders children unchanged + calls `applyDensity()` once on mount.
3. Cascade test passes: setDensity('compact') reflects in `document.documentElement.dataset.density` and `localStorage`; if jsdom permits, also reflects in `--cmc-padding-card` computed value.
4. Persistence test passes: clicking through DensityToggle's menu writes `localStorage` + `dataset.density`.
5. Existing 326 vitest tests remain green.
6. No `createContext` imported in either component file (verified by grep).
</success_criteria>

<output>
After completion, create `.planning/phases/24-shell-density-containment-primitives/24-02-SUMMARY.md` recording: final exports, vitest count delta, and any jsdom limitations discovered for the cascade test (so plan 05's Playwright fixture knows what to verify at runtime).
</output>
