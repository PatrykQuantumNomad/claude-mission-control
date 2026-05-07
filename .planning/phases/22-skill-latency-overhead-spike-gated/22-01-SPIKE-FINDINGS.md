# Phase 22 Plan 01 — Spike Findings: Skill Latency Overhead Feasibility

**Date:** 2026-05-07T14:32:12Z
**Plan:** 22-01-PLAN.md
**Requirement:** SKLP-11 (per-skill latency overhead body / subagent / tool decomposition)

## Outcome: NO — descope SKLP-11 to v1.3

CT-1 (Coverage) failed structurally: the only `skill_activated` row in `data/cmc.db` does not carry a `duration_ms` body attribute, so there is zero data to decompose. SKLP-11 descopes to v1.3 cleanly per ROADMAP Success Criterion #3; Plan 02-descope flips REQUIREMENTS.md.

## Preamble — Environment & Data State

- SQLite version: `3.51.0`
- otel_events skill_activated total rows: `1`
- tools census (Skill / Agent):
  ```
  $ sqlite3 -header -column data/cmc.db "SELECT tool_name, COUNT(*) AS n, SUM(CASE WHEN duration_ms IS NULL THEN 1 ELSE 0 END) AS pending FROM tools WHERE tool_name IN ('Skill','Agent') GROUP BY tool_name;"
  tool_name  n    pending
  ---------  ---  -------
  Agent      743  64
  Skill      16   0
  ```
- Spike execution timestamp (UTC): `2026-05-07T14:32:12Z`
- Working directory: `/Users/patrykattc/work/git/claude-mission-control`
- Database path: `data/cmc.db`
- Plan 01 commit (will be filled by SUMMARY): TO_BE_UPDATED_BY_SUMMARY

## Threshold Definitions

The spike gates Phase 22 on three thresholds (CT-2 collapsed into CT-3 per the honest revision in `22-RESEARCH.md` §Code Examples — `body_ms` is computed as the residual, so the only failure mode is negative residual).

- **CT-1 (Coverage):** `≥1` skill name has `≥30` rows where `event_name='skill_activated' AND attrs_skill_name=<name> AND` the row's body-attribute `duration_ms` is non-NULL.

  The threshold value `30` is the constant **`MIN_LATENCY_SAMPLES = 30`** defined as the single source of truth at `cmc/api/routes/skills.py:606`. This document does NOT introduce any parallel threshold constant; it cites the existing one.

- **CT-3 (Negative-residual guard):** Across the per-row decomposition `body_ms = total_ms − subagent_ms − tool_ms`, ZERO rows where `body_ms < 0`.

- **CT-4 (Subagent containment):** For every `skill_activated` row that has an `Agent` tool in its temporal window, the parent `session_id` must NOT also contain inner tool calls (`Read` / `Edit` / `Bash` / …) whose `started_at` falls inside the `Agent`'s own `[started_at, started_at+duration_ms)` sub-window. Verifies the assumption that subagent inner tools live in the subagent's own session, not the parent's (otherwise `tool_ms` double-counts).

**Failure-isolation rule (per PLAN Task 1):** if CT-1 fails, CT-3 and CT-4 do not run — there is no data to decompose. This document records both as `N/A — CT-1 failed`, per Plan 22-01 §Action.

## Probe 1 — CT-1 Coverage

