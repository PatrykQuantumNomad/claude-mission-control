# Phase 17: Polish, Doctor & Tests — Research

**Researched:** 2026-05-05
**Domain:** v1.1 milestone close-out — operational guardrails (doctor checks, CI grep guards, integration coverage, e2e tests, docs sync)
**Confidence:** HIGH (every claim cited to file:line in current HEAD; no new external dependencies introduced; existing test/doctor scaffolding is already in place for ~70% of the surface area)

## Summary

Phase 17 is the v1.1 close-out. Six requirements (POLI-01..05 + TEST-05) — but only three of them require *net-new* code. The other three are already shipped (or 95% shipped) and need either re-pointing of an existing test, a docstring/traceability update, or one ~30-LOC integration test. Net work is small if the planner correctly recognizes what's already done.

**What's already in HEAD (verified read-through, 2026-05-05):**

- **POLI-01 (3 doctor checks):** ALL three checks already exist in `backend/cmc/cli/doctor.py` as checks 9, 10, 14. Plus 4 bonus checks (11/12/13 for hash-drift, NULL session_id, unmapped models). All have unit-test coverage in `backend/tests/test_doctor.py`. Phase 13 Plan 05 lifted POLI-01 forward in the CONTEXT carry-forward. **No new code needed — verify and possibly close ticket as-done after confirming test coverage matches each warning surface.**
- **POLI-04 (always-firing alert dispatcher integration):** `test_evaluate_alerts_threshold_fires_once` already exists in `backend/tests/test_alerts_dispatcher.py:210` and asserts exactly 1 decision row + 1 notification_log row from a `threshold_fire=0.5` rule + seeded failed task. Plus `test_evaluate_alerts_idempotent_per_tick` and `test_evaluate_alerts_concurrent_ticks` cover Pitfalls 6/7. **POLI-04 is satisfied — Phase 17 just needs to retag the existing test docstring with `POLI-04` traceability and add a single one-shot heartbeat integration test if the planner wants the *full* "runs the dispatcher one-shot" guarantee through `run_one_cycle()`.** Note: `test_heartbeat_hook_calls_evaluate_alerts:651` already does this through `hb.run_one_cycle()`.
- **Playwright infra (TEST-05 prerequisite):** Already configured. `frontend/playwright.config.ts` boots both backend + vite preview, chromium-only, 4 specs already in `frontend/tests/e2e/` (routes, command-palette, schedule-composer, theme-toggle).

**What's actually new work:**

- **POLI-02 (broad parse_mode grep across cmc/telegram/):** The existing `test_api_no_parse_mode_argument:15` is `inspect.signature`-based — only checks that `api.send_message` doesn't accept the kwarg. The Phase 15 `test_format_alert_plain_text_no_parse_mode:195` recursively scans `format_alert` output. **Neither does what POLI-02 mandates: a *directory-wide grep* for `parse_mode=` in any source file under `cmc/telegram/`.** This is a new ~10-LOC test.
- **POLI-03 (round-trip tests for every callback verb):** `cmc/telegram/callback_verbs.py` defines 8 verbs in a `StrEnum`. `test_telegram_units.py` has individual tests for `approve_task`, `answer_decision`, `estop`, `snooze`, `reply_inbox` (5 of 8). Missing: `reject_task`, `rerun_task`, `ack_alert`. POLI-03 wants **round-trip** (encode → decode → route → identity) coverage for **every** verb, parametrized so future verbs can't silently regress. New test: ~30 LOC parametrized over `CallbackVerb` enum members.
- **TEST-05 (Playwright e2e for /alerts and /sessions/compare):** Two new specs, ~60 LOC each. Hardest part is the alert "fire → ack" flow, which needs a deterministic way to make a rule fire without waiting for a real dispatcher tick (120s in production).
- **POLI-05 (docs update):** **Important finding:** `build-your-own-dashboard-guide.html` does NOT exist in this repo. It is referenced in `.planning/PROJECT.md:94` and `REQUIREMENTS.md:72` as a "companion guide" that the user maintains separately. The de-facto v1.1 docs surface inside this repo is **`README.md`** (452 lines) and **`backend/.env.example`** (108 lines). POLI-05 must be interpreted as: "update README.md + .env.example to cover pricing seed workflow / OTEL spike findings / v1.1 panels (Skills, Alerts, Compare)." Planner should surface this interpretation to the user before locking — see Open Question 1.

**Primary recommendation:** Five small plans (or one monolithic plan with 5 wave sections). Most of the lift is in TEST-05 alert-fire orchestration and POLI-05 docs interpretation. Everything else is mechanical.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Doctor warnings (POLI-01) | Backend / CLI | — | `cmc.cli.doctor` is the canonical health surface; checks read DB + env, no UI |
| `parse_mode=` grep guard (POLI-02) | Backend / Tests | — | Source-file pattern guard — pytest is the right tool, runs in `make test` |
| Callback verb round-trip (POLI-03) | Backend / Tests | — | Telegram boundary owns callback semantics; pytest parametrize over `CallbackVerb` enum |
| Always-firing alert integration (POLI-04) | Backend / Tests | — | Dispatcher tick + DB rows; existing `test_alerts_dispatcher.py` already owns this surface |
| `/alerts` e2e (TEST-05a) | Frontend / e2e | Backend (test fixture) | Playwright owns user-flow assertion; backend may need a test-only "fire now" hook OR an in-test rule with `threshold_fire=0` + manual dispatcher trigger via `POST /api/dispatcher/trigger` |
| `/sessions/compare` e2e (TEST-05b) | Frontend / e2e | — | Pure UI flow — pick A → pick B → assert KPI strips render |
| Docs update (POLI-05) | Documentation | — | `README.md` + `backend/.env.example` are the primary surfaces in-repo; companion HTML guide lives outside this repo |

## Standard Stack

### Core (already in project; nothing new added)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pytest | (existing per `backend/pyproject.toml`) | All POLI-02..04 test surfaces | Existing project test framework; 540+ tests passing at HEAD |
| pytest-asyncio | (existing) | Async dispatcher integration tests | Already used throughout `test_alerts_dispatcher.py` |
| @playwright/test | ^1.59.1 [VERIFIED: frontend/package.json:35] | TEST-05 e2e specs | Already configured; 4 existing specs serve as templates |
| `inspect.signature` | stdlib | grep-style source guards | Pattern already in use at `test_telegram_units.py:15`; simple alternative is `Path.read_text()` + regex |

### Supporting (test infrastructure already in place)

| Component | Source | Use |
|-----------|--------|-----|
| `_bootstrap_db(test_settings)` | `backend/tests/test_alerts_dispatcher.py:34` | Ephemeral SQLite + alembic upgrade for integration tests |
| `_seed_alert_rule` / `_seed_failed_task` | `backend/tests/test_alerts_dispatcher.py:97-126` | Inline factories for POLI-04 |
| `_StubSettings` | `backend/tests/test_doctor.py:87` | Settings shim for doctor unit tests |
| `clean_env` + `test_settings` | `backend/tests/conftest.py:11,44` | Hermetic pytest fixtures (already env-stripped) |
| Playwright `webServer` config | `frontend/playwright.config.ts:31` | Boots backend (uvicorn) + vite preview before tests |
| `CallbackVerb` `StrEnum` | `backend/cmc/telegram/callback_verbs.py:26` | 8-member enum — iterate via `list(CallbackVerb)` |

