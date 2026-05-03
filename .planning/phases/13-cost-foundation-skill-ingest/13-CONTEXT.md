# Phase 13: Cost Foundation & Skill Ingest - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend-only delivery of:
1. The cost-math primitive — `cmc/pricing.py::compute_cost(...) -> Decimal` with stdlib math, no float drift, sourced from `data/pricing.json`.
2. The `pricing` table with closed-open temporal intervals so historical totals self-correct as rates change.
3. Read-time cost APIs — `GET /api/cost/summary` and `GET /api/cost/breakdown` with consistent cache-tier accounting; no `$` ever stored in derived tables.
4. The single Alembic migration that adds `otel_events.attrs_skill_name` (indexed) + `alert_rules` + `alert_state` (final shape) + fixes BUG-B (`session.id` dotted ingest read) + fixes BUG-A (flat `json_extract` read) + backfills 6,392 historical rows.
5. Idempotent skill-event ingestion via `(session_id, otel_event_id)` UNIQUE on `otel_events`, with `INSERT OR IGNORE`.
6. `cmc doctor` warnings for pricing freshness, drift, unpriced tokens, session_id NULL count, and `OTEL_LOG_TOOL_DETAILS`.
7. Pricing seeded automatically on FastAPI lifespan startup from `data/pricing.json`.

**NOT in this phase (locked out):**
- All UI rendering (panels, captions, badges) — Phase 14 owns the UI.
- Skills aggregation endpoints (`/api/skills*`) — Phase 14.
- Alert detector / dispatcher hook / Telegram delivery / `/alerts` UI — Phase 15.
- Cost stamping at ingest time, `$` in DB, auto-fetch of pricing — locked out by REQUIREMENTS.md anti-features.

</domain>

<decisions>
## Implementation Decisions

### Pricing SKU model

- **5 rate rows in `data/pricing.json`** — verbatim enumeration of `claude-opus-4-7`, `claude-opus-4-7[1m]`, `claude-sonnet-4-6`, `claude-sonnet-4-6[1m]`, `claude-haiku-4-5`. The `[1m]` rows carry rates identical to their base counterparts at the 2026-05-03 freeze date. Honors ANLY-02's literal enumeration and survives a future Anthropic split of long-context pricing without schema change.
- **Lookup miss returns `Decimal(0)` and increments an `unpriced_tokens` counter** — endpoints never raise; doctor surfaces `unpriced_tokens > 0` per ANLY-05. Counter is per-`(model, token_kind)` (see doctor decision below) so unmapped rows are actionable.
- **Closed-open temporal intervals** — `pricing.effective_until IS NULL` denotes the currently-active row. New seed sets `effective_until = NOW` on superseded rows and inserts a new row with `effective_from = NOW, effective_until = NULL`. Cost engine selects `WHERE effective_from <= ts AND (effective_until IS NULL OR effective_until > ts)`.
- **Rates stored per million tokens, as `Decimal` strings** — `{"input": "15.00", "output": "75.00"}` mirrors Anthropic's pricing page wording ("$15 per MTok"). `compute_cost` divides token counts by 1_000_000. Easy to eyeball `pricing.json` against the upstream page during seed.

### Cache TTL split scope

