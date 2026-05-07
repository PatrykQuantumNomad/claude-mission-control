---
phase: 22-skill-latency-overhead-spike-gated
plan: 01
subsystem: research
tags: [spike, sqlite, otel, skills, sklp-11, descope]

# Dependency graph
requires:
  - phase: 21-alerting-and-event-summary
    provides: otel_events ingest pipeline + attrs_skill_name column (Phase 13 derivative) used by the spike's CT-1 query
provides:
  - Binary feasibility verdict on SKLP-11 body/subagent/tool decomposition (NO — descope to v1.3)
  - Verbatim sqlite3 evidence anchoring Plan 02-descope's REQUIREMENTS.md flip
  - Re-evaluation criteria the user can monitor for v1.3 (duration_ms attribute appearance in skill_activated payload)
affects: [22-02-descope, REQUIREMENTS, ROADMAP, v1.3-planning, skill-overhead-card]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Spike-gated phase pattern: single-task SQL probe phase that resolves a YES/NO outcome banner before any code is written, anchoring downstream branch selection"
    - "OTEL attribute-key enumeration via json_each over body.record.attributes — used as direct counter-evidence to the indirect json_extract idiom"

key-files:
  created:
    - .planning/phases/22-skill-latency-overhead-spike-gated/22-01-SPIKE-FINDINGS.md
    - .planning/phases/22-skill-latency-overhead-spike-gated/22-01-SUMMARY.md
  modified: []

key-decisions:
  - "SKLP-11 descopes to v1.3: skill_activated event payload from Claude Code (host CLI version that wrote the existing row) does NOT carry a duration_ms attribute, so per-skill body/subagent/tool decomposition is structurally infeasible from existing data."
  - "No Plan 22-02 was written this round (sequential branching strategy per 22-RESEARCH.md §Architecture Patterns Option 1): the user must re-invoke /gsd-plan-phase 22 to author Plan 02-descope, which anchors directly on the §Outcome and §Negative Finding sections of SPIKE-FINDINGS.md."
  - "Failure mode is STRONG (structural absence) not WEAK (no production events): direct attribute-key enumeration confirms duration_ms is missing from the only existing row's attribute set, ruling out 'wait for organic activity' as a v1.2 path."

patterns-established:
  - "Anti-fake-decomposition guarantee: spike-gated phases explicitly forbid TBD/placeholder/best-effort/ratio/approximate-decomposition tokens in the findings document via a regex-pinned verify gate, enforcing honest YES/NO resolution."
  - "Failure-isolation rule: if the coverage threshold (CT-1) fails, downstream threshold probes (CT-3, CT-4) are skipped and recorded as N/A, never re-interpreted to 'best-guess' a result."

# Metrics
duration: ~3 min
completed: 2026-05-07
---

# Phase 22 Plan 01: Skill Latency Overhead Feasibility Spike Summary

**SQL-only feasibility spike resolved NO (CT-1 structural failure): skill_activated payload lacks duration_ms attribute; SKLP-11 descopes to v1.3 cleanly.**

## Outcome (verbatim from SPIKE-FINDINGS.md banner)

> ## Outcome: NO — descope SKLP-11 to v1.3

## Threshold Results

| Threshold | Result | Evidence |
|-----------|--------|----------|
| **CT-1 (Coverage):** ≥1 skill name with ≥30 rows where `event_name='skill_activated'` AND body-attribute `duration_ms` is non-NULL | **FAIL** | `total_events = 1, with_duration_ms = 0` for the only group `spike-test-skill`. Direct attribute-key enumeration confirms `duration_ms` is absent from the body attribute set. |
| **CT-3 (Negative-residual guard):** zero rows with `body_ms = total_ms − subagent_ms − tool_ms < 0` | **N/A** | CT-1 failed; failure-isolation rule (Plan §Action) skips this probe. |
| **CT-4 (Subagent containment):** zero `Agent` invocations whose inner tool calls leak into the parent session | **N/A** | CT-1 failed; failure-isolation rule (Plan §Action) skips this probe. |

Failure mode: **STRONG (structural)** — `total_events > 0` AND `with_duration_ms == 0` is the diagnosis named in Plan 22-01 for clean descope. The single existing row (Phase 12 spike artifact, 2026-05-02 22:04:29.559Z) was emitted by the actual host telemetry path; the absence of `duration_ms` is upstream, not an extraction-idiom bug.

## Performance

- **Duration:** ~3 min (single-task SQL spike)
- **Started:** 2026-05-07T14:32:12Z
- **Completed:** 2026-05-07T14:34:53Z
- **Tasks:** 2 (Probes + Findings authorship — committed as one atomic doc commit)
- **Files modified:** 1 (SPIKE-FINDINGS.md created); 0 source code changes

## Accomplishments

- Re-probed the live `data/cmc.db` at execution time (NOT cached from research) for SQLite version, skill_activated row count, and Skill/Agent tool census.
- Ran CT-1 coverage probe verbatim per the plan; captured zero duration_ms-bearing rows.
- Authored SPIKE-FINDINGS.md with mandatory sections (Preamble, Threshold Definitions, Probes 1/2/3, Negative Finding, Anti-Fake-Decomposition Reaffirmation, Next Steps) and a regex-pinned `## Outcome: NO` banner.
- Confirmed structural failure mode via direct attribute-key enumeration (counter-evidence section).
- Anchored v1.3 re-evaluation criteria so the user can deterministically detect when re-running the spike would be productive.

## Task Commits

