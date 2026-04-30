"""Phase 7 Plan 01 — SKLP-03 GET /api/context/health.

Read-only scan of the developer's ~/.claude/ configuration directory:
returns aggregate counts (claude_md line count, mcp server count, hook
count) and a list of REDACTED setting key NAMES so the dashboard can
warn when the operator is missing critical context (e.g. an empty
mcpServers map) without ever surfacing secret VALUES.

Threat model (PLAN.md <threat_model>):
  T-07-01-01 (Information Disclosure): Backend redacts keys matching
    *KEY*/*TOKEN*/*SECRET*/*PASSWORD* (case-insensitive) before
    serialization. Response schema (cmc.api.schemas.context) does NOT
    include any field that carries values — defense in depth.
  T-07-01-02 (Tampering — path traversal): HOME_CLAUDE_DIR is HARDCODED
    at module level. Endpoint accepts NO path or query params. Even if
    a caller appends `?path=/etc/passwd`, FastAPI ignores unknown query
    params and the handler reads only the hardcoded path.

Polling cadence: lib/queries.ts useContextHealth fetches at 60_000ms —
this is a low-frequency endpoint by design (file IO once per minute).
"""

import json
import re
from pathlib import Path

from fastapi import APIRouter

from ..schemas.context import ContextHealthResponse

router = APIRouter(prefix="/context", tags=["context"])
# NOTE: prefix is "/context" — the factory mounts every router under "/api"
# (cmc.app.factory.create_app), so the final route is /api/context/health.
# Mirror the convention used by skills/hitl/tasks/schedules routers.

# HARDCODED at module level — T-07-01-02 mitigation. The route never reads
# a path from a query/body parameter; tests redirect this binding via
# monkeypatch (see tests/test_phase7_context.py::fake_claude_dir).
HOME_CLAUDE_DIR = Path.home() / ".claude"

# Case-insensitive regex matching common secret-key name patterns. The
# response carries key NAMES only — values are read but never echoed back.
SECRET_PATTERN = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD)", re.IGNORECASE)


def _redact_keys(items: dict) -> list[str]:
    """Return key names; suffix '(redacted)' on names matching SECRET_PATTERN.

    Values are intentionally not consulted — only the key NAMES are echoed
    back. This keeps the redaction decision orthogonal to value content
    (some legit non-secret values may happen to contain "key" substrings).
    """
    return [
        f"{k} (redacted)" if SECRET_PATTERN.search(k) else k
        for k in items
    ]


@router.get("/health", response_model=ContextHealthResponse)
async def context_health() -> ContextHealthResponse:
    """SKLP-03 read-only ~/.claude/ scan. See module docstring for threats."""
    settings_path = HOME_CLAUDE_DIR / "settings.json"
    claude_md_path = HOME_CLAUDE_DIR / "CLAUDE.md"

    settings_exists = settings_path.is_file()
    claude_md_exists = claude_md_path.is_file()

    settings_keys: list[str] = []
    mcp_server_count = 0
    hook_count = 0
    if settings_exists:
        try:
            data = json.loads(settings_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                settings_keys = _redact_keys(data)
                mcp_servers_obj = data.get("mcpServers")
                if isinstance(mcp_servers_obj, dict):
                    mcp_server_count = len(mcp_servers_obj)
                hooks_obj = data.get("hooks")
                if isinstance(hooks_obj, dict):
                    hook_count = len(hooks_obj)
        except (json.JSONDecodeError, OSError):
            # Corrupt or unreadable file — surface as "exists but no keys"
            # rather than 500. The dashboard treats empty keys + exists=True
            # as a soft warning, not a hard error.
            settings_keys = []

    claude_md_lines = 0
    if claude_md_exists:
        try:
            # Count newline-terminated lines. CLAUDE.md is typically <10K
            # lines and we read it at 60s cadence so the IO is negligible.
            claude_md_lines = sum(
                1 for _ in claude_md_path.read_text(encoding="utf-8").splitlines()
            )
        except OSError:
            claude_md_lines = 0

    return ContextHealthResponse(
        settings_path=str(settings_path),
        settings_exists=settings_exists,
        claude_md_path=str(claude_md_path),
        claude_md_exists=claude_md_exists,
        claude_md_lines=claude_md_lines,
        settings_keys=settings_keys,
        mcp_server_count=mcp_server_count,
        hook_count=hook_count,
    )