- **JSONL parser change lands in Phase 13** (Claude's discretion confirmed by the explicit backfill choice). Migration adds `tokens_cache_create_5m` + `tokens_cache_create_1h` columns to whatever `cmc/ingest/jsonl_parser.py` currently writes; parser splits the JSONL `usage` block into both fields going forward.
- **Backfill rule for legacy rows: all aggregate `tokens_cache_create` lands in `tokens_cache_create_1h`, with `5m = 0`.** Pessimistic split — slight overestimate of legacy cache cost (1h tier is the more expensive of the two), keeps direction honest, no need to re-walk raw bodies.
- **Doctor `unpriced_tokens` counter is per-`(model, token_kind)`** — most actionable surface; `cmc doctor` lists each unmapped combo so the user knows exactly which pricing rows to seed.

### Migration scope (single Alembic file)

- **Adds `otel_events.attrs_skill_name`** — indexed column, mirrors `attrs_mcp_*` pattern.
- **Adds `tokens_cache_create_5m` + `tokens_cache_create_1h`** on whatever table the JSONL parser writes (planner to confirm: `api_request` per SPIKE.md LOCK-9).
- **Fixes BUG-B in the same migration**: `cmc/api/routes/ingest.py:103` reads `session.id` (dotted) instead of `session_id` (underscore); migration backfills the 6,392 production rows with NULL `session_id` by re-extracting from `otel_events.body`. Without this fix, new skill events also land NULL and Phase 14 panels can't JOIN. Critical-path obligation per researcher.
- **Fixes BUG-A in the same migration**: `cmc/api/routes/observability.py:535` flat `json_extract` returns NULL silently for 1,406 `tool_decision` rows. Bundle with BUG-B for symmetry — both are read-side bugs surfaced in SPIKE.md and both touch `otel_events`.
- **Adds final-shape `alert_rules` + `alert_state` tables** — every structural column from ALRT-01/02 (`rule_id`, `name`, `kind`, `metric`, `threshold_fire`, `threshold_clear`, `min_dwell_seconds`, `min_samples`, `cooldown_seconds`, `enabled`, `spec_version`, `params_json`) and the alert_state lifecycle columns. Phase 15 only adds business logic; **no migration in Phase 15**.
- **`(session_id, otel_event_id)` UNIQUE dedup key** — Claude's discretion: planner inspects production data during planning to either commit to `event.sequence` (per SPIKE.md Q13) or fall back to `(session_id, body_hash)`. Resolves O-2 in-plan, not in-discuss.

### Pricing seed + freshness UX

- **Auto-seed on FastAPI lifespan startup** — boot handler reads `data/pricing.json`, upserts new rows (closes old via `effective_until = NOW`). Idempotent: parsed-hash check skips no-op writes. No CLI in Phase 13 (deferred to a future phase if needed).
- **`cmc doctor` warnings, all of:**
  - Stale pricing rows (>30 days old per ANLY-05).
  - `unpriced_tokens > 0` per `(model, token_kind)` breakdown.
  - `data/pricing.json` on-disk hash differs from last-applied hash in DB.
  - Models in `otel_events.attrs_model` with no matching pricing row.
  - `otel_events.session_id` NULL count > 0 (regression detector for BUG-B fix).
  - `OTEL_LOG_TOOL_DETAILS` env var unset (lifted forward from POLI-01 since it's directly correctness-relevant for skill ingest).
- **"Rates as of" backend contract — both inline + dedicated endpoint:**
  - Every cost endpoint payload includes `"rates_as_of": "YYYY-MM-DD"` (max `effective_from` across rates touched).
  - Plus a `GET /api/pricing/freshness` endpoint for doctor / settings surfaces and Phase 14 mount-time fetch.
- **Range param accepted by `GET /api/cost/summary?range=` and `GET /api/cost/breakdown?range=`: `1d`, `7d`, `14d`, `30d`** literal values. Anything else returns 422.

### Claude's Discretion

- Exact parser-split implementation (test fixtures, error handling for malformed `usage` blocks).
- Migration runtime strategy (online vs offline; SQLite + Alembic batch operations) — planner inspects current Alembic patterns.
- Whether the `(session_id, otel_event_id)` UNIQUE uses `event.sequence` or `body_hash` — settled by 5-min production-data check during planning, not now.
- Pricing row `id` shape (composite of `model + effective_from`, surrogate, etc.).
- Doctor output formatting for the per-`(model, token_kind)` unpriced breakdown.
- Lifespan startup error handling when `data/pricing.json` is malformed.

</decisions>

<specifics>
## Specific Ideas

- **SPIKE.md is the upstream contract** — Phase 13 cites LOCK-1 (event name `claude_code.skill_activated`), LOCK-2 (`skill_name` attribute key), LOCK-4 (cache TTL split is JSONL-only at 2.1.116), LOCK-5 (`session.id` dotted), LOCK-9 (token attribution via JOIN to `api_request`), and BUG-A / BUG-B for migration scope.
- **Pricing freeze date: 2026-05-03** — researcher fetched live rates from `https://platform.claude.com/docs/en/about-claude/pricing` on this date. Use this date as `effective_from` for the seed.
- **Mirror existing `attrs_mcp_*` pattern** — the `otel_events.attrs_skill_name` column add, parsing logic, and indexing must match what's already in production for `attrs_mcp_server` / `attrs_mcp_tool`. No invention.
- **Anthropic doesn't actually charge separate API rates for `[1m]` long-context** as of 2026-05-03. Storing 5 rows with duplicated rates is intentional — preserves ANLY-02 enumeration, makes the duplication self-documenting, and is cheap to update if Anthropic ever splits.

</specifics>

<deferred>
## Deferred Ideas

- **`cmc seed pricing` CLI** — researcher recommended both auto + CLI; user picked auto-only. CLI is a future addition if seed conflicts arise. Capture as a v1.2 candidate.
- **Pre-migration cache-tier accuracy** — backfill puts all legacy aggregate cache-create tokens in the 1h tier. Cache-heavy workloads predating the parser change will read slightly high. Revisit if it becomes a complaint.
- **Per-project cost breakdown card** — already deferred to v1.2 (ANLY-07).
- **Monthly cost forecast** — already deferred to v1.2 (ANLY-06).

</deferred>

---

*Phase: 13-cost-foundation-skill-ingest*
*Context gathered: 2026-05-03*
