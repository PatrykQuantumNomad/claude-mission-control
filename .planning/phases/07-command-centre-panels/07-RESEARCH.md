# Phase 7: Command Centre Panels — Research

**Researched:** 2026-04-27
**Domain:** React 19 + TanStack Query SPA building 11 *stateful* (write-capable) panels on top of already-shipped Phase-4 routers (HITL decisions/inbox, Tasks CRUD + transition matrix, Schedules CRUD + NL→cron, Skills catalog + autonomy, MCP catalog, Emergency Stop). New surface area: 2 modal Sheets (TaskComposer, ScheduleComposer), 1 AlertDialog (EmergencyStop 2-step confirm), 1 banner injected into the global `<NavBar>`, and one new backend endpoint (SKLP-03 ContextHealth — read-only scan of `~/.claude/settings.json` + `CLAUDE.md`).
**Confidence:** HIGH on backend contract surface (every Phase-4 route file read in full + response shapes verified against Pydantic models — CORRECTED several inaccuracies from the phase brief), HIGH on Phase-5/6 primitive reuse (PanelCard / Sheet / AlertDialog all already on disk), MEDIUM on cron-explainer library choice (cronstrue 3.14.0 verified against npm registry but not yet installed; alternatives weighed below), MEDIUM on SKLP-03 ContextHealth scope (no existing endpoint; secret-redaction policy in PITFALLS.md L258 is a hard constraint requiring a backend route — not frontend FS access).

> **NO CONTEXT.md exists for Phase 7** — full Claude discretion subject to project-wide locked decisions in STATE.md / PROJECT.md / Phase-4 router contracts / Phase-5 primitive surface / Phase-6 panel patterns. Phase 6 RESEARCH established the panel-composition contract (`<PanelCard>` shell, `lib/queries.ts` cadence policy, no-spinner skeleton policy, `cmc.*` storage prefix) — Phase 7 extends it with composers and writes, never re-litigates it.

## Summary

Phase 7 binds 11 named panels to **already-shipped backend endpoints**: every HITL/Tasks/Schedules/Skills/MCP/ESTOP route exists and ships in Plan 04-02..05 + Plan 03-05 production code [VERIFIED: full read of `backend/cmc/api/routes/{hitl,tasks,schedules,skills,mcp,system}.py` plus Pydantic schemas]. The work is dominantly frontend: ~11 panel components, 2 slide-out composers (Sheet wrappers), 1 AlertDialog 2-step confirm, 1 banner mounted in `<NavBar>`, and `lib/queries.ts` extension with HITL/Tasks/Schedules/Skills/MCP-write hooks that have been deferred to this phase by Plan 06-01 (entries are `unknown` in `lib/api.ts` today). One **gap** requires a new thin backend route: SKLP-03 ContextHealthCard (line/rule/MCP/hook counts from `~/.claude/settings.json` + `CLAUDE.md`) cannot be implemented client-side because (a) the browser cannot read the user's home dir, and (b) PITFALLS.md L258 mandates server-side redaction of any env var matching `*KEY*` / `*TOKEN*` / `*SECRET*` patterns before display. **One existing route is reusable verbatim**: SKLP-01 MCPPanel — Phase 6 already shipped `frontend/src/components/panels/McpPanel.tsx` and Phase 7 imports it directly on `/skills` (Phase 6 close decision STATE.md L250).

Three corrections to the phase brief were uncovered during contract verification (details in §Backend Endpoint Traceability below) and the planner MUST honor the corrected paths:

1. **NL→cron endpoint is `POST /api/schedules/parse-nl`** [VERIFIED: `routes/schedules.py` L271], NOT `/api/schedules/nl-to-cron` as stated in the phase brief.
2. **Emergency Stop CLEAR is `POST /api/system/emergency-resume`** [VERIFIED: `routes/system.py` L437], NOT `DELETE /api/system/emergency-stop` as stated in the brief. The DB row is UPDATEd to `value='0'`, never deleted (Plan 04-05 contract — STATE.md L172).
3. **Dispatcher trigger is `POST /api/dispatcher/trigger`** (no body, no task id — returns PID) [VERIFIED: `routes/tasks.py` L251], NOT `POST /api/tasks/{id}/trigger` as stated in the brief.

**Primary recommendation:** Four-plan, three-wave structure (detail in §Plan Breakdown). Wave 0 lands shared infrastructure (cronstrue 3.14.0 install, AlertDialog primitive, EmergencyStopBanner mounted in `<NavBar>`, types-tightening pass on `lib/api.ts` for HITL/Tasks/Schedules/Skills/MCP/ESTOP/Sync entries currently typed `unknown`, hook layer in `lib/queries.ts`, and the SKLP-03 backend route). Wave 1 ships Decisions + Inbox + Skills page wiring. Wave 2 ships TaskBoard + composers + AttentionBar real-data extension and retires PlaceholderCardGrid from `/skills` for good. **Use cronstrue for live preview** (42KB minified, zero deps, English-only by default — covers the SCHD composer cron preview AND the `TPNL-03` SchedulesCard summary display). **Use Radix `<AlertDialog>` 1.1.15** for the 2-step ESTOP confirm (already React-19 compatible; Radix Dialog is already installed) — the second click within 5s pattern (PITFALLS.md L270) is implemented as `useState<'idle'|'armed'>` + `setTimeout(5000)` re-disarm. **Native HTML `<input type="time">`** for the schedule time picker — bespoke ethos; no library. **Day-of-week chips** are 7 toggle buttons composing the existing `<Badge>` styling.

## User Constraints

> No CONTEXT.md exists for Phase 7. The constraints below are *project-wide locked decisions* from STATE.md / PROJECT.md / REQUIREMENTS.md / Phase-4 contracts / Phase-5 primitive surface / Phase-6 panel patterns. They are NOT Phase-7 discretion.

### Locked decisions (project-wide / upstream — DO NOT revisit)

**Backend contract (Phase 4 — already shipped, frozen):**
- HITL router (HITL-01..07): file-then-DB ordering invariant on POST `/decisions/{id}/answer` and POST `/inbox/{id}/reply`; INSERT OR IGNORE on dedup_key returns 200 (existing pending) vs 201 (new); idempotent `POST /inbox/{id}/read`; partial-unique conflict-refetch scopes `WHERE status='pending'` [VERIFIED: `routes/hitl.py` + STATE.md L168-170].
- Tasks router (TASK-01..07): transition matrix in `cmc.tasks.transitions` is the single source of truth (router never inlines an allow-list); TASK-04 returns 204 No Content; TASK-07 returns 202 + detached PID; TASK-05/06 validate source state inline [VERIFIED: `routes/tasks.py` + STATE.md L175-177].
- Schedules router (SCHD-01..06): clear-and-recompute invariant on `next_run_at` whenever EITHER `cron` OR `enabled` changes; 503 single-message fallback for both "no API key" and "invalid model output" (Security V11 — no env-config leak); UNIQUE name → 409 [VERIFIED: `routes/schedules.py` + STATE.md L178-181].
- ESTOP order-of-operations LOCKED: flag flip BEFORE PID-scan SIGTERM BEFORE bulk UPDATE running tasks; `value='0'` on resume (UPDATE, not DELETE) so SAPI-03 distinguishes "explicitly cleared" from "never set" [VERIFIED: `routes/system.py` L380-455 + STATE.md L171-172].
- Skills router (SKIL-01..03): name regex `^[a-zA-Z0-9_-]+$` PLUS explicit `..` substring rejection (V12); MCP server name regex `^[a-zA-Z0-9._-]+$` PLUS `..` rejection (V11); `autonomy` is `Literal["auto","review","manual"]` [VERIFIED: `routes/skills.py` L47, `routes/mcp.py` L41].
- App-wide HTTPException handler emits `{error: detail}` (NOT FastAPI default `{detail: ...}`) [VERIFIED: STATE.md L154]. UI surfaces display the body literal; mutation tests assert `r.json().error`.

**Frontend contract (Phase 5 + 6 — already shipped, frozen):**
- 12 Phase-5 ui primitives (Card family + Button + Badge + StatePill + Tooltip + Skeleton + EmptyState + RelativeTime + ShellErrorBoundary + Sheet + CollapsibleSection + CommandPalette + formatRelative) plus 7 Phase-6 panel primitives (PanelCard, RangeToggle, DataTable, HeatmapGrid, StatList, KpiTile, ErrorState) — Phase 7 imports from the `frontend/src/components/ui` barrel; never re-implements [VERIFIED: `frontend/src/components/ui/index.ts`].
- `<PanelCard>` is the canonical shell for any panel backed by a `UseQueryResult` [VERIFIED: `components/ui/PanelCard.tsx`]. 4 render branches (skeleton / error / empty / data) live in ONE place; `hiddenWhenEmpty` returns `null` when empty.
- `lib/queries.ts` is the SINGLE source of refetch cadence — panels NEVER inline `refetchInterval` [VERIFIED: STATE.md L211 + Plan 06-01 entry contract].
- `lib/storage` `cmc.*` prefix is canonical; `CollapsibleSection` uses `cmc.collapsible.{id}`; Phase 7 reuses (`cmc.composer.task.draft`, `cmc.filter.tasks.quadrant`, etc.) [VERIFIED: STATE.md L200].
- `<Sheet>` API is right-side only, requires `title`, optional `description`; Radix Dialog Portal mounts to `document.body` (tests use `document.body.querySelectorAll(...)`) [VERIFIED: `components/ui/Sheet.tsx` + STATE.md L223].
- `<CommandPalette>` is mounted globally in AppShell — Phase 7 wires "Quick task" `onSelect` to TaskComposer-open (grep marker `// Phase 7 wires TaskComposer (TPNL-03)` in CommandPalette.tsx) [VERIFIED: `components/ui/CommandPalette.tsx` L84].
- DESG-04 grid recipe: `repeat(auto-fit, minmax(320px, 1fr))` + `grid-auto-rows: 1fr` (no media queries) — reuse `.cmc-card-grid` for any multi-panel layout on `/skills` [VERIFIED: STATE.md L199 + L204].
- Page-level entrance animation: `.cmc-page` wrapper runs `cmc-page-in` (300ms ease-out) on mount; no per-card stagger [VERIFIED: STATE.md L205].
- No spinners, only skeletons; loading copy NONE (skeleton blocks match final content shape) [VERIFIED: REQUIREMENTS.md FESH-08 + STATE.md L209 visual quality bar].
- EmptyState heading **"Nothing to show yet"** + body **"Once {dataNoun} arrives it will appear here. Run sync from the header to refresh."** [VERIFIED: REQUIREMENTS.md UI-SPEC + Phase 6 RESEARCH §Empty-state policy].
- Error copy: **"Couldn't load {dataNoun}. Refresh or check `cc doctor`."** [VERIFIED: `components/ui/ErrorState.tsx` + Phase 6 RESEARCH §Empty-state policy].
- Backend response handler emits `{error: detail}` not `{detail: ...}` — UI displays body literal [VERIFIED: STATE.md L154].
- Design tokens: every color/space/radius/weight is `var(--cmc-*)` / `var(--space-*)` / `var(--size-*)` / `var(--weight-*)` — no inline hex, no Tailwind, no inline `style={{ color: ... }}` for color tokens [VERIFIED: STATE.md L194 + L199].
- `PlaceholderCardGrid` retired from `/` (Plan 06-03) and `/activity` (Plan 06-05). **Last consumer is `/skills` (Phase 7 territory). Helper deletes when last placeholder is replaced** [VERIFIED: STATE.md L251 + Plan 05-04 contract STATE.md L203].
- `McpPanel` lives at `frontend/src/components/panels/McpPanel.tsx` — **Phase 7 SKLP-01 imports it AS-IS or extends it; do NOT duplicate** [VERIFIED: STATE.md L250 + Plan 06-03 pattern STATE.md L231].
- AttentionBar v1 ignores `pending_decisions` and `failed_tasks` (intentionally hardcoded zero in `routes/system.py` L231-232 — Plan 06-02 inline comment cited STATE.md L227). **Phase 7 EXTENDS AttentionBar to surface real values once HPNL-01 lands and the tasks/decisions tables flow.**
- ChartsStrip / TopSkills v2 placeholder remain — Phase 7 may revisit TopSkills if SKLP-02 surfaces a real per-skill token usage source, but Plan 06-01 ACTV-04 deferral (STATE.md L212) is the operative state.

**Security (project-wide):**
- Localhost-only binding (`127.0.0.1`); no rate limiting on writes is acceptable because trust boundary is single-user single-machine [VERIFIED: PITFALLS.md L256, L260].
- **ContextHealthCard MUST redact env values matching `*KEY*` / `*TOKEN*` / `*SECRET*`** (case-insensitive) — display key NAMES never values [VERIFIED: PITFALLS.md L258 — HARD constraint for SKLP-03].
- Path traversal defense lives BACKEND-side on every name-in-path route (server name, skill name); frontend uses `encodeURIComponent` [VERIFIED: routes/skills.py + routes/mcp.py + STATE.md L153].

**Testing (project-wide):**
- `NODE_OPTIONS=--no-experimental-webstorage` required for vitest [VERIFIED: STATE.md L183 + `frontend/package.json`].
- Test pattern: `setQueryData` to seed TanStack Query state; `vi.fn()` for fetch; `MockEventSource` for SSE; **NO MSW** (Phase 6 deliberate non-install) [VERIFIED: Phase 6 RESEARCH §Test strategy + Plan 06-02 pattern STATE.md L224].
- Radix Dialog Portal mounts to `document.body` — Sheet / AlertDialog content tests use `document.body.querySelectorAll(...)` + `waitFor` [VERIFIED: STATE.md L223 + `Sheet.tsx`].
- Phase 4 row counts: 202/202 backend tests + 170/170 frontend tests; Phase 7 close lands net positive (estimate ~50 additional frontend + ~6 additional backend — see §Plan Breakdown).

