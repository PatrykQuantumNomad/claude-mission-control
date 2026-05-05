# Stack Research — v1.2 Depth & Polish

**Domain:** Local-only single-user dashboard for Claude Code sessions — extending v1.1 with deeper analytics + NL-authored alerts + compare-view shortcuts.
**Researched:** 2026-05-05
**Confidence:** HIGH (every recommended addition verified against Context7 or official source; every "do not add" backed by an existing in-repo equivalent)

## TL;DR

**Net new dependencies for v1.2: ZERO.**

Every v1.2 feature is implementable with existing v1.1 stack. The detector math, NL grammar parsing, linear extrapolation, project breakdowns, time-window deltas, and Cmd+K context-aware actions all extend code that already ships in v1.1. The polish lane (utcnow → `datetime.now(UTC)`, aria-label disambiguation, fake-timer flake fixes) is a refactor, not a stack change.

This is a deliberate "no new lanes" milestone — and that extends to dependencies.

---

## Recommended Stack

### Core Technologies (UNCHANGED from v1.1 — confirmed current)

| Technology | Pinned (v1.1) | Latest Available | Action | Why |
|------------|---------------|------------------|--------|-----|
| Python | 3.13 | 3.13 | Hold | `requires-python = ">=3.13"` already in `pyproject.toml`; v1.2 features need nothing newer |
| FastAPI | 0.136.1 | 0.136.1 | Hold | Already at latest as of 2026-05-05 |
| Pydantic | 2.13.3 | 2.13.3 | Hold | Latest stable; PlainSerializer + UTCDatetime patterns already proven in v1.1 |
| SQLAlchemy | 2.0.49 | 2.0.49 | Hold | Latest 2.x; window functions + CTE support sufficient for SKLP-08/09/10 + ANLY-07 |
| SQLModel | 0.0.38 | 0.0.38 | Hold | Compatible with Pydantic 2.13.x |
| aiosqlite | 0.22.1 | 0.22.1 | Hold | WAL mode + per-task scoped sessions still the v1.0 contract |
| Alembic | 1.18.4 | 1.18.4 | Hold | No schema changes for v1.2 — every feature reads existing tables |
| anthropic (Python SDK) | 0.97.0 | 0.99.0 | Hold (or bump in polish) | 0.97 → 0.99 is non-breaking; not required for v1.2 functionality. `claude-haiku-4-5` model alias is supported in both. |
| React | 19.2.5 | 19.2.x | Hold | StrictMode double-invoke pattern already accommodated |
| Vite | 8.0.10 | 8.x | Hold | No build-tool changes needed |
| TanStack Router | 1.168.24 | 1.169.1 | Hold (or bump in polish) | Patch-level drift; `validateSearch` + function-form `search` already proven |
| TanStack Query | 5.100.5 | 5.100.9 | Hold | 30s poll cadence locked; placeholderData + select() patterns extend cleanly |
| cmdk | 1.1.1 | 1.1.1 | Hold | Already latest. `useCommandState` + conditional rendering covers CMPR-07 |
| recharts | 3.8.1 | 3.8.1 | Hold | Already used by ChartsStrip / TokenUsageCard; ANLY-06 forecast = one extra `<Line strokeDasharray>` |
| framer-motion | 12.38.0 | 12.x | Hold | No new motion patterns in v1.2 |
| vitest | 4.1.5 | 4.1.5 | Hold | `vi.useFakeTimers` + `setSystemTime` + `advanceTimersByTimeAsync` are the flake-fix toolkit |
| Playwright | 1.59.1 | 1.59.1 | Hold | `getByTestId` + strict-mode resolves aria-label collisions |

### Supporting Libraries (UNCHANGED — what's already there suffices)

