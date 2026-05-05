# Phase 16: Session Comparison — Research

**Researched:** 2026-05-04
**Domain:** FastAPI/SQLAlchemy + React/TanStack Router + recharts
**Confidence:** HIGH (codebase-anchored — every recommendation cites a current-tree file:line)

> **NOTE:** No `CONTEXT.md` exists for Phase 16 (no `/gsd:discuss-phase` was run). The roadmap goal + CMPR-01..05 are the locked spec. Discretion areas (route file location, payload field names, picker UX details) are explicitly called out below.

---

## Summary

Phase 16 ships a **single GET endpoint** + a **single new file-based route** + **one new panel** + **two extension points** (CommandPalette, SessionsTable). All data lives in tables Phase 13 already shipped (`sessions`, `tools`, `otel_events`, `pricing`); no migration is needed. Cost is computed read-time via `cmc.pricing.compute_cost` + `cmc.pricing.load_rates` — same pattern Phase 13 (`cost.py`) and Phase 14 (`skills.py` SKIL-05) use.

**The roadmap text references `cmc/cost/engine.py` but that path does NOT exist in the current tree.** The cost engine module is `backend/cmc/pricing.py` (Phase 13 Plan 01). All Phase 13 routers (`cost.py`) and Phase 14 routers (`skills.py`) import via `from cmc.pricing import compute_cost, load_rates`. **Plan-time decision: use the actual `cmc.pricing` module** — do NOT create a new `cmc/cost/engine.py` shim just to make the roadmap text literal. Note this deviation in the plan's "decisions" section.

Skill set per session is computed read-time: `SELECT DISTINCT attrs_skill_name FROM otel_events WHERE session_id=? AND event_name='skill_activated' AND attrs_skill_name IS NOT NULL`. The 500-tool-call cap is checked against `sessions.tool_call_count` (denormalized column written by ingest, no JOIN needed). Outcome is read-time-classified the same way `observability.py` `_OUTCOMES_SQL` does it (CASE on otel_events EXISTS).

**Primary recommendation:** Single endpoint `GET /api/sessions/compare?a={sid}&b={sid}` returning a `CompareResponse` Pydantic v2 model with two side-by-side `SessionCompareSide` payloads + a `SkillSetDiff` block. URL state via TanStack Router `validateSearch`. Two-up render via recharts `BarChart` + small KpiTile/StatList grid — no new dependencies.

---

## Key file paths (always cite as absolute)

### Backend
- Sessions router: `backend/cmc/api/routes/sessions.py` (extend; add `/sessions/compare` endpoint here)
- Sessions schema: `backend/cmc/api/schemas/sessions.py` (add new response models)
- Cost engine: `backend/cmc/pricing.py` (`compute_cost`, `load_rates`; lines 55-126)
- Existing skills cost reference (dual-path pattern, range conversions): `backend/cmc/api/routes/skills.py` (lines 60-79 for `_RANGE_TO_DAYS`/`_range_start`; lines 386-528 for cost SQL patterns)
- Outcome derivation reference: `backend/cmc/api/routes/observability.py` lines 153-184 (`_OUTCOMES_SQL`)
- DB models: `backend/cmc/db/models/sessions.py`, `backend/cmc/db/models/tools.py`, `backend/cmc/db/models/otel_events.py`
- Common schema primitives (UTCDatetime serializer): `backend/cmc/api/schemas/common.py` lines 16-32 + `ORMBase` line 58
- Router registration: `backend/cmc/api/routes/__init__.py` (sessions_router already in `all_routers()` line 46 — no edit needed; just add the new endpoint to the existing router)
- Test patterns: `backend/tests/test_sessions_router.py`, `backend/tests/test_cost_router.py`, `backend/tests/test_skills_router.py`
- Test fixtures + seed helpers: `backend/tests/conftest.py` lines 313-441 (`client`, `db_session`, `seed_pricing`); helpers `make_session_row` (line 454), `make_otel_event` (line 494), `make_tool_call` (line 554)

