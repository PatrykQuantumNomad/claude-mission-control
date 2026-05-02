# Phase 12: OTEL Skill Event Spike — Research

**Researched:** 2026-05-02
**Domain:** SQLite live-data inspection of `otel_events` (OTLP/HTTP JSON ingest), JSONL transcript `usage` block shape, documentation/research artifact authoring (no production code)
**Confidence:** HIGH on schema, ingest path, body shape, JSONL `usage` shape, and SQL access pattern (all verified by direct query against `data/cmc.db` and grep of source). HIGH on no-data status (zero skill rows confirmed by COUNT). MEDIUM on Anthropic-side event-name canon (last verified by `.planning/research/STACK.md` Context7 fetch on 2026-05-02 — but no live-data corroboration on this machine; the spike's whole point is to close that gap).

<user_constraints>
## User Constraints (from 12-CONTEXT.md)

### Locked Decisions

**Capture strategy**
- **Time window: all time.** Query the entire `otel_events` table — no date bound. Maximize sample at the cost of accepting that older Claude Code versions may have produced different shapes; if version drift is observed, document it.
- **Source, sample size, and no-data fallback: Claude's discretion** (see below).

**SQL query set**
- **Depth: full surface map.** The spike runs the spec-required queries (LIMIT 50 dump, skill_name attribute key check, duration_ms presence check, cache 5m/1h TTL split check) PLUS distinct attribute-key enumeration, event-name count breakdown, adjacent-event correlation (assistant message OTEL events around skill events), claude_code-version split (if attribute present), and error/cancel event queries. Goal: nothing left for Phase 13/14 plans to re-investigate.
- **Attribute-key extraction: both methods.** Programmatic enumeration via the JSON-keys query AND 2-3 pretty-printed representative bodies inline for readability. Programmatic enumeration goes in the appendix.
- **Cache 5m/1h TTL split: check both surfaces.** Look in `otel_events.body` (the OTEL skill_activated payload itself) AND in the JSONL transcript file's `usage` block (`~/.claude/projects/*/sessions/*.jsonl`). Document which surface actually carries the split — this directly feeds Phase 13 success criterion #1 (cache-tier-aware cost computation).
- **Output presentation: raw appendix + readable body.** SPIKE.md body shows pretty-printed JSON in fenced code blocks for readability. An appendix at the end carries the raw verbatim psql output for fidelity / forensic re-check. No reformatting in the appendix.

**Coverage scope (beyond named success criteria)**
The spike must verify all four of these in addition to the three explicit success-criteria checks (skill_name attribute key, duration_ms presence, cache TTL location):
- **Session/project correlation.** Confirm the literal attribute keys for session_id and project_id (or their equivalents) on skill_activated events. Phase 14 per-session and per-project rollups depend on these joins existing.
- **Multi-skill turns.** Document whether a single conversational turn that fires multiple skills produces N separate `skill_activated` events or one batched event. Affects Phase 14 timeline rendering and cost-attribution math.
- **Error / cancel / failure status.** Query for any outcome / status / error attribute on skill_activated events. Phase 14 `SkillLatencyTable` error-rate column needs a verified source.
- **Token attribution.** Verify whether token counts are inline on `skill_activated` events OR require joining to adjacent assistant-message OTEL events. Critical for Phase 13 cost engine and Phase 14 `SkillCostCard` math — locks whether cost can be computed from the skill event alone or needs cross-event JOINs.

**SPIKE.md structure**
All four sub-questions are Claude's discretion: top-level layout (decision-first vs linear narrative vs Q&A by success criterion), citation convention (LOCK-N IDs vs anchor headings vs both), provenance metadata depth, and post-Phase-12 lifecycle (one-shot vs re-runnable + appendable vs re-runnable + overwritten).

### Claude's Discretion

- **Capture strategy specifics.** Whether to mine the existing `otel_events` table, run a live dogfood session, or both — Claude picks based on what the table already contains.
- **Sample size threshold.** What counts as "enough" — Claude documents the actual N retrieved and stamps a confidence note.
- **No-data fallback.** If zero `skill_activated` rows exist, Claude judges between blocking with setup instructions, documenting the void with TENTATIVE locks, or triggering a live invocation in-flight.
- **SPIKE.md structure (all four sub-questions).** Layout style, citation IDs, provenance fields, lifecycle policy.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPIK-01 | User can confirm via `.planning/research/SPIKE.md` the literal `claude_code.skill_activated` event name + attribute key (`skill_name` vs `skill.name` vs `name`) + presence/absence of `duration_ms` + JSONL cache TTL split (5m vs 1h) — captured from real OTEL data via `SELECT event_name, body FROM otel_events WHERE event_name LIKE '%skill%' LIMIT 50`. Verbatim SQL output, not paraphrased. | §1 (DB access path), §2 (otel_events schema), §3 (JSONL shape), §4 (pretty-print tooling), §6 (no-data fallback playbook), §7 (pitfalls), Appendix A (canonical query set) |
</phase_requirements>

## Summary

Phase 12 is a documentation-only spike that produces ONE artifact: `.planning/research/SPIKE.md`. It consumes the existing `otel_events` table (SQLite, not Postgres — see §1) and the on-disk JSONL transcripts at `~/.claude/projects/*/<session-id>.jsonl`. **No code, no migrations, no dependencies are added.** The plan should structure the spike as one or two waves of read-only queries that capture verbatim output into a markdown file with `[VERIFIED:...]` / `[CITED:...]` / `[ASSUMED]` provenance tags (already the project's house style — see `.planning/phases/02-data-ingestion/02-RESEARCH.md`).

Three live-data findings dominate planning. **First, the table contains 6,392 rows but ZERO matching `event_name LIKE '%skill%'`** [VERIFIED: `sqlite3 data/cmc.db "SELECT COUNT(*) FROM otel_events WHERE event_name LIKE '%skill%';"` returned `0` on 2026-05-02]. Existing event names are `hook_execution_complete` (1557), `hook_execution_start` (1557), `tool_decision` (1251), `tool_result` (1227), `api_request` (727), `internal_error` (42), `user_prompt` (20), `mcp_server_connection` (9), `claude_code.tool_result` (2 — ancient smoke-test rows). **The user has no skills directory** — neither `~/.claude/skills/` nor `<repo>/.claude/skills/` exists [VERIFIED: Glob returned 0 entries]. So the spike has a guaranteed no-data path and must explicitly handle it; the planner must include a "create a real skill, invoke it, then re-query" task before the lock can be claimed HIGH-confidence.

**Second, the OTEL ingest stores body as `{"record": {…OTLP record…}, "resource": {…}, "scope": {…}}`** [VERIFIED: `cmc/api/routes/ingest.py:121` plus direct `SELECT body FROM otel_events LIMIT 1`]. Inside `record.attributes` the OTLP attributes are an array of `{"key":"…","value":{"stringValue":"…"}}` objects — NOT a flat `{key:value}` dict. The pre-existing `_EDIT_DECISIONS_OTEL_SQL` at `cmc/api/routes/observability.py:533-543` uses `json_extract(body, '$.tool_name')` which silently returns NULL for all 1,251 tool_decision rows [VERIFIED: query returned `|1286` (NULL/count)]. **This is a latent v1.0 bug** the planner should at minimum surface in pitfalls and recommend Phase 13 fix as a secondary deliverable. The correct SQLite extraction pattern for OTLP attribute arrays uses `json_each` over `record.attributes` filtered by `$.key` (see §4 below). The spike SQL set must use this pattern, not the broken flat-extraction pattern.

**Third, the JSONL `usage` block carries the cache TTL split, but the OTEL `api_request` event does not.** [VERIFIED: `usage.cache_creation.ephemeral_5m_input_tokens` and `usage.cache_creation.ephemeral_1h_input_tokens` found in `~/.claude/projects/-Users-patrykattc-work-git-claude-mission-control/18a23689-…jsonl`; the OTEL `api_request` event for the same `request_id` carries only flat `cache_creation_tokens` (50527) with no 5m/1h breakdown.] The OTEL `api_request` event already includes `cost_usd` (e.g. `"0.32559375"`) computed client-side by Claude Code itself — useful prior art for Phase 13 even though that phase intends to recompute cost server-side.

**Primary recommendation:** Plan a 2-wave structure. **Wave 0** (read-only mining) runs the spec-required queries against the live SQLite DB, captures verbatim output, and discovers the zero-skill-events condition. **Wave 1** (live-invocation fallback) creates a minimal SKILL.md, prompts a Claude Code session to use it, re-runs the queries, and writes the SPIKE.md with HIGH-confidence locks. Both waves write into the same SPIKE.md (additive — Wave 0 produces "what's there today", Wave 1 produces "what skill_activated literally looks like"). Use anchor headings (`#### LOCK-1: Event name`) so Phases 13-17 can cite stable URIs (`SPIKE.md#lock-1`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live SQLite query against `otel_events` | Database / Storage (data/cmc.db, read-only) | API / Backend (existing `cmc.db` package — only used to confirm path; queries run via `sqlite3` CLI, not Python) | One-off forensic queries; no app code touched |
| JSONL transcript inspection | Filesystem (`~/.claude/projects/<hash>/<session>.jsonl`) | — | User-owned files outside the repo; read-only |
| Live skill invocation (no-data fallback) | External process (Claude Code itself running against `/v1/logs` ingest) | API / Backend (passive — `/v1/logs` already accepts and persists everything) | The user must drive a real session; the spike author cannot synthesize the event |
| SPIKE.md authoring | Documentation (`.planning/research/SPIKE.md`) | — | Plain markdown; no toolchain |

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist at the repo root [VERIFIED: Read tool returned File does not exist]. Operative project-level constraints come from STATE.md / PROJECT.md / `.planning/research/PITFALLS.md`. Of these, only the following apply to a docs-only spike:
- **No paraphrase from Anthropic docs allowed in lock decisions** [CITED: STATE.md L51 / PITFALLS.md Pitfall 1]. Every locked attribute key MUST trace to a query result block in SPIKE.md.
- **macOS-only platform; JSONL paths are `~/.claude/projects/<project-hash>/<session-id>.jsonl`** [CITED: PROJECT.md].
- **OTEL_LOG_TOOL_DETAILS=1 is the user-side env precondition** [CITED: STATE.md, `cmc/cli/setup_otel.py:34`]. **Verified on this machine**: `~/.claude/settings.json` already contains all six OTEL keys including `OTEL_LOG_TOOL_DETAILS=1` [VERIFIED: 2026-05-02]. So a no-data finding is NOT due to missing env vars.

## Standard Stack

### Core (already on disk — nothing new to install)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `sqlite3` CLI | 3.51.0 (2025-06-12, system) | One-off SQL queries against `data/cmc.db` | Repo's canonical access path for ad-hoc queries — `sqlite+aiosqlite:///data/cmc.db` [VERIFIED: `cmc/db/engine.py:38`]. WAL mode means concurrent reads are safe even while the FastAPI server holds the file. |
| SQLite `json_extract` + `json_each` | bundled with sqlite3 ≥3.38 | Walk OTLP attribute arrays inside `body` JSON | Already used in production code — see `cmc/mcp/aggregator.py:48-59` and `cmc/api/routes/observability.py:535-541`. |
| `jq` | 1.8.1 (system) | Pretty-print JSON output from SQLite | Available on PATH. Lighter than installing a new tool. Optional — `json_pretty` (no `b`) and `.mode line` work without it. |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `python -c 'import json; …'` | Python 3.13 (uv) | Pretty-print one body row | When `jq` not desired or input has embedded escape characters that confuse `jq -R`. |
| Claude Code itself | 2.1.116 [VERIFIED: `service.version` attribute in current `otel_events`] | Generate a real `skill_activated` event for the no-data path | Wave 1 of the spike — see §6. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sqlite3` CLI | `python -m cmc.db.engine` REPL | More setup, but lets you reuse existing async session machinery. Overkill for forensic reads. |
| `jq` | `python3 -c 'import json,sys; print(json.dumps(json.loads(sys.stdin.read()), indent=2))'` | Equivalent. Use whichever is on PATH. |
| Mining live data | Synthesizing a fixture event into `otel_events` directly via INSERT | Rejected — defeats the spike's whole purpose: VERIFY shape from real Claude Code, not from our own assumptions. The whole STATE.md hard gate (no paraphrase from Anthropic docs) is violated by self-inserted fixtures. |

**Installation:** Nothing to install. Verify presence:
```bash
sqlite3 --version  # expect ≥3.38 for json1
jq --version       # optional (1.5+)
```

**Version verification (already done):** `sqlite3 3.51.0` [VERIFIED: `sqlite3 --version` on 2026-05-02], `jq 1.8.1` [VERIFIED: `jq --version` on 2026-05-02]. Both pinned to system. No PyPI/npm deps to verify.

## Architecture Patterns

### System Architecture Diagram

```
                            ┌──────────────────────────────────────┐
                            │  USER (the planner / spike author)   │
                            └───────────────┬──────────────────────┘
                                            │
                  ┌─────────────────────────┴───────────────────────┐
                  │                                                 │
        ┌─────────▼──────────┐                       ┌──────────────▼──────────────┐
        │  WAVE 0: MINE      │                       │  WAVE 1: LIVE INVOCATION    │
        │  (read-only)       │                       │  (fallback, conditional)    │
        │                    │                       │                             │
        │  sqlite3 data/    │                       │  1. Author SKILL.md         │
        │   cmc.db <SQL>     │                       │     in ~/.claude/skills/    │
        │                    │                       │  2. Open Claude Code        │
        │  ~/.claude/        │                       │  3. Prompt to invoke skill  │
        │   projects/.../   │                       │  4. Wait for /v1/logs to    │
        │   *.jsonl  (read) │                       │     persist event           │
        │                    │                       │  5. Re-run Wave 0 queries   │
        └─────────┬──────────┘                       └──────────────┬──────────────┘
                  │                                                 │
                  │       both waves append to the same file        │
                  │                                                 │
                  └────────────────────────┬────────────────────────┘
                                           │
                              ┌────────────▼────────────┐
                              │  .planning/research/    │
                              │       SPIKE.md          │
                              │  (LOCK-N anchor IDs)    │
                              └────────────┬────────────┘
                                           │
                       cited verbatim by ↓ (5 downstream phases)
                                           │
                           ┌───────────┬───┴───┬───────────┬───────────┐
                       Phase 13   Phase 14  Phase 15   Phase 16   Phase 17
                       (cost +    (skills    (alerts   (compare)  (doctor)
                        ingest)    panels)   on skill
                                              metrics)
```

### Recommended Project Structure

The spike artifact lives at a fixed path (locked by ROADMAP.md success criterion #1):
```
.planning/
├── research/
│   └── SPIKE.md                    # NEW (the only file this phase creates)
└── phases/
    └── 12-otel-skill-event-spike/
        ├── 12-CONTEXT.md           # ALREADY EXISTS
        └── 12-RESEARCH.md          # this file
```

**No code paths touched.** Spike commands run as ad-hoc shell — they should NOT be checked in as scripts (no scripts/, no backend/scripts/). If the planner wants reproducibility, embed the commands inline in SPIKE.md as fenced code blocks; that doubles as documentation and re-runnability.

### Pattern 1: SQLite OTLP attribute extraction (the pattern v1.0 got wrong)

**What:** Walk the `record.attributes` array via `json_each`, filter by `$.key`, then read the typed value off `$.value.stringValue` / `$.value.intValue`.
**When to use:** Every time you read an OTLP attribute out of `otel_events.body`. Always.

**Example:**
```sql
-- Source: derived from cmc/mcp/aggregator.py:48 + direct verification
-- Verified working with sqlite3 3.51.0 against data/cmc.db (2026-05-02)
SELECT
  (SELECT json_extract(value, '$.value.stringValue')
   FROM json_each(json_extract(body, '$.record.attributes'))
   WHERE json_extract(value, '$.key') = 'tool_name')                AS tool_name,
  (SELECT json_extract(value, '$.value.stringValue')
   FROM json_each(json_extract(body, '$.record.attributes'))
   WHERE json_extract(value, '$.key') = 'session.id')                AS session_id,
  (SELECT json_extract(value, '$.value.stringValue')
   FROM json_each(json_extract(body, '$.record.attributes'))
   WHERE json_extract(value, '$.key') = 'duration_ms')               AS duration_ms,
  COUNT(*)                                                           AS n
FROM otel_events
WHERE event_name = 'tool_decision'
GROUP BY 1, 2, 3
ORDER BY n DESC
LIMIT 5;
-- Output (live, 2026-05-02):
-- Read|18a23689-80e7-458d-9fbc-4db6a035c8b6||617
-- Bash|18a23689-80e7-458d-9fbc-4db6a035c8b6||482
-- Grep|18a23689-80e7-458d-9fbc-4db6a035c8b6||62
```

### Pattern 2: Pretty-printed body for the SPIKE.md body

**What:** Pull a single body row, format with Python's stdlib JSON pretty-printer.
**When to use:** Inline representative bodies in the SPIKE.md narrative (the readable-body-then-raw-appendix locked decision).

**Example:**
```bash
sqlite3 -separator '' data/cmc.db \
  "SELECT body FROM otel_events WHERE event_name = 'tool_result' LIMIT 1;" \
  | python3 -c 'import json, sys; print(json.dumps(json.loads(sys.stdin.read()), indent=2))'
```

**Why not `jq`:** Equivalent for this use case. Pick one and stick to it across the document. Recommendation: `python3 -c '...'` since it's already a project dependency (uv-managed) and works without an external pretty-printer install.

### Pattern 3: Programmatic attribute-key enumeration (frequency-ranked)

**What:** List every attribute key that appears across all matching events, ranked by frequency.
**When to use:** Locked by CONTEXT.md "both methods" decision. Goes in the appendix.

**Example:**
```sql
-- Verified working with sqlite3 3.51.0 (2026-05-02)
-- IMPORTANT: SQLite has NO `jsonb_object_keys` (Postgres-only). Use json_each instead.
SELECT
  json_extract(value, '$.key') AS attr_key,
  COUNT(*)                     AS n
FROM otel_events,
     json_each(json_extract(body, '$.record.attributes'))
WHERE event_name LIKE '%skill%'   -- replace with confirmed event_name once known
GROUP BY 1
ORDER BY n DESC;
```

**Note:** The CONTEXT.md SQL example uses `jsonb_object_keys` which is **Postgres-only**. The repo is SQLite. The planner MUST translate the CONTEXT.md SQL into the SQLite equivalent above before writing it into SPIKE.md or the spike will produce no output.

### Anti-Patterns to Avoid

- **`json_extract(body, '$.tool_name')`** — silently returns NULL because attributes are an array, not a dict. The `_EDIT_DECISIONS_OTEL_SQL` in `observability.py:533` is buggy this way; do not propagate the pattern. (See Pitfall 2 below.)
- **Postgres `jsonb_*` functions** in any spike query (`jsonb_pretty`, `jsonb_object_keys`, `jsonb_each`). The DB is SQLite. Translate to `json_*` + `json_each`.
- **`SELECT … LIMIT 50` with no `ORDER BY`** — returns rows in indeterminate order. For a verbatim-output spike, prefer `ORDER BY ts DESC LIMIT 50` so re-runs are deterministic.
- **Treating CONTEXT.md "psql output" literally** — the user wrote "psql" but means "sqlite3 CLI". The data store is SQLite. SPIKE.md should call this out so future readers don't grep for a Postgres deployment that doesn't exist.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pretty-printing JSON in SPIKE.md | A custom Python script that loads + recurses | `python3 -c 'import json,sys; print(json.dumps(json.loads(sys.stdin.read()), indent=2))'` | One-liner; stdlib only; no maintenance burden. |
| Walking OTLP attribute arrays | A regex against the JSON text | SQLite `json_each` + `$.key` filter (Pattern 1) | Regex breaks on nested `{}`; `json_each` handles arbitrary depth. Repo already uses this idiom. |
| Programmatic key enumeration | Loading every body in Python and `set()`ing keys | SQL `GROUP BY` over `json_each` (Pattern 3) | Faster, fewer LOC, runs in the spike command itself. |
| Diff'ing two attribute key sets across version drift | Hand-rolled set diff in markdown | One SQL with `json_extract(body, '$.scope.version')` as a `GROUP BY` axis | Already proven by §2 finding (only one version present today). Re-runnable as new versions ship. |
| Live skill invocation orchestration | A fixture-injection script that POSTs synthetic OTLP to `/v1/logs` | Real Claude Code session (Wave 1) | STATE.md P0 hard gate forbids paraphrase; synthetic fixtures are paraphrase. |

**Key insight:** This phase is forensic — the right tool is `sqlite3 + python3 -c '...'` plus a markdown editor. Any "real script" added to the repo for this is over-engineering and almost certainly violates the no-code constraint.

## Runtime State Inventory

> Phase 12 produces ONE new file (`SPIKE.md`) and changes nothing else. No rename, no migration, no string replacement. This section is included for completeness; nothing to track.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — the spike reads `otel_events` and JSONL transcripts read-only. | None |
| Live service config | None — no service config touched. | None |
| OS-registered state | None — no launchd / pm2 / cron. | None |
| Secrets/env vars | `OTEL_LOG_TOOL_DETAILS=1` is a precondition (already set on this machine — VERIFIED). The spike does not modify any env. | None — note in SPIKE.md as a precondition, not as a change. |
| Build artifacts / installed packages | None — no installs, no builds. | None |

**Nothing-found explicit:** This is an additive markdown-only phase. Nothing in the repo or on the OS changes state. Verified by reviewing CONTEXT.md ("This is a documentation/research-only spike — produces ONE file: `.planning/research/SPIKE.md`. No code, no migrations, no UI.").

## Common Pitfalls

### Pitfall 1: Treating CONTEXT.md "psql" literally
**What goes wrong:** Planner writes `psql -d otel ...` commands into the plan. They fail; spike stalls.
**Why it happens:** CONTEXT.md uses the word "psql" as shorthand for "command-line SQL", but the project's data store is SQLite (`sqlite+aiosqlite:///data/cmc.db` [VERIFIED: `cmc/db/engine.py:38`]). 6,392 rows of `otel_events` live in `data/cmc.db` [VERIFIED: `sqlite3 data/cmc.db "SELECT COUNT(*) FROM otel_events;"`].
**How to avoid:** SPIKE.md should explicitly state at the top "Data store: SQLite at `data/cmc.db`. All commands below use `sqlite3 data/cmc.db`, not `psql`. Postgres-style `jsonb_*` functions do not exist; use `json_*` + `json_each`." Plan tasks should always say `sqlite3` not `psql`.
**Warning signs:** Any task action containing `psql`, `\d`, `\dt`, `\df`, `jsonb_pretty`, `jsonb_object_keys`, `jsonb_each`, `::jsonb`, or `SET search_path`.

### Pitfall 2: Flat `json_extract(body, '$.attr_name')` returns NULL silently
**What goes wrong:** Spike writes `SELECT json_extract(body, '$.skill_name') FROM otel_events ...` and "verifies" the attribute is absent — but it's actually present, just nested two levels deeper.
**Why it happens:** OTEL ingest stores body as `{record: {attributes: [{key, value}, ...]}, resource: ..., scope: ...}` [VERIFIED: `cmc/api/routes/ingest.py:121` plus `SELECT body FROM otel_events LIMIT 1`]. Attributes are an array of `{key, value}` objects, not a flat dict. **The pre-existing `_EDIT_DECISIONS_OTEL_SQL` at `cmc/api/routes/observability.py:535` is broken this way and silently returns NULL for all 1,251 `tool_decision` rows** [VERIFIED: `SELECT json_extract(body, '$.tool_name'), COUNT(*) FROM otel_events WHERE event_name = 'tool_decision' GROUP BY 1` returns `|1286` (NULL/count)].
**How to avoid:** Always use the json_each pattern from Pattern 1 above. The spike should include a "what NOT to do" example showing the broken pattern returning NULL, paired with the correct pattern returning the value. Phase 13's plan should also fix the `observability.py:535` bug as a secondary deliverable; flag it in SPIKE.md cross-references.
**Warning signs:** Any spike SQL that does `json_extract(body, '$.<atom>')` for an attribute name (other than top-level keys `record`, `resource`, `scope`).

### Pitfall 3: `event_name` column has the prefix stripped
**What goes wrong:** Spike searches `WHERE event_name = 'claude_code.skill_activated'` and finds zero rows even though the events are actually flowing.
**Why it happens:** The ingest at `cmc/api/routes/ingest.py:102` reads `event_name` from the **`event.name` attribute** which Claude Code sets to the bare name (`tool_result`, `skill_activated`, etc.), NOT from the OTLP record's `body.stringValue` (which carries `claude_code.tool_result`, `claude_code.skill_activated`, etc.). [VERIFIED: `SELECT json_extract(body, '$.record.body.stringValue'), event_name, COUNT(*) FROM otel_events GROUP BY 1, 2` shows `claude_code.tool_result|tool_result|1241` etc.] So `event_name` column is `tool_result`, not `claude_code.tool_result`.
**How to avoid:** Spike WHERE clauses must filter on the bare name: `event_name = 'skill_activated'` OR `event_name LIKE '%skill%'`. CONTEXT.md's example query uses `LIKE '%skill%'` which is correct. But Phase 13's eventual `attrs_skill_name` ingest column should be wired off the bare-name filter, and SPIKE.md must lock this so Phase 13 doesn't write `WHERE event_name = 'claude_code.skill_activated'`. **Lock both surfaces in SPIKE.md**: the bare `event_name` value AND the full `record.body.stringValue` value, plus the `event.name` attribute value (likely identical to the bare event_name).
**Warning signs:** Plans that filter `WHERE event_name = 'claude_code.skill_activated'` (with prefix). Phase 13's INGST-11 success criterion mentions `'claude_code.skill_activated'` in shorthand — Phase 13 plan must verify against SPIKE.md whether it strips the prefix.

### Pitfall 4: `session_id` column is NULL for ALL real events (latent v1.0 ingest bug)
**What goes wrong:** Spike attempts `SELECT … FROM otel_events JOIN sessions ON otel_events.session_id = sessions.session_id WHERE event_name LIKE '%skill%'` and gets zero rows even when both tables are populated, because the FK column is NULL.
**Why it happens:** Ingest at `cmc/api/routes/ingest.py:103` reads `session_id` from the attribute key **`session_id`** (underscore). But Claude Code 2.1.116 actually emits **`session.id`** (dotted) [VERIFIED: `SELECT json_extract(body, '$.record.attributes') FROM otel_events WHERE event_name = 'tool_result' LIMIT 1` shows `{"key":"session.id","value":{"stringValue":"18a23689-80e7-458d-9fbc-4db6a035c8b6"}}`]. **Result: 0 of 6,392 rows have session_id populated** in the column [VERIFIED: `SELECT COUNT(*) FROM otel_events WHERE session_id IS NOT NULL` returns 0]. **All 6,478 rows have `session.id` in the body attributes** [VERIFIED: same body-LIKE check returned 6,478]. This is a v1.0 bug that Phase 13/14 plans MUST account for: per-session skill rollups via the indexed FK column will return zero. Either Phase 13 fixes the ingest bug, or Phase 14 reads session id out of the JSON body.
**How to avoid:** SPIKE.md should explicitly enumerate the literal session-correlation key as one of the locked findings (`LOCK-N: Session correlation = body attribute key 'session.id' (dotted), NOT 'session_id' (underscore). The ingest column is currently NULL for all production rows due to v1.0 reading the wrong key.`). Phase 13 plan must include "fix `cmc/api/routes/ingest.py:103` to read `session.id` first, falling back to `session_id` for backward compat with smoke fixtures" as a task.
**Warning signs:** Any plan that joins on `otel_events.session_id` without first verifying the column is non-null.

### Pitfall 5: No skill events exist; assuming the table proves absence
**What goes wrong:** Spike concludes "Claude Code does not emit skill_activated events" because the LIMIT 50 query returned zero rows.
**Why it happens:** The user has zero skills installed [VERIFIED: Glob `~/.claude/skills/*` and `<repo>/.claude/skills/*` both empty]. Skills can't activate if they don't exist. Zero rows in `otel_events WHERE event_name LIKE '%skill%'` proves NOTHING about whether Claude Code emits the event — only that this user hasn't invoked one.
**How to avoid:** SPIKE.md must distinguish "we observed the event with shape X" (HIGH-confidence lock) from "we observed no events" (LOW-confidence — does not lock anything). The plan must include Wave 1 (live invocation) as a conditional: "if Wave 0 returns zero rows, Wave 1 is required before locks can claim HIGH confidence." See §6 for the playbook.
**Warning signs:** SPIKE.md drafts that say "skill_activated does not exist" or "the event is not emitted" without showing a real skill invocation that produced no event. The only honest no-event lock requires actively trying to fire the event and watching ingest miss it.

### Pitfall 6: Version drift across a multi-month sample
**What goes wrong:** Spike samples `otel_events` from 2025-04-25 to 2026-05-02 and locks one shape, but Claude Code's event surface has changed across versions; some attributes appear in some versions only.
**Why it happens:** Anthropic's OTEL surface evolves between Claude Code releases. The spike's "all time" decision means the sample spans many versions.
**How to avoid:** Run a `GROUP BY scope.version` query and document version distribution. If the version axis is single-valued today (which it is — `2.1.116|6459` and `<null>|2 [smoke]` [VERIFIED: 2026-05-02]), state that explicitly: "All 6,459 production rows are from `claude-code 2.1.116`; spike locks are valid for 2.1.116. Re-run when minor versions ship." Phase 17 doctor can warn when `service.version` drifts from the spike-recorded version.
**Warning signs:** SPIKE.md locks asserted as "current always" without a version-of-record stamped on each lock.

### Pitfall 7: JSONL `usage` block belongs to a different turn than the OTEL event
**What goes wrong:** Spike correlates a JSONL `usage` block to a `skill_activated` OTEL event by timestamp proximity and gets the wrong turn's tokens.
**Why it happens:** A single JSONL session can contain dozens of assistant turns each with its own `usage` block. The OTEL `api_request` event has a `request_id` (`req_011CaeDNYmM8khosYcF2jkq7` was visible in the live data); the JSONL `requestId` field ties to the same value [VERIFIED: same request_id observed in both `otel_events.body` and the JSONL row from session `18a23689-…`]. So the correct correlation key is `request_id` (OTEL) → `requestId` (JSONL) → matching assistant turn → its `message.usage` block, NOT timestamp-proximity.
**How to avoid:** SPIKE.md should explicitly state the correlation chain: `OTEL skill_activated.session.id` + `OTEL api_request.request_id` (next adjacent api_request event in same session) → JSONL `requestId` → `message.usage.cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`. Phase 13 cost engine reads token counts from the OTEL `api_request` event for non-TTL-split fields and from JSONL for the TTL split (only surface that carries it).
**Warning signs:** Plans that say "join on timestamp" or "find the closest assistant message". Use `request_id` / `requestId`.

## Code Examples

Verified patterns from live queries against `data/cmc.db` and source-grep on 2026-05-02.

### Example 1: Spec-required LIMIT 50 dump (the success-criterion #1 query)

```bash
# Source: ROADMAP.md SC#1 verbatim (translated for SQLite)
# Empty result on 2026-05-02 — see §6 no-data fallback.
sqlite3 -header -column data/cmc.db <<'SQL'
SELECT id, ts, event_name, substr(body, 1, 200) || '...' AS body_preview
FROM otel_events
WHERE event_name LIKE '%skill%'
ORDER BY ts DESC
LIMIT 50;
SQL
```

### Example 2: Distinct attribute-key enumeration (frequency-ranked)

```bash
# Source: CONTEXT.md "Attribute-key extraction: both methods" (translated for SQLite)
sqlite3 -header data/cmc.db <<'SQL'
SELECT json_extract(value, '$.key') AS attr_key, COUNT(*) AS n
FROM otel_events,
     json_each(json_extract(body, '$.record.attributes'))
WHERE event_name LIKE '%skill%'
GROUP BY 1
ORDER BY n DESC;
SQL
```

### Example 3: skill_name attribute key check (single-value extraction)

```bash
# Probes all three candidate keys at once. The non-NULL column wins.
sqlite3 -header data/cmc.db <<'SQL'
SELECT
  (SELECT json_extract(value, '$.value.stringValue')
   FROM json_each(json_extract(body, '$.record.attributes'))
   WHERE json_extract(value, '$.key') = 'skill_name')   AS k_skill_name,
  (SELECT json_extract(value, '$.value.stringValue')
   FROM json_each(json_extract(body, '$.record.attributes'))
   WHERE json_extract(value, '$.key') = 'skill.name')   AS k_skill_dot_name,
  (SELECT json_extract(value, '$.value.stringValue')
   FROM json_each(json_extract(body, '$.record.attributes'))
   WHERE json_extract(value, '$.key') = 'name')         AS k_name,
  ts
FROM otel_events
WHERE event_name LIKE '%skill%'
ORDER BY ts DESC
LIMIT 10;
SQL
```

### Example 4: duration_ms presence check

```bash
sqlite3 -header data/cmc.db <<'SQL'
SELECT
  COUNT(*)                                             AS total,
  SUM(CASE WHEN (SELECT 1 FROM json_each(json_extract(body, '$.record.attributes'))
                 WHERE json_extract(value, '$.key') = 'duration_ms') IS NOT NULL
           THEN 1 ELSE 0 END)                          AS have_duration_ms
FROM otel_events
WHERE event_name = 'skill_activated';
SQL
```

### Example 5: Cache TTL split — OTEL api_request side (does NOT carry split)

```bash
# Verified 2026-05-02: api_request has cache_creation_tokens flat, no 5m/1h breakdown.
sqlite3 -header data/cmc.db <<'SQL'
SELECT
  (SELECT json_extract(value, '$.value.stringValue')
   FROM json_each(json_extract(body, '$.record.attributes'))
   WHERE json_extract(value, '$.key') = 'cache_creation_tokens')              AS cache_creation_tokens,
  (SELECT json_extract(value, '$.value.stringValue')
   FROM json_each(json_extract(body, '$.record.attributes'))
   WHERE json_extract(value, '$.key') LIKE '%ephemeral_5m%')                  AS ephemeral_5m,
  (SELECT json_extract(value, '$.value.stringValue')
   FROM json_each(json_extract(body, '$.record.attributes'))
   WHERE json_extract(value, '$.key') LIKE '%ephemeral_1h%')                  AS ephemeral_1h,
  COUNT(*) AS n
FROM otel_events
WHERE event_name = 'api_request'
GROUP BY 1, 2, 3;
-- Output 2026-05-02: ephemeral_5m and ephemeral_1h are always NULL on api_request.
SQL
```

### Example 6: Cache TTL split — JSONL side (DOES carry split)

```bash
# Source: ~/.claude/projects/<hash>/<session>.jsonl assistant message.usage block.
# Find any session with a recent assistant message:
ls -lt ~/.claude/projects/-Users-patrykattc-work-git-claude-mission-control/*.jsonl | head -1

# Then extract one usage block (note: jq path needs escaping for shell; using python instead):
python3 - <<'PY'
import json, pathlib, sys
p = max(pathlib.Path("/Users/patrykattc/.claude/projects/-Users-patrykattc-work-git-claude-mission-control").glob("*.jsonl"), key=lambda x: x.stat().st_mtime)
for line in p.open():
    try:
        row = json.loads(line)
    except Exception:
        continue
    if row.get("type") == "assistant":
        usage = row.get("message", {}).get("usage")
        if usage and usage.get("cache_creation"):
            print(json.dumps(usage, indent=2))
            break
PY
# Output 2026-05-02 (verbatim sample):
# {
#   "input_tokens": 5,
#   "cache_creation_input_tokens": 50527,
#   "cache_read_input_tokens": 0,
#   "output_tokens": 391,
#   "service_tier": "standard",
#   "cache_creation": {
#     "ephemeral_1h_input_tokens": 50527,
#     "ephemeral_5m_input_tokens": 0
#   },
#   ...
# }
```

### Example 7: Version-drift split (locks the version-of-record)

```bash
sqlite3 -header data/cmc.db <<'SQL'
SELECT json_extract(body, '$.scope.version') AS version, COUNT(*) AS n
FROM otel_events GROUP BY 1 ORDER BY n DESC;
-- Output 2026-05-02:  2.1.116|6459   (null)|2
SQL
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-event flat JSON in `body` (assumed by `observability.py:535`) | Nested OTLP record `{record: {attributes: [...]}, resource, scope}` | Phase 2 ingest (2026-04-26) | All flat `json_extract(body, '$.x')` calls return NULL. Spike must use `json_each` pattern. |
| `claude_code.skill_invoked` (PROJECT.md placeholder) | `claude_code.skill_activated` (per Anthropic docs and `.planning/research/SUMMARY.md` Context7 fetch) | v1.0 → v1.1 research phase (2026-05-02) | Spike must lock `_activated` and confirm prefix-stripping behavior. |
| Postgres queries (CONTEXT.md "psql") | SQLite (`sqlite+aiosqlite:///data/cmc.db`) | v1.0 (always was SQLite) | Spike SQL must use SQLite functions (`json_each`, `json_extract`), not Postgres (`jsonb_*`). |
| `session_id` underscore attribute (smoke-fixture era) | `session.id` dotted attribute (Claude Code 2.1.116) | Some Claude Code release between 2025-04-25 smoke fixtures and 2025-04-25+ production | Spike must lock `session.id` as the actual key. Phase 13 must fix `cmc/api/routes/ingest.py:103`. |

**Deprecated/outdated:**
- The `claude_code.skill_invoked` event name in PROJECT.md / placeholder UI text [CITED: `frontend/src/components/panels/SkillCostCard.tsx:31`, `TopSkills.tsx:5`]. Replace with `claude_code.skill_activated` once verified in SPIKE.md, propagated via Phase 14.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Claude Code 2.1.116 emits `skill_activated` (or `claude_code.skill_activated`) when a SKILL.md skill is auto-invoked or explicitly summoned. | §6 (no-data fallback playbook) | If false, the entire v1.1 milestone needs replan — see PITFALLS.md Pitfall 1. SPIKE.md must record the negative result honestly. The spike author should NOT assume; the whole point of Wave 1 is to verify. |
| A2 | The spike author (or user) can author a minimal SKILL.md and trigger Claude Code to invoke it within Phase 12's time budget. | §6 (no-data fallback playbook) | If false (e.g., skill auto-invocation requires specific phrasing the author doesn't know), Wave 1 stalls. Mitigation: the SPIKE.md should also document the alternative — paste a verbatim Anthropic-docs example (CITED, not VERIFIED) as a TENTATIVE lock, with explicit confidence downgrade. |
| A3 | The user accepts a TENTATIVE lock if Wave 1 fails. | SPIKE.md structure | If user rejects TENTATIVE locks, Phase 12 blocks Phase 13 indefinitely. Mitigation: have the planner explicitly raise this with the user before authoring tasks. |
| A4 | The body shape (`{record, resource, scope}`) and ingest behavior (event_name = `event.name` attribute) won't change before Phase 13 lands. | §1, §2 | Low risk — `cmc/api/routes/ingest.py` would have to change. Phase 13 plan should not modify the body envelope; only add a generated/indexed column on top. |
| A5 | `service.version` will be the only version axis until Phase 17. | Pitfall 6 | Low risk — Claude Code 2.1.116 → 2.1.117 might ship attribute changes. Spike re-run cadence should be one-time for v1.1; future versions trigger spike re-runs (which is why locks are stamped with version-of-record). |

## Open Questions

1. **Does Claude Code 2.1.116 emit `skill_activated` events at all?**
   - What we know: `.planning/research/STACK.md` claims it does, sourced from `Context7 /ericbuess/claude-code-docs/monitoring-usage.md` (HIGH confidence per that research). v1.0 deferred ACTV-04/SKLP-02 specifically because the event wasn't seen in production at v1.0 ship time (`PROJECT.md:87`).
   - What's unclear: Whether the event lands in *this* user's `otel_events` when a skill is invoked. The user has no skills installed today; we have no live evidence.
   - Recommendation: Wave 1 of the spike installs a one-shot SKILL.md, drives a Claude Code session that summons it, and watches ingest. If the event lands → HIGH confidence lock. If it doesn't land within 60s of invocation → record as TENTATIVE with `[CITED: STACK.md → Context7]` provenance and surface as a v1.1 risk.

2. **Does CONTEXT.md want `LOCK-N` IDs or anchor headings or both?**
   - What we know: CONTEXT.md says "All Claude's discretion." Project history (`grep -c "LOCK-"` across all RESEARCH.md and research/*.md) returned 0 — LOCK-N is not in use anywhere.
   - What's unclear: Whether the user prefers introducing LOCK-N IDs as a new convention or sticking to anchor-heading citations like the rest of the planning docs.
   - Recommendation: Adopt **both**: anchor headings (`#### LOCK-1: Event name`) AND in-text bracket tags (`[LOCK-1]`). The anchor heading creates a stable URI fragment (`SPIKE.md#lock-1`) for cross-document citation; the bracket tag inside paragraphs makes references readable without leaving the prose. This is a one-document cost and gives downstream phases (13-17) a stable handle.

3. **Lifecycle: one-shot vs append-only vs overwriteable?**
   - What we know: CONTEXT.md punts to Claude. ROADMAP.md says SPIKE.md is the single source of truth cited by 5 downstream phases — so it must remain stable.
   - Recommendation: **Append-only with a Changelog block at the bottom.** Phase 12 writes the initial set of locks. Phase 17 (doctor) re-runs the queries on a future Claude Code version and appends a delta block to the Changelog. Locks are never silently overwritten — version drift produces a new dated section, and old locks are explicitly marked superseded. This preserves the verbatim-output fidelity the P0 hard gate requires.

4. **Does Phase 13's `attrs_skill_name` column name need renaming if the literal attribute key turns out to be `skill.name` (dotted)?**
   - What we know: Phase 13 success criterion #4 names `otel_events.attrs_skill_name`. The existing `attrs_mcp_*` columns use underscore.
   - What's unclear: If the spike confirms `skill.name` (dotted) as the literal attribute key, does the column name still use underscore (matching `attrs_mcp_*` convention) or dot (matching the literal key)?
   - Recommendation: SPIKE.md does NOT decide column names — that's Phase 13's call. SPIKE.md ONLY documents the literal attribute key as observed. Phase 13 plan can reasonably keep `attrs_skill_name` (column) reading from the `skill.name` (attribute) source. SPIKE.md should explicitly call out this decoupling so Phase 13 doesn't get confused.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `sqlite3` CLI | All Wave 0 / Wave 1 spike queries | ✓ | 3.51.0 (2025-06-12) [VERIFIED: `sqlite3 --version`] | None needed |
| `python3` | Pretty-print JSON output, JSONL field extraction | ✓ | 3.13 (uv-managed) | `jq` (also available) |
| `jq` | Optional pretty-print | ✓ | 1.8.1 | Use `python3 -c '...'` instead |
| `data/cmc.db` (SQLite file) | Read `otel_events` table | ✓ | WAL mode active (`-wal`, `-shm` files present) | None — file exists at `/Users/patrykattc/work/git/claude-mission-control/data/cmc.db`, 6,392 rows in `otel_events` |
| JSONL transcripts at `~/.claude/projects/<hash>/*.jsonl` | Cache TTL split lookup | ✓ | Multiple sessions present, recent file `18a23689-…jsonl` (2026-05-02 14:57) | None — files persist; safest to copy one to a tmp location to avoid concurrent-access edge cases |
| Claude Code CLI | Wave 1 fallback (live skill invocation) | ✓ (assumed — user has session running, this very conversation is one) | 2.1.116 | None — fallback IS the fallback |
| `OTEL_LOG_TOOL_DETAILS=1` env var | Plugin / marketplace attributes on skill_activated | ✓ | Set in `~/.claude/settings.json` env block | If unset, spike runs but plugin/marketplace fields will be missing — flag as `[ENV-CONDITIONAL]` lock |
| FastAPI server running on `127.0.0.1:8765` | Wave 1 — Claude Code OTLP exporter posts to `/v1/logs` | UNKNOWN at spike time | — | Plan task: "Verify `make dev-backend` is running before Wave 1; if not, start it; otherwise events are silently dropped" |
| User-authored SKILL.md | Wave 1 — needs an installable skill to invoke | ✗ | — | Spike author writes a 5-line trivial SKILL.md as part of Wave 1 setup |

**Missing dependencies with no fallback:**
- None for Wave 0 (all read-only access works today).

**Missing dependencies with fallback:**
- SKILL.md (none exist) — Wave 1 creates one as a setup step. Trivial: a single skill that just writes a note to a file is enough to fire `skill_activated`.
- Running FastAPI server — must verify before Wave 1; documented as a precondition check in the plan.

## Validation Architecture

> Phase 12 produces a markdown file. Validation is **manual review** plus a **machine-checkable invariant** (the doc parses as well-formed markdown and contains all 7+ required LOCK headings).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Manual + lightweight grep assertions (no pytest/vitest) |
| Config file | None |
| Quick run command | `grep -c '^#### LOCK-' .planning/research/SPIKE.md` (should be ≥7) |
| Full suite command | Manual review by user against ROADMAP.md success criteria |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SPIK-01 | SPIKE.md exists at `.planning/research/SPIKE.md` | smoke | `test -f .planning/research/SPIKE.md` | ❌ Wave 0 |
| SPIK-01 | Contains verbatim SQL output (not paraphrased) | manual + smoke | `grep -q '^```' .planning/research/SPIKE.md && grep -q 'sqlite3 data/cmc.db' .planning/research/SPIKE.md` | ❌ Wave 0 |
| SPIK-01 | Locks the literal skill_name attribute key | manual | reviewer reads § "LOCK-2: skill name attribute key" | ❌ Wave 0 |
| SPIK-01 | Locks duration_ms presence | manual | reviewer reads § "LOCK-3: duration_ms" | ❌ Wave 0 |
| SPIK-01 | Locks JSONL cache TTL split path | manual | reviewer reads § "LOCK-4: cache TTL split" | ❌ Wave 0 |
| SPIK-01 | Has appendix with raw verbatim psql/sqlite output | smoke | `grep -q '^## Appendix' .planning/research/SPIKE.md` | ❌ Wave 0 |
| SPIK-01 | Cites `[VERIFIED:...]` or `[CITED:...]` or `[ASSUMED]` provenance on every lock | manual + grep | `grep -E '\[(VERIFIED|CITED|ASSUMED)' .planning/research/SPIKE.md \| wc -l` (≥ # of locks) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `test -f .planning/research/SPIKE.md && grep -c '^#### LOCK-' .planning/research/SPIKE.md`
- **Per wave merge:** Wave 0 — all SQL example outputs present; Wave 1 — at least one `skill_activated` row queried and pretty-printed
- **Phase gate:** User reads SPIKE.md end-to-end; cross-references ROADMAP.md SC#1-4; signs off

### Wave 0 Gaps
- No test file gaps — this is documentation, not code.
- The plan should include a "verify SPIKE.md is well-formed and parseable" task using the `grep`-based invariants above.

## Security Domain

> Spike is read-only documentation. ASVS categories below are listed for completeness but most are not exercised.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Spike doesn't authenticate anything |
| V3 Session Management | no | Spike has no sessions (it's a doc) |
| V4 Access Control | no | Spike reads files the author already has access to |
| V5 Input Validation | no | No untrusted input |
| V6 Cryptography | no | No crypto |
| V7 Error Handling & Logging | yes (limited) | If spike SQL captures user emails, redact `golysoft@gmail.com` and `user.account_id` from inline pretty-printed bodies. Keep them in the appendix raw output if needed for forensic re-check; flag the file as personal-data-bearing. |
| V8 Data Protection | yes (limited) | SPIKE.md will contain real session_ids, prompt content (in `tool_input` attribute on `tool_result` events), and command-line strings (`bash_command` field). If this repo is public, redact these. The repo IS at `claude-mission-control` — confirm public/private status with user before committing. |
| V9 Communication Security | no | No network |
| V10 Malicious Code | no | No code |
| V11 Business Logic | no | No business logic |
| V12 Files and Resources | no | Read-only file access to user's own files |
| V13 API & Web Services | no | No API |
| V14 Configuration | yes | `OTEL_LOG_TOOL_DETAILS=1` env documented as precondition. No new config. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| PII in pretty-printed bodies leaking into a public-repo commit | Information Disclosure | Redact `user.email`, `user.account_id`, `user.account_uuid`, `organization.id`, full `bash_command` strings before committing. SPIKE.md should redact in body, optionally preserve verbatim in a `.gitignore`d sibling file (`SPIKE-raw.md`) for the spike author's local forensic use. |
| Real `session.id` UUIDs in committed file | Information Disclosure (low severity — UUIDs are not credentials but tie back to user's session history) | Replace with `<session-1>`, `<session-2>`, etc. in body. Keep in raw appendix if commit is staying private. |

## Sources

### Primary (HIGH confidence — direct verification on this machine, 2026-05-02)
- `data/cmc.db` SQLite database — schema, row counts, attribute shapes, version distribution, session_id NULL-rate, body envelope shape (`SELECT body FROM otel_events …`)
- `cmc/api/routes/ingest.py:97-148` — exact ingest logic for OTLP /v1/logs
- `cmc/api/routes/observability.py:533-543` — proof of v1.0 latent json_extract bug
- `cmc/db/engine.py:23-58` — confirms SQLite + WAL mode + connection pragma setup
- `cmc/db/models/otel_events.py` + `migrations/versions/0001_initial.py:238-261` — confirms otel_events column types and indexes
- `cmc/cli/setup_otel.py:28-35` — exact six OTEL env keys including `OTEL_LOG_TOOL_DETAILS=1`
- `~/.claude/settings.json` — confirms env keys present on this machine
- `~/.claude/projects/-Users-patrykattc-work-git-claude-mission-control/18a23689-….jsonl` — verbatim usage block with `cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`
- `.planning/phases/02-data-ingestion/02-RESEARCH.md` — established `[VERIFIED:...]` / `[CITED:...]` citation convention reused here
- ROADMAP.md Phase 12 success criteria, REQUIREMENTS.md SPIK-01

### Secondary (MEDIUM confidence — referenced but not re-verified by this research)
- `.planning/research/STACK.md` Section 1 — claims `claude_code.skill_activated` is canonical name, sourced from Context7 `/ericbuess/claude-code-docs` mirror. **Not re-verified in this research.** SPIKE.md Wave 1 verifies via live invocation.
- `.planning/research/PITFALLS.md` Pitfall 1 — re-states the spike-must-verify-before-locking principle, paraphrased above
- `.planning/research/SUMMARY.md` — corroborates the structure of the OTEL spike narrative
- `.planning/research/ARCHITECTURE.md` Phase 0 spike section — earlier draft of this same workflow; consistent with our design

### Tertiary (not used — flagged for honesty)
- Anthropic public docs at `code.claude.com/docs/en/monitoring-usage` — referenced indirectly via STACK.md; the P0 hard gate forbids paraphrase, so this research relies on STACK.md's prior Context7 fetch + the live-invocation spike for ground truth. SPIKE.md must NOT cite the docs page directly as a lock source.

## Metadata

**Confidence breakdown:**
- DB access path / schema reality / pretty-print tooling: HIGH — every command was run and produced the documented output.
- JSONL transcript shape: HIGH — verbatim usage block extracted from a real session file.
- No-data fallback playbook: HIGH on the situation (zero rows, no skills installed, env vars OK), MEDIUM on the recovery (assumes Claude Code 2.1.116 emits the event when a real skill fires — STACK.md says yes; not re-verified this session).
- Pitfalls: HIGH — three of the seven were verified by direct query on the production DB (NULL session_id, NULL flat-extract on tool_decision, version uniformity).
- Existing v1.0 references: HIGH — full grep of backend + frontend with explicit results.

**Research date:** 2026-05-02
**Valid until:** Whenever Claude Code minor version changes (currently 2.1.116). Re-verify before any future SPIKE.md re-run by checking `service.version` distribution and re-running Wave 0 queries. Estimated useful life: 30-90 days for this stable v1.1 milestone.

---

# Appendix A — Canonical Spike Query Set (planner reference)

The planner should structure SPIKE.md tasks around these queries. Each one corresponds to a CONTEXT.md "full surface map" requirement. All translated for SQLite (the DB is SQLite, not Postgres — see Pitfall 1).

```bash
# Working directory: /Users/patrykattc/work/git/claude-mission-control
DB=data/cmc.db

# Q0 — sanity (table exists, rows present)
sqlite3 "$DB" "SELECT COUNT(*) FROM otel_events;"

# Q1 — spec LIMIT 50 (success criterion #1)
sqlite3 -header -column "$DB" \
  "SELECT id, ts, event_name, substr(body,1,200) FROM otel_events
   WHERE event_name LIKE '%skill%' ORDER BY ts DESC LIMIT 50;"

# Q2 — event-name count breakdown (provides context for what IS in the table)
sqlite3 -header "$DB" \
  "SELECT event_name, COUNT(*) AS n FROM otel_events GROUP BY 1 ORDER BY n DESC;"

# Q3 — distinct attribute-key enumeration (frequency-ranked) for skill events
sqlite3 -header "$DB" \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%'
   GROUP BY 1 ORDER BY n DESC;"

# Q4 — skill_name vs skill.name vs name probe (success criterion #2)
sqlite3 -header "$DB" <<'SQL'
SELECT
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='skill_name')   AS k_skill_name,
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='skill.name')   AS k_skill_dot_name,
  (SELECT json_extract(value,'$.value.stringValue') FROM json_each(json_extract(body,'$.record.attributes')) WHERE json_extract(value,'$.key')='name')         AS k_name,
  ts
FROM otel_events
WHERE event_name LIKE '%skill%'
ORDER BY ts DESC LIMIT 10;
SQL

# Q5 — duration_ms presence (success criterion #3a)
sqlite3 -header "$DB" \
  "SELECT
     COUNT(*) AS total,
     SUM(CASE WHEN (SELECT 1 FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key')='duration_ms') IS NOT NULL THEN 1 ELSE 0 END) AS have_duration_ms
   FROM otel_events WHERE event_name = 'skill_activated';"

# Q6 — cache TTL split — OTEL surface (expect NULL based on Pitfall 5 verification)
sqlite3 -header "$DB" \
  "SELECT
     (SELECT json_extract(value,'\$.value.stringValue') FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key') LIKE '%ephemeral_5m%') AS m5,
     (SELECT json_extract(value,'\$.value.stringValue') FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key') LIKE '%ephemeral_1h%') AS h1,
     COUNT(*) AS n
   FROM otel_events WHERE event_name LIKE '%skill%' OR event_name = 'api_request'
   GROUP BY 1, 2;"

# Q7 — cache TTL split — JSONL surface (success criterion #3b)
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

# Q8 — version-of-record (Pitfall 6 — locks valid for which Claude Code versions)
sqlite3 -header "$DB" \
  "SELECT json_extract(body,'\$.scope.version') AS version, COUNT(*) AS n
   FROM otel_events GROUP BY 1 ORDER BY n DESC;"

# Q9 — session/project correlation key (Pitfall 4 — what's the actual session attribute key)
sqlite3 -header "$DB" \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%' AND json_extract(value,'\$.key') LIKE '%session%'
   GROUP BY 1 ORDER BY n DESC;"

# Q10 — multi-skill turns (does one assistant turn fire N events or 1 batched event)
sqlite3 -header "$DB" \
  "SELECT
     (SELECT json_extract(value,'\$.value.stringValue') FROM json_each(json_extract(body,'\$.record.attributes')) WHERE json_extract(value,'\$.key')='session.id') AS sid,
     ts, event_name
   FROM otel_events WHERE event_name LIKE '%skill%' ORDER BY sid, ts LIMIT 50;"

# Q11 — error / cancel / failure status attribute on skill events
sqlite3 -header "$DB" \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%'
     AND (json_extract(value,'\$.key') LIKE '%error%'
          OR json_extract(value,'\$.key') LIKE '%status%'
          OR json_extract(value,'\$.key') LIKE '%outcome%'
          OR json_extract(value,'\$.key') LIKE '%cancel%'
          OR json_extract(value,'\$.key') LIKE '%success%')
   GROUP BY 1 ORDER BY n DESC;"

# Q12 — token attribution: are tokens inline on skill_activated or only on api_request?
sqlite3 -header "$DB" \
  "SELECT json_extract(value,'\$.key') AS attr_key, COUNT(*) AS n
   FROM otel_events, json_each(json_extract(body,'\$.record.attributes'))
   WHERE event_name LIKE '%skill%'
     AND (json_extract(value,'\$.key') LIKE '%token%'
          OR json_extract(value,'\$.key') LIKE '%cost%')
   GROUP BY 1 ORDER BY n DESC;"

# Q13 — full pretty-printed body (sample 1 of 3 representative bodies)
sqlite3 -separator '' "$DB" \
  "SELECT body FROM otel_events WHERE event_name LIKE '%skill%' ORDER BY ts DESC LIMIT 1;" | \
  python3 -c "import json,sys; print(json.dumps(json.loads(sys.stdin.read()), indent=2))"
```

# Appendix B — No-data Fallback Playbook (Wave 1 task script)

If Q1 (canonical LIMIT 50 query) returns zero rows and Q3 returns zero attribute keys, the spike author MUST execute Wave 1 before locking findings as HIGH confidence.

```bash
# Step 1 — Verify ingest server is running (pre-flight)
curl -s http://127.0.0.1:8765/healthcheck || {
  echo "BLOCK: FastAPI not running. Start with: make dev-backend"
  exit 1
}

# Step 2 — Author a one-shot SKILL.md
mkdir -p ~/.claude/skills/spike-test-skill
cat > ~/.claude/skills/spike-test-skill/SKILL.md <<'SKILL'
---
name: spike-test-skill
description: Trivial skill for OTEL spike Phase 12 verification. Writes a marker file.
---
You are the spike-test-skill. When invoked, write the file `/tmp/spike-skill-fired.txt` with the current ISO timestamp. That's your only job.
SKILL

# Step 3 — Drive Claude Code to invoke it
# In an interactive Claude Code session (not this conversation; a separate shell):
#   "Use the spike-test-skill to record a marker."
# Wait for the assistant to invoke the skill.

# Step 4 — Verify ingest captured an event
sleep 5  # let the OTLP exporter flush its queue (~5s default)
sqlite3 -header data/cmc.db \
  "SELECT id, ts, event_name FROM otel_events
   WHERE ts >= datetime('now', '-2 minutes')
   ORDER BY ts DESC LIMIT 20;"

# Step 5 — If a skill_activated event landed, re-run the canonical query set (Appendix A)
# and write findings into SPIKE.md as HIGH-confidence locks.

# Step 6 — Cleanup
rm -rf ~/.claude/skills/spike-test-skill
rm -f /tmp/spike-skill-fired.txt
```

**If Wave 1 fails to produce a `skill_activated` event:**
- Record the negative finding verbatim in SPIKE.md (LOCK-N: TENTATIVE).
- Cite STACK.md / Context7 docs as the SECONDARY source for any attribute-key claims and stamp them `[CITED]` not `[VERIFIED]`.
- Surface as a v1.1 risk: Phase 13's `attrs_skill_name` ingest column may need to be wired to a different event name once ground-truth lands.
- Recommend the user run `cmc doctor` (Phase 17 work) to detect when the event finally lands and trigger a SPIKE.md re-run.

## RESEARCH COMPLETE
