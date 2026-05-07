---
phase: 21-alert-anomaly-depth-nl-authoring
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/cmc/alerts/nl_parser.py
  - backend/cmc/api/schemas/alerts.py
  - backend/cmc/api/routes/alerts.py
  - backend/tests/test_alerts_nl_parser.py
  - backend/tests/test_alerts_router.py
autonomous: true
requirements: [ALRT-14]

must_haves:
  truths:
    - "POST /api/alerts/parse-nl accepts {description: str} and returns 200 with {rule: AlertRuleCreate, description: str} on successful Haiku parse + validation."
    - "POST /api/alerts/parse-nl returns 503 with body literal 'natural-language alerts unavailable' when ANTHROPIC_API_KEY is unset OR Haiku output fails AlertRuleCreate validation (mirrors SCHD-06's collapsed-503 contract per V11)."
    - "GET /api/alerts/metrics returns 200 with {metrics: list[str]} populated from sorted(_SCOPE_EXTRACTORS.keys())."
    - "parse_alert_nl returns None on: missing API key, empty/non-text response, exact 'INVALID' literal, JSONDecodeError, non-dict parse, unknown metric (is_known_metric == False), or AlertRuleCreate ValidationError."
    - "parse_alert_nl uses lazy `from anthropic import AsyncAnthropic` INSIDE the function — the module import is side-effect-free (importable without ANTHROPIC_API_KEY)."
    - "_SCOPE_EXTRACTORS.keys() is injected verbatim into the system prompt; no hand-rolled metric registry."
  artifacts:
    - path: backend/cmc/alerts/nl_parser.py
      provides: "parse_alert_nl(prompt) -> AlertRuleCreate | None  (mirror nlcron.py shape)"
      contains: "async def parse_alert_nl"
    - path: backend/cmc/api/schemas/alerts.py
      provides: "AlertRuleParseRequest, AlertRuleParseResponse, AlertMetricsResponse models (appended at end)"
      contains: "AlertRuleParseResponse"
    - path: backend/cmc/api/routes/alerts.py
      provides: "POST /alerts/parse-nl + GET /alerts/metrics routes"
      contains: "parse-nl"
    - path: backend/tests/test_alerts_nl_parser.py
      provides: "5+ parser unit tests using _patched_import shim (mirror test_dispatcher.py:2362-2454)"
      contains: "_patched_import"
    - path: backend/tests/test_alerts_router.py
      provides: "router-level tests for parse-nl + metrics endpoints (mirror test_schedules_router.py:308-345)"
      contains: "parse-nl"
  key_links:
    - from: "backend/cmc/api/routes/alerts.py:parse_nl_alert"
      to: "cmc.alerts.nl_parser.parse_alert_nl"
      via: "import + await"
      pattern: "from cmc.alerts.nl_parser import parse_alert_nl"
    - from: "backend/cmc/alerts/nl_parser.py:parse_alert_nl"
      to: "cmc.alerts.scopes.is_known_metric + AlertRuleCreate"
      via: "is_known_metric() check + AlertRuleCreate(**parsed) validator pipe"
      pattern: "is_known_metric|AlertRuleCreate"
    - from: "backend/cmc/api/routes/alerts.py:list_metrics"
      to: "cmc.alerts.scopes._SCOPE_EXTRACTORS"
      via: "sorted(_SCOPE_EXTRACTORS.keys())"
      pattern: "_SCOPE_EXTRACTORS"
---

<objective>
ALRT-14 backend: ship the natural-language alert-rule parser plus its preview endpoint and the dynamic metrics-vocabulary endpoint.

- `cmc/alerts/nl_parser.py` (NEW) mirrors `cmc/schedules/nlcron.py:21-46` (lazy `AsyncAnthropic`, single Haiku call, returns `None` on hallucination — never a fallback rule). System prompt injects `_SCOPE_EXTRACTORS.keys()` verbatim. Output is piped through `AlertRuleCreate(**parsed)` so the existing Pydantic v2 `model_validator` (`schemas/alerts.py:55-71`) hard-validates `is_known_metric` + `threshold_clear < threshold_fire`.
- `POST /api/alerts/parse-nl` mirrors `routes/schedules.py:269-281`: `None → 503` with body literal `"natural-language alerts unavailable"` (collapses missing-API-key and rejected-Haiku-output to a single failure mode per V11 / Pitfall 6 recommendation A).
- `GET /api/alerts/metrics` returns `sorted(_SCOPE_EXTRACTORS.keys())` for Plan 21-03's frontend `useAlertMetrics` query.
- Tests use TWO existing precedents: `_patched_import` shim at `tests/test_dispatcher.py:2362-2454` for parser unit tests, `monkeypatch.setattr("cmc.api.routes.alerts.parse_alert_nl", AsyncMock(...))` at `tests/test_schedules_router.py:308-320` for router tests.

