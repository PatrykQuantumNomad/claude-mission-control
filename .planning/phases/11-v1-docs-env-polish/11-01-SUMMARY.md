---
phase: 11-v1-docs-env-polish
plan: 01
subsystem: settings/doctor/telegram
tags: [v1.0, gap-closure, settings, telegram, doctor, audit]
gap_closure: true
requirements: [INGST-02, INGST-03, INGST-05, INGST-06, INGST-08, TELE-05]
dependency_graph:
  requires: []
  provides:
    - "Settings.anthropic_api_key field (Optional[str], default None)"
    - "Settings.model_config.env_file 2-tuple including ~/.command-centre/.env"
    - "doctor._check_telegram(*, settings) Settings-aware signature"
    - "doctor._check_launchd_jobs(*, settings) Settings-aware signature"
    - "notifier._fetch_unread_inbox(http_client) HTTP-symmetric helper"
  affects:
    - "doctor.run_checks() now loads Settings once and inspect-dispatches"
    - "telegram handler relays trusted ANTHROPIC_API_KEY to claude subprocess"
    - "telegram notifier consumes its own API for inbox state (zero ORM SELECT)"
tech-stack:
  added: []
  patterns:
    - "pydantic-settings env_file tuple (rightmost-wins precedence)"
    - "inspect.signature() kwarg dispatch for Settings-aware checks"
    - "HTTP symmetry: notifier as pure consumer of GET /api/inbox"
    - "Trust-boundary scrub-then-surface (shell untrusted; Settings trusted)"
key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md
    - backend/cmc/config/settings.py
    - backend/cmc/cli/doctor.py
    - backend/cmc/telegram/handler.py
    - backend/cmc/telegram/notifier.py
    - backend/tests/conftest.py
    - backend/tests/test_phase1_boot.py
    - backend/tests/test_phase8_dispatcher.py
    - backend/tests/test_phase9_handler.py
    - backend/tests/test_phase9_notifier.py
    - backend/tests/test_phase9_setup.py
decisions:
  - "SC5 interpretation A (replace direct ORM SELECT with HTTP GET) chosen per RESEARCH §C5 — zero functional delta vs interp B's UX-visible auto-mark-read on Telegram ping."
  - "Settings.env_file uses Path.home() resolved at class-definition time (pydantic-settings does NOT auto-expand ~). Trade-off accepted: tests cannot monkeypatch Path.home post-import; structural test verifies tuple shape, behavioral tests use _env_file kwarg."
  - "clean_env conftest fixture extended to strip ANTHROPIC_API_KEY and TELEGRAM_* vars (defensive belt-and-suspenders alongside per-call-site _env_file=None patches)."
  - "Existing scrub test (test_handler_text_relays_to_claude_with_env_scrub) now passes anthropic_api_key=None explicitly — without this, pydantic-settings reads the monkeypatched ANTHROPIC_API_KEY env var into Settings, defeating the scrub-only assertion."
  - "_mock_client in notifier tests serves an empty {items: []} for GET /api/inbox so pre-existing dedup/snooze/full-cycle tests remain deterministic after the SC5 refactor introduced a new HTTP probe."
metrics:
  duration_minutes: 22
  completed_date: 2026-04-28
  tests_added_net: 10
  tests_total_after: 389
  tests_total_before: 379
  files_changed: 11
  lines_added: 576
  lines_removed: 73
---

# Phase 11 Plan 01: v1.0 Docs & Env Polish (Gap Closure) Summary

**One-liner:** Closes 5 v1.0 audit tech-debt items via a single coordinated plan — INGST traceability flip (SC1), Settings env_file tuple + anthropic_api_key field (SC3+SC4 root), doctor.py read-via-Settings (SC3), handler scrub-then-Settings-surface (SC4), notifier HTTP-symmetric inbox discovery (SC5).

## Execution Outcome

- **All 6 tasks completed.** Plan executed end-to-end without checkpoints.
- **10 atomic commits** (1 SC1 docs + 4 RED + 4 GREEN + 1 Pitfall A audit).
- **Backend test suite:** 389 passed (baseline 379 → target ≥388 → actual 389).
- **No DB migration. No new schema columns. No frontend touch. Dispatcher run_classic.py UNCHANGED.**

## Tech-Debt Items Closed

Each item maps to a Success Criterion in `.planning/v1.0-MILESTONE-AUDIT.md` and a Phase 11 ROADMAP entry:

