# Phase 17 — Deferred Items

Out-of-scope discoveries that surfaced during plan execution. Per Rule 3 scope
boundary: log them here, do NOT fix them inline.

## From Plan 17-04 execution (2026-05-05)

### schedule-composer.spec.ts pre-existing strict-mode violation

**Discovered while:** Running full e2e suite (`npm run test:e2e --reporter=list`)
to confirm no regressions from the new `sessions-compare.spec.ts`.

**Failure:**
```
schedule-composer.spec.ts:54 — page.getByLabel('Name').fill(name)
strict mode violation: getByLabel('Name') resolved to 2 elements:
  1) <input aria-label="Filter skill name" placeholder="filter skill_name…">
  2) <input ... class="cmc-input">  (the SchedulesComposer Name input)
```

**Verified pre-existing on clean main:** `git stash && npm run test:e2e -- schedule-composer.spec.ts` → same failure WITHOUT any Phase 17 work in the tree.

**Root cause hypothesis:** The OtelEventsCard / firehose filter input on the
/activity page added an `aria-label="Filter skill name"` somewhere in
Phase 14 that now collides with `getByLabel('Name')` when the schedule
composer test calls it. Playwright's strict mode (default since v1.27)
refuses ambiguous matches.

**Why deferred:** This is unrelated to the picker→diff flow that Plan 17-04
covers. Fix belongs in either (a) Plan 17-05 (Doctor — out of e2e scope), or
(b) a follow-up Phase 17 polish ticket that retrofits the schedule-composer
spec to use a more specific selector (e.g. `page.locator('.cmc-form').getByLabel('Name')`).

**Repro:** `cd frontend && npm run test:e2e -- schedule-composer.spec.ts`.

**Suggested fix:** Replace `page.getByLabel('Name').fill(name)` with a
form-scoped locator like
`page.getByRole('form').getByLabel('Name').fill(name)` or use the visible
section heading as a scope. NO production code change needed.

### README.md pricing-engine append (uncommitted on entry)

**Discovered while:** Running `git status` at executor startup. README.md was
already modified in the working tree before Plan 17-04 began executing (the
diff appends a "Pricing And Cost Engine" section starting at line 402).

**Why deferred:** Not part of Plan 17-04's `files_modified` allow-list. Likely
belongs to an earlier in-flight phase or a separate documentation ticket.
Plan 17-04's commit MUST NOT include README.md.

**Action taken:** Left untouched in the working tree; commit was scoped to
`frontend/tests/e2e/sessions-compare.spec.ts` only.
