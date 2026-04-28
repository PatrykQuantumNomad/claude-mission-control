# Phase 10: Telegram Wiring Fixes — Research

**Researched:** 2026-04-28
**Domain:** FastAPI route addition, callback router payload tweak, pytest callback-parity tests
**Confidence:** HIGH (everything verified against the actual checked-in code)

## Summary

This is a tight 1-plan gap closure. The audit pre-specifies WHAT and WHERE; research focused on the HOW and surfaced one important correction to the audit's claim about the transition matrix.

Three small surgical changes:
1. Add `POST /api/tasks/{task_id}/reject` to `backend/cmc/api/routes/tasks.py`, mirroring the `approve` endpoint pattern (explicit source-state validation, fixed target state, bypass `validate_transition`).
2. Append `"answered_by": "telegram"` to the body that `dash_router.route()` returns for the `answer_decision` verb.
3. Add backend pytest tests covering Approve / Reject / Snooze callback parity end-to-end, plus the new `/reject` route directly.

**Primary recommendation:** Treat the audit's "transition already exists in `validate_transition` matrix" line as INCORRECT — it does not. Bypass the matrix (consistent with how `approve` and `rerun` already work) rather than re-architecting the matrix. No DB schema migration is required. No new timestamp column is needed.

## Audit Correction (CRITICAL — read before planning)

**Audit says** (`.planning/v1.0-MILESTONE-AUDIT.md:129`): *"transition already exists in `validate_transition` matrix per Phase 4 verification"*.

**Reality** (`backend/cmc/tasks/transitions.py:16-22`):
```python
_ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "pending":            frozenset({"running", "awaiting_approval", "failed", "done"}),
    "awaiting_approval":  frozenset({"pending", "failed"}),
    "running":            frozenset({"done", "failed"}),
    "done":               frozenset(),
    "failed":             frozenset({"pending"}),
}
```

`cancelled` is NOT a key, NOT a value — the state literally does not exist in the matrix. The Task model docstring `# pending / running / done / failed / awaiting_approval` (`backend/cmc/db/models/tasks.py:28`) likewise omits it.

**Implication for the plan:** Two viable paths, plus a recommendation:

| Option | Touch | Risk |
|---|---|---|
| **A (RECOMMENDED): Bypass the matrix.** Mirror `approve_task` — explicit source-state check (`row.status != "awaiting_approval"`), set `row.status = "cancelled"` directly, no matrix update. | tasks.py only | Smallest surface. Matches Phase 4 docstring philosophy (`approve` and `rerun` bypass the matrix because their target is fixed). |
| **B: Extend the matrix.** Add `"cancelled": frozenset()` (terminal) and add `"cancelled"` to `awaiting_approval`'s allowed targets. Then make `/reject` go through `validate_transition`. | tasks.py + transitions.py + matrix tests | Bigger blast radius. Forces the planner to also reason about `pending → cancelled` (does it exist? probably not for v1.0), and updates the docstring. |

Option A is what the audit author likely intended ("bypass" implied by "transition already exists" mistake — they were thinking of the conceptual transition, not the matrix entry). Option A also matches the existing Phase-4-locked router contract.

## Standard Stack (already in repo — no new deps)

| Library | Version | Purpose | Already used by |
|---|---|---|---|
| FastAPI | (pinned via `pyproject.toml`) | Async HTTP routes | `cmc.api.routes.tasks` |
| SQLAlchemy + sqlmodel async | — | DB session via `Depends(get_session)` | every existing route |
| pytest + pytest-asyncio | — | Backend test framework | all 373 backend tests |
| httpx + httpx.MockTransport | — | Test fixtures for both Telegram + local API HTTP mocking | `test_phase9_handler.py` (already does exactly this for approve/snooze/estop) |

**No new packages required. No frontend touch required** (frontend already accepts `status: string` for Task — adding a new value is not a typed-API breaking change).

## Architecture Patterns (the existing-code conventions to mirror)

### Pattern 1: Source-state-validating action endpoint (the `/approve` template)

`backend/cmc/api/routes/tasks.py:189-212` is the canonical pattern. Mirror it verbatim for `/reject`:

