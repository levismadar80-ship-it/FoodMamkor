---
paths:
  - "**/*.py"
  - "**/*.jsx"
  - "**/*.js"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.sh"
---

# Code execution principles

> Workflow rules 1–20 cover *structure*. These cover *execution*. When
> referencing by number, use "exec §N" to avoid collision with workflow
> rule N.

Sources: Cursor · Devin · V0 · Manus · Windsurf (2026).

---

## Principles (exec §7–13)

7. **Lazy Edit (Cursor)** — changed lines + `// ... existing code ...`
   markers only. Never return a full file.
8. **Atomic Edits (Cursor)** — 3 changes in one file = 1 edit call,
   not 3. All-or-nothing.
9. **Skeptic Mode (Devin)** — "Haven't verified X" > "X probably
   works". Declare uncertainty explicitly.
10. **File:Line Evidence (Devin)** — every code claim needs
    `file:line`. No citation = guess, not fact.
11. **Numbered Plan First (Manus)** — numbered steps before any code,
    even "small" tasks. Wait for `go`.
12. **Narrated Actions (Windsurf)** — one-line per action:
    "Reading X… Found Y… Fixing Z…" No black-box turns.
13. **Real Imports Only (V0)** — verify file exists before writing
    `import`. Never import imaginary modules.

---

## Execution order per task

- **Before:** read CLAUDE.md + HANDOFF → numbered plan → grep siblings
  → wait for `go`
- **During:** lazy edit (1 call / file / turn) → narrate each action →
  real imports only
- **After:** file:line evidence per claim → build + tests → preview
  URL → HANDOFF update