Purpose: ship the backend half of the NL-authoring flow (the frontend half is Plan 21-03). PITFALLS lockout: parser MUST return `None` on hallucination — never a "best-guess" AlertRule.

Output: one atomic commit covering the parser module, the schemas, the two routes, and the parser+router tests.
</objective>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/21-alert-anomaly-depth-nl-authoring/21-RESEARCH.md

# Source-of-truth shipped exemplars (mirror these verbatim)
@backend/cmc/schedules/nlcron.py
@backend/cmc/dispatcher/skill_router.py
@backend/cmc/api/routes/schedules.py
@backend/cmc/api/routes/alerts.py
@backend/cmc/api/schemas/alerts.py
@backend/cmc/alerts/scopes.py
@backend/tests/test_schedules_router.py
@backend/tests/test_dispatcher.py
</context>

<plan_context>
**Locked decisions (from RESEARCH.md + ROADMAP success criteria 3+4):**

1. Lazy `AsyncAnthropic` inside async function — `from anthropic import AsyncAnthropic` is INSIDE `parse_alert_nl`, NOT at module top-level. Verbatim mirror of `cmc/schedules/nlcron.py:30`. Rationale: tests monkeypatch `anthropic.AsyncAnthropic` at import time via `_patched_import` shim (`test_dispatcher.py:2362-2454`); module-level import would break those tests.

2. Hard-validate via `is_known_metric` AND Pydantic v2 `AlertRuleCreate(**parsed)` validator pipe. The existing `model_validator` at `schemas/alerts.py:55-71` already enforces `is_known_metric` + `threshold_clear < threshold_fire` — piping parser output through it gets hard-validation for free. Catch `ValidationError` (and the broader `ValueError`/`TypeError`) → return `None`.

3. Returns `None` on hallucination — NO fallback rule, NO "best-guess" save path. PITFALLS lockout. The router maps `None → 503` per V11 collapsed-failure-mode contract (mirroring `routes/schedules.py:269-281`).

4. Single 503 collapses two failure modes (missing API key + rejected Haiku output). Pitfall 6 recommendation A — matches V11/SCHD-06. Body literal: `"natural-language alerts unavailable"`. **Do not split into 200+null-rule envelope or distinguish 503 reasons** — the user retypes either way.

5. Response envelope: `AlertRuleParseResponse(rule: AlertRuleCreate, description: str)` mirroring `NLCronResponse(cron: str, description: str)` at `schemas/schedules.py:58-60`. Echo the input description so the frontend modal can show "you typed: …".

6. `GET /api/alerts/metrics` shape: `AlertMetricsResponse(metrics: list[str])`. Body: `sorted(_SCOPE_EXTRACTORS.keys())`. Sort makes ordering deterministic for the frontend's CI sync test (Plan 21-03).

7. The system prompt is built at CALL TIME from `sorted(_SCOPE_EXTRACTORS.keys())` so adding a metric to `scopes.py` automatically updates the prompt without a code change in `nl_parser.py`. Use a private `_build_system_prompt()` helper.

8. JSON parsing per `skill_router.py:86-92` pattern: `json.loads(text)` wrapped in `try/except (json.JSONDecodeError, ValueError)` → log warning → return `None`. NO code-fence stripping (Pitfall 3 — papers over model misbehavior).

9. The `INVALID` literal short-circuit (mirror `nlcron.py:38-39`) — if Haiku emits exactly `"INVALID"` (stripped), return `None` without attempting JSON parse. The system prompt instructs Haiku to emit this on ambiguous/unknown input.