| Library | Version | Purpose | v1.2 Use |
|---------|---------|---------|----------|
| stdlib `math` | 3.13 | EWMA z-score + sqrt | ALRT-13 rolling-mean ± stddev extends `cmc/alerts/detector.py` (already 277 LOC stdlib-only) |
| stdlib `collections.deque` | 3.13 | Bounded ring buffer | NOT needed — EWMA is constant-memory; rolling stddev for ALRT-13 piggy-backs on existing EWMA state |
| stdlib `decimal.Decimal` | 3.13 | Money math | Reused for ANLY-06 forecast extrapolation; never `float` for cost arithmetic |
| stdlib `datetime` (UTC-aware) | 3.13 | `datetime.now(UTC)` | Replaces 20 `Field(default_factory=datetime.utcnow)` sites — pure refactor, no new dep |
| stdlib `statistics` | 3.13 | NOT used | Explicitly NOT imported — keeps detector dependency surface = `math` only (matches v1.1 ADR) |
| anthropic SDK | 0.97.0 | Haiku NL parsing | ALRT-14 NL→alert-rule extends `cmc/dispatcher/skill_router.py` pattern — same `messages.create(model="claude-haiku-4-5", …)` + JSON-mode prompt + Pydantic validator |
| structlog | 25.5.0 | JSON logs | Reused for ALRT-13/14 detector + dispatcher logs |
| croniter | 6.2.2 | NOT used | Cron is irrelevant for v1.2; no schedule-related work |

### Frontend Libraries (UNCHANGED — proven patterns extend cleanly)

| Library | Version | v1.2 Use |
|---------|---------|----------|
| `cmdk` `useCommandState` | 1.1.1 | CMPR-07 "compare with previous session" — context-aware item label already implemented for current/A pattern in `CommandPalette.tsx`; "previous session" variant just adds one branch |
| `useRouterState` (TanStack Router) | 1.168.24 | Reads current `/sessions/compare?a=…` to detect "previous session" candidate |
| recharts `<Line strokeDasharray>` | 3.8.1 | ANLY-06 forecast: dashed extrapolation line on existing TokenUsageCard chart — no new chart type |
| recharts `<ReferenceLine>` | 3.8.1 | Optional: monthly-budget overlay |
| `Intl.NumberFormat` (browser) | — | SKLP-08/09 % deltas, "new this week" formatting — no date library needed |
| Native `Date` arithmetic | — | "new this week" / "dormant" badges = pure SQL `datetime('now', '-7 days')`, no `date-fns` / `dayjs` |

### Development Tools (UNCHANGED)

| Tool | Purpose | v1.2 Notes |
|------|---------|------------|
| ruff 0.9+ | Lint + format | `UP` (pyupgrade) rule will catch any remaining `datetime.utcnow()` after the deprecation cleanup — let it auto-fix |
| pyright 1.1.409+ | Typecheck | No config change needed |
| pytest-freezer 0.4+ | Deterministic time | Already in dev-deps; reuse for ALRT-13 warm-up tests + ANLY-06 forecast cutoff tests |
| pytest-asyncio | Async tests | ALRT-14 Haiku-mock tests follow existing skill_router test pattern |

---

## Per-Question Decisions (downstream consumer answers)

### 1. Anomaly detection (rolling mean ± stddev) — ALRT-13

**Decision:** Stdlib `math` only. **Extend** `cmc/alerts/detector.py` — do not create a new module.

**Rationale:**
- The existing EWMA z-score detector (lines 176-277) already computes `new_mean` and `new_var` in constant memory via Welford-style recurrence. ALRT-13's "rolling mean ± stddev" is mathematically the same shape — `stddev = sqrt(var)` — so the addition is a single helper that returns `(mean, sqrt(var + EPSILON))` from existing state, plus a new `AlertRule.detector_kind = "rolling_stddev"` discriminator.
- **No `numpy`/`scipy`/`pandas`/`sklearn`** — the v1.1 ADR (detector.py L17-19) explicitly forbids non-stdlib numerics; ALRT-13 must honour that bar. Adding numpy alone would balloon the wheel from ~5 MB to ~70 MB and break the "local-only, single-binary" promise.
- **`deque(maxlen=N)` vs SQL window functions:** **Neither.** The EWMA state dict (`{ewma_mean, ewma_var, sample_count}` persisted on `AlertState.params_json`) is already constant-memory and survives dispatcher restarts. A `deque` would force re-computation on every dispatcher boot from raw history; a SQL `OVER (ROWS BETWEEN N PRECEDING)` window would re-scan rows every 120s tick. Both are strictly worse than the existing approach.
- **What ALRT-13 actually needs:** add `evaluate_rolling_stddev(rule, value, state, *, now)` that reuses `_read_anomaly_state` + `_resolve_window_n`, and emits FIRING/CLEAR based on `|value - mean| > k * stddev` (k from `params_json.k_sigma`, default 3). One new pure function, ~40 LOC.

