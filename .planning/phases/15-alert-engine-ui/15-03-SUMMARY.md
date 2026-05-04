---
phase: 15-alert-engine-ui
plan: 03
subsystem: telegram
tags: [telegram, callback-verbs, strenum, plain-text, ack-flow, notifier, sha256-prefix, dedup]

# Dependency graph
requires:
  - phase: 15-alert-engine-ui
    plan: 02
    provides: "evaluate_alerts(db) inserts notification_log rows kind='alert' status='pending'; POST /api/alerts/_ack endpoint + AlertAckRequest schema; dedup_key='alert:{rule_id}:{scope_key}' contract"
  - phase: 15-alert-engine-ui
    plan: 04
    provides: "useAckAlert mutation already wired on the frontend, points at /api/alerts/_ack"
  - phase: 13-cost-skill-foundations
    provides: "alert_state.acked_until column (Plan 15 inherits Phase 13 schema final shape)"
provides:
  - "cmc/telegram/callback_verbs.py — StrEnum CallbackVerb (8 members, locks the 7 existing verbs + ack_alert)"
  - "cmc/telegram/messages.py::format_alert(rule, scope_key, value) -> tuple[str, dict] — plain-text body + single Ack 1h button (callback_data ack_alert:{rule_id}:{sha256(scope_key)[:8]})"
  - "cmc/telegram/notifier.py::_FORMATTER['alert'] + _send_pending_alerts sweep — picks up pending notification_log rows kind='alert' and dispatches via api.send_message"
  - "cmc/dispatcher/alerts.py: D-06 follow-through — local _format_alert_prompt stub deleted; decisions.prompt now stores the EXACT plain-text body via format_alert(rule, scope_key, value)[0]"
  - "ALRT-08 user-facing surface (ack_alert callback_data verb live + routing through /api/alerts/_ack)"
  - "ALRT-11 invariant lock (zero parse_mode= argument usage in cmc/telegram/messages.py / notifier.py / dispatcher/alerts.py)"
affects:
  - 15-05 (/alerts page panels — useAckAlert is already shipped from Plan 04; Plan 05 may surface a UI Ack button alongside the Telegram one without adding new lib surface)
  - 17 (e2e + polish — POLI-03 round-trip tests will use CallbackVerb as the canonical surface; POLI-02 may extend the parse_mode CI grep to the whole telegram tree)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "StrEnum-as-callback-verb-registry: every Telegram callback_data verb lives in ONE module (cmc/telegram/callback_verbs.py). dash_router.py compares against CallbackVerb members for ALL verbs — D-02 says extraction must be COMPLETE, not partial. A regex regression test fails the build if a literal 'if verb == \"foo\"' line slips back in."
    - "Hash-prefix encoding for ≤64-byte callback_data: scope_hash8 = sha256(scope_key.encode()).hexdigest()[:8] keeps 'ack_alert:{rule_id}:{hash8}' compact. Backend resolves the 8-char prefix to the full scope_key in Python (SQLite has no native SHA256) by iterating per-rule alert_state rows. Cheap because v1.0 per-rule scope count is small (<50)."
    - "Per-row session ownership for sweeps with multi-step coherence: _send_pending_alerts opens a fresh `async with sessions() as db` PER row so the rule + state lookups + status writeback live inside one transactional context. Mirrors the per-rule isolation pattern in cmc/dispatcher/alerts.py."
    - "Option A notifier wiring for new notification kinds: caller (Plan 02 evaluate_alerts) inserts the notification_log row at FIRING with status='pending' — the row IS the dedup claim (Pitfall 7). The notifier's sweep only formats + sends + writes back. No double-claim race."
    - "Single-file Telegram tests with bootstrap re-use: tests/test_alerts_telegram.py imports _bootstrap_db + _seed_alert_rule from tests/test_alerts_dispatcher.py for DB fixture reuse — keeps the new tests focused on Plan 03 concerns without duplicating ~50 lines of alembic-upgrade boilerplate."

key-files:
  created:
    - backend/cmc/telegram/callback_verbs.py
    - backend/tests/test_alerts_telegram.py
  modified:
    - backend/cmc/telegram/dash_router.py
    - backend/cmc/telegram/messages.py
    - backend/cmc/telegram/notifier.py
    - backend/cmc/dispatcher/alerts.py

