"""Zero-LLM 14-check health report.

Each check returns a Check dataclass with one of three statuses:
- 'ok'   — green check, no action needed
- 'warn' — yellow check, optional action (does NOT fail the run)
- 'fail' — red check, fix required (process exits 1)

The 14 checks:
  1. Python ≥3.12
  2. claude on PATH (subprocess.run('claude --version'))
  3. ~/.claude/settings.json exists + parses as JSON
  4. ~/.claude/projects/ exists + has ≥1 subdir
  5. Port 8765 free OR owned by our server (via psutil.net_connections)
  6. GET http://127.0.0.1:8765/api/health → 200 within 2s
  7. launchctl print gui/$UID/com.cmc.{server,dispatcher} → state=running
  8. Telegram: TELEGRAM_BOT_TOKEN env set → call getMe → 200
     (skip-with-✓ if not configured — telegram is optional)
  9. Pricing freshness (Phase 13 ANLY-05): newest pricing.effective_from
     within 30 days; warn if older; fail if pricing table empty.
 10. Unpriced tokens (Phase 13 ANLY-05): warn per (model) when token_usage
     references a model with no pricing row.
 11. pricing.json hash drift (Phase 13 ANLY-05 + CONTEXT.md item #6):
     warn when on-disk SHA-256 differs from PricingRow.seed_hash on the
     highest-effective_from currently-active row; fail if pricing.json
     missing or invalid JSON.
 12. session_id NULL count (Phase 13 BUG-B regression detector): warn if
     otel_events has any NULL session_id rows after Phase 13 backfill.
 13. otel models priced (Phase 13 ANLY-05): warn if otel_events carries
     models not in pricing for the last 7 days.
 14. OTEL_LOG_TOOL_DETAILS=1 (POLI-01 carry-forward): warn when env var
     unset — without it, MCP tool_parameters and skill attribute details
     are not emitted by Claude Code.

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


# ---------------------------------------------------------------- 9. pricing freshness


def _check_pricing_freshness(*, settings: Settings | None = None) -> Check:
    """Phase 13 ANLY-05: warn when newest pricing row is >30 days old.

    Status:
      - 'ok'   if newest effective_from is within 30 days
      - 'warn' if older than 30 days (operational drift, NOT a CI failure)
      - 'fail' if pricing table empty (true unblocker — auto-seed never ran)
    """
    import sqlite3
    from datetime import date, datetime

    if settings is None:
        settings = load_settings()
    try:
        conn = sqlite3.connect(str(settings.db_path))
        row = conn.execute("SELECT MAX(effective_from) FROM pricing").fetchone()
        conn.close()
    except sqlite3.OperationalError as exc:
        return Check(9, "pricing freshness", "warn", f"DB error: {exc}")
    latest = row[0] if row else None
    if not latest:
        return Check(
            9,
            "pricing freshness",
            "fail",
            "pricing table empty",
            "Run `cmc start` (auto-seeds from data/pricing.json on lifespan startup)",
        )
    try:
        d = datetime.fromisoformat(latest).date()
    except (TypeError, ValueError):
        return Check(
            9, "pricing freshness", "warn", f"unparseable effective_from: {latest!r}"
        )
    age = (date.today() - d).days
    if age > 30:
        return Check(
            9,
            "pricing freshness",
            "warn",
            f"newest rate is {age}d old (>30d threshold)",
            "Refresh data/pricing.json from https://platform.claude.com/docs/en/about-claude/pricing",
        )
    return Check(9, "pricing freshness", "ok", f"newest rate is {age}d old")


# ---------------------------------------------------------------- 10. unpriced tokens


def _check_unpriced_tokens(*, settings: Settings | None = None) -> Check:
    """Phase 13 ANLY-05: warn per (model) when unpriced tokens detected.

    Two surfaces:
      - In-process counter: cmc.pricing.unpriced_tokens (lifetime per process)
      - DB scan: token_usage rows with model NOT IN pricing.model

    The DB scan is the durable surface; the counter only shows what's hit since
    last process boot. Doctor uses the DB scan for cross-restart accuracy.
    """
    import sqlite3

    if settings is None:
        settings = load_settings()
    try:
        conn = sqlite3.connect(str(settings.db_path))
        unmapped = conn.execute(
            """
            SELECT model, SUM(tokens_input + tokens_output + tokens_cache_read +
                              tokens_cache_create_5m + tokens_cache_create_1h) AS unpriced
            FROM token_usage
            WHERE model NOT IN (SELECT DISTINCT model FROM pricing)
              AND model IS NOT NULL
            GROUP BY model
            """
        ).fetchall()
        conn.close()
    except sqlite3.OperationalError as exc:
        return Check(10, "unpriced tokens", "warn", f"DB error: {exc}")
    if not unmapped:
        return Check(10, "unpriced tokens", "ok", "all observed models priced")
    summary = ", ".join(f"{m}={n}" for m, n in unmapped[:5])
    if len(unmapped) > 5:
        summary += f", +{len(unmapped) - 5} more"
    return Check(
        10,
        "unpriced tokens",
        "warn",
        f"{len(unmapped)} unpriced model(s): {summary}",
        "Add missing model rates to data/pricing.json and restart the server",
    )


# ---------------------------------------------------------------- 11. pricing.json hash drift


def _check_pricing_json_hash_drift(*, settings: Settings | None = None) -> Check:
    """Phase 13 ANLY-05 + CONTEXT.md item #6: warn when on-disk
    data/pricing.json hash differs from the seed_hash recorded on the
    highest-effective_from currently-active PricingRow.

    Naming note: the function is named for what it actually checks (drift),
    not just parseability. Three branches:
      - 'fail' if data/pricing.json missing or invalid JSON (true unblocker —
        the auto-seed cannot run)
      - 'warn' if on-disk sha256 != seed_hash on the highest-effective_from
        currently-active row (operational drift — user edited pricing.json
        without restarting, or seed_hash was never recorded by an old
        load_seed run)
      - 'ok'   if on-disk hash matches the most-recent active row's seed_hash

    Reads PricingRow.seed_hash (added in Plan 01 model + Plan 02 migration).
    Uses cmc.pricing.pricing_json_hash() so the hashing function stays in one place.
    """
    import sqlite3

    from cmc.pricing import pricing_json_hash, pricing_json_path

    if settings is None:
        settings = load_settings()

    p = pricing_json_path()
    if not p.exists():
        return Check(
            11,
            "pricing.json hash drift",
            "fail",
            f"missing at {p}",
            "Restore from git or run `git checkout HEAD -- data/pricing.json`",
        )
    try:
        # Validate JSON shape before hashing — corrupt JSON is a fail, not drift.
        json.loads(p.read_text())
    except json.JSONDecodeError as exc:
        return Check(11, "pricing.json hash drift", "fail", f"invalid JSON: {exc}")

    on_disk = pricing_json_hash()

    try:
        conn = sqlite3.connect(str(settings.db_path))
        # Highest-effective_from currently-active row across ALL models — drift
        # is a per-file concern, not per-model. If multiple models were seeded
        # from the same JSON they share the same seed_hash by construction.
        row = conn.execute(
            """
            SELECT seed_hash
            FROM pricing
            WHERE effective_until IS NULL
            ORDER BY effective_from DESC
            LIMIT 1
            """
        ).fetchone()
        conn.close()
    except sqlite3.OperationalError as exc:
        return Check(11, "pricing.json hash drift", "warn", f"DB error: {exc}")

    if not row or not row[0]:
        # pricing table is empty OR seed_hash was never populated. Check #9
        # (pricing freshness) reports this as a fail; here we just say "skipped".
        return Check(
            11,
            "pricing.json hash drift",
            "warn",
            "no seed_hash in DB (pricing table empty or pre-Phase-13 row)",
            "Run `cmc start` to trigger lifespan auto-seed",
        )

    db_hash = row[0]
    if db_hash == on_disk:
        return Check(
            11,
            "pricing.json hash drift",
            "ok",
            f"on-disk hash matches DB ({on_disk[:8]}…)",
        )
    return Check(
        11,
        "pricing.json hash drift",
        "warn",
        f"on-disk={on_disk[:8]}… db={db_hash[:8]}… — pricing.json edited since last seed",
        "Restart the server (`cmc restart`) to trigger lifespan auto-seed of the new rates",
    )


# ------------------------------------------------------ 12. session_id NULL detector


def _check_session_id_null_count(*, settings: Settings | None = None) -> Check:
    """Phase 13 BUG-B regression detector: warn if otel_events.session_id NULL count > 0
    AFTER Plan 02 migration ran (which backfilled the historical NULL rows).

    Any NEW NULL is either:
      (a) BUG-B regression — ingest.py:103 dotted-key fix was reverted, OR
      (b) legitimate orphan — OTLP body lacked any session.id attribute (rare).

    Either way, a non-zero count is worth surfacing.
    """
    import sqlite3

    if settings is None:
        settings = load_settings()
    try:
        conn = sqlite3.connect(str(settings.db_path))
        n = conn.execute(
            "SELECT COUNT(*) FROM otel_events WHERE session_id IS NULL"
        ).fetchone()[0]
        conn.close()
    except sqlite3.OperationalError as exc:
        return Check(12, "session_id NULL count", "warn", f"DB error: {exc}")
    if n == 0:
        return Check(12, "session_id NULL count", "ok", "0 rows with NULL session_id")
    return Check(
        12,
        "session_id NULL count",
        "warn",
        f"{n} otel_events row(s) have NULL session_id",
        "Either BUG-B regression (cmc/api/routes/ingest.py must read dotted "
        "`session.id`) or events arrived sans session — inspect via SQL",
    )


# ------------------------------------------------- 13. unmapped models in otel_events


def _check_unmapped_otel_models(*, settings: Settings | None = None) -> Check:
    """Phase 13 ANLY-05: warn if otel_events carries models not in pricing.

    Checks api_request body's `model` attribute (extracted via json_each) for
    rows in the last 7 days that don't match any pricing.model.
    """
    import sqlite3

    if settings is None:
        settings = load_settings()
    try:
        conn = sqlite3.connect(str(settings.db_path))
        unmapped = conn.execute(
            """
            WITH otel_models AS (
                SELECT DISTINCT
                    (SELECT json_extract(value, '$.value.stringValue')
                       FROM json_each(json_extract(body, '$.record.attributes'))
                      WHERE json_extract(value, '$.key') = 'model'
                      LIMIT 1) AS model
                FROM otel_events
                WHERE event_name = 'api_request'
                  AND ts >= datetime('now', '-7 days')
            )
            SELECT model FROM otel_models
            WHERE model IS NOT NULL
              AND model NOT IN (SELECT DISTINCT model FROM pricing)
            """
        ).fetchall()
        conn.close()
    except sqlite3.OperationalError as exc:
        return Check(13, "otel models priced", "warn", f"DB error: {exc}")
    if not unmapped:
        return Check(13, "otel models priced", "ok", "all otel_events models are priced")
    sample = ", ".join((m[0] or "<null>") for m in unmapped[:3])
    return Check(
        13,
        "otel models priced",
        "warn",
        f"{len(unmapped)} unmapped model(s) in otel_events: {sample}",
        "Add to data/pricing.json so cost endpoints attribute these tokens",
    )


# ---------------------------------------------------------------- 14. OTEL_LOG_TOOL_DETAILS env var


def _check_otel_log_tool_details() -> Check:
    """POLI-01 (lifted forward to Phase 13 per CONTEXT.md): warn when
    OTEL_LOG_TOOL_DETAILS env var unset.

    Without this env var, Claude Code does NOT emit MCP tool_parameters /
    plugin / marketplace skill attribute details. Skill ingest still works via
    the bare `skill_name` attribute, but per-skill richness suffers.

    Reads from process env (the spawned `claude` session inherits parent
    env), NOT from settings — this is a Claude-Code-side knob, not a Mission
    Control setting.
    """
    val = os.environ.get("OTEL_LOG_TOOL_DETAILS", "")
    if val.strip() in ("1", "true", "TRUE", "yes"):
        return Check(14, "OTEL_LOG_TOOL_DETAILS=1", "ok", f"set to {val!r}")
    return Check(
        14,
        "OTEL_LOG_TOOL_DETAILS=1",
        "warn",
        f"unset (current value={val!r})",
        "Add `export OTEL_LOG_TOOL_DETAILS=1` to your shell profile to capture "
        "MCP tool details + plugin/marketplace skill attrs",
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
    _check_pricing_freshness,        # 9  Phase 13 ANLY-05
    _check_unpriced_tokens,          # 10 Phase 13 ANLY-05
    _check_pricing_json_hash_drift,  # 11 Phase 13 ANLY-05 + CONTEXT.md item #6 hash drift
    _check_session_id_null_count,    # 12 Phase 13 BUG-B regression detector
    _check_unmapped_otel_models,     # 13 Phase 13 ANLY-05
    _check_otel_log_tool_details,    # 14 Phase 13 POLI-01 carry-forward
]


def run_checks() -> list[Check]:
    """Run all 14 checks sequentially. Returns the resulting Check list.

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