**File path:** `backend/cmc/alerts/detector.py` (extend) + `backend/cmc/dispatcher/alerts.py` (dispatch new detector_kind).

**Confidence:** HIGH — verified by reading existing detector.py (Welford recurrence is already present) and confirming the math equivalence.

---

### 2. NL-authored alert rules via Haiku — ALRT-14

**Decision:** Reuse the `cmc/dispatcher/skill_router.py` pattern verbatim. **Do not** add `instructor` or `pydantic-ai`.

**Rationale:**
- The skill_router pattern (lines 30-104) is the v1.0/v1.1 standard for NL→structured: lazy `from anthropic import AsyncAnthropic`, system prompt enforcing strict JSON, `json.loads` + `isinstance` validation, registry-based hallucination guard. ALRT-14's grammar (output shape: `{name, scope, metric, op, threshold_fire, threshold_clear?, min_dwell_seconds?, cooldown_seconds?}`) is structurally identical to skill_router's `{skill: <name>}` — just with more keys.
- **Validation strategy:** Pipe the parsed dict through the existing `AlertRuleCreate` Pydantic model (`backend/cmc/api/schemas/alerts.py`). If validation fails → log + return None (graceful degradation, same as skill_router on hallucination). The Pydantic model already enforces `scope ∈ {global, project, session, …}`, `metric ∈ {…}`, threshold bounds — no new validator needed.
- **Why not `instructor`:** Instructor wraps the SDK with auto-retry + Pydantic schema → tool_use round-trip. Useful for multi-call agentic flows, overkill for a one-shot grammar parse. Adds a dep + ties us to a specific Pydantic version contract. The existing JSON-mode prompt costs ~200 tokens for a perfectly bounded grammar.
- **Why not `pydantic-ai`:** Heavier still — agent-loop framework with tool-use, dependency injection, multi-provider abstraction. Solves problems we don't have.
- **Why not Anthropic native tool use (`tools=[…]`):** Would work and is documented in `/anthropics/anthropic-sdk-python` Context7 docs. But it adds a round-trip (tool_use → tool_result → final) for no gain over JSON-mode here. JSON-mode is what skill_router uses; consistency wins.

**File paths:**
- `backend/cmc/dispatcher/alert_nl.py` (new — mirrors skill_router.py shape; ~80 LOC)
- `backend/cmc/api/routes/alerts.py` (add `POST /api/alerts/rules/_parse` endpoint that calls the new module then validates against `AlertRuleCreate` and returns the dict for the user to confirm before commit)
- `frontend/src/components/panels/AlertRuleForm.tsx` (extend — add a "Describe in plain English" textarea that POSTs to `/_parse` and pre-fills the existing form)

**Confidence:** HIGH — the existing skill_router.py is the proven, idiomatic pattern; Anthropic SDK 0.97 messages.create() supports both JSON-mode prompting and `claude-haiku-4-5` (verified via Context7 `/anthropics/anthropic-sdk-python`).

---

### 3. Linear extrapolation for monthly cost forecast — ANLY-06

**Decision:** Stdlib only — pure-Python ordinary least squares. **Do not** add `scipy.stats.linregress` or `numpy`.

**Rationale:**
- Linear regression on N daily cost points (N ≤ 31) is ~10 lines of stdlib: compute `mean_x`, `mean_y`, `slope = sum((x-mx)*(y-my)) / sum((x-mx)**2)`, `intercept = my - slope*mx`, then extrapolate to month-end. Decimal-clean (stay in `Decimal` to match `cmc.pricing`).
- **Confidence intervals:** Optional, but cheap if requested — residual stddev → 95% CI is `1.96 * stddev * sqrt(1 + 1/N + (x-mx)**2 / sum((x-mx)**2))`. Still pure stdlib (`math.sqrt`).
- **Why not scipy:** scipy is ~50 MB compressed, drags in numpy + BLAS — same wheel-bloat objection as Q1. Single linear regression on ≤31 points doesn't justify it.
- **Why not numpy alone:** No vectorisation gain at N=31; the loop is faster than numpy's per-call overhead.
- **Why not statsmodels / Prophet / ARIMA:** These are time-series forecasting frameworks for non-stationary data with seasonality. Monthly cost burn for a single dev's local Claude Code usage is well-modeled by simple linear extrapolation — and the failure mode (forecast wrong by ±20%) is benign (it's a budget heads-up, not a billing system).