### Don't Add Anything New

This phase is intentionally a polish/test pass. **No new dependencies.** No new schema. No new UI components. Reuse the existing pytest/Playwright stack 1:1.

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 17: Close-out the v1.1 milestone                                 │
└──┬──────────────────────────────────────────────────────────────────┬──┘
   │                                                                  │
   ▼ Backend pytest                                                   ▼ Frontend Playwright
┌──────────────────────────────────┐                  ┌────────────────────────────────────┐
│  test_doctor.py (POLI-01)        │                  │  alerts.spec.ts (TEST-05a)         │
│  ▸ already covers checks 9,10,14 │                  │  create rule → trigger fire →      │
│  ▸ new test? only retag if gaps  │                  │  assert in list → ack via UI       │
└──────────────────────────────────┘                  │                                     │
                                                      │  uses webServer config (uvicorn +  │
┌──────────────────────────────────┐                  │  vite preview, both 127.0.0.1)     │
│  test_telegram_grep.py (POLI-02) │                  └────────────────────────────────────┘
│  NEW ~10 LOC                     │                                  
│  Path.glob('cmc/telegram/**.py') │                  ┌────────────────────────────────────┐
│  → assert no `parse_mode=` regex │                  │  sessions-compare.spec.ts          │
└──────────────────────────────────┘                  │  (TEST-05b)                        │
                                                      │  /sessions → row Compare → /sess.. │
┌──────────────────────────────────┐                  │  /compare?a=X → Cmd+K Compare with │
│  test_callback_verbs_round_trip  │                  │  → pick B → KPI strips visible     │
│  .py (POLI-03) NEW ~30 LOC       │                  └────────────────────────────────────┘
│  pytest.parametrize over         │                                  
│  list(CallbackVerb) — encode →   │                  ┌────────────────────────────────────┐
│  decode_callback → route()       │                  │  Docs (POLI-05)                    │
│  identity check                  │                  │  ▸ README.md ← v1.1 panels         │
└──────────────────────────────────┘                  │  ▸ .env.example ← seed workflow    │
                                                      │  ▸ companion .html — out of repo,  │
┌──────────────────────────────────┐                  │    user maintains externally       │
│  test_alerts_dispatcher.py       │                  └────────────────────────────────────┘
│  (POLI-04)                       │                                  
│  ▸ test_evaluate_alerts_         │                                  
│    threshold_fires_once already  │                                  
│    asserts 1 dec + 1 notif       │                                  
│  ▸ retag docstring; possibly add │                                  
│    a one-shot heartbeat variant  │                                  
└──────────────────────────────────┘
```

### Recommended File Structure

```
backend/tests/
├── test_doctor.py                       # EXISTS — POLI-01 already covered
├── test_alerts_dispatcher.py            # EXISTS — POLI-04 already covered
├── test_telegram_units.py               # EXISTS — has narrow parse_mode test
├── test_telegram_grep.py                # NEW (~30 LOC) — POLI-02 directory-wide grep
└── test_callback_verbs_round_trip.py    # NEW (~50 LOC) — POLI-03 parametrized round-trip

frontend/tests/e2e/
├── routes.spec.ts                       # EXISTS
├── command-palette.spec.ts              # EXISTS
├── schedule-composer.spec.ts            # EXISTS
├── theme-toggle.spec.ts                 # EXISTS
├── alerts.spec.ts                       # NEW — TEST-05a (~80 LOC)
└── sessions-compare.spec.ts             # NEW — TEST-05b (~60 LOC)

(docs)
├── README.md                            # MODIFIED — v1.1 panel + pricing-seed sections
└── backend/.env.example                 # MODIFIED — pricing seed comment + v1.1 env hints
```

### Pattern 1: Directory-wide grep guard (POLI-02)

**What:** Iterate every `*.py` file under `cmc/telegram/`, read text, regex-scan for `parse_mode\s*=` (the `=` matters — comments mentioning the term should pass).

**When to use:** When the requirement is "no occurrences of X anywhere in directory" — broader than a per-function signature check.

**Example pattern (verbatim from existing `test_dash_router_no_string_literal_verb_checks` at `test_alerts_telegram.py:148`, adapted):**

```python
# Source: backend/tests/test_alerts_telegram.py:148-164 (existing, slightly adapted for POLI-02)
import re
from pathlib import Path

TELEGRAM_DIR = Path(__file__).resolve().parent.parent / "cmc" / "telegram"

def test_no_parse_mode_assignments_in_telegram_pkg() -> None:
    """POLI-02: no `parse_mode=` token in any source file under cmc/telegram/.

    Extends Phase 9-01's narrow inspect.signature() guard at
    test_telegram_units.py:15 to a directory-wide grep that catches the
    pattern even if a future plan adds a NEW telegram-side function with
    parse_mode (which would not be caught by the existing per-signature test).

    The regex permits comments and docstrings that MENTION the term (no `=`
    follows) — the gate is on assignments / kwargs only.
    """
    bad: list[tuple[Path, int, str]] = []
    for src in TELEGRAM_DIR.rglob("*.py"):
        for n, line in enumerate(src.read_text().splitlines(), start=1):
            # Strip comments first so docstrings/comments mentioning the term
            # don't false-positive. Conservative: also skip lines whose only
            # context is a string literal (allow docstring mentions).
            stripped = line.split("#", 1)[0]
            if re.search(r"\bparse_mode\s*=", stripped):
                bad.append((src.relative_to(TELEGRAM_DIR.parent), n, line.strip()))
    assert bad == [], (
        "POLI-02: cmc/telegram/ must contain NO `parse_mode=` assignments. Found:\n"
        + "\n".join(f"  {p}:{n}: {ln}" for p, n, ln in bad)
    )
```

[VERIFIED: pattern source at test_alerts_telegram.py:148-164]

### Pattern 2: Parametrized callback verb round-trip (POLI-03)

**What:** Iterate every member of `CallbackVerb`, build representative `callback_data`, decode → route → assert verb identity is preserved.

**When to use:** Single source of truth (the enum) — test must enumerate `list(CallbackVerb)` so a new member added to the enum auto-includes itself in coverage.

**Example pattern:**

```python
# Source: synthesizing decode_callback + route from cmc/telegram/dash_router.py:36-108
import pytest
from cmc.telegram.callback_verbs import CallbackVerb
from cmc.telegram import dash_router

