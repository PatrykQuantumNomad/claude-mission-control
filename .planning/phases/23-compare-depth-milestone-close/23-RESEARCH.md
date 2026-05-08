# Phase 23: Compare Depth & Milestone Close - Research

**Researched:** 2026-05-08  
**Domain:** Session comparison (FastAPI + SQLite SQL), command palette UX (React + TanStack Router)  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
## Implementation Decisions

### Previous-session endpoint contract (`GET /api/sessions/{sid}/previous`)
- **D-01:** “Same project” is **same `project_key` only**.
- **D-02:** “Previous” is **most recent by `ended_at` strictly less than current session’s `ended_at`**, ignoring sessions with `ended_at IS NULL`.
- **D-03:** Tie-breaker is **highest `started_at`** when multiple candidates tie.
- **D-04:** If no previous session exists, return **404** with `{error: "no previous session"}`.
- **D-05:** No additional skipping rules (no minimum tool calls, no “successful only” filter).
- **D-06:** Response body is **ID-only**: `{session_id: <uuid>}`.

### Cmd+K “Compare with previous session” UX
- **D-07:** Action is available **only on session detail views** (“from any session view”).
- **D-08:** Action behavior: **navigate directly** to `/sessions/compare?a=<current>&b=<previous>`.
- **D-09:** Action is **hidden unless a previous session exists**.
- **D-10:** If user is on `/sessions/compare` and `a` exists, treat `a` as current and set `b` to previous-of-`a`.

### Compare picker scoping
- **D-11:** When choosing session B (picker/helper flows), candidate list is **scoped to Side A’s `project_key`**.
- **D-12:** Scoping identity is **`project_key` everywhere**.
- **D-13:** If Side A has no `project_key`, **do not scope** (fall back to global list).
- **D-14:** Keep current `/sessions/compare` behavior of **stripping invalid UUIDs** for `a`/`b` (do not hard-fail).

### Per-skill latency delta data contract
- **D-15:** `skill_latencies` is **per-skill p95 latency** per side.
- **D-16:** Low-sample threshold is **30**; expose `low_sample_a` / `low_sample_b`.
- **D-17:** If either side is low-sample, **suppress delta calculation** (still return raw per-skill latencies + low-sample flags).
- **D-18:** `over_cap` should **still include `skill_latencies`**; only skip the heavy tool-counts query as today.

### Claude's Discretion
None — decisions above are locked.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CMPR-06 | Per-skill latency delta in `/sessions/compare` (per-side `skill_latencies` p95, `low_sample_*` gating, respects CMPR-04 SQL budget + over-cap behavior) | Implement a **single per-side rollup SQL** that returns: distinct skills + per-skill p95 (from `duration_ms` in `otel_events.body.record.attributes`) + per-side duration sample_count; add fields to `SessionCompareSide` and UI rendering section; update backend unit tests + e2e. |
| CMPR-07 | Cmd+K “Compare with previous session” on session detail views, hidden if none; backed by `/api/sessions/{sid}/previous` contract | Add new FastAPI route implementing D-01..D-06; add frontend query that treats 404 as “no previous” (visibility gate, not user-facing error); plumb “current session id” from session-detail Sheets into CommandPalette via shared context. |
</phase_requirements>

## Summary

Phase 23 is a **depth extension** of the existing session compare lane (Phase 16). Backend already has a tight compare envelope (`/api/sessions/compare`) with a **9-SQL-per-request budget** and an **over-cap render branch** that skips only the heavy tool-counts GROUP BY query. This phase must add per-skill p95 latency without violating that budget and must add a “previous session” resolver that uses the already-normalized `sessions.project_key` (Phase 19) rather than `cwd`.

On the frontend, `/sessions/compare` is a TanStack Router route with strict `validateSearch` sanitation and an existing Cmd+K “Compare with…” flow. Phase 23 adds a new Cmd+K action scoped to **session detail Sheets** (not a new route) and a new compare section that shows **per-skill p95** side-by-side with optional delta suppression when low-sample.