### Frontend
- Routes: `frontend/src/routes/` — file-based via `@tanstack/router-plugin/vite`
- Existing nested-detail route reference: `frontend/src/routes/skills_.$name.tsx` (trailing-underscore pattern explanation lines 1-30)
- Top-level route reference: `frontend/src/routes/alerts.tsx` (50 lines — nearest analogue for `/sessions/compare`)
- Generated route tree: `frontend/src/routeTree.gen.ts` (auto-regen on `pnpm build`; do not hand-edit)
- Sessions table: `frontend/src/components/panels/SessionsTable.tsx` (lines 27-65 columns; add a "Compare with…" row action — pattern below)
- Command palette: `frontend/src/components/ui/CommandPalette.tsx` (extend the `<Command.Group heading="Actions">` block at line 85)
- NavBar (no edit needed — `/sessions/compare` is a nested deep link, not a primary nav target)
- Lib api typings + fetcher: `frontend/src/lib/api.ts` (add `SessionCompareResponse` interface + `api.sessionCompare()` fetcher)
- Lib queries hook: `frontend/src/lib/queries.ts` (add `qk.sessionCompare`, `useSessionCompare`)
- Recharts examples in-tree: `frontend/src/components/panels/ChartsStrip.tsx`, `SkillCostCard.tsx`, `TopSkills.tsx`
- DataTable primitive (used by sessions table): `frontend/src/components/ui/DataTable.tsx`
- Sheet primitive (for in-page picker drawer if needed): `frontend/src/components/ui/Sheet.tsx`
- PanelCard wrapper: `frontend/src/components/ui/PanelCard.tsx` (every panel uses this; required `reqId` prop)
- Test pattern reference: `frontend/src/components/panels/__tests__/AlertEventsList.test.tsx`, `SkillRunsTable.test.tsx`

---

## Backend — API Design

### Endpoint
`GET /api/sessions/compare?a={uuid}&b={uuid}` — added to `backend/cmc/api/routes/sessions.py`. Use the existing `_UUID_RE` (line 48) for both query params; reject malformed input with 400 the same way `session_details` does (line 111).

### Pydantic v2 response schemas — proposed (add to `backend/cmc/api/schemas/sessions.py`)

```python
from decimal import Decimal
from pydantic import BaseModel, Field
from cmc.api.schemas.common import UTCDatetime

class SessionCompareSide(BaseModel):
    """One side of the compare payload — mirrors SessionListItem
    plus computed cost + duration_ms + skills_used (set, returned as list)."""
    session_id: str
    started_at: UTCDatetime
    ended_at: UTCDatetime | None
    duration_ms: int | None
    cwd: str | None
    model: str | None
    source: str | None
    outcome: str | None        # read-time classified (see _COMPARE_OUTCOME_SQL below)
    tokens_input: int
    tokens_output: int
    tokens_cache_read: int
    tokens_cache_create_5m: int
    tokens_cache_create_1h: int
    tool_call_count: int
    message_count: int
    cost_usd: Decimal           # serialized as JSON string (Pydantic v2 default)
    skills_used: list[str]      # DISTINCT attrs_skill_name (sorted asc)
    over_cap: bool              # True iff tool_call_count > 500
    # Tool counts by tool_name — top-N or full small dict (see decision table below)
    tool_counts: dict[str, int]

class SkillSetDiff(BaseModel):
    """Set diff in canonical lists. shared = a ∩ b, only_a = a − b, only_b = b − a."""
    shared: list[str]
    only_a: list[str]
    only_b: list[str]

class SessionCompareResponse(BaseModel):
    a: SessionCompareSide
    b: SessionCompareSide
    skill_diff: SkillSetDiff
    rates_as_of: UTCDatetime | None  # max effective_from across rates touched
    over_cap: bool                   # Convenience: a.over_cap or b.over_cap
    cap: int = 500                   # Echo the threshold so the client renders deterministic copy
```

Use `Decimal` for `cost_usd` and let Pydantic v2 emit it as a JSON string. Mirror the `SkillCostCard.tsx` rule: frontend MUST display via `\`$${data.a.cost_usd}\`` template, NEVER `Number(...)` (precision loss). Cite Phase 14 `cmc/api/schemas/cost.py` lines 23-31 + Phase 14 P02 D-02 / Pitfall 5.

### Cost computation — exact contract

`cmc.pricing.compute_cost` is **NOT session-id-aware**; it takes raw token counts + a model + a `rates` dict. Workflow per side:

1. `rates = await load_rates(db)` — current effective rates per model, single call per request.
2. Read `sessions` row (denormalized 5m/1h tokens already split — Phase 13 Plan 02 added `tokens_cache_create_5m` + `tokens_cache_create_1h` columns).
3. Call `compute_cost(model, tokens_input, tokens_output, tokens_cache_read, tokens_cache_create_5m, tokens_cache_create_1h, rates)` → `Decimal`.
4. Lookup miss returns `Decimal(0)` and bumps `cmc.pricing.unpriced_tokens` counter (doctor surfaces) — no exception. Echo `rates_as_of` from `_coerce_effective_from` helper (clone from `cost.py:57` or skills.py:621).

**Imports needed (mirror existing):** `from cmc.pricing import compute_cost, load_rates` — same line as `cost.py:41` and `skills.py:59`.

### Skill-set query (per side)

```python
_COMPARE_SKILLS_SQL = text("""
    SELECT DISTINCT attrs_skill_name AS skill_name
    FROM otel_events
    WHERE session_id = :sid
      AND event_name = 'skill_activated'
      AND attrs_skill_name IS NOT NULL
    ORDER BY skill_name ASC
""")
```

