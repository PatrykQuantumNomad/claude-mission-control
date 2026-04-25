"""cmc.ingest — Phase 2 ingestion package.

Plan 02-02 lands the pure-function JSONL parser (jsonl_parser.py).
Plan 02-03 lands the OTLP/HTTP router (otel_parser.py).
Plan 02-04 lands the scheduler + repository.

Submodules are imported lazily by their callers; this __init__ stays empty
on purpose so plans can land in parallel without re-exporting each other's
symbols.
"""
