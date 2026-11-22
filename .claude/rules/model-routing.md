# Model routing — which model and effort for which work

For Claude Code sessions in this repo. Sapir's decision, 16/11/2026. Checked
against Anthropic's documentation on 17/11/2026 (sources at the end); where a
line below is house policy and not Anthropic's recommendation, it says so.

## The rule

| Work | Model | Effort |
|---|---|---|
| The session itself: planning, code, tests, review of findings | **Opus** (`opus`) | `medium` |
| A hard bug: unfamiliar code, a flaky test, a schema or auth change | Opus | `high` |
| Opus at `high` has failed twice on the same problem | Opus | `xhigh`, for that problem only |
| Opus at `xhigh` still fails | **Fable** (`fable`), for that problem only, then back to Opus | `high` |
| A subagent that searches files, reads logs or CI output, lists routes, collects call sites | **Haiku** (`haiku`) | default |
| A subagent that has to judge what it reads: the rule-5a reviewer, a multi-file audit | **Sonnet** (`sonnet`) | default |
| The rule-5a reviewer on a RED-tier PR (ADR-016) | **Fable** (`fable`); Opus if Fable is refused or out of usage, and the PR says so | default |

- **Never `max`.** House policy. Anthropic's wording is "reserve for frontier
  problems"; nothing in this repo is one.
- **Fable is an escalation, never a starting point** — with one exception, the
  RED-tier reviewer row above (Sapir 15/11, MEH-3271; reconciled in
  `docs/decisions/rulings-2026-11-17.md` §א8). House policy, stricter
  than Anthropic's (move up when results at `xhigh` still fall short). Say in
  the PR body when a problem was escalated and why.
- **Two failed attempts is the trigger** (CONTEXT.md §7). Raise the effort or
  the model once, as the table says; if that fails too, stop and describe.
- **`Builder-Model:` names the model that wrote the commit** (workflow.md). An
  escalated fix is written by the escalation model and says so.

## How to set it

- Session model: `/model opus` (or `--model`, or `model` in settings). `opus`,
  `sonnet`, `haiku` and `fable` are aliases for the current version of each.
- Session effort: `/effort medium`. The settings key `effortLevel` accepts
  `low`, `medium`, `high`, `xhigh` and not `max`.
- A repo subagent: `model:` in its `.claude/agents/<name>.md` frontmatter
  (an alias, a full model id, or `inherit`). The five agents here are on
  `sonnet`. Without the field a subagent runs on the session's model.
- One call: the Agent tool's `model` parameter (an alias). This is how a
  search or log-reading subagent is put on Haiku.
- The built-in Explore and Plan agents run on the session's model. They are
  not cheaper unless the call names a model.

## What Anthropic says, for comparison

The table matches Anthropic's docs (Opus default, Haiku for simple subagent
work, `high`/`xhigh` for unfamiliar bugs and schema changes) except where a
line says "house policy". The 17/11 reading is in
[docs/rules-history/2026-11-21/root/model-routing.md](../../docs/rules-history/2026-11-21/root/model-routing.md).

## Sources

- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/best-practices
- https://platform.claude.com/docs/en/about-claude/models/choosing-a-model
- https://platform.claude.com/docs/en/build-with-claude/effort

Model names and defaults change with each release. Re-check this file against
those pages when a new model generation ships.

`docs/templates/00-model-selection-guide.md` is about which model to ask in a
claude.ai chat, a different question. For a Claude Code session this file wins.
