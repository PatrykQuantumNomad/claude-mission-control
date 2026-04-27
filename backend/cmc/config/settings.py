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

from pydantic import Field, ValidationError, model_validator
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

    # Phase 2 — JSONL ingestion
    # NOTE: jsonl_root is a USER-HOME-anchored path, not a repo-root-anchored path.
    # It is intentionally OMITTED from `_resolve_repo_root_paths` below so that
    # `~/...` env overrides resolve via Path.expanduser() at scraper access time
    # (per Phase 2 plan 02-01 interfaces block).
    jsonl_root: Path = Field(default_factory=lambda: Path.home() / ".claude/projects")
    session_idle_minutes: int = 5
    otlp_max_body_bytes: int = 10_000_000  # 10MB cap on /v1/logs and /v1/metrics

    # Phase 4 — TASK-07 dispatcher trigger
    # Per RESEARCH Open Q5: Phase 8 replaces the stub by editing this default,
    # not router code. list[str] argv with default_factory because list defaults
    # must be callable.
    dispatcher_oneshot_cmd: list[str] = Field(
        default_factory=lambda: [sys.executable, "-m", "cmc.dispatcher.oneshot"],
        description="argv list spawned by TASK-07; Phase 4 default invokes the stub",
    )

    # Phase 8 — Mission Control Dispatcher (DISP-01..12)
    # NOTE: claude_bin is INTENTIONALLY OMITTED from `_resolve_repo_root_paths`
    # below — it's an absolute system path, not a repo-anchored path. launchd
    # does not inherit user PATH so a fully-qualified path is required.
    claude_bin: Path = Field(
        default=Path("/opt/homebrew/bin/claude"),
        description="Absolute path to the claude CLI binary; launchd does NOT inherit user PATH",
    )
    claude_default_model: str = Field(
        default="sonnet",
        description="DISP-10 fallback model alias (passed to claude --model when task.model is null)",
    )
    dispatcher_max_concurrent: int = Field(
        default=3,
        description="DISP-04 cap on concurrent claude subprocesses",
    )
    dispatcher_classic_timeout_s: int = Field(
        default=600,
        description="DISP-05 default timeout for classic-mode subprocesses (seconds)",
    )
    dispatcher_decision_timeout_s: int = Field(
        default=3600,
        description="DISP-07 cap on decision-answer poll loop (seconds)",
    )
    dispatcher_followup_poll_s: float = Field(
        default=1.0,
        description="DISP-09 cadence for polling the follow-up message queue file (seconds)",
    )
    dispatcher_answer_poll_s: float = Field(
        default=2.0,
        description="DISP-07 cadence for polling decision-status changes (seconds)",
    )

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
