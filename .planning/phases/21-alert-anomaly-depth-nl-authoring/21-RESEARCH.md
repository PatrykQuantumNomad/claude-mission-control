# Phase 21: Alert Anomaly Depth & NL Authoring - Research

**Researched:** 2026-05-07
**Domain:** Backend pure-function detector extension (sliding-window EWMA-style variance recurrence) inside a single `evaluate_anomaly`; backend NL-parser endpoint mirroring `nlcron.py` / `skill_router.py` (lazy `AsyncAnthropic`, hard-validation, returns `None` on hallucination); frontend preview-modal UX on top of the existing `AlertRuleForm`; KNOWN_METRICS sync between backend `_SCOPE_EXTRACTORS` and the frontend constant; AST-static-import test asserting "exactly one anomaly detector exists."
**Confidence:** HIGH for every claim — every locked decision in the success criteria maps to a concrete file/line in the existing codebase. The shipped code already implements the pattern templates the phase needs to mirror; the work is targeted extension, not invention.

## Summary

Phase 21 has three deliverable surfaces and zero greenfield architecture. (1) ALRT-13 extends `cmc/alerts/detector.py::evaluate_anomaly` with a `params_json.window_kind: "ewma" | "sliding"` discriminator; the existing recurrence at `detector.py:226-229` is reused verbatim for both branches because the EWMA-variance recurrence used today (`new_var = alpha*(diff*diff) + (1-alpha)*prior_var`) IS the variance-update form the spec calls "Welford" — see "Welford terminology" finding below. (2) ALRT-14 ships `POST /api/alerts/parse-nl` mirroring `cmc.schedules.nlcron::nl_to_cron` exactly (lazy `AsyncAnthropic`, returns `None` on hallucination, router maps `None → 503`); the parser injects `_SCOPE_EXTRACTORS.keys()` verbatim into the system prompt and validates every output field against `is_known_metric()` plus a fixed comparator/window vocabulary. (3) Frontend mounts a Sheet-wrapped (or Radix Dialog) preview surface inside `AlertRuleForm` that shows the parsed `AlertRule` before `useCreateAlertRule.mutate` fires; on `None` the UI surfaces an "could not parse" inline message — never auto-saves a guess.

The single non-obvious finding is that the shipped detector code uses **EWMA variance recurrence**, not classical Welford M2. The current comment (`detector.py:226`) calls it "Welford-style". The success criterion says "Welford variance recurrence … verbatim" — we interpret this as **reuse the existing recurrence verbatim** (`alpha*diff^2 + (1-alpha)*prior_var`) for the sliding branch too, NOT introduce a separate textbook Welford `M2 += (x - mean_old)*(x - mean_new)`. The sliding case differs in *what `alpha` resolves to* (sliding uses `alpha = 1/window_n` for a uniform-weighted rolling mean approximation), not in the recurrence algebra. This is the cleanest interpretation that satisfies "no parallel detector, no second dispatch branch" while honoring "Welford variance recurrence reused verbatim". Flag this for planner confirmation in CONTEXT.md if a later step contradicts it.

The KNOWN_METRICS sync is the only point with genuine option space: the codebase has zero precedent for either dynamic-fetch OR CI-sync-test patterns. The vocabulary is 3 metrics today (`cost_usd_24h`, `skill_p95_latency_ms`, `dispatcher_failed_tasks_5m`), already drift-prone (the frontend constant at `AlertRuleForm.tsx:35-39` carries a TODO-shaped header comment "Phase 17 may fetch dynamically"). Recommendation: ship **both** — a `GET /api/alerts/metrics` endpoint that reuses `_SCOPE_EXTRACTORS.keys()` (enables future-proof, single-trip-on-form-mount cache via React Query) AND a CI sync test that imports both Python and a parsed-TS snapshot of the constant and asserts equality. The endpoint is 8 lines; the test is 20. Either alone leaves a sharp edge.

**Primary recommendation:** Decompose into 3 plans in 2 waves. Wave 1 (parallel-safe, no file overlap): Plan 01 = ALRT-13 sliding-window extension to `evaluate_anomaly` + ast-static-import test asserting only one anomaly detector exists; Plan 02 = ALRT-14 backend (parser module + `POST /api/alerts/parse-nl` route + schemas + `GET /api/alerts/metrics` endpoint + tests mocking `AsyncAnthropic` per the `pick_skill` precedent). Wave 2 (depends on Plan 02 endpoint contract): Plan 03 = ALRT-14 frontend (NL input + preview modal in `AlertRuleForm` + `KNOWN_METRICS` re-source from `useAlertMetrics` query OR keep constant + CI sync test, depending on Plan 02 endpoint shape). All three plans atomic, each a single bisect-friendly commit.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ALRT-13 | User can configure rolling-mean-±-stddev anomaly detection rules — extend `evaluate_anomaly` via `params_json.window_kind: "ewma" \| "sliding"` discriminator inside the single function; Welford variance recurrence reused verbatim; warmup-boundary PENDING_FIRE guard; no new `kind` value, no parallel detector function. | `cmc/alerts/detector.py:176-277` is the function to extend; the recurrence at `:226-229` is the verbatim form to reuse for both branches. `params_json` is already the dispatch-point for window config (`_resolve_window_n` at `:163-173` reads `window_n` out of `rule.params_json`). The detector ALREADY decouples seed-vs-recurrence (`:215-224` vs `:226-236`), so the discriminator is a 2-line `alpha` resolver insert. |
| ALRT-14 | User can author alert rules in NL via `POST /api/alerts/parse-nl` ("alert me when haiku skill p95 exceeds 5s for 10 minutes" → preview modal showing parsed `AlertRule` → save). Mirrors `nlcron.py` / `skill_router.py`: lazy `AsyncAnthropic`, `_SCOPE_EXTRACTORS` vocabulary in system prompt, hard-validate via `is_known_metric()`, returns `None` on hallucination (no fallback). | `cmc/schedules/nlcron.py:21-46` is the smaller exemplar (single-string output); `cmc/dispatcher/skill_router.py:39-104` is the bigger exemplar (JSON output, registry validation). The `POST /api/schedules/parse-nl` route at `routes/schedules.py:269-281` shows the `None → 503` mapping pattern with `"natural-language schedules unavailable"` body literal. Frontend mirror at `ScheduleComposer.tsx:452-498` (`NLCronInput` component, `useParseNlCron` hook) is the UX template. |
</phase_requirements>

<user_constraints>
## User Constraints (LOCKED — from ROADMAP.md success criteria; no CONTEXT.md exists)

### Locked Decisions

