#!/bin/bash
# Bash safety guard (PreToolUse: Bash)
# Blocks dangerous DB DDL, destructive filesystem commands, and writes to the
# protected paths that permissions.deny already closes to Edit().
# Exit 2 = block. Exit 0 = allow.
# Last updated: 2026-07-28 (MEH-1500 Phase C: segment-aware git skip, fail-closed
#   on missing jq, write-redirection coverage; MEH-461 tighten rm -rf regex;
#   MEH-408 production-safety deny-list extension)

# MEH-1500 C3 — FAIL CLOSED on missing jq.
# Was `exit 0`. Every sibling hook fails closed, and check-artifact-location.sh's
# header called this one out by name as the weak link. On Windows/MINGW, where jq
# is exactly what may be absent, fail-open silently disabled this entire layer.
# COST, stated deliberately: without jq every Bash call is blocked, not degraded.
# That is the intended friction — an unenforced safety layer that looks enforced
# is worse than one that stops you and says why.
if ! command -v jq >/dev/null 2>&1; then
  echo "check-bash-safety.sh: jq not found — BLOCKING (fail-closed, MEH-1500)." >&2
  echo "Install jq: pacman -S jq (Git Bash) or https://jqlang.github.io/jq/download/" >&2
  exit 2
fi

COMMAND=$(cat | jq -r '.tool_input.command // ""')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# MEH-1500 C2 — the git exemption applies to a git INVOCATION, not to any command
# that merely STARTS with git.
#
# Was: `grep -iqE '^[[:space:]]*git[[:space:]]' && exit 0` — which returned exit 0
# for the WHOLE command before a single pattern ran. Verified behaviourally 28/07:
#   echo "DROP TABLE probe"                  -> blocked (exit 2)
#   git --version && echo "DROP TABLE probe" -> PRINTED, hook never ran
# Same string, opposite outcome. Not an attack scenario — an accident scenario:
# `git status && rm -rf ~` was exempt.
#
# The original justification stays correct and stays honoured: git cannot execute
# its own arguments as shell, so `git commit -m "DROP TABLE users"` must still
# pass. It does — that segment is a git invocation and is skipped; no other
# segment exists.
#
# HEURISTIC LIMIT, stated: a separator inside a quoted string splits too, so a
# commit message containing `;` or `&&` yields extra segments. That errs toward
# MORE scanning, never less, and matches the heuristic level this file already
# documents for the DELETE FROM check.
SCAN=""
# `|| [ -n "$seg" ]` is load-bearing: read returns non-zero on a final line with
# no trailing newline, and WITHOUT this the last segment is silently dropped.
# A command with no separators at all is one single final segment, so the whole
# scan came back empty and every pattern check was skipped — the hook allowed
# everything while looking correct. Caught by the self-test, which is the reason
# it exists.
while IFS= read -r seg || [ -n "$seg" ]; do
  seg="${seg#"${seg%%[![:space:]]*}"}"      # ltrim
  [ -z "$seg" ] && continue
  if echo "$seg" | grep -iqE '^git[[:space:]]'; then
    continue                                 # git invocation — exempt, as before
  fi
  SCAN="${SCAN}${seg}"$'\n'
done < <(printf '%s\n' "$COMMAND" | sed -e 's/&&/\n/g' -e 's/||/\n/g' -e 's/;/\n/g' -e 's/|/\n/g' -e 's/&/\n/g')

# Every segment was a git invocation — nothing left to scan.
if [ -z "$SCAN" ]; then
  exit 0
fi

# Check blocked patterns (case-insensitive) against the NON-git segments only.
check_pattern() {
  local pattern="$1"
  local label="$2"
  local guidance="$3"
  if echo "$SCAN" | grep -iEq "$pattern"; then
    echo "Blocked: ${label}" >&2
    echo "${guidance}" >&2
    exit 2
  fi
}

DB_GUIDANCE="DB schema changes → use Alembic migrations per docs/MIGRATIONS.md (never ALTER TABLE DROP or DROP COLUMN directly)."
FS_GUIDANCE="Destructive filesystem command → run manually outside Claude Code."
PATH_GUIDANCE="This path is in permissions.deny (Edit). Writing it via the shell bypasses that. Edit it through the normal review path, or run the command yourself outside Claude Code."

