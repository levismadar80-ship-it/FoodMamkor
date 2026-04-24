# File edits — preservation protocol

When editing any existing file (code, docs, config):

1. **Read first** — view the full file or the exact region being changed.
   Never edit based on memory or assumptions about file contents.

2. **str_replace, not rewrite** — use exact-match replacement with
   sufficient context (3+ lines before and after). Never replace
   the entire file unless explicitly asked to.

3. **Diff verification** — after every edit, run:
   `git diff <file>`
   Read the diff. If ANY line changed outside the intended scope —
   STOP and revert. Report to Smadar what unexpected change appeared.

4. **No silent deletions** — if a line or section needs to be removed,
   mention it explicitly: "I'm removing X because Y". Never delete
   quietly as part of "cleanup" or "reorganization".

5. **Scope guard** — if the task says "add section Z", the diff should
   show ONLY additions. If it says "fix bug in function F", the diff
   should show changes in function F only. Anything else is scope creep.

Precedent: MEH-261/262 collision (24 Apr) — two sessions edited CLAUDE.md
in parallel without checking for conflicts. Both succeeded by luck.