### Claude's discretion (Phase 7 owns these)

- Cron-explainer library (cronstrue 3.14.0 verified vs alternatives below — recommend cronstrue).
- AlertDialog vs Dialog choice for ESTOP confirm (recommend AlertDialog — `@radix-ui/react-alert-dialog@^1.1.15` install).
- TaskComposer / ScheduleComposer slide-out shape — Sheet wrapper with bespoke form body; native HTML form controls (`<input>`, `<select>`, `<textarea>`, `<input type="time">`).
- Day-of-week chip implementation — bespoke 7-button toggle group composing existing `<Badge>` shape (no library).
- TaskBoard column persistence (collapsed columns? sort within column?) — recommend per-column collapse via `cmc.collapsible.tpnl-board-{status}` reusing existing `CollapsibleSection`.
- Polling cadences for Phase-7-specific endpoints (5s decisions per HPNL-01 spec; 10s inbox per HPNL-02 spec; 5s task board per success criterion 1; 30s schedules / mcp / skills lists).
- Optimistic UI policy for HITL answer / task approve / inbox read / autonomy patch — recommend optimistic with rollback on error (TanStack Query `onMutate` + `setQueryData`).
- TaskComposer field defaults: `execution_mode='interactive'` per TPNL-02 spec; `priority=3`, `approval='auto'`, `dry_run=false` from `TaskCreate` Pydantic defaults.
- Composer draft persistence: write to `cmc.composer.task.draft` / `cmc.composer.schedule.draft` on every change; clear on submit/cancel; restore on Sheet open if non-empty.
- Backend endpoint additions: SKLP-03 ContextHealth route is REQUIRED (frontend cannot read FS + redaction must be server-side).
- Plan/wave breakdown — see §Plan Breakdown below.

### Deferred ideas (OUT OF SCOPE for Phase 7)

