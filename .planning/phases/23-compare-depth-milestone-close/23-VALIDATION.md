---
phase: 23
slug: compare-depth-milestone-close
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
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
| 23-01-01 | 01 | 1 | CMPR-06 | — | N/A | backend unit/integration | `cd backend && pytest tests/test_sessions_router.py -k compare -x` | ✅ | ⬜ pending |
| 23-01-02 | 01 | 1 | CMPR-07 | — | N/A | backend unit/integration | `cd backend && pytest tests/test_sessions_router.py -k previous -x` | ❌ | ⬜ pending |
| 23-02-01 | 02 | 1 | CMPR-06 | — | N/A | frontend unit | `cd frontend && pnpm test -- SessionCompareView` | ⚠️ | ⬜ pending |
| 23-03-01 | 03 | 2 | CMPR-06, CMPR-07 | — | N/A | e2e | `cd frontend && pnpm test:e2e frontend/tests/e2e/sessions-compare.spec.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_sessions_router.py` — add `/api/sessions/{sid}/previous` tests (D-01..D-06) + extend compare assertions for `skill_latencies` + `low_sample_*`
- [ ] `frontend/tests/e2e/sessions-compare.spec.ts` — extend e2e coverage for per-skill latency section + Cmd+K “compare with previous” behavior

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