**Critical:** event_name is BARE post-prefix-strip (`skill_activated`, NOT `claude_code.skill_activated`) — Pitfall already documented in `skills.py:225`. The index `idx_otel_events_attrs_skill_name` (otel_events.py:40) covers this query.

### Outcome (read-time classification)

Adapt `observability.py:_OUTCOMES_SQL` (lines 155-184). For a single session:

```python
_COMPARE_OUTCOME_SQL = text("""
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM otel_events e
                     WHERE e.session_id = :sid AND e.event_name = 'claude_code.api_error')
            THEN 'errored'
        WHEN EXISTS (SELECT 1 FROM otel_events e
                     WHERE e.session_id = :sid AND e.event_name = 'claude_code.api_retries_exhausted')
            THEN 'rate_limited'
        WHEN EXISTS (SELECT 1 FROM otel_events e
                     WHERE e.session_id = :sid AND e.event_name = 'claude_code.compaction')
            THEN 'truncated'
        WHEN (SELECT ended_at FROM sessions WHERE session_id = :sid) IS NULL
            THEN 'unfinished'
        ELSE 'ok'
    END AS outcome
""")
```

Note: outcome event names in `otel_events` keep the `claude_code.` prefix because they're raw OTLP event_name strings, NOT skill events. Match `observability.py` exactly — do not strip.

### Tool counts (per side)

```python
_COMPARE_TOOL_COUNTS_SQL = text("""
    SELECT tool_name, COUNT(*) AS n
    FROM tools
    WHERE session_id = :sid
    GROUP BY tool_name
    ORDER BY n DESC
""")
```

Returns `{tool_name: count}` as a Python dict. The 500-tool-call cap is on `sessions.tool_call_count` (the denormalized column) — `tool_call_count > 500` triggers `over_cap = True`. Even when over_cap, still return `tool_counts={}` (skip the JOIN to keep the over-cap path cheap) and the summary KPIs from the `sessions` row alone.

### Duration (per side)

```python
duration_ms = int((ended_at - started_at).total_seconds() * 1000) if ended_at else None
```

`started_at` and `ended_at` are stored as naive UTC (Phase 1 schema). Use stdlib subtraction in Python — no SQL window function needed.

### Error shapes

| Condition | Status | Body |
|-----------|--------|------|
| `a` or `b` missing/malformed UUID | 400 | `{"detail": "invalid session_id format"}` (mirror sessions.py:111) |
| `a` not found OR `b` not found | 404 | `{"detail": "session not found"}` (mirror sessions.py:118) |
| `a == b` | 400 | `{"detail": "cannot compare a session with itself"}` (project decision; reject early) |
| Either side `tool_call_count > 500` | 200 | Full payload but `over_cap=true` and `tool_counts={}` for that side. **Do NOT 413/422** — the requirement is a "fallback rendering with summary metrics only", not a refusal. |

> The phase context floats "413/422 over-cap" as an option. The roadmap text — *"sessions exceeding the cap show a 'session too long for full diff' fallback with summary metrics only"* — is a 200-with-flag, not a non-200. **Recommendation: 200 + `over_cap` flag** so the page can still render side-by-side numbers. The plan should lock this explicitly.

### Single-round-trip discipline (CMPR-01)

One `db: AsyncSession` — execute four SQL statements per side (sessions row, skills, outcome, tool_counts when not over-cap) + one `load_rates`. With two sides + load_rates that's at most 9 statements per request, all serialized through one async session. **Do NOT** loop hooks on the client. **Do NOT** issue separate cost endpoints — the response carries `cost_usd` baked in.

### Caching/TTL

Phase 13 cost endpoint is computed live each request — no TTL. Same convention here. v1 cap is "≤500 tool calls per side", so the heaviest path is two `tools` `GROUP BY` over ≤500 rows — well under 50ms with the `idx_tools_session_id` index (tools.py:46). Don't add caching unless a follow-up phase justifies it.

---

## Frontend — Routing

### File-based search-param validation pattern

**The codebase has NO existing `validateSearch` usage** (verified via grep). This phase is the first — set the precedent carefully. TanStack Router `^1.168.24` (frontend/package.json:24) supports `validateSearch` via the `createFileRoute` options bag. **Do NOT** add zod or valibot to the project for this — the project has neither (verified package.json). Use a minimal hand-written validator returning `{ a: string | undefined; b: string | undefined }`.

### Route file path — **discretionary, recommended `frontend/src/routes/sessions_.compare.tsx`**

This is a flat-file route with the trailing-underscore parent-layout opt-out (mirroring `skills_.$name.tsx` lines 4-13 explanation). Public URL: `/sessions/compare`. There's no `routes/sessions.tsx` parent today, so the underscore is technically unnecessary — **but** if any future plan adds `routes/sessions.tsx` (a sessions list page), the underscore prevents silent nesting. Cite the SkillsRunsTable lesson (`skills_.$name.tsx:1-30`) when locking this in.

### Search-param validator (proposed)

