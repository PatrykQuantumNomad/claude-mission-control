---
phase: 24-shell-density-containment-primitives
plan: 04
type: execute
wave: 3
depends_on: [01, 02, 03]
files_modified:
  - frontend/src/components/shell/AppShell.tsx
  - frontend/src/components/shell/AppShellHeader.tsx
  - frontend/src/components/shell/Sidebar.tsx
  - frontend/src/components/shell/SidebarSection.tsx
  - frontend/src/components/shell/SidebarNavLink.tsx
  - frontend/src/components/shell/EmergencyStopBanner.tsx
  - frontend/src/components/shell/NavBar.tsx
  - frontend/src/lib/sidebar.ts
  - frontend/src/main.tsx
  - frontend/src/styles.css
  - frontend/src/components/shell/__tests__/Sidebar.test.tsx
  - frontend/src/components/shell/__tests__/AppShellHeader.test.tsx
autonomous: false

must_haves:
  truths:
    - "Left sidebar renders with sections Observe, Operate, Configure (Configure header empty); Home is top-level above sections"
    - "Active route in sidebar shows a 3-4px solid accent left-edge bar plus tinted background; bar persists when sidebar is collapsed"
    - "Cmd+B (or Ctrl+B) toggles sidebar between 240px expanded and 52px icon-only collapsed; choice persists in localStorage 'cmc.sidebar.collapsed' across reloads"
    - "When collapsed, hovering an icon shows a Radix Tooltip with the route label; section dividers visually compress"
    - "AppShellHeader (right-side action area) hosts in order: EmergencyStopBanner, Cmd+K trigger, time-picker placeholder (display:none), save-view placeholder (display:none), DensityToggle, ThemeToggle"
    - "NavBar.tsx is deleted; AppShell.tsx layout flips from flex-direction: column to flex-direction: row (sidebar | header+main column)"
    - "DensityProvider wraps the AppShell content tree; applyDensity() is called pre-mount in main.tsx and again on Provider mount for HMR safety"
  artifacts:
    - path: "frontend/src/components/shell/Sidebar.tsx"
      provides: "Persistent collapsible left sidebar (SHEL-01, SHEL-04)"
      exports: ["Sidebar"]
    - path: "frontend/src/components/shell/SidebarSection.tsx"
      provides: "Section header + nav link group (Observe / Operate / Configure)"
      exports: ["SidebarSection"]
    - path: "frontend/src/components/shell/SidebarNavLink.tsx"
      provides: "Single nav row; wraps in Tooltip when collapsed (SHEL-03 active-route highlight)"
      exports: ["SidebarNavLink"]
    - path: "frontend/src/components/shell/AppShellHeader.tsx"
      provides: "Top bar extracted from NavBar (SHEL-02). Hosts Cmd+K trigger, EmergencyStopBanner, ThemeToggle, DensityToggle, placeholder testids for time-picker and save-view."
      exports: ["AppShellHeader"]
    - path: "frontend/src/lib/sidebar.ts"
      provides: "Sidebar collapsed-state localStorage + applyOnBoot (mirrors lib/density.ts pattern)"
      exports: ["isSidebarCollapsed", "setSidebarCollapsed", "applySidebar"]
    - path: "frontend/src/components/shell/AppShell.tsx"
      provides: "Updated shell mounting Sidebar + AppShellHeader + DensityProvider; flex-direction: row"
      contains: "DensityProvider"
    - path: "frontend/src/components/shell/NavBar.tsx"
      provides: "DELETED — research-recommended Phase 24 deletion (no rollback dead-code carry)"
      contains: ""
  key_links:
    - from: "frontend/src/components/shell/AppShell.tsx"
      to: "frontend/src/components/shell/Sidebar.tsx + AppShellHeader.tsx + DensityProvider.tsx"
      via: "imports + mount in JSX root"
      pattern: "import.*Sidebar.*AppShellHeader.*DensityProvider"
    - from: "frontend/src/components/shell/SidebarNavLink.tsx"
      to: "frontend/src/components/ui/Tooltip.tsx"
      via: "wraps Link in Tooltip when collapsed"
      pattern: "Tooltip.*content=\\{label\\}"
    - from: "frontend/src/components/shell/AppShellHeader.tsx"
      to: "frontend/src/components/shell/DensityToggle.tsx (plan 02)"
      via: "imports + mounts DensityToggle in right-side action area"
      pattern: "DensityToggle"
    - from: "frontend/src/main.tsx"
      to: "frontend/src/lib/sidebar.ts"
      via: "applySidebar() called alongside applyDensity() and applyTheme() before createRoot"
      pattern: "applySidebar\\(\\)"
---