| SC | Audit Item | How closed |
|----|------------|-----------|
| SC1 | INGST-02/03/05/06/08 traceability | 5-line status flip in REQUIREMENTS.md (Phase 2 evidence cited in plan §C1) |
| SC2 | ROADMAP plan 04-04 checkbox | Already `[x]` at HEAD (commit 817886c, 2026-04-26) — verified, no edit |
| SC3 | doctor reads telegram token via Settings | `_check_telegram` + `_check_launchd_jobs` signatures accept `settings` kwarg; `run_checks()` threads via `inspect.signature` |
| SC4 | TELE-05 surfaces ANTHROPIC_API_KEY | New `Settings.anthropic_api_key` field; `relay_text_to_claude` scrubs shell-inherited then re-injects from Settings |
| SC5 | notifier uses HTTP, not direct ORM | `_fetch_unread_inbox(http_client)` helper; `_gather_candidates` no longer executes `select(InboxMessage)`; import removed |

## Files Modified

| File | Change | Lines |
|------|--------|------:|
| .planning/REQUIREMENTS.md | INGST-02/03/05/06/08 → Complete | 5/5 |
| backend/cmc/config/settings.py | env_file tuple + anthropic_api_key field | +20/-4 |
| backend/cmc/cli/doctor.py | inspect+Settings dispatch; checks 7+8 read via Settings | +37/-7 |
| backend/cmc/telegram/handler.py | scrub-then-Settings-surface in relay_text_to_claude; docstring | +13/-5 |
| backend/cmc/telegram/notifier.py | _fetch_unread_inbox helper; LOCAL_API const; InboxMessage import removed | +52/-19 |
| backend/tests/conftest.py | clean_env strips more vars; test_settings uses _env_file=None | +13/-5 |
| backend/tests/test_phase1_boot.py | 4 new boot tests + 7 existing patches | +89/-3 |
| backend/tests/test_phase8_dispatcher.py | 6 _env_file=None patches | +6/-6 |
| backend/tests/test_phase9_handler.py | 2 new handler tests + 1 existing rewrite + 11 patches | +143/-7 |
| backend/tests/test_phase9_notifier.py | 2 new notifier tests + _mock_client refinement + 9 patches | +127/-10 |
| backend/tests/test_phase9_setup.py | 2 new setup tests + 1 rewrite | +66/-3 |

## Test-Count Tracking

| Stage | Tests | Delta |
|------|------:|------:|
| Phase 11 baseline (after Phase 10) | 379 | – |
| After Task 3 (boot tests) | 383 | +4 (+1 vs plan due to structural+behavioral split) |
| After Task 4 (setup tests) | 385 | +2 net (1 rewrite, 2 new) |
| After Task 5 (handler tests) | 387 | +2 |
| After Task 6 (notifier tests) | 389 | +2 |
| **Final** | **389** | **+10** |

Target was ≥388. Result is 389 (exceeds target by 1 due to Task 3 structural+behavioral test split).

## Pitfall A Audit Results

The broadened `Settings.model_config.env_file` tuple includes `~/.command-centre/.env`, which means any test that calls `Settings(...)` without `_env_file=None` would silently read the developer's real install env and pollute hermetic test runs.

**Audit scope:** every `Settings(...)` construction in `backend/tests/`.

**Sites patched (35 total):**
- `conftest.py` — central `test_settings` fixture (highest-leverage; touches every downstream test).
- `conftest.py` — `clean_env` fixture extended to strip `ANTHROPIC_API_KEY` + `TELEGRAM_*` env vars (defense in depth).
- `test_phase1_boot.py` — 7 sites (existing FOUND-04 tests).
- `test_phase8_dispatcher.py` — 6 sites (dispatcher fields + followup poll tests).
- `test_phase9_handler.py` — 11 sites (most via Edit replace_all on a shared template).
- `test_phase9_notifier.py` — 9 sites.

**Verification:** `grep -rn 'Settings(' backend/tests/ | grep -v _env_file | grep -v 'spec=Settings' | grep -v '\.pyc'` returns only docstring/comment matches and the multi-line `Settings(\n  _env_file=None, ...)` opener — no untreated call sites.

## Deviations from Plan

### Auto-fixed Issues (Rule 1 - bug)

