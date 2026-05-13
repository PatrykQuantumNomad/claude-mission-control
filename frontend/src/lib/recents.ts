// frontend/src/lib/recents.ts — Phase 26 Plan 02 (SHEL-05, CMDK-04).
//
// FIFO ring of recently-visited routes. Source of truth for:
//   - Sidebar Recently Visited section (renders top 3 — per CONTEXT)
//   - Cmd+K Recents group (renders top 5 — per CONTEXT)
//
// Storage key: cmc.recents.routes (registered in cmc.* namespace).
// Ring cap: 20 entries (headroom over 3 + 5 = 8 needed).
// Dedupe semantics: if the head of the ring is the same route as the
// incoming push, REPLACE the head (update visitedAt) rather than
// prepending a duplicate. Mirrors savedViews.ts:pushRecentState dedupe.
//
// READ semantics: getRecentRoutes() returns the ring newest-first.
// SidebarRecentlyVisitedSection (Wave 2) calls .slice(0, 3) and FILTERS
// OUT the currently-active route (Pitfall 8 option b: accept one-frame
// flicker; show only the OTHER recent routes — cleaner UX anyway).

const KEY = 'cmc.recents.routes'
const CAP = 20

export interface RecentRoute {
  route: string
  visitedAt: number
}

function readRing(): RecentRoute[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is RecentRoute =>
        typeof r === 'object' &&
        r !== null &&
        typeof r.route === 'string' &&
        typeof r.visitedAt === 'number',
    )
  } catch {
    return []
  }
}

function writeRing(ring: RecentRoute[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ring))
  } catch {
    // localStorage full / disabled — fail silently.
  }
}

export function pushRecentRoute(entry: RecentRoute): void {
  const ring = readRing()
  // Head-dedupe: if the most recent entry is the same route, replace it
  // (the user just navigated within the same route — refresh visitedAt).
  const next: RecentRoute[] =
    ring.length > 0 && ring[0]?.route === entry.route
      ? [entry, ...ring.slice(1)]
      : [entry, ...ring.filter((r) => r.route !== entry.route)]
  writeRing(next.slice(0, CAP))
}

export function getRecentRoutes(): RecentRoute[] {
  return readRing()
}

export function clearRecentRoutes(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