key-decisions:
  - "D-01 (carried from PLAN — RESEARCH Open Q #3): ack_alert callback_data is encoded as 'ack_alert:{rule_id}:{scope_hash8}' where scope_hash8 = sha256(scope_key.encode()).hexdigest()[:8]. Backend resolves 8-char prefix to full scope_key by iterating per-rule alert_state rows in Python (SQLite has no SHA256). v1.0 per-rule scope vocabulary is small (<50) so the linear scan is fine."
  - "D-02 (carried from PLAN — RESEARCH Pitfall 8): callback_verbs.py extraction is COMPLETE. Every verb in dash_router.py compares against a CallbackVerb member; a regression test (test_dash_router_no_string_literal_verb_checks) greps the source and fails the build if any 'if verb == \"literal\"' line slips back in. Phase 17 POLI-03 round-trip tests will use the enum as canonical surface."
  - "D-03 (carried from PLAN): single 'Ack 1h' button per rule. No 'Snooze 30m' second button — ack already suppresses for 1h, which IS the v1.0 snooze duration. Adding a second button duplicates the semantic. Reduces callback_data surface and keeps the layout clean."
  - "D-04 (carried from PLAN): POLI-02 (CI grep guard for parse_mode= across alert paths) is OUT OF SCOPE per scope_boundaries — Phase 17 will pick it up. Plan 03 stays within the existing Phase 9-01 grep guard's coverage by NOT introducing parse_mode= anywhere in cmc/telegram/messages.py — verified by strict grep at exit."
  - "Executor decision (carried from frontmatter): handler.py is intentionally untouched. RESEARCH.md confirms handler.py delegates to dash_router with no direct verb-string comparisons, so the StrEnum refactor is fully absorbed by dash_router.py. files_modified frontmatter does NOT list handler.py."

patterns-established:
  - "Callback-verb extraction must be COMPLETE: when adding a new callback_data verb to a module that already has more than one verb constant, extract the existing constants alongside the new one into a single StrEnum, AND replace every literal-string comparison in the routing module. A regex grep regression test pins the invariant. Partial extraction is a worse outcome than no extraction (drift risk + reader cognitive load)."
  - "≤64-byte callback_data via SHA256 truncation: when callback_data needs to encode an opaque key (scope_key, dedup_key, etc.) that may exceed Telegram's hard 64-byte cap, use sha256(...)[:8] in the encoding and resolve the prefix to the full key in Python at the API layer. Trade-off: 8-char hex = 32 bits = 4B variations vs. per-key collision risk; document the per-key vocabulary upper bound (v1.0 alerts: <50 scopes/rule)."
  - "Notifier sweep wiring contract for new kinds: choose Option A (caller inserts pending; sweep only formats+sends+writebacks) when the caller already has a stronger dedup contract (e.g. partial-unique or atomic INSERT ON CONFLICT) than the notifier's _claim_and_send. The pending-row IS the claim. Avoids the double-insert race when both layers race to claim the same dedup_key."
  - "Per-row session ownership for sweeps with multi-step coherence: when a sweep needs to fetch related rows + mutate the original row + commit (e.g. notifier alert sweep needs AlertRule + AlertState + status writeback in one transactional context), open `async with sessions() as db` PER row inside the sweep loop. Mirrors per-rule isolation in cmc/dispatcher/alerts.py."

# Metrics
metrics:
  duration_minutes: 11
  completed_date: 2026-05-04
  tasks: 3
  commits: 6
  files_created: 2
  files_modified: 4
---

# Phase 15 Plan 03: Telegram Delivery + Ack Feedback Loop Summary

**callback_verbs StrEnum centralizes all 8 verbs + new ack_alert routing; format_alert plain-text composer with sha256(scope_key)[:8] callback_data; notifier picks up Plan 02's pending alert rows and dispatches via api.send_message — closing the Telegram delivery + ack feedback loop.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-05-04T14:58:38Z
- **Completed:** 2026-05-04T15:09:29Z
- **Tasks:** 3 (all `auto` + `tdd=true`)
- **Files created:** 2 (callback_verbs.py + tests/test_alerts_telegram.py)
- **Files modified:** 4 (dash_router.py + messages.py + notifier.py + dispatcher/alerts.py)
- **Tests added:** 17 (7 callback/dash + 6 format/ack + 4 notifier sweep)
- **Backend suite:** 521 baseline → 538 passed (+17 = exact plan target)
- **Commits:** 6 task commits (RED + GREEN per task) + this metadata commit

## Accomplishments

