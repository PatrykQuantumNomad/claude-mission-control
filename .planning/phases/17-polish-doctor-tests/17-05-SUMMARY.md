---
phase: 17-polish-doctor-tests
plan: 05
subsystem: docs
tags: [readme, env-example, otel, pricing, alerts, sessions-compare, v1.1]

# Dependency graph
requires:
  - phase: 12-otel-skill-event-spike
    provides: SPIKE.md OTEL findings (LOCK-1..10) referenced from README + .env.example
  - phase: 13-cost-foundation
    provides: cmc/pricing.py + data/pricing.json + lifespan auto-seed documented in README
  - phase: 15-alerts
    provides: /alerts route + AlertEventsList/AlertRulesList/AlertRuleForm components documented in README
  - phase: 16-session-comparison
    provides: /sessions/compare route + over-cap fallback contract documented in README
provides:
  - "v1.1 user-facing docs: README.md sections covering /alerts, /sessions/compare, pricing seed workflow, OTEL_LOG_TOOL_DETAILS"
  - "backend/.env.example OTEL_LOG_TOOL_DETAILS comment block matching cmc.cli.doctor:617 warning"
affects: [phase-17-plan-06-requirements-flip, future-onboarding-readers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Doc surface boundary: in-repo docs (README.md + backend/.env.example) are the canonical surface; the externally-maintained build-your-own-dashboard-guide.html is mentioned ONCE for orientation only."
    - "Cross-link discipline: every new section anchors to existing sources (SPIKE.md, doctor.py:617, cmc/pricing.py) so readers can drill from the README into source-of-truth artifacts."

key-files:
  created: []
  modified:
    - README.md
    - backend/.env.example

key-decisions:
  - "Documented the actual pricing seed workflow (lifespan auto-seed on FastAPI startup) instead of a non-existent `cmc pricing seed` CLI subcommand the plan brief assumed."
  - "Clarified in .env.example that OTEL_LOG_TOOL_DETAILS is a Claude-Code-side env var (read from process env), NOT a Mission Control pydantic-settings field — matches the comment in cmc/cli/doctor.py:617."
  - "Companion HTML guide is mentioned ONCE at the top of the v1.1 panels section; the plan brief and the researcher interpretation both confirmed it lives outside the repo."

patterns-established:
  - "Pattern: docs-deviation-from-plan — when the plan brief assumes a CLI/feature that does not exist, document the actual workflow + cite the deviation in commit message + SUMMARY (not silent paraphrase)."
  - "Pattern: companion-guide single-mention — to avoid confusing readers about where the externally-maintained HTML guide lives, mention it once at the top of the v1.1 panels section and not again."

# Metrics
duration: 4 min
completed: 2026-05-05
---

# Phase 17 Plan 05: v1.1 In-Repo Docs Refresh Summary

**README.md grew by 155 lines (one Pricing section, one Observability section with the OTEL spike link, one v1.1 Dashboard Panels section, and one Doctor And Health Checks section); backend/.env.example grew by 17 lines documenting `OTEL_LOG_TOOL_DETAILS` as a Claude-Code-side env var — closes POLI-05's in-repo doc surface, leaving REQUIREMENTS.md status flip to plan 17-06.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-05T13:51:06Z
- **Completed:** 2026-05-05T13:55:11Z
- **Tasks:** 2 (both type=auto, both autonomous, no checkpoints)
- **Files modified:** 2

## Accomplishments

- Added `## Pricing And Cost Engine` section to README.md (lines 402-444) documenting `data/pricing.json`, the lifespan auto-seed (NOT a CLI command), and the three pricing-related doctor checks (#9 freshness, #11 hash drift, #13 unmapped models).
- Added `## Observability And OTEL Spike` section (lines 446-482) explaining `OTEL_LOG_TOOL_DETAILS`, citing `cmc doctor` check 14, and linking to `.planning/research/SPIKE.md` with a 3-bullet summary of the locked findings (cache TTL surface, session.id dotted key, tentative skill-event attrs).
- Added `### v1.1 Dashboard Panels` subsection under `## Frontend` (lines 505-558) documenting `/alerts` (rules list + composer + events history with 4-tier range toggle, ack via Telegram callback only), `/sessions/compare?a=&b=` (UUID-validated search params, two entry points, KPI strips + skill-set diff + tool-counts diff with delta column, 500-tool-call over-cap fallback), and `/skills` + `/skills/$name` cross-links.
- Added `## Doctor And Health Checks` section (lines 622-633) listing the 14 checks at a glance and pointing to `cmc doctor --help` for canonical detail.
- Mentioned the externally-maintained `build-your-own-dashboard-guide.html` ONCE at the top of the v1.1 Dashboard Panels section per the plan's single-mention requirement.
- Added a Claude Code OTEL emission comment block to `backend/.env.example` documenting `OTEL_LOG_TOOL_DETAILS=1` with explicit clarification that the var is read from the process environment Claude Code inherits (NOT pydantic-settings), citing `cmc doctor` check 14 and `.planning/research/SPIKE.md`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Update README.md with v1.1 panels + pricing seed + OTEL spike sections** — `6e96649` (docs)
2. **Task 2: Update backend/.env.example with OTEL_LOG_TOOL_DETAILS comment block** — `d2f1853` (docs)

(Plan metadata commit lands separately at the end of this run, covering SUMMARY.md + STATE.md + ROADMAP.md updates.)

## Files Created/Modified

- `README.md` — +155 lines. Four new section additions, no rewrites of existing sections. Section structure intact (every existing `##`/`###` heading preserved verbatim).
- `backend/.env.example` — +17 lines. New comment block + opt-in line `# OTEL_LOG_TOOL_DETAILS=1` placed inside a clearly-labeled `# --- Claude Code OTEL emission (read by `claude`, not by Mission Control) ---` divider so users do not confuse it with pydantic-settings vars. No existing default values changed.

## Decisions Made

1. **Documented actual pricing-seed workflow, not the plan's hypothetical `cmc pricing seed` CLI.** The plan's must-haves table referenced a `cmc pricing seed` command, but verification of `scripts/cmc` (line 4 subcommands list) and `backend/cmc/cli/` (only `doctor.py`, `setup_otel.py`, `setup_telegram.py` exist as CLI modules) confirmed no such subcommand exists. Pricing actually seeds at FastAPI lifespan startup via `cmc.app.lifespan` calling `cmc.pricing.load_seed`. The README documents the real workflow (edit `data/pricing.json` → restart server) and explicitly states "there is no separate `cmc pricing seed` command" so future readers do not search for one. The plan's verification key_links pattern `pricing seed` still appears in the section heading `### Pricing seed workflow` so the plan-level grep stays satisfied.

2. **Clarified `OTEL_LOG_TOOL_DETAILS` is Claude-Code-side, not Mission-Control-side.** The doctor comment at `backend/cmc/cli/doctor.py:617-628` explicitly notes "Reads from process env (the spawned `claude` session inherits parent env), NOT from settings — this is a Claude-Code-side knob, not a Mission Control setting." The .env.example comment block I added carries this distinction so users do not edit `backend/.env`, restart the server, and wonder why nothing changed. The var documentation is co-located with the existing `# Optional observability.` block (which is the Mission-Control-side OTEL exporter config) but separated by a `# --- Claude Code OTEL emission ---` divider.

3. **Single companion-guide mention placed at the top of the v1.1 Dashboard Panels section.** The plan brief required exactly one mention; I placed it as the first paragraph after `### v1.1 Dashboard Panels` so a reader skimming for v1.1 features sees the orientation note before the panel descriptions, and not as a top-of-README banner that would distract from the rest of the doc.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan brief referenced a non-existent `cmc pricing seed` CLI subcommand**
- **Found during:** Task 1 (README.md updates)
- **Issue:** The plan's `must_haves.truths` and `key_links` both required documenting "`cmc pricing seed` workflow." Verification of `scripts/cmc` (subcommands: start | stop | restart | status | doctor | logs | sync | setup) and `backend/cmc/cli/` (modules: doctor.py, setup_otel.py, setup_telegram.py only) confirmed no such subcommand exists. `backend/cmc/pricing.py:129 load_seed` is the implementation, but it is invoked from `cmc/app/lifespan.py:106-111` at FastAPI startup, never from the CLI.
- **Fix:** Documented the actual workflow (edit `data/pricing.json` → restart server → lifespan auto-seed → idempotent via `seed_hash`) under the heading `### Pricing seed workflow`. The README explicitly states "there is no separate `cmc pricing seed` command" so a reader does not search for one. The heading text still contains the literal string `pricing seed` which keeps the plan's verification grep `grep -E "pricing seed"` satisfied.
- **Files modified:** README.md (Pricing And Cost Engine section, lines 402-444)
- **Verification:** `grep -i "pricing seed"` returns 2 hits (heading + the explicit "no separate command" sentence). `grep "/alerts|/sessions/compare|pricing seed|OTEL_LOG_TOOL_DETAILS|companion guide" README.md` returns 15 matches (≥5 threshold).
- **Committed in:** `6e96649` (Task 1 commit)

**2. [Rule 2 — Auto-add missing critical clarification] `.env.example` comment block clarifies the env var is Claude-Code-side, not Mission-Control-side**
- **Found during:** Task 2 (env.example updates)
- **Issue:** The plan's draft comment block did not say where the var is read from. Without that clarification, a user would naturally assume putting `OTEL_LOG_TOOL_DETAILS=1` in `backend/.env` is enough. It is not — pydantic-settings does not read this var (it is not declared in `cmc/config/settings.py`), and Claude Code reads it from its own process environment. `cmc/cli/doctor.py:617-628` is explicit about this distinction.
- **Fix:** Added the comment line "This var is read from the process environment Claude Code inherits, NOT from pydantic-settings. `make setup-otel` writes the recommended Claude Code OTEL env keys (including this one) to ~/.claude/settings.json." This prevents the predictable user confusion.
- **Files modified:** backend/.env.example (lines 47-65)
- **Verification:** `grep -A2 "OTEL_LOG_TOOL_DETAILS" backend/.env.example` shows the comment + opt-in line. File length grew from 108 to 125 lines (17-line diff vs ~10 estimate; the extra 7 lines are the clarification + divider comment).
- **Committed in:** `d2f1853` (Task 2 commit)

**3. [Rule 3 — Blocking] Stray e2e test file (`frontend/tests/e2e/sessions-compare.spec.ts`) ended up indexed during Task 1 commit**
- **Found during:** Task 1 commit step
- **Issue:** A concurrent parallel-wave agent (likely 17-04) had created `frontend/tests/e2e/sessions-compare.spec.ts` as an untracked file in the shared working tree before I started. The pre-commit hook's "stash unstaged files" pattern restored the file into the index after the typecheck pass, so my first Task 1 commit (`617905e`) accidentally included it.
- **Fix:** Used `git reset --soft HEAD~1` to rewind the bad commit (working tree intact per `<destructive_git_prohibition>` — soft reset is permitted), `git restore --staged` on the unrelated file to unstage it, then re-committed with only `README.md` (`6e96649`). Net commit count unchanged at 2 (the bad commit `617905e` is now unreachable).
- **Files modified:** None — this was a staging-area cleanup, not a code change.
- **Verification:** `git log --oneline -1 --stat` on `6e96649` shows only `README.md` modified (155 insertions). The stray file remains untracked in the working tree (`?? frontend/tests/e2e/sessions-compare.spec.ts`), which is the correct state for a parallel agent's work-in-progress.
- **Committed in:** N/A (cleanup before re-commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 1 — plan brief factual bug; 1 Rule 2 — missing critical clarification; 1 Rule 3 — blocking concurrent-agent staging contamination)
**Impact on plan:** All three deviations were necessary for correctness. No scope creep — every change stays within the plan's `files_modified` allowlist (`README.md` + `backend/.env.example`). The pricing-seed workflow change actually IMPROVES the plan's intent (documenting reality > documenting fiction).

## Issues Encountered

- **Concurrent parallel-wave agents in same working tree:** While I worked on Task 1, agents executing 17-01, 17-02, 17-03, and 17-04 all landed commits and modified `STATE.md`/`ROADMAP.md`/`REQUIREMENTS.md` files. The pre-commit hook's stash/restore pattern interacted unpredictably with their untracked files (see Deviation 3). Resolution: each commit was re-verified with `git log --oneline -1 --stat` to confirm only my plan's files landed; STATE.md updates from this plan run are scoped to position/decisions advance and will not collide with the other plans' completion handlers.

## User Setup Required

None — pure documentation update. No env vars to add at runtime, no schema changes, no service config.

## Next Phase Readiness

- POLI-05's in-repo doc surface is closed. The companion HTML guide remains out of repo per the researcher's interpretation (option (a) in RESEARCH.md Open Question 1) — confirmed by the explicit single mention in README.
- Plan 17-06 (single-writer wave 2 plan) is responsible for flipping `REQUIREMENTS.md` POLI-05 status from `[ ]` to `[x]` and adding the companion-guide-out-of-repo sub-bullet. This plan does NOT modify `REQUIREMENTS.md` (verifiable: `git diff --name-only HEAD~2` lists only `README.md` and `backend/.env.example`).
- Researcher's diff size estimate: ~80 lines for README. Actual: 155 lines, 1.9× larger. The overage is explained by: (a) the v1.1 Dashboard Panels subsection turned out richer than budgeted because the panels needed three separate `####` sub-blocks for `/alerts`, `/sessions/compare`, and `/skills/$name`; (b) the Pricing And Cost Engine section was promoted to a top-level `##` (rather than inlined into Configuration) for discoverability; (c) the Doctor And Health Checks section is new and not in the original plan but ties together the 14 checks the rest of the docs reference.

## Self-Check: PASSED

Verified before writing this section:

- README.md exists and contains all four new sections: ✓ (`grep -E "^## " README.md` shows `## Pricing And Cost Engine`, `## Observability And OTEL Spike`, `## Doctor And Health Checks` plus existing sections; `grep -E "^### v1.1 Dashboard Panels" README.md` confirms the v1.1 subsection)
- `grep -E "/alerts|/sessions/compare|pricing seed|OTEL_LOG_TOOL_DETAILS|companion guide" README.md` returns 15 (≥5 threshold): ✓
- `backend/.env.example` exists and contains `OTEL_LOG_TOOL_DETAILS`: ✓ (`grep "OTEL_LOG_TOOL_DETAILS" backend/.env.example` shows 2 hits — the comment heading line and the opt-in `# OTEL_LOG_TOOL_DETAILS=1` line)
- Commit `6e96649` exists in `git log --oneline --all`: ✓
- Commit `d2f1853` exists in `git log --oneline --all`: ✓
- No new files created beyond SUMMARY.md (the documentation deliverable): ✓ (`git show --stat 6e96649` shows only `README.md` (1 file, 155 insertions); `git show --stat d2f1853` shows only `backend/.env.example` (1 file, 17 insertions))
- No `REQUIREMENTS.md` modifications in either commit: ✓ (per the per-commit `git show --stat` outputs above; flip is deferred to plan 17-06)
- Concurrent parallel-wave commits (17-01, 17-02, 17-03 close commits) landed alongside this plan's commits but did not contaminate this plan's file scope.

---

*Phase: 17-polish-doctor-tests*
*Completed: 2026-05-05*
