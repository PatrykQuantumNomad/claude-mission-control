"""Phase-4 stub for `python -m cmc.dispatcher.oneshot` (TASK-07 trigger).

Phase 8 will replace this with the real one-shot heartbeat. Phase 4 ships a
no-op so cmc.tasks.spawn.spawn_dispatcher_oneshot has a real module to load.
"""
from __future__ import annotations

import sys


def main() -> int:
    sys.stdout.write("cmc.dispatcher.oneshot: Phase-4 stub (Phase 8 replaces)\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