<objective>
Replace the existing top NavBar with a left vertical Sidebar + extracted AppShellHeader. Stack DensityProvider into the React tree so density tokens cascade. Wire Cmd+B keyboard toggle. Delete NavBar.tsx (research-recommended; rollback via `git revert`, not dead code).

This is the **single biggest visual change of Phase 24**. Every VISUAL-CHECK PNG (plan 05/07) shows the difference. Every route's content is now bounded between `flex: 1` columns, but the page-level `.cmc-page--bounded` modifier from plan 03 is NOT applied to any route in this plan — adoption is Phase 26/27.

This plan delivers SHEL-01 (Sidebar with sections), SHEL-02 (AppShellHeader extraction), SHEL-03 (active-route accent bar), SHEL-04 (Cmd+B + persisted collapse).

Sidebar IA (locked in CONTEXT):
- Top-level (above sections): `/` (Mission Control / Home, Lucide icon `Home`)
- **Observe:** `/activity` (icon `Activity`), `/sessions/compare` (icon `GitCompare`), `/skills` (icon `Sparkles`), `/cost` (icon `DollarSign`)
- **Operate:** `/alerts` (icon `Bell`)
- **Configure:** (header rendered, empty body — reserved for future Settings/Doctor)

Active-route treatment (SHEL-03):
- 3px solid `--cmc-accent-blue` border-left on the nav row.
- Tinted background `rgba(77, 124, 255, 0.10)`.
- Brighter text color (`var(--cmc-text)` vs default `var(--cmc-text-dim)`).
- Bar visible in BOTH expanded AND collapsed modes (research §"Active-route visual treatment").

