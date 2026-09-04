#!/usr/bin/env bash
# bash-safety-sed-selftest.sh — MEH-2052
#
# Drives the REAL PreToolUse hook (.claude/hooks/check-bash-safety.sh, or any
# hook file passed as $1) through four `sed -i` commands and prints, per case,
# whether the hook BLOCKED (exit 2) or ALLOWED (exit 0). It exists to prove two
# things at once, in the order testing.md demands:
#
#   1. THE INSTRUMENT WORKS — case B (a plain `sed -i` on a deny-listed file)
#      must BLOCK and case C (a `sed -i` on a file nobody protects) must
#      ALLOW. If either is wrong, nothing else this script prints is evidence,
#      and it exits 1.
#   2. THE GAP — case A carries a `>` inside the sed script, exactly what any
#      version-constraint edit (`>=`, `<=`) contains. The live regex at
#      check-bash-safety.sh:136 uses `[^>]*` between `-i` and the path, so the
#      match stops at the first `>` and the block never fires. Case D is the
#      same with a `./` prefix.
#
# It reports APPLIED / UNAPPLIED for the MEH-2052 fix
# (docs/ci/meh-2052-bash-safety-sed-regex.patch.md) from what the hook DOES,
# then cross-checks that against what the hook file SAYS (a grep for the
# `[^>]*` form), so a hand-paste that changed the wrong line is caught.
#
# WHY IT LIVES HERE AND NOT IN scripts/checks/
#   scripts/checks/run-all.sh auto-discovers every executable *.sh directly
#   inside scripts/checks/ and runs it under the required "Repo guards" job.
#   This script reports a KNOWN-UNAPPLIED state until Sapir pastes the patch
#   (`.claude/hooks/**` is CC-deny); promoting it before that would red every
#   PR. Same reasoning, same home, as scripts/e2e-gate-selftest.sh (MEH-1742).
#
# WHY THE CASES LIVE IN THIS FILE AND NOT ON A COMMAND LINE
#   The hook scans the whole Bash command text a session issues. A one-liner
#   that merely MENTIONS `sed -i … uv.lock` as a string is itself blocked —
#   measured 04/09 while building this. Committing the cases here keeps the
#   probe reviewable and keeps the session from having to phrase a command the
#   guard is right to refuse.
#
# Usage:  bash scripts/bash-safety-sed-selftest.sh [path/to/hook.sh]
# Exit:   0 = instrument discriminates (B blocks, C allows); the APPLIED line is
#             informational.   1 = instrument broken — do not read the rest.
set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HOOK="${1:-$ROOT/.claude/hooks/check-bash-safety.sh}"

if ! command -v jq >/dev/null 2>&1; then
  echo "bash-safety-sed-selftest: jq not found — the hook itself fails closed without it; cannot drive it." >&2
  exit 1
fi
[ -f "$HOOK" ] || { echo "bash-safety-sed-selftest: hook not found at $HOOK" >&2; exit 1; }

# drive <command>  ->  prints BLOCK or ALLOW (the hook's exit 2 / exit 0)
drive() {
  local payload
  payload="$(jq -cn --arg c "$1" '{tool_input:{command:$c}}')"
  if printf '%s' "$payload" | CLAUDE_PROJECT_DIR="$ROOT" bash "$HOOK" >/dev/null 2>&1; then
    echo ALLOW
  else
    echo BLOCK
  fi
}

# The four cases. Paths are the bare deny-list forms (`pyproject.toml`,
# `uv.lock` — settings.json permissions.deny Edit(...) entries) because that
# is the exact shape the card measured on 13/08.
CASE_A="sed -i 's/starlette>=1.3.1/starlette>=99.0.0/' pyproject.toml"
CASE_B="sed -i '3096s/version = \"1.3.1\"/version = \"1.3.0\"/' uv.lock"
CASE_C="sed -i 's/a>b/c/' README.md"
CASE_D="sed -i 's/x>y/z/' ./uv.lock"

