# Rules history

Verbatim archives of `.claude/rules/*.md` files taken when the always-loaded
rules were condensed (the rules diet, MEH-2333, 26/10/2026).

| Archive | Live rules | Archived at |
|---|---|---|
| [workflow.md](./workflow.md) | [`.claude/rules/workflow.md`](../../.claude/rules/workflow.md) | `be037494` (MEH-2338) |

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