- **callback_verbs.CallbackVerb StrEnum (cmc/telegram/callback_verbs.py)** — central registry of all 8 callback_data verbs (approve_task, reject_task, rerun_task, answer_decision, reply_inbox, snooze, estop, ack_alert). 8-member contract locked by `test_callback_verb_enum_complete`; future plans cannot silently drift the surface. Phase 17 POLI-03 round-trip tests will use this enum as the canonical surface.
- **dash_router.py refactor (D-02)** — every verb in `route()` compares against a `CallbackVerb` member instead of a string literal. StrEnum semantics let the existing `verb: str` parameter still work without coercion (StrEnum members compare equal to their string value). The new ack_alert branch returns `('POST', '/api/alerts/_ack', {'rule_id': int(args[0]), 'scope_hash': args[1]})`. Bad rule_id parses raise CallbackParseError so the handler's existing catch-all closes the user's Telegram spinner cleanly. Regression test `test_dash_router_no_string_literal_verb_checks` greps the module source and fails on any `if verb == "literal"` line.
- **format_alert plain-text composer (cmc/telegram/messages.py)** — `format_alert(rule, scope_key, value) -> (text, kb)`. Plain-text body per ALRT-11 (no parse_mode anywhere) with rule name, metric, scope_key, value, threshold. Single Ack 1h button (D-03). callback_data is `f"{CallbackVerb.ack_alert.value}:{rule.rule_id}:{scope_hash8}"` where scope_hash8 = sha256(scope_key.encode()).hexdigest()[:8]. Worst-case INT32 rule_id + 8-hex hash + verb = 28 bytes — well under Telegram's 64-byte cap.
- **D-06 follow-through in cmc/dispatcher/alerts.py** — Plan 02's local `_format_alert_prompt` stub is **deleted**. `decisions.prompt` now stores the EXACT plain-text body the user sees in Telegram via `format_alert(rule, scope_key, value)[0]`. Auditability: SUMMARY 02 left this as a known follow-through item; Plan 03 closes it as part of Task 2 sub-step 2b (per the plan's own action steps).
- **notifier 6th-kind wiring (cmc/telegram/notifier.py)** — `_FORMATTER` gets a 6th entry: `"alert": _alert_formatter_adapter`. Adapter unwraps a `SimpleNamespace(rule, scope_key, last_value)` into `format_alert(rule, scope_key, value)`. New `_send_pending_alerts(sessions, settings, token, http_client) -> int` sweeps `notification_log` rows where `kind='alert' AND status='pending' AND chat_id=settings.telegram_chat_id`, parses the dedup_key (`alert:{rule_id}:{scope_key}` with maxsplit=2 because scope_key may contain `:`), loads `AlertRule` + `AlertState`, formats, sends, writes back `status='sent'` + `message_id`. Orphan rows (rule deleted between Plan 02 insert + sweep) are marked `status='failed'` so the loop survives. `run_one_cycle` hooks `_send_pending_alerts` after the existing 5-kind sweep so the alert kind contributes to the returned `sent_count`.
- **ALRT-11 invariant preserved** — strict `grep -nE "parse_mode\s*=" cmc/telegram/messages.py cmc/telegram/notifier.py cmc/dispatcher/alerts.py` exits 1 (no matches). The unanchored grep matches docstring/comment mentions of the invariant only — those are deliberate and don't trigger any actual API call.

## Endpoint / Surface Map

| Verb            | callback_data shape                                | Routes to                    | Body                                        |
|-----------------|----------------------------------------------------|------------------------------|---------------------------------------------|
| approve_task    | `approve_task:<id>`                                | POST /api/tasks/{id}/approve | `{}`                                        |
| reject_task     | `reject_task:<id>`                                 | POST /api/tasks/{id}/reject  | `{}`                                        |
| rerun_task      | `rerun_task:<id>`                                  | POST /api/tasks/{id}/rerun   | `{}`                                        |
| answer_decision | `answer_decision:<id>:<yes\|no>`                   | POST /api/decisions/{id}/answer | `{answer, answered_by:'telegram'}`       |
| reply_inbox     | `reply_inbox:<id>`                                 | NOOP (handler-side state)    | `{}`                                        |
| snooze          | `snooze:<kind>:<entity>:<dur>`                     | RESOLVE_THEN_PATCH on /api/notifications | `{duration}`                    |
| estop           | `estop`                                            | POST /api/system/emergency-stop | `{reason:'telegram'}`                    |
| **ack_alert** (NEW) | `ack_alert:<rule_id>:<sha256(scope_key)[:8]>` | POST /api/alerts/_ack        | `{rule_id:int, scope_hash:str}`             |

