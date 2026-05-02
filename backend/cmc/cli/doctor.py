"""Zero-LLM 8-check health report.

Each check returns a Check dataclass with one of three statuses:
- 'ok'   — green check, no action needed
- 'warn' — yellow check, optional action (does NOT fail the run)
- 'fail' — red check, fix required (process exits 1)

The 8 checks:
  1. Python ≥3.12
  2. claude on PATH (subprocess.run('claude --version'))
  3. ~/.claude/settings.json exists + parses as JSON
  4. ~/.claude/projects/ exists + has ≥1 subdir
  5. Port 8765 free OR owned by our server (via psutil.net_connections)
  6. GET http://127.0.0.1:8765/api/health → 200 within 2s
  7. launchctl print gui/$UID/com.cmc.{server,dispatcher} → state=running
  8. Telegram: TELEGRAM_BOT_TOKEN env set → call getMe → 200
     (skip-with-✓ if not configured — telegram is optional)

Exit code: 0 iff zero checks have status 'fail'. Warns do NOT trigger 1.

Exposed as `python -m cmc.cli.doctor` and via the scripts/doctor.py shim.
The `cmc doctor` subcommand routes here.
"""

import inspect
import json
import os
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from cmc.config import load_settings
from cmc.config.settings import Settings

GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
RESET = "\033[0m"


@dataclass
class Check:
    id: int
    label: str
    status: str  # 'ok' | 'warn' | 'fail'
    message: str
    hint: str | None = None


# ---------------------------------------------------------------- 1. python


def _check_python() -> Check:
    v = sys.version_info
    if (v.major, v.minor) >= (3, 12):
        return Check(
            1,
            "Python \u22653.12",
            "ok",
            f"Python {v.major}.{v.minor}.{v.micro}",
        )
    return Check(
        1,
        "Python \u22653.12",
        "fail",
        f"Python {v.major}.{v.minor} < 3.12",
        "brew install python@3.13",
    )


# ---------------------------------------------------------------- 2. claude