Collapsed mode (SHEL-04):
- Sidebar width 240px → 52px (Linear/Notion convention; 52 = 2*16 padding + 20 icon-size at Comfortable).
- Section headers `display: none`; section dividers (1px top border between sections) appear only in collapsed mode.
- Nav labels `display: none`; icon centers via `justify-content: center`.
- Hover any icon → Radix Tooltip side=`right` shows the route label.
- Toggle: `Cmd+B` (Mac) / `Ctrl+B` (Win/Linux) global keydown listener; ALSO accessible via a chrome control button at the top-left of the sidebar (testid `sidebar-collapse-toggle`, mirrors VS Code's chrome handle).

AppShellHeader extraction (SHEL-02):
- Brand `Mission Control` moves to the TOP of the sidebar (left-edge brand position).
- Header retains the right-side action area only:
  1. `EmergencyStopBanner` (leftmost — high-priority)
  2. `<button data-testid="time-picker-trigger" disabled aria-label="Time range (Phase 26)" style={{ display: 'none' }}>` placeholder
  3. `<button data-testid="save-view-button" disabled aria-label="Save view (Phase 25)" style={{ display: 'none' }}>` placeholder
  4. Cmd+K trigger button (existing)
  5. `<DensityToggle />` (plan 02)
  6. `<ThemeToggle />` (existing)
- The disabled-and-hidden placeholders pre-register their testids in `docs/testid-registry.md` (plan 06) so Phases 25/26 don't need to register them later.

**Locked invariants honored:**
- `Cmd+B` keyboard shortcut (no `Cmd+\\` or `Cmd+Shift+S`).
- Existing `frontend/src/components/ui/Tooltip.tsx` is reused for sidebar tooltips — NO new tooltip dep.
- Density tokens cascade via `:root`; DensityProvider mount (plan 02) does not introduce a context.
- Mobile / narrow viewport: NOT handled in v1.3 (locked in research §"Mobile / narrow viewport behavior"). At <768px viewport, sidebar overflows; that's accepted.

Output:
- Five new shell components (Sidebar, SidebarSection, SidebarNavLink, AppShellHeader, EmergencyStopBanner is moved into header).
- `lib/sidebar.ts` (collapsed-state).
- `main.tsx` calls `applySidebar()` alongside `applyDensity()` and `applyTheme()`.
- `AppShell.tsx` rewritten: flex-direction row; Sidebar + (AppShellHeader + main) column; DensityProvider stacks alongside ActiveSessionProvider + TaskComposerProvider.
- `NavBar.tsx` deleted.
- `styles.css` augmented with `.cmc-sidebar`, `.cmc-sidebar__*`, `.cmc-shell` flex-direction switch, `.cmc-shell__column`, `.cmc-app-shell-header` rules.
- 2 vitest tests (Sidebar collapse + active-route, AppShellHeader composition).
- 1 visual checkpoint at end (collapse + density combo verified in browser).
</objective>

<execution_context>
@/Users/patrykattc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/patrykattc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/24-shell-density-containment-primitives/24-CONTEXT.md
@.planning/phases/24-shell-density-containment-primitives/24-RESEARCH.md
@.planning/phases/24-shell-density-containment-primitives/24-01-SUMMARY.md
@.planning/phases/24-shell-density-containment-primitives/24-02-SUMMARY.md

@frontend/src/components/shell/NavBar.tsx
@frontend/src/components/shell/AppShell.tsx
@frontend/src/components/shell/ThemeToggle.tsx
@frontend/src/components/shell/EmergencyStopBanner.tsx
@frontend/src/components/shell/ActiveSessionContext.tsx
@frontend/src/components/ui/Tooltip.tsx
@frontend/src/lib/sidebar.ts
@frontend/src/lib/density.ts
@frontend/src/lib/theme.ts
@frontend/src/main.tsx

<interfaces>
Plan 02 ships these (already in tree by the time this plan runs):
- `frontend/src/components/shell/DensityToggle.tsx` exports `DensityToggle` — Radix DropdownMenu icon-button. Mount in AppShellHeader.
- `frontend/src/components/shell/DensityProvider.tsx` exports `DensityProvider({ children })` — applies density on mount. Wrap AppShell content tree.

Plan 01 ships these CSS landmarks (already in styles.css):
- `--cmc-z-sidebar: 20`, `--cmc-z-header: 20`, `--cmc-z-tooltip: 30`, `--cmc-z-banner: 100`
- All density spacing/control-height/icon-size tokens consumed by sidebar CSS.

Existing AppShell.tsx structure (BEFORE this plan):
```tsx
export function AppShell({ children }: AppShellProps) {
  return (
    <ActiveSessionProvider>
      <TaskComposerProvider>
        <div className="cmc-shell">
          <NavBar />
          <main className="cmc-main">{children}</main>
          <CommandPalette />
        </div>
      </TaskComposerProvider>
    </ActiveSessionProvider>
  )
}
```

Existing NavBar.tsx (lines 14-46) renders: brand `Mission Control`, links to all routes (REPLACED by Sidebar), `EmergencyStopBanner`, Cmd+K trigger button, ThemeToggle.

Existing TanStack Router `Link` usage (verified in NavBar.tsx):
```tsx
import { Link } from '@tanstack/react-router'
<Link to="/path" activeProps={{ className: 'active' }} activeOptions={{ exact: false }}>label</Link>
```

For exact matching on `/`, use `activeOptions={{ exact: true }}`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build lib/sidebar.ts + Sidebar primitives + DensityToggle wired AppShellHeader</name>
  <files>frontend/src/lib/sidebar.ts, frontend/src/components/shell/Sidebar.tsx, frontend/src/components/shell/SidebarSection.tsx, frontend/src/components/shell/SidebarNavLink.tsx, frontend/src/components/shell/AppShellHeader.tsx</files>
  <action>
1. Create `frontend/src/lib/sidebar.ts` (mirror of `lib/density.ts` pattern):
   ```ts
   export const SIDEBAR_KEY = 'cmc.sidebar.collapsed'

   export function isSidebarCollapsed(): boolean {
     if (typeof window === 'undefined') return false
     return window.localStorage.getItem(SIDEBAR_KEY) === 'true'
   }
   export function setSidebarCollapsed(collapsed: boolean): void {
     if (typeof window === 'undefined') return
     window.localStorage.setItem(SIDEBAR_KEY, collapsed ? 'true' : 'false')
     if (typeof document !== 'undefined') {
       document.documentElement.dataset.sidebarCollapsed = collapsed ? 'true' : 'false'
     }
   }
   export function applySidebar(): void {
     if (typeof document === 'undefined') return
     document.documentElement.dataset.sidebarCollapsed = isSidebarCollapsed() ? 'true' : 'false'
   }
   ```
   Header docstring: "SHEL-04 — sidebar collapsed-state persistence. Mirrors lib/theme.ts and lib/density.ts. Pre-mount apply in main.tsx avoids flash. Per CONTEXT, Cmd+B is the only keyboard toggle."

2. Create `frontend/src/components/shell/SidebarNavLink.tsx`:
   ```tsx
   import { Link } from '@tanstack/react-router'
   import type { ComponentType } from 'react'
   import { Tooltip } from '../ui/Tooltip'

   interface Props {
     to: string
     label: string
     Icon: ComponentType<{ size?: number | string; className?: string; 'aria-hidden'?: boolean }>
     collapsed: boolean
     exact?: boolean
   }

   export function SidebarNavLink({ to, label, Icon, collapsed, exact }: Props) {
     const slug = to.replace(/^\//, '').replace(/\W/g, '-') || 'home'
     const link = (
       <Link
         to={to}
         className="cmc-sidebar__navlink"
         activeProps={{ className: 'cmc-sidebar__navlink cmc-sidebar__navlink--active' }}
         activeOptions={{ exact: exact ?? to === '/' }}
         data-testid={`sidebar-link-${slug}`}
       >
         <Icon className="cmc-sidebar__navlink-icon" aria-hidden />
         <span className="cmc-sidebar__navlink-label">{label}</span>
       </Link>
     )
     return collapsed ? <Tooltip content={label} side="right">{link}</Tooltip> : link
   }
   ```
   Note `Tooltip side="right"` is research-locked — the label appears outside the sidebar boundary toward main content.

3. Create `frontend/src/components/shell/SidebarSection.tsx`:
   ```tsx
   import type { ReactNode } from 'react'

   interface Props {
     title: string  // Observe / Operate / Configure
     children: ReactNode
   }
   export function SidebarSection({ title, children }: Props) {
     return (
       <div className="cmc-sidebar__section">
         <div className="cmc-sidebar__section-header">{title}</div>
         {children}
       </div>
     )
   }
   ```

4. Create `frontend/src/components/shell/Sidebar.tsx`:
   ```tsx
   import { useEffect, useState } from 'react'
   import { Home, Activity, GitCompare, Sparkles, DollarSign, Bell, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
   import { isSidebarCollapsed, setSidebarCollapsed } from '../../lib/sidebar'
   import { SidebarSection } from './SidebarSection'
   import { SidebarNavLink } from './SidebarNavLink'

   export function Sidebar() {
     const [collapsed, setCollapsed] = useState<boolean>(false)
     useEffect(() => { setCollapsed(isSidebarCollapsed()) }, [])

     // Cmd+B / Ctrl+B keyboard toggle (window-level so it captures inside inputs).
     useEffect(() => {
       function onKey(e: KeyboardEvent) {
         if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
           e.preventDefault()
           const next = !collapsed
           setCollapsed(next)
           setSidebarCollapsed(next)
         }
       }
       window.addEventListener('keydown', onKey)
       return () => window.removeEventListener('keydown', onKey)
     }, [collapsed])

     function toggle() {
       const next = !collapsed
       setCollapsed(next)
       setSidebarCollapsed(next)
     }

     const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose
     return (
       <aside className="cmc-sidebar" aria-label="Primary navigation">
         <div className="cmc-sidebar__header">
           <span className="cmc-brand cmc-sidebar__brand">Mission Control</span>
           <button
             type="button"
             className="cmc-sidebar__collapse-toggle"
             data-testid="sidebar-collapse-toggle"
             onClick={toggle}
             aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
             aria-expanded={!collapsed}
           >
             <ToggleIcon size={16} aria-hidden />
           </button>
         </div>

         {/* Top-level Home */}
         <SidebarNavLink to="/" label="Home" Icon={Home} collapsed={collapsed} exact />

         <SidebarSection title="Observe">
           <SidebarNavLink to="/activity" label="Activity" Icon={Activity} collapsed={collapsed} />
           <SidebarNavLink to="/sessions/compare" label="Sessions Compare" Icon={GitCompare} collapsed={collapsed} />
           <SidebarNavLink to="/skills" label="Skills" Icon={Sparkles} collapsed={collapsed} />
           <SidebarNavLink to="/cost" label="Cost" Icon={DollarSign} collapsed={collapsed} />
         </SidebarSection>

         <SidebarSection title="Operate">
           <SidebarNavLink to="/alerts" label="Alerts" Icon={Bell} collapsed={collapsed} />
         </SidebarSection>

         {/* Configure section reserved — header rendered, empty body. */}
         <SidebarSection title="Configure" />
       </aside>
     )
   }
   ```
   Verify each lucide icon name exists (`Home`, `Activity`, `GitCompare`, `Sparkles`, `DollarSign`, `Bell`, `PanelLeftClose`, `PanelLeftOpen`) — they are all standard. If any rename is needed, substitute and document in SUMMARY.

   IMPORTANT — research §"Cmd+B keyboard handling" pitfall: do NOT scope the keydown listener to a specific element. Window-level capture is required so Cmd+B works even when focus is inside a Radix Sheet, a `<textarea>`, or the Cmd+K palette. The `e.preventDefault()` blocks the macOS bold shortcut from inserting a marker.

5. Create `frontend/src/components/shell/AppShellHeader.tsx`:
   ```tsx
   import { EmergencyStopBanner } from './EmergencyStopBanner'
   import { ThemeToggle } from './ThemeToggle'
   import { DensityToggle } from './DensityToggle'

   /**
    * SHEL-02 — top bar action area extracted from NavBar.
    * Brand moved to Sidebar; header keeps right-side action area only.
    * Order (left to right): EmergencyStopBanner, time-picker placeholder (Phase 26),
    * save-view placeholder (Phase 25), Cmd+K trigger, DensityToggle, ThemeToggle.
    *
    * Placeholders carry data-testid + display:none so docs/testid-registry.md can
    * pre-register them; Phases 25/26 wire them by removing display:none.
    */
   export function AppShellHeader({ onCommandPaletteOpen }: { onCommandPaletteOpen?: () => void }) {
     return (
       <header className="cmc-app-shell-header" role="banner">
         <div className="cmc-app-shell-header__left">
           <EmergencyStopBanner />
         </div>
         <div className="cmc-app-shell-header__right">
           {/* Phase 26 placeholder */}
           <button
             type="button"
             data-testid="time-picker-trigger"
             disabled
             aria-label="Time range (coming in Phase 26)"
             style={{ display: 'none' }}
           />
           {/* Phase 25 placeholder */}
           <button
             type="button"
             data-testid="save-view-button"
             disabled
             aria-label="Save view (coming in Phase 25)"
             style={{ display: 'none' }}
           />
           <button
             type="button"
             className="cmc-cmdk-trigger"
             onClick={onCommandPaletteOpen}
             aria-label="Open command palette (Cmd+K)"
             data-testid="cmdk-trigger"
           >
             Cmd+K
           </button>
           <DensityToggle />
           <ThemeToggle />
         </div>
       </header>
     )
   }
   ```
   The `onCommandPaletteOpen` prop is optional — if the existing CommandPalette uses a global keydown listener (verified by reading existing `CommandPalette.tsx` per AppShell.tsx imports), the trigger button can simply dispatch a synthetic Cmd+K event OR call into a context. **Read the existing implementation to determine the correct wiring.** If unsure, dispatch a `KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })` to `window` from `onClick` as a last resort.
  </action>
  <verify>
    <automated>cd frontend && pnpm tsc --noEmit && grep -q "applySidebar" src/lib/sidebar.ts && grep -q "Cmd.B\|metaKey.*ctrlKey" src/components/shell/Sidebar.tsx && grep -q "side=\"right\"" src/components/shell/SidebarNavLink.tsx && grep -q "DensityToggle" src/components/shell/AppShellHeader.tsx && grep -q "data-testid=\"time-picker-trigger\"" src/components/shell/AppShellHeader.tsx && grep -q "data-testid=\"save-view-button\"" src/components/shell/AppShellHeader.tsx && grep -q "data-testid=\"sidebar-collapse-toggle\"" src/components/shell/Sidebar.tsx</automated>
  </verify>
  <done>5 files compile; Sidebar contains a window-level Cmd+B/Ctrl+B keydown listener calling preventDefault; SidebarNavLink wraps Link in Tooltip with side="right" when collapsed; AppShellHeader contains DensityToggle + 2 placeholder buttons with display:none; lib/sidebar.ts exports the 3 expected functions.</done>
</task>

<task type="auto">
  <name>Task 2: Append Sidebar+Shell CSS, rewrite AppShell.tsx, wire main.tsx, delete NavBar.tsx</name>
  <files>frontend/src/styles.css, frontend/src/components/shell/AppShell.tsx, frontend/src/main.tsx, frontend/src/components/shell/NavBar.tsx</files>
  <action>
**Sub-task A — Append Sidebar + Shell CSS to styles.css.** Add at the bottom under a `/* Shell rework — Phase 24 (SHEL-01..04) */` comment header:

```css
/* Shell rework — Phase 24 (SHEL-01..04) */

.cmc-shell {
  display: flex;
  flex-direction: row;       /* WAS: column. Sidebar | (Header + Main) */
  min-height: 100%;
}
.cmc-shell__column {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;              /* horizontal twin of min-height: 0 ladder; prevents h-scrollbar on collapse */
  min-height: 0;
}
.cmc-main {
  flex: 1;
  padding: var(--cmc-space-lg);
  min-height: 0;
  overflow-y: auto;
}

/* AppShellHeader */
.cmc-app-shell-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cmc-space-sm);
  padding: var(--cmc-space-sm) var(--cmc-space-lg);
  border-bottom: 1px solid var(--cmc-border);
  background: var(--cmc-surface);
  z-index: var(--cmc-z-header);
  flex-shrink: 0;
}
.cmc-app-shell-header__left,
.cmc-app-shell-header__right {
  display: flex;
  align-items: center;
  gap: var(--cmc-space-sm);
}

/* Sidebar */
.cmc-sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--cmc-surface);
  border-right: 1px solid var(--cmc-border);
  transition: width 180ms ease-out;
  z-index: var(--cmc-z-sidebar);
}
[data-sidebar-collapsed="true"] .cmc-sidebar { width: 52px; }

.cmc-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cmc-space-sm);
  padding: var(--cmc-space-md);
  border-bottom: 1px solid var(--cmc-border);
}
[data-sidebar-collapsed="true"] .cmc-sidebar__brand { display: none; }
[data-sidebar-collapsed="true"] .cmc-sidebar__header { padding: var(--cmc-space-sm); justify-content: center; }

.cmc-sidebar__collapse-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--cmc-control-height-sm);
  height: var(--cmc-control-height-sm);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--cmc-text-dim);
  cursor: pointer;
}
.cmc-sidebar__collapse-toggle:hover {
  color: var(--cmc-text);
  border-color: var(--cmc-border);
}

.cmc-sidebar__section { display: flex; flex-direction: column; padding: var(--cmc-space-sm) 0; }
.cmc-sidebar__section-header {
  font-family: var(--font-mono, monospace);
  font-size: var(--cmc-size-label);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--cmc-text-subtle, var(--cmc-text-dim));
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
  border-left: 3px solid transparent;
}
.cmc-sidebar__navlink:hover {
  color: var(--cmc-text);
  background: var(--cmc-surface-2, rgba(255,255,255,0.04));
}
.cmc-sidebar__navlink--active {
  color: var(--cmc-text);
  background: rgba(77, 124, 255, 0.10);
  border-left-color: var(--cmc-accent-blue, #4d7cff);
}
.cmc-sidebar__navlink-icon {
  width: var(--cmc-icon-size-lg);
  height: var(--cmc-icon-size-lg);
  flex-shrink: 0;
}
[data-sidebar-collapsed="true"] .cmc-sidebar__navlink-label { display: none; }
[data-sidebar-collapsed="true"] .cmc-sidebar__navlink {
  justify-content: center;
  padding: 0;
}

/* Brand inside sidebar */
.cmc-sidebar__brand {
  font-weight: 600;
  font-size: var(--cmc-size-body);
  color: var(--cmc-text);
}
```

If `--cmc-accent-blue`, `--cmc-text-subtle`, or `--cmc-surface-2` tokens are not yet declared on `:root`, fall back to the inline default in the `var(...)` second argument as shown. Do NOT introduce new top-level color tokens in this plan — palette evolution is out of scope.

**Sub-task B — Rewrite `frontend/src/components/shell/AppShell.tsx`.** Replace the existing render with:

```tsx
import type { AppShellProps } from './AppShell'  // KEEP existing prop interface; only the render body changes
import { ActiveSessionProvider } from './ActiveSessionContext'
import { TaskComposerProvider } from '../tasks/TaskComposerProvider'  // adjust path to existing import
import { CommandPalette } from '../ui/CommandPalette'
import { Sidebar } from './Sidebar'
import { AppShellHeader } from './AppShellHeader'
import { DensityProvider } from './DensityProvider'

export function AppShell({ children }: AppShellProps) {
  return (
    <ActiveSessionProvider>
      <TaskComposerProvider>
        <DensityProvider>
          <div className="cmc-shell">
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

Read the existing AppShell.tsx FIRST to extract the actual import paths for `ActiveSessionProvider`, `TaskComposerProvider`, `CommandPalette` — paths above are illustrative; use the real ones. Preserve any other props or behavior the existing AppShell has (e.g., error boundaries, toaster mounts) by keeping them in place. The new structure adds Sidebar + AppShellHeader + DensityProvider; everything else MUST stay.

**Sub-task C — Update `frontend/src/main.tsx`.** Add `applySidebar()` call alongside the existing pre-mount applies:

```ts
import { applyDensity } from './lib/density'   // already added in plan 01
import { applyTheme } from './lib/theme'        // existing
import { applySidebar } from './lib/sidebar'    // NEW
// …
applyDensity()
applyTheme()
applySidebar()
ReactDOM.createRoot(...).render(...)
```

The order is: density first (cascades to theme rules), theme second, sidebar third (sidebar collapsed-state is independent of the others; order is cosmetic).

**Sub-task D — Delete `frontend/src/components/shell/NavBar.tsx`.** Per research §"NavBar deletion timing" and CONTEXT (research-recommended Phase 24 deletion). Use `rm frontend/src/components/shell/NavBar.tsx`. Search the codebase for any remaining `import.*NavBar` references and remove/replace them — there should be exactly one (in `AppShell.tsx`, which task 2B replaces). If `__tests__/NavBar.test.tsx` exists, delete it too. Do NOT keep NavBar.tsx as dead code; rollback is `git revert`, not commented-out files.

**Sub-task E — EmergencyStopBanner relocation.** EmergencyStopBanner currently mounts inside NavBar; AppShellHeader (task 1) already imports and renders it. Verify `EmergencyStopBanner.tsx` itself does not need any change — it's just being mounted in a new parent. If the banner's CSS makes layout assumptions about being inside a horizontal navbar (e.g., `flex: 1` self-stretch), adjust the EmergencyStopBanner's outer wrapper inline OR add an `.cmc-app-shell-header__left` override rule. Capture any CSS adjustment in a comment.
  </action>
  <verify>
    <automated>cd frontend && pnpm tsc --noEmit && grep -c 'flex-direction: row' src/styles.css | head -1 && grep -q 'cmc-sidebar__navlink--active' src/styles.css && grep -q 'cmc-app-shell-header' src/styles.css && grep -q 'DensityProvider' src/components/shell/AppShell.tsx && grep -q 'Sidebar' src/components/shell/AppShell.tsx && grep -q 'AppShellHeader' src/components/shell/AppShell.tsx && test ! -f src/components/shell/NavBar.tsx && grep -q 'applySidebar' src/main.tsx && grep -q 'applyDensity' src/main.tsx</automated>
  </verify>
  <done>styles.css contains the new shell ruleset; AppShell.tsx renders Sidebar + (AppShellHeader + main) within DensityProvider; main.tsx calls all three apply* functions before createRoot; NavBar.tsx deleted; tsc clean. Existing 326+ vitest tests still green (run `pnpm vitest run` to confirm — failures here would indicate a stale NavBar import elsewhere).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Sidebar + AppShellHeader vitest tests</name>
  <files>frontend/src/components/shell/__tests__/Sidebar.test.tsx, frontend/src/components/shell/__tests__/AppShellHeader.test.tsx</files>
  <behavior>
    Sidebar.test.tsx (SHEL-01, SHEL-03, SHEL-04):
    - Render Sidebar inside a TanStack Router test harness (use the existing test-router pattern from `frontend/src/components/shell/__tests__/` — read sibling tests for the harness).
    - Initial: collapsed=false (localStorage empty); sidebar has Home + Observe section + Operate section + Configure (empty) section.
    - Active route highlight: navigate test-router to `/activity`; assert the `/activity` link element has class `cmc-sidebar__navlink--active`.
    - Collapse toggle: click `data-testid="sidebar-collapse-toggle"`; assert `document.documentElement.dataset.sidebarCollapsed === 'true'` AND `localStorage.getItem('cmc.sidebar.collapsed') === 'true'`.
    - Cmd+B keyboard: dispatch `new KeyboardEvent('keydown', { key: 'b', metaKey: true })` on window; assert collapsed flips back to `false`.
    - Reload simulation: unmount + remount; assert sidebar respects `localStorage.getItem('cmc.sidebar.collapsed')` initial state.

    AppShellHeader.test.tsx (SHEL-02):
    - Render AppShellHeader.
    - Assert order of right-side action area children (DOM-order): EmergencyStopBanner left, then time-picker placeholder, save-view placeholder, Cmd+K trigger, DensityToggle, ThemeToggle.
    - Assert testids `time-picker-trigger`, `save-view-button` are present in DOM AND their parent has `style.display === 'none'`.
    - Assert `density-toggle-trigger` (from plan 02) is rendered AND clicking it opens the menu (smoke test that DensityToggle integrates cleanly into the header).
  </behavior>
  <action>
1. Read sibling tests in `frontend/src/components/shell/__tests__/` to understand the test-harness pattern (router setup, query-client mocks, etc.). Mirror that pattern.

2. Implement `Sidebar.test.tsx`:
   - `beforeEach`: clear `localStorage.removeItem('cmc.sidebar.collapsed')`; `delete document.documentElement.dataset.sidebarCollapsed`.
   - Test cases as listed in <behavior>.
   - For Cmd+B: use `fireEvent(window, new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }))`. The Sidebar's effect handler should `e.preventDefault()` then toggle.

3. Implement `AppShellHeader.test.tsx`:
   - `beforeEach`: clear localStorage to ensure DensityToggle starts at default.
   - Render `<AppShellHeader />` (with whatever provider stack the existing tests need).
   - Assert child order via `container.querySelector('.cmc-app-shell-header__right')?.children` indices.
   - Assert hidden placeholders: `getByTestId('time-picker-trigger')` returns an element whose `style.display === 'none'`. Same for `save-view-button`.

4. Both files target ~30-60 LOC each. If the test-router harness is heavy, abstract it to a `setupTestRouter(initialPath: string)` helper within the test file (don't share a util — keeps this plan self-contained).
  </action>
  <verify>
    <automated>cd frontend && pnpm vitest run src/components/shell/__tests__/Sidebar.test.tsx src/components/shell/__tests__/AppShellHeader.test.tsx --reporter=verbose</automated>
  </verify>
  <done>Both test files run green. Sidebar test exercises: collapse toggle, Cmd+B keyboard, persistence across re-mount, active-route class application. AppShellHeader test exercises: DOM child order, hidden placeholders, DensityToggle integration.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
The dashboard shell has been replaced. Sidebar + extracted AppShellHeader render in place of the old top NavBar. Cmd+B toggles the sidebar between expanded (240px) and collapsed (52px) modes, persisting across reloads. Density toggle is now visible in the header (right side). NavBar.tsx is deleted.
  </what-built>
  <how-to-verify>
1. Start the dev server: `cd frontend && pnpm dev`.
2. Open `http://localhost:5173` in a fresh browser window.
3. Confirm visually:
   - Left sidebar with brand "Mission Control" at the top, then Home (top-level), then sections **Observe** (Activity, Sessions Compare, Skills, Cost), **Operate** (Alerts), **Configure** (empty header).
   - Top right action area shows in order: (EmergencyStopBanner if active), Cmd+K trigger, density toggle (Sliders icon), theme toggle.
   - Active route in sidebar shows a 3px accent-blue left-edge bar + tinted background.
