"""SETUP-04..06 backend tests + SETUP-01..03 install/cmc shim tests.

Covers:
- Server plist render (uvicorn invocation, KeepAlive=true).
- setup_otel atomic merge: 6 keys added, never overwrites, no leftover .tmp.
- doctor 14-check infrastructure (run_checks count + sample checks; expanded
  from 8 → 14 in Phase 13 Plan 05 with pricing/skill-ingest sensors).
- install.sh dry-run smoke + cmc shim help/unknown-subcommand routing.
"""

import json
import os
import sys
from pathlib import Path

import pytest

# =========================================================================
# server plist
# =========================================================================


def test_server_plist_renders_uvicorn_command() -> None:
    from cmc.app.plist_render import render_plist

    out = render_plist("/opt/homebrew/bin/python3.13", "/Users/me/repo")
    assert "<key>Label</key>" in out
    assert "com.cmc.server" in out
    assert "/opt/homebrew/bin/uvicorn" in out
    assert "cmc.app.factory:create_app" in out
    assert "<key>CMC_ENV</key>" in out
    assert "<string>install</string>" in out
    assert "--factory" in out
    assert "<key>KeepAlive</key>" in out
    # Server binds to localhost:8765.
    assert "127.0.0.1" in out
    assert "8765" in out
    # WorkingDirectory honored
    assert "/Users/me/repo" in out


def test_server_plist_module_cli_entry(tmp_path) -> None:
    """`python -m cmc.app.plist_render <python> <root>` writes plist to stdout."""
    import subprocess

    res = subprocess.run(
        [
            sys.executable,
            "-m",
            "cmc.app.plist_render",
            "/opt/homebrew/bin/python3.13",
            str(tmp_path),
        ],
        capture_output=True,
        timeout=10,
    )
    assert res.returncode == 0, res.stderr.decode()
    out = res.stdout.decode()
    assert "com.cmc.server" in out
    assert "<key>KeepAlive</key>" in out


def test_dispatcher_plist_module_cli_entry(tmp_path) -> None:
    """`python -m cmc.dispatcher.plist_render` works."""
    import subprocess

    res = subprocess.run(
        [
            sys.executable,
            "-m",
            "cmc.dispatcher.plist_render",
            "/opt/homebrew/bin/python3.13",
            str(tmp_path),
        ],
        capture_output=True,
        timeout=10,
    )
    assert res.returncode == 0, res.stderr.decode()
    out = res.stdout.decode()
    assert "com.cmc.dispatcher" in out
    assert "<key>CMC_ENV</key>" in out


# =========================================================================
# setup_otel (atomic 6-key merge)
# =========================================================================


def test_setup_otel_creates_settings_with_six_keys(tmp_path) -> None:
    from cmc.cli.setup_otel import OTEL_KEYS, merge_otel_env

    p = tmp_path / "settings.json"
    backup, added = merge_otel_env(p)
    assert backup is None  # no preexisting file → no backup
    assert set(added) == set(OTEL_KEYS.keys())
    data = json.loads(p.read_text())
    assert data["env"]["CLAUDE_CODE_ENABLE_TELEMETRY"] == "1"
    assert (
        data["env"]["OTEL_EXPORTER_OTLP_ENDPOINT"] == "http://127.0.0.1:8765"
    )
    assert data["env"]["OTEL_EXPORTER_OTLP_PROTOCOL"] == "http/json"
    assert data["env"]["OTEL_LOGS_EXPORTER"] == "otlp"
    assert data["env"]["OTEL_METRICS_EXPORTER"] == "otlp"
    assert data["env"]["OTEL_LOG_TOOL_DETAILS"] == "1"
    # Q3 LOCKED — OTEL_LOG_USER_PROMPTS dropped
    assert "OTEL_LOG_USER_PROMPTS" not in data["env"]
    # Exactly 6 keys
    assert len(OTEL_KEYS) == 6


def test_setup_otel_never_overwrites_existing(tmp_path) -> None:
    from cmc.cli.setup_otel import merge_otel_env

    p = tmp_path / "settings.json"
    p.write_text(
        json.dumps(
            {
                "env": {
                    "CLAUDE_CODE_ENABLE_TELEMETRY": "0",  # user opted out
                    "OTHER_KEY": "preserve_me",
                }
            }
        )
    )
    backup, added = merge_otel_env(p)
    assert backup is not None and backup.exists()
    data = json.loads(p.read_text())
    # Existing user value preserved
    assert data["env"]["CLAUDE_CODE_ENABLE_TELEMETRY"] == "0"
    # Other keys added
    assert "OTEL_EXPORTER_OTLP_ENDPOINT" in data["env"]
    # Non-OTEL key preserved
    assert data["env"]["OTHER_KEY"] == "preserve_me"
    # CLAUDE_CODE_ENABLE_TELEMETRY NOT in `added` (already present)
    assert "CLAUDE_CODE_ENABLE_TELEMETRY" not in added
    # Other 5 OTEL keys ARE in `added`
    assert len(added) == 5


