"""DISP-11 skill router — Haiku 4.5 picks best skill for unassigned tasks.

Mirrors `cmc.schedules.nlcron` exactly: lazy import AsyncAnthropic inside the
function, 503-graceful when ANTHROPIC_API_KEY unset, strict JSON output,
validate against the local skill registry to reject hallucinated names.

Contract (locked by Plan 08-04 Truth #4):
- Returns None when ANTHROPIC_API_KEY is unset.
- Returns None when no user_invocable=True skills exist.
- Returns None when Haiku output is not valid JSON, missing 'skill' key, or
  names a skill not in the registry (hallucinated).
- Returns the chosen skill name string otherwise.

Why filter on user_invocable: skills marked user_invocable=False are internal
(cleanup hooks, etc.) and the dispatcher must not auto-select them — only
operators can opt-in to non-public skills explicitly.
"""

import json
import logging
import os

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db.models.skills import Skill

log = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "You are a skill router. Given a task title, description, and a list of "
    "available skills (name + description), output ONLY a JSON object "
    '{"skill": "<name>"} where <name> is one of the provided skill names, or '
    '{"skill": null} if no skill matches. Do NOT include explanations, code '
    "blocks, or any other text."
)


async def pick_skill(
    db: AsyncSession, task_title: str, task_desc: str
) -> str | None:
    """Return the best skill name for the task, or None when ungraceful.

    Args:
        db: Active AsyncSession (scoped by caller).
        task_title: Task title (passed as user-prompt context to Haiku).
        task_desc: Task description (full body).

    Returns:
        Skill name (string) when Haiku picks a registered user_invocable skill;
        None on any graceful-degradation path (no key, no skills, malformed
        output, hallucinated name).
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        log.info("dispatcher.skill_router.no_api_key")
        return None

    available = (
        await db.execute(
            select(Skill).where(Skill.user_invocable == True)  # noqa: E712
        )
    ).scalars().all()
    if not available:
        return None

    skill_list = "\n".join(
        f"- {s.name}: {s.description or '(no description)'}" for s in available
    )
    user_prompt = (
        f"Task title: {task_title}\n"
        f"Task description: {task_desc}\n\n"
        f"Available skills:\n{skill_list}"
    )

    from anthropic import AsyncAnthropic  # lazy import — module is side-effect-free

    client = AsyncAnthropic(api_key=api_key)
    msg = await client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=128,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )
    text = (msg.content[0].text or "").strip()
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        log.warning(
            "dispatcher.skill_router.malformed_output", extra={"text": text[:200]}
        )
        return None
    if not isinstance(parsed, dict):
        return None
    chosen = parsed.get("skill")
    if not chosen:
        return None
    valid = {s.name for s in available}
    if chosen not in valid:
        log.warning(
            "dispatcher.skill_router.hallucinated", extra={"chosen": chosen}
        )
        return None
    return chosen
