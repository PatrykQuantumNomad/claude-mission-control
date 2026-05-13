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

/**
 * Validate a raw search value as a Grafana-style relative time token
 * (`now`, `now-Nu`, `now/u`, `now-Nu/u`) OR an ISO-8601 absolute timestamp.
 * Returns the value verbatim if shape-valid, else `undefined`.
 *
 * Phase 26 / TIME-01. Used by /, /activity, /sessions/compare validators
 * to accept ?time_from=now-7d&time_to=now URL params APPEND-ONLY without
 * defaulting (per RESEARCH Pitfall 13 — DefaultViewLoader's bare-URL gate
 * must continue firing when these params are absent).
 *
 * Defense in depth: clipboard paste (TIME-03) re-validates through this
 * helper before applying; brush-zoom commits (TIME-05) produce ISO strings
 * that pass the ISO_ABS leg.
 */
const GRAFANA_REL = /^now(?:[-+]\d+[smhdwMy](?:\/[dwMy])?|\/[dwMy])?$/
const ISO_ABS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

export function asTimeToken(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  return GRAFANA_REL.test(v) || ISO_ABS.test(v) ? v : undefined
}

/**
 * Validate a raw search value as a comma-separated list of panel ids.
 * Returns the value verbatim if shape-valid, else `undefined`.
 *
 * Phase 26 / TIME-04. Per-panel compare-overlay state is persisted via a
 * single URL CSV param `compare_panels` (RESEARCH Open Q #2 recommendation
 * — single param is easier to validate, easier to fork-save into a saved
 * view's state_json, lower URL noise than one-key-per-panel proliferation).
 *
 * Shape: lowercase alphanumeric panel ids (plus `_` and `-`) separated by
 * commas. No spaces. No trailing commas. Empty string is treated as absent
 * (returned as undefined). Defense in depth: clipboard paste pipelines and
 * saved-view state_json hydration re-validate through this helper, so a
 * malformed blob from a forward-version saved view drops silently instead
 * of crashing the page load (mirrors RESEARCH Pitfall 6).
 */
const COMPARE_PANELS_RE = /^[a-z0-9_-]+(?:,[a-z0-9_-]+)*$/

export function asComparePanels(v: unknown): string | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  return COMPARE_PANELS_RE.test(v) ? v : undefined
}