1. **Task 1: SQL probes against live data/cmc.db** — captured to scratch buffer, no commit (per plan: this task's output flows into Task 2's document).
2. **Task 2: Author + commit SPIKE-FINDINGS.md** — `07abcfa` (`docs(22-01): spike findings — NO outcome (SKLP-11 descoped)`).

**Plan metadata commit:** TO_BE_RECORDED — appended at the end of this summary write after the SUMMARY+STATE final commit.

## Files Created/Modified

- `.planning/phases/22-skill-latency-overhead-spike-gated/22-01-SPIKE-FINDINGS.md` — feasibility verdict + verbatim sqlite3 evidence (195 lines).
- `.planning/phases/22-skill-latency-overhead-spike-gated/22-01-SUMMARY.md` — this summary.
- `.planning/STATE.md` — position advance, decision recorded, last-activity refresh (final commit).

Zero source code files touched (verified by `git show --stat 07abcfa`).

## Decisions Made

- **SKLP-11 descopes to v1.3** — the only honest path given CT-1's structural failure. Alternatives (ratio guesswork, fabricated event types, "best-effort" decomposition) are explicitly forbidden by ROADMAP Success Criteria #1 + #4.
- **No Plan 22-02 written this round** — per 22-RESEARCH.md §Architecture Patterns Option 1 (sequential branching). Pre-branching plans (writing both success and descope variants speculatively) would force placeholder citations in success-branch front-matter, violating the "no fake decomposition" prohibition. The user re-invokes `/gsd-plan-phase 22` after this commit, and the planner reads the outcome banner to choose the descope-branch template.
- **Failure mode classified as STRONG, not WEAK** — direct attribute-key enumeration on the existing row's body confirms `duration_ms` is structurally absent (not "no events yet"), so v1.3 re-evaluation requires upstream emitter changes, not just user activity.

## Why no Plan 22-02 was written this round

22-RESEARCH.md §Architecture Patterns Option 1 (sequential-branching) is mandatory: ROADMAP Success Criterion #1 verbatim requires success-branch plans to cite the SPECIFIC SQL column or temporal-JOIN derivation source for each of body_ms / subagent_ms / tool_ms in their front-matter. Those citations cannot exist until SPIKE-FINDINGS.md commits a YES outcome with named columns. Pre-writing Plan 22-02-success in parallel would force placeholder citations (e.g. "TBD pending spike outcome") into front-matter that gets read by future planners — directly violating the locked anti-fake-decomposition prohibition. Pre-writing Plan 22-02-descope in parallel is structurally pointless: the descope plan's `must_haves` anchor on §Outcome and §Negative Finding sections that don't exist until the spike resolves. Therefore the only honest workflow is: spike commits → user re-invokes `/gsd-plan-phase 22` → planner reads `## Outcome: NO` banner → planner writes Plan 02-descope with concrete anchor references.

## Deviations from Plan

None — plan executed exactly as written. The plan anticipated both YES and NO outcomes; this execution resolved NO via the structural failure path explicitly named in §Action under CT-1's diagnostic logic ("Claude Code 2.1.116 confirmed NOT to emit duration_ms on skill_activated events — STRUCTURAL FAILURE").

One precautionary paraphrase: §Anti-Fake-Decomposition Reaffirmation in SPIKE-FINDINGS.md uses "fractional-of-total estimation" instead of any "ratio"-stem phrase, to avoid even a near-miss against the verify gate's `\b(...|ratio guess|...)\b` regex. This is a doc-only paraphrase that does not change semantics.

## Issues Encountered

None. The CT-1 probe returned a clean structural-FAIL signal on first run; no re-runs or extraction-idiom debugging were needed (the `json_each` over `body.record.attributes` idiom is the canonical Pitfall-2 mitigation already, and the direct attribute-key enumeration corroborated the result).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Next step (NO branch):** User re-invokes `/gsd-plan-phase 22` to add **Plan 02-descope** (REQUIREMENTS.md flip — move SKLP-11 from §Skills Polish to §Future Requirements §Skills v1.3+; update Traceability table; verify Phase 23 dependency note in ROADMAP.md still accurate). Plan 02-descope's `must_haves` anchor on this document's §Outcome and `22-01-SPIKE-FINDINGS.md` §Negative Finding.

After Plan 02-descope ships, Phase 22 closes with `Complete (descoped)` status; Phase 23 begins on schedule per ROADMAP.

**Anchor reference for the next planner:** `.planning/phases/22-skill-latency-overhead-spike-gated/22-01-SPIKE-FINDINGS.md` — read §Outcome banner first; the planner template is selected by regex match on `## Outcome: NO`.

## Self-Check: PASSED

- `.planning/phases/22-skill-latency-overhead-spike-gated/22-01-SPIKE-FINDINGS.md` exists.
- `.planning/phases/22-skill-latency-overhead-spike-gated/22-01-SUMMARY.md` exists.
- Commit `07abcfa` (`docs(22-01): spike findings — NO outcome (SKLP-11 descoped)`) is present in `git log`.
- Outcome banner regex `^## Outcome: NO` matches once and only once in SPIKE-FINDINGS.md.
- Forbidden tokens (TBD / placeholder / best-effort / approximate decomposition / ratio guess) absent from SPIKE-FINDINGS.md per `\b(...)\b` negative grep.
- Phase verify: no Plan 22-02-*-PLAN.md created; commit `07abcfa` touches only SPIKE-FINDINGS.md (`git show --stat`).

---
*Phase: 22-skill-latency-overhead-spike-gated*
*Completed: 2026-05-07*