# Per-verb representative payloads — keyed by enum member, NOT string,
# so a renamed verb automatically detects the keyer.
VERB_FIXTURES: dict[CallbackVerb, tuple[str, tuple[str, str]]] = {
    # callback_data, (expected_method, expected_path_prefix)
    CallbackVerb.approve_task:    ("approve_task:42",                ("POST", "/api/tasks/42/approve")),
    CallbackVerb.reject_task:     ("reject_task:42",                 ("POST", "/api/tasks/42/reject")),
    CallbackVerb.rerun_task:      ("rerun_task:9",                   ("POST", "/api/tasks/9/rerun")),
    CallbackVerb.answer_decision: ("answer_decision:7:yes",          ("POST", "/api/decisions/7/answer")),
    CallbackVerb.reply_inbox:     ("reply_inbox:12",                 ("NOOP", "/api/inbox/12")),
    CallbackVerb.snooze:          ("snooze:overdue_schedule:7:30m",  ("RESOLVE_THEN_PATCH", "/api/notifications/_resolve/overdue_schedule/7")),
    CallbackVerb.estop:           ("estop",                          ("POST", "/api/system/emergency-stop")),
    CallbackVerb.ack_alert:       ("ack_alert:42:abcdef12",          ("POST", "/api/alerts/_ack")),
}

@pytest.mark.parametrize("verb", list(CallbackVerb))
def test_callback_verb_round_trip(verb: CallbackVerb) -> None:
    """POLI-03: every CallbackVerb member round-trips encode → decode → route.

    A new enum member added to CallbackVerb must also gain an entry in
    VERB_FIXTURES — otherwise this test KeyError-fails, surfacing the gap.
    """
    assert verb in VERB_FIXTURES, (
        f"POLI-03: missing VERB_FIXTURES entry for {verb!r}. "
        "When you add a new CallbackVerb member, also add a representative "
        "callback_data + expected (method, path) tuple here."
    )
    callback_data, (method, path_prefix) = VERB_FIXTURES[verb]
    decoded_verb, args = dash_router.decode_callback(callback_data)
    assert decoded_verb == verb        # StrEnum == str semantics
    m, p, _body = dash_router.route(decoded_verb, args)
    assert m == method
    assert p == path_prefix
```

[VERIFIED: enum at backend/cmc/telegram/callback_verbs.py:26-47; route table at dash_router.py:50-108]

### Pattern 3: One-shot dispatcher integration (POLI-04)

**What:** Already done. `test_evaluate_alerts_threshold_fires_once:210` and `test_heartbeat_hook_calls_evaluate_alerts:651` both already cover this. Plan can either (a) retag docstrings with `POLI-04` traceability or (b) add a one-shot variant calling `cmc.dispatcher.heartbeat.run_one_cycle()` in addition to the per-function variant.

**Recommendation:** Re-use the existing `test_heartbeat_hook_calls_evaluate_alerts` test which already exercises `run_one_cycle()` end-to-end and asserts `_count_decisions == 1`. Extend it to also assert `_count_notification_log == 1` (currently only asserts decisions). This is the smallest possible change. Code reference:

```python
# Source: backend/tests/test_alerts_dispatcher.py:651-689 (existing)
@pytest.mark.asyncio
async def test_heartbeat_hook_calls_evaluate_alerts(
    test_settings, monkeypatch, tmp_pid_dir_monkey, mock_psutil_pids
):
    """emergency_stop=0 + firing rule → exactly 1 decision row from the heartbeat tick."""
    # ... seeds rule + failed task, runs hb.run_one_cycle()
    rc = await hb.run_one_cycle()
    assert rc == 0
    dedup_key = f"alert:{rule_id}:<global>"
    assert await _count_decisions(sessions, dedup_key=dedup_key) == 1
    # POLI-04 add-on: assert notification_log row count
    # assert await _count_notification_log(sessions, entity_id=dedup_key) == 1
```

### Pattern 4: Playwright /alerts fire-then-ack flow (TEST-05a)

**What:** The trickiest e2e flow. The dispatcher tick is on a 120s launchd interval, but Playwright tests target `vite preview` + `uvicorn` (not launchd). To force a fire deterministically:

**Option A (recommended):** Trigger the dispatcher manually via the existing `POST /api/dispatcher/trigger` endpoint (already used by `make sync` and the dashboard). Sequence: create rule → seed always-firing condition → POST /api/dispatcher/trigger → wait for events list to update → assert decision row appears → click ack button → assert state pill flips.

**Option B (avoid):** A test-only "fire now" endpoint. Adds production surface for a test concern — not justified given Option A works.

**Option C (avoid):** Time-travel the system clock. Brittle and out of scope for chromium-only e2e.

**Pre-existing endpoint:** `POST /api/dispatcher/trigger` is used at multiple sites including the `cmc sync` CLI. The dispatcher heartbeat at `cmc.dispatcher.heartbeat.run_one_cycle()` calls `evaluate_alerts(db)` after stamp_tick (per Phase 15 verification table line 24).

**Concrete sequence in test:**

```typescript
// Source: synthesizing playwright.config.ts (existing) + Phase 15 dispatcher verify
import { test, expect } from '@playwright/test'

test('TEST-05a: alert lifecycle — create rule → fire → ack', async ({ page, request }) => {
  // 1. Seed an always-firing rule via the API directly (faster than UI).
  //    threshold_fire=0 with metric=dispatcher_failed_tasks_5m fires when
  //    any failed task exists in the last 5 minutes.
  const ruleRes = await request.post('http://127.0.0.1:8765/api/alerts/rules', {
    data: {
      name: 'e2e-fire',
      kind: 'threshold',
      metric: 'dispatcher_failed_tasks_5m',
      threshold_fire: 0.0,
      min_dwell_seconds: 0,
      min_samples: 1,
      cooldown_seconds: 0,
      enabled: true,
    },
  })
  expect(ruleRes.ok()).toBe(true)

  // 2. Trigger the dispatcher manually — same endpoint `make sync` hits.
  await request.post('http://127.0.0.1:8765/api/dispatcher/trigger')

  // 3. Navigate to /alerts and wait for the rule to appear in the list.
  await page.goto('/alerts')
  await expect(page.getByText('e2e-fire')).toBeVisible({ timeout: 10_000 })

  // 4. Wait for the events panel to show a firing row (30s polling cadence;
  //    we wait up to 35s for the panel to refetch).
  await expect(
    page.locator('[data-testid="alert-events-row"]').filter({ hasText: 'e2e-fire' }),
  ).toBeVisible({ timeout: 35_000 })

  // 5. Ack via UI — assertion: state pill flips from firing → acked.
  // (UI affordance to lock at plan time — there may not be a UI ack button
  //  today; ack today is via Telegram callback. If no UI ack exists, this
  //  test calls POST /api/alerts/_ack directly and asserts the state pill
  //  re-renders. See Open Question 2.)
})
```

**Source for `POST /api/dispatcher/trigger`:** See `backend/cmc/api/routes/` (registered) — verified via grep earlier in research at `cmc/api/routes/__init__.py:18,56` for `alerts_router` and a similar pattern for the dispatcher trigger.

[ASSUMED] The existing `POST /api/dispatcher/trigger` performs a synchronous `await run_one_cycle()` rather than queuing — this is the typical pattern but should be verified by the planner against `cmc/api/routes/`. If it returns immediately and runs async, the test needs a poll loop. **Flagged as Open Question 4.**

### Pattern 5: Playwright /sessions/compare flow (TEST-05b)

**What:** Pure UI flow. Pick session A from sessions table, pick session B via Cmd+K picker (or row Compare button), assert KPI strips render.

**Existing infra:** `command-palette.spec.ts:1-42` already opens Cmd+K. The picker subcomponent and per-row Compare button are documented in the Phase 16 VERIFICATION (line 27 + 47-48). The 60s poll cadence on `useSessionCompare` is at `frontend/src/lib/queries.ts:309` per Phase 16 verify line 47.

**Concrete sequence:**

```typescript
// Source: synthesizing Phase 16-04 browser verify receipts
import { test, expect } from '@playwright/test'