4. Click around: navigate to `/activity`, `/skills`, `/cost`, `/alerts`. Confirm the active-route highlight follows.
5. Press `Cmd+B` (or `Ctrl+B` on non-Mac). Sidebar should collapse to icon-only mode. Section headers vanish; thin 1px dividers appear between sections.
6. Hover over any icon in the collapsed sidebar — a Tooltip should appear to the RIGHT of the icon showing the route label.
7. The accent-blue left-edge bar on the active route MUST still be visible in collapsed mode.
8. Press `Cmd+B` again. Sidebar expands back. Reload the page (`Cmd+R`) — sidebar should remember its last state (expanded if last toggled to expanded, collapsed otherwise).
9. Click the density toggle in the header. Select Compact. The whole page should re-space (smaller paddings, smaller fonts) WITHOUT a flash. Reload — Compact should persist.
10. Reset density to Comfortable for downstream review.

If any of the 10 checks fails, describe the failure mode (e.g., "Cmd+B doesn't fire when focus is in an input", "tooltip clipped on collapsed sidebar", "active-route bar disappears on collapse").
  </how-to-verify>
  <resume-signal>Type "approved" if all 10 checks pass. Otherwise describe failures and the executor will diagnose + fix in a follow-up edit before the wave 4 quality-gate plans run.</resume-signal>
