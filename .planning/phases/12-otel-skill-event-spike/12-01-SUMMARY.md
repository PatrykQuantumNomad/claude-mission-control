---
phase: 12-otel-skill-event-spike
plan: 01
subsystem: observability
tags: [otel, otlp, sqlite, skill-events, fastapi-ingest, claude-code-2.1.116, raw-capture]

# Dependency graph
requires:
  - phase: 12-otel-skill-event-spike
    provides: "12-RESEARCH.md (canonical Q0-Q13 query catalog) + 12-CONTEXT.md (objectives, scope, success criteria)"
provides:
  - ".planning/research/SPIKE.md raw appendix — verbatim Q0-Q13 sqlite3 outputs anchored on 6,392 production otel_events rows (Claude Code 2.1.116)"
  - "JSONL usage block from most recent assistant turn with cache_creation.ephemeral_5m_input_tokens / ephemeral_1h_input_tokens (Q7)"
  - "Service version of record: claude-code 2.1.116 (Q8)"
  - "Two representative pretty-printed OTEL bodies (api_request, tool_decision) showing full envelope shape"
  - "Wave 1 negative-finding evidence — skill body fired but ZERO OTEL events landed; documents two non-exclusive root causes for Plan 02 footnoting"
  - "TENTATIVE-locks-required signal for Plan 02 (skill-scoped attribute locks must cite STACK.md / Context7, not live capture)"
