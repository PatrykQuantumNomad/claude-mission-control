"""Phase 21 Plan 02 — cmc.alerts.nl_parser unit tests (ALRT-14).

Mirrors tests/test_dispatcher.py::test_disp11_skill_router_* (:2362-2531) —
uses the `_patched_import` shim pattern to monkeypatch `anthropic.AsyncAnthropic`
at import time. The shim is required because parse_alert_nl uses lazy
`from anthropic import AsyncAnthropic` INSIDE the function (mirror
cmc/schedules/nlcron.py:30); a module-level monkeypatch wouldn't catch the
inner import.

Coverage (PITFALLS lockout — parser MUST return None on hallucination, NEVER
a fallback rule):
  - no API key            → None (early return, no client constructed)
  - happy path            → AlertRuleCreate with metric/kind/threshold echoed
  - INVALID literal       → None (Haiku's ambiguity signal)
  - malformed JSON        → None + warning log
  - hallucinated metric   → None + warning log
  - validator failure     → None + warning log
  - empty msg.content     → None
  - non-dict JSON         → None

Logger-assertion strategy: patch `cmc.alerts.nl_parser.log.warning` directly
(MagicMock) and inspect call args. We do NOT rely on pytest's caplog because
the FastAPI app's lifespan (used in test_alerts_router.py via the `client`
fixture) calls `cmc.core.logging.configure_logging`, which clears root
handlers — a caplog handler installed before the lifespan runs gets removed
when the router file's tests execute first in the session, breaking
caplog assertions in this file.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest


def _make_fake_anthropic_import(text_value: str | None) -> tuple[callable, MagicMock]:
    """Build a `_patched_import` shim that injects a fake AsyncAnthropic.

    The fake client returns a single message with `content[0].text == text_value`
    (or empty content when text_value is None). Returns (patched_import, fake_client).
    """
    fake_msg = MagicMock()
    if text_value is None:
        fake_msg.content = []
    else:
        fake_msg.content = [MagicMock(text=text_value)]
    fake_client = MagicMock()
    fake_client.messages.create = AsyncMock(return_value=fake_msg)
    original_import = __import__

    def _patched_import(name, *args, **kwargs):
        module = original_import(name, *args, **kwargs)
        if name == "anthropic":
            module.AsyncAnthropic = MagicMock(return_value=fake_client)
        return module

    return _patched_import, fake_client


# --------------------------------------------------------------------------
# (a) Missing API key → None.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_alert_nl_no_api_key_returns_none(monkeypatch) -> None:
    """ANTHROPIC_API_KEY unset → early return, no client constructed."""
    from cmc.alerts.nl_parser import parse_alert_nl

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    result = await parse_alert_nl("alert me when haiku skill p95 exceeds 5s")
    assert result is None


# --------------------------------------------------------------------------
# (b) Happy path → AlertRuleCreate.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_alert_nl_happy_path_returns_alert_rule_create(monkeypatch) -> None:
    """Valid JSON for an anomaly rule → returns AlertRuleCreate with fields."""
    payload = {
        "name": "haiku-p95",
        "kind": "anomaly",
        "metric": "skill_p95_latency_ms",
        "threshold_fire": 3.0,
        "min_samples": 50,
        "params_json": {"window_kind": "sliding", "window_n": 50},
    }
    patched_import, _ = _make_fake_anthropic_import(json.dumps(payload))
    monkeypatch.setattr("builtins.__import__", patched_import)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    from cmc.alerts.nl_parser import parse_alert_nl

    rule = await parse_alert_nl("alert me when haiku skill p95 exceeds 3 sigma")
    assert rule is not None
    assert rule.metric == "skill_p95_latency_ms"
    assert rule.kind == "anomaly"
    assert rule.threshold_fire == 3.0
    assert rule.name == "haiku-p95"


# --------------------------------------------------------------------------
# (c) INVALID literal → None.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_alert_nl_invalid_literal_returns_none(monkeypatch) -> None:
    """Haiku emits exactly 'INVALID' (Haiku's ambiguity signal) → None."""
    patched_import, _ = _make_fake_anthropic_import("INVALID")
    monkeypatch.setattr("builtins.__import__", patched_import)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    from cmc.alerts.nl_parser import parse_alert_nl

    result = await parse_alert_nl("ambiguous prompt with no metric")
    assert result is None


# --------------------------------------------------------------------------
# (d) Malformed JSON → None + warning log.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_alert_nl_malformed_json_returns_none(monkeypatch) -> None:
    """Haiku emits non-JSON plaintext → None + 'malformed_output' warning."""
    patched_import, _ = _make_fake_anthropic_import("alert me about p95 (3 sigma)")
    monkeypatch.setattr("builtins.__import__", patched_import)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    from cmc.alerts import nl_parser as nl_parser_mod

    fake_warning = MagicMock()
    monkeypatch.setattr(nl_parser_mod.log, "warning", fake_warning)

    result = await nl_parser_mod.parse_alert_nl("alert me about p95")
    assert result is None
    assert fake_warning.called
    assert fake_warning.call_args.args[0] == "alerts.nl_parser.malformed_output"


# --------------------------------------------------------------------------
# (e) Hallucinated metric → None + warning log.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_alert_nl_hallucinated_metric_returns_none(monkeypatch) -> None:
    """Haiku emits valid JSON with metric not in _SCOPE_EXTRACTORS → None."""
    payload = {
        "name": "fake-rule",
        "kind": "threshold",
        "metric": "fake_metric_xyz",  # not in _SCOPE_EXTRACTORS
        "threshold_fire": 10.0,
    }
    patched_import, _ = _make_fake_anthropic_import(json.dumps(payload))
    monkeypatch.setattr("builtins.__import__", patched_import)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    from cmc.alerts import nl_parser as nl_parser_mod

    fake_warning = MagicMock()
    monkeypatch.setattr(nl_parser_mod.log, "warning", fake_warning)

    result = await nl_parser_mod.parse_alert_nl("alert me on fake metric")
    assert result is None
    assert fake_warning.called
    assert fake_warning.call_args.args[0] == "alerts.nl_parser.hallucinated_metric"


# --------------------------------------------------------------------------
# (f) Validation error → None + warning log.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_alert_nl_validation_error_returns_none(monkeypatch) -> None:
    """Haiku emits valid JSON with threshold_clear >= threshold_fire → None.

    The existing AlertRuleCreate model_validator (schemas/alerts.py:60-67)
    rejects threshold_clear >= threshold_fire (hysteresis floor); the parser
    catches the resulting ValidationError (Pydantic v2 ValidationError IS a
    ValueError) and returns None.
    """
    payload = {
        "name": "inverted",
        "kind": "threshold",
        "metric": "cost_usd_24h",
        "threshold_fire": 3.0,
        "threshold_clear": 5.0,  # >= threshold_fire — rejects
    }
    patched_import, _ = _make_fake_anthropic_import(json.dumps(payload))
    monkeypatch.setattr("builtins.__import__", patched_import)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    from cmc.alerts import nl_parser as nl_parser_mod

    fake_warning = MagicMock()
    monkeypatch.setattr(nl_parser_mod.log, "warning", fake_warning)

    result = await nl_parser_mod.parse_alert_nl("invert thresholds")
    assert result is None
    assert fake_warning.called
    assert fake_warning.call_args.args[0] == "alerts.nl_parser.validation_failed"


# --------------------------------------------------------------------------
# (g) Empty content → None.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_alert_nl_empty_content_returns_none(monkeypatch) -> None:
    """Haiku emits msg.content == [] → None (no first block to .text)."""
    patched_import, _ = _make_fake_anthropic_import(None)  # empty content
    monkeypatch.setattr("builtins.__import__", patched_import)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    from cmc.alerts.nl_parser import parse_alert_nl

    result = await parse_alert_nl("anything")
    assert result is None


# --------------------------------------------------------------------------
# (h) Non-dict JSON → None.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_alert_nl_non_dict_json_returns_none(monkeypatch) -> None:
    """Haiku emits valid JSON that's not an object (e.g. a list) → None.

    Defends against the model emitting a JSON array of candidate rules
    instead of a single object — parse_alert_nl rejects via the
    `isinstance(parsed, dict)` guard.
    """
    patched_import, _ = _make_fake_anthropic_import('["not", "a", "dict"]')
    monkeypatch.setattr("builtins.__import__", patched_import)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    from cmc.alerts.nl_parser import parse_alert_nl

    result = await parse_alert_nl("anything")
    assert result is None