## Task Commits

1. **Task 1: callback_verbs StrEnum + dash_router refactor + ack_alert verb (TDD):**
   - `3bc36ce` test(15-03): add failing tests for CallbackVerb StrEnum + dash_router ack_alert (RED)
   - `16ecfc8` feat(15-03): create CallbackVerb StrEnum + refactor dash_router + add ack_alert (GREEN)
2. **Task 2: format_alert composer + ack flow integration (TDD):**
   - `7ba79b7` test(15-03): add failing tests for format_alert + ack flow integration (RED)
   - `7064d5c` feat(15-03): add format_alert composer + replace D-06 dispatcher stub (GREEN)
3. **Task 3: notifier alert sweep + run_one_cycle pickup (TDD):**
   - `f906e7d` test(15-03): add failing tests for notifier alert sweep + run_one_cycle pickup (RED)
   - `f6868de` feat(15-03): wire 'alert' kind into notifier _FORMATTER + _send_pending_alerts (GREEN)

**Plan metadata commit:** TBD — final docs commit lands SUMMARY.md + STATE.md + ROADMAP.md updates.

## Files Created

- `backend/cmc/telegram/callback_verbs.py` (~50 lines) — StrEnum CallbackVerb with the 8-member contract. Module docstring cites ALRT-08 + RESEARCH.md Pitfall 8 (extraction must be complete) and explains the StrEnum semantics that let raw decoded strings still compare correctly against members. No project imports — keeps the module loadable even if cmc.telegram.* refactors break.
- `backend/tests/test_alerts_telegram.py` (~580 lines / 17 tests) — single-file Plan 03 test surface: callback_verb enum lock + dash_router routing + format_alert plain-text/callback_data invariants + D-06 follow-through static check + ack flow end-to-end (ack stamps acked_until → next evaluate_alerts tick HOLDs) + notifier alert sweep (sends pending row, marks orphan failed, run_one_cycle integration). Imports `_bootstrap_db` + `_seed_alert_rule` + `_seed_failed_task` from `tests/test_alerts_dispatcher.py` to reuse alembic-upgrade harness.

## Files Modified

- `backend/cmc/telegram/dash_router.py` — added `from cmc.telegram.callback_verbs import CallbackVerb`; replaced every `if verb == "literal"` with `if verb == CallbackVerb.foo`; added the new ack_alert branch (with int(args[0]) parse + CallbackParseError on bad input). Module docstring updated with the new verb table row + the D-02 invariant.
- `backend/cmc/telegram/messages.py` — added `import hashlib` + `from cmc.telegram.callback_verbs import CallbackVerb`; appended `format_alert(rule, scope_key, value)` per the plan's <interfaces> spec (uses `_kb([[("✓ Ack 1h", callback_data)]])` for the keyboard). Module docstring pins the ALRT-11 invariant inline.
- `backend/cmc/telegram/notifier.py` — added `SimpleNamespace` + `AlertRule` + `AlertState` imports; added `_alert_formatter_adapter` (unwraps SimpleNamespace into format_alert call); `_FORMATTER` gets the 6th 'alert' entry; new `_parse_alert_dedup_key(entity_id) -> (rule_id, scope_key) | None` defensive helper; new `_send_pending_alerts(sessions, settings, token, http_client) -> int` sweep; `run_one_cycle` calls `_send_pending_alerts` after the existing per-kind sweep so the alert count contributes to the returned total.
- `backend/cmc/dispatcher/alerts.py` — added `from cmc.telegram.messages import format_alert` to imports; **deleted** the local `_format_alert_prompt` stub function; replaced its single call site at the decision-insert point with `prompt = format_alert(rule, scope_key, value)[0]`. Auditability: decisions.prompt now matches the user-visible Telegram body byte-for-byte.

## Decisions Made

All 4 planner decisions (D-01..D-04) confirmed and applied verbatim. The only executor-side decision was a small wiring detail:

- **`_send_pending_alerts` per-row session ownership**: the plan's Pitfall 6 carry says "open a fresh `async with sessions() as db` PER row OR commit-per-row". Chose per-row session because the alert sweep needs to load AlertRule + AlertState + write back NotificationLog status under ONE transaction — mirrors per-rule isolation in cmc/dispatcher/alerts.py. Single-session-with-commit-per-row would also work, but per-row session is more conservative re: SQLite's per-connection locking and matches the dispatcher's pattern.
- **format_alert recursive parse_mode scan in tests**: the plan's behavioral test for ALRT-11 says "assert NO 'parse_mode' key anywhere in the returned tuple recursively". Implemented `_has_parse_mode(obj)` walking dicts/lists/tuples — defends against a future plan accidentally serializing parse_mode INTO `reply_markup` (rather than as a top-level api.send_message argument). Phase 9-01's grep guard catches the argument case; this catches the embedded-key case.