**Conflict resolution with Plan 21-01:**
This plan APPENDS `AlertRuleParseRequest`, `AlertRuleParseResponse`, `AlertMetricsResponse` at the END of `backend/cmc/api/schemas/alerts.py` (after the existing `AlertAckRequest` at `:172-178`). Plan 21-01 modifies the validator regions in `AlertRuleCreate` / `AlertRulePatch` (lines 55-106). Disjoint line regions; merge-clean. Plan 21-01 lands first (alphabetical / Wave 1 ordering); this plan rebases if any conflict.

**Test file scope:**
- `tests/test_alerts_nl_parser.py` is NEW (mirrors `tests/test_dispatcher.py::test_disp11_skill_router_*`).
- `tests/test_alerts_router.py` is APPENDED with 4 new test cases (3 for parse-nl + 1 for metrics endpoint). The existing 30+ tests in that file remain untouched.
</plan_context>

<tasks>

<task type="auto">
  <name>Task 1: parse_alert_nl module + schemas + routes</name>
  <files>backend/cmc/alerts/nl_parser.py, backend/cmc/api/schemas/alerts.py, backend/cmc/api/routes/alerts.py</files>
  <action>
**A) NEW `backend/cmc/alerts/nl_parser.py`:**

Module docstring: `"""ALRT-14 — NL → AlertRule via Claude Haiku 4.5. Returns None on hallucination."""`

Top-level imports (NO `anthropic` import here):
```python
from __future__ import annotations
import json
import logging
import os
from cmc.alerts.scopes import _SCOPE_EXTRACTORS, is_known_metric
from cmc.api.schemas.alerts import AlertRuleCreate

log = logging.getLogger(__name__)
```

Private helper `_build_system_prompt() -> str` — composes the system prompt at call time from `sorted(_SCOPE_EXTRACTORS.keys())`:
```
"You are an alert rule parser. Given a natural-language description, output ONLY a JSON object matching the AlertRuleCreate schema. "
"Allowed metric values: {metrics_csv}. "
"Allowed kind values: \"threshold\" | \"anomaly\". "
"Required fields: name (<=120 chars), kind, metric, threshold_fire (number). "
"Optional fields: threshold_clear (number, < threshold_fire), min_dwell_seconds (int>=0), min_samples (int>=1), cooldown_seconds (int>=0), params_json (object — for anomaly rules: {\"window_kind\":\"ewma\"|\"sliding\", \"window_n\":int}). "
"Do NOT include explanations, code blocks, or any other text. "
"If the description is ambiguous or names an unknown metric, output exactly \"INVALID\"."
```

Public `async def parse_alert_nl(prompt: str) -> AlertRuleCreate | None`:

1. `api_key = os.environ.get("ANTHROPIC_API_KEY")`; if not set, return `None`. (Mirror `nlcron.py:24-26`.)
2. `from anthropic import AsyncAnthropic` — LAZY, inside the function.
3. `client = AsyncAnthropic(api_key=api_key)`.
4. `msg = await client.messages.create(model="claude-haiku-4-5", max_tokens=512, system=_build_system_prompt(), messages=[{"role": "user", "content": prompt}])`.
5. Extract text: `first_block = msg.content[0] if msg.content else None`; `text_value = getattr(first_block, "text", None)`. If `not isinstance(text_value, str)`, return `None`.
6. `text = text_value.strip()`. If `text == "INVALID"`, return `None`.
7. JSON parse: `try: parsed = json.loads(text)` / `except (json.JSONDecodeError, ValueError): log.warning("alerts.nl_parser.malformed_output", extra={"text": text[:200]}); return None`.
8. If `not isinstance(parsed, dict)`, return `None`.
9. `metric = parsed.get("metric")`. If `not isinstance(metric, str) or not is_known_metric(metric)`, log `"alerts.nl_parser.hallucinated_metric"` and return `None`.
10. `try: return AlertRuleCreate(**parsed)` / `except (ValueError, TypeError) as e: log.warning("alerts.nl_parser.validation_failed", extra={"err": str(e)}); return None`. (Pydantic v2 `ValidationError` IS a `ValueError`.)

DO NOT add a confidence field, retry, multi-shot, code-fence stripping, or fallback rule. Single Haiku call; hard-reject-or-return.

**B) APPEND to `backend/cmc/api/schemas/alerts.py` (after `AlertAckRequest` at `:172-178`):**

Append three new models at the END of the file:

```python
# ---- AlertRule NL parse + metrics endpoints (Phase 21 / ALRT-14) ----------


class AlertRuleParseRequest(BaseModel):
    """POST /api/alerts/parse-nl body — natural-language alert rule description."""

    model_config = ConfigDict(extra="forbid")
    description: str = Field(..., min_length=1, max_length=1000)


class AlertRuleParseResponse(BaseModel):
    """POST /api/alerts/parse-nl response on successful parse + validation.

    Mirrors NLCronResponse (schemas/schedules.py:58-60) — echoes the input
    description back so the frontend preview modal can show "you typed: ...".
    On hallucination / missing API key, the route emits 503 (NOT a null-rule
    envelope) per V11 collapsed-failure-mode contract.
    """

    rule: AlertRuleCreate
    description: str


class AlertMetricsResponse(BaseModel):
    """GET /api/alerts/metrics response — canonical metric vocabulary.

    Body is sorted(_SCOPE_EXTRACTORS.keys()) for deterministic ordering
    (consumed by the frontend useAlertMetrics query AND by Plan 21-03's
    test_alerts_metrics_sync drift guard).
    """

    metrics: list[str]
```

Do NOT touch any existing model in this file. Plan 21-01 owns the validator regions; this plan owns these three appended models. Disjoint by line region.

**C) MODIFY `backend/cmc/api/routes/alerts.py`:**

1. Add imports (with the existing schema imports at `:45-54`):
```python
from cmc.alerts.nl_parser import parse_alert_nl
from cmc.alerts.scopes import _SCOPE_EXTRACTORS
from cmc.api.schemas.alerts import (
    ...,  # existing
    AlertMetricsResponse,
    AlertRuleParseRequest,
    AlertRuleParseResponse,
)
```

2. Append two new route handlers (location: end of file, after the existing `_ack` route):

```python
@router.post("/alerts/parse-nl", response_model=AlertRuleParseResponse)
async def parse_nl_alert(payload: AlertRuleParseRequest) -> AlertRuleParseResponse:
    """ALRT-14: NL → AlertRule preview via Haiku 4.5. Single 503 covers
    both failure modes (missing API key OR invalid Haiku output) per V11
    collapsed-failure-mode contract — mirror routes/schedules.py:269-281.
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
    """Return the canonical metric vocabulary — sorted keys of
    _SCOPE_EXTRACTORS. Frontend AlertRuleForm fetches this on mount via
    React Query so KNOWN_METRICS stays in sync at runtime.
    """
    return AlertMetricsResponse(metrics=sorted(_SCOPE_EXTRACTORS.keys()))
```

DO NOT couple `parse-nl` to the existing `POST /api/alerts/rules` create path (Pitfalls section: two endpoints, never one — preview returns the unsaved rule; user clicks Save → existing create endpoint fires).
  </action>
  <verify>
```bash
cd backend && uv run python -c "from cmc.alerts import nl_parser; print(nl_parser.parse_alert_nl)"  # module imports without ANTHROPIC_API_KEY
cd backend && uv run python -c "from cmc.api.schemas.alerts import AlertRuleParseRequest, AlertRuleParseResponse, AlertMetricsResponse; print('OK')"
cd backend && uv run python -c "from cmc.api.routes.alerts import router; print([r.path for r in router.routes if 'parse-nl' in r.path or 'metrics' in r.path])"
# Expected: ['/alerts/parse-nl', '/alerts/metrics']
```

`grep -c "^import anthropic\|^from anthropic" backend/cmc/alerts/nl_parser.py` — expect `0` (lazy import lives inside the function).

`uv run pytest tests/test_alerts_router.py -q` — existing tests still green.
  </verify>
  <done>
- `cmc/alerts/nl_parser.py` exists and imports cleanly without `ANTHROPIC_API_KEY`.
- `parse_alert_nl` is async, returns `AlertRuleCreate | None`, lazy-imports `AsyncAnthropic` inside the function.
- Three new Pydantic models appended at the END of `schemas/alerts.py`.
- Two new routes registered: `POST /api/alerts/parse-nl` and `GET /api/alerts/metrics`.
- Existing alerts router tests still pass (no regression).
  </done>
</task>

<task type="auto">
  <name>Task 2: Parser unit tests + router integration tests</name>
  <files>backend/tests/test_alerts_nl_parser.py, backend/tests/test_alerts_router.py</files>
  <action>