```typescript
// routes/sessions_.compare.tsx
type CompareSearch = { a?: string; b?: string }

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function validateSearch(raw: Record<string, unknown>): CompareSearch {
  const a = typeof raw.a === 'string' && UUID_RE.test(raw.a) ? raw.a : undefined
  const b = typeof raw.b === 'string' && UUID_RE.test(raw.b) ? raw.b : undefined
  return { a, b }
}

export const Route = createFileRoute('/sessions_/compare')({
  validateSearch,
  component: SessionCompareView,
})
```

In the component:
```typescript
const { a, b } = Route.useSearch()  // typed CompareSearch
const navigate = Route.useNavigate()
// To change picks (Cmd+K or row action), call:
//   navigate({ search: (prev) => ({ ...prev, b: newSid }) })
```

### Suspense / loader pattern

The codebase uses TanStack Query (`useSessionCompare`) inside the component, not a TanStack Router `loader`. Mirror `skills_.$name.tsx`: no loader, react-query fetches on mount and cancels on unmount. PanelCard handles the pending/error/empty branches uniformly (PanelCard.tsx).

If both `a` and `b` are unset/invalid → render an empty-state asking the user to pick two sessions (link to `/activity` sessions table). If only one is set → render the picked side and prompt to pick the second (Cmd+K hint).

---

## Frontend — Component breakdown

### `SessionCompareView` (in the route file)

Composition (single-column stack, NOT `.cmc-card-grid` because each side gets a wide column):

1. **Header** — `<h1>Session Compare</h1>` + breadcrumb back to `/activity`. Mirror `routes/alerts.tsx:22-38`.
2. **Two-up summary KPI strip** — `KpiTile` grid, side-by-side. Two columns of: cost, duration, tokens (in/out/cache), tool_call_count, message_count, outcome pill, model. Use `StatePill` (ui/StatePill.tsx) for outcome.
3. **Side-by-side recharts BarChart** — one row per metric (input, output, cache_read, cache_create); two bars per row keyed by `side='a'|'b'`. Or use two separate `<BarChart>` instances side-by-side in flexbox — matches Plan instruction "recharts side-by-side panels". Reuse the chart styling from `ChartsStrip.tsx:42-62`.
4. **Skill-set diff table** — Three columns: "Shared", "Only A", "Only B". Render each list of skill names; link each to `/skills/$name` via TanStack `<Link>`. Type-cast the link if `routeTree.gen.ts` regen hasn't caught up (Phase 14 Plan 03 precedent).
5. **Tool counts diff** — A small DataTable (existing primitive ui/DataTable.tsx) showing tool_name + count_a + count_b + delta. Hide when `over_cap=true` for either side; show a `<EmptyState>` saying "Session too long for full diff (>500 tool calls). Showing summary metrics only."
6. **Footer caption** — `Rates as of {rates_as_of}` (mirror `SkillCostCard.tsx:99`).

### Cmd+K extension — `CommandPalette.tsx`

Current shape (line 85-95): static `<Command.Group heading="Actions">` with one `Quick task` item. **Extend by adding a "Compare with…" item that is conditional on the current location** containing a session id. Two viable implementations:

**Option A (simple, recommended for v1):** Always show "Compare sessions" in the Pages or Actions group. Selecting it navigates to `/sessions/compare` with no params; the page renders the empty/two-picker state.

**Option B (context-aware, more discretion):** Detect current route via `useRouterState({ select: (s) => s.location })`. If on `/sessions/compare?a=X` (only A set), the item label becomes "Compare with…" and opens a session-picker sheet (mount the existing `Sheet` ui primitive); selecting a session calls `navigate({ search: (prev) => ({ ...prev, b: chosenSid }) })`. If both set, the item is "Pick a different session B".

The roadmap and CMPR-03 say "Cmd+K 'Compare with…' action (extends existing CommandPalette)". **Plan can choose A or B; recommend B because it directly satisfies the "Compare with…" copy and the "pick second session" flow.** Option B requires a list of recent sessions — reuse `useSessionsList({ range: '7d', limit: 50 })` from `lib/queries.ts:183`.

### SessionsTable row action — `SessionsTable.tsx`

Current shape: `COLUMNS` array (lines 27-65). Today there is **no row-click handler and no actions column**. To add "Compare with…":

- **Easiest (lowest blast radius):** Add a 7th column `id: 'actions'` whose `cell` renders a `<Button variant="ghost" size="sm">` with label `Compare`. Click handler calls `navigate({ to: '/sessions/compare', search: { a: r.session_id } })`.
- Avoid adding a generic `onRowClick` to the `DataTable` primitive — the existing API does not have one (DataTable.tsx:29-42); adding one would expand scope. Phase 14 P05's `SkillRunsTable` deliberately did NOT extend DataTable for this reason (SkillRunsTable.tsx:11-15 comment explicitly defers this).

