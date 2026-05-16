# Hooks gap analysis — Claude Code hooks vs. Agent SDK events

> **Source:** https://platform.claude.com/docs/en/agent-sdk/hooks
> **Date:** 2026-05-16
> **Ticket:** MEH-502
> **Type:** Read-only audit — no code changes in this PR

---

## Section 1 — Current hooks inventory

### 1a. Wired hooks in `.claude/settings.json`

17 hook entries total, spanning 4 events (PreToolUse, PostToolUse, Stop, SessionStart).

#### PreToolUse (10 entries)

| # | Matcher | Hook target | `settings.json` lines | Linked MEH |
|---|---|---|---|---|
| 1 | `Bash` | inline: `git commit` → CLAUDE.md update reminder | `:5-13` | MEH-128 spirit |
| 2 | `Edit\|Write\|NotebookEdit` | inline: UI-file paths → docs/DESIGN.md reminder | `:14-21` | MEH-128 spirit |
| 3 | `Edit\|Write\|NotebookEdit` (same matcher block) | inline: backend/ paths → docs/DATA.md reminder | `:22-26` | MEH-128 spirit |
| 4 | `Edit\|Write\|MultiEdit` | `.claude/pre-edit-guard.js` (central component warn) | `:28-35` | MEH-128 |
| 5 | `Bash` | `.claude/hooks/check-bash-safety.sh` (deny-list) | `:37-46` | MEH-408 |
| 6 | `Bash` | `.claude/hooks/check-skill-bypass.sh` (subprocess bypass) | `:48-57` | MEH-422 |
| 7 | `Edit\|Write\|MultiEdit` | `.claude/hooks/check-rtl.sh` (physical-prop block) | `:59-68` | MEH-341, MEH-355, MEH-426 |
| 8 | `Edit\|Write\|MultiEdit` | `.claude/hooks/protect-lint-config.sh` (self-protect) | `:70-79` | MEH-442 |
| 9 | `Read` | `.claude/hooks/check-env-read.sh` (env-file block) | `:81-90` | MEH-397 Layer 1 |
| 10 | `WebFetch` | `.claude/hooks/check-webfetch-allowlist.sh` (8-host allowlist) | `:92-101` | MEH-397 Layer 1 |

Coverage themes:
- **Security (5):** entries 5, 6, 8, 9, 10 — destructive cmd block, supply-chain bypass block, lint-config self-protect, env-file read block, WebFetch allowlist.
- **Quality / RTL (1):** entry 7 — physical `left-*`/`right-*` block.
- **Workflow nudges (4):** entries 1, 2, 3, 4 — soft reminders, all exit 0 (no block).

#### PostToolUse (1 entry)

| # | Matcher | Hook target | `settings.json` lines | Linked MEH |
|---|---|---|---|---|
| 1 | `Edit\|Write\|MultiEdit` | `.claude/hooks/lint-feedback.sh` (3-strike per-file loop) | `:106-114` | MEH-443, MEH-445 |

#### Stop (4 entries — all under one entry block at `:117-141`)

| # | Hook target | `settings.json` lines | Linked MEH |
|---|---|---|---|
| 1 | inline: `npm run build` (defensive frontend build) | `:122-123` | MEH-128 / MEH-411 family |
| 2 | inline: `npx eslint . --max-warnings 0` (no-undef catcher) | `:127-128` | PR #43 regression family |
| 3 | inline: `npx vitest run` (component tests) | `:132-133` | n/a |
| 4 | inline: `python -m pytest tests/test_api.py` (backend) | `:137-138` | n/a |

All four use defensive guards (missing `frontend/`, `node_modules/`, or test dirs → exit 0 with warning; only real failures emit `decision:block`).

#### SessionStart (2 entries)

| # | Matcher | Hook target | `settings.json` lines | Linked MEH |
|---|---|---|---|---|
| 1 | (none — boot) | `.claude/hooks/session-start.sh` (branch + CHANGELOG head + HANDOFF tail) | `:144-152` | MEH-576 |
| 2 | `compact` | `.claude/hooks/session-start.sh` (re-inject after `/compact`) | `:153-163` | MEH-576 |

### 1b. Hook scripts on disk vs. wired

| Script | Wired? | Status |
|---|---|---|
| `check-bash-safety.sh` | ✅ entry 5 | Active |
| `check-skill-bypass.sh` | ✅ entry 6 | Active |
| `check-rtl.sh` | ✅ entry 7 | Active (reads `rtl-allowlist.txt`) |
| `protect-lint-config.sh` | ✅ entry 8 | Active |
| `check-env-read.sh` | ✅ entry 9 | Active |
| `check-webfetch-allowlist.sh` | ✅ entry 10 | Active |
| `lint-feedback.sh` | ✅ entry 11 | Active (state in `.lint-attempts/`, gitignored) |
| `session-start.sh` | ✅ entries 16, 17 | Active |
| `check-branch-base.sh` | ❌ not wired | **Intentionally opt-in** per header comment (`.claude/hooks/check-branch-base.sh:8-10`): *"This file is unwired by default... To enable, add a PreToolUse Bash entry pointing here."* MEH-427 design choice, not drift. |
| `pre-edit-guard.js` (in `.claude/`, not `.claude/hooks/`) | ✅ entry 4 | Active (MEH-128) |

Non-hook artifacts in `.claude/hooks/`: `README.md` (docs), `rtl-allowlist.txt` (data file), `.lint-attempts/` (state dir).

**No orphan drift found.** Every script on disk is either wired or documented as opt-in.

---

## Section 2 — Official Agent SDK events

Reference: https://platform.claude.com/docs/en/agent-sdk/hooks