```python
# ---------- TASK-08: POST /api/tasks/{id}/reject ----------

@router.post("/tasks/{task_id}/reject", response_model=TaskRejectResponse)
async def reject_task(
    task_id: int,
    db: AsyncSession = Depends(get_session),
) -> TaskRejectResponse:
    """Phase 10: cancel an awaiting_approval task — used by Telegram approval-card 🛑 Reject.

    400 when the source state is not 'awaiting_approval' — the dashboard / Telegram
    should never offer Reject outside that state, but the server enforces defensively.
    """
    row = (
        await db.execute(select(Task).where(Task.id == task_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="task not found")
    if row.status != "awaiting_approval":
        raise HTTPException(status_code=400, detail="task is not awaiting approval")

    row.status = "cancelled"
    await db.commit()
    return TaskRejectResponse(id=task_id, status="cancelled")
```

**Status code:** `200` (mirrors `/approve` and `/rerun`). The audit SC1 says "returns 200" — good.
**Async session injection:** `db: AsyncSession = Depends(get_session)` — same as every other route in the file.
**Error contract:** `raise HTTPException(...)`. The Phase 1 app-level handler emits `{error: detail}` (see `test_phase4_tasks.py:190` — assertion is `r.json()["error"]`, NOT `r.json()["detail"]`).

### Pattern 2: Response DTO

Add a `TaskRejectResponse` to `backend/cmc/api/schemas/tasks.py` mirroring `TaskRerunResponse`:

```python
class TaskRejectResponse(BaseModel):
    id: int
    status: str
```

`approved_at`-style timestamp is NOT needed — see Pitfall 2 below.

### Pattern 3: Telegram callback test harness (the existing `test_phase9_handler.py` template)

`backend/tests/test_phase9_handler.py:160-194` (`test_handler_callback_approve_task_dispatches_post`) is the EXACT pattern to clone for the new Reject parity test. The harness is already proven for approve, snooze (RESOLVE_THEN_PATCH), estop, and unknown-verb paths.

Key fixture machinery already provided in that file:
- `_telegram_transport(...)` — MockTransport for `api.telegram.org` (records `/answerCallbackQuery`, `/editMessageReplyMarkup`, `/sendMessage`).
- `_local_api_transport(captured)` — MockTransport for `http://127.0.0.1:8765/api/*` that records every request.
- `seeded_app` + `cm` lifespan context — already a fixture in `conftest.py:289-333`.
- `Settings(telegram_bot_token="TKN", telegram_chat_id="1")` — minimal test settings.

**Test pattern to clone (Reject):**
```python
@pytest.mark.asyncio
async def test_handler_callback_reject_task_dispatches_post(seeded_app):
    """reject_task:42 → POST /api/tasks/42/reject, ack, edit-strip buttons."""
    # ... identical to test_handler_callback_approve_task_dispatches_post,
    # but with data="reject_task:42" and assertion on /api/tasks/42/reject.
```

### Pattern 4: Pure-function router test (already covers approve, can extend)

`backend/cmc/telegram/dash_router.py` has no dedicated test file but is exercised through `test_phase9_handler.py`. The reject route is already in `dash_router.route()` — no router code changes are needed for SC1. The change is in `tasks.py`. The dash_router change is for SC3 (answered_by).

## Don't Hand-Roll

| Problem | Don't build | Use existing | Why |
|---|---|---|---|
| Status transition validation for /reject | A new entry in `_ALLOWED_TRANSITIONS` | Inline source-state check (`if row.status != "awaiting_approval"`) | Mirrors approve/rerun. Keeps the matrix pure for PATCH-driven transitions; avoids cascading "what about pending→cancelled, running→cancelled" debates. |
| New AsyncSession boilerplate | Custom session factory | `Depends(get_session)` from `cmc.db` | Already wired across every route. |
| New httpx test transport | Custom mocks | The existing `_telegram_transport` and `_local_api_transport` helpers in `test_phase9_handler.py` (copy or import) | Already proven against approve/snooze/estop. |
| New Telegram→backend dispatch path | Anything | Existing `handler.dispatch_callback` | reject_task already routes correctly through dash_router; only the backend route is missing. |
| `cancelled_at` timestamp column / Alembic migration | A new column on `tasks` | NOTHING — just status='cancelled' | No existing consumer of `cancelled_at`. The audit only requires "transitions awaiting_approval → cancelled, returns 200". Out-of-scope per minimal-touch principle. |

