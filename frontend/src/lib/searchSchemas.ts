// Shared search-schema helpers for TanStack Router `validateSearch` (Phase 25 / VIEW-01).
//
// Every in-scope route's `validateSearch` returns a typed Search shape whose
// `schemaVersion` field is OPTIONAL on input (so existing `<Link to=...>` call
// sites don't need to pass it explicitly) but is ALWAYS populated on output by
// the validator. This file is the single source of truth for the current
// schema version + the coercion helper that injects it.
//
// Locked invariant (docs/url-contract.md:21-24, RESEARCH Pitfall 3):
//   `validateSearch` is APPEND-ONLY. Bumping SCHEMA_VERSION is also append-only —
//   any new field added to a route's Search shape must default to a value that
//   reproduces pre-bump behavior so existing deep-links and Telegram bookmarks
//   continue to resolve identically.
//
// Optional-on-input invariant (Phase 25 Plan 03 execution decision):
//   The per-route `XxxSearch` type marks `schemaVersion?:` as OPTIONAL. TanStack
//   Router infers the navigation input type from the validator's return type;
//   marking it optional preserves the pre-Phase-25 call shape of every
//   `<Link to="/activity">` / `navigate({ to: "/cost" })` site in the codebase.
//   On read (`useSearch()`) the value is always defined because the validator
//   always populates it — consumers can rely on `searchVersion === 1` at
//   runtime even though the type says `1 | undefined`.
//
// Why opaque to the backend:
//   Saved views (Phase 25) persist the validated search blob into the backend's
//   `saved_views.state_json` column as a TEXT/JSON BLOB. The backend never
//   validates the shape — `validateSearch` is the only gatekeeper on read
//   (RESEARCH Pitfall 6). Stale fields from a forward-version saved view are
//   dropped silently; pre-version saved views simply lack `schemaVersion` and
//   `coerceSchemaVersion` defaults them to the current version.

/**
 * Shared schema-version constant for all route `validateSearch` shapes.
 *
 * Today: `1` for every in-scope route. Future plans may bump per-route, but
 * the bump MUST stay append-only and the route's validator MUST coerce stale
 * values back to the current shape (no crash, no error toast — saved views
 * are best-effort hydration).
 */
export const SCHEMA_VERSION = 1 as const

/**
 * Coerce a raw search record's `schemaVersion` to the current constant.
 *
 * Today: always returns `1` (single version exists). Forward plans will
 * branch on `raw.schemaVersion` to migrate older blobs into the current
 * shape before returning the current constant.
 */
export function coerceSchemaVersion(
  _raw: Record<string, unknown>,
): typeof SCHEMA_VERSION {
  // Future: if (raw.schemaVersion === 2) return 2 (etc.)
  return SCHEMA_VERSION
}
