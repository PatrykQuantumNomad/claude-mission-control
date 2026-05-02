---
phase: 12-otel-skill-event-spike
plan: 02
subsystem: observability
tags: [otel, otlp, sqlite, skill-events, spike-locks, claude-code-2.1.116, lockable-reference]

# Dependency graph
requires:
  - phase: 12-otel-skill-event-spike
    provides: "12-01-SUMMARY.md (Wave 0 + Wave 1 outcomes) + raw Appendix A in `.planning/research/SPIKE.md` + 12-CONTEXT.md (coverage scope) + 12-RESEARCH.md (Q0-Q13 catalog + STACK.md §1 Context7 fallback citations)"
provides:
  - ".planning/research/SPIKE.md — single canonical lock reference for OTEL skill-event shape (10 locks, 5 VERIFIED + 5 TENTATIVE, Phase 12 P0 hard gate satisfied)"
  - "BUG-A flag (cmc/api/routes/observability.py:535 flat json_extract returns NULL silently for 1,406 tool_decision rows) — Phase 13 INGST-11 collateral fix"
  - "BUG-B flag (cmc/api/routes/ingest.py:103 reads `session_id` underscore vs `session.id` dotted; all 6,392 production rows have NULL session_id column) — Phase 13 INGST-11 critical-path fix"
  - "Cross-references table mapping every lock + bug to specific Phase 13/14/17 consuming artifact (file:line / function / column / endpoint precision)"
  - "Phase 13 follow-up signal: re-run live skill invocation with explicit OTLP exporter env vars in spawned `claude` session to disambiguate Wave 1 negative finding (cause a vs cause b)"
