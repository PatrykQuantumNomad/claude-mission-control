---
phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
plan: 08
subsystem: alerts
tags: [alerts, ux, retry, nl-parse, accessibility, react-query, density-tokens, v11-lock, tdbt-03]

# Dependency graph
requires:
  - phase: 21-alert-anomaly-depth-nl-authoring
    provides: V11 collapsed-failure-mode lock on POST /api/alerts/parse-nl 503 body; AlertNlInput component scaffold with silent inline error (now replaced); useParseAlertNl mutation hook; Pitfall 5 "manual form below NL composer remains usable" invariant
  - phase: 24-shell-density-containment-primitives
    provides: --cmc-space-* density-aware spacing tokens (referenced by the new .cmc-alert-nl__error CSS rules)
  - phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt
    provides: Plan 27-06 cmc-card--bounded className touch on AlertRuleForm; Plan 27-07 KNOWN_METRICS deletion + useAlertMetrics SOLE-SOURCE migration (both at disjoint line ranges from this plan's edits — line 184-236 AlertNlInput component)

provides:
  - Honest non-specific copy + Retry button on AlertNlInput's 503 branch (replaces Phase 21 silent inline `<p>` error)
  - Retry button (data-testid="alert-nl-retry") re-fires useParseAlertNl mutation with same payload pattern as Parse
  - DoS guard via `disabled={m.isPending}` mirroring Parse-button pattern; label toggles between "Retry" and "Retrying…"
  - `showError` latch (m.isError || (hadError && m.isPending)) so the error block stays mounted across the retry's pending window — React Query resets isError → false on next mutate(), which would otherwise unmount the Retry button mid-click
  - .cmc-alert-nl__error + .cmc-alert-nl__error-actions CSS classes using Phase 24 --cmc-space-sm density-aware tokens
  - 5 new vitest cases under "TDBT-03 (Phase 27 Plan 27-08)" describe block; full AlertRuleForm.test.tsx suite 14 → 19 / 0 / 0
  - alert-nl-retry exact-match testid registered in docs/testid-registry.md (Alerts route Phase 27 Plan 27-08 subsection)
  - TDBT-03 requirement complete; SC#5 of Phase 27 satisfied
  - Plan 27-09 close-gate plan ungated for final phase verification + operator sign-off

affects: [27-09, alerts-route, nl-composer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React Query latched-error pattern: when a mutation needs an error-block UI to persist across a retry's pending window (m.isPending=true clears m.isError=true), maintain a local boolean latch via useState+useEffect that sets on m.isError, clears on m.isSuccess, and OR-combines with m.isPending to drive visibility. Avoids the React Query mid-click unmount footgun where rendering the retry button only inside `{m.isError && …}` causes the button to vanish the instant it is clicked."
    - "V11 collapsed-failure-mode lock UX: when a backend response intentionally collapses multiple upstream failure modes into one HTTP status (here 503: missing-API-key OR Haiku-rejecting-output), the frontend MUST render non-specific honest copy. Specific upstream-mode wording is dishonest because the frontend cannot distinguish modes — the backend body is collapsed by contract."
    - "Strict-grep comment-hygiene idiom: success-criteria greps target source files (not test files) for the literal absence of forbidden strings. Code comments that explain WHY those strings are forbidden must rephrase the forbidden vocabulary using neutral substitutes (e.g. 'specific upstream-mode wording' instead of the strings themselves) so the strict grep returns 0 hits. Test files appropriately include the strings as `.not.toMatch` assertion arguments — those are the explicit invariant lock and are excluded from the source-file strict grep by design."

key-files:
  created: []
  modified:
    - frontend/src/components/panels/AlertRuleForm.tsx
    - frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx
    - frontend/src/styles.css
    - docs/testid-registry.md

key-decisions:
  - "LOCKED OPERATOR DECISION 3 honored verbatim: copy is the exact non-specific string 'Couldn't parse this description. The phrasing didn't match a known pattern, or the natural-language service is temporarily unavailable.' No discriminator field added to backend 503 body — V11 collapsed-failure-mode lock preserved. `git diff backend/cmc/api/routes/alerts.py` shows zero changes."
  - "Queue UX intentionally NOT shipped. The success-criteria text 'retry / queue UX' was interpreted as alternatives, not both (planning_context Decision #3 + RESEARCH §TDBT-03: 'A queue (localStorage-of-pending-descriptions, fired when credentials become available) is over-engineered for a single-user localhost dev tool')."
  - "Latched-error state introduced (`hadError` + `showError`) as a Rule 2 missing-critical addition because the bare `{m.isError ? … : null}` rendering would unmount the Retry button mid-click — React Query resets isError → false the instant mutate() fires. The latch is the smallest correct fix; an alternative (rendering Retry on `m.isError || m.isPending`) would render the Retry button on the FIRST Parse click before any error has happened. The OR-with-prior-error form is the only one that preserves both correctness (no false Retry button) and continuity (no mid-click unmount)."

patterns-established:
  - "Latched-error pattern for React Query mutations (see tech-stack.patterns above) — codified for reuse on future composer surfaces that gain Retry affordances"
  - "Strict-grep comment-hygiene idiom — codified for reuse when success-criteria use grep -i on source-file vocabulary"

# Metrics
duration: 9 min
completed: 2026-05-15
---

# Phase 27 Plan 08: AlertNlInput 503 retry UX (TDBT-03) Summary

**Replace the silent inline 503 error on AlertNlInput with honest non-specific copy + a Retry button that re-fires `useParseAlertNl` with the same payload, plus a latched-error state that keeps the error block mounted across the retry's pending window so the disabled "Retrying…" affordance stays visible — backend V11 collapsed-failure-mode lock preserved with zero changes to `backend/cmc/api/routes/alerts.py`.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-15T21:12:54Z
- **Completed:** 2026-05-15T21:22:13Z
- **Tasks:** 1 (single-task plan per plan frontmatter)
- **Files modified:** 4

## Accomplishments

- **Honest copy + Retry button shipped on AlertNlInput's 503 branch.** Phase 21's silent inline `<p>Could not parse — please rephrase</p>` is replaced with a `<div role="alert" class="cmc-alert-nl__error">` block containing the LOCKED OPERATOR DECISION 3 copy verbatim plus a Retry button (`data-testid="alert-nl-retry"`). Retry click re-fires `m.mutate({ description: text })` with the byte-equal payload of the prior Parse click.
- **DoS guard wired.** Retry button is `disabled={m.isPending}` mirroring the Parse button's pattern; label toggles between "Retry" and "Retrying…" reflecting the in-flight state. Mutation-spam → 100-requests/minute pathway closed off (RESEARCH Security Domain).
- **Latched-error state added.** A local `hadError` boolean (set on `m.isError`, cleared on `m.isSuccess`) drives a derived `showError = m.isError || (hadError && m.isPending)` that keeps the error block mounted across the retry's pending window. Without this latch, React Query's automatic `isError → false` reset on the next `mutate()` call would unmount the Retry button mid-click. The full rationale lives in the inline comment + tech-stack.patterns above.
- **Backend route UNCHANGED.** V11 collapsed-failure-mode lock honored verbatim. `git diff dfeb6fa..HEAD -- backend/cmc/api/routes/alerts.py` returns zero lines (verified before AND after the commit).
- **CSS lands in styles.css** using Phase 24's density-aware `--cmc-space-sm` tokens (NOT the legacy `--space-*` tokens) — `.cmc-alert-nl__error` (flex-column + gap) + `.cmc-alert-nl__error-actions` (flex row + gap) inserted immediately after `.cmc-composer__error` to keep adjacent classes co-located.
- **Testid registered.** `alert-nl-retry` added to `docs/testid-registry.md` as an exact-match entry under a new "Alerts route (Phase 27 Plan 27-08 — TDBT-03)" subsection. Documentation explains the V11 lock, the locked operator decision, and why the testid is exact-match (only one Retry button per AlertNlInput instance).
- **5 new vitest cases passing.** Under `AlertRuleForm — TDBT-03 (Phase 27 Plan 27-08): AlertNlInput 503 retry UX`: (1) honest copy + Retry button renders on 503 / (2) Retry re-fires mutation with same payload / (3) Retry disabled while m.isPending (DoS guard) / (4) non-specific copy invariant — NO "credentials missing" / "Anthropic" / "API key" strings / (5) manual ThresholdForm BELOW AlertNlInput remains usable after 503 (Phase 21 Pitfall 5 invariant).
- **Pre-existing Phase 21 test assertion updated** to track the new copy. The Phase 21 `NL parse failure renders inline could-not-parse message; does NOT auto-save` test was asserting `/could not parse/i` against the rendered error wrapper; the assertion now reads `/Couldn.t parse this description/i` (using `.` to match the typographic apostrophe rendered from `&apos;`). The "no auto-save" invariant is unchanged.

## Task Commits

Single-task plan committed atomically:

1. **Task 1: Replace silent inline error with honest copy + Retry button on AlertNlInput 503 branch + register testid + vitest coverage** — `1b6d690` (feat)

_No separate plan-metadata commit yet — the `docs(27-08)` commit that bundles this SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md updates will follow this file write._

## Files Created/Modified

- `frontend/src/components/panels/AlertRuleForm.tsx` — AlertNlInput component: added `useEffect` import; introduced local `hadError` + `showError` latched-state pair; replaced the `m.isError ? <p>Could not parse…</p> : null` branch with the new `<div role="alert" class="cmc-alert-nl__error">` block containing the LOCKED OPERATOR DECISION 3 copy + Retry button; refreshed the file-header docs comment block describing the NL authoring flow (Phase 27 Plan 27-08 addendum); preserved all other regions (AlertRuleForm body, AlertDialog preview modal, etc.) untouched — Plan 27-06 + Plan 27-07's prior edits at disjoint line ranges remain intact (verified via vitest 213→218/0/0 across 43 panel files: zero regressions).
- `frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx` — 5 new TDBT-03 cases appended after the TDBT-02 describe block; 1 pre-existing Phase 21 assertion updated (`/could not parse/i` → `/Couldn.t parse this description/i`); `install503ParseNl` helper added at the top of the new describe block (counts parse-nl/rules POSTs + captures last parse body) plus an inline held-promise pattern for the DoS-guard test (second call hangs until released in cleanup).
- `frontend/src/styles.css` — 2 new class rules (`.cmc-alert-nl__error` + `.cmc-alert-nl__error-actions`) inserted immediately after `.cmc-composer__error`. Both use `--cmc-space-sm` for gap/margin — density-aware (compact=10px, comfortable=12px, cozy=16px). flex-column + flex-row mirrors the established composer-actions idiom.
- `docs/testid-registry.md` — new "Alerts route (Phase 27 Plan 27-08 — TDBT-03)" subsection added immediately after the v1.2-baseline Alerts subsection. Single exact-match entry: `alert-nl-retry` with full provenance + V11-lock rationale + LOCKED OPERATOR DECISION 3 quote.

## Decisions Made

- **LOCKED OPERATOR DECISION 3 honored verbatim** — copy is the exact non-specific string; no discriminator field added to backend 503 body; Queue UX NOT shipped. See key-decisions above.
- **Latched-error state added as Rule 2 missing-critical** — `hadError` + `showError` derivation. The bare `{m.isError ? … : null}` rendering pattern would unmount the Retry button mid-click because React Query clears `isError` synchronously when `mutate()` fires. The latch is the smallest correct fix; the alternative (`m.isError || m.isPending`) would render Retry on the first Parse click. See key-decisions + tech-stack.patterns above.
- **Strict-grep comment hygiene** — code-comment vocabulary in `AlertRuleForm.tsx` deliberately avoids the forbidden strings ("credentials missing" / "Anthropic" / "API key") so the SC#3 grep returns 0 hits. The same strings appear in the test file as `.not.toMatch(…)` arguments (the invariant lock) — that's by design; the SC targets the source file only. Plan 27-07 established this idiom for the same reason (Plan 07's "strict-grep cleanup of comment text mentioning the deleted constant" — Rule 1 deviation).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] Added `hadError` latch state to prevent React Query mid-click unmount of the Retry button**

- **Found during:** Task 1 (TDBT-03 DoS-guard vitest case)
- **Issue:** The plan's reference implementation rendered the error block inside `{m.isError ? … : null}`. React Query clears `m.isError` to `false` the instant `mutate()` fires (the next call's pending state), which would unmount the entire error block — including the Retry button the user just clicked — before the disabled+"Retrying…" affordance can render. The DoS-guard vitest case directly catches this: it asserts that after `user.click(retry)`, the Retry button is still in the DOM but `disabled` and labeled "Retrying…". With the bare `m.isError` gate, the button vanishes instead.
- **Fix:** Added a `hadError` boolean local state via `useState(false)`; a `useEffect` flips it `true` when `m.isError` and `false` when `m.isSuccess`; a derived `showError = m.isError || (hadError && m.isPending)` drives the JSX condition. This keeps the block mounted across the retry's pending window while still correctly hiding it on the very first Parse click (before any error has occurred) and after a subsequent successful parse.
- **Files modified:** `frontend/src/components/panels/AlertRuleForm.tsx` (added `useEffect` to the React import; introduced `hadError` + `showError` near `text` + `m` declarations; renamed the JSX condition from `m.isError` to `showError`).
- **Verification:** All 19/19 vitest cases pass (14 pre-existing + 5 new TDBT-03 cases). DoS-guard test specifically asserts Retry stays in DOM + flips to disabled + "Retrying…" label after the click.
- **Committed in:** `1b6d690` (Task 1 commit — bundled with the primary change)

**2. [Rule 1 — Bug] Updated pre-existing Phase 21 vitest assertion to track the new locked copy**

- **Found during:** Task 1 (running the full AlertRuleForm.test.tsx suite after the AlertRuleForm.tsx edit)
- **Issue:** The Phase 21 test `NL parse failure renders inline could-not-parse message; does NOT auto-save` asserted `expect(text).toMatch(/could not parse/i)` against the rendered alert wrapper's textContent. After the copy change ("Could not parse — please rephrase" → "Couldn't parse this description. The phrasing didn't match a known pattern…"), the regex no longer matches.
- **Fix:** Updated the assertion to `expect(text).toMatch(/Couldn.t parse this description/i)`. The `.` in the regex matches the typographic apostrophe (`&apos;` → "'"). The surrounding comment was also refreshed to call out the Phase 27 Plan 27-08 copy update. The "no auto-save" invariant (the next-line `expect(rulesPostCapture.body).toBeNull()`) is unchanged.
- **Files modified:** `frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx` (single assertion + surrounding comment).
- **Verification:** Test passes. The full Phase 21 NL-authoring describe block (4 cases) still passes.
- **Committed in:** `1b6d690` (Task 1 commit — bundled).

**3. [Rule 1 — Bug] Strict-grep comment-hygiene cleanup**

- **Found during:** Running the SC#3 success-criteria grep `grep -i "credentials missing\|Anthropic\|API key" frontend/src/components/panels/AlertRuleForm.tsx` after the initial implementation
- **Issue:** The initial inline comment explaining WHY the copy is non-specific used the very strings the SC was banning — "Adding 'credentials missing' or 'Anthropic API key' would be dishonest". This caused the strict grep to return 3 hits instead of 0.
- **Fix:** Rephrased the comment to use neutral substitutes ("Specific upstream-mode wording would be dishonest"; "useful when an upstream issue clears"). The comment STILL documents the lock — it just doesn't quote the forbidden vocabulary. The test file (`AlertRuleForm.test.tsx`) appropriately retains the strings as `.not.toMatch(…)` arguments (that's the explicit invariant lock); the SC targets the source file only.
- **Files modified:** `frontend/src/components/panels/AlertRuleForm.tsx` (one comment block, ~5 lines).
- **Verification:** `grep -i "credentials missing\|Anthropic\|API key" frontend/src/components/panels/AlertRuleForm.tsx` returns 0 hits (verified post-edit). All 19/19 vitest cases still pass.
- **Committed in:** `1b6d690` (Task 1 commit — bundled).

