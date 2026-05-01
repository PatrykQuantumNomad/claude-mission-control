"""Dispatcher entry point: `python -m cmc.dispatcher.oneshot`.

Invoked by launchd every 120s or on-demand via TASK-07's subprocess.Popen
trigger. Runs ONE heartbeat cycle and exits.

Exit codes:
  0 — cycle ran (possibly with no work; emergency-stop counts as 0 too).
  1 — uncaught exception during cycle setup or run; tick stamp may be missing.

run_one_cycle owns claiming work, autonomy checks, and per-task runner fan-out.
"""

import asyncio
import logging
import sys

log = logging.getLogger(__name__)


def main() -> int:
    """Run one dispatcher heartbeat. Returns int exit code (0 ok, 1 fail).

    Loads Settings BEFORE the try/except so a settings-load failure surfaces
    with the pretty pydantic-settings message (see cmc.config._render_pretty).
    """
    from cmc.config import load_settings
    from cmc.core.logging import configure_logging

    settings = load_settings()
    configure_logging(settings)
    try:
        # Late import keeps `python -m cmc.dispatcher.oneshot --help`-style
        # introspection cheap, and lets tests monkeypatch run_one_cycle on
        # cmc.dispatcher.heartbeat without import-time side effects here.
        from cmc.dispatcher import heartbeat as _hb

        return asyncio.run(_hb.run_one_cycle())
    except Exception as exc:
        log.exception("dispatcher.oneshot.unhandled_exception")
        sys.stderr.write(
            f"cmc.dispatcher.oneshot: unhandled error: {exc}\n"
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