When the user is on `/sessions/compare?a=X` already and clicks Compare on a different session, the row action should set `b`. Recommended: the route page renders the SessionsTable in a `<Sheet>` drawer when the user clicks "Pick session B"; reuse `useSessionsList` for the listing.

### `useSessionCompare` hook

Add to `lib/queries.ts` mirroring `useSkillCost` (lines 271-277):

```typescript
qk.sessionCompare: (a: string, b: string) => ['session-compare', a, b] as const,

export const useSessionCompare = (a: string | undefined, b: string | undefined) =>
  useQuery<SessionCompareResponse>({
    queryKey: qk.sessionCompare(a ?? '', b ?? ''),
    queryFn: () => api.sessionCompare(a!, b!),
    enabled: Boolean(a && b),    // gate so missing param is a clean idle state
    refetchInterval: 60_000,      // 60s — same tier as daily aggregates (queries.ts:213-256)
    staleTime: 45_000,
  })
```

Use kebab-prefix `'session-compare'` per Phase 14 Pitfall 5 / Phase 15 P04 precedent (queries.ts:101-106). Do NOT reuse the bare `'sessions'` prefix — that would invalidate compare on every session-list mutation.

### `api.sessionCompare` fetcher

Add to `lib/api.ts` next to `api.sessionDetails` (line 907):

```typescript
sessionCompare: (a: string, b: string) =>
  fetchJson<SessionCompareResponse>(
    `/api/sessions/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
  ),