## Deviations from Plan

None — plan executed exactly as written.

All three TDD tasks went RED → GREEN on the first try. No Rule 1/2/3 auto-fixes were triggered; the only friction was a one-shot ruff hook complaint on the initial RED commit (unused `import hashlib` + import-block sort), which the plan's verification block already anticipated as project-tooling friction and which auto-resolved via `ruff check --fix`. No CLAUDE.md exists in the repo so no project-specific overrides applied.

The Phase 9-01 grep guard for `parse_mode=` returns 0 matches across `cmc/telegram/messages.py`, `cmc/telegram/notifier.py`, and `cmc/dispatcher/alerts.py` — invariant preserved.

The plan's RESEARCH.md verification line `cd backend && grep -E 'if verb == "' cmc/telegram/dash_router.py` exits 1 (no matches) — D-02 invariant verified at the source-grep level (in addition to the in-test regression check).

## Issues Encountered

- **Pre-commit ruff hook on the first RED commit**: ruff flagged the test file's empty `import hashlib` (only the format/ack tests use it; the callback/dash tests don't) plus an `I001` import-block sort ordering. Auto-fixed via the `--fix` flag and a manual removal of the unused `hashlib` import; landed in the same RED commit on retry. Same friction Phase 15 Plans 01 and 02 documented — this is project tooling baseline, not a Plan 03 bug.
- **Test fixture cross-import**: `tests/test_alerts_telegram.py` imports `_bootstrap_db`, `_seed_alert_rule`, and `_seed_failed_task` from `tests/test_alerts_dispatcher.py`. Pyright didn't complain (module path is valid; pytest collects both files into `tests/`) but added `# type: ignore` comments on the imports for safety. Alternative was to duplicate ~50 lines of alembic-upgrade boilerplate into the new test file — chose import-reuse instead per "DRY where it doesn't hurt" rule.

## Authentication Gates

None — plan ships purely server-side surface plus tests. No external API calls, no third-party tokens to obtain. The Telegram bot token + chat_id are already configured (Phase 9), and the test suite uses MockTransport-backed httpx clients so no real Telegram API is hit.

## User Setup Required

None — no external service configuration required. The new ack_alert callback verb is wired through the existing handler.py → dash_router.route → /api/alerts/_ack chain that's been live since Phase 13/Plan 02.

## Next Phase Readiness

**Ready for Plan 15-05 (/alerts page panels):**
- The /alerts page is the last Phase 15 deliverable. Plan 04 already shipped the frontend hooks (useAlertRules, useAlertEvents, useCreateAlertRule, usePatchAlertRule, useDeleteAlertRule, useAckAlert); Plan 02 shipped the backend endpoints; Plan 03 (this plan) closed the Telegram side of the loop. Plan 05 is now pure UI assembly.
- A future "Ack" button on the /alerts page can hit the same POST /api/alerts/_ack endpoint that the Telegram callback routes to — no new backend lib surface needed.

**Ready for Phase 17 (e2e + polish):**
- POLI-03 (round-trip tests against the callback verb table) has its canonical surface in `cmc/telegram/callback_verbs.py::CallbackVerb`. Phase 17 just enumerates the StrEnum members and roundtrips each through dash_router.decode_callback + dash_router.route.
- POLI-02 (CI grep guard for parse_mode= across the alert paths) can be extended from the existing test_telegram_units.py grep guard — Plan 03 stayed within scope by not adding new parse_mode= lines anywhere, so the extension is a one-line patch in Phase 17.

**No blockers carried forward. No schema changes shipped. Migration count unchanged.**

## TDD Gate Compliance

All 3 tasks executed RED → GREEN per `tdd="true"`:

| Task | RED commit | GREEN commit | Test count |
|------|-----------|--------------|------------|
| 1 (callback_verbs + dash_router) | 3bc36ce (test) | 16ecfc8 (feat) | 7 |
| 2 (format_alert + ack flow)      | 7ba79b7 (test) | 7064d5c (feat) | 6 |
| 3 (notifier alert sweep)         | f906e7d (test) | f6868de (feat) | 4 |

