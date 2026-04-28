# Phase 11: v1.0 Documentation & Env Polish — Research

**Researched:** 2026-04-28
**Domain:** documentation hygiene + pydantic-settings env loading + HTTP-vs-DB symmetry refactor
**Confidence:** HIGH (every claim cited to file:line; no library-version dependencies beyond existing stack)

## Summary

Five gap-closure items. Four are local-scope (≤30 LOC each); one (criterion #5) has a wording ambiguity the planner must surface to the user. Criterion #2 is **already done** — plan 04-04 was flipped to `[x]` in commit `817886c` (`docs(04-04): complete Schedules router plan`, 2026-04-26) before this phase planning began; the audit was stale. Criterion #1 is a docs-only edit. Criteria #3, #4 share a single root cause (`os.environ` direct reads bypass `~/.command-centre/.env`) and should be fixed via a single Settings change. Criterion #5 needs interpretation: the criterion text says "calls `/api/inbox/{id}/read`" (POST mark-read), but the audit evidence says "reads `InboxMessage.read==False` directly" (the GET-style query) — these are different endpoints with different behaviors.

**Primary recommendation:** Single plan, 5 small tasks, tested against the existing 379-test backend suite. Use TDD where new behavior is added (criteria #3, #4, #5); pure-doc edits (criteria #1, #2-no-op) need only a verification step.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SC1 | Flip INGST-02/03/05/06/08 to Complete in REQUIREMENTS.md traceability | §C1 — exact lines + dates |
| SC2 | ROADMAP plan 04-04 checkbox reflects completion | §C2 — already `[x]`, no-op verify |
| SC3 | doctor.py check 8 loads `~/.command-centre/.env` | §C3 — Settings env_file refactor |
| SC4 | TELE-05 relay reads ANTHROPIC_API_KEY via Settings | §C4 — same Settings change as SC3 |
| SC5 | Notifier inbox loop uses HTTP, not DB | §C5 — open question, two interpretations |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary | Rationale |
|------------|-------------|-----------|-----------|
| Traceability table sync | Documentation | — | `.planning/REQUIREMENTS.md` is the audit ledger |
| Plan checkbox sync | Documentation | — | `.planning/ROADMAP.md` mirrors completion |
| .env loading | Backend / Settings | CLI (doctor) | `cmc.config.Settings` is the trust boundary for env reads |
| Subprocess env surface | Telegram handler | Settings | Hand-roll-free: handler reads `settings.anthropic_api_key`, not `os.environ` |
| Inbox notification gating | Telegram notifier | API (HTTP) | If criterion #5 means HTTP-driven, the notifier becomes a pure HTTP client for inbox state |

## Standard Stack

No new dependencies. The existing stack is sufficient:

| Library | Version | Already Used For | Used Here For |
|---------|---------|------------------|---------------|
| pydantic-settings | 2.14.0 | `cmc.config.Settings` | Add `anthropic_api_key` field; broaden `env_file` to a tuple |
| python-dotenv | 1.2.2 (transitive) | Pulled in by pydantic-settings | Reads `.env` files [VERIFIED: backend/uv.lock:572,643] |
| httpx | (existing) | All HTTP in handler/notifier | Notifier-side `POST /api/inbox/{id}/read` if SC5 picks the mark-read interpretation |

**pydantic-settings env_file=tuple precedence:** Files load left-to-right; **rightmost overrides** [CITED: pydantic-settings docs — confirmed via WebSearch 2026-04-28]. So `env_file=(".env", str(Path.home() / ".command-centre" / ".env"))` lets a present install file override the dev-mode repo `.env`.

**Tilde expansion:** pydantic-settings does NOT auto-expand `~`; pass an already-resolved `Path` (or `os.path.expanduser`'d string).

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` exists at the repo root [VERIFIED: ls /Users/patrykattc/work/git/claude-mission-control/]. No additional directives to honor beyond the existing Settings/HTTP-symmetry conventions documented in STATE.md and the phase 9 RESEARCH (already followed by handler/notifier).

## Findings — Per Success Criterion

### C1 — REQUIREMENTS.md traceability sync (INGST-02/03/05/06/08)

**File:** `.planning/REQUIREMENTS.md`

**Current state (stale rows in traceability table):**

| Line | Current text |
|------|-------------|
| 368  | `\| INGST-02 \| Phase 2 \| Pending \|` |
| 369  | `\| INGST-03 \| Phase 2 \| Pending \|` |
| 371  | `\| INGST-05 \| Phase 2 \| Pending \|` |
| 372  | `\| INGST-06 \| Phase 2 \| Pending \|` |
| 374  | `\| INGST-08 \| Phase 2 \| Pending \|` |

[VERIFIED: .planning/REQUIREMENTS.md:367-376 — Read tool, 2026-04-28]

**Test evidence the requirements ARE complete:**
- INGST-02 (token usage extraction): `test_phase2_ingest.py:38` — "tokens summed across every assistant message.usage block" [VERIFIED: grep INGST-0X tests/test_phase2_ingest.py]
- INGST-03 (tool_use/tool_result pairing): `test_phase2_ingest.py:60, 78, 116`
- INGST-05 (daily token rollups, local-time bucketing): `test_phase2_ingest.py:580, 611, 853, 1110`
- INGST-06 (corrupted line tolerance): `test_phase2_ingest.py:165, 904`
- INGST-08 (mcp_server_name extraction): `test_phase2_ingest.py:287, 310`

The phase-2 close-out commit (`d91f054 docs(02-06): complete Phase 2 manual smoke + close plan`) landed on **2026-04-25** [VERIFIED: git log %ai for d91f054]. Audit's milestone-aggregate verification of Phase 2 is also dated 2026-04-25 [VERIFIED: v1.0-MILESTONE-AUDIT.md:65].

**Desired direction:**

The current table has 3 columns: `| Requirement | Phase | Status |`. Criterion text says "with phase + date" — interpret as "preserve the existing schema and just flip Status; the date is a hint that ALL traceability rows could grow a date column, but the criterion does not require it for non-INGST rows."

Two minimally-disruptive options for the planner to choose from:

1. **Status-only flip (smallest change):** Replace `Pending` with `Complete` on lines 368, 369, 371, 372, 374. Schema unchanged.
2. **Add Verified-date column to all rows:** New schema `| Req | Phase | Status | Verified |`. ~150 row edits. Higher risk of typos.

Recommended: option 1 — status-only flip — because (a) it satisfies the criterion's literal "flips ... to Complete" wording, (b) it's a 5-line diff, and (c) adding a global Verified column would touch every row and is out of scope for "v1.0 docs polish." If the user wants a date trail, they can request a follow-up.

**Test coverage:** No test exists or is needed for `.planning/REQUIREMENTS.md` (it's a documentation file, not application code).

---

### C2 — ROADMAP plan 04-04 checkbox

**File:** `.planning/ROADMAP.md:104`

**Current state — ALREADY CORRECT:**

```markdown
- [x] 04-04-PLAN.md — Schedules router (SCHD-01..06): list/create/patch-with-cron-recompute/delete/runs + NL→cron via Anthropic Haiku 4.5 (503-graceful) ✅ 2026-04-26
```

[VERIFIED: .planning/ROADMAP.md:104 — Read tool, 2026-04-28]

**Git evidence the flip already happened:**

```
$ git log --all -p -- .planning/ROADMAP.md | grep -E "04-04-PLAN|^commit"
- [ ] 04-04-PLAN.md — Schedules router ...
+ [x] 04-04-PLAN.md — Schedules router ... ✅ 2026-04-26
```

[VERIFIED: git log --all --oneline -p -- .planning/ROADMAP.md, commit `817886c docs(04-04): complete Schedules router plan`]

The audit was authored against an earlier ROADMAP state. No code change needed — the criterion is **already satisfied at HEAD**.

**Desired direction:** The plan should include a verification task that re-asserts the line is `[x]` and exits clean. Treat this as a `noop_with_assertion` task — no commit needed unless drift is detected.

**Test coverage:** None needed — pure documentation assertion.

---

### C3 — doctor.py check 8 loads `~/.command-centre/.env`

**File:** `backend/cmc/cli/doctor.py`

**Current (broken) code (lines 283-317):**

```python
def _check_telegram() -> Check:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        return Check(
            8, "Telegram (optional)", "ok", "not configured (skipped)"
        )
    ...
```

Also at line 241 inside `_check_launchd_jobs`:

```python
telegram_configured = bool(os.environ.get("TELEGRAM_BOT_TOKEN"))
```

[VERIFIED: backend/cmc/cli/doctor.py:241,284 — Read tool, 2026-04-28]

**Why it false-skips:** `cmc doctor` resolves to `exec "$VENV_PY" -m cmc.cli.doctor` [VERIFIED: scripts/cmc:106] WITHOUT changing cwd. So when a user runs `cmc doctor` from `~`, cwd is `~` and a bare `os.environ.get("TELEGRAM_BOT_TOKEN")` returns `None` even though `~/.command-centre/.env` has the token. The launchd-spawned daemons don't hit this bug because their plist sets `WorkingDirectory=${repo_root}` which equals `~/.command-centre` in install mode [VERIFIED: backend/cmc/telegram/templates/com.cmc.telegram-handler.plist.j2:15-17].

**Desired direction (combined with C4, see §C4):** Make `Settings` itself load `~/.command-centre/.env` regardless of cwd. Then `_check_telegram` reads the token via `load_settings().telegram_bot_token` instead of `os.environ`.

```python
# backend/cmc/cli/doctor.py
def _check_telegram() -> Check:
    from cmc.config import load_settings
    settings = load_settings()
    token = settings.telegram_bot_token
    if not token:
        return Check(8, "Telegram (optional)", "ok", "not configured (skipped)")
    ...
```

Same change for line 241 — `telegram_configured = bool(load_settings().telegram_bot_token)`. Keep one `load_settings()` call at the top of `run_checks` and thread it through if the planner wants to avoid duplicate I/O.

**Test coverage:**
- Existing: `test_phase9_setup.py:194` `test_doctor_telegram_skipped_when_unset` — uses `monkeypatch.delenv("TELEGRAM_BOT_TOKEN")`. **This test will become brittle** if a developer's `~/.command-centre/.env` actually contains a real token, because Settings will pick it up regardless of `monkeypatch.delenv`. **Action:** add `monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "")` PLUS pass `_env_file=None` (or a `tmp_path / ".env"`) when constructing Settings inside the test, OR refactor the test to pass an explicit `settings=Settings(_env_file=None)`. The planner's task should rewrite this test, not just leave it.
- New: a test that asserts `_check_telegram` reads from a passed-in (or patched) Settings, not from `os.environ`.

---

### C4 — TELE-05 relay surfaces ANTHROPIC_API_KEY via Settings

**Files:**
- `backend/cmc/config/settings.py` — add field
- `backend/cmc/telegram/handler.py:99-136` — `relay_text_to_claude` body

**Current (broken) code (handler.py:99-114):**

```python
def relay_text_to_claude(text: str, settings: Settings) -> str:
    """...
    Pitfall P12: ANTHROPIC_API_KEY is popped from the env BEFORE spawn so
    a malicious prompt cannot exfiltrate the operator's key via a rogue
    MCP server (mirrors cmc.dispatcher.run_classic).
    ...
    """
    env = os.environ.copy()
    env.pop("ANTHROPIC_API_KEY", None)
    cmd = [
        str(settings.claude_bin), "-p", text, "--bare",
        "--output-format", "text",
        "--model", settings.claude_default_model,
    ]
```

[VERIFIED: backend/cmc/telegram/handler.py:99-114 — Read tool, 2026-04-28]

**Why it fails under launchd:** the launchd-spawned handler gets `EnvironmentVariables` of just `PYTHONUNBUFFERED` and `PATH` [VERIFIED: backend/cmc/telegram/templates/com.cmc.telegram-handler.plist.j2:18-24]. `ANTHROPIC_API_KEY` is never in `os.environ`, so `env.pop` is a no-op. When the operator's machine doesn't have an active `~/.claude/` subscription session (or `claude` falls back to API-key auth in the sandboxed launchd context), the spawned `claude -p` returns rc=1, "(claude error rc=1: )" [VERIFIED: 09-VERIFICATION.md:114].

**Desired direction:**

1. Add field to `cmc.config.Settings` (settings.py:99-131 area, alongside `telegram_*` fields):

```python
anthropic_api_key: Optional[str] = Field(
    default=None,
    description=(
        "Read from ~/.command-centre/.env (or repo .env) via Settings, NOT os.environ. "
        "Surfaced into the env dict passed to `claude -p` by the Telegram handler "
        "(TELE-05). Dispatcher classic-runner intentionally does NOT use this — it "
        "scrubs the key for Pitfall 8."
    ),
)
```

2. Broaden `model_config.env_file` to a tuple so install + dev `.env` both resolve:

```python
# settings.py:30-35
model_config = SettingsConfigDict(
    env_file=(".env", str(Path.home() / ".command-centre" / ".env")),
    env_file_encoding="utf-8",
    extra="ignore",
    case_sensitive=False,
)
```

Rightmost wins → install `.env` overrides repo `.env` when both exist (mirrors `setup_telegram._resolve_env_path` precedence at backend/cmc/cli/setup_telegram.py:64-70). [CITED: pydantic-settings docs via WebSearch 2026-04-28]

3. Modify `relay_text_to_claude` to surface from Settings (handler.py:110-111):

```python
env = os.environ.copy()
env.pop("ANTHROPIC_API_KEY", None)  # always scrub stale shell-inherited value
if settings.anthropic_api_key:
    env["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
```

**Critical test conflict:** The existing test `test_handler_text_relays_to_claude_with_env_scrub` (test_phase9_handler.py:370-419) asserts `captured_calls[0]["env_has_anthropic"] is False` AFTER monkeypatching `ANTHROPIC_API_KEY=sk-test-leak-attempt` into the shell env. The test's intent (scrub shell-inherited key) remains correct. The fix:
- The test currently builds Settings as `Settings(telegram_bot_token="TKN", telegram_chat_id="1")` — `anthropic_api_key` defaults to `None`, so the assertion still passes if the new code reads from Settings.
- BUT the broadened `env_file` tuple means Settings will load whatever `~/.command-centre/.env` says on the developer machine. If that file has `ANTHROPIC_API_KEY=...`, the test fails. **Mitigation:** the test should pass `_env_file=None` to bypass file loading: `Settings(_env_file=None, telegram_bot_token="TKN", telegram_chat_id="1")`.
- Add a new test `test_handler_surfaces_anthropic_api_key_from_settings`: pass `Settings(_env_file=None, anthropic_api_key="sk-from-settings", ...)`, assert `captured_calls[0]["env"]["ANTHROPIC_API_KEY"] == "sk-from-settings"`.

**Pitfall P12 doc update:** the docstring at handler.py:9-11 and 102-108 currently says "scrub before spawn so rogue MCP server can't exfiltrate." The new behavior is more nuanced: scrub shell-inherited (untrusted) value, then re-inject from Settings (trust-boundary value). Update the docstring to reflect this — Settings IS the trust boundary, not `os.environ`.

**Why dispatcher run_classic does NOT change:** run_classic.py:78-79 pops `ANTHROPIC_API_KEY` for Pitfall 8 (RESEARCH §D6 of phase 8). Classic mode uses subscription auth via `~/.claude/`, not API key. **Do not modify dispatcher.** Only the Telegram handler relay needs the surface.

**Test coverage:**
- Existing `test_handler_text_relays_to_claude_with_env_scrub` — must be updated to pass `_env_file=None` to its Settings.
- New `test_handler_surfaces_anthropic_api_key_from_settings` — TDD-RED first.
- New `test_settings_loads_command_centre_env` — given a tmp `~/.command-centre/.env` (via `monkeypatch.setattr(Path, "home", lambda: tmp)`), Settings reads `ANTHROPIC_API_KEY` from it.

---

### C5 — Notifier inbox loop calls HTTP, not DB

**File:** `backend/cmc/telegram/notifier.py:123-141`

**Current (allegedly bypass-HTTP) code:**

```python
# notifier.py:123-133
# InboxMessage uses `read: bool` (NOT a status column). Phase 4 schema:
# read=False means "unread / not yet picked up by the user". Tolerate
# AttributeError for forward compatibility with future schemas.
try:
    inbox = (
        await db.execute(
            select(InboxMessage).where(InboxMessage.read == False)  # noqa: E712
        )
    ).scalars().all()
except Exception:
    inbox = []
```

[VERIFIED: backend/cmc/telegram/notifier.py:123-133 — Read tool, 2026-04-28]

**Existing endpoint:** `POST /api/inbox/{inbox_id}/read` is registered at `backend/cmc/api/routes/hitl.py:239` (HITL-06 idempotent mark-read) [VERIFIED]. `GET /api/inbox?unread=true` exists at `hitl.py:190-212` [VERIFIED].

**Wording ambiguity in the criterion (OPEN QUESTION):**

> "Notifier inbox loop calls /api/inbox/{id}/read instead of querying InboxMessage directly (HTTP symmetry)"

Two valid interpretations, with different behavior implications:

| Interpretation | What changes | Behavior delta |
|----------------|-------------|----------------|
| **A. Replace the GET (discovery)** | Replace `select(InboxMessage).where(read==False)` with `httpx.get(f"{LOCAL_API}/api/inbox?unread=true")`. Keep notifier-as-pure-discovery. | ZERO functional delta. Pure HTTP-symmetry refactor. Notifier stops importing `InboxMessage` model. |
| **B. Add the POST (mark-read)** | Keep the SELECT (or use the GET) AND call `POST /api/inbox/{id}/read` after sending the Telegram. | Inbox auto-marks-read on first Telegram ping. Dashboard's unread badge clears immediately. UX-visible change. |

The criterion's literal text mentions only `/api/inbox/{id}/read` (the POST). The audit's evidence text (line 161 of v1.0-MILESTONE-AUDIT.md) calls out only the SELECT (the GET-equivalent). **The two pieces of source-of-truth disagree about which side of the loop to refactor.**

**Recommendation for the planner:** Surface this as a clarification before execution. Default to **interpretation A** (replace the GET) because:
1. It mirrors the dispatcher pattern of "notifier is a pure consumer of API state" without changing UX.
2. Auto-marking-read on Telegram ping (interp B) breaks the dashboard inbox semantics — a user who reads on dashboard and a user who reads via Telegram are the same UX state, but the notifier currently fires once-per-NotificationLog-row regardless of `read`. Adding mark-read changes that gate.
3. The audit explicitly calls the current code "fine for in-process, would silently fail if notifier ever split remote" — that's an HTTP-discovery argument, not a mark-read argument.

If the user picks **interpretation A** (recommended), the desired direction is:

```python
# Replace lines 123-133 with:
try:
    r = await http_client.get(f"{LOCAL_API}/api/inbox", params={"unread": "true", "limit": 200})
    r.raise_for_status()
    inbox = [InboxLite(**item) for item in r.json()["items"]]
except Exception as exc:
    log.warning("notifier.inbox_fetch_failed", extra={"err": str(exc)})
    inbox = []
```

Where `InboxLite` is a small dataclass (or `InboxListItem` schema reused) so the rest of `_claim_and_send` can read `.id` consistently. The `_FORMATTER["inbox"]` (notifier.py:185) already takes a row-shaped object — feed it the schema instance.

**`http_client` plumbing:** `run_one_cycle` accepts an optional `http_client: Optional[httpx.AsyncClient]` (notifier.py:263) but currently uses it only for `api.send_message` to Telegram. The signature is fine; just construct `http_client = httpx.AsyncClient()` at the top of the cycle if not provided, and pass to both `_gather_candidates` and the existing send path.

**`oneshot_notifier.py`:** Currently constructs no http_client (notifier.run_one_cycle does). One-line addition: pass `http_client = httpx.AsyncClient(base_url=...)` from oneshot to maintain symmetry. Or leave it for `run_one_cycle` to construct internally.

**LOCAL_API constant:** `notifier.py` does not currently import `LOCAL_API`; the handler does (handler.py:54: `LOCAL_API = "http://127.0.0.1:8765"`). Re-define or move to a shared module (e.g., `cmc.telegram.api`).

**Server-running gating:** The notifier must call `/api/inbox?unread=true` over HTTP — that REQUIRES the cmc server (port 8765) to be up. If the server is down, the notifier silently degrades. The plan should preserve the existing `try/except` to keep the notifier from crashing when the server isn't running. Same fault-tolerance the dispatcher already exhibits.

If the user picks **interpretation B** (POST mark-read after notify): the change is a single line added at the end of `_claim_and_send` after `status="sent"` writeback (notifier.py:243-256), conditional on `kind == "inbox"`. But this changes UX — flag for user explicit confirmation.

**Test coverage:**
- New (interp A): `test_notifier_inbox_via_http_get` — MockTransport-backed `http_client` returning a synthetic `/api/inbox?unread=true` payload; assert one Telegram send per item.
- New (interp A): `test_notifier_inbox_handles_server_down` — http_client raises `ConnectError`; assert notifier returns 0, doesn't crash, stamps tick.
- Existing notifier tests (`test_phase9_notifier.py:78-308`) all use decision/approval candidates, not inbox — so they are NOT affected by interpretation A's change. Verified by `grep "inbox" test_phase9_notifier.py` returning empty.

---

## Dependencies & Ordering

| # | Item | Depends on | Can parallel with |
|---|------|-----------|-------------------|
| 1 | REQUIREMENTS.md flip 5 rows (SC1) | none | 2, 3, 4, 5 |
| 2 | ROADMAP.md verify 04-04 (SC2 — no-op) | none | 1, 3, 4, 5 |
| 3 | Settings: add `anthropic_api_key`, broaden `env_file` (SC3+SC4 root) | none | 1, 2 |
| 4 | doctor.py: route check 8 + check 7 through Settings (SC3) | task 3 | task 5 |
| 5 | handler.py: surface ANTHROPIC_API_KEY from Settings (SC4) | task 3 | task 4 |
| 6 | notifier.py: HTTP-symmetric inbox discovery (SC5, interp A) | none | 1, 2, 3, 4, 5 |

**Recommended wave plan for granularity=fine:**
- Wave 0: tasks 1, 2 (pure docs, parallel)
- Wave 1: task 3 (Settings change is the foundation)
- Wave 2: tasks 4, 5 (parallel after 3 — both depend on Settings.anthropic_api_key + the env_file tuple)
- Wave 3: task 6 (independent; can also run parallel with 1, 2 if granularity permits)

**Critical ordering:** task 3 MUST land before tasks 4 + 5. Tasks 4 and 5 share no files (doctor.py vs handler.py) and can run parallel. Task 6 is fully independent of tasks 3-5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|------------|-----|
| Multi-source `.env` loading | `read_text` + manual parsing | `pydantic-settings env_file` tuple | Already a dependency; supports precedence; integrates with field validation |
| HTTP retry / timeout in notifier | bespoke retry loop | existing httpx.AsyncClient pattern | Phase 8/9 already handle this; mirror their try/except |
| Path resolution for tilde | `os.path.expanduser` literal strings | `Path.home() / ".command-centre" / ".env"` | Already used at backend/cmc/cli/setup_telegram.py:34 — match style |

## Common Pitfalls

### Pitfall A: developer-machine `~/.command-centre/.env` polluting tests
**What goes wrong:** After broadening `env_file` to include `~/.command-centre/.env`, ANY test that constructs `Settings()` will pick up the developer's real install env (including a real `TELEGRAM_BOT_TOKEN` or `ANTHROPIC_API_KEY`).
**Why it happens:** pydantic-settings reads `env_file` at instantiation time using whatever `Path.home()` returns at that moment.
**How to avoid:** All tests that construct Settings should pass `_env_file=None` explicitly. A pytest fixture in `conftest.py` could auto-apply this. Audit every existing `Settings(...)` call in tests before merging — there are at least 22 such call sites [VERIFIED: grep "Settings(" tests/ — sampling shows test_phase9_handler.py uses bare `Settings(telegram_bot_token=...)`].
**Warning signs:** Tests that pass on CI (clean env) but fail locally for the user.

### Pitfall B: doctor.py double-loads Settings on every check
**What goes wrong:** `_check_telegram` and `_check_launchd_jobs` each call `load_settings()` independently — Settings re-reads `.env` files on each call.
**Why it happens:** No module-level cache.
**How to avoid:** Either cache Settings as a module-level singleton (already the dispatcher pattern via `cmc.config.load_settings`) or accept it as a parameter threaded from `run_checks`. Prefer the latter for testability.
**Warning signs:** Slow `cmc doctor` (each `.env` read costs ~1ms; trivial for 8 calls — flagged for hygiene only).

### Pitfall C: criterion #5 interpretation drift
**What goes wrong:** Implementer picks interpretation B without surfacing to user → dashboard inbox UX silently changes.
**Why it happens:** The criterion's literal path matches the POST endpoint, but the audit's evidence calls out the SELECT. Reasonable reader picks B.
**How to avoid:** Plan must include an explicit clarification step (consult user OR cite this RESEARCH §C5 open question with explicit recommendation A).
**Warning signs:** No user-confirmation step in the plan for C5.

### Pitfall D: pytest cache vs new Settings field
**What goes wrong:** Adding `anthropic_api_key` to Settings flips the model schema; pydantic v2 may require regenerating cached fixtures.
**Why it happens:** Defaults are not the issue; tests that mock `Settings()` with `Mock(spec=Settings)` may break.
**How to avoid:** Search tests for `Mock(spec=Settings)` and `MagicMock(spec=Settings)` before merging. [VERIFIED: grep "spec=Settings" backend/tests/ → 0 hits, so clean.]

## Code Examples

### Settings field + env_file tuple

```python
# backend/cmc/config/settings.py
from pathlib import Path

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", str(Path.home() / ".command-centre" / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )
    # ... existing fields ...
    anthropic_api_key: Optional[str] = Field(
        default=None,
        description="Loaded from ~/.command-centre/.env via Settings; surfaced into "
                    "the env passed to `claude -p` by the Telegram handler (TELE-05).",
    )
```

### Handler env surface

```python
# backend/cmc/telegram/handler.py:99-114
def relay_text_to_claude(text: str, settings: Settings) -> str:
    env = os.environ.copy()
    env.pop("ANTHROPIC_API_KEY", None)            # scrub stale shell-inherited
    if settings.anthropic_api_key:                # surface from Settings (.env)
        env["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
    cmd = [str(settings.claude_bin), "-p", text, "--bare", ...]
    # ... rest unchanged ...
```

### Notifier HTTP discovery (interpretation A)

```python
# backend/cmc/telegram/notifier.py — replace lines 123-133
async def _fetch_unread_inbox(http_client: httpx.AsyncClient) -> list[Any]:
    """Replace direct InboxMessage SELECT with HTTP GET (HTTP symmetry, SC5)."""
    try:
        r = await http_client.get(
            f"{LOCAL_API}/api/inbox", params={"unread": "true", "limit": 200},
        )
        r.raise_for_status()
        return r.json().get("items", [])
    except Exception as exc:
        log.warning("notifier.inbox_fetch_failed", extra={"err": str(exc)})
        return []
```

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.3 |
| Config file | backend/pyproject.toml (no separate pytest.ini) |
| Quick run | `cd backend && uv run pytest tests/test_phase9_setup.py tests/test_phase9_handler.py tests/test_phase9_notifier.py -x` |
| Full suite | `cd backend && uv run pytest -x` |

[VERIFIED: backend/tests collected 379 tests in 0.22s — uv run pytest --collect-only, 2026-04-28]

### Phase Requirements → Test Map

| SC | Behavior | Type | Command | Exists? |
|----|----------|------|---------|---------|
| 1 | INGST rows say Complete | manual grep / lint | `grep -c "INGST-0[23568] | Phase 2 | Complete" .planning/REQUIREMENTS.md → 5` | ❌ Wave 0 (new check) |
| 2 | ROADMAP 04-04 is `[x]` | manual grep | `grep "^- \\[x\\] 04-04-PLAN" .planning/ROADMAP.md` | ❌ Wave 0 (new check) |
| 3 | doctor reads token via Settings | unit | `pytest tests/test_phase9_setup.py::test_doctor_telegram_via_settings -x` | ❌ Wave 0 (new test) |
| 3 | doctor existing test still passes | unit | `pytest tests/test_phase9_setup.py::test_doctor_telegram_skipped_when_unset -x` | needs update for `_env_file=None` |
| 4 | handler injects key from Settings | unit | `pytest tests/test_phase9_handler.py::test_handler_surfaces_anthropic_api_key -x` | ❌ Wave 0 (new test) |
| 4 | env_file tuple loads command-centre | unit | `pytest tests/test_phase1_boot.py::test_settings_loads_command_centre_env -x` | ❌ Wave 0 (new test) |
| 4 | existing scrub-test still passes | unit | `pytest tests/test_phase9_handler.py::test_handler_text_relays_to_claude_with_env_scrub -x` | needs `_env_file=None` patch |
| 5 | notifier fetches inbox via HTTP | unit | `pytest tests/test_phase9_notifier.py::test_notifier_inbox_via_http_get -x` | ❌ Wave 0 (new test) |
| 5 | server-down → graceful degrade | unit | `pytest tests/test_phase9_notifier.py::test_notifier_inbox_handles_server_down -x` | ❌ Wave 0 (new test) |

### Sampling Rate
- Per task commit: targeted file (e.g., `pytest tests/test_phase9_handler.py -x`) — runs in <2s
- Per wave merge: full Phase 9 suite — `pytest tests/test_phase9_*.py -x` (78 tests, ~5s)
- Phase gate: full suite green — `pytest -x` (379 tests, ~10s)

### Wave 0 Gaps
- [ ] `test_phase9_setup.py::test_doctor_telegram_via_settings` — covers SC3 new behavior
- [ ] `test_phase9_handler.py::test_handler_surfaces_anthropic_api_key` — covers SC4
- [ ] `test_phase1_boot.py::test_settings_loads_command_centre_env` — covers env_file tuple (SC3+SC4 shared root)
- [ ] `test_phase9_notifier.py::test_notifier_inbox_via_http_get` — covers SC5 interp A
- [ ] `test_phase9_notifier.py::test_notifier_inbox_handles_server_down` — covers SC5 graceful degrade
- [ ] Update existing `test_handler_text_relays_to_claude_with_env_scrub` — pass `_env_file=None`
- [ ] Update existing `test_doctor_telegram_skipped_when_unset` — pass `_env_file=None` or use `tmp_path`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Localhost-only; no user auth in scope |
| V3 Session Management | no | Single-user tool |
| V4 Access Control | no | Telegram allowlist already in place (telegram_allowed_user_ids) — not changing |
| V5 Input Validation | partial | Settings ValidationError already covers invalid env values |
| V6 Cryptography | no | No new crypto |
| V7 Error Handling & Logging | yes | Settings._render_pretty already prints field names only, never values [VERIFIED: settings.py:185-199] — preserve this for new field |

### Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exfil via rogue MCP server | Information Disclosure | env scrub in dispatcher (run_classic.py:78-79); for handler, scrub-then-Settings-surface preserves trust boundary |
| `.env` value leak in logs | Information Disclosure | _render_pretty omits values; do NOT log `settings.anthropic_api_key` even on debug |
| Path-injection via `~` | Tampering | Path.home() is process-bound and trusted (no env-var override) |

**New `anthropic_api_key` field secrecy:** preserve V7 — never log it, never include it in `_render_pretty` errors (already enforced — only field name + msg are printed at settings.py:196-198).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Criterion SC1 wants status-only flip (option 1), NOT full schema redesign | C1 | Low — easy to expand if user requests |
| A2 | Criterion SC5 wants interpretation A (replace GET), not B (add POST) | C5 | High — interp B is UX-changing; flagged as Open Question |
| A3 | Test fixtures will need `_env_file=None` to insulate from developer's `~/.command-centre/.env` | Pitfall A | Medium — if missed, tests pass on CI but fail locally |

## Open Questions

1. **SC1 schema choice**
   - What we know: Criterion says "with phase + date" — current schema has phase but not date.
   - What's unclear: Add a Verified-date column to all rows OR just flip 5 statuses with no date.
   - Recommendation: Status-only flip (5 lines). Surface to user during plan-check if they want a date column.

2. **SC5 interpretation (A vs B)**
   - What we know: Audit evidence flags the SELECT (suggesting GET-replacement, interp A); criterion text mentions only the POST endpoint (suggesting mark-read, interp B).
   - What's unclear: Which side of the inbox loop is the target.
   - Recommendation: Default to interp A. Plan should include a checkpoint asking the user to confirm before code lands.

3. **Pitfall P12 docstring rewrite**
   - What we know: handler.py docstrings (lines 9-11, 102-108) currently describe an "always scrub" policy that contradicts the new "scrub-then-Settings-surface" behavior.
   - What's unclear: How aggressively to rewrite — minimal patch (one paragraph) vs. full rewrite explaining the trust-boundary distinction.
   - Recommendation: Minimal patch. Add a 3-line note: "Shell-inherited values are scrubbed (untrusted). Settings-sourced values (loaded from `~/.command-centre/.env`) are surfaced (trusted)."

## Sources

### Primary (HIGH confidence)
- `backend/cmc/cli/doctor.py:240-241,283-317` — current TELEGRAM_BOT_TOKEN os.environ reads
- `backend/cmc/telegram/handler.py:99-136` — current relay_text_to_claude with env scrub
- `backend/cmc/telegram/notifier.py:123-141` — current InboxMessage SELECT
- `backend/cmc/api/routes/hitl.py:190-261` — existing GET /api/inbox?unread=true and POST /api/inbox/{id}/read
- `backend/cmc/config/settings.py:29-35,99-131` — current SettingsConfigDict, telegram fields
- `backend/cmc/cli/setup_telegram.py:34-70` — INSTALL_ENV/DEV_ENV precedence pattern to mirror
- `backend/cmc/telegram/templates/com.cmc.telegram-handler.plist.j2:15-24` — launchd cwd + env vars
- `.planning/REQUIREMENTS.md:367-376` — current INGST traceability rows
- `.planning/ROADMAP.md:104` — already-fixed 04-04 checkbox
- `.planning/v1.0-MILESTONE-AUDIT.md:36-40,156-161` — audit's evidence text
- `backend/tests/test_phase2_ingest.py:34-1110` — INGST coverage proof
- `backend/tests/test_phase9_handler.py:370-419` — existing scrub-test that needs update
- `backend/tests/test_phase9_setup.py:194-200` — existing doctor-skipped-when-unset test
- `backend/uv.lock:572,643` — python-dotenv 1.2.2 already pulled in
- git log + git diff — confirmed 04-04 flip via commit `817886c`, INGST close-out 2026-04-25 via `d91f054`

### Secondary (MEDIUM confidence)
- pydantic-settings docs via WebSearch 2026-04-28 — env_file tuple precedence (rightmost wins)

### Tertiary (LOW confidence)
- (none)

## Metadata

**Confidence breakdown:**
- File:line citations: HIGH — every claim grep'd or Read directly in this session
- pydantic-settings env_file tuple: MEDIUM — verified via WebSearch only; not Context7-verified, but the behavior matches the team's existing usage
- SC5 interpretation: LOW — irreducible ambiguity in the criterion text vs. audit; flagged as Open Question, NOT a confidence problem with the underlying code

**Research date:** 2026-04-28
**Valid until:** 2026-05-15 (the codebase is in active development; criteria phrasing won't change but the underlying `notifier.py` lines might if a competing change lands)

## RESEARCH COMPLETE

**Phase:** 11 - v1-docs-env-polish
**Confidence:** HIGH

### Key Findings
- SC2 (ROADMAP 04-04 checkbox) is **already fixed** at HEAD via commit `817886c`. Plan should treat as no-op verification.
- SC3 + SC4 share a single root cause (Settings doesn't load `~/.command-centre/.env`). Fix once in `cmc.config.Settings` via `env_file=(".env", str(Path.home() / ".command-centre" / ".env"))` and add `anthropic_api_key` field.
- SC5 has a **wording ambiguity** between criterion text (POST mark-read) and audit evidence (SELECT replacement). Recommended interpretation: replace SELECT with `GET /api/inbox?unread=true` (zero UX delta). Plan must surface this to user before execution.
- 22+ existing test sites construct `Settings(...)` without `_env_file=None` — broadening `env_file` will leak the developer's real install env into tests. Audit + patch ALL of them, OR add a conftest fixture.
- Pitfall P12 docstring needs a 3-line update: shell-inherited keys still scrubbed; Settings-sourced keys are surfaced. Trust boundary is Settings, not `os.environ`.

### File Created
`/Users/patrykattc/work/git/claude-mission-control/.planning/phases/11-v1-docs-env-polish/11-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | No new dependencies; all changes within existing pydantic-settings + httpx + sqlalchemy footprint |
| File:line evidence | HIGH | Every claim Read/grep'd in this session |
| Architecture (env loading + HTTP symmetry) | HIGH | Mirrors existing setup_telegram._resolve_env_path and handler/notifier httpx patterns |
| SC5 interpretation | LOW | Ambiguity is irreducible; flagged as Open Question for user clarification |
| Test impact (`_env_file=None` propagation) | MEDIUM | Only 1 test directly verified; pattern needs systematic audit at execution time |

### Open Questions
1. SC1 schema — flip status-only or add Verified-date column to all rows? Recommend status-only.
2. SC5 — interp A (replace GET) or B (add POST)? Recommend A; surface to user.
3. Pitfall P12 docstring — minimal patch or full rewrite? Recommend minimal.

### Ready for Planning
Research complete. Planner can now create PLAN.md files. Recommended structure: 1 plan, ~6 tasks, 4 waves, granularity=fine.
