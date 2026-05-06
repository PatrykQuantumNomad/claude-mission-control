"""Project-key derivation: sha1[:12] of realpath(cwd.rstrip('/')).

Phase 19 (SKLP-08) introduces this as the canonical project identifier.
NEVER expose raw `cwd` in API responses — `project_key` is the only
project-shaped value the user sees (ROADMAP success criterion #1).

Pitfall 5 (RESEARCH.md): os.path.realpath() returns the input unchanged
for path components that don't exist on disk; this is acceptable —
historical sessions for deleted projects may produce a slightly
different key than they would have at recording time, but no path
leakage and no data corruption either way.

POLI-06 note: this module performs no time-of-day logic and therefore
contains zero references to the deprecated stdlib naive-UTC factory.
"""
from __future__ import annotations

import hashlib
import os


def compute_project_key(cwd: str | None) -> str:
    """sha1[:12] of realpath(cwd.rstrip('/')). Empty/None input -> ''.

    Trailing-slash idempotent: '/tmp/foo' and '/tmp/foo/' produce the
    same key. Symlinks are resolved (canonical identity), so two cwds
    pointing at the same physical directory always collide deterministically.

    Returns:
      A 12-character lowercase hex string for any non-empty input,
      or the empty string for None / empty inputs.
    """
    if not cwd:
        return ""
    canonical = os.path.realpath(cwd.rstrip("/"))
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:12]