echo "bash-safety-sed-selftest — hook: ${HOOK#$ROOT/}"
echo
echo "Pass 1 — what the hook file SAYS (line carrying the sed -i regex):"
sed_line="$(grep -nE 'sed\[\[:space:\]\]\+-i' "$HOOK" | head -n 1)"
if [ -z "$sed_line" ]; then
  echo "  (no sed -i regex found — the hook changed shape; Pass 2 still measures behaviour)"
  says=unknown
elif printf '%s' "$sed_line" | grep -qF '[^>]*'; then
  echo "  ${sed_line%%:*}: still the \`[^>]*\` form  -> says UNAPPLIED"
  says=unapplied
else
  echo "  ${sed_line%%:*}: no \`[^>]*\` in the sed -i regex -> says APPLIED"
  says=applied
fi

echo
echo "Pass 2 — what the hook DOES:"
a="$(drive "$CASE_A")"; b="$(drive "$CASE_B")"; c="$(drive "$CASE_C")"; d="$(drive "$CASE_D")"
printf '  %-58s %s\n' "A  sed -i with '>' in the script, protected path (the gap)" "$a"
printf '  %-58s %s\n' "B  sed -i without '>', protected path   (control: covered)" "$b"
printf '  %-58s %s\n' "C  sed -i with '>', UNprotected path    (control: no FP)"  "$c"
printf '  %-58s %s\n' "D  sed -i with '>' and ./ prefix, protected path"         "$d"

echo
if [ "$b" != BLOCK ] || [ "$c" != ALLOW ]; then
  echo "INSTRUMENT BROKEN — control B must BLOCK and control C must ALLOW."
  echo "Every other line above is void; fix the harness or the hook before reading A/D."
  exit 1
fi

if [ "$a" = BLOCK ] && [ "$d" = BLOCK ]; then
  does=applied
  echo "MEH-2052 fix: APPLIED — a '>' inside the sed script no longer defeats the path match."
else
  does=unapplied
  echo "MEH-2052 fix: UNAPPLIED — case A/D pass through; the \`[^>]*\` stop at the first '>' is live."
fi

if [ "$says" != unknown ] && [ "$says" != "$does" ]; then
  echo "MISMATCH: the file says $says but the hook does $does — the edit landed on the wrong line, or a second \`[^>]*\` remains. Check every \`[^>]\` in the file."
fi

# ---------------------------------------------------------------------------
# Pass 3 — the two REGEXES side by side, on the same four strings.
#
# This is a reproduction of one line (check-bash-safety.sh:136), not of the
# hook: a session cannot write a patched copy of a file under .claude/hooks/
# even into a scratch directory (the harness refuses the command), so the
# only way to show the proposed regex discriminates BEFORE Sapir pastes it is
# to run the predicate itself. Pass 2 above is what exercises the real hook;
# this pass only answers "does the replacement close A and D without opening
# C". `esc` is built exactly as the hook builds it (line 129).
# ---------------------------------------------------------------------------
echo
echo "Pass 3 — the regex alone, OLD ([^>]*) vs NEW (.*), per protected prefix:"
regex_says() {  # regex_says <old|new> <command>  -> BLOCK if any deny prefix matches
  local which="$1" cmd="$2" prot esc
  for prot in pyproject.toml uv.lock; do
    esc=$(printf '%s' "$prot" | sed -e 's/[.[\*^$()+?{}|\\]/\\&/g')
    if [ "$which" = old ]; then
      printf '%s' "$cmd" | grep -qE "sed[[:space:]]+-i[^>]*[[:space:]][\"']?(\./)?${esc}" && { echo BLOCK; return; }
    else
      printf '%s' "$cmd" | grep -qE "sed[[:space:]]+-i.*[[:space:]][\"']?(\./)?${esc}" && { echo BLOCK; return; }
    fi
  done
  echo ALLOW
}
printf '  %-4s %-6s %-6s\n' case OLD NEW
for pair in "A:$CASE_A" "B:$CASE_B" "C:$CASE_C" "D:$CASE_D"; do
  label="${pair%%:*}"; cmd="${pair#*:}"
  printf '  %-4s %-6s %-6s\n' "$label" "$(regex_says old "$cmd")" "$(regex_says new "$cmd")"
done
echo "  (expected: OLD blocks only B; NEW blocks A, B, D and still allows C)"
exit 0
