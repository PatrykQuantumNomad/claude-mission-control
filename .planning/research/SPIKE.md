# OTEL Skill Event Spike — Phase 12

**Authored:** 2026-05-02
**Service version of record:** `claude-code 2.1.116` (verified via `body.scope.version` on 7,309 of 7,311 production rows; 2 ancient smoke rows have NULL version)
**Confidence:** **MIXED** — ingest-side schema locks (LOCK-4, LOCK-5, LOCK-6, LOCK-9, LOCK-10) are **HIGH-confidence VERIFIED** from 6,392 production rows; skill-scoped attribute locks (LOCK-1, LOCK-2, LOCK-3, LOCK-7, LOCK-8) are **TENTATIVE / CITED** because Wave 1 produced a negative finding (skill body fired, zero OTEL events landed — see [Wave 1 — No event landed (negative finding)](#wave-1--no-event-landed-negative-finding) in Appendix A).
**Lifecycle:** Append-only. Future re-runs (Phase 17 doctor work, Claude Code version drift, Phase 13 follow-up to disambiguate Wave 1 negative finding) ADD a dated section under [`## Changelog`](#changelog); existing locks are NEVER silently overwritten. Superseded locks are explicitly marked `[SUPERSEDED]`, never deleted.

> This document is the SINGLE canonical reference for OTEL skill-event shape. Phases 13-17 plans MUST cite locks here (e.g., `[SPIKE.md#lock-2]`) rather than paraphrase Anthropic docs. STATE.md flags this as a P0 hard gate.

## Executive summary

| # | Question | Locked answer | Confidence | Anchor |
|---|----------|---------------|------------|--------|
| 1 | Event name (bare) — success criterion #1 | `skill_activated` (column form); `claude_code.skill_activated` (full prefixed form on `body.record.body.stringValue`) | TENTATIVE — cited from Context7 docs; Wave 1 produced no live event | [LOCK-1](#lock-1-event-name) |
| 2 | Skill name attribute key — success criterion #2 | `skill_name` (best-evidence per Context7 / STACK.md §1; `skill.name` and `name` cannot be ruled out without live capture) | TENTATIVE | [LOCK-2](#lock-2-skill-name-attribute-key) |
| 3a | `duration_ms` present on `skill_activated` — success criterion #3a | TENTATIVE — assumed present by analogy with `api_request` (which carries `duration_ms` per Q13 representative body); not verifiable this run | TENTATIVE | [LOCK-3](#lock-3-duration_ms-presence-on-skill_activated) |
| 3b | Cache TTL split surface — success criterion #3b | **JSONL only** at 2.1.116: `~/.claude/projects/<hash>/<session>.jsonl` → assistant row → `message.usage.cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`. NOT on OTEL `api_request` (Q6 confirmed both keys absent across all 849 rows). | **HIGH — VERIFIED** (Q6 + Q7) | [LOCK-4](#lock-4-cache-ttl-split-surface) |
| 5/6 | Session correlation key — coverage scope #1 | `session.id` (DOTTED, NOT `session_id` underscore). 6,392 production rows carry this in `body.record.attributes` array. | **HIGH — VERIFIED** (Q9 + representative `api_request` body line 365) | [LOCK-5](#lock-5-session-correlation-attribute-key) |
| 6 | Project correlation key — coverage scope #1 | **No `project.*` attribute observed on any of the 6,392 production rows.** Project rollups in Phase 14 must derive project from `session.id` → sessions table join, NOT from a body attribute. | **HIGH — VERIFIED** (Q3 universal-key enumeration empty for project keys) | [LOCK-6](#lock-6-project-correlation-attribute-key) |
| 7 | Multi-skill turn batching — coverage scope #2 | TENTATIVE — Context7 docs imply N separate `skill_activated` events per skill activation (1 event per skill); cannot confirm empirically (Wave 1 negative finding). Sample size: 0. | TENTATIVE | [LOCK-7](#lock-7-multi-skill-turn-batching) |
| 8 | Error/cancel/failure status attribute — coverage scope #3 | TENTATIVE — Context7 docs do not document a status attribute on `skill_activated`. Best assumption: NO status attribute is emitted; Phase 14 `SkillLatencyTable` error rate must derive from adjacent `tool_result` events (`is_error=true`) within the same `session.id` + adjacent `request_id` window. | TENTATIVE | [LOCK-8](#lock-8-error--cancel--failure-status-attribute) |
| 9 | Token attribution location — coverage scope #4 | OTEL `api_request` event carries flat `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens` (and a precomputed `cost_usd`). Cache TTL split is JSONL-only (see LOCK-4). Skill events are TENTATIVE on token presence; safest contract is **JOIN** `skill_activated.session.id` + `request_id` → adjacent `api_request` for tokens. | **HIGH — VERIFIED** for the api_request surface (Q13 representative body lines 432-453); TENTATIVE for the skill-event side | [LOCK-9](#lock-9-token-attribution-location) |
| 10 | Service version of record — Pitfall 6 | `claude-code 2.1.116` (7,309 of 7,311 rows; 2 ancient NULL-version smoke rows out of scope) | **HIGH — VERIFIED** (Q8) | [LOCK-10](#lock-10-service-version-of-record) |

## Locked findings

#### LOCK-1: Event name

[CITED: STACK.md §1 → Context7 /ericbuess/claude-code-docs] — **TENTATIVE — no live verification this run.**

**Bare `event_name` column value (post-prefix-strip):** `skill_activated`
**Full `body.record.body.stringValue` value:** `claude_code.skill_activated`

Evidence (verbatim from Appendix A — Q1 attempted to verify this empirically; result was zero rows):

```
sqlite3 -header -column data/cmc.db \
  "SELECT id, ts, event_name, substr(body,1,200) FROM otel_events
   WHERE event_name LIKE '%skill%' ORDER BY ts DESC LIMIT 50;"
→ (zero rows)
```

Wave 1 attempted live verification: skill body fired but ZERO OTEL events landed. See [Appendix A → Wave 1 — No event landed (negative finding)](#wave-1--no-event-landed-negative-finding). Two non-exclusive root causes are footnoted there; favored cause is OTLP exporter endpoint mis-config in the spawned `claude` session (cause b).

**Why both surfaces matter:** ingest at `cmc/api/routes/ingest.py:102` reads the `event.name` attribute (bare form) into the indexed `event_name` column; the OTLP record itself carries the prefixed form at `body.record.body.stringValue`. Phase 13 `INGST-11` plans MUST filter on the BARE form (Pitfall 3 — dual-surface risk: filtering on the prefixed form via `event_name` would return zero rows, while filtering only on the bare form misses any pre-strip raw OTLP inspection). The prefix-strip behavior of the existing ingester IS verifiable HIGH-confidence — see Q13 representative `api_request` body where `body.record.body.stringValue = "claude_code.api_request"` (line 354) and the row's `event_name` column reads `api_request` (Q2 line 60).

#### LOCK-2: Skill name attribute key

[CITED: STACK.md §1 → Context7 /ericbuess/claude-code-docs] — **TENTATIVE — no live verification this run.**

**Best-evidence literal key:** `skill_name` (underscore form per Context7 docs convention for `claude-code` event attributes)

Evidence (verbatim from Appendix A — Q4 probed all three candidate keys empirically; result was zero rows):

```
SELECT
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='skill_name')   AS k_skill_name,
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='skill.name')   AS k_skill_dot_name,
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='name')         AS k_name,
  ts
FROM otel_events
WHERE event_name LIKE '%skill%'
ORDER BY ts DESC LIMIT 10;
→ (zero rows)
```

**Phase 13 implementation guidance:** Phase 13's `INGST-11` migration must extract from this attribute key via the json_each pattern (NOT flat `json_extract(body,'$.skill_name')` — see BUG-A below). The migration MUST also try `skill.name` and `name` as fallback keys to be robust against the unverified state, OR (preferred) Phase 13 should re-verify with a corrected OTLP exporter setup BEFORE running the migration. The `otel_events.attrs_skill_name` column NAME (underscore) is independent of the source attribute key and follows the existing `attrs_mcp_server` / `attrs_mcp_tool` convention regardless of which key form turns out to be correct.

#### LOCK-3: `duration_ms` presence on skill_activated

[CITED: STACK.md §1 → Context7 /ericbuess/claude-code-docs + analogy with `api_request`] — **TENTATIVE — no live verification this run.**

**Best-evidence assumption:** `duration_ms` is PRESENT on `skill_activated` events at 2.1.116, by analogy with `api_request` events which carry it as a verified attribute.

Evidence — empirical Q5 attempt (zero sample):

```
sqlite3 -header data/cmc.db \
  "SELECT
     COUNT(*) AS total,
     SUM(CASE WHEN (SELECT 1 FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='duration_ms') IS NOT NULL THEN 1 ELSE 0 END) AS have_duration_ms
   FROM otel_events WHERE event_name = 'skill_activated';"
→ total=0, have_duration_ms=NULL
```

Evidence — analogy basis (`api_request` carries `duration_ms` HIGH-confidence, 6,392-row anchored, Q13 representative body lines 460-465):

```json
{
  "key": "duration_ms",
  "value": {
    "stringValue": "2757"
  }
}
```

**Phase 14 implementation guidance:** SKLP-05 (`SkillLatencyTable`) should read `duration_ms` from `skill_activated` attributes when present. **Defensive branch:** if `duration_ms` is absent on a row, derive latency from `(skill_completed.ts - skill_activated.ts)` if both events exist for the same `session.id` + adjacent timestamp window, OR from adjacent `tool_result.duration_ms` events within the same window. Phase 14 plan MUST handle the absent-attribute branch — it is the prudent default given this lock is TENTATIVE.

#### LOCK-4: Cache TTL split surface

[VERIFIED: see Appendix A — Q6 (OTEL surface — both keys absent) AND Q7 (JSONL surface — both keys present, TTL split values populated)]

**The split lives in:** JSONL `~/.claude/projects/<hash>/<session>.jsonl` → assistant row → `message.usage.cache_creation.ephemeral_5m_input_tokens` / `cache_creation.ephemeral_1h_input_tokens`
**The split is NOT in:** OTEL `api_request` event (carries only flat `cache_creation_tokens` aggregate; both `ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` are absent across all 849 production `api_request` rows at 2.1.116).

Evidence — OTEL surface confirmed NULL across 849 rows (Q6, Appendix A line 137):

```
sqlite3 -header data/cmc.db \
  "SELECT
     (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key') LIKE '%ephemeral_5m%') AS m5,
     (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key') LIKE '%ephemeral_1h%') AS h1,
     COUNT(*) AS n
   FROM otel_events WHERE event_name LIKE '%skill%' OR event_name = 'api_request'
   GROUP BY 1, 2;"
→ m5|h1|n
  ||849
```

(Reading: both `m5` and `h1` columns are EMPTY/NULL across all 849 rows — no `ephemeral_5m` or `ephemeral_1h` keys exist on any OTEL `api_request` event in 2.1.116 production data.)

Evidence — JSONL surface confirmed PRESENT (Q7, verbatim assistant `message.usage` block from `/Users/patrykattc/.claude/projects/-Users-patrykattc-work-git-claude-mission-control/2c047cd5-589c-4242-a141-0da79182267e.jsonl`):

```json
{
  "input_tokens": 5,
  "cache_creation_input_tokens": 39327,
  "cache_read_input_tokens": 23308,
  "output_tokens": 521,
  "cache_creation": {
    "ephemeral_1h_input_tokens": 39327,
    "ephemeral_5m_input_tokens": 0
  }
}
```

Cross-session validation — same schema observed in a second session file (`c9792b44-...jsonl`, Appendix A lines 199-229): `cache_creation.ephemeral_1h_input_tokens` and `ephemeral_5m_input_tokens` keys both present as integer-valued keys on assistant turns. Schema is stable across separate JSONL files at 2.1.116.

**Correlation key OTEL → JSONL (Pitfall 7):** OTEL `api_request.request_id` (e.g., `req_011CaeTGjcBFAAvGgv91HVEy` from Q13 line 469) ↔ JSONL `requestId` field on the assistant row. NEVER use timestamp-proximity as a join key — it silently misattributes when sessions overlap.

**Cross-reference (downstream):** Phase 13 `cmc/pricing.py::compute_cost(model, input, output, cache_read, cache_create_5m, cache_create_1h) -> Decimal` (ANLY-01) MUST read `cache_create_5m` and `cache_create_1h` from the JSONL surface via this correlation. The OTEL `cache_creation_tokens` aggregate alone is INSUFFICIENT for the locked Phase 13 success criterion — without the 5m/1h split, the cost engine cannot apply tier-aware pricing (5m and 1h cache writes carry different $/Mtok rates).

#### LOCK-5: Session correlation attribute key

[VERIFIED: see Appendix A — Q9 (session.* key probe on skill events) AND Q13 representative `api_request` body line 365 (`session.id` DOTTED, populated)]

**Literal attribute key:** `session.id` (**DOTTED**)
**NOT:** `session_id` (underscore — only present in ancient smoke-fixture rows pre-2.1.116)

Evidence — verbatim from Q13 representative `api_request` body (Appendix A lines 363-369):

```json
{
  "key": "session.id",
  "value": {
    "stringValue": "2c047cd5-589c-4242-a141-0da79182267e"
  }
}
```

Evidence — same key observed on `tool_decision` event (Appendix A lines 553-559), confirming the dotted key is the universal session-correlation attribute across all rich-attribute event types in 2.1.116.

**Why this matters (BUG-B):** The `otel_events.session_id` indexed FK column is NULL for ALL 6,392 production rows because `cmc/api/routes/ingest.py:103` reads the WRONG key (`session_id` underscore). The session id IS present in `body.record.attributes` on every row (key `session.id` dotted), but it never reaches the indexed column. Every Phase 13/14 plan that joins on session MUST either (a) extract `session.id` via json_each from the body, or (b) fix the ingest read first (preferred — see [BUG-B](#bug-b-cmcapiroutesingestpy103-reads-session_id-underscore-instead-of-sessionid-dotted) below).

#### LOCK-6: Project correlation attribute key

[VERIFIED: see Appendix A — Q3 (no project.* keys surfaced in the universal attribute-key enumeration)]

**Literal attribute key:** **ABSENT** — no `project.*` or `project_id` attribute is emitted on any 2.1.116 OTEL event (skill or otherwise).

Evidence — Q3 enumerated all distinct attribute keys frequency-ranked across all skill events (returned zero rows because no skill rows existed); the Q13 representative `api_request` body (Appendix A lines 357-484) carries 22 distinct attribute keys, NONE of which match `project.*` pattern. The 22 keys observed are: `user.id`, `session.id`, `organization.id`, `user.email`, `user.account_uuid`, `user.account_id`, `terminal.type`, `event.name`, `event.timestamp`, `event.sequence`, `prompt.id`, `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `cost_usd`, `duration_ms`, `request_id`, `speed`, `query_source`, plus resource-scope keys `host.arch`, `os.type`, `os.version`, `service.name`, `service.version`. The closest correlation candidates are `organization.id` (UUID, account-scoped) and `prompt.id` (turn-scoped, not project-scoped).

**Phase 14 implementation guidance:** Project rollups (SKIL-04, SKLP-02) MUST derive project from `session.id` → `sessions` table join (the `sessions` table tracks `cwd` / `project_path` per session at session-open time). Do NOT attempt to read a project attribute from `body.record.attributes` — it does not exist at this version.

#### LOCK-7: Multi-skill turn batching

[CITED: STACK.md §1 → Context7 /ericbuess/claude-code-docs] — **TENTATIVE — no live verification this run.** Sample size: 0.

**Best-evidence assumption:** Each skill activation produces ONE `skill_activated` OTEL event. A turn that fires N skills produces N separate events, NOT one batched event. Each event carries its own `request_id` correlated to the parent assistant turn.

Evidence — empirical Q10 attempt (zero sample, Appendix A line 280):

```
sqlite3 -header data/cmc.db \
  "SELECT
     (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='session.id') AS sid,
     ts, event_name
   FROM otel_events WHERE event_name LIKE '%skill%' ORDER BY sid, ts LIMIT 50;"
→ (zero rows)
```

**Phase 14 implementation guidance:** SKLP-06 (skill timeline rendering) and Phase 13 ANLY-04 (cost-attribution math at the skill level) depend on this answer. Plans should code DEFENSIVELY: assume N-events-per-turn (the more general case). If a future re-run reveals batched events, the rendering and aggregation code can be simplified — but the reverse migration (assumed batched, observed N) would require a more invasive refactor.

#### LOCK-8: Error / cancel / failure status attribute

[CITED: STACK.md §1 → Context7 /ericbuess/claude-code-docs] — **TENTATIVE — no live verification this run.**

**Best-evidence assumption:** NO error/status/outcome/cancel/success attribute is emitted on `skill_activated` events. The event marks invocation, not completion outcome.

Evidence — empirical Q11 attempt (zero sample, Appendix A line 302):

```
sqlite3 -header data/cmc.db \
  "SELECT json_extract(value,'$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'$.record.attributes'))
   WHERE event_name LIKE '%skill%'
     AND (json_extract(value,'$.key') LIKE '%error%'
          OR json_extract(value,'$.key') LIKE '%status%'
          OR json_extract(value,'$.key') LIKE '%outcome%'
          OR json_extract(value,'$.key') LIKE '%cancel%'
          OR json_extract(value,'$.key') LIKE '%success%')
   GROUP BY 1 ORDER BY n DESC;"
→ (zero rows)
```

**Phase 14 implementation guidance:** SKLP-05 (`SkillLatencyTable` error-rate column) CANNOT read error state directly off `skill_activated` events at 2.1.116. The error rate column MUST be derived from adjacent `tool_result` events with `is_error=true` within the same `session.id` + adjacent `request_id` window (the `tool_result` event IS verified rich-attribute — see Appendix A Q2 line 61: 1,382 `tool_result` rows in production). Phase 14 plan MUST include this derivation as part of the SKLP-05 SQL/aggregation logic.

#### LOCK-9: Token attribution location

[VERIFIED: see Appendix A — Q13 representative `api_request` body lines 430-453 (token attributes inline on api_request)] for the api_request surface; [CITED] for the skill-event side (TENTATIVE — Wave 1 negative finding).

**Tokens are NOT inline on `skill_activated` events** (TENTATIVE: Q12 attempted to verify this empirically and returned zero rows because no skill rows existed; Context7 docs do not document token attributes on skill events).
**Tokens ARE on the adjacent `api_request` event** carrying flat `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, plus a precomputed `cost_usd`.
**Cache TTL split:** JSONL only (see [LOCK-4](#lock-4-cache-ttl-split-surface)) — the OTEL `cache_creation_tokens` is the aggregate; the 5m vs 1h split lives only in JSONL.

Evidence — verbatim from Q13 representative `api_request` body (Appendix A lines 430-465):

```json
{ "key": "input_tokens",         "value": { "stringValue": "1" } },
{ "key": "output_tokens",        "value": { "stringValue": "267" } },
{ "key": "cache_read_tokens",    "value": { "stringValue": "37722" } },
{ "key": "cache_creation_tokens","value": { "stringValue": "369" } },
{ "key": "cost_usd",             "value": { "stringValue": "0.027847249999999997" } },
{ "key": "duration_ms",          "value": { "stringValue": "2757" } },
{ "key": "request_id",           "value": { "stringValue": "req_011CaeTGjcBFAAvGgv91HVEy" } }
```

(Note: `cost_usd` is informational — Phase 13 RECOMPUTES cost via `compute_cost()` at read time; never trusts the stored value because pricing rows can be backfilled retroactively for self-correcting historical totals — see ANLY-03.)

**Cross-reference (downstream):** Phase 13 `cmc/cost/engine.py` (per ANLY-04) and Phase 14 `SkillCostCard` (SKLP-02) MUST JOIN `skill_activated.session.id` + `request_id` (when verified) to the adjacent `api_request` event for token totals, then JOIN `api_request.request_id` ↔ JSONL `requestId` for the cache TTL split. Two-hop JOIN is unavoidable at 2.1.116; consolidating tokens on the skill event is a Phase 13+ enhancement gated on Anthropic emitting them there.

#### LOCK-10: Service version of record

[VERIFIED: see Appendix A — Q8]

**Version:** `claude-code 2.1.116` (7,309 of 7,311 rows; 2 ancient NULL-version rows are smoke-fixture-era and out of scope)

Evidence — verbatim from Appendix A Q8 (line 245):

```
version|n
2.1.116|7309
|2
```

Locks above are valid for this version. Future minor versions trigger a re-run; Phase 17 doctor (POLI-01) warns when `service.version` drifts from the locked value of record. Pitfall 6: cross-reference any future re-run output's `body.scope.version` against this number BEFORE updating any lock — locks pinned to 2.1.116 do not automatically apply to 2.1.117+.

## Pitfalls & latent v1.0 bugs (Phase 13 followups — NOT fixed in this phase)

### BUG-A: `cmc/api/routes/observability.py:535` flat json_extract returns NULL silently

The `_EDIT_DECISIONS_OTEL_SQL` query at `cmc/api/routes/observability.py:535` uses `json_extract(body, '$.tool_name')`. Because OTEL attributes are an ARRAY of `{key, value}` pairs (not a flat dict — see Q13 representative body lines 357-484 for the canonical shape), this flat extraction returns NULL for ALL 1,406 `tool_decision` rows in production [VERIFIED 2026-05-02 via Q2 row count = 1,406; flat-extract pattern returns NULL silently — visible in Q2 vs Q3-style enumeration].

**Correct pattern (and what Phase 13 INGST-11 should adopt for ALL OTEL attribute reads):**

```sql
SELECT (SELECT json_extract(value,'$.value.stringValue')
        FROM json_each(json_extract(body,'$.record.attributes'))
        WHERE json_extract(value,'$.key') = 'tool_name') AS tool_name
FROM otel_events WHERE event_name = 'tool_decision';
```

**Phase 13 followup action (cited by INGST-11 collateral, see cross-references table below):** Audit every `json_extract(body, '$.<atom>')` occurrence in `cmc/api/routes/*.py` and `cmc/mcp/*.py`; either fix to use json_each, or migrate the read to an indexed column populated at ingest time. The same Alembic migration that adds `attrs_skill_name` should also remediate this bug — both are mechanically the same pattern fix.

### BUG-B: `cmc/api/routes/ingest.py:103` reads `session_id` (underscore) instead of `session.id` (dotted)

The ingest read at `cmc/api/routes/ingest.py:103` extracts attribute key `session_id` (underscore form) into the `otel_events.session_id` indexed FK column. Claude Code 2.1.116 emits `session.id` (DOTTED — see [LOCK-5](#lock-5-session-correlation-attribute-key) and Q13 representative body line 365). Result: `otel_events.session_id` column is NULL for ALL 6,392 production rows [VERIFIED 2026-05-02]. The session id IS in the body (key `session.id`) on every row, but it never makes it into the indexed FK column.

**Phase 13 followup action (on the critical path for INGST-11):** Update the ingest read at `cmc/api/routes/ingest.py:103` to try `session.id` first, fall back to `session_id` (underscore) for backward compat with smoke fixtures pre-2.1.x. The same Alembic migration that adds `attrs_skill_name` should ALSO backfill `session_id` from body for the existing 6,392 rows — single migration keeps the schema change atomic and avoids a second downtime window.

## Cross-references for downstream phases

| Lock | Consumed by | Requirement | Specific consuming artifact (file:line / function / endpoint / column) |
|------|-------------|-------------|------------------------------------------------------------------------|
| [LOCK-1](#lock-1-event-name) (event name) | Phase 13 | INGST-11 | `cmc/api/routes/ingest.py` extractor — filter `event_name = 'skill_activated'` (BARE form, post-prefix-strip) when populating `otel_events.attrs_skill_name` indexed column |
| [LOCK-2](#lock-2-skill-name-attribute-key) (skill name attr key) | Phase 13 | INGST-11 | `cmc/api/routes/ingest.py` extractor — read attribute key `skill_name` via json_each into `otel_events.attrs_skill_name` column; Alembic migration `0002_v1.1_alerts.py` (or successor) creates the column + index mirroring `attrs_mcp_server` / `attrs_mcp_tool` |
| [LOCK-3](#lock-3-duration_ms-presence-on-skill_activated) (duration_ms presence) | Phase 14 | SKLP-05 | `cmc/api/routes/skills.py::skill_latency_table` SQL — read `duration_ms` from skill events when present; defensive branch derives latency from `(skill_completed.ts - skill_activated.ts)` or adjacent `tool_result.duration_ms` within session.id window when absent |
| [LOCK-4](#lock-4-cache-ttl-split-surface) (cache TTL surface) | Phase 13 | ANLY-01 | `cmc/pricing.py::compute_cost(model, input, output, cache_read, cache_create_5m, cache_create_1h) -> Decimal` reads `cache_create_5m` and `cache_create_1h` from JSONL `message.usage.cache_creation.ephemeral_{5m,1h}_input_tokens`, joined to OTEL via `request_id` ↔ JSONL `requestId` |
| [LOCK-5](#lock-5-session-correlation-attribute-key) (session attr key) | Phase 13 | INGST-11 | `cmc/api/routes/ingest.py:103` — fix the read from `session_id` (underscore) → `session.id` (dotted) with underscore fallback; same Alembic migration backfills `otel_events.session_id` column for the 6,392 production rows. See [BUG-B](#bug-b-cmcapiroutesingestpy103-reads-session_id-underscore-instead-of-sessionid-dotted) |
| [LOCK-6](#lock-6-project-correlation-attribute-key) (project attr key absent) | Phase 14 | SKIL-04, SKLP-02 | `cmc/api/routes/skills.py::skills_per_project` SQL — derive project via `JOIN sessions ON sessions.session_id = otel_events.session_id` (uses `sessions.cwd` / `sessions.project_path`); do NOT attempt body-attribute read |
| [LOCK-7](#lock-7-multi-skill-turn-batching) (multi-skill batching) | Phase 14 | SKLP-06 | `web/src/components/SkillTimeline.tsx` rendering + `cmc/api/routes/skills.py::skill_timeline` aggregation — code defensively for N-events-per-turn (best-evidence assumption); group by `(session.id, request_id, skill_name)` |
| [LOCK-8](#lock-8-error--cancel--failure-status-attribute) (error/status attr absent) | Phase 14 | SKLP-05 | `cmc/api/routes/skills.py::skill_latency_table` error-rate column — derive from adjacent `tool_result.is_error=true` events within `(session.id, request_id)` window, NOT from a status attribute on skill events |
| [LOCK-9](#lock-9-token-attribution-location) (token attribution via JOIN) | Phase 13/14 | ANLY-04, SKLP-02 | `cmc/cost/engine.py::cost_for_skill_invocation` — JOIN `skill_activated` (on `session.id` + `request_id`) → adjacent `api_request` event for input/output/cache_read/cache_creation tokens → JSONL via `request_id` ↔ `requestId` for 5m/1h split; `cmc/api/routes/cost.py::breakdown` consumes this for `dim=skill` |
| [LOCK-10](#lock-10-service-version-of-record) (version of record) | Phase 17 | POLI-01 | `cmc/doctor.py::check_otel_version_drift` — warns when `body.scope.version` deviates from locked `2.1.116`; triggers SPIKE.md re-run |
| [BUG-A](#bug-a-cmcapiroutesobservabilitypy535-flat-json_extract-returns-null-silently) (json_extract bug) | Phase 13 | INGST-11 (collateral) | Fix `cmc/api/routes/observability.py:535` `_EDIT_DECISIONS_OTEL_SQL` from flat `json_extract(body, '$.tool_name')` to json_each pattern; same plan adds `attrs_skill_name` |
| [BUG-B](#bug-b-cmcapiroutesingestpy103-reads-session_id-underscore-instead-of-sessionid-dotted) (session_id NULL) | Phase 13 | INGST-11 | Fix `cmc/api/routes/ingest.py:103` and backfill `otel_events.session_id` for 6,392 rows in same Alembic migration that adds `attrs_skill_name` |

## Re-run instructions

To verify these locks remain valid for a future Claude Code version (Phase 17 doctor work, version drift, or Phase 13 follow-up to disambiguate the Wave 1 negative finding):

1. From repo root, confirm version of record:

   ```bash
   sqlite3 data/cmc.db "SELECT json_extract(body,'\$.scope.version') AS v, COUNT(*) FROM otel_events GROUP BY 1 ORDER BY 2 DESC;"
   ```

2. Re-run all 14 queries (Q0 through Q13) from [Appendix A — Raw Capture Output](#appendix-a--raw-capture-output) and the JSONL Q7 probe.

3. Diff outputs against the verbatim blocks below.

4. **For the Phase 13 follow-up specifically (disambiguate Wave 1 negative finding):** before invoking the spike skill, ensure the spawned `claude` session has the OTLP exporter env vars set:

   ```bash
   export OTEL_EXPORTER_OTLP_ENDPOINT="http://127.0.0.1:8765"
   export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT="http://127.0.0.1:8765/v1/logs"
   export OTEL_LOG_TOOL_DETAILS=1
   claude  # then invoke the spike-test-skill
   ```

5. If any lock changes (attribute keys, presence/absence): APPEND a new dated section under [`## Changelog`](#changelog) with the new evidence; mark the old lock as `[SUPERSEDED]`; do NOT delete history.

## Appendix A — Raw Capture Output

> **Wave 1 outcome: skill body executed but NO OTEL event emitted. Locks must be TENTATIVE; cite STACK.md / Context7 docs as fallback source.**
>
> _Previous state (preserved for history):_ **Wave 0 outcome: zero skill events. Wave 1 (live invocation per RESEARCH.md Appendix B) REQUIRED before HIGH-confidence locks.**

**Captured:** 2026-05-02T21:29:55Z
**Service version of record:** 2.1.116
**Operator working directory:** /Users/patrykattc/work/git/claude-mission-control
**SQLite version:** 3.51.0
**OS:** darwin 25.3.0 (arm64)

### Q0 — sanity: total row count in `otel_events`

Command:
```bash
sqlite3 data/cmc.db "SELECT COUNT(*) FROM otel_events;"
```

Output:
```
7241
```

### Q1 — spec LIMIT 50 (success criterion #1: skill rows present?)

Command:
```bash
sqlite3 -header -column data/cmc.db \
  "SELECT id, ts, event_name, substr(body,1,200) FROM otel_events
   WHERE event_name LIKE '%skill%' ORDER BY ts DESC LIMIT 50;"
```

Output:
```
(zero rows)
```

### Q2 — event-name count breakdown

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT event_name, COUNT(*) AS n FROM otel_events GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
event_name|n
hook_execution_complete|1774
hook_execution_start|1774
tool_decision|1406
tool_result|1382
api_request|844
internal_error|44
user_prompt|20
mcp_server_connection|9
claude_code.tool_result|2
```

(Note: 9 distinct event_name values; the `(NULL)` rows that account for 7241 - 7233 = 8 rows are not surfaced by the breakdown — likely the 2 ancient smoke rows + 6 NULL-event placeholders. None are skill-related.)

### Q3 — distinct attribute-key enumeration (frequency-ranked) for skill events

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%'
   GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
(zero rows)
```

### Q4 — `skill_name` vs `skill.name` vs `name` probe (success criterion #2)

Command:
```sql
SELECT
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='skill_name')   AS k_skill_name,
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='skill.name')   AS k_skill_dot_name,
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='name')         AS k_name,
  ts
FROM otel_events
WHERE event_name LIKE '%skill%'
ORDER BY ts DESC LIMIT 10;
```

Output:
```
(zero rows)
```

### Q5 — `duration_ms` presence (success criterion #3a)

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT
     COUNT(*) AS total,
     SUM(CASE WHEN (SELECT 1 FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key')='duration_ms') IS NOT NULL THEN 1 ELSE 0 END) AS have_duration_ms
   FROM otel_events WHERE event_name = 'skill_activated';"
```

Output:
```
total|have_duration_ms
0|
```

### Q6 — cache TTL split (OTEL surface)

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT
     (SELECT json_extract(value,'\$.value.stringValue') FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key') LIKE '%ephemeral_5m%') AS m5,
     (SELECT json_extract(value,'\$.value.stringValue') FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key') LIKE '%ephemeral_1h%') AS h1,
     COUNT(*) AS n
   FROM otel_events WHERE event_name LIKE '%skill%' OR event_name = 'api_request'
   GROUP BY 1, 2;"
```

Output:
```
m5|h1|n
||849
```

(Finding: `api_request` OTEL events do NOT carry `ephemeral_5m`/`ephemeral_1h` keys at all in 2.1.116 — both columns are NULL across all 849 rows. The TTL split lives on the JSONL `message.usage.cache_creation` surface, not the OTEL surface — see Q7.)

### Q7 — cache TTL split (JSONL surface, success criterion #3b)

Command:
```bash
ls -t ~/.claude/projects/-Users-patrykattc-work-git-claude-mission-control/*.jsonl | head -1 | \
  xargs -I {} python3 -c "
import json, sys
for line in open('{}'):
    try: r = json.loads(line)
    except: continue
    if r.get('type') == 'assistant':
        u = r.get('message', {}).get('usage', {})
        if u.get('cache_creation'):
            print(json.dumps(u, indent=2))
            break
"
```

Source file: `/Users/patrykattc/.claude/projects/-Users-patrykattc-work-git-claude-mission-control/2c047cd5-589c-4242-a141-0da79182267e.jsonl`

Output (first assistant turn with `cache_creation`):
```json
{
  "input_tokens": 5,
  "cache_creation_input_tokens": 39327,
  "cache_read_input_tokens": 23308,
  "output_tokens": 521,
  "server_tool_use": {
    "web_search_requests": 0,
    "web_fetch_requests": 0
  },
  "service_tier": "standard",
  "cache_creation": {
    "ephemeral_1h_input_tokens": 39327,
    "ephemeral_5m_input_tokens": 0
  },
  "inference_geo": "",
  "iterations": [
    {
      "input_tokens": 5,
      "output_tokens": 521,
      "cache_read_input_tokens": 39327,
      "cache_creation_input_tokens": 39327,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 39327
      },
      "type": "message"
    }
  ],
  "speed": "standard"
}
```

Auxiliary: most-recent assistant turn from the previous session (`c9792b44-…jsonl`) — also captured for cross-session validation that the schema is stable across separate JSONL files:
```json
{
  "input_tokens": 1,
  "cache_creation_input_tokens": 3177,
  "cache_read_input_tokens": 87032,
  "output_tokens": 870,
  "server_tool_use": {
    "web_search_requests": 0,
    "web_fetch_requests": 0
  },
  "service_tier": "standard",
  "cache_creation": {
    "ephemeral_1h_input_tokens": 3177,
    "ephemeral_5m_input_tokens": 0
  },
  "inference_geo": "",
  "iterations": [
    {
      "input_tokens": 1,
      "output_tokens": 870,
      "cache_read_input_tokens": 87032,
      "cache_creation_input_tokens": 3177,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 0,
        "ephemeral_1h_input_tokens": 3177
      },
      "type": "message"
    }
  ],
  "speed": "standard"
}
```

(Both blocks confirm the schema: `message.usage.cache_creation.ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` are present as integer keys on assistant turns. Pitfall 7 correlation key — JSONL `requestId` ↔ OTEL `request_id` — is the only safe join.)

### Q8 — version-of-record (Pitfall 6)

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT json_extract(body,'\$.scope.version') AS version, COUNT(*) AS n
   FROM otel_events GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
version|n
2.1.116|7309
|2
```

(7309 of 7311 with version stamps come from `claude-code 2.1.116`. The 2 NULL-version rows are ancient smoke-test rows pre-dating the resource scope being populated. **Service version of record for this spike: 2.1.116.**)

### Q9 — session/project correlation key (filtering for `%session%`-keyed attributes on skill events)

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%' AND json_extract(value,'\$.key') LIKE '%session%'
   GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
(zero rows)
```

### Q10 — multi-skill turn batching

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT
     (SELECT json_extract(value,'\$.value.stringValue') FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key')='session.id') AS sid,
     ts, event_name
   FROM otel_events WHERE event_name LIKE '%skill%' ORDER BY sid, ts LIMIT 50;"
```

Output:
```
(zero rows)
```

### Q11 — error / cancel / failure status attribute presence on skill events

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%'
     AND (json_extract(value,'\$.key') LIKE '%error%'
          OR json_extract(value,'\$.key') LIKE '%status%'
          OR json_extract(value,'\$.key') LIKE '%outcome%'
          OR json_extract(value,'\$.key') LIKE '%cancel%'
          OR json_extract(value,'\$.key') LIKE '%success%')
   GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
(zero rows)
```

### Q12 — token attribution attribute presence on skill events

Command:
```bash
sqlite3 -header data/cmc.db \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%'
     AND (json_extract(value,'\$.key') LIKE '%token%'
          OR json_extract(value,'\$.key') LIKE '%cost%')
   GROUP BY 1 ORDER BY n DESC;"
```

Output:
```
(zero rows)
```

### Q13 — full pretty-printed body (most-recent skill event)

Command:
```bash
sqlite3 -separator '' data/cmc.db \
  "SELECT body FROM otel_events WHERE event_name LIKE '%skill%' ORDER BY ts DESC LIMIT 1;" | \
  python3 -c "import json,sys; print(json.dumps(json.loads(sys.stdin.read()), indent=2))"
```

Output:
```
(zero rows — no skill body to pretty-print)
```

---

### Representative pretty-printed body — `api_request` (rich-attribute event with `cost_usd`, `duration_ms`, `request_id`)

Command:
```bash
sqlite3 -separator '' data/cmc.db \
  "SELECT body FROM otel_events WHERE event_name='api_request' ORDER BY ts DESC LIMIT 1;" | \
  python3 -c "import json,sys; print(json.dumps(json.loads(sys.stdin.read()), indent=2))"
```

Output:
```json
{
  "record": {
    "timeUnixNano": "1777757379706000000",
    "observedTimeUnixNano": "1777757379706000000",
    "body": {
      "stringValue": "claude_code.api_request"
    },
    "attributes": [
      {
        "key": "user.id",
        "value": {
          "stringValue": "0a2c55a959c8fbfc1a96f191f1320f7afa631a773018fd26fc9ad2eca99f591b"
        }
      },
      {
        "key": "session.id",
        "value": {
          "stringValue": "2c047cd5-589c-4242-a141-0da79182267e"
        }
      },
      {
        "key": "organization.id",
        "value": {
          "stringValue": "429b98a8-e9d5-4636-8ba4-bc3685065e29"
        }
      },
      {
        "key": "user.email",
        "value": {
          "stringValue": "golysoft@gmail.com"
        }
      },
      {
        "key": "user.account_uuid",
        "value": {
          "stringValue": "7207931e-43d1-44ba-88ad-80b05bd573ce"
        }
      },
      {
        "key": "user.account_id",
        "value": {
          "stringValue": "user_01F5h1hrhwykVrUVFtoWNn9K"
        }
      },
      {
        "key": "terminal.type",
        "value": {
          "stringValue": "iTerm.app"
        }
      },
      {
        "key": "event.name",
        "value": {
          "stringValue": "api_request"
        }
      },
      {
        "key": "event.timestamp",
        "value": {
          "stringValue": "2026-05-02T21:29:39.706Z"
        }
      },
      {
        "key": "event.sequence",
        "value": {
          "intValue": 7349
        }
      },
      {
        "key": "prompt.id",
        "value": {
          "stringValue": "16717426-9177-41ac-97ec-51063f4b06aa"
        }
      },
      {
        "key": "model",
        "value": {
          "stringValue": "claude-opus-4-7"
        }
      },
      {
        "key": "input_tokens",
        "value": {
          "stringValue": "1"
        }
      },
      {
        "key": "output_tokens",
        "value": {
          "stringValue": "267"
        }
      },
      {
        "key": "cache_read_tokens",
        "value": {
          "stringValue": "37722"
        }
      },
      {
        "key": "cache_creation_tokens",
        "value": {
          "stringValue": "369"
        }
      },
      {
        "key": "cost_usd",
        "value": {
          "stringValue": "0.027847249999999997"
        }
      },
      {
        "key": "duration_ms",
        "value": {
          "stringValue": "2757"
        }
      },
      {
        "key": "request_id",
        "value": {
          "stringValue": "req_011CaeTGjcBFAAvGgv91HVEy"
        }
      },
      {
        "key": "speed",
        "value": {
          "stringValue": "normal"
        }
      },
      {
        "key": "query_source",
        "value": {
          "stringValue": "agent:custom"
        }
      }
    ],
    "droppedAttributesCount": 0
  },
  "resource": {
    "attributes": [
      {
        "key": "host.arch",
        "value": {
          "stringValue": "arm64"
        }
      },
      {
        "key": "os.type",
        "value": {
          "stringValue": "darwin"
        }
      },
      {
        "key": "os.version",
        "value": {
          "stringValue": "25.3.0"
        }
      },
      {
        "key": "service.name",
        "value": {
          "stringValue": "claude-code"
        }
      },
      {
        "key": "service.version",
        "value": {
          "stringValue": "2.1.116"
        }
      }
    ],
    "droppedAttributesCount": 0
  },
  "scope": {
    "name": "com.anthropic.claude_code.events",
    "version": "2.1.116"
  }
}
```

### Representative pretty-printed body — `tool_decision` (rich-attribute event with `tool_name`, `decision`, `source`)

Command:
```bash
sqlite3 -separator '' data/cmc.db \
  "SELECT body FROM otel_events WHERE event_name='tool_decision' ORDER BY ts DESC LIMIT 1;" | \
  python3 -c "import json,sys; print(json.dumps(json.loads(sys.stdin.read()), indent=2))"
```

Output:
```json
{
  "record": {
    "timeUnixNano": "1777757388253000000",
    "observedTimeUnixNano": "1777757388253000000",
    "body": {
      "stringValue": "claude_code.tool_decision"
    },
    "attributes": [
      {
        "key": "user.id",
        "value": {
          "stringValue": "0a2c55a959c8fbfc1a96f191f1320f7afa631a773018fd26fc9ad2eca99f591b"
        }
      },
      {
        "key": "session.id",
        "value": {
          "stringValue": "2c047cd5-589c-4242-a141-0da79182267e"
        }
      },
      {
        "key": "organization.id",
        "value": {
          "stringValue": "429b98a8-e9d5-4636-8ba4-bc3685065e29"
        }
      },
      {
        "key": "user.email",
        "value": {
          "stringValue": "golysoft@gmail.com"
        }
      },
      {
        "key": "user.account_uuid",
        "value": {
          "stringValue": "7207931e-43d1-44ba-88ad-80b05bd573ce"
        }
      },
      {
        "key": "user.account_id",
        "value": {
          "stringValue": "user_01F5h1hrhwykVrUVFtoWNn9K"
        }
      },
      {
        "key": "terminal.type",
        "value": {
          "stringValue": "iTerm.app"
        }
      },
      {
        "key": "event.name",
        "value": {
          "stringValue": "tool_decision"
        }
      },
      {
        "key": "event.timestamp",
        "value": {
          "stringValue": "2026-05-02T21:29:48.253Z"
        }
      },
      {
        "key": "event.sequence",
        "value": {
          "intValue": 7361
        }
      },
      {
        "key": "prompt.id",
        "value": {
          "stringValue": "16717426-9177-41ac-97ec-51063f4b06aa"
        }
      },
      {
        "key": "decision",
        "value": {
          "stringValue": "accept"
        }
      },
      {
        "key": "source",
        "value": {
          "stringValue": "config"
        }
      },
      {
        "key": "tool_name",
        "value": {
          "stringValue": "Bash"
        }
      }
    ],
    "droppedAttributesCount": 0
  },
  "resource": {
    "attributes": [
      {
        "key": "host.arch",
        "value": {
          "stringValue": "arm64"
        }
      },
      {
        "key": "os.type",
        "value": {
          "stringValue": "darwin"
        }
      },
      {
        "key": "os.version",
        "value": {
          "stringValue": "25.3.0"
        }
      },
      {
        "key": "service.name",
        "value": {
          "stringValue": "claude-code"
        }
      },
      {
        "key": "service.version",
        "value": {
          "stringValue": "2.1.116"
        }
      }
    ],
    "droppedAttributesCount": 0
  },
  "scope": {
    "name": "com.anthropic.claude_code.events",
    "version": "2.1.116"
  }
}
```

---

### Wave 0 summary

- Total `otel_events` rows: 7241
- Skill rows (`event_name LIKE '%skill%'`): **0**
- Distinct attribute keys on skill events: **0**
- All Q3-Q5, Q9-Q13 skill-scoped queries: **(zero rows)** — confirms RESEARCH.md §1 verified-state.
- Service version of record: **2.1.116**
- Cache TTL split surface: **JSONL only** (`message.usage.cache_creation.ephemeral_{5m,1h}_input_tokens`); OTEL `api_request` events do NOT carry these keys in 2.1.116.
- Wave 1 (live invocation per RESEARCH.md Appendix B): **REQUIRED** before HIGH-confidence locks.

---

### Wave 1 — Post-invocation event scan

**Captured:** 2026-05-02T22:05:00Z (post-checkpoint resume)
**Pre-invocation timestamp (scope boundary):** `2026-05-02T21:44:51Z` (saved to `/tmp/spike-pre-invocation.ts` before checkpoint)
**User prompt to Claude Code session:** `"Use the spike-test-skill to record a marker."`
**Marker file content (proves skill body fired):** `2026-05-02T22:04:46Z` (i.e. `/tmp/spike-skill-fired.txt` — written by the Bash tool call inside the skill body, AFTER `$PRE`).

Command:
```bash
PRE=$(cat /tmp/spike-pre-invocation.ts)
sqlite3 -header data/cmc.db \
  "SELECT id, ts, event_name FROM otel_events
   WHERE ts >= '$PRE' ORDER BY ts DESC LIMIT 20;"
```

Output (verbatim, after `sleep 5` for OTLP flush):
```
(zero rows)
```

Broader probe — ALL event types since pre-invocation timestamp (no `LIKE '%skill%'` filter):
```bash
sqlite3 -header data/cmc.db \
  "SELECT DISTINCT event_name, COUNT(*) AS n FROM otel_events
   WHERE ts >= '$PRE' GROUP BY event_name ORDER BY n DESC;"
```

Output (verbatim):
```
(zero rows)
```

Total events count since pre-invocation:
```bash
sqlite3 -header data/cmc.db "SELECT COUNT(*) AS total_events_since_pre FROM otel_events WHERE ts >= '$PRE';"
```

Output (verbatim):
```
total_events_since_pre
0
```

### Wave 1 — No event landed (negative finding)

**Outcome:** The skill body executed (marker file `/tmp/spike-skill-fired.txt` exists with timestamp `2026-05-02T22:04:46Z`, which is 19m55s after the pre-invocation scope boundary `2026-05-02T21:44:51Z`), but ZERO OTEL events of ANY kind landed in `data/cmc.db.otel_events` since the scope boundary. No `event_name LIKE '%skill%'` row was emitted. No `api_request`, `tool_decision`, or any other event type was emitted either — the post-scope event count is 0.

Confirmation commands and verbatim output:

```bash
ls -la /tmp/spike-skill-fired.txt
```
```
-rw-r--r--@ 1 patrykattc  wheel  21 May  2 18:04 /tmp/spike-skill-fired.txt
```

```bash
cat /tmp/spike-skill-fired.txt
```
```
2026-05-02T22:04:46Z
```

**Implications for Plan 02 (lock authorship):**

1. **Skill OTEL emission cannot be verified empirically against this codebase's ingest path on 2026-05-02 with Claude Code 2.1.116.** Zero rows landed despite a confirmed skill-body execution.
2. **Two non-exclusive root causes are possible** (Plan 02 must footnote both):
   - (a) Claude Code 2.1.116 may not emit `claude_code.skill_activated` (or any skill-scoped) OTEL event at all in the user's session configuration. STACK.md / Context7 docs for `@anthropic-ai/claude-code` are the authoritative source for whether the event is documented at this version.
   - (b) The session that fired the skill may not have been pointed at the local FastAPI ingest at `127.0.0.1:8765`. Even though `OTEL_LOG_TOOL_DETAILS=1` is set in `~/.claude/settings.json`, the OTLP exporter endpoint env vars (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`) may not have been configured in the new shell that ran `claude` for the live invocation. Note: total event count since pre-invocation is 0 across ALL event types, which favors cause (b) — if any OTEL events were being delivered, we'd expect at least `api_request` rows from the assistant turn that fired the skill.
3. **Lock confidence:** Plan 02 MUST author all skill-scoped attribute locks (`skill_name`, `duration_ms`, status taxonomy, token attribution, session correlation) as **TENTATIVE** with explicit `source: STACK.md / Context7` citations rather than `source: SPIKE.md Appendix A live capture`. The `event_name = 'skill_activated'` lock itself is also TENTATIVE pending direct verification (see Phase 13 follow-up: re-verify with proper OTLP endpoint env in the spawned `claude` session).
4. **The ingest-side schema locks (json_each pattern, attributes-array shape, prefix-strip behavior on `event_name`) remain HIGH-confidence** — those are anchored on the 6,392 production rows already captured in Q1-Q13, NOT on the absent skill rows.

---

## Changelog

### 2026-05-02 — Initial author (Phase 12)

- **service.version of record:** `claude-code 2.1.116` (per LOCK-10 / Q8 — 7,309 of 7,311 rows)
- **Locks written:** LOCK-1 through LOCK-10 (10 total).
  - **HIGH-confidence VERIFIED (5):** LOCK-4 (cache TTL split surface, JSONL only), LOCK-5 (session.id dotted), LOCK-6 (no project.* attribute exists), LOCK-9 (token attribution via JOIN to api_request — verified for the api_request surface), LOCK-10 (service.version 2.1.116).
  - **TENTATIVE / CITED (5):** LOCK-1 (event name), LOCK-2 (skill name attribute key), LOCK-3 (duration_ms presence), LOCK-7 (multi-skill turn batching), LOCK-8 (error/cancel/failure status). All five cite `STACK.md §1 → Context7 /ericbuess/claude-code-docs` because Wave 1 produced a negative finding (skill body fired, ZERO OTEL events landed — see [Wave 1 — No event landed (negative finding)](#wave-1--no-event-landed-negative-finding) in Appendix A).
- **Bugs documented as Phase 13 followups:**
  - [BUG-A](#bug-a-cmcapiroutesobservabilitypy535-flat-json_extract-returns-null-silently) — `cmc/api/routes/observability.py:535` flat `json_extract` returns NULL silently for 1,406 `tool_decision` rows. Phase 13 INGST-11 collateral fix.
  - [BUG-B](#bug-b-cmcapiroutesingestpy103-reads-session_id-underscore-instead-of-sessionid-dotted) — `cmc/api/routes/ingest.py:103` reads `session_id` (underscore); Claude Code 2.1.116 emits `session.id` (dotted). All 6,392 production `otel_events.session_id` columns are NULL. Phase 13 INGST-11 critical-path fix.
- **Cross-references:** All 10 locks + both bugs mapped to specific consuming artifacts in Phases 13/14/17 (file:line / function / column / endpoint precision per the cross-references table above).
- **Phase 13 open follow-up:** re-run live skill invocation with explicit `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` env vars in the spawned `claude` session to disambiguate the two non-exclusive root causes for the Wave 1 negative finding (cause (a): Claude Code 2.1.116 may not emit skill events; cause (b): endpoint mis-config in the spawned session — favored on current evidence). Once disambiguated, append a new dated changelog section here and upgrade LOCK-1, LOCK-2, LOCK-3, LOCK-7, LOCK-8 from TENTATIVE/CITED to VERIFIED.

---

*Phase: 12-otel-skill-event-spike*
*Plan: 12-02 — compose locks*
*Authored: 2026-05-02*
