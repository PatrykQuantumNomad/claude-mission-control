"""Anthropic Haiku NL -> cron.

Returns None when the model output fails croniter validation OR when
ANTHROPIC_API_KEY is unset (caller emits 503).
"""

import os

from cmc.schedules.cron import validate_cron

_SYSTEM_PROMPT = (
    "You are a cron expression generator. Given a natural-language schedule "
    "description, output ONLY a valid 5-field cron expression "
    "(minute hour day-of-month month day-of-week). Do NOT include "
    "explanations, code blocks, or any other text. If the description is "
    "ambiguous, output the most reasonable interpretation. If no schedule "
    "is implied, output exactly \"INVALID\"."
)


async def nl_to_cron(prompt: str) -> str | None:
    """Convert NL schedule to cron via Claude Haiku 4.5. None on failure.

    AsyncAnthropic is constructed inside the function so module import does not
    require ANTHROPIC_API_KEY. Tests monkeypatch the env or replace the client.
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
    first_block = msg.content[0] if msg.content else None
    text_value = getattr(first_block, "text", None)
    if not isinstance(text_value, str):
        return None
    text = text_value.strip()
    if text == "INVALID" or not validate_cron(text):
        return None
    return text
