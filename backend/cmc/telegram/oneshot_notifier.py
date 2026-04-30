"""TELE-02 launchd entry point for the notifier daemon.

StartInterval=30 in com.cmc.telegram-notifier.plist (rendered by
cmc.telegram.plist_render); this script spawns, runs ONE cycle, exits.

Crash semantics: launchd respawns next tick; notification_log is the
dedup truth so no double-sends across restarts.

Pattern parity: shape mirrors cmc.dispatcher.oneshot and
cmc.telegram.oneshot_handler — per-tick engine + sessionmaker
construction so each launchd spawn is independent.
"""

import asyncio
import logging
import sys

from cmc.config import load_settings
from cmc.db import create_engine_for_settings, make_sessionmaker
from cmc.telegram.notifier import run_one_cycle


async def _amain() -> int:
    """Run one notifier cycle. Returns 0 on success, 1 on uncaught exception.

    Configure logging early; fall back to basicConfig on error so launchd
    still gets stderr output (mirrors oneshot_handler).
    """
    try:
        from cmc.core.logging import configure_logging

        settings = load_settings()
        configure_logging(settings)
    except Exception:
        logging.basicConfig(level=logging.INFO)
        settings = load_settings()
    log = logging.getLogger(__name__)
    engine = create_engine_for_settings(settings)
    sessions = make_sessionmaker(engine)
    try:
        count = await run_one_cycle(sessions, settings)
        log.info("oneshot_notifier.complete", extra={"sent": count})
        return 0
    except Exception:
        log.exception("oneshot_notifier.cycle_failed")
        return 1
    finally:
        await engine.dispose()


def main() -> None:
    sys.exit(asyncio.run(_amain()))


if __name__ == "__main__":
    main()
