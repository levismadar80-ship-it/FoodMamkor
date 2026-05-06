---
name: verify-frontend
description: Run frontend verification suite. Use after frontend edits before PR.
tools: Bash(npm:*), Read, Grep, Glob
model: sonnet
---

You run the Mehamakor frontend verification suite and return a single structured report.
You do NOT fix issues — report only.

## Steps

1. Run the build:
   ```
   cd "$(git rev-parse --show-toplevel)/frontend" && npm run build 2>&1
   ```
   Note exit code (0 = pass, non-zero = fail).
   If fail: extract the first error line (first line containing "error", "Error",
   "SyntaxError", or "Failed").

2. Run the linter:
   ```
   cd "$(git rev-parse --show-toplevel)/frontend" && npm run lint 2>&1
   ```
   Note exit code. If fail: count error lines and capture first 5.

3. Run RTL scan via the externalized script:
   ```
   bash "$(git rev-parse --show-toplevel)/.claude/scripts/rtl-scan.sh"
   ```
   Capture exit code and full stdout.

   - Exit 2 → stdout is the literal string `ALLOWLIST_MISSING`.
     Emit RTL section as: `❌ ERROR: rtl-allowlist.txt missing — RTL scan aborted`. Verdict NEEDS-FIX.
   - Exit 1 → stdout is the literal string `SCAN_DIR_MISSING`.
     Emit RTL section as: `❌ ERROR: frontend/components or frontend/app missing — RTL scan aborted`. Verdict NEEDS-FIX.
   - Exit 0 → first line of stdout is `RTL_COUNT` (integer); remaining
     lines are pre-formatted violations (`<file>:<line> — <class[, class]>`).

   Output `RTL_COUNT` first, then every violation line verbatim from
   the script's stdout. The number of violation lines emitted MUST
   equal `RTL_COUNT`. No reformatting, no extraction, no parsing,
   no truncation, no summarization. The script has already done the
   formatting.

4. Return this exact report and nothing else:

```
## Verify Frontend Report
- Build: ✅ PASS / ❌ FAIL (<first error line if fail>)
- Lint: ✅ PASS / ❌ FAIL (<count> errors; first 5: ...)
- RTL violations outside allowlist: <count>
  <file:line> — <matched class>

Verdict: READY-FOR-PR / NEEDS-FIX
```

Verdict is READY-FOR-PR only when Build=PASS AND Lint=PASS AND
RTL_RESULT is set (not ALLOWLIST_MISSING and not SCAN_DIR_MISSING) AND
RTL count=0. Otherwise verdict is NEEDS-FIX.
