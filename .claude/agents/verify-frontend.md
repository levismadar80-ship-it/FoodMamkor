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

3. Run RTL class scan:
   ```
   REPO_ROOT="$(git rev-parse --show-toplevel)"
   ALLOWLIST="$REPO_ROOT/.claude/hooks/rtl-allowlist.txt"
   if [ ! -f "$ALLOWLIST" ]; then
     RTL_RESULT="ALLOWLIST_MISSING"
   else
     PATH_PAT=$(mktemp)
     awk '
       /^#.*PATH EXCEPTIONS/  { section="path";    next }
       /^#.*CONTENT PATTERNS/ { section="content"; next }
       /^[[:space:]]*(#|$)/   { next }
       section == "path"      { print }
     ' "$ALLOWLIST" > "$PATH_PAT"
     CONTENT_PATS=$(awk '
       /^#.*PATH EXCEPTIONS/  { section="path";    next }
       /^#.*CONTENT PATTERNS/ { section="content"; next }
       /^[[:space:]]*(#|$)/   { next }
       section == "content"   { print }
     ' "$ALLOWLIST" | paste -sd '|')
     RTL_RESULT=$(
       grep -rEn -B1 -A1 '\b(left-|right-|ml-|mr-|pl-|pr-)[0-9a-z]' \
         "$REPO_ROOT/frontend/components" "$REPO_ROOT/frontend/app" \
       | grep -v -f "$PATH_PAT" \
       | awk -v cpats="$CONTENT_PATS" '
           BEGIN { np = split(cpats, pats, "|"); buf_n = 0 }
           /^--$/ { flush(); buf_n = 0; next }
           {
             buf[buf_n] = $0
             np2 = split($0, parts, ":")
             if (np2 >= 2 && parts[2] ~ /^[0-9]+$/) {
               lnum[buf_n] = parts[2] + 0; is_match[buf_n] = 1
             } else if (np2 >= 2 && parts[2] ~ /^[0-9]+-/) {
               d = index(parts[2], "-")
               lnum[buf_n] = substr(parts[2], 1, d - 1) + 0; is_match[buf_n] = 0
             } else { lnum[buf_n] = 0; is_match[buf_n] = 0 }
             buf_n++
           }
           END { flush() }
           function has_cpat(line,    j) {
             for (j = 1; j <= np; j++)
               if (pats[j] != "" && index(line, pats[j]) > 0) return 1
             return 0
           }
           function flush(    i, j, suppress) {
             for (i = 0; i < buf_n; i++) {
               if (!is_match[i]) continue
               suppress = 0
               for (j = 0; j < buf_n; j++)
                 if (lnum[j] >= lnum[i]-1 && lnum[j] <= lnum[i]+1 && has_cpat(buf[j]))
                   { suppress = 1; break }
               if (!suppress) print buf[i]
             }
             buf_n = 0
           }
         '
     )
     rm -f "$PATH_PAT"
   fi
   ```
   If `RTL_RESULT == "ALLOWLIST_MISSING"`: do NOT report a count. The RTL
   section of the report must read exactly:
   `❌ ERROR: rtl-allowlist.txt missing — RTL scan aborted`
   and the verdict MUST be NEEDS-FIX.
   Otherwise, each non-empty line in `RTL_RESULT` is a violation. Format each
   as: `file:line — class`.

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
RTL_RESULT is set (not ALLOWLIST_MISSING) AND RTL count=0.
Otherwise verdict is NEEDS-FIX.