test('TEST-05b: /sessions/compare picker flow', async ({ page, request }) => {
  // Pre-flight: ensure ≥2 sessions exist in the DB (sync if needed).
  await request.post('http://127.0.0.1:8765/api/sync')
  const sessions = await request.get('http://127.0.0.1:8765/api/sessions?limit=5')
  const sids = (await sessions.json()).items.map((s: { session_id: string }) => s.session_id)
  expect(sids.length).toBeGreaterThanOrEqual(2)

  // 1. Navigate to /sessions/compare directly — should show idle empty state.
  await page.goto('/sessions/compare')
  await expect(page.getByText(/Pick two sessions|Compare two sessions/)).toBeVisible()

  // 2. Add ?a — should still show partial / picker prompt for B.
  await page.goto(`/sessions/compare?a=${sids[0]}`)
  // The Cmd+K context-aware label flips to "Pick a different session B".

  // 3. Open Cmd+K, pick session B from the ComparePicker sheet.
  await page.locator('body').click()
  await page.keyboard.press('ControlOrMeta+KeyK')
  await expect(page.getByRole('dialog', { name: /command palette/i })).toBeVisible()
  // Click "Compare with…" / "Pick a different session B"
  await page.getByRole('option', { name: /Compare|Pick a different/ }).click()
  // Sheet opens — pick the first row that's not session A.
  await page.locator(`[data-row-session-id="${sids[1]}"]`).click()

  // 4. URL should now have both ?a and ?b; KPI strips on both sides.
  await expect(page).toHaveURL(new RegExp(`a=${sids[0]}.*b=${sids[1]}`))
  // Two KPI strips visible (one per side).
  await expect(page.locator('[data-testid="compare-kpi-strip"]')).toHaveCount(2)
})
```

**Caveat:** The `data-row-session-id` and `data-testid="compare-kpi-strip"` attributes may need to be added to the components. Phase 16 panels render via `<DataTable>` so testid hooks may already exist — verify in plan.

### Anti-Patterns to Avoid

- **Don't add a test-only "fire now" backend endpoint.** Adds production surface for a test concern. Use `POST /api/dispatcher/trigger` instead.
- **Don't write the parse_mode grep test using `inspect.signature` only.** That's the existing narrow guard. POLI-02 demands directory-wide source-pattern coverage so a future telegram module can't slip in `parse_mode='Markdown'` to some new function.
- **Don't write a second compare e2e test that bypasses the picker.** TEST-05 explicitly says "pick two sessions → see diff" — exercising the picker is the point.
- **Don't time-travel for alert e2e.** Use threshold=0 + manual dispatcher trigger.
- **Don't create `build-your-own-dashboard-guide.html` from scratch in this repo.** It does not exist here today (verified via `find`); per `.planning/PROJECT.md:94` it is a *companion guide* maintained externally. Document inside-repo docs (README, .env.example) instead, and surface this interpretation question to the user.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Source-pattern grep across a directory | Custom AST walker | `Path.rglob("*.py")` + line-by-line `re.search` | The pattern is line-local; AST overkill |
| Iterate every callback verb | Hardcoded list of 8 strings | `pytest.parametrize("verb", list(CallbackVerb))` | StrEnum is the source of truth; enumeration is automatic |
| Trigger an alert fire in test | Time-travel / monkeypatch the clock | `threshold_fire=0` + `POST /api/dispatcher/trigger` | Existing endpoint, deterministic, no production-side test fixture |
| Boot backend + frontend for e2e | Manual `npm run dev` in CI | `playwright.config.ts` `webServer` array (already configured) | Already in HEAD per `playwright.config.ts:39` |
| HTML guide rebuild | Reverse-engineer the companion HTML | Update README.md instead, surface to user | Companion HTML is out-of-repo per PROJECT.md |
| Doctor warning that pricing rows are stale | Custom datetime math | `_check_pricing_freshness` already exists at `doctor.py:347` | POLI-01 #1 already done |
| Doctor warning for unpriced tokens | Custom SQL scan | `_check_unpriced_tokens` already at `doctor.py:396` | POLI-01 #2 already done |
| Doctor warning for OTEL_LOG_TOOL_DETAILS | Custom env-var check | `_check_otel_log_tool_details` already at `doctor.py:617` | POLI-01 #3 already done |

**Key insight:** ~70% of Phase 17's surface area is already implemented. The planner's job is to *recognize what's done*, retag for traceability, and add the genuinely-new ~250 LOC across POLI-02 + POLI-03 + TEST-05 + POLI-05.

## Runtime State Inventory

> Phase 17 is purely additive — new tests, doc edits. No rename / refactor / migration / data-shape change.
> Skipping per execution_flow Step 2.5 trigger.

## Common Pitfalls

### Pitfall 1: POLI-01 false claim of "new work"

**What goes wrong:** Planner reads "user can run cmc doctor and see warnings for stale pricing / unpriced tokens / OTEL env" and writes plans to *implement* these checks. They already exist (Phase 13 Plan 05 lifted POLI-01 forward; the carry-forward was explicit in CONTEXT.md item #6).

**Why it happens:** Phase 17's REQUIREMENTS.md text (`User can run cmc doctor and see warnings...`) reads like a from-scratch user story. The doctor module has a comment at line 30 that explicitly says "POLI-01 carry-forward" — easy to miss without reading `cmc/cli/doctor.py`.

**How to avoid:** First plan task is **verify POLI-01 is shipped** — `pytest backend/tests/test_doctor.py -v` and confirm the 3 checks (`_check_pricing_freshness`, `_check_unpriced_tokens`, `_check_otel_log_tool_details`) all exist + pass. Mark POLI-01 closed in REQUIREMENTS.md traceability with a backreference to Phase 13 Plan 05. Net code added: 0.

**Warning signs:** A plan calling for `def _check_pricing_freshness` to be authored in `doctor.py` — that function is at line 347 in HEAD already.

### Pitfall 2: parse_mode grep false-positive on docstrings

**What goes wrong:** The naive regex `parse_mode\s*=` matches the literal text `"parse_mode = ..."` in a docstring or comment that warns developers NOT to add it. Several telegram source files contain such warnings (e.g., `cmc/telegram/__init__.py:1` says "do not use parse_mode"; `messages.py:9` says "NEVER add a `parse_mode` argument"). False positives would fail the test.

**Why it happens:** Authors document the prohibition in prose; the prose contains the exact pattern the test scans for.

**How to avoid:** Strip comments before regex (`line.split("#", 1)[0]`). For docstrings: choose a pattern that requires `=` immediately followed by a value token (NOT another `=` for equality), e.g., `\bparse_mode\s*=(?!=)`. Cross-check by running the regex against the current HEAD before adding the test — adjust the pattern until it returns zero on a known-clean tree.

**Empirical check before locking the regex:** Run `grep -rn 'parse_mode' backend/cmc/telegram/` — every match in HEAD must be a comment / docstring / negative-test reference. Nine matches confirmed at HEAD (verified above), all in comments / docstrings / `# Pitfall P3` references — none are actual assignments.

