#!/bin/bash
# MEH-1500 Phase C — self-test for check-bash-safety.sh.
# Usage: bash check-bash-safety.selftest.sh <path-to-hook>
# Feeds each case as the real hook input shape ({"tool_input":{"command":...}})
# and asserts the exit code. 0 = allow, 2 = block.
HOOK="${1:?usage: check-bash-safety.selftest.sh <hook>}"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
rc=0

run() { # expected_exit  description  command
  local want="$1" desc="$2" cmd="$3" got
  printf '%s' "$(jq -nc --arg c "$cmd" '{tool_input:{command:$c}}')" | bash "$HOOK" >/dev/null 2>&1
  got=$?
  if [ "$got" -eq "$want" ]; then
    printf '  ok   %-58s (exit %s)\n' "$desc" "$got"
  else
    printf '  FAIL %-58s expected %s, got %s\n' "$desc" "$want" "$got"
    rc=1
  fi
}

echo "self-test: $HOOK"

# --- ORIGINAL INTENT MUST SURVIVE (regression guards) ---------------------
run 0 "git commit -m with DDL text in the message"  'git commit -m "DROP TABLE users"'
run 0 "git log with a format string"                'git log --oneline -5'
run 0 "plain safe command"                          'echo hello'
run 0 "redirection to a NON-protected path"         'echo hi > /tmp/meh1500-safe.txt'

# --- C2: the git prefix must no longer swallow the command ----------------
run 2 "git prefix + DDL in a chained segment"       'git --version && echo "DROP TABLE probe"'
run 2 "git prefix + rm -rf ~ (the accident case)"   'git status && rm -rf ~'
run 2 "git prefix + pipe into a blocked segment"    'git log | grep "DROP TABLE"'
run 2 "DDL with no git prefix (unchanged)"          'echo "DROP TABLE x"'

# --- C1: write-redirection to protected paths -----------------------------
run 2 "cat > backend/app/main.py"                   'cat foo > backend/app/main.py'
run 2 "append >> to a protected path"               'echo x >> backend/app/config.py'
run 2 "tee to a protected path"                     'echo x | tee Dockerfile'
run 2 "sed -i on a protected path"                  'sed -i s/a/b/ vercel.json'
run 2 "dd of= a protected path"                     'dd if=/dev/null of=railway.json'
run 2 "write into the .claude/hooks/** glob"        'echo x > .claude/hooks/check-rtl.sh'
run 2 "git prefix + write to protected path"        'git --version && cat a > package.json'

# --- unchanged coverage ---------------------------------------------------
run 2 "DELETE FROM without WHERE"                   'psql -c "DELETE FROM users"'
run 0 "DELETE FROM with WHERE"                      'echo "DELETE FROM users WHERE id=1"'
run 2 "vercel --prod"                               'vercel --prod'

exit $rc