**1. RED test design for env_file tuple precedence**
- **Found during:** Task 3 GREEN (test failed unexpectedly after correct implementation).
- **Issue:** Original RED test used `monkeypatch.setattr(Path, "home", ...)` to simulate `~/.command-centre/.env` resolution. But `Settings.model_config.env_file` is computed at CLASS-definition (import) time using the real `Path.home()` — a runtime monkeypatch cannot shift the tuple after the class is loaded.
- **Fix:** Split coverage into two complementary tests:
  - `test_settings_model_config_includes_command_centre_env` — structural assertion on `Settings.model_config.env_file` shape (verifies the 2-tuple was built correctly with tilde-expanded second element).
  - `test_settings_loads_explicit_command_centre_env` + `test_settings_env_file_tuple_rightmost_wins` — behavioral assertions using the `_env_file` kwarg (which overrides class-level config and proves pydantic-settings honors rightmost-wins precedence on the tuple shape we use).
- **Net:** 4 new boot tests instead of 3 (plan target was 3). Final count still meets the ≥388 floor.
- **Files modified:** `backend/tests/test_phase1_boot.py`.
- **Commit:** `acf1754` (folded into Task 3 GREEN since the new tests are required for GREEN to pass).

**2. Existing scrub test broken by GREEN code**
- **Found during:** Task 5 GREEN (test_handler_text_relays_to_claude_with_env_scrub failed).
- **Issue:** The existing test sets `monkeypatch.setenv("ANTHROPIC_API_KEY", ...)` BEFORE constructing `Settings(_env_file=None, ...)`. Pydantic-settings reads `os.environ` at construction time and populates `settings.anthropic_api_key` — so the new GREEN code's "re-inject from Settings" branch fired and the env_has_anthropic assertion flipped from False to True.
- **Fix:** Patched the test to pass `anthropic_api_key=None` explicitly. Explicit kwargs are highest priority in pydantic-settings, so this preserves the scrub-only assertion intent.
- **Files modified:** `backend/tests/test_phase9_handler.py`.
- **Commit:** `9207ec6` (folded into Task 5 GREEN).

**3. Pre-existing notifier tests broken by inbox HTTP probe**
- **Found during:** Task 6 GREEN (5 pre-existing notifier tests failed with `len(captured) == 4` instead of `== 3`).
- **Issue:** The new `_fetch_unread_inbox` makes a GET `/api/inbox?unread=true&limit=200` request via the passed-in `http_client`. Pre-existing tests use a `_mock_client` that captures EVERY request — so the new probe inflated the captured-request count by 1 in every test.
- **Fix:** Updated `_mock_client` to serve `GET /api/inbox` with an empty `{items: []}` payload BEFORE the capture-and-respond branch. This makes the SC5 probe invisible to tests that don't exercise the inbox path, while remaining transparent to the new SC5 tests (which use a different `_inbox_http_transport` helper that DOES capture the probe).
- **Files modified:** `backend/tests/test_phase9_notifier.py`.
- **Commit:** `15a389a` (folded into Task 6 GREEN).

**4. Missing Path import in test file**
- **Found during:** Task 3 RED (NameError after running the tests).
- **Issue:** Added new tests that referenced `Path.home()` but `test_phase1_boot.py` did not import `Path`.
- **Fix:** Added `from pathlib import Path` to the imports block.
- **Files modified:** `backend/tests/test_phase1_boot.py`.
- **Commit:** `acf1754` (folded into Task 3 GREEN).

### Auto-added Critical Functionality (Rule 2)

None — the plan covered all critical paths.

### Auto-fixed Blocking Issues (Rule 3)

None beyond the auto-fixes above.

### Architectural Changes (Rule 4)

None — no checkpoints surfaced.

## SC5 Interpretation Decision

The plan explicitly called out SC5 as having two interpretations:
- **Interp A (chosen):** Replace `select(InboxMessage)` with `GET /api/inbox?unread=true`. Zero functional delta — the API route's filter logic is identical to the SELECT.
- **Interp B (rejected):** Add a `POST /api/inbox/{id}/read` mark-read step on first Telegram ping. UX-visible behavior change.

Interp A was implemented per RESEARCH §C5 default. Interp B was deliberately NOT chosen because:
1. The audit's SC5 evidence pointed at the SELECT replacement, not at adding a POST endpoint.
2. Auto-mark-read on Telegram ping is a user-visible behavior change. The dashboard's reply-via-form flow already handles the mark-read transition; adding a duplicate path through Telegram would create two race-prone code paths.
3. The dispatcher-pattern symmetry argument ("API state via API, never direct DB") is fully satisfied by interp A.

No checkpoint surfaced during execution — interp A was practical end-to-end.

## Negative Checks (must STILL hold)

