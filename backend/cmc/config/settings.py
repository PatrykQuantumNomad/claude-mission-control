"""Pydantic-Settings configuration with pretty ValidationError + repo-root path resolution.

Source pattern: 01-RESEARCH.md "Pattern 4: Pydantic-Settings with Pretty ValidationError".

Locked decisions:
- All fields have sensible defaults; nothing required (see CONTEXT.md).
- A single `.env` is auto-loaded if present, gitignored.
- On invalid env values, print a clean per-field message and `sys.exit(1)` —
  no Python traceback, no leaked rejected values (Security Domain V7).
- Path-shaped fields (db_path, static_dir, alembic_ini_path) are resolved against
  the REPO ROOT, not cwd. This closes BLOCKER 1: the same Settings() instance
  produces identical absolute paths whether uvicorn was started from the repo root
  or from `backend/`.
"""
from __future__ import annotations

import sys
from pathlib import Path

from pydantic import ValidationError, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from cmc.core.paths import resolve_under_repo_root


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",          # don't error on unknown vars
        case_sensitive=False,
    )

    # Locked decision: sensible defaults everywhere; nothing required.
    # Path defaults are RELATIVE; the model validator below absolutizes them
    # against the repo root so cwd cannot drift them.
    host: str = "127.0.0.1"
    port: int = 8765
    db_path: Path = Path("data/cmc.db")
    db_echo: bool = False
    log_level: str = "INFO"
    static_dir: Path = Path("frontend/dist")
    alembic_ini_path: Path = Path("backend/alembic.ini")

    @model_validator(mode="after")
    def _resolve_repo_root_paths(self) -> "Settings":
        """Make path-shaped fields cwd-independent.

        Runs AFTER pydantic-settings has applied env vars + .env, so user-supplied
        absolute paths (e.g. DB_PATH=/tmp/foo.db) are preserved unchanged
        (resolve_under_repo_root short-circuits on absolute paths). Relative paths
        are absolutized against repo_root(), NOT cwd.
        """
        for field in ("db_path", "static_dir", "alembic_ini_path"):
            object.__setattr__(self, field, resolve_under_repo_root(getattr(self, field)))
        return self


def load_settings() -> Settings:
    """Load Settings, render a pretty error and exit(1) on invalid config."""
    try:
        return Settings()
    except ValidationError as e:
        _render_pretty(e)
        sys.exit(1)


def _render_pretty(e: ValidationError) -> None:
    """Render a ValidationError as a clean per-field message on stderr.

    Security Domain V7: print only field names + types — never the rejected value.
    Reading `err["input"]` would leak `.env` contents to the operator's terminal.
    """
    print("Configuration error: invalid environment / .env values\n", file=sys.stderr)
    for err in e.errors():
        loc = ".".join(str(p) for p in err["loc"])
        msg = err["msg"]
        env_hint = loc.upper()
        print(f"  • {loc}: {msg}", file=sys.stderr)
        print(f"    Set environment variable {env_hint} or add {env_hint}=... to .env",
              file=sys.stderr)
    print("\nSee .env.example for documented defaults.", file=sys.stderr)