def test_setup_otel_atomic_no_leftover_tmp(tmp_path) -> None:
    """Pitfall P8: tmp file in same dir + os.replace → no leftover .tmp."""
    from cmc.cli.setup_otel import merge_otel_env

    p = tmp_path / "settings.json"
    merge_otel_env(p)
    leftover = list(tmp_path.glob("settings.json.tmp"))
    assert leftover == []


def test_setup_otel_idempotent_second_run_adds_nothing(tmp_path) -> None:
    from cmc.cli.setup_otel import merge_otel_env

    p = tmp_path / "settings.json"
    merge_otel_env(p)  # first run adds all 6
    _, added2 = merge_otel_env(p)  # second run is no-op
    assert added2 == []


def test_setup_otel_invalid_json_aborts_with_backup(tmp_path) -> None:
    from cmc.cli.setup_otel import merge_otel_env

    p = tmp_path / "settings.json"
    p.write_text("{ this is not valid json")
    with pytest.raises(SystemExit) as exc_info:
        merge_otel_env(p)
    assert exc_info.value.code == 1
    # Backup should have been created BEFORE the JSON parse failure
    backups = list(tmp_path.glob("settings.json.bak.*"))
    assert len(backups) == 1


# =========================================================================
# doctor (8 checks)
# =========================================================================


def test_doctor_python_check_passes() -> None:
    from cmc.cli.doctor import _check_python

    c = _check_python()
    assert c.id == 1
    assert c.status == "ok"