---

**Total deviations:** 3 auto-fixed (1 Rule 2 missing-critical, 2 Rule 1 bugs)

**Impact on plan:** All three are tightly-scoped fixes that surfaced during verification of plan-specified success criteria; none alter the plan's contract. Deviation 1 is the only structural one (introduces a small piece of local state) — but it's a Rule 2 missing-critical because without it the plan's stated done-criteria item "Retry button is disabled while m.isPending (DoS guard)" is unverifiable (the button vanishes before it can be inspected). Deviations 2 and 3 are mechanical: a stale test assertion + a comment phrasing that violated a strict-grep success criterion (the exact same idiom Plan 27-07 used for its strict-grep cleanup — documented Rule 1 pattern in this project). No scope creep; the plan's file list (4 files) was honored exactly.

## Issues Encountered

None beyond the auto-fixed deviations above. Backend pytest not re-run in this plan — no backend code changes (V11 lock verified twice).

## User Setup Required

None — no environment variables, dashboard config, or external service setup needed.

## Next Phase Readiness

- **Plan 27-09 (close gate) ungated.** TDBT-03 is the last requirement remaining for Phase 27 before final verification. SC#5 of Phase 27 ("NL composer 503 collapse surfaces graceful retry / queue UX with honest 'credentials missing — retry' affordance instead of silent error") is now satisfied. Plan 27-09's checklist can proceed.
- **Phase 27 progress:** 7/9 → 8/9 plans complete.
- **Operator close-gate items pending for Plan 27-09:** full phase verification sweep (backend pytest, frontend vitest, Playwright e2e, tsc, lint, axe, lighthouse, ResponsiveContainer count = 8 lock check), VERIFICATION.md authoring, operator verdict sign-off.
- **No carried blockers.** All deviations were auto-fixed within Task 1; no items added to STATE.md `Blockers/Concerns Carried Forward`.

