"""Anthropic Haiku NL -> cron — RESEARCH Pattern 8 + Pitfall 9.

Returns None when the model output fails croniter validation OR when
ANTHROPIC_API_KEY is unset (caller emits 503).
"""
from __future__ import annotations

import os
from typing import Optional

from cmc.schedules.cron import validate_cron

_SYSTEM_PROMPT = (
    "You are a cron expression generator. Given a natural-language schedule "
    "description, output ONLY a valid 5-field cron expression "
    "(minute hour day-of-month month day-of-week). Do NOT include "
    "explanations, code blocks, or any other text. If the description is "
    "ambiguous, output the most reasonable interpretation. If no schedule "
    "is implied, output exactly \"INVALID\"."
)


async def nl_to_cron(prompt: str) -> Optional[str]:
    """Convert NL schedule to cron via Claude Haiku 4.5. None on failure.

    Pitfall 9: AsyncAnthropic is constructed inside the function so module
    import does not require ANTHROPIC_API_KEY. Tests monkeypatch the env
    or replace the client.
    """
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
    text = msg.content[0].text.strip()
    if text == "INVALID" or not validate_cron(text):
        return None
    return text
