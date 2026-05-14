# Research sweep — poshan0126/dotclaude vs Mehamakor `.claude/` (MEH-574)

**Date:** 2026-05-14 · **Authority:** docs-only.

## 1. TL;DR

dotclaude is a 14-plugin bundle (5 reviewer agents, 9 workflow skills, 6 rules, 9 hooks). Mehamakor's `.claude/` is more security-hardened (MEH-397/422 supply chain, MEH-408 deny-list, MEH-442 lint-config protection, RTL guard). **1 ADOPT** (SessionStart `compact` matcher), **2 DEFER** (token-budget audit, doc-drift agent). Everything else SKIP — already covered or fights solo/autonomous workflow.

## 2. dotclaude structure

Top-level: `.claude-plugin/marketplace.json` (14 plugins), `agents/` (code/security/performance/doc/frontend reviewers), `hooks/` (9 bash scripts), `rules/` (6 modular .md), `skills/` (9 incl. `ship`, `tdd`, `debug-fix`, `refactor`, `context-budget`), `plugins/` (redistributable per-plugin copies), `scripts/`, root `CLAUDE.md` + `settings.json` templates. README: "lean… no bloat, no opinions you can't override." MIT.

## 3. Coverage comparison

| dotclaude pattern | Mehamakor equivalent | Gap |
|---|---|---|
| `block-dangerous-commands.sh` | `check-bash-safety.sh` + MEH-408 deny-list | No (MEH stricter) |
| `protect-files.sh` | `check-env-read.sh` + `protect-lint-config.sh` | No |
| `scan-secrets.sh` PreToolUse | `.pre-commit-config.yaml` detect-secrets | No (commit gate sufficient) |
| `auto-test.sh` per-Edit | Stop hooks: build + pytest at task end | No (DoD covers it) |
| `context-recovery.sh` (SessionStart `compact`) | `session-start.sh` has no `matcher` | **YES** |
| `format-on-save.sh` | Pre-commit ruff/eslint | No |
| `notify.sh` OS toast | None — paste-relay workflow | No (mismatch) |
| `session-start.sh` | `session-start.sh` injects HANDOFF + CHANGELOG | No (MEH richer) |
| 5 reviewer agents | `pr-reviewer`, `code-simplifier`, `verify-frontend`, `i18n-scanner`, `design-review` + `/adversarial-review-*` | No |
| `ship` skill | Manual flow + GitHub MCP | No |
| `tdd` skill | Workflow rule 5 | No |
| `context-budget` skill | None | **Yes (defer)** |
| `doc-reviewer` agent | Rule 11 + Smell #2 (manual) | **Yes (defer)** |
| Marketplace distribution | Two-path mechanism (MEH-397/423) | REJECT (anti-pattern) |

## 4. Findings

| Pattern | Source | Verdict | Why | Suggested MEH |
|---|---|---|---|---|
| SessionStart `compact` matcher re-injecting branch + HANDOFF | `hooks/context-recovery.sh` | **ADOPT** | Mehamakor's `.claude/settings.json` `SessionStart` block has no `matcher` field → runs at session start only. dotclaude's hook fires on `matcher: "compact"`. After `/compact` (rule 7, 40% trigger) the harness summarises and drops load-bearing rules — solo long sessions are exposed. Fix: add second `SessionStart` block invoking the existing `session-start.sh`. Confidence: **high** (verified both settings.json blocks). | MEH: SessionStart compact-matcher hook |
| `.claude/` token-cost audit | `skills/context-budget/SKILL.md` | **DEFER** | 13 rules + 11 commands + 9 hooks + 71 symlinked skills, never measured. Useful diagnostic but one-shot, not recurring. Confidence: medium — value depends on unmeasured weight. | MEH (optional): one-shot token-cost script |
| Doc-drift PR check | `agents/doc-reviewer.md` | **DEFER** | Rule 11 mandates doc updates manually; Smell #2 names the anti-pattern. Hebrew/RTL semantic drift is hard — prototype-first, comment-only. Confidence: low. | MEH (optional): doc-drift comment-only PR check |
| `auto-test.sh` per-Edit | `hooks/auto-test.sh` | SKIP | Stop hooks already run full build + pytest at task end (DoD). Per-file fail-open adds noise. |
| Pre-tool secret scan | `hooks/scan-secrets.sh` | SKIP | `.pre-commit-config.yaml` runs detect-secrets at commit; pre-tool layer is "ask" (fail-open) — weaker than current gate. |
| `ship` skill (3 confirms) | `skills/ship/SKILL.md` | SKIP | Harness creates PRs after green CI (rule 20). 3 confirms = friction. |
| `tdd` skill | `skills/tdd/SKILL.md` | SKIP | Workflow rule 5 mandates failing-test-first; slash command restates rule. |
| OS-toast notify | `hooks/notify.sh` | SKIP | Notifications travel via Linear/email; no OS toast surface. |
| 14-plugin marketplace | `.claude-plugin/marketplace.json` | SKIP | Anti-pattern per brief. MEH-397 layers exist to avoid uncurated marketplace risk. |
| `code-quality.md` anti-defaults | `rules/code-quality.md` | SKIP | Root `CLAUDE.md` already encodes "no premature abstractions / no scope creep / WHY not WHAT". Duplicate. |
| `error-handling.md` no-silent-swallow | `rules/error-handling.md` | SKIP | Already Smell #2 + `/adversarial-review-errors` variant. |

## 5. Follow-up MEH proposals

1. **MEH: SessionStart compact-matcher hook** — add `"matcher": "compact"` entry to `.claude/settings.json` re-invoking `session-start.sh`. ~5-line change. Closes rule-7 `/compact` context loss. **Recommended.**
2. *(defer)* **MEH: `.claude/` token-cost audit script** — one-shot bash, chars per category (always-load / path-scoped / on-invoke). Decide after measurement.
3. *(defer)* **MEH: doc-drift PR check (prototype)** — diff touched code paths vs rule 11 doc map; comment-only first.

## 6. Confidence + caveats

- **High:** finding #1 — both `settings.json` blocks read directly.
- **Medium:** token-budget value (untested weight).
- **Low:** doc-drift agent (Hebrew/RTL semantic drift hard).
- **Caveat:** did not enumerate every file under `plugins/` (redistributable mirrors of `agents/`+`skills/`+`hooks/` — no new content). Spot-checked 8 representative files.
- **Caveat:** WebFetch allowlist blocked `raw.githubusercontent.com`; used `github.com/blob/` mirror (CC summarises). Quotes paraphrased unless in `"..."`.
- **Out of scope:** marketplace governance (MEH-397 covers).