**File paths:**
- `backend/cmc/analytics/forecast.py` (new — small module; ~50 LOC pure functions: `linear_forecast(daily_costs: list[Decimal]) -> ForecastResult`)
- `backend/cmc/api/routes/observability.py` (extend — add forecast field to existing cost endpoint OR new `/api/observability/cost/forecast` route)
- `frontend/src/components/panels/TokenUsageCard.tsx` or new `MonthlyForecastCard.tsx` (extend recharts chart with dashed `<Line>` for projected days)

**Confidence:** HIGH — stdlib OLS is textbook; the math is deterministic and trivially testable with `pytest-freezer`.

---

### 4. Per-project cost / skill breakdown — ANLY-07, SKLP-08

**Decision:** Pure SQL via existing CTE patterns in `backend/cmc/api/routes/`. **Do not** add `pandas`, `polars`, `duckdb`, or any analytics tooling.

**Rationale:**
- `ProjectBreakdownCard.tsx` already exists (frontend/src/components/panels/) and consumes `/api/sessions/by-project` which uses SQL CTEs. ANLY-07 just adds a `cost_total_decimal` aggregate column to the same query — `SUM(cost_total_decimal)` joined on the existing pricing-resolved rows.
- SKLP-08 per-project skill breakdown: same shape, joining `skill_runs` by `cwd`/`project_id`. Aggregation cardinality is small (≤100 projects × ≤20 skills = ≤2,000 rows) — trivially in-process.
- SQLite WAL + `aiosqlite` already supports window functions, CTEs, and `GROUP BY` rollups. No new SQL features needed.
- **Why not pandas/polars:** The result-set fits in a single page render; adding a DataFrame layer just inverts who does the GROUP BY (Python instead of SQLite) and bloats deps.
- **Why not duckdb:** Would require maintaining two engines (SQLite for OLTP, DuckDB for OLAP) on the same `data/cmc.db`. Pure-SQLite is simpler and the data volumes don't motivate a switch.

**File paths:**
- `backend/cmc/api/routes/sessions.py` (extend `by-project` route — already at line ~XXX per grep — add cost column)
- `backend/cmc/api/routes/skills.py` (extend — add `/api/skills/by-project` route mirroring the sessions one)
- `frontend/src/components/panels/ProjectBreakdownCard.tsx` (extend `COLUMNS` array — add Cost column)
- `frontend/src/components/panels/SkillCostCard.tsx` (extend — add per-project rollup)

**Confidence:** HIGH — confirmed `ProjectBreakdownCard.tsx` already exists at `frontend/src/components/panels/`; pattern is established.

---

### 5. Time-window deltas + "new this week" / "dormant" badges — SKLP-09, SKLP-10

**Decision:** Pure SQL date arithmetic via SQLite's `datetime()` and `julianday()`. **Do not** add `dayjs`, `date-fns`, `arrow`, or `pendulum`.

**Rationale:**
- "New this week": `WHERE first_seen_at >= datetime('now', '-7 days')` — single predicate.
- "Dormant": `WHERE last_seen_at < datetime('now', '-30 days')` — same shape.
- "Period-over-period delta": two `SUM(CASE WHEN ts >= datetime('now', '-7 days') THEN cost ELSE 0 END)` columns, then `(current - previous) / previous` in the response shape (or in the panel).
- All time math stays UTC-side (`datetime('now')` in SQLite is UTC by default; matches the v1.1 `UTCDatetime` PlainSerializer contract).
- **Frontend:** `Intl.RelativeTimeFormat` (already used by `RelativeTime.tsx`) handles "3 days ago" rendering. `Intl.NumberFormat` with `signDisplay: 'always'` handles "+12% / -8%" delta formatting.
- **Why not date-fns:** Already replaced in v1.0 design with `Intl.*` + native `Date`. Adding it back for two badges contradicts the "no client-side date library" decision.
- **Why not dayjs:** Same reason — bundle bloat for a problem the platform already solves.

