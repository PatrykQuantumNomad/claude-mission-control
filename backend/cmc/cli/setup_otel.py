"""SETUP-05: atomic merge of 6 OTEL env keys into ~/.claude/settings.json.

Locked keys per Plan 09-01 frontmatter Q3 (six keys; OTEL_LOG_USER_PROMPTS
intentionally dropped — defaults to 0 anyway).

Pitfall P8 (atomic write): the temp file lives in the SAME parent directory
as the final destination so `os.replace` is a same-filesystem rename and
therefore atomic. Cross-FS rename via os.replace is NOT atomic on macOS.

Idempotency contract: never overwrite a pre-existing key inside `env`. The
user may have explicitly opted out of telemetry by setting
CLAUDE_CODE_ENABLE_TELEMETRY=0 — preserve that. Only ADD missing keys.

Rollback safety: when the settings file already exists we copy it to a
timestamped `.bak.<unix-ts>` sibling BEFORE writing, so the user has a
restore point if the merge produces unexpected output.

Exposed as `python -m cmc.cli.setup_otel` and via the scripts/setup_otel.py
shim. The `cmc setup otel` subcommand routes here.
"""

import json
import os
import shutil
import sys
import time
from pathlib import Path

OTEL_KEYS: dict[str, str] = {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:8765",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOG_TOOL_DETAILS": "1",
}


def merge_otel_env(settings_path: Path) -> tuple[Path | None, list[str]]:
    """Idempotent merge of OTEL keys into the `env` block of a settings JSON.

    Args:
        settings_path: target file (typically ~/.claude/settings.json). May
                       not exist yet — will be created. Parent directory is
                       created if missing.

    Returns:
        Tuple `(backup_path, keys_added)`:
        - backup_path: Path to the timestamped .bak file when an existing
          settings file was backed up, or None when no pre-existing file.
        - keys_added: list of OTEL keys that were ADDED (existing keys are
          never overwritten so they will not appear here).

    Raises:
        SystemExit(1): when the existing settings file is invalid JSON. The
        backup is preserved so the user can manually repair.
    """
    settings_path.parent.mkdir(parents=True, exist_ok=True)

    backup: Path | None = None
    if settings_path.exists():
        backup = settings_path.with_name(
            settings_path.name + f".bak.{int(time.time())}"
        )
        shutil.copy2(settings_path, backup)

    try:
        data = (
            json.loads(settings_path.read_text())
            if settings_path.exists()
            else {}
        )
    except json.JSONDecodeError as exc:
        print(
            f"\u2717 {settings_path} is invalid JSON: {exc}; aborting"
            f" (backup saved at {backup}).",
            file=sys.stderr,
        )
        sys.exit(1)

    env = data.setdefault("env", {})
    added: list[str] = []
    for k, v in OTEL_KEYS.items():
        if k not in env:
            env[k] = v
            added.append(k)

    # Pitfall P8 — same-dir tmp file ensures atomic rename via os.replace.
    tmp = settings_path.with_name(settings_path.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, settings_path)

    return backup, added


def main() -> None:
    settings_path = Path.home() / ".claude" / "settings.json"
    backup, added = merge_otel_env(settings_path)
    if added:
        print(
            f"\u2713 Added {len(added)} OTEL key(s) to {settings_path}: "
            f"{', '.join(added)}"
        )
    else:
        print(
            f"\u2713 All {len(OTEL_KEYS)} OTEL keys already present in "
            f"{settings_path} (no changes)."
        )
    if backup:
        print(f"  Backup at {backup}")


if __name__ == "__main__":
    main()
