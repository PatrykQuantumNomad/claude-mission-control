"""Phase 7 Plan 01 — SKLP-03 ContextHealthResponse schema.

Defense-in-depth contract (T-07-01-01 — RESEARCH §Pitfall 5):
the schema MUST NOT contain a `settings_values` field, a `settings` dict,
or anything that could leak the underlying secret values. Even if the
redaction logic in cmc.api.routes.context regresses, the wire shape
cannot serialize values — they have nowhere to land.

Fields:
  settings_path:    str  — absolute path to ~/.claude/settings.json
  settings_exists:  bool — was the settings file readable?
  claude_md_path:   str  — absolute path to ~/.claude/CLAUDE.md
  claude_md_exists: bool — was the CLAUDE.md file readable?
  claude_md_lines:  int  — line count of CLAUDE.md (0 when missing)
  settings_keys:    list[str] — secret-key NAMES only (suffixed
    " (redacted)" when name matches *KEY*/*TOKEN*/*SECRET*/*PASSWORD*
    case-insensitive). Values NEVER appear here.
  mcp_server_count: int — len(settings.mcpServers) when present
  hook_count:       int — len(settings.hooks) when present
"""

from pydantic import BaseModel


class ContextHealthResponse(BaseModel):
    settings_path: str
    settings_exists: bool
    claude_md_path: str
    claude_md_exists: bool
    claude_md_lines: int
    settings_keys: list[str]  # NAMES only — secrets redacted as "<NAME> (redacted)"
    mcp_server_count: int
    hook_count: int