**Primary recommendation:** Extend `_build_compare_side` with **one additional rollup query** (per side) that returns both **skills list** and **p95 per-skill latency** plus a **per-side sample_count** (for `low_sample_*`), and introduce a dedicated `GET /api/sessions/{sid}/previous` endpoint as the single source of truth for “previous”.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-skill p95 latency in compare payload | API / Backend | Database / Storage | Requires consistent SQL extraction of `duration_ms` from event JSON; budget enforcement belongs server-side. |
| Over-cap behavior preserving skill_latencies | API / Backend | — | Over-cap is a server contract; client should not guess which work is “heavy”. |
| `/api/sessions/{sid}/previous` resolver | API / Backend | Database / Storage | “Previous” semantics are locked and depend on `ended_at` ordering; centralize to avoid frontend divergence. |
| Cmd+K “Compare with previous session” visibility + navigation | Browser / Client | Frontend routing | Visibility is UI-only, but depends on backend endpoint existence; navigation uses TanStack Router. |
| Compare view rendering (delta suppression) | Browser / Client | — | Delta suppression is a presentation decision keyed off server flags. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.136.1 | Backend API routes | Existing backend router layer. [VERIFIED: repo `backend/pyproject.toml`] |
| SQLAlchemy | 2.0.49 | SQL execution (text + select) | Existing pattern for read-time SQL and ORM row loading. [VERIFIED: repo `backend/pyproject.toml`] |
| SQLModel | 0.0.38 | Session/OTEL models | Existing DB modeling used by sessions router. [VERIFIED: repo `backend/pyproject.toml`] |
| React | 19.2.5 | UI | Existing app runtime. [VERIFIED: repo `frontend/package.json`] |
| TanStack Router | 1.168.24 | Routing + `validateSearch` | Existing `/sessions/compare` routing + navigation patterns. [VERIFIED: repo `frontend/package.json`] |
| TanStack Query | 5.100.5 | Data fetching | Existing hooks (`useSessionCompare`, `useSessionDetails`, `useSessionsList`). [VERIFIED: repo `frontend/package.json`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Playwright | 1.59.1 | E2E tests | Update `sessions-compare.spec.ts` and add Cmd+K previous-session coverage. [VERIFIED: repo `frontend/package.json`] |
| Vitest | 4.1.5 | Frontend unit tests | Update `SessionCompareView.test.tsx` and command palette tests. [VERIFIED: repo `frontend/package.json`] |
| Pytest | >=9.0 | Backend tests | Extend `backend/tests/test_sessions_router.py`. [VERIFIED: repo `backend/pyproject.toml`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Adding a new schema/validator lib for `validateSearch` | zod / valibot | Out of scope and explicitly avoided by precedent in `sessions_.compare.tsx`. [VERIFIED: repo `frontend/src/routes/sessions_.compare.tsx`] |
| Client-side “previous session” computation | Frontend sorting of `/api/sessions` results | Violates “centralize resolver” pitfall; risks drift vs locked D-01..D-06 rules and tie-breakers. [VERIFIED: repo `23-CONTEXT.md`] |

**Installation:** None — phase should add **zero new dependencies**. [VERIFIED: repo patterns; v1.2 out-of-scope bans new deps in `.planning/REQUIREMENTS.md`]

## Architecture Patterns

### System Architecture Diagram

```text
Cmd+K / Session details Sheet
          |
          | (enabled only when /api/sessions/{sid}/previous returns 200)
          v
GET /api/sessions/{sid}/previous  ----->  sessions table (project_key, ended_at, started_at)
          |
          | returns {session_id: prevSid} OR 404 {error:"no previous session"}
          v
navigate to /sessions/compare?a=<sid>&b=<prevSid>
          |
          v
GET /api/sessions/compare?a=&b=  -------> sessions + otel_events + tools
          |
          | per side: KPIs + skills_used + skill_latencies + tool_counts (unless over_cap)
          v
SessionCompareView renders:
  - KPIs + tokens charts + skill-set diff + tool-counts diff (when not over_cap)
  - per-skill latency section (delta suppressed when low_sample_a||low_sample_b)
```

### Recommended Project Structure (existing)
```
backend/cmc/api/routes/sessions.py   # compare + new /previous route
backend/cmc/api/schemas/sessions.py  # compare DTO extension
backend/tests/test_sessions_router.py

frontend/src/components/ui/CommandPalette.tsx
frontend/src/components/panels/SessionCompareView.tsx
frontend/src/lib/api.ts              # add sessionsPrevious() client
frontend/src/lib/queries.ts          # add useSessionPrevious() hook
frontend/tests/e2e/sessions-compare.spec.ts
```

### Pattern 1: “Single rollup SQL per side” (CMPR-06)
**What:** Keep compare under the CMPR-04 SQL budget by replacing the current “skills list” SQL with a **combined** query that returns:
- distinct `skill_name` values for `skills_used`
- per-skill p95 latency from `duration_ms` (extracted from `otel_events.body.record.attributes`)
- a per-side `duration_sample_count` used to compute `low_sample_*`

**When to use:** Any compare extension that needs per-skill rollups.  
**Source:** Existing percentile extraction idiom `_LATENCY_SQL` in `backend/cmc/api/routes/skills.py`. [VERIFIED: repo `backend/cmc/api/routes/skills.py`]

### Pattern 2: “404 is a visibility gate” (CMPR-07)
**What:** The frontend should treat `GET /api/sessions/{sid}/previous` 404 `{error:"no previous session"}` as **non-fatal** and use it only to hide the Cmd+K action (D-09).  
**When to use:** Any UI feature whose presence depends on a backend “exists?” resolver with an expected empty-case.  
**Source:** Phase 23 locked decisions D-04, D-09. [VERIFIED: repo `23-CONTEXT.md`]

### Anti-Patterns to Avoid
- **N+1 per-skill SQL:** Don’t call `/api/skills/{name}/latency` for each skill from compare; it explodes request count and violates CMPR-04 budget. [VERIFIED: `.planning/REQUIREMENTS.md` CMPR-06]
- **Skipping `skill_latencies` on over-cap:** Phase 23 D-18 explicitly requires `skill_latencies` to still be present on `over_cap`; only tool-counts are skipped. (Note: older PITFALLS guidance conflicts here; follow D-18.) [VERIFIED: `23-CONTEXT.md`]
- **Frontend-side “previous” logic:** Don’t infer “previous” by listing sessions and guessing ordering; must follow locked D-02/D-03 and ignore active sessions. [VERIFIED: `23-CONTEXT.md`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Percentiles (p95) | Python sorting/percentile logic in handler | SQLite window-function CTE (existing `_LATENCY_SQL` pattern) | Avoids off-by-one drift; already battle-tested by SKIL-06 tests. [VERIFIED: repo `backend/cmc/api/routes/skills.py`] |
| Router param validation | Add new schema library | Existing `validateSearch` regex stripping | Matches existing `/sessions/compare` behavior; keeps bundle minimal. [VERIFIED: repo `frontend/src/routes/sessions_.compare.tsx`] |

## Common Pitfalls

### Pitfall 1: Blowing the CMPR-04 SQL budget
**What goes wrong:** Adding an extra per-side query pushes `/sessions/compare` past the “9 SQL per request” expectation and can regress performance.  
**Why it happens:** It’s tempting to bolt on a new query for latency in addition to existing “skills list” query.  
**How to avoid:** Replace `_COMPARE_SKILLS_SQL` with a combined skills+latency query so per-side query count stays constant.  
**Warning signs:** New tests or docs refer to 10+ SQL statements; compare endpoint latency increases on sessions with many skill events.

### Pitfall 2: Mis-handling 404 for previous-session in UI
**What goes wrong:** Cmd+K shows an “error toast” or the action appears but fails on select.  
**Why it happens:** Reusing generic query error UI for a 404 that represents “no previous session”.  
**How to avoid:** Treat 404 as `{exists:false}` state in the hook/client; only treat 400/404(session missing)/500 as true errors.  
**Warning signs:** Command palette displays an error message on clean projects with a single session.

### Pitfall 3: Over-cap contract drift
**What goes wrong:** `over_cap=true` accidentally strips `skill_latencies`, contradicting D-18 and making the UI inconsistent.  
**Why it happens:** Copying the existing `if over_cap: tool_counts={}` branch to also skip latency rollups (older docs mention this).  
**How to avoid:** Keep latency rollup query enabled under over-cap; only skip tool-counts GROUP BY.  
**Warning signs:** Compare payload includes `over_cap=true` and an empty `skill_latencies` unexpectedly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | frontend tests/build | ✓ | v24.11.1 | — |
| pnpm | frontend scripts | ✓ | 10.33.2 *(repo expects pnpm@10.26.2)* | Use `corepack` / install matching pnpm if lockfile issues occur. |
| Python | backend tests | ✓ (but **too old**) | 3.11.7 *(backend requires >=3.13)* | Use pyenv/mise/uv to run Python 3.13. |

**Missing dependencies with no fallback:**
- Python 3.13+ on this machine (required by `backend/pyproject.toml`). [VERIFIED: repo + local `python3 --version`]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend framework | pytest (asyncio_mode=auto) |
| Frontend framework | vitest |
| E2E framework | Playwright |
| Backend quick run | `cd backend && pytest tests/test_sessions_router.py -x -q` |
| Frontend quick run | `cd frontend && pnpm test` |
| E2E quick run | `cd frontend && pnpm test:e2e frontend/tests/e2e/sessions-compare.spec.ts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CMPR-06 | Compare response includes per-side `skill_latencies` + `low_sample_*` and respects over-cap semantics | backend unit/integration | `cd backend && pytest tests/test_sessions_router.py -k compare -x` | ✅ (extend existing compare tests) |
| CMPR-06 | Compare page renders per-skill latency section and delta suppression when low-sample | frontend unit | `cd frontend && pnpm test -- SessionCompareView` | ✅ (extend `SessionCompareView.test.tsx`) |
| CMPR-06 | E2E compare flow still works and displays the new section (or gracefully handles empty/low-sample) | e2e | `cd frontend && pnpm test:e2e frontend/tests/e2e/sessions-compare.spec.ts` | ✅ (extend existing spec) |
| CMPR-07 | `/api/sessions/{sid}/previous` enforces D-01..D-06 (404 no previous, ignores ended_at NULL, tie-breaker) | backend unit/integration | `cd backend && pytest tests/test_sessions_router.py -k previous -x` | ❌ (add tests) |
| CMPR-07 | Cmd+K action visible only in session detail Sheet when previous exists; selecting navigates to compare with `a`/`b` | frontend unit + e2e | `cd frontend && pnpm test -- CommandPalette` and Playwright spec update/add | ⚠️ (unit exists; add new coverage + possibly new e2e) |

### Wave 0 Gaps
- Add backend tests for the new `/api/sessions/{sid}/previous` endpoint (including active session ended_at NULL → 404).
- Extend compare backend tests to assert `skill_latencies` presence and low-sample flags.
- Add/extend frontend tests ensuring 404 from `/previous` is treated as “hidden”, not an error.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | localhost-only app; no auth layer in this phase. [ASSUMED] |
| V4 Access Control | no | same as above. [ASSUMED] |
| V5 Input Validation | yes | Existing UUID regex guard for session_id; keep 400 on malformed IDs. [VERIFIED: repo `backend/cmc/api/routes/sessions.py`] |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal / injection via path params | Tampering | Strict UUID regex + reject invalid; never use untrusted values in filesystem paths. [VERIFIED: repo patterns] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | “No auth/access control concerns apply” because this is localhost-only | Security Domain | If auth exists later, endpoints may need session scoping/tenant checks. |

## Open Questions (RESOLVED)

1. **Where should “current session id” live so CommandPalette can know it’s on a session detail view?**
   - **Resolution:** Use a shared `ActiveSessionContext` provider at the AppShell level.
     - Create: `frontend/src/components/shell/ActiveSessionContext.tsx`
     - Wire provider in: `frontend/src/components/shell/AppShell.tsx`
     - Set/clear `activeSessionId` from session-detail Sheets in `LiveSessionsCard.tsx` and `SkillRunsTable.tsx` when the “Session details” Sheet opens/closes.
   - **Rationale:** Session details are Sheets (not routes), so a route-based heuristic won’t reliably scope Cmd+K actions. A lightweight shell context is explicit, testable, and keeps the visibility gate (404 from `/api/sessions/{sid}/previous`) centralized in the command palette logic.

## Sources

### Primary (HIGH confidence)
- `backend/cmc/api/routes/sessions.py` — compare endpoint, `_build_compare_side`, over-cap tool-count skip, UUID guard. [VERIFIED: repo]
- `backend/cmc/api/routes/skills.py` — `_LATENCY_SQL` duration_ms extraction + percentile CTE pattern. [VERIFIED: repo]
- `backend/cmc/db/models/sessions.py` — `project_key`, `ended_at`, `started_at`. [VERIFIED: repo]
- `frontend/src/components/ui/CommandPalette.tsx` — existing compare Cmd+K flow + picker. [VERIFIED: repo]
- `frontend/src/components/panels/SessionCompareView.tsx` — compare rendering + over-cap empty-state. [VERIFIED: repo]
- `frontend/src/components/panels/LiveSessionsCard.tsx` — session detail is a Sheet (not a route). [VERIFIED: repo]
- Phase contract: `.planning/phases/23-compare-depth-milestone-close/23-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`. [VERIFIED: repo]

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` — budget/pattern reminders, but conflicts with locked D-18 on over-cap latency handling. [VERIFIED: repo]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; versions read from repo manifests.
- Architecture: HIGH — directly grounded in existing compare + skill latency SQL patterns.
- Pitfalls: MEDIUM — one known conflict between older PITFALLS guidance and Phase 23 locked decisions.

**Research date:** 2026-05-08  
**Valid until:** 2026-06-07

