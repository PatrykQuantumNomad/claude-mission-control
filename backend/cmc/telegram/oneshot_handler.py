"""TELE-05 launchd entry: long-running daemon (KeepAlive=true plist).

Spawned once by launchd; calls asyncio.run(run_handler_loop(...)) which
blocks indefinitely on api.get_updates long-poll. If the loop ever
returns (or raises), the process exits and launchd's KeepAlive=true
respawns it (throttled by ThrottleInterval to prevent thrash).

Mirrors cmc.telegram.oneshot_notifier in shape, but the inner call
long-runs instead of single-cycle.
"""

import asyncio
import logging
import sys

from cmc.config import load_settings
from cmc.db import create_engine_for_settings, make_sessionmaker
from cmc.telegram.handler import run_handler_loop


async def _amain() -> int:
    # Configure logging early; fall back to basicConfig on error so
    # launchd still gets at least stderr output.
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
        count = await run_handler_loop(sessions, settings)
        log.info("oneshot_handler.exit", extra={"processed": count})
        return 0
    except Exception:
        log.exception("oneshot_handler.crash")
        return 1
    finally:
        await engine.dispose()


def main() -> None:
    sys.exit(asyncio.run(_amain()))


if __name__ == "__main__":
    main()