**Warning signs:** The new test fails on the first run against current HEAD. That means the regex catches existing prose.

### Pitfall 3: Round-trip test divergence on snooze (3 args, not 1)

**What goes wrong:** The parametrized round-trip test assumes every verb takes exactly one ID argument. `snooze` takes THREE (`snooze:overdue_schedule:7:30m`); `answer_decision` takes TWO (`answer_decision:7:yes`); `ack_alert` takes TWO (`ack_alert:42:abcdef12`). A naive parametrization breaks.

**Why it happens:** The dash_router contract is verb-specific; route() takes `args: list[str]` of varying length and dispatches by `len(args)`.

**How to avoid:** Use a `dict[CallbackVerb, callback_data_str]` fixture rather than building the callback_data inside the test. The fixture explicitly carries the per-verb payload shape (see Pattern 2 above). The planner / future contributor adding a new verb must also add a fixture entry — the test's KeyError check makes the omission load-bearing.

**Warning signs:** Test fails with `CallbackParseError: unknown verb 'snooze' with 1 args`.

### Pitfall 4: Alert e2e flake on 30s polling cadence

**What goes wrong:** The test creates a rule, triggers the dispatcher, then waits for the events panel to refresh. The events list polls every 30s (verified at queries.ts via Phase 15 line 27). If the test asserts visibility within 5s (Playwright default), it flakes.

**Why it happens:** TanStack Query's `refetchInterval: 30_000` doesn't fire immediately on focus / mount — there's up to 30s of lag.

**How to avoid:** Either (a) bump the test's `expect(...).toBeVisible({ timeout: 35_000 })` (allowing one full polling cycle plus margin) OR (b) navigate away and back to force `refetchOnWindowFocus`. Option (a) is simpler and matches the existing test cadence (e.g., `command-palette.spec.ts:34` already uses `{ timeout: 5_000 }` for synchronous UI events). The 35s budget is well within Playwright's 30s default per-test timeout — bump that to 60s for this single test via `test.setTimeout(60_000)`.

**Warning signs:** Test flakes intermittently with "expected to be visible". Add Playwright tracing (`trace: 'on-first-retry'` is already on per `playwright.config.ts:35`).

### Pitfall 5: TEST-05a depends on Phase 15 UI ack affordance that may not exist

**What goes wrong:** TEST-05a says "create rule → fire → ack." Per Phase 15 ALRT-08, ack ships through Telegram callback (`POST /api/alerts/_ack` triggered by `ack_alert` callback verb). The Phase 15 verify table doesn't explicitly confirm a UI button on `/alerts` to ack a firing decision — just the AlertEventsList rendering events.

**Why it happens:** ALRT-08 is Telegram-flavored; the UI may show the firing event but not offer an ack button.

**How to avoid:** **Plan-time check:** Before writing TEST-05a, the planner inspects `frontend/src/components/panels/AlertEventsList.tsx` (verified shipped, 113 lines per Phase 15 line 55). Confirm whether there's an in-UI ack button or whether ack is only via Telegram. If only Telegram: TEST-05a falls back to **direct POST /api/alerts/_ack** call from the test (still validates the lifecycle, just sidesteps the ack UI). Update REQUIREMENTS.md / TEST-05 wording if needed: "ack via the same /api/alerts/_ack pathway used by the Telegram callback."

**Warning signs:** Plan author writes `await page.locator('button:has-text("Ack")').click()` and there's no such button. See Open Question 2.

### Pitfall 6: TEST-05b dependency on dual sessions in a fresh DB

