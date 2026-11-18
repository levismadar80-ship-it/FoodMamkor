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

- **Never `max`.** House policy. Anthropic's wording is "reserve for frontier
  problems"; nothing in this repo is one.
- **Fable is an escalation, never a starting point.** House policy, stricter
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

- Opus 5.5 is the default model on subscription and API plans, and "most
  workloads start with Claude Opus 5.5".
- Haiku 5.5 is listed for "subagent tasks"; the Claude Code docs say to set
  `model: haiku` for simple subagent work such as collecting the files that
  import a module.
- Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.2 default to `medium` effort.
  For bugs in unfamiliar code, flaky tests and schema changes the docs suggest
  `high` or `xhigh`.
- Fable 5.2 is "the highest available capability"; no plan defaults to it.

Not found in the documentation: any guidance specific to reading logs, and any
per-call effort setting on the Agent tool.

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
