"""Mission Control dispatcher (Phase 8).

Public API: `run_one_cycle` — invoked by `python -m cmc.dispatcher.oneshot`
under launchd. Plans 08-02..04 add run_classic / run_stream / fan-out wiring.

Phase 4 left a stub at `cmc.dispatcher.oneshot:main`; Plan 08-04 swaps that
stub to call `asyncio.run(run_one_cycle())`.
"""
from cmc.dispatcher.heartbeat import run_one_cycle

__all__ = ["run_one_cycle"]