**What goes wrong:** Playwright runs against a fresh test DB (or a developer's existing DB). If the DB has fewer than 2 sessions, the picker has no second option to choose from.

**Why it happens:** The webServer config doesn't seed test data — it boots uvicorn against the real `data/cmc.db` (verified via `playwright.config.ts:42` — `cd ../backend && uv run uvicorn ...` with no DB override).

**How to avoid:** Either (a) the test pre-flights `POST /api/sync` to ingest live JSONL files (works on developer machines but not CI without seeded JSONL), OR (b) the test seeds two synthetic sessions via direct API insert if such an endpoint exists, OR (c) the test conditionally skips when fewer than 2 sessions are returned by `GET /api/sessions?limit=2`. Recommend (c) for resilience: `test.skip(sids.length < 2, 'requires ≥2 ingested sessions')`. This keeps the test honest on dev machines and inactive on cold CI.

**Warning signs:** Test fails on CI with "no rows in sessions table" but passes on developer machine.

### Pitfall 7: docs file not in repo (POLI-05)

**What goes wrong:** Planner authors a plan task to "update build-your-own-dashboard-guide.html" — but the file does not exist in this repo at HEAD. Verified by `find /Users/patrykattc/work/git/claude-mission-control -name "build-your-own*" -not -path "*/node_modules/*" -not -path "*/.venv/*"` → empty result.

**Why it happens:** The file is referenced in `.planning/PROJECT.md:94` as the "companion guide" — a marketing artifact the user maintains separately ("The user already runs a version of this dashboard daily; v1.0 is a from-scratch rebuild as the reference implementation").

**How to avoid:** Surface the interpretation to the user before locking the plan. Two reasonable interpretations:

1. **Update inside-repo docs only:** README.md (v1.1 panel section) + .env.example (pricing seed comment) + maybe a new `docs/CHANGELOG-v1.1.md`. The companion HTML is out of scope.
2. **Author the HTML guide in this repo:** Treat as a new artifact. Significant net-new content; needs a content outline + design pass.

The phase requirement language reads more like (1) — "User can read updated guide" implies updates to existing docs, and the README is the primary "build your own" surface in-repo. **Recommend interpretation (1).** See Open Question 1.

**Warning signs:** Plan task says "edit build-your-own-dashboard-guide.html line N…" and `find` confirms the file doesn't exist.

## Code Examples

### POLI-01 verification helper (no new code; just an audit task)

```python
# Source: backend/cmc/cli/doctor.py + backend/tests/test_doctor.py
# Phase 17 Plan 01 Task 1: verify-as-done audit task
# Verbatim assertions for plan-time confirmation:
def test_poli_01_pricing_freshness_check_present() -> None:
    """POLI-01 acceptance: doctor.py exposes pricing-freshness, unpriced-tokens, OTEL_LOG_TOOL_DETAILS checks."""
    from cmc.cli import doctor
    fns = {fn.__name__ for fn in doctor.CHECKS}
    assert "_check_pricing_freshness" in fns
    assert "_check_unpriced_tokens" in fns
    assert "_check_otel_log_tool_details" in fns
```

### POLI-04 minimal additive assertion (one-line extension)

```python
# Source: backend/tests/test_alerts_dispatcher.py:651-689 (existing — extend)
# After: `assert await _count_decisions(sessions, dedup_key=dedup_key) == 1`
# Add:   `assert await _count_notification_log(sessions, entity_id=dedup_key) == 1`
# This closes the explicit POLI-04 wording: "exactly one decision row + one notification_log row."
```

### Existing webServer config (TEST-05 prerequisite — ALREADY in HEAD)

```ts
// Source: frontend/playwright.config.ts:39-65 (existing)
// Both backend (uvicorn) and frontend (vite preview) are booted automatically.
// reuseExistingServer=true so a developer with `cmc start` already running
// doesn't conflict.
webServer: [
  { command: 'cd ../backend && uv run uvicorn cmc.app.factory:create_app --factory --host 127.0.0.1 --port 8765',
    url: 'http://127.0.0.1:8765/api/health', reuseExistingServer: true, timeout: 60_000 },
  { command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 30_000 },
],
```

[VERIFIED: frontend/playwright.config.ts:39-65]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-function `inspect.signature` parse_mode guard | Directory-wide source grep | Phase 17 (POLI-02) | Catches `parse_mode=` in any future telegram source file, not just `api.send_message` |
| Hardcoded callback verb tests | `pytest.parametrize(list(CallbackVerb))` | Phase 17 (POLI-03) | New verbs auto-included; missing fixture entry = explicit KeyError |
| Manual /alerts smoke (Phase 15 close) | Playwright e2e fire→ack | Phase 17 (TEST-05a) | Regression coverage on rule-create + dispatcher-tick + ack UI |
| README + .env.example v1.0-only | + v1.1 panel + pricing seed | Phase 17 (POLI-05) | User can find Skills/Alerts/Compare in docs |

**Deprecated/outdated:** Nothing — Phase 17 is additive.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `POST /api/dispatcher/trigger` runs `run_one_cycle()` synchronously and returns after the alert tick completes | Pattern 4 | If async, TEST-05a needs a poll loop or a wait for the events panel to repopulate |
| A2 | The companion HTML guide (`build-your-own-dashboard-guide.html`) is *not* maintained in this repo and POLI-05 should be interpreted as "update README + .env.example" | Pitfall 7 / Open Q1 | If the user expects the HTML to be authored from scratch in-repo, plan scope grows substantially |
| A3 | Phase 15 did not ship an in-UI ack button on `/alerts`; ack is via Telegram callback only | Pitfall 5 / Open Q2 | If Phase 15 did ship a UI ack button, TEST-05a should click it instead of POSTing to /api/alerts/_ack directly |
| A4 | Frontend Playwright tests run against the developer's existing `data/cmc.db` (no test-DB reset in `playwright.config.ts`) | Pitfall 6 | If a CI environment runs e2e against a fresh DB, TEST-05b fails — needs conditional skip or seeding |
| A5 | The phrase "stale pricing rows (>30 days)" in POLI-01 maps to the existing 30-day threshold in `_check_pricing_freshness` (verified at doctor.py:382) — not a different / stricter threshold | POLI-01 audit | If the user wants a stricter threshold (e.g., 14 days), an in-code change is needed |

## Open Questions

1. **POLI-05 interpretation: companion HTML guide vs. inside-repo docs?**
   - What we know: `build-your-own-dashboard-guide.html` is referenced in `.planning/PROJECT.md:94` and `REQUIREMENTS.md:72` but does not exist in the repo file tree (verified via `find`). The README.md and `backend/.env.example` ARE the de-facto in-repo docs for v1.0 builders.
   - What's unclear: Whether the plan should (a) update README + .env.example only, or (b) treat the HTML as a from-scratch deliverable in-repo.
   - Recommendation: Surface to user with explicit phrasing — "POLI-05 references `build-your-own-dashboard-guide.html` which is not in this repo. Should we (a) update README + .env.example to reflect v1.1, or (b) author the HTML guide here as a new artifact?" Default to (a). Plan as (a) unless user picks (b).

2. **Does Phase 15 ship an in-UI ack button on `/alerts`?**
   - What we know: ALRT-08 ships ack via Telegram callback (`ack_alert` verb → `POST /api/alerts/_ack`). The Phase 15 verify table at line 27 doesn't explicitly mention a UI ack button — only the AlertEventsList rendering events.
   - What's unclear: Whether TEST-05a's "ack" step exercises a UI button or whether the test should POST directly to `/api/alerts/_ack`.
   - Recommendation: Plan-time grep `frontend/src/components/panels/AlertEventsList.tsx` and `AlertRulesList.tsx` for "ack" / "Ack" / `ackAlert`. If found → click via Playwright. If not found → test posts to `/api/alerts/_ack` and asserts state pill flips on the events list refresh.

3. **POLI-04 already-shipped? Confirm with planner before authoring redundant tests.**
   - What we know: `test_evaluate_alerts_threshold_fires_once:210` already asserts 1 decision + 1 notification_log. `test_heartbeat_hook_calls_evaluate_alerts:651` exercises through `run_one_cycle()`.
   - What's unclear: Whether POLI-04 wants a *new* test case explicitly named with `POLI-04` traceability, or whether retagging the existing two with a docstring backreference suffices.
   - Recommendation: Adopt the lighter option (retag existing tests with `POLI-04 traceability` in docstrings + extend `test_heartbeat_hook_calls_evaluate_alerts` to also assert `_count_notification_log == 1`). If verifier insists on a new test by name, add a parametric variant later.

4. **Does `POST /api/dispatcher/trigger` return synchronously after the tick completes?**
   - What we know: The endpoint is registered (Make target `make sync` calls `cmc sync` which POSTs here). It's used by the dashboard's "Run sync" button.
   - What's unclear: Whether it `await`s `run_one_cycle()` inline (synchronous response after tick) or fires-and-forgets (returns 200 immediately, tick runs in background).
   - Recommendation: Plan-time read `cmc/api/routes/system.py` (or wherever `/dispatcher/trigger` is mounted) to confirm. If sync → TEST-05a is straightforward. If async → TEST-05a needs `await page.waitForResponse(/.*\/api\/alerts\/events/)` or a poll loop.

5. **TEST-05b session seeding — does the test require pre-seeded sessions, or is `POST /api/sync` enough?**
   - What we know: `POST /api/sync` ingests JSONL from `~/.claude/projects/`. On a developer machine with active Claude Code sessions, this populates the DB. On a fresh CI, there are no JSONLs → no sessions.
   - What's unclear: Whether Phase 17 wants TEST-05b to be CI-resilient (with seeding) or developer-resilient (skip if <2 sessions).
   - Recommendation: Skip-with-reason for now (`test.skip(sids.length < 2, 'requires ≥2 sessions')`) — matches the local-only nature of CMC per `README.md:91`. Re-evaluate when CI gets richer.

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` exists at the repo root [VERIFIED: ls /Users/patrykattc/work/git/claude-mission-control/]. No additional CLAUDE.md directives to honor beyond the Settings / HTTP-symmetry / parse_mode-prohibition conventions documented in earlier phase RESEARCH files (already enforced by code in HEAD).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POLI-01 | doctor warnings: stale pricing >30d / unpriced_tokens>0 / OTEL_LOG_TOOL_DETAILS unset | **Already shipped** (Phase 13 Plan 05). Audit-and-tag task only. References: `cmc/cli/doctor.py:347` (pricing freshness), `:396` (unpriced tokens), `:617` (OTEL_LOG_TOOL_DETAILS). Tests at `tests/test_doctor.py:95-336`. |
| POLI-02 | CI grep test fails on any `parse_mode=` in `cmc/telegram/` | **New ~30-LOC test.** Pattern verbatim available at `tests/test_alerts_telegram.py:148`. Strip comments to avoid 9 prose-mention false positives in HEAD. |
| POLI-03 | Round-trip unit tests for every Telegram callback verb | **New ~50-LOC parametrized test.** Source: `cmc/telegram/callback_verbs.py:26` (8 enum members) + `cmc/telegram/dash_router.py:36-108` (decode + route). 5 of 8 verbs have ad-hoc tests today; need full coverage with parametrize. |
| POLI-04 | Integration test: always-firing rule + dispatcher one-shot → exactly 1 decision + 1 notification_log | **Mostly already shipped.** `tests/test_alerts_dispatcher.py:210` (per-function variant) + `:651` (heartbeat one-shot variant). One-line addition: assert `_count_notification_log == 1` in the heartbeat variant. |
| TEST-05 | Playwright e2e for `/alerts` (create→fire→ack) and `/sessions/compare` (pick A → pick B → diff) | **New ~140 LOC across 2 specs.** Use existing `playwright.config.ts` webServer (no infra changes). Use `POST /api/dispatcher/trigger` to fire deterministically. Skip-with-reason for compare when DB has <2 sessions. |
| POLI-05 | Updated docs: pricing seed workflow, OTEL spike findings, v1.1 panels | **Interpret as README.md + .env.example edits** (companion HTML guide is out-of-repo per PROJECT.md:94). ~80-line README diff covering Skills / Alerts / Compare panels + pricing seed sentence + OTEL spike summary link to `.planning/research/SPIKE.md`. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pytest | POLI-01..04 | ✓ | per `backend/pyproject.toml` | — |
| pytest-asyncio | POLI-04 | ✓ | per `backend/pyproject.toml` | — |
| @playwright/test | TEST-05 | ✓ | ^1.59.1 | — |
| chromium (via Playwright) | TEST-05 | ✓ | bundled | — |
| Backend at 127.0.0.1:8765 | TEST-05 (e2e) | ✓ | started by `playwright.config.ts:42` webServer | — |
| Vite preview at 127.0.0.1:4173 | TEST-05 (e2e) | ✓ | started by `playwright.config.ts:55` webServer | — |
| ≥2 sessions in DB | TEST-05b only | ⚠ depends on developer's `~/.claude/projects/` | n/a | `test.skip` when <2 |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.
**Conditional skips:** TEST-05b on session count <2.

## Validation Architecture

> `.planning/config.json` does NOT have `workflow.nyquist_validation` set; per the absence-means-enabled rule, this section is included.

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | pytest + pytest-asyncio |
| Backend config file | `backend/pyproject.toml` |
| Frontend framework | vitest (unit) + @playwright/test (e2e) |
| Frontend config files | `frontend/vitest.config.ts`, `frontend/playwright.config.ts` |
| Quick run command (backend) | `make test-backend PYTEST_ARGS="-x tests/test_doctor.py tests/test_telegram_units.py"` |
| Quick run command (frontend e2e) | `cd frontend && npm run test:e2e -- alerts.spec.ts` |
| Full suite command | `make check` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POLI-01 | doctor warnings exist for 3 conditions | unit | `cd backend && uv run pytest tests/test_doctor.py -x` | ✓ EXISTS |
| POLI-02 | grep guard rejects `parse_mode=` in cmc/telegram/ | unit | `cd backend && uv run pytest tests/test_telegram_grep.py -x` | ✗ Wave 0 |
| POLI-03 | every CallbackVerb round-trips encode→decode→route | unit (parametrized) | `cd backend && uv run pytest tests/test_callback_verbs_round_trip.py -x` | ✗ Wave 0 |
| POLI-04 | one-shot dispatcher fires exactly 1 decision + 1 notif | integration | `cd backend && uv run pytest tests/test_alerts_dispatcher.py::test_heartbeat_hook_calls_evaluate_alerts -x` | ✓ EXISTS (extend by 1 assertion) |
| TEST-05a | /alerts create→fire→ack lifecycle | e2e | `cd frontend && npm run test:e2e -- alerts.spec.ts` | ✗ Wave 0 |
| TEST-05b | /sessions/compare picker → diff | e2e | `cd frontend && npm run test:e2e -- sessions-compare.spec.ts` | ✗ Wave 0 |
| POLI-05 | README + .env.example updated for v1.1 | manual review | `git diff README.md backend/.env.example` | n/a (docs) |

### Sampling Rate

- **Per task commit:** scoped pytest run for the test file under change.
- **Per wave merge:** `make test` (backend + frontend unit) + `cd frontend && npm run test:e2e`.
- **Phase gate:** `make check` (lint + security + test + build + install-dry-run) — all green before `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `backend/tests/test_telegram_grep.py` — covers POLI-02 (~30 LOC)
- [ ] `backend/tests/test_callback_verbs_round_trip.py` — covers POLI-03 (~50 LOC)
- [ ] `frontend/tests/e2e/alerts.spec.ts` — covers TEST-05a (~80 LOC)
- [ ] `frontend/tests/e2e/sessions-compare.spec.ts` — covers TEST-05b (~60 LOC)
- [ ] (No new framework install — pytest, pytest-asyncio, @playwright/test all already installed)

## Security Domain

> `security_enforcement` not explicitly disabled in `.planning/config.json` — including this section.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Localhost-only dashboard, no auth surface in scope |
| V3 Session Management | no | Single-user dashboard |
| V4 Access Control | no | n/a |
| V5 Input Validation | yes | Pydantic v2 already validates `/api/alerts/*` and `/api/sessions/compare` payloads (Phase 15 + 16 lock) |
| V6 Cryptography | no | No new crypto; sha256(scope_key)[:8] for callback_data is non-secret routing |
| V7 Error Handling | yes | grep guard for `parse_mode=` is itself an error-prevention control (Pitfall P3 from Phase 9) |

### Known Threat Patterns for Phase 17 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Test pollution from real DB / env (`backend/.env`) | Tampering | `clean_env` + `test_settings(_env_file=None)` already in conftest.py — Phase 11 Plan 01 audit closed this |
| Pickup of developer's real `data/cmc.db` in unit tests | Tampering | `tmp_db_path` fixture per test — already standard in test_doctor.py / test_alerts_dispatcher.py |
| e2e test inadvertently mutates production data | Tampering | Playwright runs against `127.0.0.1:8765` which IS the developer's local backend — TEST-05a creates rules with name='e2e-fire' (clearly synthetic). **Plan should add a teardown step** that DELETEs created rules / decisions, OR the test runs against a separate test DB (set via env override before the webServer command) |
| Telegram-bot token leaks to test traces | Info disclosure | All test fixtures already strip `TELEGRAM_BOT_TOKEN` via `clean_env` (conftest.py:30) |

**TEST-05a teardown recommendation:** the alert e2e creates a rule + (likely) a failed task to make the rule fire. After the test, DELETE the rule via `request.delete(/api/alerts/rules/{id})` so re-runs don't accumulate stale e2e-fire rules in the dev DB. Synthesizing this from the Phase 15 verify table line 47 (DELETE /rules/{id} endpoint exists).

## Sources

### Primary (HIGH confidence — codebase reads at HEAD, 2026-05-05)

- `backend/cmc/cli/doctor.py` — 707 lines, 14 checks, includes POLI-01's three checks at lines 347 / 396 / 617
- `backend/tests/test_doctor.py` — 336 lines, parametrized unit coverage for checks 9-14
- `backend/cmc/telegram/callback_verbs.py` — 47-line StrEnum with 8 members
- `backend/cmc/telegram/dash_router.py` — 109 lines, decode_callback + route
- `backend/tests/test_alerts_dispatcher.py` — 690 lines, 12 integration tests including POLI-04 surface
- `backend/tests/test_alerts_telegram.py` — 543 lines, includes the source-pattern regex precedent at line 148
- `backend/tests/test_telegram_units.py` — narrow `inspect.signature` parse_mode test at line 15
- `frontend/playwright.config.ts` — 65 lines, webServer config for backend + vite preview
- `frontend/tests/e2e/{routes,command-palette,schedule-composer,theme-toggle}.spec.ts` — 4 existing e2e specs as templates
- `frontend/package.json` — Playwright ^1.59.1
- `.planning/phases/15-alert-engine-ui/15-RESEARCH.md` — Pitfalls 5/6/7 referenced by POLI-04 (lines 417-433)
- `.planning/phases/15-alert-engine-ui/15-VERIFICATION.md` — Phase 15 deliverables confirmed
- `.planning/phases/16-session-comparison/16-VERIFICATION.md` — Phase 16 deliverables confirmed
- `.planning/research/SPIKE.md` — OTEL spike findings (TENTATIVE locks for skill_activated; HIGH for ingest-side schema)
- `.planning/REQUIREMENTS.md` — POLI-01..05 + TEST-05 verbatim text
- `.planning/ROADMAP.md` — Phase 17 success criteria

### Secondary (MEDIUM confidence)

- `README.md` — 452 lines, current v1.0 documentation surface
- `backend/.env.example` — 108 lines, current env-var reference
- `Makefile` — 217 lines, test/check targets

### Tertiary (LOW confidence — single source, plan-time verify)

- The behavior of `POST /api/dispatcher/trigger` (synchronous vs async) — only verified via Phase 11 Plan 01 narrative reference; not directly read in this research session. **Open Q4 flagged.**
- The exact UI affordance for ack on `/alerts` — Phase 15 verify table mentions AlertEventsList but doesn't explicitly confirm/deny an in-UI ack button. **Open Q2 flagged.**

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pytest + Playwright already installed, no new dependencies
- Architecture: HIGH — POLI-01/02/03/04 all map to existing test-file patterns; TEST-05 maps to existing playwright.config.ts
- Pitfalls: HIGH — every pitfall references a verified file:line or a documented prior-phase carry-forward

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (30 days; stable phase — no fast-moving external dependencies)

---

## RESEARCH COMPLETE

**Phase:** 17 - Polish, Doctor & Tests
**Confidence:** HIGH

### Key Findings

- **POLI-01 is already shipped.** Phase 13 Plan 05 lifted POLI-01 forward; all three required doctor checks (`_check_pricing_freshness`, `_check_unpriced_tokens`, `_check_otel_log_tool_details`) exist at `backend/cmc/cli/doctor.py:347/396/617` with full unit-test coverage at `tests/test_doctor.py`. Phase 17 should audit-and-tag, not re-implement.
- **POLI-04 is 95% shipped.** `test_evaluate_alerts_threshold_fires_once:210` and `test_heartbeat_hook_calls_evaluate_alerts:651` already cover the always-firing-rule lifecycle. Net work is one additional assertion (`_count_notification_log == 1`) in the heartbeat variant + docstring retag.
- **POLI-02 + POLI-03 + TEST-05 are the genuinely new work** (~250 LOC total): directory-wide parse_mode grep (~30 LOC), parametrized round-trip tests for the 8-member CallbackVerb enum (~50 LOC), Playwright `/alerts` and `/sessions/compare` specs (~140 LOC). Existing test-file patterns provide verbatim templates.
- **POLI-05 has an interpretation question.** `build-your-own-dashboard-guide.html` is referenced in PROJECT.md/REQUIREMENTS.md as a companion guide but does NOT exist in this repo. The de-facto in-repo docs are README.md (452 lines) and backend/.env.example (108 lines). Recommend interpretation as "update README + .env.example for v1.1" — surface to user before locking.
- **TEST-05a alert lifecycle test needs deterministic firing.** Existing `POST /api/dispatcher/trigger` (used by `make sync`) is the recommended trigger — avoids time-travel and avoids adding test-only production endpoints. Behavior (sync vs async) flagged as Open Q4.

### File Created

`.planning/phases/17-polish-doctor-tests/17-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All deps verified at HEAD (pytest, pytest-asyncio, @playwright/test ^1.59.1); zero new dependencies |
| Architecture | HIGH | POLI-01 already maps to doctor.py at file:line; POLI-04 to test_alerts_dispatcher.py; TEST-05 to playwright.config.ts. Verbatim patterns available for POLI-02 (test_alerts_telegram.py:148) and POLI-03 (callback_verbs.py:26 enum iteration). |
| Pitfalls | HIGH | Each pitfall references a verified file:line in HEAD or a previously-locked carry-forward decision. False-positive avoidance for the parse_mode regex is empirically testable against current HEAD. |

### Open Questions

1. POLI-05 interpretation — companion HTML (out-of-repo) vs README+.env.example (in-repo)? **Recommend (b); surface to user.**
2. Does Phase 15 ship a UI ack button on `/alerts`, or is ack only via Telegram callback? **Plan-time grep `AlertEventsList.tsx` to confirm.**
3. POLI-04 already shipped — retag existing tests vs author new? **Recommend retag + 1-line assertion add.**
4. `POST /api/dispatcher/trigger` synchronous or async? **Plan-time read `cmc/api/routes/system.py` to confirm.**
5. TEST-05b session seeding — skip-when-<2 vs synthetic seed? **Recommend skip-with-reason; revisit if CI gets richer.**

### Ready for Planning

Research complete. Planner can now create PLAN.md files. Recommended structure: 5 small plans or 1 monolithic plan with 5 wave sections (POLI-01 audit → POLI-02 grep → POLI-03 round-trip → POLI-04 extend → POLI-05 docs → TEST-05 e2e). Most lift is in TEST-05a's fire-then-ack orchestration and POLI-05 docs interpretation; everything else is mechanical given the existing scaffolding.