```

Type definitions go alongside `SessionDetailsResponse` (api.ts:147-150).

---

## Cap enforcement — exact mechanics

### Where to count tool calls
**Source of truth:** `sessions.tool_call_count` column (sessions.py:33). This is denormalized at ingest (write-time) — no JOIN, no `COUNT(tools.*)`. Verified by `SessionListItem` schema (sessions schemas line 31).

### Threshold check
```python
SESSION_COMPARE_CAP = 500
over_cap = sess.tool_call_count > SESSION_COMPARE_CAP
```

### HTTP status / response shape on over-cap
**Recommendation: 200 with `over_cap=true` + omitted `tool_counts`.** See "Error shapes" table above. Rationale: the requirement says "show a fallback with summary metrics only" — that's a render branch, not an error. A 413 would force the client into an error pathway, which doesn't match the spec's "still show summary metrics".

### Frontend fallback rendering
- `over_cap` true on a side → still render the KPI strip (cost, tokens, duration, outcome — all from `sessions` row). Hide the tool_counts table; show `<EmptyState dataNoun="full tool-call diff" hint="Session too long for full diff (>500 tool calls)." />` (project ui/EmptyState.tsx).
- `over_cap` true on both sides → same fallback applies twice.
- Skill-set diff is **always** shown — DISTINCT skill query is independent of tool count and is cheap regardless of session size.

---

## Test plan

### Backend (pytest, pytest-asyncio, httpx ASGITransport)

**Reuse `client` and `db_session` fixtures** from `backend/tests/conftest.py:357,396`. Helpers `make_session_row`, `make_otel_event`, `make_tool_call` (conftest.py:454, 494, 554) seed deterministic data. The lifespan auto-seeds 5 SKUs in the pricing table — `seed_pricing` fixture (line 425) makes that explicit.

Test file: `backend/tests/test_sessions_router.py` (extend; don't create a new file — pattern from Phase 13 P04 / Phase 14 P01).

**Required tests (target ~10 — matches Phase 13 P04 and Phase 15 P02 ratios):**

1. `test_compare_basic_two_sessions` — seed two complete sessions with disjoint skill sets, hit the endpoint, assert `skill_diff.shared/only_a/only_b` are correct lists, `cost_usd` is a JSON string, `over_cap=false`.
2. `test_compare_returns_decimal_string` — explicit assertion that `cost_usd` round-trips as `"0.0247"`-shape, never `0.0247` (numeric). Same pattern as `test_skill_cost_decimal_as_json_string` (test_skills_router.py:803).
3. `test_compare_over_cap_returns_summary_only` — seed a session with `tool_call_count=501`, assert `over_cap=true` and `tool_counts={}` for that side; KPIs still present.
4. `test_compare_400_on_malformed_uuid` — `/api/sessions/compare?a=zzz&b=...` → 400 (mirror sessions.py:111-112 guard).
5. `test_compare_404_on_missing_session` — `a` valid UUID but no row → 404.
6. `test_compare_400_when_a_equals_b` — guard against degenerate compare.
7. `test_compare_outcome_classification` — seed sessions with otel_events `claude_code.api_error` / `claude_code.compaction` / no events / no `ended_at`, assert outcome strings match `observability.py` taxonomy.
8. `test_compare_skill_set_excludes_null_attrs_skill_name` — seed an otel_event with `event_name='skill_activated'` but `attrs_skill_name=None`, assert it's filtered out.
9. `test_compare_unpriced_model_returns_zero_cost` — session with model='unknown-sku' → `cost_usd="0"` and the `unpriced_tokens` counter increments.
10. `test_compare_single_round_trip` — assert exactly N SQL statements via `db.execute` mock or by counting log entries in `RequestLoggingMiddleware`. Optional but high-value for CMPR-01.

### Frontend (vitest, @testing-library/react)

Test file: `frontend/src/routes/__tests__/sessions_.compare.test.tsx` — note that **`frontend/src/routes/__tests__/` does not yet exist** (verified). Phase 14 P05 deferred routes-level tests for this exact reason (STATE.md line 68: "Routes test file SKIPPED — frontend/src/routes/__tests__/ doesn't exist; coverage via panel-level + human-verify"). **Phase 16 should establish this directory** OR co-locate the SessionCompareView component under `panels/` and test there. Recommend co-locating: extract `SessionCompareView` to `frontend/src/components/panels/SessionCompareView.tsx` and test in `panels/__tests__/SessionCompareView.test.tsx` — mirrors the AlertEventsList pattern.

**Test pattern to mirror exactly:** `panels/__tests__/AlertEventsList.test.tsx` (read it before writing any test). Key idioms:
- `client.setQueryData(qk.sessionCompare(a, b), fixture)` to seed PanelCard's data branch synchronously (line 87 of AlertEventsList.test.tsx).
- `vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(...))` in `beforeEach` for transitions that re-fetch.
- Render via `render(<Wrap client={client}><SessionCompareView a="..." b="..." /></Wrap>)` with the project's `test/utils.tsx` (already exports `render, screen, userEvent, waitFor`).

**Required tests (target 5-7, matching Phase 15 P05 ratio of 5/panel):**

1. Renders both sides + skill_diff three columns when `useSessionCompare` returns populated data.
2. Renders the over-cap empty-state for tool_counts table when `a.over_cap=true`.
3. Renders KPI strip values verbatim from the response (cost as `$1.23` template).
4. Pending state shows skeleton; error state shows error message (PanelCard handles both — assert via reqId presence).
5. Cmd+K test (in CommandPalette.test.tsx): confirms a "Compare with…" item appears and `userEvent.click` calls `navigate({ ... })`.
6. SessionsTable row action test: confirms a Compare button per row that navigates to `/sessions/compare?a={sid}`.
7. URL search param test: render the Route component with `a=X&b=Y` in the search; assert the hook is called with both. (Use `createMemoryHistory` from `@tanstack/react-router` per `TopSkills.test.tsx` precedent.)

**queries.test.ts surface-area pin:** must bump from 31 → 32 (or 33 if you also add a related mutation). Pattern: `queries.test.ts` enumerates and counts callable exports — Phase 15 P04 bumped 25→31 (STATE.md line 66). Don't forget to update.

---

## Pitfalls (≥5 specific gotchas)

### Pitfall 1: `Decimal(float)` precision loss
`compute_cost` is pure `Decimal`. Anywhere you multiply or sum cost values in tests, use `Decimal(str(value))` — never `Decimal(0.0247)`. **Every Phase 13 test asserts `Decimal` equality on the computed cost** (`backend/cmc/pricing.py:11` Pitfall 1 docstring). Frontend MUST display `cost_usd` as a Decimal-string template literal: `\`$${data.a.cost_usd}\``, NEVER `Number(data.a.cost_usd)` for the displayed dollar figure (see SkillCostCard.tsx:69 + Phase 14 P02 D-02 / Pitfall 5).

### Pitfall 2: skill `event_name` IS bare post-prefix-strip
The ingest router strips the `claude_code.` prefix at write time for `skill_activated` events. SQL filters in this phase MUST use `event_name = 'skill_activated'`, NOT `'claude_code.skill_activated'`. Documented in `skills.py:225` and reproduced in every `_USAGE_TOP_SQL` / `_RUNS_SQL`. **However**, outcome classification in `_OUTCOMES_SQL` (observability.py:162) uses the prefixed forms (`'claude_code.api_error'` etc) because those are NOT skill events — the prefix-strip is skill-event-specific. Easy bug: copy-pasting an `event_name` filter from the wrong source. Mirror the existing observability outcome SQL exactly.

### Pitfall 3: `attrs_skill_name` index covers DISTINCT but NOT `(session_id, attrs_skill_name)`
The index `idx_otel_events_attrs_skill_name` (otel_events.py:40) is on `attrs_skill_name` alone. The compare skill-set query filters on `session_id` first (`WHERE session_id=:sid AND event_name='skill_activated'`). The relevant index there is `idx_otel_events_session_id_ts` (line 38). Add `EXPLAIN QUERY PLAN` to the test if you're paranoid; in v1 (small tables, ≤500 events/session) this is not a problem.

