# Phase 12: OTEL Skill Event Spike - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Capture verbatim `claude_code.skill_activated` event payloads from the real ingested `otel_events` table, document the literal attribute shape (keys, types, presence), and produce `.planning/research/SPIKE.md` as the single canonical reference cited by every downstream v1.1 phase plan (13-17).

Implementation of any cost engine, ingest column, panel, alert, or compare endpoint that consumes this shape is out of scope — those are Phase 13+.

</domain>

<decisions>
## Implementation Decisions

### Capture strategy
- **Time window: all time.** Query the entire `otel_events` table — no date bound. Maximize sample at the cost of accepting that older Claude Code versions may have produced different shapes; if version drift is observed, document it.
- **Source, sample size, and no-data fallback: Claude's discretion** (see below).

### SQL query set
- **Depth: full surface map.** The spike runs the spec-required queries (LIMIT 50 dump, skill_name attribute key check, duration_ms presence check, cache 5m/1h TTL split check) PLUS distinct attribute-key enumeration, event-name count breakdown, adjacent-event correlation (assistant message OTEL events around skill events), claude_code-version split (if attribute present), and error/cancel event queries. Goal: nothing left for Phase 13/14 plans to re-investigate.
- **Attribute-key extraction: both methods.** Programmatic enumeration via `SELECT key, COUNT(*) FROM otel_events, jsonb_object_keys(body) AS key WHERE event_name LIKE '%skill%' GROUP BY key ORDER BY COUNT(*) DESC` (exhaustive, frequency-ranked) AND 2-3 pretty-printed representative bodies inline for readability. Programmatic enumeration goes in the appendix.
- **Cache 5m/1h TTL split: check both surfaces.** Look in `otel_events.body` (the OTEL skill_activated payload itself) AND in the JSONL transcript file's `usage` block (`~/.claude/projects/*/sessions/*.jsonl`). Document which surface actually carries the split — this directly feeds Phase 13 success criterion #1 (cache-tier-aware cost computation).
- **Output presentation: raw appendix + readable body.** SPIKE.md body shows pretty-printed JSON in fenced code blocks for readability. An appendix at the end carries the raw verbatim psql output for fidelity / forensic re-check. No reformatting in the appendix.

### Coverage scope (beyond named success criteria)
The spike must verify all four of these in addition to the three explicit success-criteria checks (skill_name attribute key, duration_ms presence, cache TTL location):
- **Session/project correlation.** Confirm the literal attribute keys for session_id and project_id (or their equivalents) on skill_activated events. Phase 14 per-session and per-project rollups depend on these joins existing.
- **Multi-skill turns.** Document whether a single conversational turn that fires multiple skills produces N separate `skill_activated` events or one batched event. Affects Phase 14 timeline rendering and cost-attribution math.
- **Error / cancel / failure status.** Query for any outcome / status / error attribute on skill_activated events. Phase 14 `SkillLatencyTable` error-rate column needs a verified source.
- **Token attribution.** Verify whether token counts are inline on `skill_activated` events OR require joining to adjacent assistant-message OTEL events. Critical for Phase 13 cost engine and Phase 14 `SkillCostCard` math — locks whether cost can be computed from the skill event alone or needs cross-event JOINs.

### SPIKE.md structure
- **All Claude's discretion.** Top-level layout (decision-first vs linear narrative vs Q&A by success criterion), citation convention (LOCK-N IDs vs anchor headings vs both), provenance metadata depth, and post-Phase-12 lifecycle (one-shot vs re-runnable + appendable vs re-runnable + overwritten) are all Claude's call during execution.

### Claude's Discretion
- **Capture strategy specifics.** Whether to mine the existing `otel_events` table, run a live dogfood session, or both — Claude picks based on what the table already contains.
- **Sample size threshold.** What counts as "enough" — Claude documents the actual N retrieved and stamps a confidence note.
- **No-data fallback.** If zero `skill_activated` rows exist, Claude judges between blocking with setup instructions, documenting the void with TENTATIVE locks, or triggering a live invocation in-flight.
- **SPIKE.md structure (all four sub-questions).** Layout style, citation IDs, provenance fields, lifecycle policy.

</decisions>

<specifics>
## Specific Ideas

- Doc location is fixed by ROADMAP.md success criterion #1: `.planning/research/SPIKE.md` — single file, single source of truth.
- Phase 13 success criterion #4 already names the indexed column the spike will validate the key for: `otel_events.attrs_skill_name`. Spike output must support or reject that column name.
- STATE.md flags this as a P0 hard gate: "verbatim live-data capture before any ingest schema lock." No paraphrase from Anthropic docs allowed in lock decisions — every locked attribute key must trace to a query result block in SPIKE.md.
- STATE.md also flags `OTEL_LOG_TOOL_DETAILS=1` env var dependency for the live-data path (carries into Phase 17 doctor-warning work). Spike should note this as an environmental precondition if it's relevant to whether events landed.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-otel-skill-event-spike*
*Context gathered: 2026-05-02*