| Check | Result |
|-------|--------|
| `git diff backend/cmc/dispatcher/run_classic.py` (vs. e3c80de) | Empty — dispatcher classic path UNCHANGED |
| `git diff backend/cmc/api/routes/hitl.py` | Empty — `GET /api/inbox?unread=true` already existed; only new CONSUMER added |
| `git diff backend/migrations/versions/` | Empty — no schema changes |
| `git diff frontend/` | Empty — purely backend + docs work |
| `git diff backend/cmc/telegram/messages.py` | Empty — `format_inbox` still consumes attribute-access objects (SimpleNamespace works) |
| `_render_pretty` does NOT log `anthropic_api_key` value | Verified during Task 3 (only field names and types appear in error output) |
| Pitfall A audit complete | Verified via `grep -rn "Settings(" backend/tests/ \| grep -v _env_file` returning only false positives |

## Untouched Files (per plan §scope check)

- `backend/cmc/dispatcher/run_classic.py` — intentionally NOT using Settings.anthropic_api_key (subscription-auth path).
- `backend/cmc/api/routes/hitl.py` — `GET /api/inbox?unread=true` was already implemented; we only added a consumer.
- `backend/migrations/versions/` — no DB migration.
- `frontend/` — purely backend + docs work.
- `backend/cmc/telegram/messages.py` — `format_inbox` still consumes attribute-access objects.

## Threat-Model Summary

All STRIDE register items mitigated as planned:
- **T-11-01** (info disclosure via `_render_pretty`): inherited existing field-name-only protection; new `anthropic_api_key` field never logs values.
- **T-11-02** (logging): no log statements added that include settings values.
- **T-11-03** (path injection via `~`): `Path.home()` is process-bound; production-safe by construction.
- **T-11-04** (test pollution): Pitfall A audit complete (35 sites patched).
- **T-11-05** (localhost HTTP unauth): accepted (same model as Phase 9 handler→API).
- **T-11-06** (notifier hung-server): mitigated by httpx default timeouts; ConnectError test covers explicit failure.
- **T-11-07** (rogue MCP exfil): accepted per Phase 8 RESEARCH §D6 — operator's choice of MCP servers is the trust boundary.

No new threat flags discovered during execution.

## Atomic Commits

| # | Hash | Type | Subject |
|---|------|------|---------|
| 1 | `926cc5c` | docs(11-01) | flip INGST-02/03/05/06/08 traceability to Complete |
| 2 | `a945795` | test(11-01) | RED — Settings env_file tuple + anthropic_api_key field tests |
| 3 | `acf1754` | feat(11-01) | GREEN — broaden Settings env_file + add anthropic_api_key |
| 4 | `e81d575` | test(11-01) | patch existing Settings(...) call sites with _env_file=None (Pitfall A) |
| 5 | `298af84` | test(11-01) | RED — doctor reads telegram token via Settings (SC3) |
| 6 | `c4ac912` | feat(11-01) | GREEN — doctor.py _check_telegram + _check_launchd_jobs via Settings (SC3) |
| 7 | `ee04d12` | test(11-01) | RED — handler surfaces ANTHROPIC_API_KEY from Settings (SC4) |
| 8 | `9207ec6` | feat(11-01) | GREEN — handler.relay_text_to_claude scrub-then-Settings-surface (SC4) |
| 9 | `8d62f1d` | test(11-01) | RED — notifier inbox via HTTP GET (SC5 interp A) |
| 10 | `15a389a` | refactor(11-01) | GREEN — notifier _fetch_unread_inbox replaces direct ORM SELECT (SC5) |

## Close-out

Plan 11-01 closes the final v1.0 milestone gap. Phase 11 has a single plan; with this plan complete, Phase 11 itself is complete. ROADMAP Phase 11 entry can be flipped to `[x]` and v1.0 can be marked shipped.

Suite count: **389/389 backend tests green**. No deferred issues. No known stubs in this plan's surface area.

## Self-Check: PASSED

All 12 modified/created files verified present at HEAD. All 10 commits verified in git log:
- `926cc5c` (Task 1 SC1)
- `a945795` (Task 3 RED), `acf1754` (Task 3 GREEN), `e81d575` (Task 3c Pitfall A audit)
- `298af84` (Task 4 RED), `c4ac912` (Task 4 GREEN)
- `ee04d12` (Task 5 RED), `9207ec6` (Task 5 GREEN)
- `8d62f1d` (Task 6 RED), `15a389a` (Task 6 GREEN)
