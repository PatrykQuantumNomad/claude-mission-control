"""ALRT-14 — NL → AlertRule via Claude Haiku 4.5. Returns None on hallucination.

Mirrors cmc/schedules/nlcron.py shape:
  - lazy `from anthropic import AsyncAnthropic` INSIDE the function so the
    module import is side-effect-free (importable without ANTHROPIC_API_KEY).
  - single Haiku call, no retries, no multi-shot, no fallback.
  - `INVALID` literal short-circuit for ambiguous prompts.

Hard-validation pipeline (no fallback, no best-guess save path — PITFALLS lockout):
  1. is_known_metric(parsed["metric"]) — reject unknown metrics before Pydantic.
  2. AlertRuleCreate(**parsed) — re-uses the existing model_validator at
     schemas/alerts.py (`threshold_clear < threshold_fire`, etc.). Pydantic v2
     ValidationError IS a ValueError, so a single (ValueError, TypeError) catch
     covers both pure-Python coercion errors and Pydantic validator failures.

System prompt is built at CALL TIME from sorted(_SCOPE_EXTRACTORS.keys()) so
adding a metric to scopes.py automatically updates the prompt without editing
this module.
"""
from __future__ import annotations

import json
import logging
import os

from cmc.alerts.scopes import _SCOPE_EXTRACTORS, is_known_metric
from cmc.api.schemas.alerts import AlertRuleCreate

log = logging.getLogger(__name__)


def _build_system_prompt() -> str:
    """Compose the system prompt at call time from the canonical metric vocabulary.

    Adding a metric to cmc.alerts.scopes._SCOPE_EXTRACTORS automatically extends
    the allowed-metrics list in the prompt — no edit to this module required.
    """
    metrics_csv = ", ".join(sorted(_SCOPE_EXTRACTORS.keys()))
    return (
        "You are an alert rule parser. Given a natural-language description, "
        "output ONLY a JSON object matching the AlertRuleCreate schema. "
        f"Allowed metric values: {metrics_csv}. "
        "Allowed kind values: \"threshold\" | \"anomaly\". "
        "Required fields: name (<=120 chars), kind, metric, threshold_fire (number). "
        "Optional fields: threshold_clear (number, < threshold_fire), "
        "min_dwell_seconds (int>=0), min_samples (int>=1), "
        "cooldown_seconds (int>=0), params_json (object — for anomaly rules: "
        "{\"window_kind\":\"ewma\"|\"sliding\", \"window_n\":int}). "
        "Do NOT include explanations, code blocks, or any other text. "
        "If the description is ambiguous or names an unknown metric, "
        "output exactly \"INVALID\"."
    )


async def parse_alert_nl(prompt: str) -> AlertRuleCreate | None:
    """Convert NL alert description to a validated AlertRuleCreate. None on failure.

    Returns None on:
      - missing ANTHROPIC_API_KEY (early-return before constructing client)
      - empty/non-text response
      - exact "INVALID" literal (Haiku's ambiguity signal)
      - JSONDecodeError / non-dict parse
      - unknown metric (is_known_metric == False)
      - AlertRuleCreate validator failure (ValidationError IS ValueError)

    AsyncAnthropic is constructed inside the function — module import is
    side-effect-free. Tests monkeypatch via the `_patched_import` shim
    (mirror cmc/schedules/nlcron.py:30 verbatim).
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    from anthropic import AsyncAnthropic  # local import keeps module side-effect-free

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
        log.warning(
            "alerts.nl_parser.malformed_output", extra={"text": text[:200]}
        )
        return None
    if not isinstance(parsed, dict):
        return None
    metric = parsed.get("metric")
    if not isinstance(metric, str) or not is_known_metric(metric):
        log.warning(
            "alerts.nl_parser.hallucinated_metric", extra={"metric": metric}
        )
        return None
    try:
        return AlertRuleCreate(**parsed)
    except (ValueError, TypeError) as e:
        log.warning(
            "alerts.nl_parser.validation_failed", extra={"err": str(e)}
        )
        return None
