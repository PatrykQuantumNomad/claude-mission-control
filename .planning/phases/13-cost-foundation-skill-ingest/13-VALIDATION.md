# Phase 13 — Validation Traceability

**Phase:** 13-cost-foundation-skill-ingest
**Generated:** 2026-05-03
**Source plans:** 13-01..13-06

This file collapses the test-to-requirement traceability from each plan's `<done>` and the consolidated table in `13-06-PLAN.md` Task 2 into a single auditable surface for `gsd-verifier` and `gsd-plan-checker`. Every requirement in `REQUIREMENTS.md` for Phase 13 has at least one passing automated test.

## Coverage Matrix

| Requirement | Plan | Task | Test file:function | Verification mechanism |
|---|---|---|---|---|
| **ANLY-01** — `compute_cost(model, input, output, cache_read, cache_create_5m, cache_create_1h) -> Decimal` returns Decimal with no float drift | 13-01 | Task 2 | `backend/tests/test_pricing.py::test_compute_cost_decimal_no_float_drift` | Unit — exact Decimal equality on three vector cases (1M input, 1.5M output, all-five-kinds combined) |
| **ANLY-01** — REPL importable without app boot | 13-06 | Task 2 | `backend/tests/test_phase13_e2e.py::test_phase13_repl_import_compute_cost` | Unit — direct import + invocation, asserts `Decimal("5")` |
| **ANLY-01** — Lookup miss returns `Decimal(0)` and increments `unpriced_tokens[(model, kind)]` | 13-01 | Task 2 | `backend/tests/test_pricing.py::test_compute_cost_unpriced_returns_zero_and_counts` | Unit — verifies counter side-effect for non-zero kinds, no entry for zero-token kinds |
| **ANLY-02** — All 5 model SKUs round-trip from `data/pricing.json` into `pricing` rows; idempotent re-seed | 13-06 | Task 1 | `backend/tests/test_pricing.py::test_seed_loader_round_trip` | Async integration — `load_seed()` against ephemeral DB; asserts 5 distinct models, idempotency on second run |
| **ANLY-03** — Adding a row backdates `effective_until` of the prior currently-effective row (window self-correction) | 13-06 | Task 1 | `backend/tests/test_pricing.py::test_pricing_window_self_correcting` | Async integration — manual insertion of a later row, exercise of the close UPDATE, assert prior `effective_until` set |
| **ANLY-04** — `GET /api/cost/summary?range=7d` returns Decimal-as-string JSON | 13-04 | Task 2 | `backend/tests/test_cost_router.py::test_cost_summary_returns_decimal_strings` | Integration — HTTP GET via async client; asserts `isinstance(payload["total_usd"], str)` |
| **ANLY-04** — Range param validation: 1d / 7d / 14d / 30d only; else 422 | 13-04 | Task 2 | `backend/tests/test_cost_router.py::test_cost_summary_range_invalid_returns_422` | Integration — HTTP 422 assertion on `?range=2y` |
| **ANLY-04** — `summary.total_usd == breakdown(dim=model).total_usd` (no rounding drift) | 13-04 | Task 2 | `backend/tests/test_cost_router.py::test_breakdown_sums_to_summary` | Integration — Decimal equality across endpoints |
| **ANLY-04** — `dim` validation: model / skill / project only; else 422 | 13-04 | Task 2 | `backend/tests/test_cost_router.py::test_breakdown_dim_invalid_returns_422` | Integration — HTTP 422 |
| **ANLY-04** — End-to-end cost computation: lifespan seed → /v1/logs → /api/cost/summary returns non-zero with `rates_as_of` populated | 13-06 | Task 2 | `backend/tests/test_phase13_e2e.py::test_phase13_full_trace` | E2E — full trace asserts `Decimal(payload["total_usd"]) == Decimal("35")` and `rates_as_of is not None` |
| **ANLY-05** — Doctor warns when newest pricing row >30 days old | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_pricing_freshness_warn_at_30d` | Unit — bootstrap DB with 45-day-old `effective_from`, assert `Check.status == "warn"` |
| **ANLY-05** — Doctor `ok` when pricing recent | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_pricing_freshness_ok_when_recent` | Unit — 2-day-old row, assert ok |
| **ANLY-05** — Doctor `fail` when pricing table empty | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_pricing_freshness_fail_when_empty` | Unit — empty table, assert fail (true unblocker) |
| **ANLY-05** — Doctor warns per `(model, token_kind)` when unpriced tokens detected | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_pricing_unpriced_warn` | Unit — `token_usage` row for model NOT in `pricing`, assert warn message contains the model name |
| **ANLY-05** — Doctor `ok` when all observed models are priced | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_pricing_unpriced_ok_when_all_priced` | Unit — pricing + token_usage aligned, assert ok |
| **ANLY-05** — Doctor warns when on-disk `data/pricing.json` hash differs from `PricingRow.seed_hash` on the most-recent active row (drift detection) | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_pricing_json_hash_drift_warn_when_mismatch` | Unit — DB row carries stale `seed_hash`, on-disk hash differs, assert warn |
| **ANLY-05** — Doctor `ok` when on-disk hash matches DB seed_hash | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_pricing_json_hash_drift_ok_when_match` | Unit — bootstrapped DB row uses `pricing_json_hash()` of the tmp file, assert ok |
| **ANLY-05** — Doctor `fail` when `data/pricing.json` missing | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_pricing_json_hash_drift_fail_when_missing` | Unit — monkeypatch path to non-existent file, assert fail |
| **ANLY-05** — Doctor warns when otel_events models unmapped to pricing | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_unmapped_otel_models_ok_empty` | Unit — empty otel_events, assert ok (warn branch covered by integration smoke) |
| **ANLY-05** — Doctor warns when `OTEL_LOG_TOOL_DETAILS` env var unset | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_otel_log_tool_details_warn_when_unset` | Unit — `monkeypatch.delenv`, assert warn |
| **ANLY-05** — Doctor `ok` when `OTEL_LOG_TOOL_DETAILS=1` | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_otel_log_tool_details_ok_when_set` | Unit — `monkeypatch.setenv("OTEL_LOG_TOOL_DETAILS", "1")`, assert ok |
| **ANLY-05** — `GET /api/pricing/freshness` exposes `rates_as_of`, `is_stale`, `on_disk_hash`, `model_count` | 13-04 | Task 2 | `backend/tests/test_cost_router.py::test_pricing_freshness_returns_hash_and_age` | Integration — HTTP GET, assert all 4 fields present, `model_count == 5` |
| **INGST-11** — `claude_code.skill_activated` events land `attrs_skill_name` via `/v1/logs` | 13-03 | Task 1 | `backend/tests/test_ingest.py::test_otlp_logs_extracts_skill_name` | Integration — synthetic OTLP body posted to `/v1/logs`, assert `OtelEvent.attrs_skill_name == "data:analyze"` |
| **INGST-11** — Pure-function extractor follows `extract_mcp_attrs` pattern; works against real OTLP attribute list shape | 13-03 | Task 1 | `backend/tests/test_otel_parser.py::test_extract_skill_attr_real_otlp_shape` (+ 3 fallback variants + None case) | Unit — exercises real `iter_attrs` path so future regression of `iter_attrs` surfaces here |
| **INGST-11** — End-to-end trace: skill_activated body → DB row with `attrs_skill_name` populated | 13-06 | Task 2 | `backend/tests/test_phase13_e2e.py::test_phase13_full_trace` (steps 2-3) | E2E — assert `OtelEvent.attrs_skill_name` row present after POST |
| **INGST-12** — Single Alembic migration `0002_v1_1_alerts_and_skills` upgrades cleanly from `0001_initial` | 13-02 | Task 2 | `backend/tests/test_migrations.py::test_0002_upgrade_from_0001` | Integration — `alembic upgrade` against ephemeral DB, assert new tables + columns + indexes |
| **INGST-12** — 0002 downgrades cleanly back to `0001_initial` | 13-02 | Task 2 | `backend/tests/test_migrations.py::test_0002_downgrade_to_0001` | Integration — `alembic downgrade`, assert tables/columns removed |
| **INGST-12** — BUG-B backfill (`session.id` re-extraction) populates NULL `session_id` rows | 13-02 | Task 2 | `backend/tests/test_migrations.py::test_0002_bug_b_backfill` | Integration — synthetic body with `session.id` in `body.record.attributes`, assert backfilled value |
| **INGST-13** — `(session_id, otel_event_id)` UNIQUE absorbs duplicate re-posts (idempotent ingest) | 13-03 | Task 1 | `backend/tests/test_ingest.py::test_otlp_logs_idempotent_session_seq` | Integration — POST same body twice, assert exactly 1 row |
| **INGST-13** — `event.sequence` extractor handles intValue + string-intValue (OTLP int64 wire safety) | 13-03 | Task 1 | `backend/tests/test_otel_parser.py::test_extract_event_sequence_int_value`, `::test_extract_event_sequence_string_intvalue_wire_safety`, `::test_extract_event_sequence_returns_none_when_absent` | Unit — three cases through real `iter_attrs` path |
| **INGST-13** — End-to-end idempotency: re-post produces a single row | 13-06 | Task 2 | `backend/tests/test_phase13_e2e.py::test_phase13_full_trace` (step 4) | E2E — `len(otel_rows) == 1` after two posts |
| **BUG-B** prospective fix — `/v1/logs` reads `session.id` (dotted) first | 13-03 | Task 1 | `backend/tests/test_ingest.py::test_otlp_logs_session_id_dotted_key` | Integration — body uses `session.id`, assert row.session_id populated |
| **BUG-B** regression detector | 13-05 | Task 2 | `backend/tests/test_doctor.py::test_session_id_null_warn` | Unit — synthetic NULL session_id row, assert warn message contains "NULL session_id" |
| **Cache TTL split (CONTEXT.md decision)** — JSONL `cache_creation.ephemeral_5m_input_tokens` + `_1h_input_tokens` round-trip into session/bucket dicts | 13-03 | Task 2 | `backend/tests/test_ingest.py::test_jsonl_parser_cache_ttl_split` | Unit — synthetic JSONL with split block, assert `_5m=200`, `_1h=300`, aggregate=500 |
| **Cache TTL split legacy fallback (CONTEXT.md decision)** — when split block absent, aggregate lands entirely in `_1h` | 13-03 | Task 2 | `backend/tests/test_ingest.py::test_jsonl_parser_cache_legacy_aggregate_falls_into_1h` | Unit — JSONL with only aggregate `cache_creation_input_tokens`, assert `_5m=0`, `_1h=1000` |

## Verification Mechanism Legend

- **Unit** — direct call against pure function or single class with no DB / no FastAPI client.
- **Async integration** — uses `pytest-asyncio` with the project's `db_session` fixture; exercises ORM + SQL but not HTTP.
- **Integration** — uses `pytest-asyncio` + `httpx.AsyncClient` against the FastAPI app via `TestClient`-equivalent.
- **E2E** — single `test_phase13_full_trace` that traces the full Wave 1+2+3 path: lifespan seed → POST `/v1/logs` → DB introspection → GET `/api/cost/summary` → GET `/api/cost/breakdown`.

## Notes

- **Phase 14 deferred** — `dim=skill` attribution is session-scoped in Phase 13 (see Plan 04 must_haves disclosure). Per-request scoping via SPIKE.md LOCK-9 JOIN is owned by Phase 14 and out of Phase 13's traceability table.
- **No UI tests** — Phase 13 is backend-only per the CONTEXT.md `<domain>` boundary. UI panels and the "Rates as of" caption ship in Phase 14.
- **`gsd-verifier` invariant** — every row in this matrix points to a test that the orchestrator can execute via `pytest <file>::<function>` and observe a green pass.
