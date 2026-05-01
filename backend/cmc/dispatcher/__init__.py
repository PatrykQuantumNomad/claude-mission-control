"""Mission Control dispatcher.

Public API: `run_one_cycle` — invoked by `python -m cmc.dispatcher.oneshot`
under launchd. The dispatcher handles classic runs, streaming runs, and
fan-out scheduling.
"""
from cmc.dispatcher.heartbeat import run_one_cycle

__all__ = ["run_one_cycle"]