</task>

</tasks>

<verification>
```bash
cd frontend
pnpm tsc --noEmit
pnpm vitest run --reporter=dot
# Existing 326 + plan 02's ~6 + plan 03's ~9 + plan 04's ~8 = ~349 tests, all green.

# Manual visual verification is the human checkpoint above (task 4).
# Auto-capture matrix runs in plan 05 after this plan closes.
```
</verification>

<success_criteria>
1. `lib/sidebar.ts` exports `isSidebarCollapsed`, `setSidebarCollapsed`, `applySidebar`.
2. `Sidebar.tsx`, `SidebarSection.tsx`, `SidebarNavLink.tsx`, `AppShellHeader.tsx` exist and compile.
3. Sidebar renders Home + Observe (4 links) + Operate (1 link) + Configure (empty) sections.
4. Cmd+B keyboard listener at window level with preventDefault; persists collapsed state to localStorage.
5. Active-route nav link gets `cmc-sidebar__navlink--active` class via TanStack Router activeProps.
6. Collapsed-mode tooltip uses existing `ui/Tooltip.tsx` with `side="right"`.
7. AppShellHeader right-side action area contains (in order): EmergencyStopBanner, time-picker placeholder (display:none), save-view placeholder (display:none), Cmd+K trigger, DensityToggle, ThemeToggle.
8. AppShell.tsx wraps content tree in `<DensityProvider>`; root div has `flex-direction: row`.
9. main.tsx calls `applyDensity()` + `applyTheme()` + `applySidebar()` before createRoot.
10. NavBar.tsx is deleted (file does not exist).
11. styles.css has `.cmc-shell { flex-direction: row }`, `.cmc-sidebar`, `.cmc-sidebar__navlink--active`, `.cmc-app-shell-header` rules.
12. Vitest tests for Sidebar + AppShellHeader green.
13. Human checkpoint approved.
</success_criteria>

<output>
After completion, create `.planning/phases/24-shell-density-containment-primitives/24-04-SUMMARY.md` per the standard SUMMARY template, recording: actual lucide icon names used (verify each), final pixel widths if research's 240/52 needed adjustment, any AppShell.tsx import paths that diverged from the illustrative skeleton, and any EmergencyStopBanner CSS adjustments needed for the new mount location.
</output>
