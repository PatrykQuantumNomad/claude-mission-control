---
phase: 11-v1-docs-env-polish
verified: 2026-04-28T00:00:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
---

# Phase 11: v1.0 Docs & Env Polish Verification Report

**Phase Goal:** Documentation hygiene and environment-loading polish so doctor/handler behave correctly in installed locations.

**Verified:** 2026-04-28
**Status:** PASSED
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths (from PLAN must_haves.truths + ROADMAP success criteria)

| #   | Truth                                                                                                       | Status     | Evidence                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | REQUIREMENTS.md traceability table shows INGST-02/03/05/06/08 as Complete (SC1)                              | VERIFIED   | `.planning/REQUIREMENTS.md:368-374` shows all 5 INGST rows with `Phase 2 \| Complete`                          |
| 2   | ROADMAP.md plan 04-04 line is `[x]` and ends with `✅ 2026-04-26` (SC2)                                       | VERIFIED   | `.planning/ROADMAP.md:104` reads `[x] 04-04-PLAN.md — ... ✅ 2026-04-26`                                        |
| 3   | Settings loads `~/.command-centre/.env` in addition to repo `.env`, with rightmost-wins precedence (SC3+SC4) | VERIFIED   | `backend/cmc/config/settings.py:39` → `env_file=(".env", str(Path.home() / ".command-centre" / ".env"))`        |
| 4   | Settings exposes `anthropic_api_key: Optional[str]` field, default None, never logged in pretty errors (SC4) | VERIFIED   | `backend/cmc/config/settings.py:145-153` field present with default None; `_render_pretty:207-221` logs no values |
| 5   | doctor.py check 7 + 8 read TELEGRAM_BOT_TOKEN via Settings, not bare os.environ (SC3)                        | VERIFIED   | `_check_launchd_jobs:229-252` and `_check_telegram:294-300` both use `settings.telegram_bot_token`. No bare `os.environ.get("TELEGRAM_BOT_TOKEN")` exists in `backend/cmc/` |
| 6   | handler.relay_text_to_claude scrubs shell-inherited ANTHROPIC_API_KEY then re-injects from settings (SC4)    | VERIFIED   | `backend/cmc/telegram/handler.py:114-117` — `env.pop("ANTHROPIC_API_KEY", None)` then `if settings.anthropic_api_key: env["ANTHROPIC_API_KEY"] = settings.anthropic_api_key` |
| 7   | notifier.run_one_cycle fetches unread inbox via GET /api/inbox?unread=true, NOT via select(InboxMessage) (SC5) | VERIFIED   | `backend/cmc/telegram/notifier.py:91-127` — `_fetch_unread_inbox` issues `http_client.get(f"{LOCAL_API}/api/inbox", params={"unread": "true", "limit": 200})`. `select(InboxMessage)` GONE from notifier.py (only mention is in a comment); InboxMessage import removed |
| 8   | Existing tests that construct Settings(...) without `_env_file=None` are patched (Pitfall A mitigation)      | VERIFIED   | `conftest.py:58` uses `_env_file=None`; `clean_env` fixture (lines 17-39) strips ANTHROPIC_API_KEY + TELEGRAM_*. SUMMARY claim of 35 sites patched matches grep result |
| 9   | Backend test suite remains green; new tests cover env_file tuple, doctor-via-settings, handler-from-settings, notifier-via-HTTP, notifier-server-down (target ≥384, baseline 379, claimed 389) | VERIFIED   | `pytest --collect-only` reports `389 tests collected`; full run: `389 passed in 128.03s`. All 8 targeted Phase 11 tests pass in 0.48s |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact                                  | Expected                                                          | Status     | Details                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `.planning/REQUIREMENTS.md`               | INGST-02/03/05/06/08 rows flipped to Complete                     | VERIFIED   | Lines 368/369/371/372/374 contain `\| INGST-XX \| Phase 2 \| Complete \|` rows                            |
| `backend/cmc/config/settings.py`          | env_file tuple + anthropic_api_key field                          | VERIFIED   | env_file 2-tuple at line 39 (Path.home()-resolved); `anthropic_api_key: Optional[str]` field at lines 145-153 |
| `backend/cmc/cli/doctor.py`               | _check_telegram + _check_launchd_jobs read via Settings           | VERIFIED   | `inspect.signature` dispatch in `run_checks:354-368`; both checks accept `settings: Optional[Settings]=None` |
| `backend/cmc/telegram/handler.py`         | relay_text_to_claude surfaces ANTHROPIC_API_KEY from settings     | VERIFIED   | scrub-then-re-inject pattern at lines 114-117                                                            |
| `backend/cmc/telegram/notifier.py`        | HTTP-symmetric inbox via GET /api/inbox?unread=true               | VERIFIED   | `_fetch_unread_inbox(http_client)` helper (lines 91-127); `_gather_candidates` calls it (line 174); InboxMessage import removed |
| `backend/tests/test_phase1_boot.py`       | test_settings_loads_command_centre_env (or split equivalents)     | VERIFIED   | 3 boot tests at lines 104, 132, 149 (split into structural + 2 behavioral per Plan deviation note)        |
| `backend/tests/test_phase9_setup.py`      | test_doctor_telegram_via_settings + skipped_when_unset            | VERIFIED   | Lines 194 + 212                                                                                           |
| `backend/tests/test_phase9_handler.py`    | test_handler_surfaces_anthropic_api_key_from_settings             | VERIFIED   | Line 434                                                                                                  |
| `backend/tests/test_phase9_notifier.py`   | test_notifier_inbox_via_http_get + handles_server_down            | VERIFIED   | Lines 508 + 553                                                                                           |

