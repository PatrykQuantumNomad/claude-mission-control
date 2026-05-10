// Density module — Phase 24 Plan 01 (DENS-01..03).
//
// Mirror of `lib/theme.ts`. Density tokens MUST live on `:root` so Radix
// Portal-mounted content (Tooltip, Sheet, DropdownMenu, Popover, AlertDialog)
// inherits them — see DENS-02 invariant. If density tokens were scoped to a
// nested wrapper, Portal-rendered subtrees would mount outside that wrapper
// and miss the cascade entirely.
//
// Three discrete tiers (Compact / Comfortable / Cozy) are persisted in
// localStorage under `cmc.density` and reflected as `<html data-density="…">`
// at boot via `applyDensity()`. Comfortable is the default and corresponds to
// the un-overridden `:root` token block in styles.css.
//
// applyDensity() is invoked from main.tsx BEFORE applyTheme() so the
// data-density attribute is set during the first paint — avoids a flash of
// wrong density on cold load and ensures the tokens are resolved before any
// theme-conditional rule depends on them.
//
// Pitfall guard: SSR-safe — every accessor checks `typeof window` /
// `typeof document` before touching localStorage / DOM. This codebase does
// not ship SSR, but the guard keeps unit tests clean and matches the
// conventions used by lib/theme.ts and lib/storage.ts.

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
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.density = d
  }
}

// Apply the persisted density to <html data-density="…"> on boot. Call from
// main.tsx before applyTheme() — guarantees no flash of wrong density and
// resolves density tokens before any theme override needs them.
export function applyDensity(): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.density = getDensity()
}