### Pitfall 4: TanStack Router search-param re-render loop
Calling `navigate({ search: { a, b } })` with stale closures inside a `useEffect` causes infinite renders. **Always** use the function form: `navigate({ search: (prev) => ({ ...prev, a: newA }) })`. This is the documented router idiom. Wire the picker handlers via `useCallback` to lock the dependency array.

### Pitfall 5: `SQLAlchemy text()` parameter binding for SQLite
SQLite expects `:sid` bind names exactly. Pass via `db.execute(stmt, {"sid": session_id})` — do NOT inline strings (SQL injection risk + V11 path-traversal class). Use the same pattern as `skills.py:296` (`{"since": since_dt.isoformat(), "limit": limit}`).

### Pitfall 6: `attrs_skill_name=None` rows still match `event_name='skill_activated'`
Some `skill_activated` rows may have null `attrs_skill_name` (data from before LOCK-2 was confirmed). The query MUST include `AND attrs_skill_name IS NOT NULL` — already documented in `skills.py:238`. Without it, your skill-set will contain `None` and JSON-serialize as `null` in the list.

### Pitfall 7: `UTCDatetime` PlainSerializer — naive vs aware
`backend/cmc/api/schemas/common.py:16-32`: SQLAlchemy stores datetimes naive UTC; the serializer treats naive as UTC and emits `Z`-suffixed ISO strings. **Every `datetime` field in `SessionCompareSide`** that comes from an ORM row MUST be typed `UTCDatetime`, not `datetime`. Phase 15 P05 hotfix (commit e3e7838) had to retrofit this across 8 schemas — don't repeat the bug.

### Pitfall 8: Recharts SSR / hydration is not relevant here, but `ResponsiveContainer` requires explicit height
Vite SPA only — no SSR. Existing pattern in `ChartsStrip.tsx:43`: `<ResponsiveContainer width="100%" height={220}>`. Without an explicit height, the chart collapses to 0px and silently renders nothing. No hydration concern.

### Pitfall 9: Self-comparison (`a == b`) is a degenerate case
A user (or a typo in URL) can request `?a=X&b=X`. Decision: 400 on the server (error shape table). Without this guard, all metrics render as identical and the diff is empty — confusing UX. The frontend should ALSO refuse to navigate to a same-pair URL (button-disable when `a === b` in the picker).

### Pitfall 10: Single-flight is NOT needed here (read-only endpoint)
The skills sync endpoint uses `app.state.skills_sync_running` for single-flight (`skills.py:114`). The compare endpoint is read-only with no state mutation — do NOT add a single-flight wrapper. v1 doesn't need rate limiting beyond the global `RateLimitMiddleware` (factory.py:85).

### Pitfall 11: `tool_call_count` is denormalized — trust the column
A common temptation is `SELECT COUNT(*) FROM tools WHERE session_id=:sid` for the cap check. Don't — `sessions.tool_call_count` is denormalized at ingest write-time (sessions.py:33). The denormalized count is the source of truth used everywhere else in the app (see `SessionListItem` exposing it directly). Reading the column is O(1), counting tools is O(n).

---

## Open questions for the planner

1. **Route file location — `routes/sessions_.compare.tsx` vs. `routes/sessions/compare.tsx`?** The flat-file convention with trailing-underscore (`skills_.$name.tsx`) is the only existing dynamic-segment example. There's no existing `routes/sessions.tsx` parent today, so the underscore is technically optional. Recommend `sessions_.compare.tsx` for forward compat; planner should lock and document the choice.
2. **Cmd+K Option A vs Option B** (see "Cmd+K extension" section). Option A ships an unconditional "Compare sessions" page link; Option B implements the contextual "Compare with…" copy + picker drawer. CMPR-03 wording suggests B.
3. **Tool counts shape** — full dict of every tool name, or top-N? With 500-tool-call cap, dict size is bounded by distinct tool count (typically <30). Recommend full dict, no truncation.
4. **`rates_as_of` granularity** — single value across both sides, or per side? If both sessions used the same model, identical; if different, return the max of the two effective_from dates. Recommend a single top-level `rates_as_of` (max).
5. **Should `cost_usd` be a Decimal-string in the response or a number?** Phase 13 / Phase 14 lock Decimal-as-JSON-string for cost across all endpoints. Recommend follow that lock — and the planner should explicitly note it (frontend MUST template-literal display, NEVER `Number(...)`).
6. **Sessions-table picker UX** — link-to-page, drawer-overlay, or modal? Recommend the drawer/Sheet pattern (ui/Sheet.tsx) listing recent sessions via `useSessionsList`; mirrors SkillRunsTable's session-detail drawer pattern (SkillRunsTable.tsx:273-280).
7. **Roadmap text references `cmc/cost/engine.py` (does not exist)** — confirm the plan can lock `cmc.pricing` and update REQUIREMENTS.md / ROADMAP.md with a one-line citation pointing to the actual module.
8. **NavBar entry?** Probably no — `/sessions/compare` is contextual (only useful with two sessions selected). Phase 15 added `/alerts` to NavBar (NavBar.tsx:9). Compare is more like `/skills/$name` (no NavBar entry). Recommend NO NavBar link.
9. **`outcome` enum vs. literal string?** Schema models use `str` field today (sessions schemas line 26). Same here — `Literal['errored','rate_limited','truncated','unfinished','ok']` would be tighter but adds churn. Recommend keep `str | None` to match existing.

