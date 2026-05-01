"""Pydantic-Settings configuration with pretty ValidationError + repo-root path resolution.

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

import sys
from pathlib import Path
from typing import Annotated, Self

from pydantic import Field, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from cmc.core.paths import resolve_under_repo_root


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # env_file is a TUPLE so BOTH the repo-mode `.env` AND the install-mode
        # `~/.command-centre/.env` resolve. pydantic-settings loads files
        # left-to-right with rightmost-wins precedence — install env overrides
        # repo env when both define the same var (mirrors
        # cmc.cli.setup_telegram._resolve_env_path precedence).
        # NOTE: pydantic-settings does NOT auto-expand `~`; pass an already-
        # resolved Path. Path.home() is process-bound; tests can override via
        # monkeypatch.setattr(Path, "home", ...).
        env_file=(".env", str(Path.home() / ".command-centre" / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",          # don't error on unknown vars
        case_sensitive=False,
    )

    # Locked decision: sensible defaults everywhere; nothing required.
    # Path defaults are RELATIVE; the model validator below absolutizes them
    # against the repo root so cwd cannot drift them.
    host: str = "127.0.0.1"
    port: int = 8765
    app_name: str = "Claude Mission Control"
    app_description: str = "Local dashboard and automation API for Claude Code"
    app_version: str = "0.1.0"
    debug: bool = False
    docs_enabled: bool = True
    redoc_enabled: bool = False
    openapi_enabled: bool = True
    info_endpoint_enabled: bool = False
    endpoints_listing_enabled: bool = False
    db_path: Path = Path("data/cmc.db")
    db_echo: bool = False
    log_level: str = "INFO"
    log_format: str = "text"
    log_redact_headers: bool = False
    static_dir: Path = Path("frontend/dist")
    alembic_ini_path: Path = Path("backend/alembic.ini")

    # Production chassis hardening. Defaults preserve local development:
    # local hosts are accepted, auth/rate-limit/metrics/OTel are opt-in.
    health_check_path: str = "/healthcheck"
    readiness_check_path: str = "/ready"
    readiness_include_details: bool = False
    database_health_timeout_seconds: float = 2.0
    trusted_hosts: list[str] = Field(
        default_factory=lambda: ["127.0.0.1", "localhost", "test", "testserver", "*.local"]
    )
    cors_allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173"]
    )
    cors_allow_credentials: bool = False
    cors_allowed_methods: list[str] = Field(
        default_factory=lambda: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    )
    cors_allowed_headers: list[str] = Field(
        default_factory=lambda: [
            "Authorization",
            "Content-Type",
            "X-Correlation-ID",
            "X-Request-ID",
        ]
    )
    cors_expose_headers: list[str] = Field(
        default_factory=lambda: [
            "X-Correlation-ID",
            "X-Request-ID",
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
        ]
    )
    request_timeout_s: float = 30.0
    max_request_body_bytes: int = 10_000_000
    security_headers_enabled: bool = True
    security_hsts_enabled: bool = False
    security_hsts_max_age_seconds: int = 31_536_000
    security_referrer_policy: str = "no-referrer"
    security_permissions_policy: str = "geolocation=(), microphone=(), camera=()"
    security_content_security_policy: str = ""
    security_trust_proxy_proto_header: bool = False
    security_trusted_proxies: list[str] = Field(default_factory=list)

    auth_enabled: bool = False
    auth_jwt_algorithms: list[str] = Field(default_factory=lambda: ["HS256"])
    auth_jwt_secret: str | None = None
    auth_jwt_public_key: str | None = None
    auth_jwks_url: str | None = None
    auth_jwt_audience: str | None = None
    auth_jwt_issuer: str | None = None
    auth_require_exp: bool = True
    auth_clock_skew_seconds: int = 30
    auth_jwks_cache_ttl_seconds: int = 300
    auth_jwks_max_stale_seconds: int = 3600

    metrics_enabled: bool = False
    metrics_prefix: str = "cmc"
    otel_enabled: bool = False
    otel_service_name: str = "claude-mission-control"
    otel_service_version: str = "0.1.0"
    otel_environment: str = "local"
    otel_exporter_otlp_endpoint: str = "http://localhost:4318/v1/traces"
    otel_exporter_otlp_headers: str = ""

    rate_limit_enabled: bool = False
    rate_limit_requests: int = 120
    rate_limit_window_seconds: int = 60
    rate_limit_key_strategy: str = "ip"
    rate_limit_storage_url: str = ""
    rate_limit_trust_proxy_headers: bool = False
    rate_limit_proxy_headers: list[str] = Field(default_factory=lambda: ["x-forwarded-for"])
    rate_limit_trusted_proxies: list[str] = Field(default_factory=list)

    # JSONL ingestion
    # NOTE: jsonl_root is a USER-HOME-anchored path, not a repo-root-anchored path.
    # It is intentionally OMITTED from `_resolve_repo_root_paths` below so that
    # `~/...` env overrides resolve via Path.expanduser() at scraper access time
    # instead of being incorrectly anchored under the repository.
    jsonl_root: Path = Field(default_factory=lambda: Path.home() / ".claude/projects")
    session_idle_minutes: int = 5
    otlp_max_body_bytes: int = 10_000_000  # 10MB cap on /v1/logs and /v1/metrics

    # Task router dispatcher trigger. list[str] argv uses default_factory because
    # mutable defaults must be callable.
    dispatcher_oneshot_cmd: list[str] = Field(
        default_factory=lambda: [sys.executable, "-m", "cmc.dispatcher.oneshot"],
        description="argv list spawned by the task trigger endpoint",
    )

    # Mission Control dispatcher
    # NOTE: claude_bin is INTENTIONALLY OMITTED from `_resolve_repo_root_paths`
    # below — it's an absolute system path, not a repo-anchored path. launchd
    # does not inherit user PATH so a fully-qualified path is required.
    claude_bin: Path = Field(
        default=Path("/opt/homebrew/bin/claude"),
        description="Absolute path to the claude CLI binary; launchd does NOT inherit user PATH",
    )
    claude_default_model: str = Field(
        default="sonnet",
        description=(
            "DISP-10 fallback model alias "
            "(passed to claude --model when task.model is null)"
        ),
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

    # Telegram integration. All optional; bot disabled when telegram_bot_token is None.
    telegram_bot_token: str | None = Field(
        default=None,
        description="BotFather token; when None telegram daemons no-op",
    )
    telegram_chat_id: str | None = Field(
        default=None,
        description=(
            "Single-user chat_id from setup_telegram wizard. Stored as string to preserve "
            "negative integers for group chats (Pitfall P10)"
        ),
    )
    # NoDecode tells pydantic-settings NOT to JSON-decode this env var — the
    # _parse_telegram_allowed_user_ids field_validator below handles both CSV
    # (`1,2,3`) and JSON-array (`["1","2"]`) forms. Without NoDecode, pydantic-
    # settings rejects bare CSVs as "Input should be a valid list" before the
    # validator runs.
    telegram_allowed_user_ids: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        description=(
            "Comma-separated user_ids whose text messages can route to claude (TELE-05). "
            "TELEGRAM_ALLOWED_USER_IDS=123,456 in .env is parsed into list[str]"
        ),
    )
    telegram_poll_timeout_s: int = Field(
        default=25,
        description="getUpdates long-poll timeout (must be < 30s launchd cycle)",
    )
    telegram_notifier_interval_s: int = Field(
        default=30,
        description="Notifier oneshot StartInterval; matches plist template",
    )

    # ANTHROPIC_API_KEY surface for the Telegram handler relay. Loaded via
    # Settings (env_file tuple) so launchd-spawned daemons can read it without
    # the operator's shell env. Dispatcher run_classic.py intentionally does not
    # use this; it scrubs the key for subscription-auth runs.
    anthropic_api_key: str | None = Field(
        default=None,
        description=(
            "Read from ~/.command-centre/.env via Settings (NOT bare os.environ). "
            "Surfaced into the env dict passed to `claude -p` by the Telegram "
            "handler. Dispatcher classic-runner does NOT use this; it scrubs "
            "the key for subscription-auth runs."
        ),
    )

    @field_validator("telegram_allowed_user_ids", mode="before")
    @classmethod
    def _parse_telegram_allowed_user_ids(cls, v):
        """Accept env vars as comma-separated strings or JSON arrays.

        Pydantic-Settings v2 does NOT auto-split list[str] from a bare CSV value.
        The wizard (cmc setup telegram) writes `TELEGRAM_ALLOWED_USER_IDS=1,2,3`
        as plain text into .env, so we split here. Also tolerates an already-
        decoded list (e.g. tests passing list directly).
        """
        if v is None or v == "":
            return []
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        if isinstance(v, str):
            s = v.strip()
            # JSON array form: ["1","2"]
            if s.startswith("[") and s.endswith("]"):
                import json
                try:
                    arr = json.loads(s)
                    if isinstance(arr, list):
                        return [str(x).strip() for x in arr if str(x).strip()]
                except json.JSONDecodeError:
                    pass
            # CSV form: 1,2,3
            return [p.strip() for p in s.split(",") if p.strip()]
        return v

    @model_validator(mode="after")
    def _resolve_repo_root_paths(self) -> Self:
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
