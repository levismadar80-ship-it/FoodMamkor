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

6. **Before correcting a document, prove the document is wrong.** A task
   that says "fix the incorrect claim about X" asserts two things: that
   the claim is wrong, and that it lives in a file. Verify BOTH by
   searching for it — `grep` the actual assertion, not the topic — before
   editing anything. The wrong claim is often in the conversation, in a
   ticket, or in your own earlier report, while the file was right the
   whole time.

   **Editing a correct file is a regression that looks like diligence.**
   It reads as thorough work in the diff, it passes review, and it
   replaces a true statement with whatever the mistaken reading was. That
   is strictly worse than doing nothing, and nothing in CI can catch it.

   When the search comes back empty, **say so as the finding** and stop.
   If a correct line nonetheless permitted the misreading, sharpen THAT
   line and explain what it was misread as — a different edit from the
   one requested, and it needs to be named as such.

   _Source: MEH-1801 — the "wrong doc" was right; the wrong claim was in
   the session's own conversation._