**File paths:**
- `backend/cmc/api/routes/skills.py` (extend `/api/skills` — add `first_seen_at`, `last_seen_at`, `is_new_this_week`, `is_dormant`, `cost_7d_delta_pct` columns)
- `frontend/src/components/panels/SkillsRegistry.tsx` (extend — render badges based on backend-computed flags; never compute date diffs client-side)
- `frontend/src/components/panels/SkillCostCard.tsx` (extend — render % delta with `Intl.NumberFormat`)

**Confidence:** HIGH — the v1.0/v1.1 codebase has zero `date-fns`/`dayjs` usage; SQLite `datetime('now', '-N days')` is well-tested.

---

### 6. Compare-view Cmd+K "previous session" shortcut — CMPR-07

**Decision:** Extend existing `CommandPalette.tsx` with a new context-aware item. cmdk already supports the pattern. **Do not** add a new library.

**Rationale:**
- The existing palette (`frontend/src/components/ui/CommandPalette.tsx` lines 60-90) already branches its label/behaviour on `useRouterState({ select: (s) => s.location })`. CMPR-07 adds one more branch: when on `/sessions/compare?a=…&b=…` (both set), show "Compare with previous session" — selection navigates to the chronologically prior session for the same `cwd` (or globally, depending on UX call).
- Implementation: a new `useSessionsList` query variant with `before=<currentB.started_at>&cwd=<currentA.cwd>&limit=1` returns the prior session; selection calls `navigate({ search: prev => ({ ...prev, b: priorSid }) })` (function-form, same Pitfall-4 guard already documented in CommandPalette.tsx L107).
- cmdk's `Command.Item` accepts dynamic `onSelect` and conditional rendering; verified via Context7 `/dip/cmdk` (`useCommandState` + conditional sub-items pattern is documented).
- **Why not a new keyboard-shortcut library (`react-hotkeys-hook`, `tinykeys`):** The palette already owns the Cmd+K binding (CommandPalette.tsx L66-75). Adding a competing shortcut library risks double-handlers + the React 19 StrictMode double-invoke pitfall (already mitigated in current code).

**File paths:**
- `frontend/src/components/ui/CommandPalette.tsx` (extend — add new label branch + new `Command.Item`)
- `frontend/src/lib/queries.ts` (extend `useSessionsList` to accept `before` + `cwd` filters, OR add `usePreviousSession(currentSid)` helper hook)
- `backend/cmc/api/routes/sessions.py` (extend list route — add `before` and `cwd` query params; SQL is `WHERE started_at < :before AND cwd = :cwd ORDER BY started_at DESC LIMIT 1`)

**Confidence:** HIGH — read CommandPalette.tsx end-to-end; the extension point is obvious and idiomatic to the existing code.

---

### 7. Test flake fixes — `vi.useFakeTimers` + Playwright `data-testid`

**Decision:** No new libraries. Use vitest 4.1.5's existing `vi.useFakeTimers` + `vi.setSystemTime` + `vi.advanceTimersByTimeAsync`, and Playwright's `getByTestId` + strict-mode.

**Rationale (vitest fake-timer pattern):**
- TanStack Query's 30s polling uses `setInterval` under the hood. Tests that don't mock timers either (a) wait real-time (slow + flaky) or (b) miss the second poll (incorrect). Pattern:
  ```ts
  vi.useFakeTimers({ toFake: ['setInterval', 'setTimeout', 'Date'] })
  vi.setSystemTime(new Date('2026-05-05T12:00:00Z'))
  // mount component, fetch resolves
  await vi.advanceTimersByTimeAsync(30_000)  // triggers next poll
  // assert refetched data
  vi.useRealTimers()  // ALWAYS in afterEach
  ```
- The `advanceTimersByTimeAsync` flavour is critical (verified via Context7 `/vitest-dev/vitest`) — sync `advanceTimersByTime` skips microtasks, so `await fetch().then()` chains inside the polled callback never resolve and assertions race.
- Existing precedent: `frontend/src/components/ui/__tests__/RelativeTime.test.tsx` and `frontend/src/components/shell/__tests__/EmergencyStopBanner.test.tsx` already use `vi.useFakeTimers` — codify the pattern in a shared helper if more than 3 tests need it.