def _check_claude_bin() -> Check:
    try:
        res = subprocess.run(
            ["claude", "--version"], capture_output=True, timeout=5
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return Check(
            2,
            "claude CLI on PATH",
            "fail",
            "claude binary not found",
            "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code",
        )
    if res.returncode != 0:
        return Check(
            2,
            "claude CLI on PATH",
            "fail",
            f"rc={res.returncode}",
            "Install Claude Code",
        )
    return Check(
        2,
        "claude CLI on PATH",
        "ok",
        res.stdout.decode("utf-8", "replace").strip() or "ok",
    )


# ---------------------------------------------------------------- 3. settings


def _check_settings_json() -> Check:
    p = Path.home() / ".claude" / "settings.json"
    if not p.exists():
        return Check(
            3,
            "~/.claude/settings.json",
            "warn",
            "missing",
            "Run `cmc setup otel`",
        )
    try:
        json.loads(p.read_text())
    except json.JSONDecodeError as e:
        return Check(3, "~/.claude/settings.json", "fail", f"invalid JSON: {e}")
    return Check(3, "~/.claude/settings.json", "ok", "valid JSON")


# ---------------------------------------------------------------- 4. projects


def _check_claude_projects() -> Check:
    p = Path.home() / ".claude" / "projects"
    if not p.exists():
        return Check(
            4,
            "~/.claude/projects/",
            "warn",
            "missing",
            "No sessions yet \u2014 run `claude` once",
        )
    subs = [d for d in p.iterdir() if d.is_dir()]
    if not subs:
        return Check(
            4, "~/.claude/projects/", "warn", "empty", "No sessions yet"
        )
    return Check(4, "~/.claude/projects/", "ok", f"{len(subs)} project(s)")


# ---------------------------------------------------------------- 5. port


def _check_port_8765() -> Check:
    try:
        import psutil  # type: ignore
    except ImportError:
        return Check(
            5,
            "Port 8765 free or owned",
            "warn",
            "psutil not installed",
        )
    try:
        conns = psutil.net_connections(kind="inet")
    except (psutil.AccessDenied, PermissionError) as exc:
        return Check(
            5,
            "Port 8765 free or owned",
            "warn",
            f"net_connections requires elevated perms: {exc}",
        )
    for c in conns:
        laddr = getattr(c, "laddr", None)
        if getattr(laddr, "port", None) == 8765 and c.status == "LISTEN":
            pid = c.pid
            if not pid:
                return Check(
                    5,
                    "Port 8765 free or owned",
                    "warn",
                    "owned by unknown pid",
                )
            try:
                proc = psutil.Process(pid)
                name = " ".join(proc.cmdline())
            except Exception:
                return Check(
                    5,
                    "Port 8765 free or owned",
                    "warn",
                    "owned, name unknown",
                )
            if "uvicorn" in name and "cmc.app.factory" in name:
                return Check(
                    5,
                    "Port 8765 free or owned",
                    "ok",
                    f"owned by our server (pid={pid})",
                )
            return Check(
                5,
                "Port 8765 free or owned",
                "fail",
                f"owned by another process (pid={pid}: {name[:80]})",
            )
    return Check(5, "Port 8765 free or owned", "ok", "free")


# ---------------------------------------------------------------- 6. /api/health


def _check_health_endpoint() -> Check:
    try:
        import httpx

        r = httpx.get("http://127.0.0.1:8765/api/health", timeout=2)
    except Exception as exc:
        return Check(6, "GET /api/health", "fail", str(exc), "Run `cmc start`")
    if r.status_code == 200:
        return Check(6, "GET /api/health", "ok", "200 OK")
    return Check(
        6, "GET /api/health", "fail", f"status {r.status_code}", "Run `cmc start`"
    )


# ---------------------------------------------------------------- 7. launchd


def _check_launchd_jobs(*, settings: Settings | None = None) -> Check:
    """Check that all 4 daemons are loaded; long-running ones must also be running.

    com.cmc.server         → KeepAlive=true   → expect state=running
    com.cmc.telegram-handler → KeepAlive=true → expect state=running
    com.cmc.dispatcher     → StartInterval=120 → expect loaded (oneshot)
    com.cmc.telegram-notifier → StartInterval=30 → expect loaded (oneshot)

    Telegram daemons are skipped silently if telegram_bot_token is unset.

    telegram_configured is read from Settings (using the CMC_ENV-selected
    env file), NOT bare os.environ, so launchd-spawned `cmc doctor`
    invocations behave consistently with interactive shell invocations.
    """
    if settings is None:
        settings = load_settings()
    uid = os.getuid()
    all_ok = True
    details: list[str] = []
    long_running = {"com.cmc.server", "com.cmc.telegram-handler"}
    oneshots = {"com.cmc.dispatcher", "com.cmc.telegram-notifier"}
    telegram_labels = {"com.cmc.telegram-handler", "com.cmc.telegram-notifier"}
    telegram_configured = bool(settings.telegram_bot_token)

    for label in long_running | oneshots:
        if label in telegram_labels and not telegram_configured:
            continue
        try:
            res = subprocess.run(
                ["launchctl", "print", f"gui/{uid}/{label}"],
                capture_output=True,
                timeout=5,
            )
            out = res.stdout.decode("utf-8", "replace")
            if res.returncode != 0:
                all_ok = False
                details.append(f"{label}=missing")
                continue
            running = "state = running" in out
            if label in long_running:
                if running:
                    details.append(f"{label}=running")
                else:
                    all_ok = False
                    details.append(f"{label}=loaded-but-not-running")
            else:
                # Oneshot: loaded is the expected resting state between ticks
                if running:
                    details.append(f"{label}=running (mid-tick)")
                else:
                    details.append(f"{label}=loaded")
        except Exception as exc:
            all_ok = False
            details.append(f"{label}={exc}")
    if all_ok:
        return Check(7, "launchd jobs running", "ok", ", ".join(details))
    return Check(
        7, "launchd jobs running", "fail", ", ".join(details), "Run `cmc start`"
    )


# ---------------------------------------------------------------- 8. telegram


def _check_telegram(*, settings: Settings | None = None) -> Check:
    """Read TELEGRAM_BOT_TOKEN via Settings so cwd does not change config source."""
    if settings is None:
        settings = load_settings()
    token = settings.telegram_bot_token
    if not token:
        return Check(
            8, "Telegram (optional)", "ok", "not configured (skipped)"
        )
    try:
        import httpx

        r = httpx.get(
            f"https://api.telegram.org/bot{token}/getMe", timeout=10
        )
    except Exception as exc:
        return Check(
            8,
            "Telegram (optional)",
            "fail",
            str(exc),
            "Re-run `cmc setup telegram`",
        )
    if r.status_code == 200:
        res = r.json().get("result", {})
        return Check(
            8,
            "Telegram (optional)",
            "ok",
            f"@{res.get('username', '?')}",
        )
    return Check(
        8,
        "Telegram (optional)",
        "fail",
        f"status {r.status_code}",
        "Re-run `cmc setup telegram`",
    )


CHECKS: list[Callable[..., Check]] = [
    _check_python,
    _check_claude_bin,
    _check_settings_json,
    _check_claude_projects,
    _check_port_8765,
    _check_health_endpoint,
    _check_launchd_jobs,
    _check_telegram,
]


def run_checks() -> list[Check]:
    """Run all 8 checks sequentially. Returns the resulting Check list.

    Settings is loaded ONCE at the top and threaded into any check whose
    signature accepts a `settings` kwarg. Legacy checks that take no parameters
    are called without modification.
    """
    settings = load_settings()
    out: list[Check] = []
    for check_fn in CHECKS:
        try:
            sig = inspect.signature(check_fn)
            if "settings" in sig.parameters:
                out.append(check_fn(settings=settings))
            else:
                out.append(check_fn())
        except Exception as exc:
            out.append(
                Check(0, getattr(check_fn, "__name__", "<unknown>"), "fail", str(exc))
            )
    return out


def _render(check: Check) -> str:
    sym = {
        "ok": f"{GREEN}[\u2713]{RESET}",
        "warn": f"{YELLOW}[\u26a0]{RESET}",
        "fail": f"{RED}[\u2717]{RESET}",
    }[check.status]
    line = f"{sym} {check.id}. {check.label}: {check.message}"
    if check.hint and check.status != "ok":
        line += f"\n    Hint: {check.hint}"
    return line


def main() -> None:
    results = run_checks()
    print("Mission Control Doctor")
    print("=" * 30)
    for c in results:
        print(_render(c))
    fails = [c for c in results if c.status == "fail"]
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
