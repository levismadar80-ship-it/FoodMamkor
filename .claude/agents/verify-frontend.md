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
   cd /home/user/FoodMamkor/frontend && npm run build 2>&1
   ```
   Note exit code (0 = pass, non-zero = fail).
   If fail: extract the first error line (first line containing "error", "Error",
   "SyntaxError", or "Failed").

2. Run the linter:
   ```
   cd /home/user/FoodMamkor/frontend && npm run lint 2>&1
   ```
   Note exit code. If fail: count error lines and capture first 5.

3. Run RTL class scan from repo root:
   ```
   cd /home/user/FoodMamkor && grep -rEn '\b(left-|right-|ml-|mr-|pl-|pr-)[0-9a-z]' \
     frontend/components frontend/app \
     | grep -v -f .claude/hooks/rtl-allowlist.txt
   ```
   Each remaining output line is a violation. Format each as: `file:line — class`.

4. Return this exact report and nothing else:

```
## Verify Frontend Report
- Build: ✅ PASS / ❌ FAIL (<first error line if fail>)
- Lint: ✅ PASS / ❌ FAIL (<count> errors; first 5: ...)
- RTL violations outside allowlist: <count>
  <file:line> — <matched class>

Verdict: READY-FOR-PR / NEEDS-FIX
```

Verdict is READY-FOR-PR only when Build=PASS AND Lint=PASS AND RTL count=0.
Otherwise verdict is NEEDS-FIX.
