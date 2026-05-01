"""CLI subcommands. Importable so `python -m cmc.cli.<sub>` works.

Modules:
  - setup_telegram — interactive BotFather wizard
  - setup_otel     — atomic OTEL settings.json merge
  - doctor         — health report

Each subcommand exposes a `main()` callable that calls sys.exit(asyncio.run(_amain()))
so they can also be invoked as `python -m cmc.cli.setup_telegram` directly.
"""