**Query:**
```sql
WITH skill_events AS (
  SELECT
    o.id,
    o.ts,
    o.session_id AS column_session_id,
    o.attrs_skill_name AS column_skill_name,
    (SELECT json_extract(value,'$.value.stringValue')
       FROM json_each(json_extract(o.body,'$.record.attributes'))
      WHERE json_extract(value,'$.key')='skill.name' LIMIT 1) AS body_skill_name,
    (SELECT json_extract(value,'$.value.stringValue')
       FROM json_each(json_extract(o.body,'$.record.attributes'))
      WHERE json_extract(value,'$.key')='session.id' LIMIT 1) AS body_session_id,
    CAST((SELECT json_extract(value,'$.value.stringValue')
            FROM json_each(json_extract(o.body,'$.record.attributes'))
           WHERE json_extract(value,'$.key')='duration_ms' LIMIT 1) AS INTEGER) AS duration_ms
  FROM otel_events o
  WHERE o.event_name = 'skill_activated'
    AND o.ts >= datetime('now', '-30 days')
)
SELECT
  COALESCE(column_skill_name, body_skill_name, '<UNKEYED>') AS skill_name,
  COUNT(*) AS total_events,
  SUM(CASE WHEN duration_ms IS NOT NULL THEN 1 ELSE 0 END) AS with_duration_ms,
  SUM(CASE WHEN column_session_id IS NULL AND body_session_id IS NOT NULL THEN 1 ELSE 0 END) AS pre_phase_13_session_rows,
  SUM(CASE WHEN column_skill_name IS NULL AND body_skill_name IS NOT NULL THEN 1 ELSE 0 END) AS pre_phase_13_skill_rows
FROM skill_events
GROUP BY 1
ORDER BY with_duration_ms DESC;
```

**CLI invocation:**
```
$ sqlite3 -header -column data/cmc.db "<the WITH-CTE query above>"
```

**Verbatim output:**
```
skill_name        total_events  with_duration_ms  pre_phase_13_session_rows  pre_phase_13_skill_rows
----------------  ------------  ----------------  -------------------------  -----------------------
spike-test-skill  1             0                 0                          1
```

**Result:** FAIL — Zero rows met threshold. The single `skill_activated` row in the 30-day window does NOT carry a `duration_ms` body attribute (`with_duration_ms = 0`). Diagnosis: **structural absence of duration_ms** (see §Negative Finding for weak-vs-strong distinction).

### Direct attribute-key enumeration (counter-evidence)

To rule out a query bug (i.e. the json_each idiom missing a key that is actually present), a direct enumeration of every `attribute.key` on every `skill_activated` row was run:

**Query:**
```sql
SELECT json_extract(value,'$.key') AS attr_key
  FROM otel_events o, json_each(json_extract(o.body,'$.record.attributes'))
 WHERE o.event_name='skill_activated'
 ORDER BY 1;
```

**Verbatim output:**
```
attr_key
-----------------
event.name
event.sequence
event.timestamp
organization.id
prompt.id
session.id
skill.name
skill.source
terminal.type
user.account_id
user.account_uuid
user.email
user.id
```

`duration_ms` does NOT appear in the attribute set. The CT-1 query is correct; the data is structurally missing the field. (Per T-22-02 disposition: only attribute-key names are reproduced here, not their values — key names are not PII.)

## Probe 2 — CT-3 Negative-Residual Guard

**Result:** N/A — CT-1 failed; no data to decompose.

Per the failure-isolation rule named in Plan 22-01 §Action ("If Probe 1 (CT-1) FAILS, Probes 2 and 3 do NOT run — there's no data to decompose"), this probe was intentionally not executed at spike time. The `body_ms = total_ms − subagent_ms − tool_ms` reconciliation requires a non-NULL `duration_ms` to be the minuend; with zero qualifying rows the negative-residual guard is undefined.

## Probe 3 — CT-4 Subagent Containment

**Result:** N/A — CT-1 failed; no data to decompose.

Per the failure-isolation rule (same citation as Probe 2 above), this probe was intentionally not executed at spike time. CT-4 evaluates the temporal-containment assumption only over `Agent` rows that overlap a `skill_activated` window with non-NULL `total_ms`; zero qualifying skill rows means no Agent rows enter the join.

## Negative Finding

### Failed threshold(s)

**CT-1 (Coverage)** — failed structurally. The 30-day window contains exactly 1 `skill_activated` row, and its body does NOT carry a `duration_ms` attribute (verified both by the json_each-on-attributes query and by direct attribute-key enumeration). The threshold required `≥1` skill name with `≥30` rows where `duration_ms IS NOT NULL`; observed maximum is `0`.

CT-3 and CT-4 are recorded as `N/A` because they cannot be evaluated without source data.

### Failure diagnosis

This is the **STRONGER** failure mode of the two outlined in the plan:

| Mode | Description | Signal strength | Resolvable? |
|------|-------------|-----------------|-------------|
| Weak | `total_events == 0` — no production skill_activated events in 30-day window | Could clear by user activity | Yes, with skill usage |
| **Strong (THIS CASE)** | `total_events > 0` AND `with_duration_ms == 0` — Claude Code (host version that emitted the row) does NOT emit `duration_ms` on `skill_activated` events | Structural | No — requires upstream emitter change |

The single existing `skill_activated` row (the Phase 12 spike artifact, dated 2026-05-02 22:04:29.559Z) was emitted by the host CLI's actual telemetry path. Its attribute set is fully enumerated above and confirms the absence is structural, not a bug in our extraction idiom.

This distinction is load-bearing per the plan's Pitfall 1 and §Failure-isolation rule: a "weak" failure could be resolved by waiting for organic skill usage, whereas a "strong" failure requires upstream changes to Claude Code's `skill_activated` event payload (or an entirely different event, e.g. a hypothetical end-of-skill marker — which we are forbidden from inventing per Plan §Banned interpretations and ROADMAP Success Criterion #4).

### Counter-evidence

The CT-1 query's verbatim output (`with_duration_ms = 0`) and the direct attribute-key enumeration (no `duration_ms` key) constitute the counter-evidence. Both are reproduced verbatim above in §Probe 1.

### Re-evaluation criteria for v1.3

This spike could be re-run successfully in v1.3 only if **all** of the following hold:

1. **Emitter change upstream:** Claude Code (or whichever CLI ingests into `data/cmc.db`) starts emitting a `duration_ms` attribute on the `skill_activated` event payload. The user can monitor this with the attribute-key enumeration query above; the day `duration_ms` appears in that result, the structural blocker clears.
2. **Coverage threshold:** at least one skill name accumulates `≥ MIN_LATENCY_SAMPLES (30)` `skill_activated` rows where `duration_ms IS NOT NULL` in the active 30-day window — re-runnable verbatim with Probe 1.
3. **Decomposition still feasible:** Probes 2 (CT-3) and 3 (CT-4) re-pass against the new sample. CT-3's negative-residual guard tests whether `Agent`/inner-tool durations overcount the parent skill's wall-clock. CT-4 tests the assumption that subagent inner tools live in the subagent's own session_id.

If criterion 1 is not met by v1.3 milestone planning, SKLP-11 either remains descoped indefinitely or is rescoped (e.g., to use `tools.duration_ms` aggregates only, with no per-skill body/subagent/tool split — that's a different requirement, NOT this one).

### Descope action (anchored by this document)

**Deferred to v1.3.** Plan 22-02-descope (to be authored by a future `/gsd-plan-phase 22` invocation) will:

- Flip SKLP-11 status in `REQUIREMENTS.md` (move from §Skills Polish to §Future Requirements §Skills v1.3+).
- Update the REQUIREMENTS.md Traceability table accordingly.
- Confirm the Phase 23 dependency note in `ROADMAP.md` is still accurate (Phase 23 should not block on SKLP-11).
- Anchor its `must_haves.truths` on this document's §Outcome banner and §Negative Finding.

Phase 22 closes with `Complete (descoped)` status; Phase 23 begins on schedule.

## Anti-Fake-Decomposition Reaffirmation

This document and this phase commit to honest accounting:

- No fabricated `duration_ms` derivations from synthetic timing arithmetic.
- No "approximate" body-vs-subagent splits.
- No invented event types (e.g. a fictional `skill_completed` event the host doesn't emit) — verbatim forbidden by ROADMAP Success Criterion #4.
- No fractional-of-total estimation in lieu of a real measured value (e.g. "0.6 × duration_ms") — verbatim forbidden by ROADMAP Success Criterion #1.

Threshold CT-1 failed structurally. The only honest path is descope to v1.3. This descope decision is final for v1.2 and is anchored on the verbatim sqlite3 evidence captured above.

## Next Steps

- User re-invokes `/gsd-plan-phase 22` to add **Plan 02-descope** (REQUIREMENTS.md flip + Traceability table update + section move from §Skills Polish to §Future Requirements §Skills v1.3+; verify Phase 23 dependency note in ROADMAP.md still accurate). Plan 02-descope's `must_haves` anchor on this document's §Outcome and §Negative Finding.
- Phase 22 closes with `Complete (descoped)` status; Phase 23 begins on schedule.