check_pattern 'ALTER[[:space:]]+TABLE.*DROP'  "ALTER TABLE ... DROP (dangerous DDL)" "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+TABLE'         "DROP TABLE"                           "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+COLUMN'        "DROP COLUMN"                          "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+DATABASE'      "DROP DATABASE"                        "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+SCHEMA'        "DROP SCHEMA"                          "$DB_GUIDANCE"
check_pattern 'TRUNCATE[[:space:]]+TABLE'     "TRUNCATE TABLE"                       "$DB_GUIDANCE"
check_pattern '(^|[[:space:]]|;)TRUNCATE[[:space:]]+[a-zA-Z_"]' "TRUNCATE (bare form)" "$DB_GUIDANCE"

if echo "$SCAN" | grep -iqE 'DELETE[[:space:]]+FROM[[:space:]]+'; then
  if ! echo "$SCAN" | grep -iqE 'WHERE'; then
    echo "Blocked: DELETE FROM without WHERE clause" >&2
    echo "$DB_GUIDANCE" >&2
    exit 2
  fi
fi

check_pattern 'rm[[:space:]]+-rf[[:space:]]+/[[:space:]]*$' "rm -rf / (root)" "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+/\*' "rm -rf /* (root glob)" "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+/(etc|home|var|usr|opt|root|boot|lib|lib64|sbin|bin)([[:space:]]*$|/[[:space:]]*$|/\*[[:space:]]*$)' "rm -rf <top-level system dir>" "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+~'      "rm -rf ~ (home dir)" "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+\$HOME' "rm -rf \$HOME"       "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+\.[[:space:]]*$' "rm -rf . (cwd)" "$FS_GUIDANCE"

check_pattern 'railway[[:space:]]+(down|service[[:space:]]+delete)' "railway destructive command" "$FS_GUIDANCE"
check_pattern 'vercel[[:space:]]+(--prod|rm)'                       "vercel destructive/prod command" "$FS_GUIDANCE"
check_pattern '\$DATABASE_URL_PRODUCTION'                           "command references production DB URL" "$FS_GUIDANCE"

# MEH-1500 C1 — write-redirection to a protected path.
#
# The hook had ZERO path-write coverage: no >, >>, tee, sed -i, or dd. So every
# path permissions.deny closes to Edit() was writable with `cat > <path>`.
#
# SINGLE SOURCE: the protected list is READ FROM .claude/settings.json's Edit()
# deny entries. It is not copied here. A second copy would drift, which is the
# two-owners-for-one-fact smell (workflow.md Smell #1) and exactly what
# MEH-1030's registry validator exists to catch.
SETTINGS="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}/.claude/settings.json"

if [ -f "$SETTINGS" ]; then
  while IFS= read -r prot; do
    [ -z "$prot" ] && continue
    prefix="${prot%%\*\*}"      # .claude/hooks/**  -> .claude/hooks/
    prefix="${prefix%%\*}"      # .env*             -> .env
    [ -z "$prefix" ] && continue
    esc=$(printf '%s' "$prefix" | sed -e 's/[.[\*^$()+?{}|\\]/\\&/g')
    # > path | >> path | tee [-a] path | dd of=path | sed -i ... path
    if echo "$SCAN" | grep -qE "(>>?[[:space:]]*|tee[[:space:]]+(-a[[:space:]]+)?|of=)[\"']?(\./)?${esc}"; then
      echo "Blocked: shell write to protected path (${prot})" >&2
      echo "$PATH_GUIDANCE" >&2
      exit 2
    fi
    if echo "$SCAN" | grep -qE "sed[[:space:]]+-i[^>]*[[:space:]][\"']?(\./)?${esc}"; then
      echo "Blocked: in-place edit of protected path (${prot})" >&2
      echo "$PATH_GUIDANCE" >&2
      exit 2
    fi
  done < <(jq -r '.permissions.deny[]? | select(type=="string") | select(startswith("Edit(")) | ltrimstr("Edit(") | rtrimstr(")")' "$SETTINGS" 2>/dev/null)
fi

exit 0
