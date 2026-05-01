"""Repo-root anchor for cwd-independent path resolution.

Every path-shaped Settings field (db_path, static_dir, alembic_ini_path) is
resolved against `repo_root()`, NOT against `Path.cwd()`. This keeps `data/cmc.db`
and `backend/alembic.ini` pointing at the SAME files regardless of whether the
server was started from the repo root or from `backend/`.

The app factory uses the same helper to resolve `static_dir` for the SPA mount.
"""

from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def repo_root() -> Path:
    """Walk up from this file until we find a directory with backend/ and frontend/ siblings.

    The repo root is uniquely identified by having both `backend/` and `frontend/`
    as direct children — this is the locked layout from CONTEXT.md.

    Falls back to the parent-of-parent of the cmc package if the walk is inconclusive
    (e.g., during isolated unit tests in tmp dirs).
    """
    here = Path(__file__).resolve()
    for candidate in (here, *here.parents):
        if (candidate / "backend").is_dir() and (candidate / "frontend").is_dir():
            return candidate
    # Fallback: backend/cmc/core/paths.py -> backend/cmc/core -> backend/cmc -> backend -> repo root
    return here.parents[3]


def resolve_under_repo_root(p: Path) -> Path:
    """Resolve `p` against `repo_root()` if it is relative; return absolute otherwise."""
    p = Path(p)
    if p.is_absolute():
        return p
    return (repo_root() / p).resolve()