**Rationale (Playwright aria-label disambiguation):**
- v1.1 has multiple panels with similar aria-labels (e.g., "Open" buttons in TaskBoard + InboxCard). Playwright strict-mode (verified via `/microsoft/playwright`) throws on multi-match — the canonical fix is `data-testid` for elements that need test-stable selection without UX-impactful copy changes.
- Pattern: add `data-testid="task-row-open-{taskId}"` to ambiguous interactive controls; tests use `page.getByTestId('task-row-open-abc123')`. This is the recommendation in Playwright's own docs ("Use a testing-only attribute that is hidden from end users but visible to your tests").
- Playwright version 1.59.1 is already current — no upgrade needed.

**File paths:**
- `frontend/src/test/timer-helpers.ts` (new — optional shared helper if the pattern is repeated)
- `frontend/src/components/panels/__tests__/*.test.tsx` (extend — apply pattern to flaky tests, identified during phase research)
- Playwright fixes: add `data-testid` props in `frontend/src/components/panels/*.tsx` (TaskBoard, InboxCard, AlertEventsList) where strict-mode collisions occur; update specs in `frontend/tests/e2e/*.spec.ts`

**Confidence:** HIGH — both patterns are documented in their respective official docs (verified Context7 for both vitest and Playwright).

---

## Polish Lane: `datetime.utcnow()` → `datetime.now(UTC)`

**Scope:** 20 occurrences across 17 files (verified via grep on 2026-05-05).

**Migration pattern:**

```python
# Before (deprecated since Python 3.12, removed in some 3.14 alpha builds)
from datetime import datetime
created_at: datetime = Field(default_factory=datetime.utcnow)

# After (Python 3.13-clean, timezone-aware, matches UTCDatetime PlainSerializer)
from datetime import UTC, datetime
created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
```

**Files affected (verified):**
- `backend/cmc/pricing.py` (1 site — `loaded_at=datetime.utcnow()`)
- `backend/cmc/db/models/{activities, tasks, sessions, live_state, skills, notification_log, mcp_stats, alert_state, decisions, otel_metrics, token_usage, alert_rules, pricing, inbox, otel_events, schedules, system_state}.py` (one or two sites each, 19 total)

**Test impact:** All affected models have existing pytest coverage; the migration is mechanical. Run `ruff check --select UP` to auto-detect any sites missed by grep.

**Confidence:** HIGH — both Python's deprecation notice and Pydantic v2 docs (verified via Context7 `/pydantic/pydantic`) recommend `datetime.now(UTC)` as the replacement.

---

## What NOT to Add

| Avoid | Reason | Use Instead |
|-------|--------|-------------|
| numpy | ~70 MB wheel; not needed for stdlib OLS / EWMA / Welford | stdlib `math` + `Decimal` |
| scipy | Drags numpy + BLAS; `linregress` is 5 lines of stdlib | Pure-Python OLS in `cmc.analytics.forecast` |
| pandas | Result-set cardinality is tiny (<2K rows); SQL handles aggregation | SQL CTEs in `cmc.api.routes` |
| polars | Same as pandas; v1.0 is single-engine SQLite | SQL CTEs |
| duckdb | Splits the engine; no analytics workload justifies it | SQLite WAL (existing) |
| sklearn | Anomaly detection covered by EWMA + rolling-stddev; no ML needed | `cmc.alerts.detector` extension |
| statsmodels / Prophet / ARIMA / pmdarima | Forecast horizon is 30 days on stationary data; linear extrapolation is fit-for-purpose | `cmc.analytics.forecast` (stdlib OLS) |
| instructor | One-shot JSON-mode parse is already idiomatic in `skill_router.py` | New `cmc.dispatcher.alert_nl` mirroring skill_router |
| pydantic-ai | Agent-loop framework; v1.2 has no agent loops | Same — direct anthropic SDK + Pydantic validate |
| LangChain / LlamaIndex | Both — v1.2 has no chains, retrieval, or agentic flows | Direct anthropic SDK |
| date-fns / dayjs / luxon / arrow | Already absent from v1.0/v1.1 — re-introducing for badges contradicts the original ADR | SQL `datetime('now', '-7 days')` + `Intl.RelativeTimeFormat` |
| react-diff-viewer / diff (npm) | Compare-view is metric-side-by-side, not text-diff | Plain `<table>` rendering both sessions' KPIs |
| react-hotkeys-hook / tinykeys | cmdk already owns Cmd+K; competing handlers risk double-fire under React 19 StrictMode | Extend existing `CommandPalette.tsx` |
| zod / yup / valibot | Pydantic on the backend handles validation; frontend `validateSearch` is hand-written UUID regex (proven in v1.0) | Existing patterns |
| collections.deque (for ALRT-13) | EWMA state survives restart; deque would force re-seed every 120s | EWMA dict on `AlertState.params_json` (existing) |

