"""DISP-10 model resolution chain — pure function, no I/O.

Precedence (highest to lowest):
  1. task.model (explicit per-task override; CLI / API caller's choice)
  2. skill.frontmatter['model'] (skill author's recommendation)
  3. os.environ['CMC_DEFAULT_MODEL'] (operator override at process boot)
  4. settings.claude_default_model (project default; sane fallback)

Why this order:
- Task-level wins so callers can demand a specific model (e.g., risky task
  upgraded to opus, cheap task downgraded to haiku).
- Skill-level next so skill-router-driven tasks inherit skill author's pick.
- Env override exists for ops scenarios (e.g., temporary model rollback during
  upstream incident) without code changes.
- Settings fallback ensures resolve_model never returns None / empty string.
"""

import os
from collections.abc import Mapping
from typing import Any


def resolve_model(task: Mapping[str, Any] | Any, skill: Any, settings) -> str:
    """Return the resolved model alias for the given task / skill / settings.

    Args:
        task: dict-like (claim_pending_tasks returns dicts) OR Task ORM instance.
              We duck-type via Mapping check + getattr fallback.
        skill: cmc.db.models.skills.Skill instance OR None.
        settings: cmc.config.Settings — must expose claude_default_model.

    Returns:
        A non-empty model alias string. Never returns None / empty.
    """
    # Task-level override (highest precedence)
    if isinstance(task, Mapping):
        t_model = task.get("model")
    else:
        t_model = getattr(task, "model", None)
    if t_model:
        return str(t_model)

    # Skill-level override
    if skill is not None:
        fm = getattr(skill, "frontmatter", None) or {}
        if isinstance(fm, dict):
            fm_model = fm.get("model")
            if fm_model:
                return str(fm_model)

    # Operator env override (intentionally CMC_-prefixed: this is a
    # dispatcher-specific knob, not a generic settings value, so the prefix
    # disambiguates from project-wide CLAUDE_DEFAULT_MODEL).
    env_model = os.environ.get("CMC_DEFAULT_MODEL")
    if env_model:
        return env_model

    # Settings fallback
    return settings.claude_default_model