def test_doctor_settings_check_warn_when_missing(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("HOME", str(tmp_path))
    # Path.home() reads HOME on POSIX; reload to pick up the patched env
    from cmc.cli import doctor as doc

    c = doc._check_settings_json()
    assert c.id == 3
    assert c.status == "warn"


def test_doctor_telegram_skipped_when_unset() -> None:
    """doctor reads token via Settings, not bare os.environ.

    The test injects an explicit Settings instance with `_env_file=None`
    (no file load) and `telegram_bot_token=None` so it is insulated from
    os.environ and any real ~/.command-centre/.env on disk.
    """
    from cmc.cli.doctor import _check_telegram
    from cmc.config.settings import Settings

    s = Settings(_env_file=None, telegram_bot_token=None)
    c = _check_telegram(settings=s)
    assert c.id == 8
    assert c.status == "ok"
    assert "skipped" in c.message


def test_doctor_telegram_via_settings_present():
    """SC3: when telegram_bot_token IS set in Settings, doctor proceeds to call
    Telegram (httpx.get patched to avoid real network)."""
    import httpx

    from cmc.cli.doctor import _check_telegram
    from cmc.config.settings import Settings

    real_get = httpx.get

    def fake_get(url, timeout=None):
        class R:
            status_code = 200

            def json(self_inner):
                return {"result": {"username": "test_bot"}}

        return R()

    httpx.get = fake_get  # type: ignore[assignment]
    try:
        s = Settings(_env_file=None, telegram_bot_token="TEST-TOKEN")
        c = _check_telegram(settings=s)
        assert c.id == 8
        assert c.status == "ok"
        assert "test_bot" in c.message
    finally:
        httpx.get = real_get  # type: ignore[assignment]


def test_doctor_launchd_telegram_gating_via_settings(monkeypatch):
    """SC3: _check_launchd_jobs's telegram_configured flag reads from Settings."""
    import subprocess as _sp

    def fake_run(*a, **kw):
        class R:
            returncode = 0
            stdout = b"state = running"

        return R()

    monkeypatch.setattr(_sp, "run", fake_run)

    from cmc.cli.doctor import _check_launchd_jobs
    from cmc.config.settings import Settings

    # Token unset → telegram daemons skipped silently
    s = Settings(_env_file=None, telegram_bot_token=None)
    c = _check_launchd_jobs(settings=s)
    assert c.id == 7
    # com.cmc.telegram-* labels should NOT appear in c.message when telegram disabled
    assert "telegram-handler" not in c.message
    assert "telegram-notifier" not in c.message


def test_doctor_run_checks_returns_fourteen() -> None:
    """Phase 13 Plan 05 expanded doctor from 8 → 14 checks (added #9-14:
    pricing freshness, unpriced tokens, pricing.json hash drift, session_id
    NULL detector, unmapped otel models, OTEL_LOG_TOOL_DETAILS env var).
    """
    from cmc.cli.doctor import run_checks

    results = run_checks()
    assert len(results) == 14
    assert {c.id for c in results} == {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14}


def test_doctor_render_includes_ansi_colors() -> None:
    from cmc.cli.doctor import Check, _render

    ok = _render(Check(1, "lab", "ok", "msg"))
    warn = _render(Check(2, "lab", "warn", "msg", hint="do x"))
    fail = _render(Check(3, "lab", "fail", "msg", hint="do y"))
    # Green check for ok
    assert "\033[32m" in ok
    # Yellow for warn + hint rendered
    assert "\033[33m" in warn
    assert "Hint: do x" in warn
    # Red for fail + hint rendered
    assert "\033[31m" in fail
    assert "Hint: do y" in fail
    # Hint NOT rendered for ok status
    assert "Hint" not in ok


# =========================================================================
# install.sh + cmc shim
# =========================================================================


def _repo_root() -> Path:
    """backend/tests/test_telegram_setup.py -> repo root (parents[2])."""
    return Path(__file__).resolve().parents[2]


def test_install_sh_dry_run_succeeds(tmp_path) -> None:
    import subprocess

    script = _repo_root() / "scripts" / "install.sh"
    assert script.exists()
    assert os.access(script, os.X_OK)
    res = subprocess.run(
        ["bash", str(script), "--dry-run", f"--prefix={tmp_path}/cc"],
        capture_output=True,
        timeout=60,
    )
    assert res.returncode == 0, res.stderr.decode()
    out = res.stdout.decode()
    assert "DRY-RUN" in out
    assert "Python:" in out
    # No actual files written under tmp_path/cc
    assert not (tmp_path / "cc").exists()


def test_install_sh_unknown_arg_exits_2(tmp_path) -> None:
    import subprocess

    script = _repo_root() / "scripts" / "install.sh"
    res = subprocess.run(
        ["bash", str(script), "--bogus-flag"],
        capture_output=True,
        timeout=10,
    )
    assert res.returncode == 2


def test_cc_shim_help_lists_subcommands() -> None:
    import subprocess

    cc = _repo_root() / "scripts" / "cmc"
    assert cc.exists()
    assert os.access(cc, os.X_OK)
    # CMC_HOME points at repo so shim doesn't try to find the install dir
    env = {**os.environ, "CMC_HOME": str(_repo_root())}
    res = subprocess.run(
        [str(cc), "help"], capture_output=True, env=env, timeout=10
    )
    assert res.returncode == 0, res.stderr.decode()
    out = res.stdout.decode()
    for sub in (
        "start",
        "stop",
        "restart",
        "status",
        "doctor",
        "logs",
        "sync",
        "setup",
    ):
        assert sub in out, f"subcommand {sub!r} missing from help"


def test_cc_shim_unknown_subcommand_exits_2() -> None:
    import subprocess

    cc = _repo_root() / "scripts" / "cmc"
    env = {**os.environ, "CMC_HOME": str(_repo_root())}
    res = subprocess.run(
        [str(cc), "nonsense"], capture_output=True, env=env, timeout=5
    )
    assert res.returncode == 2


def test_cc_shim_setup_without_arg_exits_2() -> None:
    """`cmc setup` with no sub-arg should print Usage + exit 2."""
    import subprocess

    cc = _repo_root() / "scripts" / "cmc"
    env = {**os.environ, "CMC_HOME": str(_repo_root())}
    res = subprocess.run(
        [str(cc), "setup"], capture_output=True, env=env, timeout=10
    )
    assert res.returncode == 2
    assert "otel" in res.stderr.decode() or "otel" in res.stdout.decode()


def test_start_sh_and_stop_sh_executable() -> None:
    """SETUP-03 artifact contract: start.sh + stop.sh exist and are +x."""
    for name in ("start.sh", "stop.sh"):
        p = _repo_root() / "scripts" / name
        assert p.exists(), f"{name} missing"
        assert os.access(p, os.X_OK), f"{name} not executable"
        text = p.read_text()
        # All 4 daemon labels must appear in both scripts
        for label in (
            "com.cmc.server",
            "com.cmc.dispatcher",
            "com.cmc.telegram-notifier",
            "com.cmc.telegram-handler",
        ):
            assert label in text, f"{name} missing label {label}"
