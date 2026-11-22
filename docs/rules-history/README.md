# Rules history

Verbatim archives of `.claude/rules/*.md` files taken when the always-loaded
rules were condensed (the rules diet, MEH-2333, 26/10/2026).

| Archive | Live rules | Archived at |
|---|---|---|
| [workflow.md](./workflow.md) | [`.claude/rules/workflow.md`](../../.claude/rules/workflow.md) | `be037494` (MEH-2338) |
| [testing.md](./testing.md) | [`.claude/rules/testing.md`](../../.claude/rules/testing.md) | `be037494` (MEH-2339) |
| [2026-11-13/workflow.md](./2026-11-13/workflow.md) | [`.claude/rules/workflow.md`](../../.claude/rules/workflow.md) | `cd6032d` (second trim, 13/11) |
| [2026-11-13/testing.md](./2026-11-13/testing.md) | [`.claude/rules/testing.md`](../../.claude/rules/testing.md) | `cd6032d` (second trim, 13/11) |
| [2026-11-13/security.md](./2026-11-13/security.md) | [`.claude/rules/security.md`](../../.claude/rules/security.md) | `cd6032d` (second trim, 13/11) |
| [2026-11-21/backend.md](./2026-11-21/backend.md) | [`.claude/rules/backend.md`](../../.claude/rules/backend.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/code-execution.md](./2026-11-21/code-execution.md) | [`.claude/rules/code-execution.md`](../../.claude/rules/code-execution.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/db.md](./2026-11-21/db.md) | [`.claude/rules/db.md`](../../.claude/rules/db.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/deployment.md](./2026-11-21/deployment.md) | [`.claude/rules/deployment.md`](../../.claude/rules/deployment.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/feature-docs.md](./2026-11-21/feature-docs.md) | [`.claude/rules/feature-docs.md`](../../.claude/rules/feature-docs.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/frontend.md](./2026-11-21/frontend.md) | [`.claude/rules/frontend.md`](../../.claude/rules/frontend.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/labels.md](./2026-11-21/labels.md) | [`.claude/rules/labels.md`](../../.claude/rules/labels.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/meta-patterns.md](./2026-11-21/meta-patterns.md) | [`.claude/rules/meta-patterns.md`](../../.claude/rules/meta-patterns.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/observability.md](./2026-11-21/observability.md) | [`.claude/rules/observability.md`](../../.claude/rules/observability.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/rtl.md](./2026-11-21/rtl.md) | [`.claude/rules/rtl.md`](../../.claude/rules/rtl.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/testing.md](./2026-11-21/testing.md) | [`.claude/rules/testing.md`](../../.claude/rules/testing.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/workflow.md](./2026-11-21/workflow.md) | [`.claude/rules/workflow.md`](../../.claude/rules/workflow.md) | `1443c268b` (third trim, 21/11, MEH-3674) |
| [2026-11-21/root/CLAUDE.md](./2026-11-21/root/CLAUDE.md) | [`CLAUDE.md`](../../CLAUDE.md) | `1443c268b` (third trim; not inventory-checked — the guard reads one folder level) |

**Why this split exists.** Everything in `.claude/rules/` without a `paths:`
frontmatter is loaded into every session before the first word of work. The
rules themselves are short; most of the bytes were the evidence behind them —
incident sources, measurement tables, corrections. The live file keeps the
rules; this folder keeps the evidence, unshortened.

**What is guaranteed.** `scripts/checks/rules-inventory-guard.sh` (Repo guards)
fails when any heading or numbered rule in an archive here is missing from its
live file. Each archive is the full pre-diet text, so every sentence that left
the live file is still here word for word.

**How to use it.** Before weakening, re-deriving or re-opening a rule, read its
section here first. The archives are frozen: do not edit them to record new
history — new evidence goes into the live rule (briefly) or a new doc.

**Retiring a rule on purpose** is a constraint removal (workflow rule 32), so
it is Sapir's call: add the rule's exact inventory key (the guard prints it) to
`RETIRED.txt` in this folder, in a PR that says why.