- Real per-skill token cost (SKLP-02 substantive content) — Plan 06-01 deferred to v2 because Claude Code does not emit `claude_code.skill_invoked` events; recommend SKLP-02 ships as a **v2 placeholder card** mirroring the TopSkills pattern (STATE.md L246) until the upstream ingest surface exists. **Decision required in Wave 0** (defer vs revisit ingest).
- Schedule run-history streaming — SCHD-05 returns last N runs; live updates via polling not WebSockets.
- Decisions search / filter beyond `status` — backend supports only status-filter pagination.
- TPNL-04 NL→cron flow surfaced inside the ScheduleComposer's "Or describe in natural language" box (POST `/api/schedules/parse-nl`) — IN SCOPE for Phase 7 v1, but the dashboard's primary entry point is the time/days/cron-preview UI; NL input is the secondary affordance.
- Telegram notifications for new decisions / failed tasks — Phase 9 (TELE-*).
- Dispatcher execution behavior — Phase 8 (DISP-*). Phase 7 only TRIGGERS the dispatcher (TASK-07) — what it does after that is Phase 8's contract.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HPNL-01 | DecisionsCard with pending decisions, answer button/modal, 5s polling | §Backend Endpoint Traceability (HITL-01..03), §Optimistic UI policy, §Cadence policy |
| HPNL-02 | InboxCard with unread agent-to-user messages, reply box, 10s polling | §Backend Endpoint Traceability (HITL-04..07), §Cadence policy |
| TPNL-01 | TaskBoard 3 columns + skill/model/quadrant/risk badges + approve/rerun/delete | §Backend Endpoint Traceability (TASK-01..06), §Optimistic UI, §Phase-5 Badge variant map |
| TPNL-02 | TaskComposer slide-out (title/desc/model/mode/priority/quadrant/risk/approval/dry_run) | §Sheet composition pattern, §Composer draft persistence, §Phase-4 TaskCreate schema |
| TPNL-03 | SchedulesCard (name, cron preview, enabled toggle, next-run countdown, stale, history) | §Cron explainer (cronstrue), §Backend Endpoint Traceability (SCHD-01..05), §RelativeTime reuse |
| TPNL-04 | ScheduleComposer slide-out (time picker, day chips, cron preview, task fields, skill picker) | §Cron preview generator (client-side), §NL→cron fallback, §Native time input, §Day chips bespoke |
| TPNL-05 | EmergencyStopBanner — red header button + 2-step confirm | §AlertDialog primitive, §2-step confirm state machine, §Banner placement in NavBar |
| SKLP-01 | MCPPanel reused on /skills (already shipped Phase 6 OPNL-15) | §McpPanel reuse decision (STATE.md L250) |
| SKLP-02 | SkillCostCard token cost per skill | **DEFER to v2 placeholder card** — no upstream `claude_code.skill_invoked` event exists (Plan 06-01 ACTV-04 punt) |
| SKLP-03 | ContextHealthCard read-only scan of settings.json + CLAUDE.md | §New backend route (Wave 0), §Secret redaction policy (PITFALLS.md L258) |
| SKLP-04 | SkillsRegistry table across environments + autonomy controls | §Backend Endpoint Traceability (SKIL-01..03), §DataTable reuse, §Optimistic autonomy patch |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cron expression preview generation | Browser/Client | — | Pure transform `string → string`; cronstrue is a 42KB client lib; same answer in browser as on server (croniter is the validator, cronstrue is the *describer*); zero round-trips per keystroke |
| Cron expression validation | API/Backend | — | Already implemented (`cmc.schedules.cron.validate_cron`); 422 on POST/PATCH if invalid; client also previews-but-not-validates and surfaces "Couldn't read this cron" if cronstrue throws |
| NL → cron parsing | API/Backend | — | Already shipped (`POST /api/schedules/parse-nl`) — Anthropic SDK call MUST stay server-side (API key handling) |
| HITL queue write (decision answer / inbox reply) | API/Backend | — | File-then-DB invariant; queue path is filesystem (not browser-accessible) |
| Task lifecycle (transitions) | API/Backend | — | Transition matrix lives in `cmc.tasks.transitions`; client validates UI affordances (don't show "Approve" button when status≠awaiting_approval) but server enforces |
| Emergency stop SIGTERM | API/Backend | — | OS process management; obviously server-only |
| Composer draft persistence | Browser/Client | — | Per-user, per-tab — localStorage suffices |
| TaskBoard column UI state (collapse, etc.) | Browser/Client | — | UX preference, not domain state |
| ContextHealth scan + secret redaction | API/Backend | — | Browser cannot read `~/.claude/settings.json`; redaction is a *security control* and MUST run server-side per PITFALLS.md L258 |
| Cron live preview as user types | Browser/Client | — | Sub-100ms responsiveness; round-trip would feel laggy |
| Day-of-week / time → cron expression composition | Browser/Client | — | Pure deterministic mapping; the *result* is sent to the backend, which validates again |

## Standard Stack

### Core (already on disk; Phase 7 imports)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.2.5 | Component runtime | Project default [VERIFIED: package.json L24] |
| @tanstack/react-query | ^5.100.5 | Data fetching + mutations | Project default; cadence policy in `lib/queries.ts` [VERIFIED: package.json L19] |
| @tanstack/react-router | ^1.168.24 | Client routing | Project default [VERIFIED: package.json L20] |
| @radix-ui/react-dialog | ^1.1.15 | Sheet composer modals | Already used by `<Sheet>` (FESH-04) [VERIFIED: package.json L17] |
| @radix-ui/react-collapsible | ^1.1.12 | TaskBoard column collapse | Already used by `<CollapsibleSection>` [VERIFIED: package.json L16] |
| @radix-ui/react-tooltip | ^1.2.8 | Status hover hints | Already used by `<Tooltip>` [VERIFIED: package.json L18] |
| framer-motion | ^12.38.0 | Sheet slide-in animation | Already used by `<Sheet>` [VERIFIED: package.json L22] |
| cmdk | ^1.1.1 | CommandPalette TaskComposer trigger | Already used; Phase 7 just wires `onSelect` [VERIFIED: package.json L21] |
| lucide-react | ^1.11.0 | Icons (sparkle, trash, check, alert-triangle, etc.) | Already used [VERIFIED: package.json L23] |
| recharts | ^3.8.1 | (none new in Phase 7 — kept for the Phase 6 panels we don't touch) | — |

### Supporting (NEW Phase 7 dependencies — recommend installing)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cronstrue | ^3.14.0 | Live human-readable cron preview ("Every Monday at 09:00") | TPNL-03 SchedulesCard summary line; TPNL-04 ScheduleComposer live preview as user changes day/time/cron |
| @radix-ui/react-alert-dialog | ^1.1.15 | TPNL-05 EmergencyStop 2-step confirm | One AlertDialog primitive in `components/ui/AlertDialog.tsx` (Phase 7 Wave 0) |

**Verified versions [VERIFIED: `npm view ... version`, 2026-04-27]:**
- `cronstrue@3.14.0` — last published a month ago; zero deps; 42KB minified; ESM + UMD. License: MIT. [VERIFIED: `npm view cronstrue version dependencies` → `3.14.0`, `dependencies = {}`].
- `@radix-ui/react-alert-dialog@1.1.15` — peer `react: ^16.8 || ^17.0 || ^18.0 || ^19.0`; depends on `react-dialog` so install adds zero new transitives if `react-dialog` is already on disk (it is). [VERIFIED: `npm view @radix-ui/react-alert-dialog version peerDependencies` → 1.1.15, React 19 listed].

### Alternatives Considered

#### Cron explainer

| Library | Bundle (min) | Deps | React 19 | i18n | Verdict |
|---------|--------------|------|----------|------|---------|
| **cronstrue 3.14.0** | ~42KB | 0 | ✅ (it's framework-agnostic) | 30+ langs (English-only by default) | **Recommended** — zero deps, English by default → smallest bundle, framework-agnostic so no React-version concern |
| cron-parser 5.x | ~80KB+ | several | ✅ | English | Validator + iterator; doesn't *describe*. Backend already uses croniter for validation. Considered as a backend mirror — rejected (we don't need a second validator) |
| pretty-cron | unmaintained | unmaintained | ? | English | Last published >5 years; reject |
| Hand-rolled describer | small | 0 | ✅ | one lang | Day-of-week + time → "Every {day} at {time}" works for the *composer* path (we control the day/time inputs) but breaks for arbitrary cron strings the user pastes. We need cronstrue for the SchedulesCard summary line where the cron string already exists in DB |

**Rationale for cronstrue:** the SchedulesCard surface displays whatever cron string the row has — including any cron the user typed by hand (TPNL-04 advanced section), and any output of the NL→cron POST endpoint. A hand-rolled describer that only handles `{m h * * d}` falls back ungracefully on `0 9 1 * *` ("first day of the month at 09:00"). cronstrue handles every valid 5-field expression including ranges, lists, step-syntax (`*/15`), and named months/days.

**Verify on install (Wave 0 task):**
```bash
cd frontend && npm install cronstrue@^3
node -e "console.log(require('cronstrue').toString('*/5 * * * *'))"  # expect "Every 5 minutes"
node -e "console.log(require('cronstrue').toString('0 9 * * 1-5'))"  # expect "At 09:00 AM, Monday through Friday"
```

#### 2-step confirm dialog

| Approach | Bundle | Verdict |
|----------|--------|---------|
| **Radix `<AlertDialog>` 1.1.15** | shares `react-dialog` install → ~5KB delta | **Recommended** — proper aria roles (`role="alertdialog"`, default focus on Cancel), distinct from Dialog (which is `role="dialog"`); WAI-ARIA-correct for "destructive action confirm" |
| Custom Sheet + 2-step state in body | 0KB | Rejected — `<Sheet>` is right-side slide-in; semantic mismatch ("are you sure?" should be a centered modal); accessibility (alertdialog) is automatic with Radix |
| Browser `confirm()` | 0KB | Rejected — UI-SPEC quality bar; ugly OS popup |
| Inline expand-and-second-click in NavBar | 0KB | Considered — works but loses the ability to display destructive copy ("This will SIGTERM all running tasks. 5 PIDs will be terminated."). Modal carries the educational payload. ALSO: PITFALLS.md L270 reads "click to arm (button turns red), click again within 5s to execute" which is **inline 2-step in the same button**, NOT a modal. **Recommendation: do BOTH** — primary affordance is inline arm-and-confirm in the NavBar button itself (matches PITFALLS.md verbatim); the AlertDialog is a *fallback* affordance reachable via a second click that opens the modal for users who want to read the destructive copy first. Plan can simplify to inline-only if user prefers; both are documented |

**Decision: inline arm-and-confirm primary, modal fallback secondary.** PITFALLS.md L270 reads literally: "click to arm (button turns red), click again within 5s to execute" — implement that exact UX in `EmergencyStopBanner` itself. The AlertDialog primitive is still valuable for confirming task delete (TPNL-01 delete action — DELETE `/api/tasks/{id}` is destructive and 5s-armed-button on every row would be visually noisy). **Reframed scope: Wave 0 ships a generic `<AlertDialog>` primitive used by (a) EmergencyStop's *secondary* "Are you sure?" surface that opens AFTER arm if the user clicks-and-holds vs. clicks-then-clicks, and (b) the TaskBoard's per-task delete action.** Planner may simplify to "EmergencyStop = inline only, AlertDialog = task-delete only" — both are defensible.

#### Time picker

| Approach | Bundle | Verdict |
|----------|--------|---------|
| **Native `<input type="time">`** | 0 | **Recommended** — supported in every modern browser since 2018; `value` is `"HH:MM"` 24-hour format; no library; styling via existing `cmc-input` token recipe |
| react-time-picker (wojtekmaj) | ~30KB | Rejected — UI quality bar is bespoke; native is fine |
| Bespoke hour/minute selects | 0 | Considered for cron-friendly increments (every 5 / 15 / 30 min) — but the composer also supports arbitrary times; native is the cleanest catch-all |

#### Day-of-week chips

| Approach | Bundle | Verdict |
|----------|--------|---------|
| **Bespoke 7-button group** | 0 | **Recommended** — composes existing `<Badge>` styling + `aria-pressed`; one component, ~30 lines. Consistent with project's "build small, own the visual contract" ethos |
| @radix-ui/react-toggle-group 1.1.11 | ~8KB | Considered — gets aria semantics for free (`role="group"`, `aria-pressed`). Defensible alternative; pick this if accessibility audit prefers Radix idiom over bespoke `aria-pressed`. **Recommendation: bespoke for v1**; revisit if a11y review surfaces gaps |

**Installation (Wave 0):**
```bash
cd frontend && npm install cronstrue@^3 @radix-ui/react-alert-dialog@^1
```

## Backend Endpoint Traceability

Every endpoint below was verified by reading the actual route file (path, method, response model, query params). When the phase brief diverged from code, code wins (3 corrections noted in §Summary).

### HPNL-01 / HPNL-02 — HITL

| Req | Card | Method + Path | Response | Notes |
|-----|------|---------------|----------|-------|
| HPNL-01 | DecisionsCard list | GET `/api/decisions?status=pending&limit=50&offset=0` | `DecisionListResponse { items: DecisionListItem[], total }` [`schemas/hitl.py` L37-39] | **5s poll** per spec; filter `?status=pending` for the card; `?status=answered` for the (optional v2) answered tab |
| HPNL-01 | Answer mutation | POST `/api/decisions/{id}/answer` body `{ answer: str, answered_by: "dashboard" }` | `DecisionAnswerResponse { answered, decision_id, queue_path }` | 404 if missing; 409 if `status=='answered'` (already-answered conflict) [`routes/hitl.py` L168] |
| HPNL-01 (auto-test) | Decision creation (test seed only) | POST `/api/decisions` | 201 + DecisionListItem (or 200 + existing pending on dedup_key conflict) | Phase 7 panels do NOT *create* decisions — Phase 8 dispatcher does. Phase 7 tests use this to seed fixtures |
| HPNL-02 | InboxCard list | GET `/api/inbox?unread=true&max_age_days=14` | `InboxListResponse { items: InboxListItem[], total }` [`schemas/hitl.py` L80-82] | **10s poll** per spec |
| HPNL-02 | Mark-read mutation | POST `/api/inbox/{id}/read` | `InboxReadResponse { id, read, read_at }` | Idempotent (re-call returns same `read_at`) [`routes/hitl.py` L242] |
| HPNL-02 | Reply mutation | POST `/api/inbox/{id}/reply` body `{ reply: str }` | `InboxReplyResponse { replied, inbox_id, queue_path }` | File-then-DB ordering [`routes/hitl.py` L268] |

### TPNL-01..05 — Tasks + Schedules + ESTOP

| Req | Card / Action | Method + Path | Response | Notes |
|-----|---------------|---------------|----------|-------|
| TPNL-01 | TaskBoard list (3 columns) | GET `/api/tasks?status={pending,running,done}&quadrant={?}&limit=50` | `TaskListResponse { items: TaskListItem[], total }` [`schemas/tasks.py` L46-48] | **5s poll** per success criterion 1; ONE query per column with status filter, OR ONE query without status filter and group client-side. **Recommend client-side group** (one fetch, three columns from one cache key — saves 2 round-trips) but plan can choose either |
| TPNL-01 | Task list awaiting approval (the 4th status the board doesn't show) | GET `/api/tasks?status=awaiting_approval` | Same shape | Surfaced separately in TaskComposer's "Awaiting your approval" section (or as a 4th column — design decision; STATE.md success criterion 1 says 3 columns) |
| TPNL-01 | Approve action | POST `/api/tasks/{id}/approve` | `TaskApproveResponse { id, status: "pending", approved_at }` | 400 if status ≠ `awaiting_approval` [`routes/tasks.py` L189] |
| TPNL-01 | Rerun action | POST `/api/tasks/{id}/rerun` | `TaskRerunResponse { id, status: "pending" }` | 400 if status ≠ `failed`; clears `started_at/ended_at/error_message`; **preserves pid + stdout_path** so operators can inspect the prior failed run [`routes/tasks.py` L218 + STATE.md L176] |
| TPNL-01 | Delete action | DELETE `/api/tasks/{id}` | **204 No Content (no body)** | TanStack mutation must NOT call `r.json()` on 204 [`routes/tasks.py` L166] |
| TPNL-01 | (transition matrix viewer for testing) | — | Validates matrix in `cmc.tasks.transitions`: `pending↔{running,awaiting_approval,failed}`, `awaiting_approval→{pending,failed}`, `running→{done,failed}`, `done` terminal, `failed→pending` [STATE.md L162] | UI hides illegal-transition affordances (e.g., no "Approve" on `running` rows) |
| TPNL-02 | TaskComposer create | POST `/api/tasks` body `TaskCreate` | `TaskListItem` 201 | 9 user-controllable fields per `schemas/tasks.py` L51-65: title, description, priority(1-5), quadrant(do/plan/delegate/drop), approval(auto/awaiting_approval), risk(low/medium/high), dry_run, model, execution_mode(interactive/classic/stream), skill, scheduled_for, schedule_id |
| TPNL-03 | SchedulesCard list | GET `/api/schedules?limit=50` | `ScheduleListResponse { items: ScheduleListItem[], total }` [`schemas/schedules.py` L31-33] | **30s poll**; ScheduleListItem includes `next_run_at`, `last_run_at`, `enabled`, `task_template`, `skill` |
| TPNL-03 | Toggle enabled | PATCH `/api/schedules/{id}` body `{ enabled: bool }` | `ScheduleListItem` | Backend recomputes `next_run_at` per Pitfall 7 invariant [`routes/schedules.py` L143] |
| TPNL-03 | Run history (expand) | GET `/api/schedules/{id}/runs?limit=20` | `ScheduleRunsResponse { items: TaskListItem[], total }` [`schemas/schedules.py` L52-56] | 404 if schedule missing (distinguishes from empty); render via `<DataTable>` inside `<CollapsibleSection>` |
| TPNL-04 | ScheduleComposer create | POST `/api/schedules` body `ScheduleCreate` | `ScheduleListItem` 201 | name(unique→409 on dup), cron(422 on invalid), enabled(default true), task_template(dict — Phase 8 dispatcher reads this when materializing the run), skill(optional) |
| TPNL-04 | ScheduleComposer edit | PATCH `/api/schedules/{id}` | `ScheduleListItem` | Same field set, all optional |
| TPNL-04 | NL → cron parse | POST `/api/schedules/parse-nl` body `{ description }` | `NLCronResponse { cron, description }` | **CORRECTION: path is `parse-nl` NOT `nl-to-cron`** [`routes/schedules.py` L271]. 503 with `error: "natural-language schedules unavailable"` (single message — does NOT distinguish missing-key from invalid-output per V11) |
| TPNL-04 | Skill picker | GET `/api/skills?environment={?}` | `SkillListResponse { items: SkillRow[] }` (no `total` for skills) [`schemas/skills.py` L33-34] | Reuses SKLP-04 cache key for cache hit |
| TPNL-05 | EmergencyStop ENGAGE | POST `/api/system/emergency-stop` (no body) | `EmergencyStopResponse { emergency_stop: true, terminated_pids: int[], skipped_pids: int[], missing_pids: int[], failed_running_tasks }` [`schemas/system.py` L89-101] | UI displays the count summary in a toast / inline status |
| TPNL-05 | EmergencyStop CLEAR | POST `/api/system/emergency-resume` (no body) | `EmergencyResumeResponse { emergency_stop: false }` | **CORRECTION: this is POST `/api/system/emergency-resume` NOT DELETE** [`routes/system.py` L437]. The DB row is UPDATEd to `value='0'`, never deleted (Plan 04-05 decision STATE.md L172) |
| TPNL-05 | Banner state poll | GET `/api/system/state?key=emergency_stop` | `SystemStateResponse { items: { emergency_stop: "0" | "1" } }` | 5s poll while banner mounted; key is whitelisted in SAPI-03 [`routes/system.py` L60-67]. Returns `{items: {}}` if key never set (UI treats absent = "0" = inactive) |

### SKLP-01..04 — Skills page

| Req | Card | Method + Path | Response | Notes |
|-----|------|---------------|----------|-------|
| SKLP-01 | MCPPanel | GET `/api/mcp` (servers) + GET `/api/mcp/{server}/tools` (drill-down) | `McpServerListResponse` + `McpToolsResponse` [`schemas/mcp.py`] | **REUSES `frontend/src/components/panels/McpPanel.tsx` AS-IS** (Phase 6 close decision STATE.md L250). 120s poll on list; on-demand on tools |
| SKLP-02 | SkillCostCard | **NO ENDPOINT — defer to v2** | — | No `claude_code.skill_invoked` event in current ingest (Plan 06-01 punt STATE.md L212); ship a "Coming in v2" placeholder card mirroring TopSkills (STATE.md L246 v2-deferral pattern) |
| SKLP-03 | ContextHealthCard | **NEW: GET `/api/context/health` (Wave 0)** | New Pydantic model `ContextHealthResponse { settings_path, settings_exists, claude_md_path, claude_md_exists, claude_md_lines, settings_keys, mcp_server_count, hook_count, settings_keys_redacted }` | Shipped in Wave 0; secret redaction MANDATORY (PITFALLS.md L258); 60s poll (file changes are rare) |
| SKLP-04 | SkillsRegistry | GET `/api/skills` + PATCH `/api/skills/{name}/autonomy` | `SkillListResponse` + `SkillAutonomyResponse` [`schemas/skills.py`] | 60s poll; autonomy patch optimistically updates the row; rollback on 422 (Literal["auto","review","manual"]) or 400 (regex/dotdot) or 404 |
| (refresh) | Skills resync | POST `/api/skills/sync` | `SkillSyncResponse { status, found, upserted, unchanged, errors, duration_ms }` | Single-flight 409; surface as a "Refresh" button in the SkillsRegistry header |
| (refresh) | MCP resync | POST `/api/mcp/sync` | `McpSyncResponse` | Single-flight 409; "Refresh" button in McpPanel header |
| (resync) | MCP measure | POST `/api/mcp/measure` | `McpMeasureResponse` | Optional admin action; recommend NOT surfacing in v1 UI (run via curl from CLI) — keeps Phase 7 surface tight |

### Auxiliary endpoints used inside panels

| Inside panel | Endpoint | Notes |
|--------------|----------|-------|
| AttentionBar (Phase 7 extension) | GET `/api/attention` (already polled — `useAttention` 10s) | Phase 7 EXTENDS rendering of `pending_decisions` and `failed_tasks` (currently hardcoded zero in routes/system.py L231-232 — Phase 7 should populate them from real Phase-4 data via a TWO-LINE backend tweak: `select(func.count()).where(Decision.status=='pending')` + `select(func.count()).where(Task.status=='failed')`. Same pattern, no new endpoint) |

## Architecture Patterns

### System Architecture Diagram

```
                        ┌─────────────────────────────────────────────┐
                        │            User Browser (one tab)           │
                        │                                             │
                        │  /skills route (Phase 7 territory)          │
                        │   ├─ DecisionsCard ──┐                      │
                        │   ├─ InboxCard ──────┤                      │
                        │   ├─ TaskBoard ──────┤   useDecisions()     │
                        │   ├─ SchedulesCard ──┤   useInbox()         │
                        │   ├─ McpPanel ───────┤   useTasks()         │
                        │   ├─ SkillCostCard ──┤   useSchedules()     │
                        │   ├─ ContextHealth ──┤   useSkills()        │
                        │   └─ SkillsRegistry ─┘   useContextHealth() │
                        │                          (lib/queries.ts)   │
                        │                                             │
                        │  Mounted overlays (portals to body):        │
                        │   ├─ <Sheet> TaskComposer  (TPNL-02)        │
                        │   ├─ <Sheet> ScheduleComposer (TPNL-04)     │
                        │   └─ <AlertDialog> task-delete confirm      │
                        │                                             │
                        │  Always-mounted in <NavBar> (AppShell):     │
                        │   └─ EmergencyStopBanner (TPNL-05)          │
                        │       └─ inline arm-and-confirm + 5s timer  │
                        └────────────────┬────────────────────────────┘
                                         │ HTTP (TanStack Query — fetch)
                                         │ JSON request/response
                                         │ {error: detail} on 4xx/5xx
                                         ▼
                        ┌─────────────────────────────────────────────┐
                        │       FastAPI app (localhost:8765)          │
                        │                                             │
                        │  All Phase-4 routers ALREADY shipped:       │
                        │   ├─ /api/decisions         (HITL-01..03)   │
                        │   ├─ /api/inbox             (HITL-04..07)   │
                        │   ├─ /api/tasks             (TASK-01..06)   │
                        │   ├─ /api/dispatcher/trigger (TASK-07)      │
                        │   ├─ /api/schedules         (SCHD-01..06)   │
                        │   ├─ /api/system/emergency-stop  (ESTOP-01) │
                        │   ├─ /api/system/emergency-resume (ESTOP-04)│
                        │   ├─ /api/skills            (SKIL-01..03)   │
                        │   └─ /api/mcp               (MCP-01..04)    │
                        │                                             │
                        │  NEW in Phase 7 Wave 0:                     │
                        │   └─ /api/context/health    (SKLP-03)       │
                        │       └─ reads ~/.claude/settings.json      │
                        │       └─ counts CLAUDE.md lines             │
                        │       └─ REDACTS *KEY*/*TOKEN*/*SECRET*     │
                        │                                             │
                        │  Backend writes ALSO go through:            │
                        │   ├─ cmc.core.queue (decision/inbox JSONL)  │
                        │   ├─ cmc.core.process (PID scan + SIGTERM)  │
                        │   ├─ cmc.tasks.transitions (matrix)         │
                        │   ├─ cmc.tasks.spawn (subprocess.Popen)     │
                        │   ├─ cmc.schedules.cron (croniter validate) │
                        │   └─ cmc.schedules.nlcron (Anthropic Haiku) │
                        └────────────────┬────────────────────────────┘
                                         │
                                         ▼
                        ┌─────────────────────────────────────────────┐
                        │         SQLite (data/cmc.db, WAL)           │
                        │  decisions, inbox, tasks, schedules,        │
                        │  system_state, skills, mcp_stats, sessions  │
                        └─────────────────────────────────────────────┘
                                         │
                                         ▼ (Phase 8 will consume)
                        ┌─────────────────────────────────────────────┐
                        │  .tmp/mission-control-queue/{decisions,     │
                        │  inbox,messages,pids}/                      │
                        │  ▲ Phase 7 ONLY produces decisions/+inbox/  │
                        │    queue files via answer/reply paths.      │
                        │    Dispatcher consumption is Phase 8.       │
                        └─────────────────────────────────────────────┘
```

### Component Responsibilities

| File | Wave | Owns |
|------|------|------|
| `frontend/src/components/ui/AlertDialog.tsx` | 0 | New primitive — Radix AlertDialog wrapper with action+cancel slots; aria-labelledby on title |
| `frontend/src/components/shell/EmergencyStopBanner.tsx` | 0 | TPNL-05 inline 2-step arm-and-confirm; mounted inside `<NavBar>` |
| `frontend/src/components/panels/ContextHealthCard.tsx` | 0 (consumes new endpoint) | SKLP-03 read-only display |
| `frontend/src/components/panels/DecisionsCard.tsx` | 1 | HPNL-01 — list + answer modal/inline-form |
| `frontend/src/components/panels/InboxCard.tsx` | 1 | HPNL-02 — list + read-toggle + reply box |
| `frontend/src/components/panels/SkillsRegistry.tsx` | 1 | SKLP-04 — DataTable + autonomy select per row |
| `frontend/src/components/panels/SkillCostCard.tsx` | 1 | SKLP-02 — v2 placeholder (no backend) |
| `frontend/src/components/panels/TaskBoard.tsx` | 2 | TPNL-01 — 3 columns + per-row actions |
| `frontend/src/components/panels/TaskComposer.tsx` | 2 | TPNL-02 — Sheet body wrapping the form |
| `frontend/src/components/panels/SchedulesCard.tsx` | 2 | TPNL-03 — list + cronstrue preview + run-history collapse |
| `frontend/src/components/panels/ScheduleComposer.tsx` | 2 | TPNL-04 — Sheet body wrapping time/day/cron-preview form |
| `frontend/src/lib/api.ts` | 0 (extension) | Tighten 7 currently-`unknown` endpoint families to typed responses (HITL/Tasks/Schedules/Skills/MCP-write/ESTOP/Sync) |
| `frontend/src/lib/queries.ts` | 0 (extension) | Add `useDecisions`, `useInbox`, `useTasks`, `useSchedules`, `useSkills`, `useContextHealth`, `useScheduleRuns(id)`; mutations: `useAnswerDecision`, `useReadInbox`, `useReplyInbox`, `useCreateTask`, `usePatchTask`, `useDeleteTask`, `useApproveTask`, `useRerunTask`, `useTriggerDispatcher`, `useCreateSchedule`, `usePatchSchedule`, `useDeleteSchedule`, `useParseNlCron`, `usePatchSkillAutonomy`, `useSkillsSync`, `useMcpSync`, `useEmergencyStop`, `useEmergencyResume` |
| `frontend/src/components/ui/CommandPalette.tsx` | 2 (edit) | Wire "Quick task" `onSelect` to `setTaskComposerOpen(true)` — grep marker `// Phase 7 wires TaskComposer (TPNL-03)` already present at L84 |
| `frontend/src/components/panels/AttentionBar.tsx` | 2 (edit) | Extend rendering to surface `pending_decisions` + `failed_tasks` (real values once Phase 7 backend tweak lands) |
| `frontend/src/components/shell/NavBar.tsx` | 0 (edit) | Insert `<EmergencyStopBanner />` |
| `frontend/src/routes/skills.tsx` | full overhaul (2 plans) | Replace PlaceholderCardGrid usage with real panels + DELETE PlaceholderCardGrid import when last placeholder is replaced |
| `backend/cmc/api/routes/context.py` | 0 (NEW) | SKLP-03 `/api/context/health` route |
| `backend/cmc/api/schemas/context.py` | 0 (NEW) | `ContextHealthResponse` Pydantic model |
| `backend/cmc/api/routes/__init__.py` | 0 (edit) | Append `context_router` to `all_routers()` |
| `backend/cmc/api/routes/system.py` | 0 (edit, 2 lines) | Replace `pending_decisions=0` + `failed_tasks=0` with real `SELECT COUNT(*)` queries against `decisions WHERE status='pending'` and `tasks WHERE status='failed'` (closes Plan 06-02 STATE.md L227 deferral) |
| `backend/tests/test_phase7_*.py` | each plan | Per-plan test files; follow Phase 4/6 split convention |

### Recommended Project Structure (additions)

```
frontend/src/
├── components/
│   ├── shell/
│   │   ├── EmergencyStopBanner.tsx    # NEW Wave 0 — TPNL-05
│   │   └── NavBar.tsx                 # EDIT Wave 0 — mount banner
│   ├── ui/
│   │   └── AlertDialog.tsx            # NEW Wave 0 — Radix wrapper
│   └── panels/
│       ├── DecisionsCard.tsx          # NEW Wave 1 — HPNL-01
│       ├── InboxCard.tsx              # NEW Wave 1 — HPNL-02
│       ├── ContextHealthCard.tsx      # NEW Wave 0 — SKLP-03
│       ├── SkillsRegistry.tsx         # NEW Wave 1 — SKLP-04
│       ├── SkillCostCard.tsx          # NEW Wave 1 — SKLP-02 v2 placeholder
│       ├── TaskBoard.tsx              # NEW Wave 2 — TPNL-01
│       ├── TaskComposer.tsx           # NEW Wave 2 — TPNL-02
│       ├── SchedulesCard.tsx          # NEW Wave 2 — TPNL-03
│       ├── ScheduleComposer.tsx       # NEW Wave 2 — TPNL-04
│       └── (10 new entries appended to index.ts barrel)
├── lib/
│   ├── api.ts                          # EDIT — tighten 7 endpoint families
│   ├── queries.ts                      # EDIT — add ~22 hooks + mutations
│   └── cron-utils.ts                   # NEW — pure helpers: { partsToCron, cronToParts, prettyCron(via cronstrue) }
└── routes/
    └── skills.tsx                      # EDIT (2 plans) — full overhaul

backend/cmc/
├── api/routes/
│   ├── context.py                      # NEW Wave 0 — SKLP-03
│   ├── system.py                       # EDIT — populate pending_decisions/failed_tasks
│   └── __init__.py                     # EDIT — register context_router
└── api/schemas/
    └── context.py                      # NEW Wave 0
```

### Pattern 1: Sheet composer (TPNL-02 + TPNL-04)

**What:** A Sheet wrapping a bespoke `<form>` with native HTML controls. State is per-component `useState`; submit triggers a TanStack `useMutation`; success closes the sheet + invalidates the list query; failure surfaces error inline (no toast).

**When to use:** TaskComposer (TPNL-02), ScheduleComposer (TPNL-04). Any future write-modal.

**Example:**
```tsx
// frontend/src/components/panels/TaskComposer.tsx
import { Sheet, Button } from '../ui'
import { useCreateTask } from '../../lib/queries'
import { storage } from '../../lib/storage'
import { useEffect, useState, FormEvent } from 'react'
import type { TaskCreate } from '../../lib/api'

const DRAFT_KEY = 'composer.task.draft'

interface TaskComposerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TaskComposer({ open, onOpenChange }: TaskComposerProps) {
  const mutation = useCreateTask()
  const [form, setForm] = useState<TaskCreate>(() => {
    const draft = storage.get<TaskCreate>(DRAFT_KEY)
    return draft ?? defaultTaskForm()
  })

  // Persist draft on every change
  useEffect(() => { storage.set(DRAFT_KEY, form) }, [form])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.title.trim() || mutation.isPending) return
    mutation.mutate(form, {
      onSuccess: () => {
        storage.remove(DRAFT_KEY)
        setForm(defaultTaskForm())
        onOpenChange(false)
      },
    })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New task"
      description="All fields except title are optional."
    >
      <form onSubmit={handleSubmit} className="cmc-composer">
        <label className="cmc-label" htmlFor="task-title">Title</label>
        <input
          id="task-title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required maxLength={200} className="cmc-input"
        />
        {/* ...remaining 8 fields: description (textarea), model (input),
            execution_mode (select default 'interactive'), priority (number 1-5),
            quadrant (select), risk (select), approval (select), dry_run (checkbox) */}
        {mutation.isError ? (
          <p role="alert" className="cmc-composer__error">
            {mutation.error instanceof Error ? mutation.error.message : 'Save failed'}
          </p>
        ) : null}
        <div className="cmc-composer__actions">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={mutation.isPending || !form.title.trim()}>
            {mutation.isPending ? 'Saving…' : 'Create task'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function defaultTaskForm(): TaskCreate {
  return {
    title: '',
    description: '',
    priority: 3,
    quadrant: null,
    approval: 'auto',
    risk: null,
    dry_run: false,
    model: null,
    execution_mode: 'interactive',
    skill: null,
    scheduled_for: null,
    schedule_id: null,
  }
}
```

### Pattern 2: Optimistic mutation with rollback

**What:** TanStack Query `useMutation` with `onMutate` snapshot + `onError` rollback. Used for actions where instant feedback matters (HITL answer, task approve, inbox read, skill autonomy).

**Example:**
```tsx
// frontend/src/lib/queries.ts (excerpt)
export function usePatchSkillAutonomy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, autonomy }: { name: string; autonomy: 'auto'|'review'|'manual' }) =>
      api.skillAutonomy(name, { autonomy }),
    onMutate: async ({ name, autonomy }) => {
      await qc.cancelQueries({ queryKey: qk.skills() })
      const prev = qc.getQueryData<SkillListResponse>(qk.skills())
      if (prev) {
        qc.setQueryData<SkillListResponse>(qk.skills(), {
          ...prev,
          items: prev.items.map((s) => (s.name === name ? { ...s, autonomy } : s)),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.skills(), ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.skills() }),
  })
}
```

### Pattern 3: 2-step arm-and-confirm (TPNL-05 inline)

**What:** State machine `'idle' → 'armed' → 'firing' → 'idle'`. Click 1 transitions idle→armed and starts a 5s timer that re-disarms. Click 2 (within 5s) transitions armed→firing and calls the mutation.

**Example:**
```tsx
// frontend/src/components/shell/EmergencyStopBanner.tsx
import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui'
import { useEmergencyStop, useSystemState } from '../../lib/queries'

type ArmState = 'idle' | 'armed' | 'firing'

export function EmergencyStopBanner() {
  const [state, setState] = useState<ArmState>('idle')
  const armTimerRef = useRef<number | null>(null)
  const flag = useSystemState('emergency_stop')  // returns "0" / "1" / undefined
  const stopMutation = useEmergencyStop()

  function disarm() {
    setState('idle')
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current)
      armTimerRef.current = null
    }
  }

  function handleClick() {
    if (flag.data?.items?.emergency_stop === '1') {
      // already engaged — show resume affordance instead
      return
    }
    if (state === 'idle') {
      setState('armed')
      armTimerRef.current = window.setTimeout(disarm, 5_000)
      return
    }
    if (state === 'armed') {
      setState('firing')
      stopMutation.mutate(undefined, {
        onSettled: () => disarm(),
      })
    }
  }

  // Cleanup on unmount (StrictMode-safe)
  useEffect(() => () => { if (armTimerRef.current !== null) clearTimeout(armTimerRef.current) }, [])

  const engaged = flag.data?.items?.emergency_stop === '1'
  const label =
    engaged ? 'Emergency stop ENGAGED — click to resume' :
    state === 'idle' ? 'Emergency stop' :
    state === 'armed' ? 'Click again within 5s to STOP all tasks' :
    'Stopping…'
  return (
    <Button
      variant={state === 'armed' || engaged ? 'primary' : 'secondary'}
      className={`cmc-estop cmc-estop--${state} ${engaged ? 'cmc-estop--engaged' : ''}`}
      onClick={engaged ? () => /* resume mutation */ : handleClick}
      aria-label={engaged ? 'Resume from emergency stop' : `Emergency stop, ${state}`}
    >
      {label}
    </Button>
  )
}
```

CSS contract (`styles.css` Wave 0 section):
- `.cmc-estop--idle` — neutral-surface background
- `.cmc-estop--armed` — `--cmc-status-red` background, pulsing animation
- `.cmc-estop--firing` — disabled visual; spinner-like pulse
- `.cmc-estop--engaged` — solid `--cmc-status-red`, white text

### Pattern 4: Live cron preview (TPNL-04)

**What:** As user adjusts day-chips and time-input, compute the cron string locally and feed it to cronstrue for a human description. NO server round-trip per keystroke. The preview reads "Couldn't read this cron" if cronstrue throws.

**Example:**
```tsx
// frontend/src/lib/cron-utils.ts
import cronstrue from 'cronstrue'

/** Build a 5-field cron from the composer's structured inputs. */
export function partsToCron({ minute, hour, days }: {
  minute: number, hour: number, days: ReadonlyArray<0|1|2|3|4|5|6>
}): string {
  const dow = days.length === 0 || days.length === 7 ? '*' : [...days].sort().join(',')
  return `${minute} ${hour} * * ${dow}`
}

export function prettyCron(cron: string): { ok: true, text: string } | { ok: false, error: string } {
  try {
    const text = cronstrue.toString(cron, { throwExceptionOnParseError: true, use24HourTimeFormat: true })
    return { ok: true, text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid cron' }
  }
}
```

### Anti-Patterns to Avoid

- **Decoupling cadence from `lib/queries.ts`** — never inline `refetchInterval` in a panel; always add a hook to `lib/queries.ts` (Plan 06-01 entry contract STATE.md L217). Phase 7 panels MUST follow this pattern.
- **Hand-rolling cron description** — supports `0 9 * * 1-5` only at obvious cost; cronstrue covers every valid 5-field expression. The 42KB delta is acceptable for the dashboard's localhost-only context.
- **Reading `~/.claude/settings.json` from the browser** — impossible (browser sandbox); the SKLP-03 endpoint is mandatory. Even with a hypothetical File API trick: secret redaction MUST be server-side per PITFALLS.md L258.
- **Calling `r.json()` on DELETE 204** — TASK-04 returns no body; `fetchJson<T>` will throw. The mutation handler should return `void` and skip the parse.
- **Stacking Sheet over Sheet** — happens if user opens TaskComposer from inside a Sheet drawer. Avoid by closing the parent first OR using `<AlertDialog>` for the inner confirm (different aria role; Radix manages focus stack correctly).
- **Polling `/api/system/state?key=emergency_stop` faster than 5s** — banner needs visibility but the flag is stable for minutes at a time; 5s matches the spec's "decisions" cadence and avoids bursting the API on a panel that mounts globally.
- **Composer drafts persisted across users** — the dashboard is single-user single-machine, so this is not a concern, BUT: drafts SHOULD clear on submit/cancel/Esc-close to avoid stale form state surprising the user on next open.
- **Optimistic UI for Schedule create** — schedule POST validates cron server-side and may return 422; `onMutate` adds a row that disappears on error, surprising the user. **Recommend: NOT optimistic for create paths** — show a "Saving…" button state and let the server confirm. Optimistic is fine for *patches* (autonomy, enabled toggle, task approve) where the source row already exists.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron expression description | Custom string formatter | **cronstrue 3.14.0** | 4 ranges + lists + steps + named months/days = ~500 lines well-tested code; cronstrue is 0 deps, 42KB, English-only by default |
| 2-step destructive confirm aria | Bespoke `<div role="alertdialog">` | **@radix-ui/react-alert-dialog** | Focus management, Escape handling, focus return on close, aria-labelledby/describedby; reuses existing `react-dialog` install (~5KB delta) |
| Time picker | Bespoke hour+minute selects | **Native `<input type="time">`** | Universal browser support; "HH:MM" string out; styles via `cmc-input` |
| Cron validation | Re-implement croniter rules | **Backend already validates (422)** | UI previews via cronstrue (which is permissive) — server is the gate; show inline error from backend response |
| Idempotent inbox-read | Local state tracking | **Backend HITL-06 idempotent** | Re-call returns same `read_at`; client just calls and trusts |
| Decision deduplication | Local cache check | **Backend INSERT OR IGNORE on dedup_key** | Phase 7 isn't creating decisions; dispatcher (Phase 8) is; HPNL-01 only LISTS + ANSWERS |
| PID validation pre-SIGTERM | Frontend filter list | **Backend `cmc.core.process.emergency_stop_all` validates** | `ps -p PID -o command=` must contain BOTH `claude` AND ` -p` (Plan 04-05 PID rule STATE.md L173); frontend never sees PIDs in v1 |
| Path traversal blocking on skill / mcp names | Frontend regex | **Backend already enforces** | `^[a-zA-Z0-9_-]+$` + `..` substring check on every path-bound endpoint (STATE.md L153); frontend uses `encodeURIComponent` and trusts |
| Sheet stacking focus management | Manual focus refs | **Don't stack — use AlertDialog inside Sheet, OR close parent first** | Radix delegates focus stack to its FocusScope; nested Dialogs work but inverting (Dialog opens Sheet) is simpler |

**Key insight:** Phase 7 is overwhelmingly a *binding* phase — every contract is locked, every primitive exists, every backend endpoint ships. The two new dependencies (cronstrue + react-alert-dialog) close real gaps that hand-rolling would underserve. The single new backend endpoint (SKLP-03) solves a security constraint (redaction MUST be server-side), not a missing-domain-knowledge problem.

## Common Pitfalls

### Pitfall 1: Modal-from-Sheet focus trap stacking

**What goes wrong:** TaskBoard shows a "Delete?" `<AlertDialog>` opened from a row inside the page (no Sheet involved — works fine). But: TaskComposer (Sheet) has a "Cancel" button that opens an `<AlertDialog>` "Discard draft?" — and user-controlled focus traps now stack two deep. Radix manages this via `FocusScope` (one stack-per-Dialog) but the *visual* result can confuse: pressing Esc dismisses the AlertDialog only, not the Sheet, even though the user expected both to close.
**Why it happens:** Radix's FocusScope intentionally pops one level on Esc; the *outer* Sheet stays open.
**How to avoid:** v1 — don't open AlertDialog from inside Sheet. Discard-draft on Cancel is a no-op if the draft is already persisted to localStorage (it survives Sheet close anyway). Reopen the Sheet next time and the draft restores. Only the TaskBoard's *row-level* delete uses AlertDialog (no Sheet involved).
**Warning signs:** `document.body.querySelectorAll('[role="dialog"], [role="alertdialog"]').length > 1` in tests.

### Pitfall 2: Optimistic answer collision with server 409

**What goes wrong:** User clicks "Answer" on a decision; optimistic UI marks it answered locally; another tab (Telegram bot, CLI) just answered the same decision; server returns 409 "already answered"; rollback restores the row; the user's submitted answer is lost in the rollback.
**Why it happens:** Optimistic UI snapshots the OLD state, not the user's input. On rollback, the user's `answer` text disappears.
**How to avoid:** For HITL answer specifically, do NOT use optimistic UI. Show a "Submitting…" inline state on the answered button; on success, refetch the list (which will already have the row marked answered); on 409, surface the body text "decision already answered" inline and refetch the list to update visually. Optimistic is fine for *idempotent* mutations (inbox read, skill autonomy patch); it's risky for *generative* ones (decisions answer, task create, schedule create).
**Warning signs:** Tests showing user input lost across rollback boundaries.

### Pitfall 3: Cron preview against an invalid string the user is mid-typing

**What goes wrong:** User types `0 9 * *` (4 fields) into the advanced cron input; cronstrue throws "Invalid cron expression"; preview line shows red error; user is mid-keystroke and feels punished.
**Why it happens:** cronstrue throws on parse error by default (`throwExceptionOnParseError: true`).
**How to avoid:** Wrap the cronstrue call in try/catch (the `prettyCron` helper above does this). When `ok: false`, render the preview as `<span class="cmc-text-subtle">Keep typing…</span>` instead of a red error, UNTIL the user blurs the field. On blur, surface the error if still invalid. Backend POST 422 is the final gate; the cronstrue preview is a UX assist, not a validator.
**Warning signs:** Red error text flickering on every keystroke during composer flow.

### Pitfall 4: Mutating the system_state emergency_stop key from frontend

**What goes wrong:** Developer sees `GET /api/system/state?key=emergency_stop` returns the flag and assumes there's a parallel `PATCH /api/system/state?key=emergency_stop&value=1`. There isn't (and there shouldn't be — SAPI-03 is read-only by design). They wire a `useSystemStateMutation` to a phantom endpoint; gets 404 / 405; debugs for an hour.
**Why it happens:** SAPI-03 is whitelist-protected READ; ESTOP-01..04 are dedicated WRITE endpoints. Two separate routers handle the same KV.
**How to avoid:** Use `POST /api/system/emergency-stop` and `POST /api/system/emergency-resume` exclusively for writes. Document this in `lib/queries.ts` for the next developer.
**Warning signs:** Network tab showing 404 / 405 on system/state PATCH attempts.

### Pitfall 5: Server-side redaction bypass via direct settings.json read

**What goes wrong:** SKLP-03 ContextHealthCard developer (or a future contributor) decides "let me just `fetch('/Users/me/.claude/settings.json')` directly" via a hypothetical static-file route, bypassing the redaction. ANTHROPIC_API_KEY ends up rendered on screen.
**Why it happens:** PITFALLS.md L258's redaction policy is non-obvious; it's a *security control* not a UX preference.
**How to avoid:** Plan 07 Wave 0's SKLP-03 backend route is the ONLY surface that exposes settings.json content. The route response shape includes ONLY `settings_keys: string[]` (key NAMES) and aggregate counts; the route NEVER returns `settings_values`. Add a backend-side test asserting that a settings.json containing `ANTHROPIC_API_KEY=sk-ant-...` produces a response where `settings_keys` includes the literal `"ANTHROPIC_API_KEY"` but NO field carries the value. Reject contributions that add a `settings_values` field.
**Warning signs:** Code review comment "let's also surface the value of FOO" — push back.

### Pitfall 6: Sheet draft persistence keying collision

**What goes wrong:** Two composers (Task, Schedule) both write to `cmc.composer.draft`; closing one Sheet wipes the other's draft.
**Why it happens:** Insufficient namespacing.
**How to avoid:** Use distinct keys: `cmc.composer.task.draft`, `cmc.composer.schedule.draft`. The `composer.draft` shape from STATE.md L200 is the *prefix recipe*, not a literal key.

### Pitfall 7: AttentionBar pending_decisions shape change breaking Phase 6 contract

**What goes wrong:** Phase 6 AttentionBar v1 has an inline comment "ignore pending_decisions / failed_tasks until Phase 7" (Plan 06-02 STATE.md L227). Phase 7 plan 07-04 (or wherever AttentionBar gets extended) ALSO needs to land the backend change that populates these counters. Without coordination, the frontend extends to render zeros and the user sees no behavior change — the work appears wasted.
**Why it happens:** Backend tweak (replacing two `= 0` lines in `routes/system.py`) MUST land in the same wave as the frontend extension or the frontend has nothing real to render.
**How to avoid:** Wave 2 plan 07-04 (or wherever) bundles BOTH the backend two-line tweak AND the AttentionBar render extension. Backend test in same plan: seed pending decision + failed task, GET /api/attention, assert counts > 0.
**Warning signs:** Frontend ships, AttentionBar still shows nothing, blame goes to the wrong layer.

### Pitfall 8: Cronstrue + Recharts double-bundle bloat

**What goes wrong:** Phase 6 added Recharts (~95KB gzipped); Phase 7 adds cronstrue (~42KB minified ≈ ~12KB gzipped). Combined vendor.js exceeds psychological 200KB threshold for SPA performance.
**Why it happens:** Each library tree-shakes well alone; combined they don't share code.
**How to avoid:** Verify in Wave 0: `npm run build` and inspect dist/assets/index-*.js gzipped size. Threshold for warning: vendor.js > 250KB gzipped. cronstrue 3.x supports per-locale entry points (`cronstrue/i18n/en` etc) so we get English-only by default just by importing the default export. No action needed unless build verification surfaces a regression.
**Warning signs:** Build size jumps > 50KB gzipped.

### Pitfall 9: Schedule run-history N+1 on board mount

**What goes wrong:** SchedulesCard shows 10 rows; each row's CollapsibleSection lazy-loads its run history; user expands 5 → 5 sequential GETs. Acceptable. But: developer "helpfully" prefetches all 10 → 10 simultaneous GETs against `useScheduleRuns(id)`.
**Why it happens:** Premature optimization.
**How to avoid:** `useScheduleRuns(id, enabled: open)` — only fires when the row is expanded. Mirrors `useMcpTools(server, true)` lazy-fetch pattern (`McpPanel.tsx` L121).
**Warning signs:** Network tab shows N=row-count GETs to `/api/schedules/*/runs` on initial load.

### Pitfall 10: `/skills` route header / placeholder retirement asymmetry

**What goes wrong:** Plan 07 lands HPNL/TPNL/SKLP panels on `/skills` over multiple waves. Until the LAST one lands, PlaceholderCardGrid stays mounted with the SHRINKING set of remaining placeholders. If a plan ships only 2 of 3 SKLP-* and forgets to update `SKILLS_SLOTS`, the page renders a placeholder for an already-shipped panel adjacent to the live panel — broken UI.
**Why it happens:** `SKILLS_SLOTS` array in `routes/skills.tsx` is the inverse of "live panels" — both must update in lockstep.
**How to avoid:** Each Phase 7 plan that lands a new panel MUST also remove its `reqId` entry from `SKILLS_SLOTS` AND assert via integration test that `findByText('HPNL-01')` returns the LIVE panel kicker (rendered by `<PanelCard>`), NOT the placeholder card body. The Plan 06-05 placeholder-removal pattern (STATE.md L247 — `lucide-inbox` icon presence as discriminator) extends to Phase 7 — assert count==0 of `lucide-inbox` icons on `/skills` after each new plan.
**Warning signs:** Visual: two cards labeled "HPNL-01" side by side. Tests: integration smoke fails on duplicate-text-match for any reqId.

### Pitfall 11: TaskBoard column boundaries hide `awaiting_approval`

**What goes wrong:** TPNL-01 spec says "3 columns (pending/running/done)". A task in `awaiting_approval` doesn't render in any of the 3 columns; user clicks Refresh and the task vanishes silently. Operator panic.
**Why it happens:** `awaiting_approval` is a 4th status (the transition matrix has 6 states total; 5 in the wild + `awaiting_approval`).
**How to avoid:** Render `awaiting_approval` as a banner above the board ("3 tasks awaiting your approval — [Approve all]") OR add a 4th column OR include them in the `pending` column with a distinguishing badge. Plan must pick one before Wave 2 starts. Recommendation: **above-board banner** (matches Phase-6 AttentionBar pattern) — "awaiting approval" is exceptional and should be visible without a column scan.
**Warning signs:** Task seems to disappear after creation when `approval='awaiting_approval'`.

### Pitfall 12: Cronstrue dayOfWeekStartIndexZero mismatch with croniter

**What goes wrong:** cronstrue defaults `dayOfWeekStartIndexZero=true` (DOW 1 = Monday in standard cron). croniter (backend) also uses standard cron (1=Monday, 0 or 7=Sunday). Should align — but a developer toggling the option for "human friendliness" causes Sunday/Monday confusion in the preview vs. actual fire time.
**Why it happens:** "Helpful" config drift.
**How to avoid:** Document in `cron-utils.ts` that we use cronstrue defaults (matching standard cron and croniter). Add a backend integration test: POST `/api/schedules` with `cron='0 9 * * 1'`, fetch `next_run_at`, assert it's a Monday.
**Warning signs:** Schedule rows where the preview text disagrees with the next-run countdown's day name.

## Code Examples

### Schedule cron preview (live as user types day chips + time)

```tsx
// frontend/src/components/panels/ScheduleComposer.tsx (excerpt)
import { useMemo, useState } from 'react'
import { partsToCron, prettyCron } from '../../lib/cron-utils'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function DayChips({ value, onChange }: {
  value: ReadonlyArray<0|1|2|3|4|5|6>,
  onChange: (next: ReadonlyArray<0|1|2|3|4|5|6>) => void
}) {
  function toggle(d: 0|1|2|3|4|5|6) {
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])
  }
  return (
    <div className="cmc-day-chips" role="group" aria-label="Days of week">
      {DAY_LABELS.map((label, i) => {
        const day = i as 0|1|2|3|4|5|6
        const pressed = value.includes(day)
        return (
          <button
            key={day}
            type="button"
            aria-pressed={pressed}
            onClick={() => toggle(day)}
            className={`cmc-day-chip ${pressed ? 'cmc-day-chip--on' : ''}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function ScheduleComposer(/* props */) {
  const [time, setTime] = useState<string>('09:00')  // "HH:MM"
  const [days, setDays] = useState<ReadonlyArray<0|1|2|3|4|5|6>>([1, 2, 3, 4, 5])
  const [advancedCron, setAdvancedCron] = useState<string>('')

  const computedCron = useMemo(() => {
    if (advancedCron.trim()) return advancedCron.trim()  // user-overridden
    const [h, m] = time.split(':').map(Number)
    return partsToCron({ minute: m, hour: h, days })
  }, [time, days, advancedCron])

  const preview = useMemo(() => prettyCron(computedCron), [computedCron])

  return (
    <Sheet /* ... */>
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      <DayChips value={days} onChange={setDays} />
      <details>
        <summary>Advanced (write your own cron)</summary>
        <input
          type="text"
          placeholder="e.g. */15 9-17 * * 1-5"
          value={advancedCron}
          onChange={(e) => setAdvancedCron(e.target.value)}
        />
      </details>
      <p className="cmc-cron-preview" aria-live="polite">
        {preview.ok ? preview.text : <span className="cmc-text-subtle">Keep typing…</span>}
      </p>
      {/* ...task_template fields, name, skill picker, submit */}
    </Sheet>
  )
}
```

### NL→cron secondary entry point inside the composer

```tsx
// frontend/src/components/panels/ScheduleComposer.tsx (excerpt cont.)
import { useParseNlCron } from '../../lib/queries'

function NLCronInput({ onResolved }: { onResolved: (cron: string) => void }) {
  const [text, setText] = useState('')
  const m = useParseNlCron()
  return (
    <div className="cmc-nl-cron">
      <label className="cmc-label">Or describe in natural language</label>
      <input
        type="text"
        placeholder="every weekday at 9am"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={!text.trim() || m.isPending}
        onClick={() => m.mutate({ description: text }, { onSuccess: (r) => onResolved(r.cron) })}
      >
        {m.isPending ? 'Parsing…' : 'Parse'}
      </Button>
      {m.isError ? (
        <p className="cmc-text-subtle" role="alert">
          {/* surfaces the 503 body literal "natural-language schedules unavailable" */}
          {m.error instanceof Error ? m.error.message : 'NL parsing failed'}
        </p>
      ) : null}
    </div>
  )
}
```

## Polling cadence (Phase 7 additions to lib/queries.ts)

| Class | Hooks | refetchInterval | staleTime | Why |
|-------|-------|-----------------|-----------|-----|
| Decisions | `useDecisions` | **5_000** | 0 | Spec; operator decision-time matters |
| Inbox | `useInbox` | **10_000** | 5_000 | Spec; less time-sensitive than decisions |
| Tasks | `useTasks` | **5_000** | 0 | Success criterion 1 specifies 5s |
| Schedules | `useSchedules` | **30_000** | 20_000 | List rarely changes; 30s refresh covers next-run countdown updates |
| Schedule runs | `useScheduleRuns(id, open)` | **30_000 (when open)** | 20_000 | Lazy-fetched on Collapsible open |
| Skills | `useSkills` | **60_000** | 45_000 | Catalog rarely changes outside resync |
| Context health | `useContextHealth` | **60_000** | 45_000 | settings.json / CLAUDE.md change rarely |
| ESTOP flag | `useSystemState('emergency_stop')` | **5_000** | 0 | Banner is global; 5s matches decisions cadence and avoids burst |
| MCP servers | (already 120_000) | — | — | Reuse Phase 6's `useMcpServers` |

Mutations have no cadence — they invalidate the relevant list on success.

## Sheet vs Dialog vs AlertDialog choice matrix

| Surface | Choice | Rationale |
|---------|--------|-----------|
| TaskComposer (TPNL-02) | Sheet | Slide-out form; matches phase brief "slide-out"; LiveSessionsCard set the precedent |
| ScheduleComposer (TPNL-04) | Sheet | Same |
| TaskBoard delete confirm | AlertDialog | Destructive; aria-alertdialog role; default focus on Cancel |
| EmergencyStop primary action | Inline 2-step button (no modal) | PITFALLS.md L270 verbatim; modal would be over-engineering |
| EmergencyStop "Are you sure?" secondary path (optional) | AlertDialog | Educational copy; describes what STOP does; falls through if user clicks armed button without arm-and-confirm flow |
| Inbox reply | Inline expand within InboxCard row (no modal) | Quick reply; reply text fits in a textarea below the message; matches HPNL-02 spec "reply box" |
| Decisions answer | Modal OR inline expand — DECISION REQUIRED | Phase brief says "answer button/modal"; recommend **inline expand** (matches Inbox pattern; less modal proliferation). Plan can choose modal if visual hierarchy demands it |
| Discard composer draft confirm | None (drafts persist anyway) | localStorage survives; no confirm needed |

## Plan Breakdown (4 plans, 3 waves)

Wave structure follows Phase 5+6 serialization (multiple writers to `lib/api.ts`, `lib/queries.ts`, `components/panels/index.ts`, and `routes/skills.tsx` cannot run unrestricted in parallel):

```
Wave 0: 07-01  (foundation — cronstrue + alert-dialog deps, 1 new ui primitive,
                EmergencyStopBanner mounted in NavBar, types-tightening pass on
                api.ts, lib/queries.ts hook+mutation expansion, SKLP-03 backend
                route + ContextHealthCard, AttentionBar real-data backend tweak)
Wave 1: 07-02  (HITL + Skills page lower half — DecisionsCard, InboxCard,
                SkillsRegistry, SkillCostCard v2 placeholder; partial /skills
                placeholder retirement)             depends_on 07-01
Wave 2: 07-03  (Tasks + composers — TaskBoard, TaskComposer, AttentionBar
                render extension, CommandPalette Quick-task wiring;
                AlertDialog used for task delete)    depends_on 07-01
Wave 2: 07-04  (Schedules — SchedulesCard, ScheduleComposer with cronstrue
                preview + NL-cron fallback; final /skills placeholder retirement
                + PlaceholderCardGrid component file deletion + /skills route
                full re-layout + plan close + Phase-7 entry contract for Phase 8)
                                                    depends_on 07-01
```

**Why this split (NOT 11 plans for 11 reqs):**
- Wave 0 lands every cross-cutting concern in one atomic plan: install deps, type api.ts (touches 7 endpoint families), expand queries.ts with ~22 hooks/mutations, ship SKLP-03 backend route (one new router file + schema), mount the EmergencyStopBanner globally. Splitting these would require partial barrel exports + serialized wave boundaries; one plan keeps boundaries clean.
- Wave 1 (07-02) and Wave 2 (07-03 + 07-04) split along *destination route* lines: 07-02 owns the lower half of `/skills` (HPNL-* + SKLP-04 + SKLP-02 v2 placeholder); 07-03 + 07-04 own the upper half (TPNL-* — TaskBoard + composers + Schedules). Both edit `routes/skills.tsx` so they cannot truly parallel; serialize 07-03 → 07-04 if the planner wants atomic commits per wave.
- 07-04 closes the phase: deletes the last PlaceholderCardGrid usage, deletes the `frontend/src/components/PlaceholderCardGrid.tsx` file (last consumer eliminated), runs the human-verify checkpoint against ROADMAP success criteria 1-5.

### Plan files (estimates)

| Plan | Title | Files touched (est) | New deps | Tests added |
|------|-------|---------------------|----------|-------------|
| **07-01** | Wave 0 — foundation: deps + AlertDialog + EmergencyStopBanner + lib/api types + lib/queries hooks + ContextHealth backend + AttentionBar backend tweak | `frontend/package.json` (+2 deps); `frontend/src/components/ui/{AlertDialog}.tsx` (1 new); `frontend/src/components/ui/index.ts` (append 1 export); `frontend/src/components/shell/{EmergencyStopBanner,NavBar}.tsx` (1 new + edit); `frontend/src/components/panels/ContextHealthCard.tsx` (1 new); `frontend/src/components/panels/index.ts` (append); `frontend/src/lib/{api,queries,cron-utils,storage}.ts` (3 edits + 1 new); `frontend/src/styles.css` (append AlertDialog + EmergencyStopBanner + composer + cron-preview classes); `frontend/src/routes/skills.tsx` (mount ContextHealthCard, remove SKLP-03 from SKILLS_SLOTS); `backend/cmc/api/routes/{context,system}.py` (1 new + edit); `backend/cmc/api/schemas/context.py` (1 new); `backend/cmc/api/routes/__init__.py` (register); `backend/tests/test_phase7_context.py` (new — ~6 tests); `backend/tests/test_phase4_system_estop.py` or `test_phase3_system.py` (extend — assert pending_decisions/failed_tasks populate). **Estimated 15-18 files**. | cronstrue ^3, @radix-ui/react-alert-dialog ^1 | ~14 frontend (AlertDialog 4, EmergencyStopBanner 5, ContextHealthCard 3, cron-utils 2) + ~6 backend |
| **07-02** | Wave 1 — HITL panels + Skills page lower half | `frontend/src/components/panels/{DecisionsCard,InboxCard,SkillsRegistry,SkillCostCard}.tsx` (4 new); `frontend/src/components/panels/index.ts` (append 4); `frontend/src/routes/skills.tsx` (replace HPNL-01/02/SKLP-02/04 placeholders); per-panel tests + integration smoke extension. **Estimated 8-10 files** | none | ~16 |
| **07-03** | Wave 2 — TaskBoard + TaskComposer + AttentionBar extension + CommandPalette wiring | `frontend/src/components/panels/{TaskBoard,TaskComposer,AttentionBar}.tsx` (2 new + edit); `frontend/src/components/panels/index.ts` (append 2); `frontend/src/components/ui/CommandPalette.tsx` (edit — wire onSelect); `frontend/src/routes/skills.tsx` (replace TPNL-01/02 placeholders); per-panel tests; integration smoke extension. **Estimated 8-10 files** | none | ~18 |
| **07-04** | Wave 2 — SchedulesCard + ScheduleComposer + final /skills retirement + plan close | `frontend/src/components/panels/{SchedulesCard,ScheduleComposer}.tsx` (2 new); `frontend/src/components/panels/index.ts` (append 2); `frontend/src/routes/skills.tsx` (replace last placeholders + DELETE PlaceholderCardGrid import); `frontend/src/components/PlaceholderCardGrid.tsx` (DELETE FILE); `frontend/src/components/__tests__/PlaceholderCardGrid.test.tsx` (DELETE FILE); `frontend/src/__tests__/integration.test.tsx` (extend assertions: count==0 of `.lucide-inbox` on `/skills`); per-panel tests + 07-VERIFICATION + Phase-8 entry contract documentation. **Estimated 8-10 files** | none | ~18 |

**Total: ~40-48 files, ~70 tests added on top of existing 170/170 frontend + 202/202 backend.** Realistic agent-time estimate from STATE.md velocity: ~70-90 minutes per plan; ~5-7 hours total agent work for Phase 7.

## Test strategy

Phase 7 follows Phase 6's pattern (vitest + happy-dom + RTL + `setQueryData` for state seeding) with five additions:

| Test type | Coverage | Tooling |
|-----------|----------|---------|
| **Unit — pure helpers** | `partsToCron`, `cronToParts`, `prettyCron`, `redactSecretKeys` (utility for the SKLP-03 backend redaction logic if implemented Python-side; mirror in frontend if needed) | Vitest 4 |
| **Component — composer state** | TaskComposer / ScheduleComposer: form value updates, draft persistence, submit triggers mutation, success closes Sheet, error displays inline; cron preview updates on day-chip toggle | RTL 16 + happy-dom; `setQueryData` for skills picker |
| **Component — optimistic mutation rollback** | Skill autonomy patch: trigger mutation, force fetch failure, assert original autonomy restored from snapshot | Vitest mock fetch |
| **Component — 2-step armed state** | EmergencyStopBanner: click idle→armed, advance fake timers 5_001ms, assert disarm; click armed within 4s, assert mutation fires | `vi.useFakeTimers()` + `vi.advanceTimersByTime` |
| **Backend — SKLP-03 redaction** | seed `~/.claude/settings.json` with `ANTHROPIC_API_KEY=sk-...`, hit `/api/context/health`, assert response includes the key NAME but no value field exists in the schema; assert CLAUDE.md line count is correct | pytest + `monkeypatch.setattr('cmc.api.routes.context.HOME_CLAUDE_DIR', tmp_path)` |
| **Integration — /skills route** | Boot `/skills` via real RouterProvider; preload TanStack cache with fixtures; assert all 11 reqIds appear; assert no `.lucide-inbox` icons (placeholder helper retired); assert PlaceholderCardGrid file deletion (test fails compile if import remains in route file) | RTL + happy-dom |

### MSW vs setQueryData decision

Continue Phase 6's pattern: **`setQueryData` for panel tests, `vi.fn()` URL-aware fetch for routes-level integration smoke**. No MSW dependency added.

### Must-pass set for Phase 7 close

- All Phase 6 tests still pass (170/170 → ~240/240 with Phase 7 additions)
- `npm run typecheck` exits 0 with no new strict errors
- `npm run build` produces a valid `dist/` (chunk sizes recorded in 07-VERIFICATION; vendor.js gzipped within 50KB of pre-Phase-7 baseline)
- Backend tests still pass (202/202 → ~210/210); 07-01's ~6 new SKLP-03 tests + AttentionBar tweak test pass
- Visual checkpoint at end of 07-04: `/skills` shows all 11 panels live; PlaceholderCardGrid retired everywhere; EmergencyStopBanner visible globally in `<NavBar>`; TaskComposer opens via Cmd+K → "Quick task"; ScheduleComposer cron preview updates live as days are toggled

### What we are NOT testing in Phase 7

- Real HTTP integration end-to-end (Phase 9 / TEST-01..04 ships Playwright)
- Subprocess spawn for TASK-07 dispatcher trigger (already tested in Phase 4 with monkeypatched Popen)
- Anthropic SDK call for NL→cron (already tested in Phase 4 with mocked client)
- Visual regression / screenshot diff (out of scope; user-approved visual quality bar covers it)

## Validation Architecture

> nyquist_validation absent in `.planning/config.json` — treat as ENABLED. Phase 7 must include this section per init contract.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 (frontend) + pytest 8.x (backend) — both already configured |
| Config files | `frontend/vitest.config.ts`; `backend/pyproject.toml` |
| Quick run command (frontend) | `cd frontend && NODE_OPTIONS=--no-experimental-webstorage npx vitest run --reporter=basic <pattern>` |
| Full suite (frontend) | `cd frontend && npm test` |
| Quick run command (backend) | `cd backend && uv run pytest tests/test_phase7_<file>.py -x` |
| Full suite (backend) | `cd backend && uv run pytest -x` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HPNL-01 | Decisions list + answer button + 5s polling | component | `npx vitest run src/components/panels/__tests__/DecisionsCard.test.tsx -x` | ❌ Wave 1 |
| HPNL-02 | Inbox list + reply box + 10s polling | component | `npx vitest run src/components/panels/__tests__/InboxCard.test.tsx -x` | ❌ Wave 1 |
| TPNL-01 | TaskBoard 3 cols + approve/rerun/delete | component | `npx vitest run src/components/panels/__tests__/TaskBoard.test.tsx -x` | ❌ Wave 2 |
| TPNL-02 | TaskComposer all fields + create | component | `npx vitest run src/components/panels/__tests__/TaskComposer.test.tsx -x` | ❌ Wave 2 |
| TPNL-03 | SchedulesCard + cron preview + history collapse | component | `npx vitest run src/components/panels/__tests__/SchedulesCard.test.tsx -x` | ❌ Wave 2 |
| TPNL-04 | ScheduleComposer time/day chips + cron preview + NL fallback | component | `npx vitest run src/components/panels/__tests__/ScheduleComposer.test.tsx -x` | ❌ Wave 2 |
| TPNL-05 | EmergencyStopBanner 2-step armed state | component | `npx vitest run src/components/shell/__tests__/EmergencyStopBanner.test.tsx -x` | ❌ Wave 0 |
| SKLP-01 | MCPPanel reuse on /skills | integration | `npx vitest run src/__tests__/integration.test.tsx -x` (assertion extension) | ✅ extends |
| SKLP-02 | SkillCostCard v2 placeholder | component | `npx vitest run src/components/panels/__tests__/SkillCostCard.test.tsx -x` | ❌ Wave 1 |
| SKLP-03 | ContextHealthCard + redaction | component + backend | `npx vitest run src/components/panels/__tests__/ContextHealthCard.test.tsx -x` AND `cd backend && uv run pytest tests/test_phase7_context.py -x` | ❌ Wave 0 |
| SKLP-04 | SkillsRegistry + autonomy patch optimistic | component | `npx vitest run src/components/panels/__tests__/SkillsRegistry.test.tsx -x` | ❌ Wave 1 |

### Sampling Rate
- **Per task commit:** quick run for the file changed (`vitest run src/.../FOO.test.tsx -x` ≤ 30s)
- **Per wave merge:** full suite (`npm test` + `pytest -x`); both must exit 0
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/components/ui/__tests__/AlertDialog.test.tsx` — covers AlertDialog primitive (open/close, focus trap, action/cancel slots)
- [ ] `frontend/src/components/shell/__tests__/EmergencyStopBanner.test.tsx` — covers TPNL-05 armed-state machine
- [ ] `frontend/src/components/panels/__tests__/ContextHealthCard.test.tsx` — covers SKLP-03 frontend
- [ ] `frontend/src/lib/__tests__/cron-utils.test.ts` — covers `partsToCron` / `prettyCron` pure helpers
- [ ] `backend/tests/test_phase7_context.py` — covers SKLP-03 endpoint + redaction

*(All other test files land in their respective Wave-1/2 plans alongside the panel they test.)*

## Security Domain

> security_enforcement absent in `.planning/config.json` — treat as ENABLED.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Localhost-only; no auth model in v1 (PROJECT.md / PITFALLS.md L256) |
| V3 Session Management | no | Same |
| V4 Access Control | yes (read-only secret redaction) | SKLP-03 endpoint redacts ANY env key matching `*KEY*` / `*TOKEN*` / `*SECRET*` (case-insensitive) before serialization (PITFALLS.md L258) |
| V5 Input Validation | yes | Pydantic on every request body; 422 on invalid; backend-side regex + dotdot check on path-bound names (already shipped) |
| V6 Cryptography | no | No new crypto needed |
| V11 Business Logic | yes (NL→cron 503 envelope) | SCHD-06 single 503 message regardless of failure mode (no API key vs invalid output) — already shipped Plan 04-04. Phase 7 frontend MUST surface the body literal, not branch on the failure mode |
| V12 File and Resources | yes | SKLP-03 endpoint reads ONLY `~/.claude/settings.json` and `~/.claude/CLAUDE.md` (or project `./CLAUDE.md`); MUST NOT accept a path query param (Pitfall: directory traversal). Path is hardcoded at module level |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret leak via SKLP-03 | Information Disclosure | Backend redaction list `*KEY*` / `*TOKEN*` / `*SECRET*` case-insensitive; response schema does NOT contain a `values` field (defense-in-depth — even if redaction logic regresses, no values can leak through the schema) |
| Settings.json path traversal | Tampering | Hardcode path at module level (`HOME_CLAUDE_DIR = Path.home() / ".claude"`); no query/path params |
| ESTOP unauthorized invocation | Tampering | Localhost-only binding (Phase 1 contract); no auth needed beyond loopback |
| TaskBoard delete cascading | Tampering | Backend already SET NULLs `tasks.schedule_id` on schedule delete (Plan 04-04 STATE.md L211); task delete is hard delete with no cascade |
| NL-cron prompt injection | Tampering / Information Disclosure | Anthropic system prompt locked (`schedules/nlcron.py` L13-19) with strict output contract; backend re-validates output via croniter; no user data is reflected back |
| Decisions answer race | Repudiation | File-then-DB ordering means dispatcher can resend lost answers; 409 surfaces "already answered" to the late client |

## Sources

### Primary (HIGH confidence)
- **Backend route files** (full read 2026-04-27): `backend/cmc/api/routes/{hitl,tasks,schedules,system,skills,mcp}.py`. Path/method/response shapes for every Phase-7-consumed endpoint verified.
- **Backend schemas** (full read): `backend/cmc/api/schemas/{hitl,tasks,schedules,system,skills,mcp}.py`. Field types verified for `lib/api.ts` tightening.
- **Phase 6 RESEARCH.md** (canonical pattern reference): `.planning/phases/06-observability-activity-panels/06-RESEARCH.md`. PanelCard contract, polling cadence policy, test strategy.
- **STATE.md** (canonical project state): `.planning/STATE.md` L1-300. All upstream contracts and Phase-6 close decisions.
- **PITFALLS.md** (security + UX constraints): `.planning/research/PITFALLS.md` L250-274. SKLP-03 redaction policy and ESTOP 2-step pattern verbatim.
- **Frontend ui barrel**: `frontend/src/components/ui/index.ts` — verified 19 exports (12 Phase-5 + 7 Phase-6 primitives).
- **Frontend panels barrel**: `frontend/src/components/panels/index.ts` — verified 18 exports (4 Wave-2 + 11 Wave-3 + 3 Wave-4 + 3 Wave-5 from Phase 6).
- **`lib/queries.ts`** (full read): `frontend/src/lib/queries.ts`. Cadence policy locked.
- **`lib/api.ts`** (full read): `frontend/src/lib/api.ts`. 7 endpoint families currently `unknown` — Phase 7 narrows.
- **`McpPanel.tsx`** (full read): `frontend/src/components/panels/McpPanel.tsx`. SKLP-01 reuse target; lazy-fetch pattern.
- **`useFirehose.ts`** (full read): `frontend/src/lib/useFirehose.ts`. Test stub pattern for SSE in Phase 7 integration smoke.
- **`PlaceholderCardGrid.tsx`** (file location verified): `frontend/src/components/PlaceholderCardGrid.tsx`. Phase 7 deletes when last consumer goes.

### Secondary (MEDIUM confidence)
- **cronstrue 3.14.0** [VERIFIED via `npm view cronstrue`]: zero deps, 42KB minified, English-only by default. Source: <https://www.npmjs.com/package/cronstrue>; <https://github.com/bradymholt/cRonstrue>.
- **@radix-ui/react-alert-dialog 1.1.15** [VERIFIED via `npm view`]: peer React 19 supported. Source: <https://www.radix-ui.com/primitives/docs/components/alert-dialog>.
- **REQUIREMENTS.md L227-252**: HPNL/TPNL/SKLP requirement text.
- **ROADMAP.md L155-166**: Phase 7 success criteria.

### Tertiary (LOW confidence)
- WebSearch on Radix Dialog stacking + AlertDialog idioms (2026-04-27) — verified against official Radix docs; no contradictions found.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic Card body inlining loading/empty/error JSX | `<PanelCard>` shell with 4-branch matrix (Phase 6 lock) | Plan 06-01 (2026-04-27) | Phase 7 panels MUST follow; copy lives in one place |
| Recharts ResponsiveContainer width=0 in happy-dom | Assert on `.recharts-responsive-container` class + sr-only fallback table | Plan 06-03 (2026-04-27) | Phase 7 has no charts but sr-only-table-as-truth pattern reusable for any future chart |
| `unknown` type for HITL/Tasks/Schedules/Skills/MCP-write/ESTOP/Sync in `lib/api.ts` | Narrowed to typed responses | Phase 7 Plan 07-01 | Speculative typing under tsconfig strict avoided in Phase 5/6; Phase 7 narrows as it consumes |
| `pending_decisions=0` and `failed_tasks=0` hardcoded in `routes/system.py` | Real `SELECT COUNT(*)` queries | Phase 7 Plan 07-03 (alongside AttentionBar render extension) | Closes Plan 06-02 STATE.md L227 deferral |

**Deprecated/outdated:**
- `<PlaceholderCardGrid>` — phase-out tool; deletes when `/skills` retires its last placeholder (Plan 07-04 final task).
- "TPNL-04 (Inline pass-prompt)" mention in `routes/skills.tsx` placeholder comment — outdated; TPNL-04 is the ScheduleComposer slide-out per REQUIREMENTS.md L235. The placeholder docstring is misleading; correct in Plan 07-04.
- Plan 04 brief's "POST /api/schedules/nl-to-cron" / "POST /api/tasks/{id}/trigger" / "DELETE /api/system/emergency-stop" path strings — all wrong; corrected paths above.

## Open Questions

1. **TaskBoard column count for `awaiting_approval`**
   - What we know: Success criterion 1 specifies "3 columns (pending/running/done)". Transition matrix has 6 states; `awaiting_approval` is one of them.
   - What's unclear: Where to render `awaiting_approval` rows.
   - Recommendation: Above-board banner ("3 tasks awaiting your approval — [Approve all]") matching the existing AttentionBar pattern; do NOT add a 4th column.

2. **Decisions answer affordance — modal or inline expand?**
   - What we know: Phase brief says "answer button/modal"; Inbox uses inline expand.
   - What's unclear: Pick one for visual consistency.
   - Recommendation: **Inline expand** — matches HPNL-02 pattern; less modal proliferation. Plan can choose modal if visual hierarchy demands.

3. **AttentionBar real-data backend tweak — Wave 0 or Wave 2?**
   - What we know: 2-line backend tweak (replace `= 0` with `SELECT COUNT(*)`); AttentionBar render extension lives in Wave 2.
   - What's unclear: Bundle the backend tweak with Wave 0 (might be unused for two waves) or Wave 2 (single atomic plan touches frontend + backend).
   - Recommendation: **Wave 2 (07-03)** — single atomic plan; backend tweak unused if frontend not yet extended is acceptable for two waves but cleaner to bundle.

4. **TaskComposer "execution_mode=stream" + SchedulesCard skill picker — is "stream" mode supposed to be selectable from the composer?**
   - What we know: `TaskCreate` schema accepts `Literal["interactive", "classic", "stream"]` (3 options); TPNL-02 spec lists "Interactive default" but doesn't enumerate the dropdown options.
   - What's unclear: Surface all 3 modes or hide stream behind an "Advanced" toggle?
   - Recommendation: **Surface all 3** — Phase 8 dispatcher consumes all 3 (DISP-* spec); no reason to hide a server-supported value.

5. **SKLP-03 ContextHealth source path: `~/.claude/CLAUDE.md` or repo `./CLAUDE.md`?**
   - What we know: REQUIREMENTS.md L251 says "scan of settings.json + CLAUDE.md"; PROJECT.md L37 same; doesn't specify which CLAUDE.md.
   - What's unclear: Home-dir CLAUDE.md (universal) or project CLAUDE.md (the cwd's, varies per session)?
   - Recommendation: **`~/.claude/CLAUDE.md`** for v1 (it's the global one users edit; matches "settings.json" sibling). Project CLAUDE.md is per-cwd which doesn't have a stable meaning in a single-tab dashboard.

6. **NL→cron error path UX — show backend body or generic message?**
   - What we know: Backend returns 503 with body `{ "error": "natural-language schedules unavailable" }`. The body literal does NOT distinguish "no API key" from "invalid model output" (Security V11).
   - What's unclear: Frontend surfaces the body literal verbatim — is that good UX?
   - Recommendation: **Yes, body literal verbatim**. The user (single-machine operator) likely knows whether they set the API key; the message says "set up your key OR rephrase your description" implicitly. No need to differentiate further.

7. **Composer drafts: persist across browser tabs / window close?**
   - What we know: localStorage works across tabs and survives window close.
   - What's unclear: Should it? A user starting a task draft on one tab might be surprised to see it in another.
   - Recommendation: **Yes, persist across tabs and sessions**. Discard on submit / cancel. Single-user single-machine — drafts are convenience, not collaboration.

## Environment Availability

> Phase 7 has minimal external dependencies — only the existing Phase 4 stack + the user's `~/.claude/` directory.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (frontend build) | All Phase 7 frontend | ✓ | (matches Phase 5/6) | — |
| Python uv (backend) | SKLP-03 backend route | ✓ | (matches Phase 4/6) | — |
| `~/.claude/settings.json` | SKLP-03 ContextHealth read | ✓ (typically) | — | If absent, return `settings_exists: false`; never throw |
| `~/.claude/CLAUDE.md` | SKLP-03 ContextHealth read | ✓ (typically) | — | If absent, return `claude_md_exists: false`; never throw |
| `ANTHROPIC_API_KEY` env var | TPNL-04 NL→cron path | varies | — | 503 single-message fallback (already handled — Plan 04-04) |
| `cronstrue@^3` npm package | TPNL-03 / TPNL-04 cron preview | ✗ (not yet installed) | — | Install in Wave 0 |
| `@radix-ui/react-alert-dialog@^1` npm package | TPNL-05 / TaskBoard delete confirm | ✗ (not yet installed) | — | Install in Wave 0 |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `cronstrue` and `@radix-ui/react-alert-dialog` are installed in Plan 07-01 Wave 0 — both verified via `npm view` and confirmed React-19 compatible.

## Things the planner should know that aren't obvious

1. **Three corrections to the phase brief** (already noted in §Summary). Planner MUST honor:
   - NL→cron is `POST /api/schedules/parse-nl`, not `nl-to-cron`.
   - ESTOP clear is `POST /api/system/emergency-resume`, not `DELETE /api/system/emergency-stop`.
   - Dispatcher trigger is `POST /api/dispatcher/trigger`, not `POST /api/tasks/{id}/trigger`.

2. **The CommandPalette grep marker is already in place.** `frontend/src/components/ui/CommandPalette.tsx` L84 has `// Phase 7 wires TaskComposer (TPNL-03)` — Wave 2 plan 07-03 grep-finds it and replaces the `close()` no-op with `setTaskComposerOpen(true)`. Lifting state to a context is one option; mounting TaskComposer at AppShell level (sibling of `<main>` like CommandPalette itself) is another. Recommendation: AppShell-level mount with a context for `setOpen` — keeps the wiring observable.

3. **PlaceholderCardGrid retires in Plan 07-04.** STATE.md L251 says "Helper itself remains until Phase 7 retires the final consumer". 07-04 deletes both the import on `/skills` AND the component file `frontend/src/components/PlaceholderCardGrid.tsx`. Test files importing it (`components/__tests__/PlaceholderCardGrid.test.tsx`) also delete. Integration smoke test extends to assert count==0 of `.lucide-inbox` icons on `/skills`.

4. **The current `routes/skills.tsx` placeholder comment is wrong.** Lines 6-11 say "TPNL-02 (TaskComposer) and TPNL-04 (Inline pass-prompt) and TPNL-05 (EmergencyStop banner) are NOT placed as cards" — this is correct, BUT TPNL-04 is the ScheduleComposer (a slide-out), NOT "Inline pass-prompt". Plan 07-04 fixes the comment.

5. **No `pid` field is exposed in TaskListItem or TaskBoard surface.** `pid` IS in the schema (TaskListItem includes pid), but the dashboard doesn't currently surface it — and shouldn't (Phase 4 PID-validation already requires `claude` + ` -p` substring; exposing PIDs in the UI gives no value to a single-user operator).

6. **Schedule's task_template field is a free-form dict.** Phase 8 dispatcher reads `schedule.task_template` and materializes a Task row from it. ScheduleComposer needs a sub-form that mirrors the TaskCreate fields (title, description, model, mode, priority, etc.) — recommend **embedding the TaskComposer fields inline** within the ScheduleComposer's lower half rather than nesting Sheets. The ScheduleComposer is "create a Schedule whose template is a Task"; conceptually flat.

7. **HITL-02 INSERT OR IGNORE 200-vs-201 is a writer concern, not a reader concern.** Phase 7 panels only LIST + ANSWER decisions; they don't CREATE them. The dashboard should never POST `/api/decisions` in production. (Phase 8 dispatcher does.) This means Phase 7 doesn't have to handle the dual-status response.

8. **TASK-04 returns 204 No Content.** TanStack Query's default behavior for 204 is to set `data` to `undefined`. Mutations should return `void` and not call `r.json()`.

9. **`LiveSessionsCard` precedent for Sheet drawers.** TaskComposer / ScheduleComposer should mirror its shape: `<Sheet>` with title + description + bespoke form body; mutation invalidates the relevant list on success; error surfaces inline (not toast); Cancel button closes via `onOpenChange(false)`. Test pattern: `document.body.querySelectorAll('[role="dialog"]')` because Radix Portal mounts to body.

10. **AttentionBar real-data extension is a **two-line backend change**.** `routes/system.py` lines 231-232: replace
    ```python
    pending_decisions = 0
    failed_tasks = 0
    ```
    with:
    ```python
    pending_decisions = (await db.execute(
        select(func.count()).select_from(Decision).where(Decision.status == "pending")
    )).scalar_one()
    failed_tasks = (await db.execute(
        select(func.count()).select_from(Task).where(Task.status == "failed")
    )).scalar_one()
    ```
    Plus 2 imports: `from cmc.db.models.decisions import Decision`, `from cmc.db.models.tasks import Task`. That's it. Render extension on AttentionBar.tsx adds 2 conditional badges below the existing items.

11. **SKLP-03 ContextHealth backend redaction is a 30-line route.** Pseudocode:
    ```python
    SECRET_PATTERNS = re.compile(r"(?i)(KEY|TOKEN|SECRET|PASSWORD)")
    def redact_keys(items: dict) -> list[str]:
        return [k if not SECRET_PATTERNS.search(k) else f"{k} (redacted)" for k in items.keys()]
    ```
    Response model has `settings_keys: list[str]` (NEVER values), `claude_md_lines: int`, `mcp_server_count: int`, `hook_count: int`, `settings_path: str`, `claude_md_path: str`, exists flags. Test asserts a settings.json containing `ANTHROPIC_API_KEY=sk-ant-...` produces a response with `"ANTHROPIC_API_KEY (redacted)"` in `settings_keys` and NO field anywhere carrying the value `sk-ant-...`.

12. **Phase 7 has no chart panels.** Recharts is used by Phase 6 panels we don't touch; the Phase 7 plans don't add chart imports. Bundle delta is from cronstrue + alert-dialog only.

13. **The `cmc-card-grid` recipe handles SKLP layout for free.** `routes/skills.tsx` final form: header → AttentionBar (already at top of every page? — actually NO, AttentionBar is `/` only; skills page doesn't render it) → `.cmc-card-grid` containing the 11 panels (or fewer — DecisionsCard / InboxCard might want full-width above the grid like LiveSessionsCard does on `/`). **Recommendation: full-width DecisionsCard + InboxCard above the grid** (similar to LiveSessionsCard pattern); `.cmc-card-grid` for the rest.

14. **`MCPPanel` reuse on `/skills` does NOT require code edits to McpPanel.tsx.** It's already exported from the panels barrel, already consumes lib/queries hooks, already PanelCard-shaped. Plan 07-02 (or wherever SKLP-01 lands) just adds `<McpPanel />` to the `/skills` route's grid alongside the new panels.

15. **Phase 7 is the LAST UI-heavy phase.** Phase 8 (Dispatcher) is backend-only; Phase 9 (Telegram + Setup + Tests) is integration. The visual quality bar approval (STATE.md L249) for Phase 6 sets the bar Phase 7 must hold — which is "Linear/Raycast/Vercel-grade data presentation". Cronstrue's plain English output ("Every 5 minutes") fits that bar; modal/sheet animations already locked in Phase 5; TaskBoard 3-column layout uses the existing `cmc-card-grid` with overrides for column-fixed-width.

## Metadata

**Confidence breakdown:**
- Backend contract surface: HIGH — every route file read in full + Pydantic verified; 3 corrections to phase brief uncovered.
- Phase-5/6 primitive reuse: HIGH — barrel verified; Sheet / PanelCard / RangeToggle / DataTable / CollapsibleSection / Badge / StatePill all already on disk.
- Cron-explainer choice (cronstrue 3.14.0): MEDIUM-HIGH — version + zero-deps verified via `npm view`; React 19 not technically required (framework-agnostic) so peer match is moot.
- AlertDialog choice: HIGH — Radix react-alert-dialog 1.1.15 React 19 verified; reuses `react-dialog` install.
- SKLP-03 backend route shape: MEDIUM — design proposed but not built; redaction policy clear, response shape agreed; planner finalizes Pydantic model in Plan 07-01.
- Plan/wave breakdown: MEDIUM — defensible 4-plan split given file-ownership rules; planner can rebalance (e.g., split 07-02 into HPNL-only vs SKLP-only) if the velocity metric demands smaller plans.
- Cadence policy: HIGH — extends Phase 6 cadence table by adding new buckets; no policy changes.
- Test strategy: HIGH — extends Phase 6 vitest + setQueryData pattern; no new infrastructure.
- Two-step ESTOP UX: HIGH — PITFALLS.md L270 verbatim; pattern is well-known.

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (30 days — the codebase is the source of truth and changes daily; re-verify backend contracts if more than 7 days elapse before Wave 0 begins).

## RESEARCH COMPLETE

Phase 7 is overwhelmingly a *binding* phase. Every Phase-4 backend endpoint exists and ships [VERIFIED route-by-route]; every Phase-5/6 primitive is on disk and matches the patterns Phase 7 needs (`<PanelCard>`, `<Sheet>`, `<CollapsibleSection>`, `<DataTable>`, `<Badge>`, `<StatePill>`, `<RelativeTime>`, `<Skeleton>`, `<EmptyState>`, `<ErrorState>`); `lib/queries.ts` cadence policy is locked; `lib/api.ts` has 7 endpoint families typed `unknown` waiting for Phase 7 to narrow. Two new dependencies — **cronstrue 3.14.0** (zero deps, 42KB minified, English-only by default) for live cron preview, and **@radix-ui/react-alert-dialog 1.1.15** (React 19 verified, reuses `react-dialog` install) for the AlertDialog primitive — close the only domain-knowledge gaps. One new backend endpoint — **SKLP-03 `/api/context/health`** — solves a hard security constraint (PITFALLS.md L258 mandates server-side redaction). Three corrections to the phase brief surfaced during contract verification: NL→cron is `parse-nl`; ESTOP clear is `emergency-resume`; dispatcher trigger is `/dispatcher/trigger` (not `/tasks/{id}/trigger`). Four-plan, three-wave structure: **07-01** (Wave 0 foundation: deps + AlertDialog + EmergencyStopBanner global mount + lib/api types + lib/queries hooks + ContextHealth backend route), **07-02** (Wave 1 HITL panels + Skills page lower half: DecisionsCard + InboxCard + SkillsRegistry + SkillCostCard v2 placeholder), **07-03** (Wave 2 TaskBoard + TaskComposer + AttentionBar real-data extension + CommandPalette Quick-task wiring), **07-04** (Wave 2 SchedulesCard + ScheduleComposer with cronstrue preview + NL fallback + final `/skills` placeholder retirement + PlaceholderCardGrid file deletion + Phase-7 close-out). Estimated 40-48 files touched, ~70 tests added on top of 170/170 frontend + 202/202 backend baseline. Open questions are tactical (TaskBoard column count for `awaiting_approval`; modal-vs-inline for HITL answer) and resolvable in plan-level decisions.

Sources:
- [cronstrue (npm)](https://www.npmjs.com/package/cronstrue)
- [cRonstrue (GitHub)](https://github.com/bradymholt/cRonstrue)
- [Radix AlertDialog](https://www.radix-ui.com/primitives/docs/components/alert-dialog)
- [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog)
- [Radix Dialog stacking discussion](https://github.com/radix-ui/primitives/discussions/3667)