1. **Single function, single dispatch branch.** ALRT-13 ships as a `params_json.window_kind: "ewma" | "sliding"` discriminator INSIDE `evaluate_anomaly`. There is NO third `kind` value (rule-level `kind` stays `"threshold" | "anomaly"`). There is NO parallel detector function. There is NO second `if rule.kind == ...` branch in the dispatcher. Verified by an ast-based static-import test asserting only one anomaly detector function exists in `cmc/alerts/detector.py`.
2. **Welford recurrence reused verbatim.** The sliding-window detector reuses the shipped Welford/EWMA-style variance recurrence verbatim (no naive `E[X²] − E[X]²`). The recurrence form at `detector.py:227-229` is the canonical shape; the sliding branch differs only in how `alpha` is resolved.
3. **Warmup-boundary PENDING_FIRE guard.** The sliding-window path has an explicit guard preventing spurious fires during the first window's worth of ticks. Concretely: while `sample_count < window_n`, return `INSUFFICIENT` (matches the EWMA branch's `< min_samples` gate at `:239-240`).
4. **NL parser returns AlertRule preview before save.** `POST /api/alerts/parse-nl` accepts a natural-language string, invokes Haiku, validates the output, and returns the parsed `AlertRule` (or a parsed-but-unsaved envelope) WITHOUT writing to the DB. The preview modal renders that response; user clicks "Save" to fire the existing `POST /api/alerts/rules` mutation. Two endpoints, never one.
5. **Mirror `nlcron.py` / `skill_router.py` pattern verbatim.** Lazy `AsyncAnthropic` (`from anthropic import AsyncAnthropic` INSIDE the function — keeps module import side-effect-free for tests); `_SCOPE_EXTRACTORS.keys()` injected verbatim into the system prompt; hard-validation via `is_known_metric()`; returns `None` on hallucination. NO fallback rule. NO "best-guess" save path. UI surfaces an honest "could not parse" message.
6. **KNOWN_METRICS stays in sync** between backend `_SCOPE_EXTRACTORS` and the frontend `AlertRuleForm` constant. EITHER a `GET /api/alerts/metrics` dynamic endpoint OR a CI sync test that fails fast on drift. (Claude's discretion — see Open Question #6.)

### Claude's Discretion

- **`window_kind` values:** Confirm `"ewma" | "sliding"` literal spelling (success criterion fixes these).
- **Default for missing `window_kind`:** RECOMMENDATION = treat missing/unknown `window_kind` as `"ewma"` (preserves the v1.0 default behavior; existing rules with `params_json: {window_n: 50}` keep working without migration).
- **Sliding window `alpha` resolution:** RECOMMENDATION = `alpha = 1.0 / window_n` for the sliding branch (uniform-weighted rolling mean; matches the spec's "rolling mean ± stddev" language). EWMA branch keeps `alpha = 2 / (N+1)` per `:212`.
- **Backend `parse-nl` response shape:** RECOMMENDATION = a dedicated `AlertRuleParseResponse` envelope: `{rule: AlertRuleCreate | null, source: str, error: str | null}`. Returning `null` for the rule field on hallucination is more honest than 503 (the model spoke; we just rejected it). Reserve 503 for missing `ANTHROPIC_API_KEY` to match the `nlcron.py` pattern.
- **Preview modal mount point:** RECOMMENDATION = inline `AlertDialog` (already imported in the codebase at `components/ui/AlertDialog.tsx`) inside `AlertRuleForm`. The dialog title is "Preview alert rule"; body shows the parsed fields read-only; action button is "Save", cancel button discards.
- **`KNOWN_METRICS` sync mechanism:** RECOMMENDATION = ship both — `GET /api/alerts/metrics` endpoint AND a backend pytest that imports the frontend `AlertRuleForm.tsx` text and regex-extracts the metric values, asserting they match `_SCOPE_EXTRACTORS.keys()`. Endpoint is the runtime path (frontend can switch to fetched-values in a future phase without touching backend); test is the static-time guard.
- **Plan boundaries:** RECOMMENDATION = 3 plans, see "Plan Decomposition" below.

### Deferred Ideas (OUT OF SCOPE)

- Multi-shot or chain-of-thought NL parsing — single Haiku call only, mirrors `nlcron.py`.
- Editing the parsed rule before save in the preview — v1 is preview-and-confirm only; if the user wants edits they cancel and use the manual form.
- Per-user / per-project NL templates — not in REQUIREMENTS.
- Confidence scores on parsed output — Haiku doesn't reliably emit them; spec demands hard-validate-or-reject.
- Streaming responses for parse-nl — single `messages.create`, single response, mirrors `nlcron.py:32`.
- Re-prompting on validation failure — return `None` immediately on first hallucination; let the user retype.
- A new `evaluate_anomaly_sliding` function — explicitly forbidden by Locked Decision #1.
</user_constraints>

## Standard Stack

### Core (already shipped in repo — extend, don't introduce)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `anthropic` (Python SDK) | pinned in `backend/pyproject.toml` | `AsyncAnthropic` client for Haiku 4.5 NL parsing | Already used by `nlcron.py` and `skill_router.py` — the lazy-import-inside-function pattern is locked. |
| `claude-haiku-4-5` model | API string | Cheap, fast structured-output model for NL→cron / NL→AlertRule | Both shipped exemplars use this exact model string verbatim. |
| `pydantic` v2 | `>=2,<3` | Request/response models for `parse-nl`; `model_validator` for hallucination-rejection in router | `cmc/api/schemas/alerts.py` already uses Pydantic v2 `model_validator` (`alerts.py:55-71`). |
| `fastapi` | from `cmc/api/routes/*.py` | `APIRouter` mounting `POST /api/alerts/parse-nl` and `GET /api/alerts/metrics` | Existing alerts router at `routes/alerts.py:60` (`router = APIRouter(tags=["alerts"])`) is the mount point. |
| stdlib `ast` | builtin | Static-import test asserting only one anomaly detector exists | Existing precedent: `tests/test_alerts_dispatcher.py:147-183` (`test_no_tasks_import` — AST walks `cmc/dispatcher/alerts.py` to assert no `cmc.dispatcher.tasks` import). The new test mirrors this. |
| `@radix-ui/react-alert-dialog` | already pinned | Preview modal primitive (Radix-portaled, role="alertdialog") | Already wrapped at `frontend/src/components/ui/AlertDialog.tsx:18,34`. Title + description + action+cancel buttons + arbitrary children body. |
| `@tanstack/react-query` | already pinned | `useMutation` for parse-nl call, `useQuery` for `useAlertMetrics()` | Mirror `useParseNlCron` at `lib/queries.ts:745-749`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `unittest.mock.AsyncMock` + `MagicMock` | stdlib | Mock `AsyncAnthropic` in tests | Used verbatim by `pick_skill` tests at `tests/test_dispatcher.py:2362-2454` (the `_patched_import` shim that replaces `anthropic.AsyncAnthropic` at import time). |
| `monkeypatch.setattr("cmc.api.routes.alerts.parse_alert_nl", AsyncMock(...))` | pytest | Mock the parser at the router import binding | Used verbatim by SCHD-06 tests at `tests/test_schedules_router.py:308-320`. Cleaner than the `__import__` shim when the test is router-level (vs detector-level). |

### Alternatives Considered (and rejected)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single `evaluate_anomaly` with `window_kind` discriminator | `evaluate_anomaly_sliding` separate function | **Locked out** by Success Criterion 1 + PITFALLS-locked anti-pattern. Don't even prototype this path. |
| Returning `None` on hallucination | Returning a `confidence: float` field | Locked out by Success Criterion 4. Hard-reject is the contract. |
| Lazy `AsyncAnthropic` inside function | Module-level `client = AsyncAnthropic(...)` singleton | Locked out by precedent — both `nlcron.py:30` and `skill_router.py:76` build per-call. Tests rely on this. |
| `GET /api/alerts/metrics` for KNOWN_METRICS sync | CI sync test only | Single-precedent claim — no current dynamic-vocab endpoint exists, and no current CI sync test exists. Recommendation: ship both (cheap; closes both holes). |
| Inline preview pane in `AlertRuleForm` | `<AlertDialog>` modal | The form is already inline; nesting another inline preview risks layout collisions in the existing `cmc-card-grid`. Modal is the cleaner UX and reuses `AlertDialog.tsx`. |
| Croniter-style validator on parsed AlertRule | Pydantic `AlertRuleCreate` model_validator (already shipped) | The existing validator at `schemas/alerts.py:55-71` already enforces `is_known_metric` + `threshold_clear < threshold_fire` — the parser pipes its output through this same validator and lets it 422 on bad LLM output. Free hard-validation. |

**Installation:** No new packages required. Phase 21 is pure-stdlib + repo's existing dependencies.

## Architecture Patterns

### Recommended file additions / modifications

```
backend/
  cmc/
    alerts/
      detector.py                  # MODIFY: add window_kind dispatch inside evaluate_anomaly
      nl_parser.py                 # NEW: parse_alert_nl(prompt) -> AlertRuleCreate | None
                                   # Mirrors cmc/schedules/nlcron.py shape exactly.
    api/
      routes/
        alerts.py                  # MODIFY: + POST /alerts/parse-nl route
                                   #         + GET /alerts/metrics route
      schemas/
        alerts.py                  # MODIFY: + AlertRuleParseRequest
                                   #         + AlertRuleParseResponse
                                   #         + AlertMetricsResponse
  tests/
    test_alerts_detector.py        # MODIFY: add sliding-window test cases (warmup, recurrence,
                                   #         seed, hysteresis still works on |z|)
    test_alerts_nl_parser.py       # NEW: mirrors test_dispatcher.py::test_disp11_skill_router_*
                                   #      Mocks AsyncAnthropic via _patched_import shim.
    test_alerts_router.py          # MODIFY: + parse-nl tests (router-level monkeypatch)
                                   #         + metrics endpoint tests
    test_alerts_dispatcher.py      # MODIFY: extend test_no_tasks_import-style AST guard
                                   #         OR add a new test_only_one_anomaly_detector
                                   #         that AST-walks detector.py and asserts the
                                   #         FunctionDef count for evaluate_anomaly == 1.

frontend/
  src/
    lib/
      api.ts                       # MODIFY: + alertsParseNl(body)
                                   #         + alertMetrics()
                                   #         + AlertRuleParseRequest/Response/AlertMetricsResponse types
      queries.ts                   # MODIFY: + useParseAlertNl()
                                   #         + useAlertMetrics()
    components/
      panels/
        AlertRuleForm.tsx          # MODIFY: + NL textarea + Parse button + preview modal
                                   #         + on success: prefill draft from parsed rule, OR
                                   #           directly invoke useCreateAlertRule on Save
                                   # KNOWN_METRICS becomes sourced from useAlertMetrics() data
                                   # (with the existing constant as fallback during loading).
        __tests__/
          AlertRuleForm.test.tsx   # MODIFY: + NL parse → preview modal → save flow
                                   #         + hallucination → "could not parse" banner
                                   # Mocks api.alertsParseNl via existing module-mock pattern.
```

### Pattern 1: Lazy `AsyncAnthropic` inside async function (LOCKED)

**What:** Import `from anthropic import AsyncAnthropic` INSIDE the parser function, build a fresh client per call. Module top-level imports MUST NOT include `anthropic`.

**When to use:** Every Haiku-backed parser in this codebase. Phase 21's `parse_alert_nl` follows this verbatim.

**Example (verbatim from `cmc/schedules/nlcron.py`, the smallest exemplar):**

```python
# cmc/schedules/nlcron.py:21-46  (current, shipped)
async def nl_to_cron(prompt: str) -> str | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    from anthropic import AsyncAnthropic  # local import to keep module side-effect-free

    client = AsyncAnthropic(api_key=api_key)
    msg = await client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=64,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    first_block = msg.content[0] if msg.content else None
    text_value = getattr(first_block, "text", None)
    if not isinstance(text_value, str):
        return None
    text = text_value.strip()
    if text == "INVALID" or not validate_cron(text):
        return None
    return text
```

Phase 21's `cmc/alerts/nl_parser.py::parse_alert_nl` is this shape, but:
- `_SYSTEM_PROMPT` is built **at call time** from `_SCOPE_EXTRACTORS.keys()` so the metric vocabulary stays in sync (or composed once at module level if vocabulary is module-import-stable; either is fine).
- Output is JSON (mirrors `skill_router.py:78-104` `json.loads(text)` + `json.JSONDecodeError` handling).
- Final validation: parse fields → construct `AlertRuleCreate` Pydantic model → `is_known_metric` → return the model or `None`.

### Pattern 2: Single dispatch site, branch on `params_json` (LOCKED — Success Criterion 1)

**What:** Inside `evaluate_anomaly`, read `rule.params_json.get("window_kind", "ewma")` and resolve `alpha` accordingly. The recurrence body, the warm-up gate, and the hysteresis state machine are SHARED.

**When to use:** Every detector extension that adds a "math variant" to anomaly. Future window kinds (e.g. `"hampel"`, `"madz"`) follow the same shape — one helper to resolve `alpha` (or another scaling param), shared recurrence + state machine.

**Example (recommended shape — patches `cmc/alerts/detector.py:211-213`):**

```python
# Replace:
#   n = _resolve_window_n(rule)
#   alpha = 2.0 / (n + 1.0)
# With:
n = _resolve_window_n(rule)
alpha = _resolve_alpha(rule, n)  # NEW helper

# NEW helper (private, near _resolve_window_n):
def _resolve_alpha(rule: AlertRule, n: int) -> float:
    """Map params_json.window_kind to the recurrence's smoothing factor.

    "ewma":    alpha = 2 / (N + 1)        — exponential decay (default)
    "sliding": alpha = 1 / N              — uniform-weight rolling mean
                                            (rolling-mean ± stddev semantics)

    Unknown / missing window_kind: defaults to "ewma" — preserves v1.0 behavior
    for rules persisted before Phase 21 without a migration.
    """
    pj = rule.params_json or {}
    kind = pj.get("window_kind", "ewma")
    if kind == "sliding":
        return 1.0 / n
    return 2.0 / (n + 1.0)
```

The recurrence body at `:226-236` is UNTOUCHED. The warm-up gate at `:239-243` is UNTOUCHED. The hysteresis state machine at `:254-274` is UNTOUCHED. The dispatcher in `cmc/dispatcher/alerts.py:309` keeps calling `evaluate_anomaly(rule, value, state, now=now)` with no signature change.

**Warmup-boundary `PENDING_FIRE` guard (Success Criterion 2):** The existing `if new_sc < rule.min_samples: return AlertSignal.INSUFFICIENT, ewma` at `:239-240` already implements the warmup gate. For the sliding branch, `min_samples` defaults should bump (or the validator should require) `min_samples >= window_n` so the first `window_n` ticks return `INSUFFICIENT` cleanly. **Recommendation:** add a server-side validator on `AlertRuleCreate` for anomaly+sliding rules that enforces `min_samples >= params_json.window_n`. This puts the guard in the detector path (existing line 239) WITHOUT adding a new branch — the guard activates because `min_samples` is correctly sized at rule creation. (If the planner prefers the guard live in the detector itself, the alternative is one extra `if window_kind == "sliding" and new_sc < window_n: return INSUFFICIENT, ewma` line — but this risks "second branch in detector" critique. Validator-side is cleaner.)

### Pattern 3: NL-parser router with `None → 503` mapping (mirror `routes/schedules.py:269-281`)

**What:** Router-level handler awaits the parser. `None` from parser → `HTTPException(503, "natural-language alerts unavailable")`. Successful parse → 200 with the parsed envelope.

**Example (shape patched into `cmc/api/routes/alerts.py`):**

```python
from cmc.alerts.nl_parser import parse_alert_nl  # NEW
from cmc.alerts.scopes import _SCOPE_EXTRACTORS

@router.post("/alerts/parse-nl", response_model=AlertRuleParseResponse)
async def parse_nl_alert(payload: AlertRuleParseRequest) -> AlertRuleParseResponse:
    """ALRT-14: NL → AlertRule preview via Haiku 4.5. Single 503 covers
    both failure modes (missing API key OR invalid model output) per V11.
    The returned AlertRuleCreate has already been validator-piped through
    is_known_metric + threshold_clear < threshold_fire — caller can persist
    via POST /api/alerts/rules without re-validating.
    """
    rule = await parse_alert_nl(payload.description)
    if rule is None:
        raise HTTPException(
            status_code=503,
            detail="natural-language alerts unavailable",
        )
    return AlertRuleParseResponse(rule=rule, description=payload.description)


@router.get("/alerts/metrics", response_model=AlertMetricsResponse)
async def list_metrics() -> AlertMetricsResponse:
    """Return the canonical metric vocabulary — the keys of
    _SCOPE_EXTRACTORS. Frontend AlertRuleForm fetches this on mount via
    React Query (cached) so KNOWN_METRICS stays in sync without a CI test.
    """
    return AlertMetricsResponse(metrics=sorted(_SCOPE_EXTRACTORS.keys()))
```

### Pattern 4: AST static-import test (mirror `tests/test_alerts_dispatcher.py:147-183`)

**Example (new test in `test_alerts_detector.py` or `test_alerts_dispatcher.py`):**

```python
def test_only_one_anomaly_detector_exists():
    """Success Criterion 1: ALRT-13 ships as a discriminator inside
    evaluate_anomaly, NOT a parallel function. AST-asserts that
    cmc/alerts/detector.py defines exactly ONE function whose name
    starts with 'evaluate_anomaly'.
    """
    import ast
    from pathlib import Path

    src_path = (
        Path(__file__).resolve().parent.parent
        / "cmc"
        / "alerts"
        / "detector.py"
    )
    tree = ast.parse(src_path.read_text())
    anomaly_fns = [
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef)
        and node.name.startswith("evaluate_anomaly")
    ]
    assert anomaly_fns == ["evaluate_anomaly"], (
        "ALRT-13 must extend evaluate_anomaly via params_json.window_kind, "
        "not add a parallel detector function. "
        f"Found: {anomaly_fns}"
    )
```

(Optional reinforcement: also AST-walk the dispatcher `cmc/dispatcher/alerts.py:306-312` and assert no second `if rule.kind == ...` branch exists. Cheaper alternative: assert that `evaluate_anomaly` is the only `from cmc.alerts.detector import` symbol matching `evaluate_*` — i.e. the dispatcher only ever imports `evaluate_threshold` and `evaluate_anomaly`, no third sibling.)

### Pattern 5: Mock `AsyncAnthropic` for parser tests (mirror `test_dispatcher.py:2362-2454`)

**The shipped pattern — `_patched_import` shim** (use this for *unit* tests of `parse_alert_nl` directly):

```python
fake_msg = MagicMock()
fake_msg.content = [MagicMock(text='{"name":"haiku-p95","kind":"anomaly","metric":"skill_p95_latency_ms","threshold_fire":3.0,"params_json":{"window_kind":"sliding","window_n":50}}')]
fake_client = MagicMock()
fake_client.messages.create = AsyncMock(return_value=fake_msg)
original_import = __import__

def _patched_import(name, *args, **kwargs):
    module = original_import(name, *args, **kwargs)
    if name == "anthropic":
        module.AsyncAnthropic = MagicMock(return_value=fake_client)
    return module

monkeypatch.setattr("builtins.__import__", _patched_import)
monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
```

**The router-level pattern — bind-replace** (use this for *router* tests of `POST /api/alerts/parse-nl`):

```python
# Mirror tests/test_schedules_router.py:308-320 verbatim.
monkeypatch.setattr(
    "cmc.api.routes.alerts.parse_alert_nl",
    AsyncMock(return_value=AlertRuleCreate(
        name="haiku-p95",
        kind="anomaly",
        metric="skill_p95_latency_ms",
        threshold_fire=3.0,
        params_json={"window_kind": "sliding", "window_n": 50},
    )),
)
r = await client.post("/api/alerts/parse-nl", json={"description": "alert me when haiku skill p95 exceeds 5s"})
assert r.status_code == 200
```

### Anti-Patterns to Avoid

- **Sibling detector function `evaluate_anomaly_sliding`** — Success Criterion 1 lockout; AST test fails. Don't even prototype this for benchmarking; the recurrence is identical algebraically.
- **Third `kind` value `"sliding-anomaly"`** — would inflate the rule-level enum and the dispatcher's `if rule.kind` chain at `cmc/dispatcher/alerts.py:306-312`. Forbidden.
- **`E[X²] − E[X]²` for variance** — numerically catastrophic for streamed data; the existing recurrence is numerically stable. Reuse it.
- **Module-level `AsyncAnthropic()` client** — breaks tests that monkeypatch `anthropic.AsyncAnthropic`. Lazy-import-inside-function is the locked pattern.
- **Returning a "best-guess" AlertRule on hallucination** — Success Criterion 4 + PITFALLS-locked. Return `None`; UI surfaces "could not parse".
- **Mounting parse-nl on the existing AlertRuleCreate path** — would couple parsing to persistence. Two endpoints, never one: `parse-nl` returns the previewed rule; user clicks Save → existing `POST /alerts/rules` mutation fires.
- **Skipping the AST test** — without it the ALRT-13 invariant degrades silently if a future contributor copy-pastes `evaluate_anomaly` into a sibling. The test is 15 lines; ship it.
- **Re-implementing `is_known_metric`** at the router or parser layer — already shipped at `cmc/alerts/scopes.py:178-184`. Import and reuse.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| EWMA / sliding-window variance | A new `_compute_variance` helper from scratch | The shipped recurrence at `detector.py:226-229` (`alpha*diff*diff + (1-alpha)*prior_var`) | Numerically stable; already handles seed sample at `:215-224`; reused for both branches by changing only `alpha`. |
| AsyncAnthropic client lifecycle | A connection pool / shared singleton | Lazy-import-and-build per call (`nlcron.py:30-32` pattern) | Repo precedent + tests assume this; no measured perf benefit from singleton at this call rate. |
| JSON-output coercion from Haiku | Custom regex extractor | `json.loads(text)` + `json.JSONDecodeError` handling (`skill_router.py:86-92`) | The system prompt instructs "ONLY a JSON object". Failure is a hard reject (return None). |
| AlertRule field validation | Per-field validators in the parser | Build `AlertRuleCreate(**parsed_dict)` and let Pydantic v2 raise `ValidationError` → return None | The `model_validator` at `schemas/alerts.py:55-71` already enforces `is_known_metric` + `threshold_clear < threshold_fire`; piping parser output through it gets hard-validation for free. |
| Modal/Dialog primitive | Custom-rolled overlay | `frontend/src/components/ui/AlertDialog.tsx` (Radix-portaled, role="alertdialog") | Already in the codebase; Radix handles focus-trap, escape-key, aria-labelledby auto-wiring. |
| KNOWN_METRICS sync | Codegen / `mypy --strict` cross-language check | A 20-line pytest that reads `AlertRuleForm.tsx`, regex-extracts the metric values, asserts they match `_SCOPE_EXTRACTORS.keys()` — paired with a `GET /api/alerts/metrics` endpoint for the runtime path. | No precedent for cross-language codegen in this repo; the regex test is dirt-cheap and pinpoints drift. |
| Static-import audit | A custom CI script | A pytest using stdlib `ast` (`tests/test_alerts_dispatcher.py:147-183` precedent) | Tests run in CI by default; no new CI step. |

**Key insight:** Every "build" answer in Phase 21 has a verbatim shipped precedent. The phase is mechanical extension, not invention.

## Common Pitfalls

### Pitfall 1: Sliding window "warmup" semantics drift between EWMA and sliding paths

**What goes wrong:** EWMA branch's warmup gate at `:239-240` fires `INSUFFICIENT` while `sample_count < min_samples`. Sliding branch needs warmup until `sample_count >= window_n`. If `min_samples` is set lower than `window_n` for a sliding rule, the detector emits `FIRING` before the rolling mean is meaningful — exactly the "spurious fires during the first window's worth of ticks" the spec forbids.

**Why it happens:** The `min_samples` and `window_n` fields are independent; nothing today couples them.

**How to avoid:** Server-side validator on `AlertRuleCreate` (and `AlertRulePatch`) — when `kind == "anomaly"` AND `params_json.window_kind == "sliding"`, enforce `min_samples >= params_json.window_n`. Failing input → 422. This means the existing detector gate at `:239-240` IS the warmup-boundary guard; no new code in the detector is required. Add this as a Success Criterion-2 verifier in the test suite.

**Warning signs:** A test rule with `min_samples=1, window_n=50, window_kind="sliding"` fires on tick 2. That's the failure mode the validator must reject.

### Pitfall 2: `params_json` corruption via hand-edit (existing concern, extended scope)

**What goes wrong:** A user (or a buggy migration) writes `params_json: {"window_kind": "EWMA"}` (uppercase) — the dispatch defaults to `"ewma"` (correct), but a typo'd value like `"slidng"` would also default to EWMA, silently masking a bug.

**Why it happens:** `_resolve_alpha` is permissive (defaults on unknown).

**How to avoid:** Validate `window_kind` at the API boundary, NOT only at the detector. `AlertRuleCreate.params_json` already accepts `dict[str, Any]` (`schemas/alerts.py:53`); add a validator that asserts `params_json.get("window_kind") in {"ewma", "sliding", None}`. Reject 422 on typo. Detector still defensively defaults (defense in depth).

### Pitfall 3: Haiku JSON output with extra prose / code-fence wrapping

**What goes wrong:** Haiku emits `\`\`\`json\n{...}\n\`\`\`` despite "ONLY a JSON object" in the system prompt. `json.loads` raises.

**Why it happens:** Haiku occasionally regresses on "no code blocks" instructions when the user message includes "alert me" (chat-style cue).

**How to avoid:** The `skill_router.py:86-92` pattern handles this by returning `None` on `JSONDecodeError`. Reuse the SAME pattern. A "code-fence-stripping" defensive layer is rejected here — if Haiku can't follow the instruction, the user retypes; we don't paper over model misbehavior because that hides the failure mode in the logs.

**Warning signs:** Production logs showing `dispatcher.skill_router.malformed_output` for the alerts parser too. Same `log.warning` shape; same response.

### Pitfall 4: Frontend `KNOWN_METRICS` constant shipped before backend endpoint

**What goes wrong:** Plan 03 (frontend) is shipped before Plan 02 (backend `GET /alerts/metrics` endpoint exists), and `useAlertMetrics` returns 404. The form falls back to the hard-coded constant, but the CI sync test passes (because the constant matches).

**Why it happens:** Wave dependency violation — Plan 03 must depend on Plan 02.

**How to avoid:** Plan 03 lists `depends_on: [21-02]` in its frontmatter. Wave numbering enforces this — Plan 03 is Wave 2, Plans 01+02 are Wave 1.

### Pitfall 5: Preview modal save fires `useCreateAlertRule` with stale form state

**What goes wrong:** User types NL, parses, sees preview, but the manual form fields above are also dirty (e.g. they typed a name first). On Save in the modal, the parsed rule's `name` is sent; the typed name is silently discarded. Or vice versa.

**Why it happens:** Two competing sources of truth — the manual draft state and the parsed-rule preview state.

**How to avoid:** When the user clicks Save in the preview modal, the parsed `AlertRuleCreate` is the authoritative payload — DO NOT merge with `draft`. Pop a confirmation if `draft` has unsaved typed fields ("Discard typed fields and save parsed rule? Yes / Cancel"). OR (simpler): once the user opens the parse flow, dim/disable the manual form until they confirm or cancel. Cleanest is the latter — the NL Parse button replaces the manual form; clicking it transitions the form to "preview pending" mode.

### Pitfall 6: Parse-nl 503 confusing with parse-nl null-rule envelope

**What goes wrong:** Two semantically distinct failure modes get the same response code. Frontend can't distinguish "Anthropic key unset" from "Haiku hallucinated".

**Why it happens:** SCHD-06 deliberately collapses these to a single 503 per V11 ("distinguishing them would leak env config to localhost callers"). Mirroring blindly inherits this collapse.

**How to avoid:** Two reasonable choices, planner picks:
- **(A) Mirror SCHD-06 exactly:** single 503 body literal `"natural-language alerts unavailable"` for both failure modes. Frontend renders this verbatim. Matches V11 precedent.
- **(B) Distinguish at the envelope level:** `AlertRuleParseResponse: {rule: AlertRuleCreate | null, error: str | null}`. `error="api_key_missing"` vs `error="parser_rejected"`. Returns 200 always; the frontend branches on `rule == null`. More honest UX but breaks the V11 pattern.

**Recommendation:** (A) for consistency. The user retypes either way; the failure-mode distinction doesn't change the user action.

### Pitfall 7: AST test brittle to `evaluate_anomaly_helper` etc.

**What goes wrong:** A future contributor adds `_evaluate_anomaly_persist_ewma_state(...)` as a private helper — the AST test's `node.name.startswith("evaluate_anomaly")` triggers a false positive.

**Why it happens:** Naming pattern is too loose.

**How to avoid:** Match the exact name: `node.name == "evaluate_anomaly"`. Count must be exactly 1. (This is what the example test in Pattern 4 does — it asserts `anomaly_fns == ["evaluate_anomaly"]`, not a prefix match. Use exact equality.)

## Code Examples

### Detector dispatch site (the 1-line change in `evaluate_anomaly`)

```python
# cmc/alerts/detector.py:211-213 (current):
n = _resolve_window_n(rule)
alpha = 2.0 / (n + 1.0)
prior_mean, prior_var, prior_sc = _read_anomaly_state(state)

# After Phase 21:
n = _resolve_window_n(rule)
alpha = _resolve_alpha(rule, n)            # NEW — picks 2/(N+1) for ewma, 1/N for sliding
prior_mean, prior_var, prior_sc = _read_anomaly_state(state)
```

The recurrence at `:226-229` is unchanged. The hysteresis state machine at `:254-274` is unchanged. The dispatcher in `cmc/dispatcher/alerts.py:309` is unchanged.

### NL parser module (mirror nlcron.py shape)

```python
# cmc/alerts/nl_parser.py (NEW — mirrors cmc/schedules/nlcron.py)
"""ALRT-14 — NL → AlertRule via Claude Haiku 4.5. Returns None on hallucination."""

import json
import logging
import os

from cmc.alerts.scopes import _SCOPE_EXTRACTORS, is_known_metric
from cmc.api.schemas.alerts import AlertRuleCreate

log = logging.getLogger(__name__)


def _build_system_prompt() -> str:
    metrics_csv = ", ".join(sorted(_SCOPE_EXTRACTORS.keys()))
    return (
        "You are an alert rule parser. Given a natural-language description, "
        f"output ONLY a JSON object matching the AlertRuleCreate schema. "
        f"Allowed metric values: {metrics_csv}. "
        "Allowed kind values: \"threshold\" | \"anomaly\". "
        "Required fields: name (≤120 chars), kind, metric, threshold_fire (number). "
        "Optional fields: threshold_clear (number, < threshold_fire), "
        "min_dwell_seconds (int≥0), min_samples (int≥1), cooldown_seconds (int≥0), "
        "params_json (object — for anomaly rules: {\"window_kind\":\"ewma\"|\"sliding\","
        " \"window_n\":int}). "
        "Do NOT include explanations, code blocks, or any other text. "
        "If the description is ambiguous or names an unknown metric, output exactly \"INVALID\"."
    )


async def parse_alert_nl(prompt: str) -> AlertRuleCreate | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    from anthropic import AsyncAnthropic  # lazy — module is side-effect-free

    client = AsyncAnthropic(api_key=api_key)
    msg = await client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=512,
        system=_build_system_prompt(),
        messages=[{"role": "user", "content": prompt}],
    )
    first_block = msg.content[0] if msg.content else None
    text_value = getattr(first_block, "text", None)
    if not isinstance(text_value, str):
        return None
    text = text_value.strip()
    if text == "INVALID":
        return None
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        log.warning("alerts.nl_parser.malformed_output", extra={"text": text[:200]})
        return None
    if not isinstance(parsed, dict):
        return None
    metric = parsed.get("metric")
    if not isinstance(metric, str) or not is_known_metric(metric):
        log.warning("alerts.nl_parser.hallucinated_metric", extra={"metric": metric})
        return None
    try:
        return AlertRuleCreate(**parsed)
    except (ValueError, TypeError) as e:
        log.warning("alerts.nl_parser.validation_failed", extra={"err": str(e)})
        return None
```

### Frontend NL input + preview modal (mirror NLCronInput inside AlertRuleForm)

The shape mirrors `frontend/src/components/panels/ScheduleComposer.tsx:452-498` (`NLCronInput` component) plus a follow-up `AlertDialog` showing the parsed rule. The user clicks "Save" inside the dialog → fires `useCreateAlertRule.mutate(parsedRule)`. On `useParseAlertNl` error, the input shows the 503 body literal verbatim ("natural-language alerts unavailable") OR an inline "Could not parse — please rephrase" banner depending on Pitfall-6 decision (A) vs (B).

```tsx
// In AlertRuleForm.tsx — sketch of the new section
function AlertNlInput({
  onPreview,
}: { onPreview: (rule: AlertRuleCreate) => void }) {
  const [text, setText] = useState('')
  const m = useParseAlertNl()
  return (
    <div className="cmc-nl-alert">
      <label className="cmc-label" htmlFor="cmc-nl-alert-input">
        Or describe in natural language
      </label>
      <input
        id="cmc-nl-alert-input"
        type="text"
        className="cmc-input"
        placeholder="alert me when haiku skill p95 exceeds 5s for 10 minutes"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={m.isPending}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!text.trim() || m.isPending}
        onClick={() =>
          m.mutate({ description: text }, { onSuccess: (r) => onPreview(r.rule) })
        }
      >
        {m.isPending ? 'Parsing…' : 'Parse'}
      </Button>
      {m.isError ? (
        <p className="cmc-text-subtle" role="alert">
          {m.error instanceof Error ? m.error.message : 'Could not parse'}
        </p>
      ) : null}
    </div>
  )
}

// Preview modal (uses existing AlertDialog primitive):
<AlertDialog
  open={previewOpen}
  onOpenChange={setPreviewOpen}
  title="Preview alert rule"
  description="Review the parsed rule before saving."
  cancelLabel="Cancel"
  actionLabel="Save"
  actionVariant="primary"
  onAction={() => createMutation.mutate(parsedRule)}
>
  <dl className="cmc-rule-preview">
    <dt>Name</dt><dd>{parsedRule.name}</dd>
    <dt>Kind</dt><dd>{parsedRule.kind}</dd>
    <dt>Metric</dt><dd>{parsedRule.metric}</dd>
    <dt>Threshold (fire)</dt><dd>{parsedRule.threshold_fire}</dd>
    {/* … remaining fields … */}
  </dl>
</AlertDialog>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Module-level `client = Anthropic(...)` singleton | Lazy `AsyncAnthropic` inside async function | Phase 8/12 (cmc.schedules.nlcron) | Tests can monkeypatch `anthropic.AsyncAnthropic` import; missing API key is a graceful per-call degradation, not a module import failure. |
| EWMA-variance recurrence as the only anomaly math | Same recurrence with discriminated `alpha` resolution (`window_kind` ∈ {ewma, sliding}) | Phase 21 (this phase) | Single function, single test surface, single dispatch site. ALRT-13 v1.0. |
| Manual form-only AlertRule authoring | NL-first authoring with hard-validated preview modal | Phase 21 (this phase) | Mirrors SCHD-06's NL-first cron authoring. Same lazy-Haiku + None-on-hallucination contract. |
| Hardcoded frontend KNOWN_METRICS constant | Constant + `GET /api/alerts/metrics` runtime sync + CI sync test (recommended) | Phase 21 (this phase) | First codebase precedent for cross-language vocabulary sync. Future phases adding metrics get free frontend coverage if React Query hook is in place. |

**Deprecated/outdated:**
- The `Phase 17 may fetch dynamically` TODO comment in `frontend/src/components/panels/AlertRuleForm.tsx:13` — Phase 21 fulfills this.

## Open Questions

1. **Q1 (Discriminator dispatch shape inside `evaluate_anomaly`).**
   - What we know: the function already cleanly separates seed (`:215-224`), recurrence (`:226-236`), warmup gate (`:238-243`), z-score (`:245-251`), and hysteresis (`:253-274`).
   - What's unclear: Pattern A (early-return at top with shared recurrence helper) is structurally heavier than Pattern B (single `_resolve_alpha` helper, recurrence body unchanged).
   - Recommendation: **Pattern B.** Insert a `_resolve_alpha` private helper above `evaluate_anomaly`; replace `alpha = 2.0 / (n + 1.0)` at line 212 with `alpha = _resolve_alpha(rule, n)`. Recurrence body, warm-up gate, and hysteresis state machine unchanged. Total diff: ~15 lines (helper + comment + 1-line replace + 2 new test cases). Cleanest for "no parallel detector, no second branch" critique.

2. **Q2 (Welford reuse mechanics).**
   - What we know: the recurrence is INLINE at `:227-229`. There is no private helper.
   - What's unclear: should it be extracted to `_update_welford(prior_mean, prior_var, x, alpha)` for sliding-branch reuse?
   - Recommendation: **No extraction.** The recurrence is 3 lines of float arithmetic; extracting it adds a function-call cost in the hot path (every alert tick) for zero readability benefit. The same 3 lines run for both EWMA and sliding because `alpha` is the only thing that differs. Keep it inline.

3. **Q3 (`PENDING_FIRE` warmup-boundary guard semantics).**
   - What we know: existing EWMA gate uses `new_sc < rule.min_samples` at `:239-240` to emit `INSUFFICIENT` (a different signal than `PENDING_FIRE`).
   - What's unclear: success criterion uses the term `PENDING_FIRE` but the existing warm-up returns `INSUFFICIENT`.
   - Recommendation: **Semantic alignment, not signal change.** The success criterion's "warmup-boundary `PENDING_FIRE` guard" SHOULD return `INSUFFICIENT` (matches existing EWMA warmup semantics — `INSUFFICIENT` means "no baseline yet"; `PENDING_FIRE` means "baseline says fire but min_dwell not met"). If the planner reads the criterion as literally `PENDING_FIRE`, that's a semantic regression — it would tell the dispatcher "candidate firing" during warmup, which is wrong. Plan should use `INSUFFICIENT` and call out the success-criterion language as describing the guard's *intent* (prevent spurious fires) not its literal *signal value*.
   - **Flag this for planner / user clarification in CONTEXT.md if the literal `PENDING_FIRE` wording is load-bearing.**

4. **Q4 (`_SCOPE_EXTRACTORS` vocabulary surface).**
   - What we know: 3 metric keys today (`cost_usd_24h`, `skill_p95_latency_ms`, `dispatcher_failed_tasks_5m`); `is_known_metric()` shipped at `cmc/alerts/scopes.py:178-184`. `AlertRuleCreate` Pydantic model at `cmc/api/schemas/alerts.py:34-71` is the canonical shape.
   - What's unclear: nothing — the shape is fully shipped.
   - Recommendation: parser builds `AlertRuleCreate(**parsed_dict)` and lets Pydantic v2 validate. Free hard-validation. No new comparator/window/threshold representation needed.

5. **Q5 (NL parser integration with existing alerts API).**
   - What we know: `cmc/api/routes/alerts.py:60` already creates `router = APIRouter(tags=["alerts"])`; `routes/schedules.py:269-281` is the verbatim shape for `parse-nl`.
   - What's unclear: response shape — bare `AlertRuleCreate` vs envelope `{rule: ..., description: str}`.
   - Recommendation: envelope `AlertRuleParseResponse(rule: AlertRuleCreate, description: str)` mirroring `NLCronResponse(cron: str, description: str)` at `schemas/schedules.py:58-60`. Echo back the input description so the frontend can show "you typed: …" in the preview modal — UX parity with the schedules NL flow.

6. **Q6 (Frontend KNOWN_METRICS sync mechanism).**
   - What we know: NO existing dynamic-vocabulary endpoint, NO existing CI sync test in this codebase. The frontend constant has a TODO comment at `AlertRuleForm.tsx:13` mentioning "Phase 17 may fetch dynamically".
   - What's unclear: which mechanism should ship first.
   - Recommendation: **ship both.** (a) `GET /api/alerts/metrics` endpoint (8 lines; reuses `_SCOPE_EXTRACTORS.keys()`); (b) backend pytest in `tests/test_alerts_router.py` that reads `frontend/src/components/panels/AlertRuleForm.tsx`, regex-extracts the metric values from the `KNOWN_METRICS` constant, and asserts equality with the backend dict keys. The endpoint is the runtime path — frontend can switch to fetched-values in a future phase without backend churn. The test is the static-time guard preventing constant drift even before the frontend cuts over.

7. **Q7 (Preview modal UX flow).**
   - What we know: `AlertDialog` primitive at `components/ui/AlertDialog.tsx:34` accepts `title`, `description`, `cancelLabel`, `actionLabel`, `actionVariant`, `onAction`, and arbitrary `children`. Action+cancel pattern is built-in.
   - What's unclear: whether the manual form should be disabled while the parse flow is active.
   - Recommendation: when `useParseAlertNl.isPending` OR `previewOpen` is true, dim the manual form fields (`disabled` flag on every input). On Save in the modal, fire `useCreateAlertRule.mutate(parsedRule)` directly — DO NOT merge with the manual draft. On Cancel, close the modal but keep the manual draft. On hallucination, render an inline `<p role="alert" className="cmc-text-subtle">` matching the NLCronInput pattern at `ScheduleComposer.tsx:487-494`.

8. **Q8 (AST-based static-import test).**
   - What we know: precedent shipped at `tests/test_alerts_dispatcher.py:147-183` (`test_no_tasks_import` — AST-walks `cmc/dispatcher/alerts.py`, asserts no `cmc.dispatcher.tasks` import).
   - What's unclear: nothing — mirror the precedent.
   - Recommendation: new test `test_only_one_anomaly_detector` in `test_alerts_detector.py`. Walks `cmc/alerts/detector.py`, asserts that the count of `FunctionDef` nodes named exactly `evaluate_anomaly` is 1. Optionally also assert that `cmc/dispatcher/alerts.py` imports only `evaluate_threshold` and `evaluate_anomaly` from `cmc.alerts.detector` — i.e. no third sibling exists. 15 lines total. Bisect-friendly.

9. **Q9 (Test seams).**
   - What we know: backend tests organized as `tests/test_alerts_{detector,scopes,router,dispatcher,telegram}.py` (5 files, 60 tests total). Frontend tests at `frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx` etc. AsyncAnthropic mocking has TWO precedents: `_patched_import` shim (`test_dispatcher.py:2362-2454`, used for direct parser unit tests) and `monkeypatch.setattr("cmc.api.routes.X.parser_fn", AsyncMock(...))` (`test_schedules_router.py:308-320`, used for router tests).
   - What's unclear: nothing — both patterns ship verbatim.
   - Recommendation: new `tests/test_alerts_nl_parser.py` (5–7 cases mirroring `test_disp11_skill_router_*` in `test_dispatcher.py:2330-2531`: no-api-key, success, hallucinated metric, malformed JSON, validation failure). Extend `tests/test_alerts_router.py` with 3 new cases (success-mocked, no-api-key 503, invalid-output 503) mirroring `tests/test_schedules_router.py:308-345` line-for-line. Frontend test in `AlertRuleForm.test.tsx` — module-mock `api.alertsParseNl` per the existing module-mock pattern, assert NL → preview modal → save flow + hallucination → "could not parse" banner.

10. **Q10 (Plan boundaries).** — see Plan Decomposition section below.

## Plan Decomposition (RECOMMENDED)

3 plans, 2 waves. Each plan is an atomic single commit (Phase 18+ convention).

### Wave 1 — parallel-safe (no file overlap)

#### Plan 21-01 — ALRT-13: sliding-window detector + AST guard

**Files modified:**
- `backend/cmc/alerts/detector.py` (insert `_resolve_alpha` helper; 1-line replace at `:212`)
- `backend/cmc/api/schemas/alerts.py` (validator: anomaly+sliding rules require `min_samples >= window_n`; `params_json.window_kind` accepts `{"ewma", "sliding", None}`)
- `backend/tests/test_alerts_detector.py` (extend with sliding-window cases — seed, recurrence, warmup-boundary, hysteresis on |z| with sliding)
- `backend/tests/test_alerts_dispatcher.py` (add `test_only_one_anomaly_detector` AST test)

**Files NEW:** none.

**Wave:** 1.
**Depends on:** none.
**Atomicity:** the detector change, the schema validator, and the AST test all land in one commit so `git bisect` cleanly identifies any regression.
**Verification gates:**
- `pytest tests/test_alerts_detector.py tests/test_alerts_dispatcher.py -k "anomaly or sliding or only_one_anomaly_detector"` green.
- AST test fails fast if a future contributor splits the function.
- Existing 19 detector tests + 12 dispatcher tests still green (regression).

#### Plan 21-02 — ALRT-14: backend NL parser + parse-nl route + metrics endpoint

**Files modified:**
- `backend/cmc/api/routes/alerts.py` (add `POST /alerts/parse-nl` + `GET /alerts/metrics` routes)
- `backend/cmc/api/schemas/alerts.py` (add `AlertRuleParseRequest`, `AlertRuleParseResponse`, `AlertMetricsResponse`)
- `backend/tests/test_alerts_router.py` (add 3 router tests for parse-nl: success-mocked, no-api-key 503, invalid-output 503; add 1 test for metrics endpoint)

**Files NEW:**
- `backend/cmc/alerts/nl_parser.py` (mirrors `cmc/schedules/nlcron.py`)
- `backend/tests/test_alerts_nl_parser.py` (mirrors `test_dispatcher.py::test_disp11_skill_router_*` — 5–7 cases)

**Wave:** 1.
**Depends on:** none. (Plans 21-01 and 21-02 touch disjoint files at the line level — even though both touch `schemas/alerts.py`, they add different model classes; merge-clean.)
**Atomicity:** parser + route + schemas + tests in one commit so the contract surfaces atomically.
**Verification gates:**
- `pytest tests/test_alerts_nl_parser.py tests/test_alerts_router.py -k "nl or metrics"` green.
- `curl -X POST /api/alerts/parse-nl -d '{"description":"..."}'` returns 200 with parsed rule when `ANTHROPIC_API_KEY` set + Haiku produces valid JSON.
- `curl /api/alerts/metrics` returns `{"metrics": ["cost_usd_24h", "dispatcher_failed_tasks_5m", "skill_p95_latency_ms"]}`.

### Wave 2 — depends on Plan 21-02 contract

#### Plan 21-03 — ALRT-14: frontend NL input + preview modal + KNOWN_METRICS sync

**Files modified:**
- `frontend/src/lib/api.ts` (add `alertsParseNl(body)`, `alertMetrics()`, `AlertRuleParseRequest`, `AlertRuleParseResponse`, `AlertMetricsResponse` types)
- `frontend/src/lib/queries.ts` (add `useParseAlertNl()` mutation, `useAlertMetrics()` query)
- `frontend/src/components/panels/AlertRuleForm.tsx` (add NL input + Parse button + `AlertDialog` preview modal; source `KNOWN_METRICS` from `useAlertMetrics().data ?? FALLBACK_KNOWN_METRICS`)
- `frontend/src/components/panels/__tests__/AlertRuleForm.test.tsx` (add tests for NL flow: parse → preview modal → save, and parse error → inline banner)
- `backend/tests/test_alerts_metrics_sync.py` **(NEW)** — pytest that reads `frontend/src/components/panels/AlertRuleForm.tsx`, regex-extracts metric values, asserts `set(extracted) == set(_SCOPE_EXTRACTORS.keys())`. (Lives in `backend/tests/` because it imports the Python source-of-truth; reads the TS file as text only.)

**Wave:** 2.
**Depends on:** Plan 21-02 (frontend hooks call backend endpoints; types must match).
**Atomicity:** all UI + types + sync test in one commit so the user-visible feature surfaces atomically.
**Verification gates:**
- `pnpm vitest run AlertRuleForm` green (existing tests still pass + new NL flow tests pass).
- `pytest tests/test_alerts_metrics_sync.py` green (drift guard wired).
- Manual UAT: type "alert me when haiku skill p95 exceeds 5s for 10 minutes" in the form, click Parse, see preview modal with `kind=anomaly, metric=skill_p95_latency_ms, threshold_fire=5000.0` (or similar — Haiku decides), click Save, see new rule in `AlertRulesList`.

### Optional Plan 21-04 — Playwright E2E (deferred, NOT recommended for v1)

**Why deferred:** the parse-nl flow requires `ANTHROPIC_API_KEY` to round-trip; CI doesn't have one. A Playwright test that mocks the network would only re-test what `AlertRuleForm.test.tsx` already covers at the component level. Phase 22+ can add E2E once a recorded-fixture pattern is established. **Recommendation: do NOT add Plan 21-04.**

## Sources

### Primary (HIGH confidence — this codebase, file:line)

- `backend/cmc/alerts/detector.py:1-277` — full `evaluate_anomaly` function; recurrence at `:226-229`; warmup gate at `:239-240`; hysteresis state machine at `:254-274`; `_resolve_window_n` helper at `:163-173`; `_read_anomaly_state` helper at `:143-160`.
- `backend/cmc/alerts/scopes.py:171-184` — `_SCOPE_EXTRACTORS` dict + `is_known_metric()` function (vocabulary lock).
- `backend/cmc/schedules/nlcron.py:21-46` — minimal NL-parser exemplar (string output).
- `backend/cmc/dispatcher/skill_router.py:39-104` — fuller NL-parser exemplar (JSON output + registry validation).
- `backend/cmc/api/routes/schedules.py:269-281` — NL-parser route exemplar (`None → 503` mapping).
- `backend/cmc/api/routes/alerts.py:1-389` — alerts router shape, mount conventions.
- `backend/cmc/api/schemas/alerts.py:1-178` — `AlertRuleCreate` + `model_validator` precedent (`is_known_metric` already enforced at `:69-70`).
- `backend/cmc/db/models/alert_rules.py:14-38` — `AlertRule` SQLModel (no schema changes needed for Phase 21).
- `backend/cmc/db/models/alert_state.py:13-31` — `AlertState` (note: no `params_json` column; dispatcher carries it as transient attr per `dispatcher/alerts.py:296-302`).
- `backend/cmc/dispatcher/alerts.py:54-360` — dispatcher orchestration; detector dispatch site at `:306-312`.
- `backend/tests/test_alerts_dispatcher.py:147-183` — `test_no_tasks_import` (AST-test precedent).
- `backend/tests/test_dispatcher.py:2362-2531` — `pick_skill` test patterns (AsyncAnthropic mocking).
- `backend/tests/test_schedules_router.py:308-345` — SCHD-06 router test patterns (parse-nl mocking).
- `frontend/src/components/panels/AlertRuleForm.tsx:33-39` — current `KNOWN_METRICS` constant + drift TODO.
- `frontend/src/components/panels/ScheduleComposer.tsx:259-265, 452-498` — `NLCronInput` component (UX template for NL-input + Parse button + 503-message rendering).
- `frontend/src/components/ui/AlertDialog.tsx:1-87` — Radix-wrapped modal primitive (preview modal mount).
- `frontend/src/lib/api.ts:1155-1180, 1326-1340` — alerts + schedules API client shapes.
- `frontend/src/lib/queries.ts:745-749` — `useParseNlCron` mutation (mirror for `useParseAlertNl`).
- `.planning/REQUIREMENTS.md:25-26, 77-78` — ALRT-13 + ALRT-14 verbatim + PITFALLS lockouts.
- `.planning/ROADMAP.md:104-115` — Phase 21 success criteria verbatim.

### Secondary (MEDIUM confidence — derived from precedent but not explicitly precedented)

- `_resolve_alpha` private helper shape — derived from the existing `_resolve_window_n` pattern at `detector.py:163-173`. Same idiom: defensive int/string parsing of `rule.params_json`, defaults on miss.
- `AlertRuleParseResponse` envelope shape — derived from `NLCronResponse` at `schemas/schedules.py:58-60`. Mirrors echo-back-input convention.
- 3-plan / 2-wave decomposition — derived from Phase 19 + Phase 20 precedent (each phase ≤4 plans, ≤2 waves; backend-first, frontend-second; per-plan atomic commits).
- KNOWN_METRICS regex-sync test — no codebase precedent for cross-language sync; pattern is the cheapest defensible option but may need iteration if Plan 03 finds the regex brittle (e.g., if the constant shifts to multi-line array literal).

### Tertiary (LOW confidence — flag for validation)

- *None.* Every Phase 21 design choice maps to a file:line precedent in this codebase. The single `min_samples >= window_n` validator coupling for sliding rules is the only piece without a verbatim precedent — it's a defensive add to satisfy Success Criterion 2 without polluting the detector with a second branch.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is already pinned; pattern templates are shipped code.
- Architecture: HIGH for ALRT-13 (single-line discriminator at `:212`); HIGH for ALRT-14 backend (verbatim mirror of 2 shipped exemplars); HIGH for ALRT-14 frontend (verbatim mirror of `NLCronInput` + existing `AlertDialog` primitive).
- Pitfalls: HIGH — every pitfall maps to a shipped invariant or a documented past-phase decision.
- Open question Q3 (`PENDING_FIRE` vs `INSUFFICIENT` for warmup signal) is the single semantic ambiguity; recommend planner clarify with user if literal `PENDING_FIRE` wording is load-bearing in success criteria.

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (30 days — codebase is stable; Anthropic SDK changes are the only currency risk and they don't affect the lazy-import-at-call-site pattern).