**A) NEW `backend/tests/test_alerts_nl_parser.py`:**

Mirror `tests/test_dispatcher.py::test_disp11_skill_router_*` (`:2330-2531`) — use the `_patched_import` shim pattern at `:2362-2454` to monkeypatch `anthropic.AsyncAnthropic` at import time.

Required test cases (5–7 cases — keep tight per RESEARCH Q9):

1. `test_parse_alert_nl_no_api_key_returns_none` — `monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)`; assert `await parse_alert_nl("...") is None`. NO mock client involved (early return at step 1).

2. `test_parse_alert_nl_happy_path_returns_alert_rule_create` — Haiku emits a valid JSON object for a `skill_p95_latency_ms` anomaly rule. Assert returned object is an `AlertRuleCreate` with `metric == "skill_p95_latency_ms"`, `kind == "anomaly"`, `threshold_fire == 3.0` (or whatever the fake msg specifies). Use `_patched_import` to inject the fake AsyncAnthropic.

3. `test_parse_alert_nl_invalid_literal_returns_none` — Haiku emits exactly `"INVALID"`. Assert `await parse_alert_nl("ambiguous prompt") is None`. (Mirrors `nlcron.py:38-39`.)

4. `test_parse_alert_nl_malformed_json_returns_none` — Haiku emits non-JSON text (e.g. `"```json\n{...}\n```"` or `"alert me about p95 (3 sigma)"`). Assert `None`. Verify the warning log fires (caplog).

5. `test_parse_alert_nl_hallucinated_metric_returns_none` — Haiku emits valid JSON with `"metric": "fake_metric_xyz"`. Assert `None`. Verify the warning log fires.

6. `test_parse_alert_nl_validation_error_returns_none` — Haiku emits valid JSON with `"threshold_clear": 5.0, "threshold_fire": 3.0` (clear >= fire — the existing AlertRuleCreate validator at `schemas/alerts.py:60-67` rejects this). Assert `None`. Verify the warning log fires.

7. (Optional) `test_parse_alert_nl_empty_content_returns_none` — Haiku emits `msg.content == []`. Assert `None`.

**Test scaffolding (verbatim from `test_dispatcher.py:2362-2454`):**

```python
import json
import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.mark.asyncio
async def test_parse_alert_nl_happy_path_returns_alert_rule_create(monkeypatch):
    fake_msg = MagicMock()
    fake_msg.content = [MagicMock(text=json.dumps({
        "name": "haiku-p95",
        "kind": "anomaly",
        "metric": "skill_p95_latency_ms",
        "threshold_fire": 3.0,
        "min_samples": 50,
        "params_json": {"window_kind": "sliding", "window_n": 50},
    }))]
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

    from cmc.alerts.nl_parser import parse_alert_nl
    rule = await parse_alert_nl("alert me when haiku skill p95 exceeds 3 sigma")
    assert rule is not None
    assert rule.metric == "skill_p95_latency_ms"
    assert rule.kind == "anomaly"
    assert rule.threshold_fire == 3.0
```

The other test cases substitute different `fake_msg.content[0].text` values (or empty content list, or omit the env var).

**B) APPEND to `backend/tests/test_alerts_router.py`:**

Mirror `tests/test_schedules_router.py:308-345` — bind-replace the parser at the router import binding.

Required cases (4 new tests):

1. `test_parse_nl_alert_happy_path_returns_200` — `monkeypatch.setattr("cmc.api.routes.alerts.parse_alert_nl", AsyncMock(return_value=AlertRuleCreate(name="r", kind="anomaly", metric="skill_p95_latency_ms", threshold_fire=3.0, min_samples=50, params_json={"window_kind": "sliding", "window_n": 50})))`; POST `/api/alerts/parse-nl` with `{"description": "alert me ..."}`; assert `r.status_code == 200`; assert `r.json()["rule"]["metric"] == "skill_p95_latency_ms"`; assert `r.json()["description"] == "alert me ..."`.

2. `test_parse_nl_alert_no_api_key_returns_503` — `monkeypatch.setattr("cmc.api.routes.alerts.parse_alert_nl", AsyncMock(return_value=None))`; POST same body; assert `r.status_code == 503`; assert `r.json()["detail"] == "natural-language alerts unavailable"`.

