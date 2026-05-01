"""Context router tests for GET /api/context/health.

Read-only endpoint that scans ~/.claude/settings.json + ~/.claude/CLAUDE.md
and returns aggregate counts + redacted secret-key NAMES (never values).

Threat model:
  - T-07-01-01 (Information Disclosure): redact case-insensitive matches of
    *KEY* / *TOKEN* / *SECRET* / *PASSWORD* in key names; defense-in-depth
    schema has NO field that carries values.
  - T-07-01-02 (Tampering — path traversal): HOME_CLAUDE_DIR is HARDCODED at
    module level. Endpoint accepts NO path or query params.

Tests use monkeypatch on context_module.HOME_CLAUDE_DIR to redirect filesystem
reads into a tmp_path so the test never touches the real ~/.claude directory.
"""

import json

import pytest


@pytest.fixture
def fake_claude_dir(tmp_path, monkeypatch):
    """Redirect HOME_CLAUDE_DIR to a tmp_path so tests never touch real ~/.claude."""
    from cmc.api.routes import context as context_module

    monkeypatch.setattr(context_module, "HOME_CLAUDE_DIR", tmp_path)
    return tmp_path


@pytest.mark.asyncio
async def test_context_health_no_files(client, fake_claude_dir):
    """Empty ~/.claude/ — returns 200 with both exists flags false."""
    r = await client.get("/api/context/health")
    assert r.status_code == 200
    body = r.json()
    assert body["settings_exists"] is False
    assert body["claude_md_exists"] is False
    assert body["settings_keys"] == []
    assert body["mcp_server_count"] == 0
    assert body["hook_count"] == 0
    assert body["claude_md_lines"] == 0
    # Path strings are surfaced (so the UI can show "looking for X")
    assert body["settings_path"].endswith("settings.json")
    assert body["claude_md_path"].endswith("CLAUDE.md")


@pytest.mark.asyncio
async def test_context_health_redacts_secret_keys(client, fake_claude_dir):
    """Settings keys matching *KEY*/*TOKEN*/*SECRET*/*PASSWORD* (case-insensitive)
    must be marked '(redacted)' in the response. Values must NEVER appear in
    response text (defense in depth — T-07-01-01)."""
    settings = {
        "ANTHROPIC_API_KEY": "sk-ant-secret",
        "OPENAI_TOKEN": "sk-xyz",
        "github_password": "hunter2",
        "weird_secret_thing": "x",
        "model_default": "claude-3-5-sonnet-latest",
        "mcpServers": {"a": {}, "b": {}},
        "hooks": {"pre": "echo"},
    }
    (fake_claude_dir / "settings.json").write_text(json.dumps(settings))
    r = await client.get("/api/context/health")
    assert r.status_code == 200
    body = r.json()
    assert body["settings_exists"] is True
    keys = body["settings_keys"]
    assert "ANTHROPIC_API_KEY (redacted)" in keys
    assert "OPENAI_TOKEN (redacted)" in keys
    assert "github_password (redacted)" in keys
    assert "weird_secret_thing (redacted)" in keys
    # Non-secret keys are NOT redacted
    assert "model_default" in keys
    assert "mcpServers" in keys
    # Counts derived from settings dict
    assert body["mcp_server_count"] == 2
    assert body["hook_count"] == 1
    # Defense in depth — no field anywhere carries the value
    assert "sk-ant-secret" not in r.text
    assert "hunter2" not in r.text
    assert "sk-xyz" not in r.text


@pytest.mark.asyncio
async def test_context_health_counts_claude_md_lines(client, fake_claude_dir):
    """CLAUDE.md present — claude_md_exists=true, line count populated."""
    (fake_claude_dir / "CLAUDE.md").write_text("line1\nline2\nline3\n")
    r = await client.get("/api/context/health")
    assert r.status_code == 200
    body = r.json()
    assert body["claude_md_exists"] is True
    assert body["claude_md_lines"] == 3


@pytest.mark.asyncio
async def test_context_health_corrupt_settings_does_not_500(client, fake_claude_dir):
    """Corrupt JSON in settings.json — graceful degradation (200 with empty keys)."""
    (fake_claude_dir / "settings.json").write_text("{not valid json")
    r = await client.get("/api/context/health")
    assert r.status_code == 200
    body = r.json()
    assert body["settings_exists"] is True
    # Failed parse degrades to empty list rather than 500
    assert body["settings_keys"] == []
    assert body["mcp_server_count"] == 0
    assert body["hook_count"] == 0


@pytest.mark.asyncio
async def test_context_health_no_path_query_param_accepted(client, fake_claude_dir):
    """T-07-01-02 — endpoint must NOT honor a `path=` query param.
    HOME_CLAUDE_DIR is hardcoded; FastAPI ignores unknown query params."""
    r = await client.get("/api/context/health?path=/etc/passwd")
    assert r.status_code == 200
    body = r.json()
    # Path is the hardcoded tmp HOME_CLAUDE_DIR — never /etc/passwd
    assert "/etc/passwd" not in body["settings_path"]
    assert "/etc/passwd" not in body["claude_md_path"]


@pytest.mark.asyncio
async def test_context_health_response_schema_has_no_value_field(client, fake_claude_dir):
    """Defense in depth — schema is closed; cannot serialize values even if
    redaction logic regresses. Asserts the exact 8-field shape."""
    (fake_claude_dir / "settings.json").write_text(json.dumps({"FOO_KEY": "secret123"}))
    r = await client.get("/api/context/health")
    body = r.json()
    # No field in response carries 'secret123'
    assert "secret123" not in r.text
    # Schema is closed — fields are exactly the 8 we defined in the Pydantic model.
    assert set(body.keys()) == {
        "settings_path",
        "settings_exists",
        "claude_md_path",
        "claude_md_exists",
        "claude_md_lines",
        "settings_keys",
        "mcp_server_count",
        "hook_count",
    }
