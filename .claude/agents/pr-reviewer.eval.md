---
agent: pr-reviewer
meh: MEH-385
---

# pr-reviewer — Eval Test Cases

## T1 — Email bug fix without live verification (diagnosis gap)

prompt: Review the PR diff. Backend: backend/app/services/email.py:42 —
  changed Resend transport call from send() to send_with_retry(). Tests:
  tests/test_email.py:18 mocks _send_email, asserts retry counter.
  CHANGELOG entry: "Fixed email delivery flakiness (MEH-501)." HANDOFF
  entry: "Manual testing passed."
  Treat as current git diff staging...HEAD + last 50 lines of CHANGELOG
  + last 100 lines of HANDOFF.

expected_assertion: Output flags missing live Gmail verification.
  References CLAUDE.md rule (or MEH-331 precedent) requiring live
  "Show original" inspection for transport-layer email changes. Demands
  file:line evidence showing the pytest mock CANNOT catch transport
  bugs (per memory). Verdict: NEEDS-EVIDENCE. Includes Caveman follow-up
  prompt under 8 lines for CC.

## T2 — Clean PR with file:line evidence (no false positives)

prompt: Review the PR diff for MEH-361. Two files: bio_generator.py:125,
  reviews.py:84. Each: 1 line guarded next((b.text for b in msg.content
  if getattr(b, "type", None) == "text"), "") replacing
  msg.content[0].text. Plus tests/test_chat_content_shapes.py:1-48 — new
  regression test covering all 4 content shapes (typical, tool-then-text,
  empty, no-text). CHANGELOG entry quotes the exact pattern from
  chat.py:246 and cites the new test file. HANDOFF lists the test file
  as evidence. git log -5 shows 78fabef is current staging tip — matches
  branch base.

expected_assertion: Verdict: READY-TO-MERGE. Zero NEEDS-EVIDENCE
  demands. Output explicitly cites the file:line evidence in CHANGELOG.
  Does NOT flag the static-only verification as a gap (sandbox limit
  is documented).

## T3 — Doc-vs-merge integrity violation (MEH-351 pattern)

prompt: Review CHANGELOG.md last 30 lines + git log --oneline -10.
  CHANGELOG entry dated 2026-04-27 reads: "MEH-XYZ merged in commit
  abc1234." git log output does NOT contain abc1234. PR #999 (linked
  in CHANGELOG) is in "Open / Draft" state per gh pr view 999 output
  (provided as context).

expected_assertion: Verdict: NEEDS-FIX. Output flags doc-vs-merge
  integrity violation. References both: CHANGELOG line + git log
  evidence absence. References MEH-351 as known precedent. Caveman
  follow-up prompt instructs CC to either (a) revert CHANGELOG entry,
  or (b) merge the PR before documenting it. Does NOT propose a code
  fix.