| Event | When it fires |
|---|---|
| `PreToolUse` | Before any tool call; exit 2 blocks |
| `PostToolUse` | After any tool call completes |
| `Stop` | When the assistant marks a turn complete |
| `SessionStart` | At conversation boot (and after `/compact` with `matcher: "compact"`) |
| `SessionEnd` | When the session terminates |
| `UserPromptSubmit` | When a user message arrives, before the agent reads it |
| `SubagentStop` | When a spawned subagent finishes |
| `Notification` | On system-level notifications |

---

## Section 3 — Gap matrix

| Event | Used in Mehamakor? | Coverage / 1-line use case |
|---|---|---|
| `PreToolUse` | ✅ Y (10 wired) | Security deny-lists + RTL block + soft workflow nudges |
| `PostToolUse` | ✅ Y (1 wired) | Per-file lint-feedback loop, 3 strikes max |
| `Stop` | ✅ Y (4 wired) | Build + ESLint + Vitest + pytest before turn-end |
| `SessionStart` | ✅ Y (2 wired) | Inject branch + CHANGELOG head + HANDOFF tail (also post-`/compact`) |
| `SessionEnd` | ❌ N | Auto-append HANDOFF.md session ledger entry (deterministic only) |
| `UserPromptSubmit` | ❌ N | Pre-go scope-match nudge when prompt references `MEH-XXX` without `go` |
| `SubagentStop` | ❌ N | Log subagent tool-call summary (closes MEH-373/425 visibility gap) |
| `Notification` | ❌ N | Toast on long-running CI / external blockers (low signal) |

---

## Section 4 — Three recommendations

Each recommendation evaluated against an actual pain pattern visible in `docs/CHANGELOG.md` / `HANDOFF.md` history — not hypothetical scenarios.

### REC 1 — `SessionEnd` → auto-append HANDOFF.md ledger entry

**Concrete proposal:** hook writes a single deterministic line — `{date} — session ended, branch=X, last PR=Y, build=green|red` — to a fixed "session ledger" table inside `HANDOFF.md`. Does **not** generate narrative summary (that would need an LLM and create an unreviewed-write hazard).

**Effort:** M — bash script (~80 LOC) + format spec in `.claude/hooks/README.md` + one-time retrofit of `HANDOFF.md` to add the ledger anchor.

**Verdict:** **DEFER**

**Rationale:** Value is real — workflow rule 13 ("End of session protocol — MANDATORY") is a known drift point (MEH-345 retro pattern). But the deterministic-only constraint limits usefulness to a timestamp ledger, which adds little over `git log`. Revisit after MEH-456 ships (legacy availability columns drop) — that closure event is a natural moment to settle the ledger schema. **Do not adopt now.**

### REC 2 — `UserPromptSubmit` → inject pre-go scope-match nudge

**Concrete proposal:** when the inbound prompt contains a `MEH-XXX` reference AND does **not** contain a `go`/`approved` token, emit `additionalContext` reminding the agent of workflow rule 4 ("Pre-go scope-match check: fetch the Linear issue and compare every spec requirement against the plan before 'go'").

**Effort:** S — ~30 LOC bash + jq, single regex match.

**Verdict:** **SKIP**

**Rationale:** The principle already lives in `.claude/rules/workflow.md` rule 4 and is reinforced at session-start by the existing SessionStart hook (entries 16-17). The MEH-342 incident that motivated the rule was caught by the **rule**, not by a missing hook. A per-message injection would add friction without closing a measurable gap. Skip.

### REC 3 — `SubagentStop` → log subagent tool-call summary

**Concrete proposal:** on every subagent termination, append one JSON line to `docs/audits/subagent-trace.log` (gitignored, append-only):

```json
{"ts":"...","agent_id":"...","agent_type":"Explore","tools_called":["Read","Bash"],"duration_ms":4231,"exit":"ok"}
```

**Effort:** S — ~40 LOC bash + jq, no new dependencies.

**Verdict:** **ADOPT**

**Rationale:** Closes the MEH-373 / MEH-425 visibility gap directly. The `tools:` frontmatter in `.claude/agents/*.md` is **advisory only** per MEH-363 PROBE-1 + MEH-425 Phase 1 — a sub-agent declared with `tools: Bash(npm:*), Read, Grep, Glob` can still call `Edit`, and the call lands. Today there is no post-hoc visibility into which tools a subagent actually used. `SubagentStop` provides that visibility without altering the gating story (L1 `permissions.deny` + L2 PreToolUse hooks remain the enforcement layer per `.claude/rules/security.md` invariants). Cheap, additive, audit-only. Smadar to open a follow-up MEH ticket for the implementation; **not in this PR per spec**.

---

## Section 5 — Status & follow-ups

**Findings:**
- 17 wired hooks across 4 events (PreToolUse, PostToolUse, Stop, SessionStart).
- 4 SDK events currently unused: SessionEnd, UserPromptSubmit, SubagentStop, Notification.
- No drift or orphan scripts. `check-branch-base.sh` is intentionally opt-in (MEH-427).

**Outcome:** 1 ADOPT (SubagentStop logging), 1 SKIP (UserPromptSubmit nudge), 1 DEFER (SessionEnd ledger).

**Follow-up tickets to open separately (not in this PR):**
- New MEH — implement `SubagentStop` → subagent-trace.log per REC 3.
- Re-evaluate REC 1 (SessionEnd ledger) after MEH-456 closes.

**Out of scope for this audit:** ADR-006/007/008 cross-references, CI hook coverage (different surface — MEH-487), git pre-commit hooks (different surface — MEH-496), `.claude/agents/*.md` sub-agent permission model (MEH-425 Phase 2 territory).
