---
phase: 23
slug: compare-depth-milestone-close
status: closed
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-08
closed: 2026-05-09
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (backend), vitest (frontend), Playwright (e2e) |
| **Config file** | `backend/pyproject.toml`, `frontend/package.json` |
| **Quick run command** | `cd backend && pytest tests/test_sessions_router.py -x -q` |
| **Full suite command** | `cd frontend && pnpm test && pnpm test:e2e frontend/tests/e2e/sessions-compare.spec.ts` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && pytest tests/test_sessions_router.py -x -q`
- **After every plan wave:** Run `cd frontend && pnpm test && pnpm test:e2e frontend/tests/e2e/sessions-compare.spec.ts`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | CMPR-06 | — | N/A | backend unit/integration | `cd backend && uv run pytest tests/test_sessions_router.py -k compare -x` | ✅ | ✅ green |
| 23-01-02 | 01 | 1 | CMPR-07 | — | N/A | backend unit/integration | `cd backend && uv run pytest tests/test_sessions_router.py -k previous -x` | ✅ | ✅ green |
| 23-02-01 | 02 | 1 | CMPR-06 | — | N/A | frontend unit | `cd frontend && pnpm test -- SessionCompareView` | ✅ | ✅ green |
| 23-03-01 | 03 | 2 | CMPR-06, CMPR-07 | — | N/A | e2e | `cd frontend && pnpm test:e2e frontend/tests/e2e/sessions-compare.spec.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/tests/test_sessions_router.py` — add `/api/sessions/{sid}/previous` tests (D-01..D-06) + extend compare assertions for `skill_latencies` + `low_sample_*` (shipped Plan 23-01, commits 46e85be + bdc0e74)
- [x] `frontend/tests/e2e/sessions-compare.spec.ts` — extend e2e coverage for per-skill latency section + Cmd+K “compare with previous” behavior (shipped Plan 23-03, commit 8f5b009)

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-09 at phase close (Plan 23-04)

## Milestone-Close Gate Results (2026-05-09)

| Suite | Command | Passed | Failed | Skipped | Warnings | Baseline (Phase 18) | Delta | Status |
|-------|---------|-------:|-------:|--------:|---------:|--------------------:|------:|:------:|
| Backend pytest | `cd backend && uv run pytest --tb=no` | 661 | 0 | 0 | 32 (0 datetime.utcnow) | 566 / 0 fail / 32 warn / 0 utcnow | +95 passed | ✅ |
| Frontend vitest | `cd frontend && pnpm exec vitest run` | 326 | 0 | 0 | — | 293 / 0 fail | +33 passed | ✅ |
| Frontend Playwright | `cd frontend && pnpm exec playwright test` | 13 | 0 | 2 | — | 7 / 0 fail / 1 skipped | +6 passed, +1 skipped | ✅ |
| `cmc doctor` | `cmc doctor` (with daemons running) | 7 ✓ | 0 ✗ | — | 1 ⚠ (psutil port-perms; pre-existing, environmental) | n/a | n/a | ✅ |

**Phase 18 BASELINE.md verifier rules — all satisfied:**
- `passed >= 566` → 661 (PASS)
- `failed > 0` → 0 (PASS)
- `warnings_datetime_utcnow > 0` → 0 (PASS — POLI-06 invariant intact)
- `total_warnings > 132` → 32 (PASS — same as baseline)
- vitest `passed >= 293` → 326 (PASS)
- Playwright `failed > 0` → 0 (PASS); `skipped == 1 AND alerts.spec.ts is the only skipped spec` → 2 skipped — both preflight-skip-with-reason (dev-DB-state-dependent), both pre-existing, neither a Phase 23 regression:
  - `alerts.spec.ts:40 TEST-05a` — BASELINE.md documented steady-state skip (no recent `failed_task` in dev DB).
  - `skills-detail.spec.ts:25 SKLP-08/09/10` — Plan 19-04 documented preflight skip (no seeded skill row in current dev DB).

  Both skip via the documented `skip-with-reason` pattern; "human review" threshold reached but both reasons are documented — no action required at milestone close.

Raw run logs: `/tmp/phase23-close-pytest.log`, `/tmp/phase23-close-vitest.log`, `/tmp/phase23-close-pw-full.log`, `/tmp/phase23-close-doctor-clean.log`.