affects: [13-otel-skill-event-ingest, 14-skills-panels, 17-doctor-policy, observability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Anchor-heading deep-link convention: `#### LOCK-N: <name>` produces stable URI fragments (`SPIKE.md#lock-1`, `SPIKE.md#lock-2-skill-name-attribute-key`) Phases 13-17 cite directly"
    - "In-text bracket-tag convention: `[LOCK-N]` for prose pointers; `[VERIFIED]` / `[CITED]` / `[ASSUMED]` provenance tags on every lock heading"
    - "Append-only changelog lifecycle: future re-runs ADD a dated section; superseded locks are explicitly marked `[SUPERSEDED]`, never deleted"
    - "Raw appendix + readable body separation: locks section uses pretty-printed JSON inline (3-10 line excerpts); Appendix A preserves verbatim sqlite3/python output untouched (audit trail for STATE.md P0 hard gate)"
    - "Provenance discipline under negative finding: 5 of 10 locks downgraded to TENTATIVE/CITED with explicit STACK.md §1 → Context7 fallback citations rather than fabricated evidence"

key-files:
  created:
    - .planning/phases/12-otel-skill-event-spike/12-02-SUMMARY.md
  modified:
    - .planning/research/SPIKE.md

key-decisions:
  - "10 locks authored: LOCK-1 through LOCK-10. 5 HIGH-confidence VERIFIED (LOCK-4, LOCK-5, LOCK-6, LOCK-9, LOCK-10) anchored on 6,392 production otel_events rows; 5 TENTATIVE / CITED (LOCK-1, LOCK-2, LOCK-3, LOCK-7, LOCK-8) citing STACK.md §1 → Context7 /ericbuess/claude-code-docs because Wave 1 produced a negative finding (skill body fired, zero OTEL events landed)"
  - "Cross-references table cites SPECIFIC file:line / function / column / endpoint for every lock and both bugs — no generic 'Phase 13 will use this' placeholders. Phase 13 INGST-11 critical path: fix `cmc/api/routes/ingest.py:103` (BUG-B) + add `attrs_skill_name` column + remediate `cmc/api/routes/observability.py:535` (BUG-A) in the same Alembic migration"
  - "ROADMAP success criterion #1 (verbatim SQL output): satisfied — Appendix A preserves Plan 01's raw capture verbatim (Q0-Q13 + JSONL Q7 + 2 representative bodies + Wave 0 summary + Wave 1 negative finding); Q1 output quoted both in Appendix A and inline as TENTATIVE evidence under LOCK-1"
  - "ROADMAP success criterion #2 (skill name attribute key identifiable): TENTATIVELY satisfied — LOCK-2 cites `skill_name` (underscore) per Context7 docs; live verification deferred to Phase 13 follow-up with corrected OTLP env"
  - "ROADMAP success criterion #3a (duration_ms presence): TENTATIVE — LOCK-3 assumes presence by analogy with `api_request` (which carries `duration_ms` HIGH-confidence per Q13)"
  - "ROADMAP success criterion #3b (cache TTL split): HIGH-confidence VERIFIED — LOCK-4 names JSONL `message.usage.cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` as the surface, with both Q6 (OTEL absent across 849 rows) and Q7 (JSONL present, schema confirmed cross-session) cited verbatim"
  - "ROADMAP success criterion #4 (single canonical reference): satisfied — cross-references table maps every lock to a downstream phase + requirement + specific consuming artifact; document uses anchor-heading IDs Phases 13-17 deep-link to via `[SPIKE.md#lock-N]`"

patterns-established:
  - "TENTATIVE-locks-under-negative-finding pattern: when live capture fails, the spike does NOT block. Instead, locks downgrade to CITED with STACK.md / Context7 fallback citations, the empirical attempt is preserved as evidence of the gap, and a Phase N+1 follow-up is registered to re-verify with corrected setup. The spike still ships and unblocks downstream phases."
  - "Cross-references table as a CONTRACT format: every lock row cites a specific file:line / function signature / column / endpoint that downstream phases CONSUME. No generic 'Phase 13 will use this' placeholders — that pattern fails because plans cannot deep-link to a vague reference."

# Metrics
duration: ~4 min
completed: 2026-05-02
---

# Phase 12 Plan 02: Compose SPIKE.md Locks — Summary

**Composed `.planning/research/SPIKE.md` with 10 locks (5 VERIFIED, 5 TENTATIVE), 2 BUG flags for Phase 13, and a cross-reference table mapping every lock to specific consuming artifacts in Phases 13/14/17 — Phase 12 P0 hard gate satisfied; Phase 13 plan can now begin.**

## Performance

- **Duration:** ~4 min (start: 2026-05-02T22:13:26Z; end: 2026-05-02T22:17:44Z; 258 seconds wall clock)
- **Started:** 2026-05-02T22:13:26Z
- **Completed:** 2026-05-02T22:17:44Z
- **Tasks:** 1/1 (fully autonomous; no checkpoints)
- **Files modified:** 1 (`.planning/research/SPIKE.md` — 339 lines added, 2 lines deleted; placeholder header replaced + Changelog appended)
- **Files created:** 1 (this SUMMARY.md)

## Accomplishments

- **10 locks authored** (LOCK-1 through LOCK-10) — exceeds the ≥9-lock requirement.
  - **5 HIGH-confidence VERIFIED:** LOCK-4 (cache TTL split surface), LOCK-5 (session.id dotted), LOCK-6 (no project.* attribute), LOCK-9 (token attribution via JOIN), LOCK-10 (service.version 2.1.116). Each carries a verbatim 3-10 line evidence quote from Appendix A.
  - **5 TENTATIVE / CITED:** LOCK-1 (event name), LOCK-2 (skill name attribute key), LOCK-3 (duration_ms presence), LOCK-7 (multi-skill turn batching), LOCK-8 (error/cancel/failure status). Each cites `STACK.md §1 → Context7 /ericbuess/claude-code-docs` with explicit "TENTATIVE — no live verification this run" note and the empirical zero-row attempt preserved as evidence.
- **Provenance discipline:** every lock heading carries one of `[VERIFIED: see Appendix A — Q<n>]` / `[CITED: STACK.md §1 → Context7 ...]` / `[ASSUMED]`. Zero `[ASSUMED]` locks — the spike used CITED fallback rather than fabricating data when live capture failed.
- **Pitfalls section flags both v1.0 latent bugs** with file:line precision:
  - BUG-A: `cmc/api/routes/observability.py:535` flat `json_extract(body, '$.tool_name')` returns NULL silently for 1,406 `tool_decision` rows — Phase 13 INGST-11 collateral fix
  - BUG-B: `cmc/api/routes/ingest.py:103` reads `session_id` (underscore) instead of `session.id` (dotted); all 6,392 production `otel_events.session_id` columns are NULL — Phase 13 INGST-11 critical-path fix
- **Cross-references table** (12 rows: 10 locks + 2 bugs) maps every lock to a specific consuming artifact:
  - `cmc/api/routes/ingest.py:103` (BUG-B fix), `cmc/api/routes/observability.py:535` (BUG-A fix)
  - `cmc/pricing.py::compute_cost(model, input, output, cache_read, cache_create_5m, cache_create_1h) -> Decimal` (LOCK-4)
  - `cmc/api/routes/skills.py::skill_latency_table` (LOCK-3, LOCK-8)
  - `cmc/api/routes/skills.py::skill_timeline` + `web/src/components/SkillTimeline.tsx` (LOCK-7)
  - `cmc/cost/engine.py::cost_for_skill_invocation` + `cmc/api/routes/cost.py::breakdown` (LOCK-9)
  - `cmc/doctor.py::check_otel_version_drift` (LOCK-10)
  - Single Alembic migration adds `attrs_skill_name` column + index + backfills `session_id` + remediates BUG-A pattern (atomic schema change)
- **Re-run instructions** include the exact `export OTEL_EXPORTER_OTLP_ENDPOINT=...` commands for the Phase 13 follow-up that disambiguates the Wave 1 negative finding.
- **Appendix A preserved verbatim:** git diff confirms only 2 lines deleted from the original Plan 01 file (the `**Captured:** 2026-05-02` line and the `> Placeholder header...` blockquote). All 762 lines of Plan 01's raw capture (Q0-Q13 + 2 representative bodies + Wave 0 summary + Wave 1 negative finding) are byte-identical to the Plan 01 commit.
- **Changelog block stamped** with 2026-05-02 + service.version 2.1.116 + a phased bug-disposition list + the Phase 13 follow-up trigger that will upgrade the 5 TENTATIVE locks to VERIFIED once the OTLP env is corrected.

## Literal answers to ROADMAP success criteria

1. **Verbatim SQL output (criterion #1):** Appendix A preserves Plan 01's raw capture untouched (Q0-Q13 + JSONL Q7 + 2 representative pretty-printed bodies + Wave 0 summary + Wave 1 negative-finding evidence). Plan 02 inline-quotes Q1, Q4, Q5, Q6, Q7, Q9, Q10, Q11, Q13 outputs as evidence under their respective LOCK-N headings. The Q1 result is `(zero rows)` because no `event_name LIKE '%skill%'` rows existed in production at the time of capture; the negative finding is preserved as legitimate evidence.
2. **Skill name attribute key (criterion #2):** `skill_name` (TENTATIVE per LOCK-2 — underscore form per Context7 docs convention; `skill.name` and `name` fallback paths cited in INGST-11 implementation guidance because Wave 1 negative finding precludes empirical confirmation).
3a. **`duration_ms` presence (criterion #3a):** TENTATIVELY PRESENT per LOCK-3 — assumed by analogy with `api_request` (which carries `duration_ms` HIGH-confidence with sample value `"2757"` from Q13 line 463). Phase 14 SKLP-05 must implement a defensive branch that derives latency from `(skill_completed.ts - skill_activated.ts)` or adjacent `tool_result.duration_ms` when the attribute is absent.
3b. **Cache TTL split (criterion #3b):** **JSONL only** per LOCK-4 — at `~/.claude/projects/<hash>/<session>.jsonl` → assistant row → `message.usage.cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`. NOT on OTEL `api_request` (Q6 confirmed both keys absent across all 849 production rows). Correlation key OTEL → JSONL: `request_id` ↔ `requestId`, NEVER timestamp-proximity (Pitfall 7).
4. **Single canonical reference (criterion #4):** SPIKE.md uses anchor-heading IDs (`#### LOCK-N: <name>` → `SPIKE.md#lock-N-...`) Phases 13-17 deep-link to. Cross-references table cites specific file:line / function / column / endpoint for every consumer. Append-only changelog lifecycle stamped.

## BUG Flags Surfaced for Phase 13

1. **BUG-A** — `cmc/api/routes/observability.py:535` uses flat `json_extract(body, '$.tool_name')`. OTEL attributes are an array of `{key, value}` pairs (not a flat dict), so this returns NULL silently for ALL 1,406 production `tool_decision` rows. Fix: use the json_each pattern (correct SQL provided in SPIKE.md). Phase 13 INGST-11 collateral fix in same Alembic migration as `attrs_skill_name`.

2. **BUG-B** — `cmc/api/routes/ingest.py:103` reads attribute key `session_id` (underscore). Claude Code 2.1.116 emits `session.id` (DOTTED — see LOCK-5 + Q13 representative `api_request` body line 365). Result: `otel_events.session_id` indexed FK column is NULL for ALL 6,392 production rows. Fix: read `session.id` first, fall back to `session_id` for smoke-fixture compat. Same Alembic migration backfills the column for existing rows. Phase 13 INGST-11 critical path.

## Appendix A preservation (P0 hard gate compliance)

`git diff -U0 .planning/research/SPIKE.md HEAD~1` confirmed only 2 lines deleted from the original Plan 01 file: the `**Captured:** 2026-05-02` line and the `> Placeholder header — Plan 02 (Wave 2) replaces this...` blockquote. All other content from Plan 01 (commits b22652b, 8b9682e, 1f96017) is byte-identical in the new file. The new content (339 lines) consists of: 314 lines of header + executive summary + locks + pitfalls + cross-references + re-run instructions PREPENDED before `## Appendix A`, plus 25 lines of Changelog APPENDED after the appendix's last line. STATE.md P0 hard gate satisfied.

## Task Commits

1. **Task 1: Compose SPIKE.md locks, pitfalls, cross-references** — `2a66a4f` (feat)

**Plan metadata commit:** _(this SUMMARY + STATE.md update + ROADMAP update + REQUIREMENTS update; commit hash recorded after final-commit step)_

## Files Created/Modified

- `.planning/research/SPIKE.md` — modified (1,097 lines total; 339 added, 2 deleted vs Plan 01 baseline). Header + provenance metadata + executive summary table + 10 locked findings (LOCK-1 through LOCK-10) + Pitfalls section (BUG-A, BUG-B) + Cross-references table + Re-run instructions all PREPENDED above Appendix A. Changelog APPENDED below Appendix A. Appendix A itself preserved verbatim from Plan 01.
- `.planning/phases/12-otel-skill-event-spike/12-02-SUMMARY.md` — created (this file).

## Decisions Made

- **Provenance downgrade discipline applied per plan instructions:** LOCK-1, LOCK-2, LOCK-3, LOCK-7, LOCK-8 set to `[CITED: STACK.md §1 → Context7 /ericbuess/claude-code-docs]` with explicit "TENTATIVE — no live verification this run" notes because Wave 1 produced a negative finding. LOCK-4, LOCK-5, LOCK-6, LOCK-9, LOCK-10 retained `[VERIFIED]` because they are anchored on the 6,392 production rows in Q1-Q13, NOT on the absent skill rows.
- **`api_request` representative body used as analogy basis for LOCK-3 (duration_ms):** rather than refusing to make any claim about `duration_ms` on skill events, LOCK-3 cites the verified `api_request` carries it (Q13 line 463) and assumes by analogy. Phase 14 SKLP-05 must code defensively for the absent-attribute branch regardless.
- **Cross-references table written as a contract:** every row cites a specific file:line / function / column / endpoint. The plan was explicit ("must say `cmc/pricing.py::compute_cost` reads cache_create_5m from this lock — NOT 'Phase 13 will use this'") and that discipline was held throughout.
- **Did NOT add LOCK-11 / LOCK-12 (plugin/marketplace, dual-surface event_name):** the plan permitted them only "if Q3/Q11/Q13 surfaced rich attributes" — they did not (zero skill rows). Padding the lock count without evidence would weaken provenance discipline. The dual-surface concern (bare `skill_activated` vs prefixed `claude_code.skill_activated`) is folded into LOCK-1 itself rather than splitting it into two locks.

## Deviations from Plan

None — plan executed exactly as written. The TENTATIVE-locks-under-negative-finding branch was explicitly designed by the plan author (line 313 of 12-02-PLAN.md: "If Wave 1 produced no event, downgrade LOCK-1, LOCK-2, LOCK-3, LOCK-7, LOCK-8 to `[CITED: ...]` with explicit 'TENTATIVE — no live verification this run' notes. LOCK-4, LOCK-5, LOCK-6, LOCK-9, LOCK-10 are VERIFIABLE from the existing 6,392 rows even without skill events, so they should remain `[VERIFIED]` regardless of Wave 1 outcome.") and was followed precisely.

## Issues Encountered

None. All 15 verification gate grep invariants passed on first run:

- Test 2: `grep -c '^#### LOCK-'` = 10 (≥9 required)
- Test 3: `grep -E -c '\[(VERIFIED|CITED|ASSUMED)'` = 12 (≥9 required)
- Tests 4-15: all sentinel strings present (`^## Pitfalls`, `^## Cross-references`, `^## Changelog`, `^## Appendix A`, `BUG-A`/`observability.py:535`, `BUG-B`/`ingest.py:103`, `sqlite3 data/cmc.db`, `cache_creation.ephemeral_5m_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`, `session.id`, `service.version`, `2.1.116`)

## User Setup Required

None — Phase 12 ships with skill-scoped locks as TENTATIVE / CITED. The Phase 13 follow-up to disambiguate the Wave 1 negative finding (re-run with explicit `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` env vars in spawned `claude` session) is the appropriate next step but is NOT a blocker for Phase 13 plan authoring — Phase 13 INGST-11 can proceed with the TENTATIVE locks plus a re-verify checkpoint as part of its own execution.

## Next Phase Readiness

**Phase 13 plan can now begin — cite SPIKE.md#lock-2, #lock-4, #lock-5, #lock-9 for INGST-11/ANLY-01.**

Specifically, Phase 13 plans now have:

- [LOCK-2](#lock-2-skill-name-attribute-key) → `attrs_skill_name` ingest extraction key (TENTATIVE: `skill_name` underscore; defensive fallback to `skill.name` / `name`)
- [LOCK-4](#lock-4-cache-ttl-split-surface) → `compute_cost(..., cache_create_5m, cache_create_1h)` reads from JSONL `message.usage.cache_creation.ephemeral_{5m,1h}_input_tokens` joined via `request_id` / `requestId`
- [LOCK-5](#lock-5-session-correlation-attribute-key) → ingest fix at `cmc/api/routes/ingest.py:103` reads `session.id` (DOTTED)
- [LOCK-9](#lock-9-token-attribution-location) → JOIN `skill_activated` → adjacent `api_request` for tokens; JSONL for TTL split
- [BUG-A](#bug-a-cmcapiroutesobservabilitypy535-flat-json_extract-returns-null-silently) + [BUG-B](#bug-b-cmcapiroutesingestpy103-reads-session_id-underscore-instead-of-sessionid-dotted) → both fixes folded into the same Alembic migration that adds `attrs_skill_name` (atomic schema change)

**Phase 13 follow-up (open):** re-run the live skill invocation with explicit OTLP exporter env vars set to disambiguate the Wave 1 negative finding (cause a: Claude Code 2.1.116 may not emit skill events; cause b: endpoint mis-config — favored). Once disambiguated, append a new dated Changelog section to SPIKE.md and upgrade LOCK-1, LOCK-2, LOCK-3, LOCK-7, LOCK-8 from TENTATIVE/CITED to VERIFIED.

## Self-Check: PASSED

- FOUND: `.planning/research/SPIKE.md` (1,097 lines)
- FOUND: `.planning/phases/12-otel-skill-event-spike/12-02-SUMMARY.md`
- FOUND: commit `2a66a4f` (Task 1 — feat(12-02): compose SPIKE.md locks, pitfalls, cross-references)
- FOUND: 10 LOCK headings (`grep -c '^#### LOCK-'` = 10)
- FOUND: 12 provenance tags (`grep -E -c '\[(VERIFIED|CITED|ASSUMED)'` = 12)
- FOUND: BUG-A reference (`observability.py:535`)
- FOUND: BUG-B reference (`ingest.py:103`)
- FOUND: All 15 grep invariants pass
- FOUND: Appendix A preserved verbatim (git diff confirmed only 2-line deletion limited to placeholder header)

---
*Phase: 12-otel-skill-event-spike*
*Completed: 2026-05-02*