---

## Stack Patterns by Variant

**If anomaly detection needs to track multi-modal distributions (e.g., bimodal latency):**
- Stay stdlib — but switch from EWMA to a sliding window of ≥30 samples with `statistics.median` + IQR. Still no new dep.
- v1.2 explicitly does NOT need this — the success criterion is "rolling mean ± stddev catches sustained anomalies" not "detect distribution shifts."

**If the NL alert grammar grows beyond 8 fields:**
- Switch from JSON-mode to Anthropic native tool use (`tools=[{name, input_schema}]`). The SDK supports this in 0.97; the schema becomes self-documenting and the model's hallucination rate drops.
- v1.2 grammar is 5-8 fields → JSON-mode is fine.

**If forecast accuracy complaints surface post-launch:**
- Add weekly seasonality via dummy variables (still stdlib OLS, just with `is_weekday` regressor). Skip ARIMA/Prophet — the value gap doesn't justify the complexity.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| pydantic 2.13.3 | sqlmodel 0.0.38 | Verified — already running in v1.1 |
| sqlmodel 0.0.38 | sqlalchemy 2.0.49 | Verified |
| anthropic 0.97.0 | python 3.13 | Verified — `claude-haiku-4-5` model alias supported |
| anthropic 0.99.0 (latest) | python 3.13 | Forward-compatible; bump deferred to polish |
| cmdk 1.1.1 | react 19.2.5 | Verified — already running |
| @tanstack/react-router 1.168.24 | react 19.2.5 | Verified |
| vitest 4.1.5 | happy-dom 20.9.0 | Verified — `useFakeTimers` works under happy-dom |
| Playwright 1.59.1 | node 25.x | Verified |

---

## Installation

**No new packages.** v1.2 ships against v1.1's frozen lockfile.

If a `datetime.utcnow()` cleanup PR also bumps anthropic 0.97 → 0.99 (optional, polish):

```bash
# Backend (uv)
cd backend && uv lock --upgrade-package anthropic

# Frontend (pnpm) — also optional
cd frontend && pnpm update @tanstack/react-router @tanstack/react-query
```

Neither bump is required for v1.2 functionality.

---

## Sources

- Context7 `/dip/cmdk` — verified `useCommandState` + conditional rendering pattern; HIGH confidence
- Context7 `/anthropics/anthropic-sdk-python` — verified JSON-mode + tool_use APIs; `claude-haiku-4-5` model alias support; HIGH confidence
- Context7 `/vitest-dev/vitest` — verified `vi.useFakeTimers` / `setSystemTime` / `advanceTimersByTimeAsync` semantics, including the unhandled-rejection pitfall; HIGH confidence
- Context7 `/microsoft/playwright` — verified strict-mode + `getByTestId` recommendation; HIGH confidence
- Context7 `/pydantic/pydantic` — verified `datetime.now(UTC)` migration guidance; HIGH confidence
- npm registry (`npm view`) — verified latest versions for cmdk (1.1.1), @tanstack/react-router (1.169.1), @tanstack/react-query (5.100.9), vitest (4.1.5), @playwright/test (1.59.1), recharts (3.8.1) on 2026-05-05; HIGH confidence
- PyPI (`pip index versions`) — verified anthropic (0.99.0 latest, 0.97.0 pinned), sqlalchemy (2.0.49 — matches), fastapi (0.136.1 — matches) on 2026-05-05; HIGH confidence
- PyPI JSON `pydantic` — verified pydantic 2.13.3 is latest (released 2026-04-20); HIGH confidence
- In-repo grep — verified 20 `datetime.utcnow()` deprecations across 17 files; verified `cmc/alerts/detector.py` is stdlib-only (277 LOC); verified `CommandPalette.tsx` + `ProjectBreakdownCard.tsx` already exist as extension points; HIGH confidence

---
*Stack research for: v1.2 Depth & Polish (subsequent milestone — extends v1.1)*
*Researched: 2026-05-05*