REFACTOR phase skipped on all three tasks — code was clean enough on first GREEN; no refactor commit needed.

## Verification

```bash
# Per-task gates
$ cd backend && .venv/bin/python -m pytest tests/test_alerts_telegram.py -x -v
17 passed in 0.45s

# Telegram regression suite
$ cd backend && .venv/bin/python -m pytest tests/test_telegram_units.py tests/test_telegram_setup.py tests/test_telegram_handler.py tests/test_telegram_notifier.py -x
84 passed in 4.64s

# Plan 02 regression
$ cd backend && .venv/bin/python -m pytest tests/test_alerts_dispatcher.py tests/test_alerts_router.py -x
31 passed (12 dispatcher + 19 router unchanged)

# Full backend suite
$ cd backend && .venv/bin/python -m pytest --tb=short -q
538 passed (521 baseline + 17 new = exact plan target)

# Callback verb enum lock
$ cd backend && .venv/bin/python -c "from cmc.telegram.callback_verbs import CallbackVerb; \
  assert {v.value for v in CallbackVerb} == \
    {'approve_task','reject_task','rerun_task','answer_decision', \
     'reply_inbox','snooze','estop','ack_alert'}; print('OK 8 verbs')"
OK 8 verbs

# D-02 invariant: no string-literal verb checks in dash_router.py
$ grep -E 'if verb == "' backend/cmc/telegram/dash_router.py
(no matches; exit 1)

# ALRT-11 invariant: zero parse_mode= argument usage
$ grep -nE "parse_mode\s*=" backend/cmc/telegram/messages.py \
                            backend/cmc/telegram/notifier.py \
                            backend/cmc/dispatcher/alerts.py
(no matches; exit 1)

# D-06 follow-through: stub deleted, format_alert imported + called
$ grep -n "_format_alert_prompt" backend/cmc/dispatcher/alerts.py
(no matches; exit 1)

$ grep -n "format_alert" backend/cmc/dispatcher/alerts.py
68:from cmc.telegram.messages import format_alert
130:    # match user-visible content. format_alert returns (text, kb) — we
133:    prompt = format_alert(rule, scope_key, value)[0]
```

## Requirements Closed

- **ALRT-08**: User can ack a firing alert via the Telegram inline button. Verb routes through `dash_router.route("ack_alert", [rule_id, scope_hash8])` → `POST /api/alerts/_ack` → `alert_state.acked_until = now + 1h`. Verified by `test_dash_router_routes_ack_alert` + `test_ack_then_evaluate_returns_hold` (end-to-end suppression on next evaluate_alerts tick).
- **ALRT-11**: Alert messages are plain-text only. `format_alert` returns plain UTF-8 text + reply_markup with NO parse_mode key anywhere; the recursive scan in `test_format_alert_plain_text_no_parse_mode` defends against future drift. Strict grep `parse_mode\s*=` exits 1 across the alert paths.

## Self-Check: PASSED

All claimed files exist on disk:
- `backend/cmc/telegram/callback_verbs.py` — FOUND
- `backend/cmc/telegram/dash_router.py` (modified) — FOUND
- `backend/cmc/telegram/messages.py` (modified) — FOUND
- `backend/cmc/telegram/notifier.py` (modified) — FOUND
- `backend/cmc/dispatcher/alerts.py` (modified) — FOUND
- `backend/tests/test_alerts_telegram.py` — FOUND

All claimed commits exist in `git log`:
- `3bc36ce` (Task 1 RED) — FOUND
- `16ecfc8` (Task 1 GREEN) — FOUND
- `7ba79b7` (Task 2 RED) — FOUND
- `7064d5c` (Task 2 GREEN) — FOUND
- `f906e7d` (Task 3 RED) — FOUND
- `f6868de` (Task 3 GREEN) — FOUND

All verification gates pass:
- `cd backend && .venv/bin/python -m pytest tests/test_alerts_telegram.py -x -v` → 17 passed
- Full backend suite → 538 passed (521 baseline + 17 new = exact plan target)
- Callback verb enum has exactly 8 members and matches the locked set
- D-02 invariant grep exits 1 (no string-literal verb checks remain)
- ALRT-11 invariant grep exits 1 (no parse_mode= argument usage)
- D-06 follow-through verified via static grep (stub gone, format_alert imported + called)

---
*Phase: 15-alert-engine-ui*
*Plan: 03*
*Completed: 2026-05-04*