---

## Sources (codebase only — HIGH confidence throughout)

### Primary (files read in full or pertinent ranges)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/pricing.py` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/sessions.py` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/cost.py` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/skills.py` (lines 1-799, full)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/alerts.py` (lines 1-100, 220-390)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/observability.py` (outcome SQL block 153-184)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/schemas/sessions.py` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/schemas/common.py` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/schemas/cost.py` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/schemas/alerts.py` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/api/routes/__init__.py` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/db/models/sessions.py`, `tools.py`, `otel_events.py` (entire files)
- `/Users/patrykattc/work/git/claude-mission-control/backend/cmc/app/factory.py` (lines 132-145 router registration)
- `/Users/patrykattc/work/git/claude-mission-control/backend/tests/conftest.py` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/backend/tests/test_skills_router.py` (selected ranges)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/routes/skills_.$name.tsx` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/routes/alerts.tsx` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/ui/CommandPalette.tsx` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/ui/DataTable.tsx` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/ui/Sheet.tsx` (selected ranges)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/panels/SessionsTable.tsx` (entire file)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/panels/SkillCostCard.tsx` (selected ranges)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/panels/SkillRunsTable.tsx` (selected ranges)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/panels/ChartsStrip.tsx` (selected ranges)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/components/panels/__tests__/AlertEventsList.test.tsx` (selected ranges)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/lib/api.ts` (selected ranges)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/src/lib/queries.ts` (lines 1-300)
- `/Users/patrykattc/work/git/claude-mission-control/frontend/package.json`
- `/Users/patrykattc/work/git/claude-mission-control/.planning/STATE.md` (Decisions section)
- `/Users/patrykattc/work/git/claude-mission-control/.planning/ROADMAP.md` (Phase 16 + Phase 17)
- `/Users/patrykattc/work/git/claude-mission-control/.planning/REQUIREMENTS.md` (CMPR-01..05 lines)

### Versions confirmed
- `recharts@^3.8.1` (frontend/package.json:24) — already in use across 7 panels
- `@tanstack/react-router@^1.168.24` — supports `validateSearch` per @tanstack/router-core type exports
- `@tanstack/react-query@^5.100.5` — cadence pattern via `queryKey`/`refetchInterval`
- `cmdk@^1.1.1` — CommandPalette wrapper
- Python: SQLAlchemy 2.x (`AsyncSession`), Pydantic v2 (`BaseModel`, `model_validator`, `ConfigDict(from_attributes=True)`)
- pytest-asyncio used for async test fixtures (conftest.py:309-422)

---

## Confidence breakdown

| Area | Level | Reason |
|------|-------|--------|
| API design (endpoint shape, schema) | HIGH | Cited Phase 13/14 router + schema patterns; structures mirror existing `cost.py` and `skills.py` SKIL-05 |
| Cost engine integration | HIGH | `cmc.pricing.compute_cost` + `load_rates` is the only Phase 13/14 pattern; verified across `cost.py` + `skills.py` |
| Skill-set computation | HIGH | `attrs_skill_name` column + `event_name='skill_activated'` filter pattern verified in `skills.py:230-247` |
| Outcome classification | HIGH | Direct adaptation of `observability.py:_OUTCOMES_SQL` |
| 500-tool cap mechanics | HIGH | `sessions.tool_call_count` is the existing source of truth (sessions.py:33, exposed in `SessionListItem`) |
| URL search-param validator | MEDIUM-HIGH | First use of `validateSearch` in this codebase; pattern from TanStack Router 1.168 docs (officially supported) |
| Cmd+K extension point | MEDIUM | Two viable shapes (Option A simple vs Option B context-aware); planner picks |
| SessionsTable row action | HIGH | DataTable column-cell pattern is the established way (no `onRowClick` API); SkillRunsTable precedent |
| Test patterns (backend) | HIGH | Existing fixtures (`client`, `db_session`, `seed_pricing`, `make_*` helpers) cover all scenarios |
| Test patterns (frontend) | HIGH | AlertEventsList.test.tsx is the canonical reference; routes/__tests__/ dir doesn't exist (state.md note) — recommendation is to co-locate as a panel |
| Pitfalls | HIGH | All 11 pitfalls are codebase-anchored, not generic — file:line cited |

**Research date:** 2026-05-04
**Valid until:** ~2026-06-04 (30 days; CMC's stack is stable)

## RESEARCH COMPLETE
