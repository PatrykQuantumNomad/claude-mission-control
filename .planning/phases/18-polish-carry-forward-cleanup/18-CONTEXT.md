# Phase 18: Polish & Carry-Forward Cleanup - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Discharge accumulated v1.1 carried debt — POLI-06 (`datetime.utcnow` deprecation sweep behind a centralized helper), POLI-07 (deterministic `SchedulesCard.test.tsx` clock), POLI-08 (Playwright strict-mode selector cleanup with a documented `data-testid` convention) — so every subsequent v1.2 phase runs against a green CI baseline with no false-signal noise. Phase exits with backend pytest, frontend vitest, and Playwright e2e all green and a recorded baseline pass count for downstream phases to compare against.

This phase is deliberately scoped as an **aggressive green-baseline sweep**: adjacent issues uncovered while addressing POLI-06/07/08 are fixed in-phase rather than deferred (see Cleanup Scope Discipline below).

</domain>

<decisions>
## Implementation Decisions

### Time helper API (POLI-06)
- **Module:** `cmc/core/time.py` — single canonical home for naive-UTC time concerns.
- **Primary function:** `now_utc()` — returns `datetime.now(UTC).replace(tzinfo=None)` (naive UTC, matches the existing `UTCDatetime` PlainSerializer contract).
- **Module shape:** Small kit, not a single function. Promote a helper into the module if the same pattern appears 3+ times during the sweep (e.g., `today_utc()`, `parse_iso_utc()`); otherwise stay minimal. No speculative helpers.
- **Colocation:** The existing `UTCDatetime` PlainSerializer type moves into (or is re-exported from) `cmc/core/time.py` so all naive-UTC concerns live in one module. Import-update churn from this colocation is part of the same sweep.
- **No deprecation shim.** Hard-delete every `datetime.utcnow` call site in the same PR as the helper introduction.

### Migration sweep approach (POLI-06)
- **Sweep style:** Single sweep commit. Helper + colocated `UTCDatetime` land first; one follow-up commit replaces all 18+ sites in one mechanical diff. Reviewer sees a uniform pattern; bisect-friendly because the sweep is atomic.
- **Tooling:** Claude's discretion — pick whichever combination of `ruff --select UP --fix`, manual edits, and targeted codemod minimizes risk of subtle behavior change. No requirement to introduce a one-off codemod tool dependency.
- **Field factories:** `Field(default_factory=now_utc)` — direct function reference, no module-level constant, no indirection.
- **Verify gate (both required):** `ruff check --select UP` passes clean AND `git grep -nE 'datetime\.utcnow|from datetime import .*utcnow'` returns zero matches across the repo. Both gates must be green to call the sweep done.

### Cleanup scope discipline (aggressive green-baseline)
- **Flaky tests:** Fix every flake encountered during the sweep, not just POLI-07's `SchedulesCard > stale row`. Goal is "green CI baseline" — a lurking flake that fires next week defeats the purpose. Each adjacent flake fix is a separate commit so the diff stays reviewable.
- **Lint debt:** Fix everything `ruff` flags in touched files and during the full-repo `ruff check` pass — not just `UP` rules. Phase 18 doubles as a lint-debt cleanup pass so v1.2 feature phases start genuinely clean. Bigger diff is acceptable.
- **Playwright selectors:** Sweep all e2e specs, not just `schedule-composer.spec.ts` and `alerts.spec.ts`. Run the full Playwright suite in strict mode; fix every ambiguity surfaced. Phase exits with a fully strict-mode-clean e2e suite.
- **Deferred bin:** Anything genuinely out of scope (truly orthogonal cleanup, anything touching feature behavior) is captured in **both** this CONTEXT.md's Deferred Ideas section AND elevated to STATE.md pending todos for milestone-wide visibility.

### data-testid convention (POLI-08)
- **Naming pattern:** `feature-component-element` (kebab-case, path-style). Examples: `schedule-composer-submit`, `alerts-firehose-skill-filter`, `skills-detail-projects-table`. Predictable for grep, scoped by feature, collision-resistant.
- **Documentation location:** Frontend e2e README (e.g., `frontend/tests/e2e/README.md`) — lives next to the Playwright specs that enforce it. CONTRIBUTING.md is **not** updated for this convention; the rule lives where the tooling does.
- **Migration scope:** Sweep all e2e specs. Replace text- and role-based selectors with `data-testid` everywhere strict-mode collides; consistent with the broader "sweep all selectors" cleanup-scope decision.
- **Where the attribute lives:** Source components. Add `data-testid` attrs directly to React components — standard Playwright pattern, simpler tests, no test-only wrapper infra.

### POLI-07 implementation notes
- Refactor `SchedulesCard.test.tsx > stale row` to use `vi.spyOn(Date, 'now')` rather than `vi.useFakeTimers` (locked by ROADMAP success criterion).
- Verify determinism by running the suite under both `TZ=UTC` and `TZ=America/New_York` at simulated 23:55 boundary (locked by ROADMAP success criterion).
- During the broader cleanup sweep: audit other vitest specs for similar `useFakeTimers` patterns and migrate them to `vi.spyOn(Date, 'now')` if they exhibit the same time-of-day flake risk (in scope per aggressive cleanup decision above).

### Verifier baseline
- At phase close, the verifier records baseline pass counts (backend pytest count, frontend vitest count, Playwright e2e count) for downstream Phase 19–23 verifiers to compare against. Recording location is Claude's discretion — likely the phase VERIFICATION.md or a `BASELINE.md` checked into the phase directory.

### Claude's Discretion
- Codemod tooling for the `datetime.utcnow` sweep (manual / `ruff --fix` / one-off libcst — pick whichever is fastest with lowest risk).
- Which "small kit" helpers (if any) to promote into `cmc/core/time.py` beyond `now_utc()`.
- Exact `data-testid` strings on individual components (must follow `feature-component-element` pattern).
- Whether to colocate `UTCDatetime` in `cmc/core/time.py` via move-and-update-imports vs re-export-only (whichever minimizes import churn).
- Recording mechanism for verifier baseline pass counts (PHASE.md / VERIFICATION.md / dedicated BASELINE.md).
- Whether to chunk adjacent flake/lint fixes into separate commits per fix or one cleanup commit per category — whichever keeps diffs reviewable.

</decisions>

<specifics>
## Specific Ideas

- "Green CI baseline" is the load-bearing phrase for this phase. Every scope decision resolves toward maximizing CI signal honesty going into v1.2 feature work, even at the cost of a larger diff.
- The sweep is atomic by design (single helper commit + single replacement commit) — reviewer should see a clean before/after with no half-migrated state.
- `data-testid` convention belongs next to the tools that enforce it (e2e README), not in top-level contributing docs — the rule is enforcement-adjacent, not policy-level.
- No new dependencies, no new top-level routes, no behavior changes. Pure carried-debt discharge.

</specifics>

<deferred>
## Deferred Ideas

None at discussion time — discussion stayed within phase scope. Any adjacent issues uncovered during the sweep itself that are NOT fixed in-phase will be appended here at phase close AND elevated to STATE.md pending todos for milestone-wide visibility.

</deferred>

---

*Phase: 18-polish-carry-forward-cleanup*
*Context gathered: 2026-05-05*
