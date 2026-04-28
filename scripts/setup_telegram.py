#!/usr/bin/env python3
"""Thin shim — delegates to cmc.cli.setup_telegram.main().

Allows users (and Plan 09-04's `cc setup telegram` dispatcher) to run
`python scripts/setup_telegram.py` or `./scripts/setup_telegram.py`
without remembering the module path.
"""
from cmc.cli.setup_telegram import main


if __name__ == "__main__":
    main()