## Common Pitfalls

### Pitfall 1: Error response key is `error`, NOT `detail`

`backend/tests/test_phase4_tasks.py:190` asserts `r.json()["error"]`. The Phase 1 app-level exception handler renames FastAPI's default `{detail: ...}` to `{error: ...}`. Make sure new tests use `r.json()["error"]`.

### Pitfall 2: Don't add a `cancelled_at` column

The audit doesn't require it. SC1 only specifies "transitions awaiting_approval → cancelled, returns 200". Adding a column means an Alembic migration, a model change, a DTO change, and frontend changes. Keep `TaskRejectResponse` to `{id, status}` (mirrors `TaskRerunResponse`).

### Pitfall 3: `answered_by` is a strict Literal

`backend/cmc/api/schemas/hitl.py:53` declares:
```python
answered_by: Literal["dashboard", "telegram", "cli"] = "dashboard"
```
So `"telegram"` is already a valid value — no schema change needed. The fix is purely in `dash_router.route()`:

```python
if verb == "answer_decision" and len(args) == 2:
    return ("POST", f"/api/decisions/{args[0]}/answer",
            {"answer": args[1], "answered_by": "telegram"})
```

### Pitfall 4: `validate_transition` matrix is NOT the source of truth for action endpoints

`approve` and `rerun` both bypass it (per `backend/cmc/api/routes/tasks.py:18-22` docstring). `reject` should also bypass it. Trying to extend the matrix risks breaking PATCH semantics elsewhere.

### Pitfall 5: Snooze parity test ALREADY exists — don't duplicate