### Key Link Verification

| From                                          | To                                  | Via                                                              | Status | Details                                                                                                  |
| --------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `settings.py model_config`                    | `~/.command-centre/.env`            | env_file tuple loaded by pydantic-settings (rightmost wins)      | WIRED  | `env_file=(".env", str(Path.home() / ".command-centre" / ".env"))` at line 39; runtime smoke shows tuple resolves to `/Users/patrykattc/.command-centre/.env` |
| `doctor.py _check_telegram`                   | `settings.telegram_bot_token`       | run_checks loads Settings + dispatches via inspect.signature     | WIRED  | `_check_telegram(*, settings: Optional[Settings] = None)` reads `settings.telegram_bot_token` line 300; `_check_launchd_jobs` reads at line 252 |
| `handler.py relay_text_to_claude`             | subprocess env dict                 | `if settings.anthropic_api_key: env['ANTHROPIC_API_KEY'] = settings.anthropic_api_key` | WIRED  | Lines 116-117 match the locked pattern exactly                                                          |
| `notifier.py _gather_candidates`              | GET /api/inbox?unread=true          | `http_client.get(f"{LOCAL_API}/api/inbox", params={"unread":"true",...})` | WIRED  | `_fetch_unread_inbox` issues GET (line 112-115); _gather_candidates calls it (line 174)                |

### Data-Flow Trace (Level 4)

| Artifact                                 | Data Variable      | Source                                          | Produces Real Data | Status   |
| ---------------------------------------- | ------------------ | ----------------------------------------------- | ------------------ | -------- |
| `notifier.py _gather_candidates`         | `inbox`            | `GET /api/inbox?unread=true` → `hitl.list_inbox` (`select(InboxMessage).where(read==False)`) | Yes — same SQL filter as the pre-Phase-11 direct SELECT | FLOWING  |
| `handler.py relay_text_to_claude`        | `env["ANTHROPIC_API_KEY"]` | `settings.anthropic_api_key` (from `~/.command-centre/.env` via env_file tuple) | Yes — when configured; None default cleanly skipped | FLOWING  |
| `doctor.py _check_telegram`              | `token`            | `settings.telegram_bot_token` (from env_file tuple) | Yes — same source as the bare os.environ.get() it replaces, plus the install-mode .env path | FLOWING  |

### Behavioral Spot-Checks

| Behavior                                                                            | Command                                                                                                       | Result                          | Status |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------ |
| Backend test suite collects exactly 389 tests                                       | `pytest --collect-only`                                                                                       | `389 tests collected in 0.21s`  | PASS   |
| Backend test suite passes 389/389                                                   | `pytest`                                                                                                       | `389 passed in 128.03s`         | PASS   |
| 8 targeted Phase 11 acceptance tests pass                                           | `pytest tests/...test_settings_model_config_includes_command_centre_env tests/...test_settings_loads_explicit_command_centre_env tests/...test_settings_env_file_tuple_rightmost_wins tests/...test_doctor_telegram_via_settings_present tests/...test_doctor_telegram_skipped_when_unset tests/...test_handler_surfaces_anthropic_api_key_from_settings tests/...test_notifier_inbox_via_http_get tests/...test_notifier_inbox_handles_server_down -v` | `8 passed in 0.48s`            | PASS   |
| Settings instantiates with anthropic_api_key field at default None                  | `python -c "from cmc.config.settings import Settings; s = Settings(_env_file=None); print(s.anthropic_api_key)"` | `None`                          | PASS   |
| Settings.env_file is a 2-tuple with tilde-expanded ~/.command-centre/.env path      | `python -c "from cmc.config.settings import Settings; print(Settings.model_config['env_file'])"`              | `('.env', '/Users/.../command-centre/.env')` | PASS   |
| _check_telegram + _check_launchd_jobs accept `settings` kwarg (run_checks dispatch)| `python -c "import inspect; from cmc.cli.doctor import ...; print('settings' in inspect.signature(...))"`     | Both True                       | PASS   |