---
*Phase: 27-per-route-adoption-ii-skills-cost-alerts-tech-debt*
*Completed: 2026-05-15*

## Self-Check: PASSED

- [x] `frontend/src/components/panels/AlertRuleForm.tsx` exists on disk (FOUND)
- [x] `frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx` exists on disk (FOUND)
- [x] `frontend/src/styles.css` exists on disk (FOUND)
- [x] `docs/testid-registry.md` exists on disk (FOUND)
- [x] Task 1 commit `1b6d690` exists in `git log --oneline --all` (FOUND)
- [x] Backend route `backend/cmc/api/routes/alerts.py` UNCHANGED — `git diff dfeb6fa..HEAD -- backend/cmc/api/routes/alerts.py` returns 0 lines (V11 lock honored)
- [x] SC#3 strict grep — `grep -i "credentials missing|Anthropic|API key" frontend/src/components/panels/AlertRuleForm.tsx` returns 0 hits
- [x] SC#1 — `grep "alert-nl-retry" frontend/src/components/panels/AlertRuleForm.tsx` returns 1 hit (the testid on the Retry button)
- [x] SC#2 — `grep "alert-nl-retry" docs/testid-registry.md` returns 1 hit (the registered entry)
- [x] `pnpm test --run src/components/panels/__tests__/AlertRuleForm.test.tsx` → 19/0/0 (14 pre-existing + 5 new TDBT-03 cases)
- [x] `pnpm test --run src/components/panels/__tests__/` → 218/0/0 across 43 files (no regressions vs Plan 27-07's 213/0/0)
- [x] `pnpm tsc --noEmit` clean
- [x] `pnpm lint --max-warnings 0` clean