`test_handler_callback_snooze_resolves_then_patches` in `test_phase9_handler.py:233-273` is already in the suite. SC4 says "covers Approve / Reject / Snooze". Approve and Snooze coverage exists. The plan only needs to ADD Reject parity. (Optional: a parametrized rewrite of all three for cleanliness — but that's gold-plating; the current shape is fine.)

### Pitfall 6: `dispatch_callback` strips buttons on success (`r.status_code < 400`)

A 200 response from `/reject` will trigger `edit_message_reply_markup` to strip the Approve/Reject buttons (`backend/cmc/telegram/handler.py:241-252`). This is correct behavior — verify in the new parity test that `len(ed) >= 1` after a successful reject (mirrors approve test line 194).

### Pitfall 7: `dash_router.py` test for `answered_by` change

Currently no unit test in `test_phase9_telegram_unit.py` (or elsewhere) asserts the BODY of the `answer_decision` route mapping. Add a small unit test:
```python
def test_route_answer_decision_includes_telegram_provenance():
    method, path, body = dash_router.route("answer_decision", ["7", "yes"])
    assert method == "POST"
    assert path == "/api/decisions/7/answer"
    assert body == {"answer": "yes", "answered_by": "telegram"}
```

## Code Examples (verified against existing files)

### Existing `/approve` (template for `/reject`)
**Source:** `backend/cmc/api/routes/tasks.py:189-212` (HIGH confidence — read directly)

### Existing approve callback parity test (template for reject test)
**Source:** `backend/tests/test_phase9_handler.py:160-194` (HIGH confidence — read directly)

### Where the bug lives — answered_by mis-tag
**Source:** `backend/cmc/telegram/dash_router.py:58-59`
```python
if verb == "answer_decision" and len(args) == 2:
    return ("POST", f"/api/decisions/{args[0]}/answer", {"answer": args[1]})
```
**Fix:** add `"answered_by": "telegram"` to the body dict.

### Where the bug lives — reject_task → 404
**Sources:**
- `backend/cmc/telegram/messages.py:97` — emits the button.
- `backend/cmc/telegram/dash_router.py:54-55` — routes to `/reject`.
- `backend/cmc/api/routes/tasks.py` — has NO matching route (verified — only `/approve`, `/rerun`, DELETE, PATCH, POST, GET, `/dispatcher/trigger` exist).

## Concrete Test Names (per SC4 — Approve / Reject / Snooze callback parity)

The plan should land these tests. Numbers are illustrative — the planner can rename to taste.

| File | Test | Purpose | New / Existing |
|---|---|---|---|
| `backend/tests/test_phase4_tasks.py` | `test_task_reject_legal` | POST `/api/tasks/{id}/reject` on `awaiting_approval` → 200, status='cancelled' | NEW |
| `backend/tests/test_phase4_tasks.py` | `test_task_reject_illegal` | POST `/api/tasks/{id}/reject` on `pending` → 400 ("not awaiting approval") | NEW |
| `backend/tests/test_phase4_tasks.py` | `test_task_reject_404` | POST `/api/tasks/999999/reject` → 404 | NEW |
| `backend/tests/test_phase9_handler.py` | `test_handler_callback_reject_task_dispatches_post` | callback `reject_task:42` → POST `/api/tasks/42/reject`, ack, strip buttons | NEW |
| `backend/tests/test_phase9_telegram_unit.py` | `test_route_answer_decision_includes_telegram_provenance` | `dash_router.route("answer_decision", [...])` body contains `answered_by="telegram"` | NEW |
| `backend/tests/test_phase9_handler.py` | `test_handler_callback_answer_decision_tags_telegram_provenance` | callback `answer_decision:7:yes` → POST body to `/api/decisions/7/answer` includes `answered_by=telegram` | NEW (recommended — exercises the wiring end-to-end, not just the pure router) |
| `backend/tests/test_phase9_handler.py` | `test_handler_callback_approve_task_dispatches_post` | (existing — kept) | EXISTING |
| `backend/tests/test_phase9_handler.py` | `test_handler_callback_snooze_resolves_then_patches` | (existing — kept) | EXISTING |

**Test count delta:** +5 to +6 tests → 378–379 ≥ 373 (SC5 satisfied).

The end-to-end `answered_by` test is recommended because the existing `_local_api_transport` already records the request body — the assertion is one extra line:
```python
post_call = next(c for c in local_calls if "/api/decisions/7/answer" in c["url"])
# extract recorded body from MockTransport — see how _telegram_transport does it via req.read()
```

(The current `_local_api_transport` in `test_phase9_handler.py:67-84` does NOT record bodies, only method/url. The plan should extend it to also capture `req.read().decode()` to enable body assertions. Trivial change; one line.)

## Files Modified — Minimal Touch Surface

| File | Change |
|---|---|
| `backend/cmc/api/routes/tasks.py` | Add `reject_task` endpoint (~25 lines, mirrors approve_task) |
| `backend/cmc/api/schemas/tasks.py` | Add `TaskRejectResponse` (~3 lines, mirrors TaskRerunResponse) |
| `backend/cmc/telegram/dash_router.py` | Single-line: append `"answered_by": "telegram"` to answer_decision body |
| `backend/tests/test_phase4_tasks.py` | Add 3 reject tests (legal / illegal / 404) |
| `backend/tests/test_phase9_handler.py` | Add reject parity test + answered_by parity test; extend `_local_api_transport` to capture body |
| `backend/tests/test_phase9_telegram_unit.py` | Add 1 unit test for `dash_router.route()` body |

**Files NOT touched (and reasons):**
- `backend/cmc/db/models/tasks.py` — no schema change (no `cancelled_at` column).
- `backend/cmc/tasks/transitions.py` — Reject bypasses the matrix (Pattern 1).
- `backend/migrations/versions/*` — no migration needed.
- `backend/cmc/api/schemas/hitl.py` — `Literal["dashboard", "telegram", "cli"]` already accepts "telegram".
- `frontend/src/lib/api.ts` — `status: string` (un-narrowed) accepts `"cancelled"` without TypeScript change. Frontend Reject UX is OUT OF SCOPE for v1.0 (only Telegram path required by SC2).
- `backend/cmc/telegram/messages.py` — button already emits the correct callback.
- `backend/cmc/telegram/handler.py` — `dispatch_callback` already handles arbitrary `(method, path, body)` tuples.

## Open Questions / Ambiguities (for planner)

### Q1: Should /reject also tombstone the task?

**Recommendation: NO.** Per Pitfall 2, no `cancelled_at` column exists, no consumer requires one, and the audit doesn't require it. Tombstoning (e.g., DELETE-then-recreate semantics, or a `tombstoned` boolean) is a different concept from `cancelled` and is not in scope. Just transition the status.

### Q2: Does the frontend need a "cancelled" filter / column?

**Recommendation: NO for v1.0.** SC2 explicitly scopes the user-visible flow to Telegram. Frontend cancelled-task display is implicitly Phase 11 polish or v1.x. The TaskBoard groups rows by status (`pending`, `awaiting_approval`, `running`, etc.) — `cancelled` rows will fall into the `else` bucket. Acceptable. (Confirmed by reading `frontend/src/components/panels/TaskBoard.tsx` — no enum check on `cancelled` exists; the component only special-cases `awaiting_approval`.)

### Q3: Do existing `pending`, `running`, etc. tasks need a path to `cancelled`?

**Recommendation: NO for Phase 10.** SC1 narrows the source state to `awaiting_approval`. A general "cancel any task" feature can be a future ask. Restrict the source state explicitly in `/reject`.

### Q4: Should the reject route also clear `started_at`/`ended_at` like rerun does?

**Recommendation: NO.** `awaiting_approval` tasks have not started, so those fields are already None. Don't add defensive clears that mask state-machine bugs.

### Q5: Does `dispatcher.heartbeat` or the autonomy gate need awareness of `cancelled`?

**Verified: NO.** `backend/cmc/dispatcher/heartbeat.py` and `backend/cmc/dispatcher/autonomy_gate.py` only consume `pending` and write `awaiting_approval` / `running`. A `cancelled` task is invisible to them (their `WHERE status=...` filters never match). No dispatcher changes needed.

## State of the Art / Confidence

| Area | Level | Reason |
|---|---|---|
| Standard stack | HIGH | All deps already pinned in repo; no new libs. |
| Route pattern | HIGH | Mirrored from existing `/approve` (read in full). |
| Test harness | HIGH | Mirrored from existing `test_phase9_handler.py` (read in full). |
| Audit-matrix mismatch | HIGH | Verified against `transitions.py` source. |
| Frontend impact | HIGH | Verified `TaskBoard.tsx` and `lib/api.ts` — `status: string` accepts new values. |
| Test count math | HIGH | Counted via `grep -c "^def test_\|^async def test_" tests/*.py` → 373. |

## Sources (HIGH confidence — all from the repo itself)

- `backend/cmc/api/routes/tasks.py` (lines 1-267) — full route file, especially `/approve` (189-212), `/rerun` (218-244), error contract (36).
- `backend/cmc/tasks/transitions.py` (lines 1-27) — proves `cancelled` is absent.
- `backend/cmc/db/models/tasks.py` (lines 1-59) — no `cancelled_at` column; status comment doesn't list `cancelled`.
- `backend/cmc/telegram/dash_router.py` (lines 1-73) — confirms reject_task routes to `/reject`, confirms answer_decision body lacks answered_by.
- `backend/cmc/telegram/messages.py` (lines 87-100) — confirms 🛑 Reject button emits `reject_task:{id}`.
- `backend/cmc/telegram/handler.py` (lines 139-252) — `dispatch_callback` works with arbitrary `(method, path, body)`; strips buttons on `< 400`.
- `backend/cmc/api/schemas/hitl.py` (lines 50-58) — confirms `answered_by: Literal[...]` default `"dashboard"`.
- `backend/cmc/api/schemas/tasks.py` (lines 87-101) — TaskApproveResponse / TaskRerunResponse shape templates.
- `backend/tests/test_phase4_tasks.py` (lines 255-292) — approve test pattern.
- `backend/tests/test_phase9_handler.py` (lines 25-86, 159-273) — callback parity harness.
- `backend/tests/conftest.py` (lines 289-353, 552-602) — `seeded_app`, `client`, `make_task_row` factory.
- `frontend/src/lib/api.ts` (line 503) — `status: string` (un-narrowed; `cancelled` value won't break frontend types).
- `frontend/src/components/panels/TaskBoard.tsx` — only special-cases `awaiting_approval`; `cancelled` falls into default bucket.
- `.planning/v1.0-MILESTONE-AUDIT.md` (lines 116-160, 182) — gap definition.
- `.planning/ROADMAP.md` (lines 24, 226-244) — Phase 10/11 scope.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all patterns exist in repo.
- Architecture: HIGH — direct mirror of existing routes/tests.
- Pitfalls: HIGH — verified by reading source.

**Research date:** 2026-04-28
**Valid until:** 2026-05-12 (14 days — gap-closure window; if not executed by then, re-verify against any intervening commits to `tasks.py` / `dash_router.py`)