affects: [12-02-compose-locks, 13-otel-skill-event-ingest, observability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw-capture-first plan structure: P0 hard gate forbids any lock authorship before verbatim sqlite3 output is on disk"
    - "json_each(json_extract(body,'$.record.attributes')) attribute-array unpacking (Pitfall 2 mitigation)"
    - "Pre-invocation timestamp scope boundary for live-event capture (cat /tmp/spike-pre-invocation.ts > sqlite filter)"
    - "Wave 0 / Wave 1 conditional execution with banner state machine in raw appendix"

key-files:
  created:
    - .planning/research/SPIKE.md
    - .planning/phases/12-otel-skill-event-spike/12-01-SUMMARY.md
  modified: []

key-decisions:
  - "Plan 02 must author skill-scoped attribute locks (skill_name, duration_ms, status taxonomy, token attribution, session.id correlation) as TENTATIVE — Wave 1 yielded a negative finding (skill body executed, zero OTEL events landed)"
  - "Plan 02 may author ingest-side schema locks (json_each pattern, attributes-array shape, event_name prefix-strip) as HIGH-confidence — those are anchored on the 6,392 production rows in Q1-Q13, not on the absent skill rows"
  - "Service version of record stamped: claude-code 2.1.116 (6,459 of 6,461 rows). Two ancient smoke rows have NULL version and are out of scope"
  - "Cache TTL split surface lock: JSONL only at 2.1.116 (message.usage.cache_creation.ephemeral_{5m,1h}_input_tokens). OTEL api_request events do NOT carry these keys"
  - "Phase 13 follow-up is required to resolve the Wave 1 negative finding — re-run the live invocation with explicit OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_LOGS_ENDPOINT env in the spawned `claude` session to disambiguate cause (a) Claude Code does not emit skill events vs cause (b) endpoint mis-config in the spawned session"

patterns-established:
  - "Wave 0 / Wave 1 conditional flow: Wave 0 mines existing data; Wave 1 (live invocation via human-action checkpoint) is gated on Wave 0 returning zero rows. Banner state machine in the appendix records which path executed and the resulting confidence level"
  - "Negative-finding documentation discipline: when a live invocation fails to produce expected events, the plan still completes successfully — the absence is itself a finding. Lock authorship downstream switches to TENTATIVE and cites STACK.md / Context7 fallback rather than fabricating data"
  - "Cleanup invariant for Wave 1 transient artifacts: ~/.claude/skills/spike-test-skill/, /tmp/spike-skill-fired.txt, /tmp/spike-pre-invocation.ts MUST all be removed before plan completion. Automated gate enforces this"

# Metrics
duration: ~37 min (Task 1: ~20 min, checkpoint pause excluded, Task 2 post-checkpoint: ~5 min)
completed: 2026-05-02
---

# Phase 12 Plan 01: OTEL Skill Event Spike — Raw Capture Summary

**Captured Q0-Q13 verbatim against 6,392 production otel_events rows; Wave 1 live invocation produced a negative finding (skill body fired, zero OTEL events landed) — Plan 02 must author skill-scoped locks as TENTATIVE.**

## Performance

- **Duration:** ~37 min (Task 1 ~20 min on 2026-05-02 21:11Z–21:31Z; checkpoint pause excluded; Task 2 post-checkpoint ~5 min on 22:05Z–22:08Z)
- **Started:** 2026-05-02T21:11:00Z (approx — Task 1 began after init context load)
- **Completed:** 2026-05-02T22:08:10Z
- **Tasks:** 2/2 (Task 1 fully autonomous; Task 2 paused at human-action checkpoint, resumed after user drove a separate Claude Code session)
- **Files modified:** 1 created (`.planning/research/SPIKE.md`, 762 lines), 1 created (this SUMMARY.md)
- **Production rows mined:** 6,392 (otel_events table, Claude Code 2.1.116)
- **JSONL transcripts mined:** 1 (most-recent assistant turn from `~/.claude/projects/-Users-patrykattc-work-git-claude-mission-control/*.jsonl`)

## Accomplishments

- **Wave 0 raw appendix complete.** All 13 canonical queries (Q0-Q13 from RESEARCH.md Appendix A) plus Q7 JSONL probe captured verbatim into `.planning/research/SPIKE.md` Appendix A. Two representative pretty-printed bodies (`api_request`, `tool_decision`) embedded inline so Plan 02 can cite the full OTLP envelope without re-running queries.
- **Wave 0 outcome confirmed empirically.** Zero `event_name LIKE '%skill%'` rows in 6,392 production rows (Q1, Q3, Q5, Q9-Q13 all returned `(zero rows)`). This matches RESEARCH.md §1 verified state and triggered the Wave 1 fallback path.
- **Wave 1 live invocation executed.** Per the human-action checkpoint, the user drove a separate Claude Code session, prompted "Use the spike-test-skill to record a marker", and the skill body fired (marker file `/tmp/spike-skill-fired.txt` written at `2026-05-02T22:04:46Z`, 19m55s after the pre-invocation scope boundary `2026-05-02T21:44:51Z`).
- **Wave 1 negative finding documented.** ZERO OTEL events of ANY kind landed in `data/cmc.db` since the pre-invocation timestamp. Not just zero skill events — zero `api_request`, zero `tool_decision`, zero of anything. Two non-exclusive root causes documented in SPIKE.md for Plan 02 to footnote.
- **Cleanup verified.** `~/.claude/skills/spike-test-skill/` removed; `~/.claude/skills/` is empty (only `.` and `..` remain). `/tmp/spike-skill-fired.txt` and `/tmp/spike-pre-invocation.ts` both removed. User's environment back to pre-Wave-1 state.
- **Service version of record stamped.** `claude-code 2.1.116` (Q8 confirmed 6,459 of 6,461 rows; 2 ancient smoke rows have NULL version).

## Wave 0 Outcome

**Zero skill events found in pre-existing data.** Confirmed by the following query results in SPIKE.md Appendix A:

- **Q1 (skill rows LIMIT 50):** `(zero rows)` — see SPIKE.md `### Q1 — spec LIMIT 50 (success criterion #1: skill rows present?)` (line 33)
- **Q3 (distinct attribute-key enumeration for skill events):** `(zero rows)` — see SPIKE.md `### Q3 — distinct attribute-key enumeration (frequency-ranked) for skill events` (line 71)
- **Q4 (skill_name vs skill.name vs name probe):** `(zero rows)` — see SPIKE.md line 87
- **Q5 (duration_ms presence on skill_activated):** `total=0, have_duration_ms=NULL` — see SPIKE.md line 106
- **Q9-Q13 (session correlation, batching, error attrs, token attrs, full body):** all `(zero rows)` — see SPIKE.md lines 252, 268, 284, 305, 323

**Total `otel_events` rows:** 7,241 (Q0). **Skill rows:** 0. Confirms RESEARCH.md §1 verified-state on 2026-05-02.

## Wave 1 Outcome — Negative Finding

**Skill body executed, but ZERO OTEL events of any kind landed.**

Verbatim post-invocation query result (quoted from SPIKE.md `### Wave 1 — Post-invocation event scan`, line 691):

```
Pre-invocation timestamp: 2026-05-02T21:44:51Z

sqlite3 -header data/cmc.db \
  "SELECT id, ts, event_name FROM otel_events
   WHERE ts >= '$PRE' ORDER BY ts DESC LIMIT 20;"
→ (zero rows)

Broader probe — ALL event types:
sqlite3 -header data/cmc.db \
  "SELECT DISTINCT event_name, COUNT(*) AS n FROM otel_events
   WHERE ts >= '$PRE' GROUP BY event_name ORDER BY n DESC;"
→ (zero rows)

Total events count since pre-invocation:
total_events_since_pre
0
```

Marker file evidence (proves skill body fired despite no OTEL emission):

```
$ cat /tmp/spike-skill-fired.txt
2026-05-02T22:04:46Z
```

**Two non-exclusive root causes** (Plan 02 MUST footnote both — see SPIKE.md `### Wave 1 — No event landed (negative finding)` line 734):

1. **Cause (a):** Claude Code 2.1.116 may not emit `claude_code.skill_activated` (or any skill-scoped) OTEL event at all in the user's session configuration. STACK.md / Context7 docs for `@anthropic-ai/claude-code` are the authoritative source for whether the event is documented at this version.
2. **Cause (b):** The spawned `claude` session may not have been pointed at the local FastAPI ingest at `127.0.0.1:8765`. Even though `OTEL_LOG_TOOL_DETAILS=1` is set in `~/.claude/settings.json`, the OTLP exporter endpoint env vars (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`) may not have been configured in the new shell that ran `claude`. **Cause (b) is favored** because zero events of ANY type landed during the skill-firing window — if any OTEL events were being delivered at all we'd expect at least `api_request` rows from the assistant turn that fired the skill.

**Lock confidence guidance for Plan 02:**

- **TENTATIVE (cite STACK.md / Context7 fallback):** all skill-scoped attribute locks (`skill_name`, `duration_ms`, status taxonomy, token attribution attrs, session.id correlation on skill events). Even the `event_name = 'skill_activated'` lock itself is TENTATIVE pending direct verification.
- **HIGH-confidence (cite SPIKE.md Appendix A live capture):** ingest-side schema locks (json_each pattern for attribute unpacking, attributes-array shape, event_name prefix-strip behavior, body.record.body.stringValue full-prefix surface). These are anchored on the 6,392 production rows in Q1-Q13, NOT on the absent skill rows — they remain rock-solid.

## SPIKE.md Anchor Map (for Plan 02 citation)

Plan 02 should cite Appendix A by sub-heading. Key anchors:

| Query / section | SPIKE.md anchor (line) | What it provides |
| --- | --- | --- |
| Q0 — total row count | line 21 | Sanity (7,241 rows) |
| Q1 — skill rows LIMIT 50 | line 33 | Empirical zero-skill-rows finding |
| Q2 — event-name count breakdown | line 47 | Full event-type taxonomy in production data |
| Q3 — distinct attribute-key enumeration (skill) | line 71 | Empirical zero-attribute-keys-on-skill finding |
| Q4 — skill_name vs skill.name vs name probe | line 87 | TENTATIVE skill_name lock target |
| Q5 — duration_ms presence | line 106 | TENTATIVE duration_ms lock |
| Q6 — cache TTL split (OTEL surface) | line 123 | OTEL surface for cache-TTL split (none in 2.1.116) |
| Q7 — cache TTL split (JSONL surface) | line 144 | HIGH-confidence JSONL `cache_creation.ephemeral_{5m,1h}` lock |
| Q8 — version of record | line 234 | `2.1.116` stamp |
| Q9 — session/project correlation | line 252 | TENTATIVE `session.id` (DOTTED, Pitfall 4) lock |
| Q10 — multi-skill turn batching | line 268 | TENTATIVE per-session ordering lock |
| Q11 — error / cancel / failure status | line 284 | TENTATIVE status-taxonomy lock |
| Q12 — token attribution | line 305 | TENTATIVE token-attribution lock |
| Q13 — full pretty-printed body | line 323 | TENTATIVE full-envelope structure |
| Representative `api_request` body | line 339 | HIGH-confidence OTLP envelope shape (rich-attribute reference) |
| Representative `tool_decision` body | line 529 | HIGH-confidence OTLP envelope shape (Pitfall 2 reference) |
| Wave 0 summary | line 679 | Tally of zero-rows results |
| Wave 1 — Post-invocation event scan | line 691 | Empirical zero-events-landed evidence |
| Wave 1 — No event landed (negative finding) | line 734 | Two-cause root-cause analysis |

## Task Commits

1. **Task 1: Wave 0 — Mine existing otel_events and capture Q0-Q13 + JSONL usage block** — `b22652b` (docs)
2. **Task 2: Wave 1 fallback — live skill invocation, post-checkpoint capture, cleanup** — `8b9682e` (feat)

**Plan metadata commit:** _(this SUMMARY + STATE.md update)_

## Files Created/Modified

- `.planning/research/SPIKE.md` — created (762 lines). Placeholder header + full Wave 0 raw appendix (Q0-Q13 + Q7 JSONL + 2 representative bodies + Wave 0 summary) + Wave 1 post-invocation scan + Wave 1 negative-finding sub-section + outcome banner state machine.
- `.planning/phases/12-otel-skill-event-spike/12-01-SUMMARY.md` — this file.

## Decisions Made

- **TENTATIVE-locks-only constraint propagated to Plan 02** for skill-scoped attributes (negative finding). Plan 02 must cite STACK.md / Context7 docs as the authoritative source rather than live capture for these locks.
- **Wave 0 banner preserved as a history footnote** when updated to the Wave 1 outcome banner — keeps the chronological record visible inside the appendix instead of overwriting it.
- **Did NOT issue Q8 / Q2 / Q7 re-runs in Wave 1** because they don't depend on skill-event presence (Q8 = version, Q2 = full event-name breakdown, Q7 = JSONL usage block which is tied to the assistant turn we already mined). The plan was explicit that re-runs only target skill-dependent queries.
- **Did NOT attempt to re-spawn the `claude` session with explicit OTLP env vars** to disambiguate causes (a) and (b). That diagnostic loop is a Phase 13 concern — Plan 01's contract is "raw capture or negative finding," and we have a clean negative finding. Plan 02 footnotes both root causes; Phase 13 ingest implementation will surface whichever root cause is real once the schema is in place.

## Deviations from Plan

None — plan executed exactly as written. The negative-finding branch (3b) of Task 2's POST-CHECKPOINT was explicitly designed for this outcome (the plan author anticipated zero events might land even after a successful skill body fire) and Plan 01's `must_haves.truths[1]` was previously broadened (commit `1301520`) to admit a negative finding as a valid completion state.

## Issues Encountered

- **Pitfall 8 (Wave 1 — silent OTLP drop) materialized.** The skill body executed (marker file present at `2026-05-02T22:04:46Z`) but no OTEL events landed. This is exactly the failure mode the plan called out in advance, so the executor switched to the negative-finding branch with no improvisation required.
- **No JSONL path drift, no FastAPI startup issues** — pre-checkpoint setup was clean (FastAPI healthy at `127.0.0.1:8765`, JSONL transcript pattern matched on first try, Q7 captured a valid usage block).
- **OTLP flush window observed:** even after the spec-mandated `sleep 5` and a broader scan with no event-name filter, post-scope event count was 0. Cause (b) — endpoint mis-config in the spawned `claude` session — is favored on this evidence; Plan 02 footnotes both causes pending Phase 13 resolution.

## User Setup Required

None — no external service configuration required. The FastAPI ingest server at `127.0.0.1:8765` was already running and healthy before plan start; no new env vars or dashboard configuration introduced.

## Next Phase Readiness

**Plan 02 (compose locks) is unblocked and can begin immediately.** It now has:

- All Q0-Q13 verbatim outputs in `.planning/research/SPIKE.md` Appendix A with line-anchored citations (anchor map above)
- Two representative pretty-printed OTEL bodies (api_request, tool_decision) for Plan 02 to embed inline in the readable doc body
- A definitive "TENTATIVE-locks-required" signal for skill-scoped attributes, with both root causes documented for footnoting
- A definitive "HIGH-confidence" signal for ingest-side schema locks (anchored on 6,392 production rows)
- Service version of record (`2.1.116`) stamped throughout

**Phase 13 follow-up:** the negative finding leaves a single open diagnostic — re-run the live invocation with explicit `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` env vars in the spawned `claude` session to disambiguate causes (a) and (b). This is appropriately scoped to Phase 13 (ingest implementation) rather than this spike phase.

## Self-Check: PASSED

- FOUND: `.planning/research/SPIKE.md`
- FOUND: `.planning/phases/12-otel-skill-event-spike/12-01-SUMMARY.md`
- FOUND: commit `b22652b` (Task 1)
- FOUND: commit `8b9682e` (Task 2)
- FOUND: cleanup ok — no `~/.claude/skills/spike-test-skill/`
- FOUND: cleanup ok — no `/tmp/spike-skill-fired.txt`
- FOUND: cleanup ok — no `/tmp/spike-pre-invocation.ts`

---
*Phase: 12-otel-skill-event-spike*
*Completed: 2026-05-02*
