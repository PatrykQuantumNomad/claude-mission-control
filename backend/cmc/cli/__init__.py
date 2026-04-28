"""Phase 9 CLI subcommands. Importable so `python -m cmc.cli.<sub>` works.

Modules:
  - setup_telegram (TELE-01) — interactive BotFather wizard
  - setup_otel     (Plan 09-04) — atomic OTEL settings.json merge
  - doctor         (Plan 09-04) — 8-check health report

Each subcommand exposes a `main()` callable that calls sys.exit(asyncio.run(_amain()))
so they can also be invoked as `python -m cmc.cli.setup_telegram` directly.
"""