### Requirements Coverage

| Requirement | Source Plan | Description                                                            | Status   | Evidence                                                                                       |
| ----------- | ----------- | ---------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| INGST-02    | 11-01       | (Phase 2 evidence) JSONL ingestion — traceability flip                 | SATISFIED | REQUIREMENTS.md:368 row Complete                                                              |
| INGST-03    | 11-01       | (Phase 2 evidence) tool_use repointing — traceability flip            | SATISFIED | REQUIREMENTS.md:369 row Complete                                                              |
| INGST-05    | 11-01       | (Phase 2 evidence) token_usage rollups — traceability flip            | SATISFIED | REQUIREMENTS.md:371 + 35 row Complete                                                         |
| INGST-06    | 11-01       | (Phase 2 evidence) idempotency — traceability flip                     | SATISFIED | REQUIREMENTS.md:372 row Complete                                                              |
| INGST-08    | 11-01       | (Phase 2 evidence) periodic catch-up — traceability flip               | SATISFIED | REQUIREMENTS.md:374 row Complete                                                              |
| TELE-05     | 11-01       | Inbound text → claude relay surfaces ANTHROPIC_API_KEY via Settings    | SATISFIED | handler.py:114-117 scrub-then-re-inject pattern verified                                       |

### Anti-Patterns Found

| File                                       | Line | Pattern                            | Severity | Impact                                                                                          |
| ------------------------------------------ | ---- | ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| (none)                                     | -    | -                                  | -        | No TODO/FIXME/placeholder/stub patterns introduced in Phase 11 surface area. SUMMARY's negative-checks register all hold (verified by grep). |

### Human Verification Required

None.

All Phase 11 truths are verifiable programmatically — they're either source-text checks, structural file content checks, or behaviors testable via the existing test suite. The truths involve no UI, no real-time behavior, and no external service integration that requires human eyes.

(Operator may optionally smoke-test on a real install by placing a token in `~/.command-centre/.env` and running `cmc doctor` from a non-interactive shell to confirm SC3 in-the-large; this is not required to declare the phase goal achieved given all behavioral and structural checks pass.)

### Gaps Summary

No gaps. Phase 11 closes all 5 v1.0 milestone audit tech-debt items:

- **SC1** (REQUIREMENTS.md INGST traceability): 5 rows flipped to Complete — VERIFIED at lines 368-374.
- **SC2** (ROADMAP plan 04-04 checkbox): `[x] ... ✅ 2026-04-26` already at HEAD per commit `817886c` — VERIFIED at line 104.
- **SC3** (doctor reads telegram token via Settings): `_check_telegram` + `_check_launchd_jobs` route via `settings.telegram_bot_token`; no bare `os.environ.get("TELEGRAM_BOT_TOKEN")` survives in `backend/cmc/`.
- **SC4** (handler surfaces ANTHROPIC_API_KEY): scrub-then-re-inject pattern in `relay_text_to_claude` lines 114-117; `Settings.anthropic_api_key` field added with safe default + leak-free pretty-error renderer.
- **SC5** (notifier via HTTP, interpretation A): `_fetch_unread_inbox(http_client)` helper issues `GET /api/inbox?unread=true&limit=200`; `select(InboxMessage)` removed from notifier.py (only remaining mention is a comment); InboxMessage import dropped. Interpretation A locked per RESEARCH §C5 (zero functional delta vs interpretation B).

Test suite: **389 passed, 0 failed** (target ≥384, baseline 379). All 11 commits (10 RED/GREEN + 1 doc close-out) verified in git history.

Pitfall A (test pollution from broadened env_file) audited: 35 `Settings(...)` test sites patched with `_env_file=None`; `clean_env` fixture extended to strip ANTHROPIC_API_KEY + TELEGRAM_* env vars (defense in depth).

---

_Verified: 2026-04-28_
_Verifier: Claude (gsd-verifier)_