3. `test_parse_nl_alert_invalid_output_returns_503` — same as #2 (the parser returns `None` for both no-API-key AND invalid output; the router collapses both to 503 — Pitfall 6 recommendation A). Test names should make the SEMANTIC distinction even though the response is identical, documenting V11 contract.

4. `test_get_alert_metrics_returns_200_with_sorted_keys` — GET `/api/alerts/metrics`; assert `r.status_code == 200`; assert `r.json() == {"metrics": ["cost_usd_24h", "dispatcher_failed_tasks_5m", "skill_p95_latency_ms"]}` (alphabetical sort, current 3 metrics).

Use the existing `client` fixture pattern from `test_alerts_router.py` (likely an httpx `AsyncClient` bound to the FastAPI app). Do NOT roll new app-fixture wiring.

DO NOT add tests covering the parser's logging behavior here (those are covered in the parser unit tests). Router tests verify the HTTP contract only.
  </action>
  <verify>
```bash
cd backend && uv run pytest tests/test_alerts_nl_parser.py -x -v
cd backend && uv run pytest tests/test_alerts_router.py -x -q -k "parse_nl or metrics"
cd backend && uv run pytest tests/test_alerts_router.py tests/test_alerts_nl_parser.py -q
cd backend && uv run pytest -q  # full suite green
```

Sanity: `curl` against a locally-running backend (only if `ANTHROPIC_API_KEY` is set):
```bash
curl -s -X POST localhost:8000/api/alerts/parse-nl -H 'Content-Type: application/json' -d '{"description":"alert me when haiku skill p95 exceeds 5s"}' | jq .
curl -s localhost:8000/api/alerts/metrics | jq .
# Expected: {"metrics":["cost_usd_24h","dispatcher_failed_tasks_5m","skill_p95_latency_ms"]}
```
(curl optional — CI doesn't need this; route tests cover it.)
  </verify>
  <done>
- 6+ parser unit tests in `test_alerts_nl_parser.py` green; coverage includes no-key / happy path / INVALID / malformed JSON / hallucinated metric / validation error.
- 4 new router tests in `test_alerts_router.py` green; existing tests still pass.
- Full backend suite green (no regression vs. Phase 18 baseline).
- `_patched_import` shim used for parser unit tests; `monkeypatch.setattr` bind-replace used for router tests (matches both shipped precedents).
  </done>
</task>

</tasks>

<verification>
1. `cd backend && uv run pytest -q` — full backend suite green; no regressions.
2. `cd backend && uv run pytest tests/test_alerts_nl_parser.py tests/test_alerts_router.py -q` — focused green.
3. `grep -c "^import anthropic\|^from anthropic" backend/cmc/alerts/nl_parser.py` — expect `0` (lazy import lives inside the function).
4. Module import is side-effect-free: `uv run python -c "import cmc.alerts.nl_parser"` succeeds without `ANTHROPIC_API_KEY`.
5. Hand-run of the route shapes against a running backend (with API key) confirms 200/503 contract per the test cases.
</verification>

<success_criteria>
- ROADMAP success criterion 3: `POST /api/alerts/parse-nl` shipped; parser mirrors `nlcron.py` / `skill_router.py` (lazy `AsyncAnthropic`, `_SCOPE_EXTRACTORS.keys()` injected verbatim into system prompt).
- ROADMAP success criterion 4: `is_known_metric` hard-validation + `AlertRuleCreate` validator pipe; returns `None` on hallucination — no fallback rule, no best-guess save path.
- ROADMAP success criterion 5 (backend half): `GET /api/alerts/metrics` exposed for the frontend's runtime sync (Plan 21-03 wires the frontend hook + the CI drift test).
- PITFALLS lockout: parser returns `None` on hallucination — never a fallback rule; verified by 3 dedicated `*_returns_none` parser tests.
- Atomic single commit covering: parser module + 3 schema models + 2 routes + parser unit tests + router tests.
</success_criteria>

<output>
After completion, create `.planning/phases/21-alert-anomaly-depth-nl-authoring/21-02-nl-parser-route-and-metrics-SUMMARY.md` documenting: parser module path, schema model names, route paths, test file paths + counts, the V11-collapsed-503 contract, and any deviations. Reference `21-RESEARCH.md` Patterns 1, 3, 5 for downstream Plan 21-03 context (the frontend will call these endpoints).
</output>
