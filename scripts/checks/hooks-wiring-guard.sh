#!/usr/bin/env bash
#
# Module:   hooks-wiring-guard.sh
# Purpose:  Make a hook's WIRING state visible. Fails when a hook script exists
#           on disk but nothing in .claude/settings.json references it, and when
#           settings.json references a hook path that is not on disk. Either
#           state currently reads as coverage and is not detectable without an
#           `ls`.
# Touches:  nothing — reads .claude/settings.json, .claude/hooks/** and the
#           allowlist, prints to stdout/stderr. --self-test writes only inside
#           its own mktemp -d.
# Does NOT: wire anything, edit .claude/settings.json (genuinely deny-enforced,
#           MEH-1708 row 7 / MEH-1500 Phase A), judge whether a hook is CORRECT,
#           or check that a wired hook actually fires. Wiring is Sapir's step by
#           design; this guard only refuses to let its absence be silent.
# Related:  scripts/checks/run-all.sh (discovers + runs this),
#           scripts/checks/README.md (authoring contract + guard-ok idiom),
#           scripts/checks/hooks-wiring-allowlist.txt (deliberate exceptions),
#           .claude/hooks/protect-lint-config.sh (MEH-442 — a hook that fires).
# History:  MEH-1720 (creation — the A2 hand-off failed 0-for-2, MEH-1708
#           rows 12 + 12b).
#
# WHY THIS EXISTS
#   `.claude/settings.json` is write-protected for CC on purpose, so a new hook
#   ships as "script in the PR body, Sapir wires it after merge" (the A2
#   pattern, MEH-696). The intent is right. The hand-off has failed twice out
#   of two, in two different ways:
#     - check-branch-base.sh  — on disk, exits 2, never wired. Its own header
#       admits "unwired by default". The rule it enforces is labelled
#       (CRITICAL) in .claude/rules/workflow.md:10.
#     - check-path-exists.sh  — never landed on disk at all, while
#       docs/CHANGELOG.md:1911 states it shipped. A later session rediscovered
#       the absence (HANDOFF.md:3523) and nothing followed.
#   Neither failure produced a signal. Both read as coverage. That is the whole
#   defect: not that the manual step is manual, but that skipping it is
#   indistinguishable from doing it.
#
# WHY AN ALLOWLIST FILE AND NOT `guard-ok:`
#   scripts/checks/README.md asks every guard to honour `guard-ok: <reason>` on
#   the offending line ±1, and this guard does honour it. But the offending line
#   for direction A lives INSIDE the hook script — i.e. inside .claude/hooks/**,
#   which `permissions.deny` blocks CC from editing (verified by probe, MEH-1500
#   Phase A). So CC can never add the marker to the file that needs it. The
#   allowlist sits outside the protected tree so the exception is writable by
#   whoever is actually making it.
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1   # SC2164: a failed cd would grep nothing and PASS

SETTINGS=".claude/settings.json"
HOOKS_DIR=".claude/hooks"
ALLOWLIST="scripts/checks/hooks-wiring-allowlist.txt"

fail=0
note() { printf '%s\n' "$*" >&2; }

# ── allowlist ────────────────────────────────────────────────────────────────
# Format, one per line:   <basename.sh> :: <reason>
# A REASON IS REQUIRED. An entry with an empty reason is itself a failure — the
# point of the exception is that the next reader learns why it exists, and a
# bare filename teaches nothing.
allowlisted() {
  local name="$1"
  [ -f "$ALLOWLIST" ] || return 1
  local line reason
  line=$(grep -E "^[[:space:]]*${name}[[:space:]]*::" "$ALLOWLIST" 2>/dev/null | head -1)
  [ -n "$line" ] || return 1
  reason=$(printf '%s' "$line" | sed 's/^[^:]*:://' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  if [ -z "$reason" ]; then
    note "  FAIL $ALLOWLIST — '$name' is allowlisted with an EMPTY reason."
    note "       An exception without a reason is the thing this guard exists to prevent."
    fail=1
    return 0   # treated as allowlisted so it is not double-reported below
  fi
  return 0
}

# `guard-ok: <reason>` inside the hook itself (README idiom). Usable by anyone
# who can edit .claude/hooks/** — which CC cannot; see header.
guard_ok() {
  grep -qE 'guard-ok:[[:space:]]*[^[:space:]]' "$1" 2>/dev/null
}

# ── direction A — on disk, referenced nowhere ────────────────────────────────
scanned=0
if [ -d "$HOOKS_DIR" ]; then
  while IFS= read -r hook; do
    [ -n "$hook" ] || continue
    scanned=$((scanned + 1))
    base=$(basename "$hook")
    if grep -qF "$base" "$SETTINGS" 2>/dev/null; then
      continue
    fi
    if allowlisted "$base" || guard_ok "$hook"; then
      continue
    fi
    note "  FAIL $hook — on disk but referenced nowhere in $SETTINGS."
    note "       It will never run. Either wire it, delete it, or add it to"
    note "       $ALLOWLIST with a reason."
    fail=1
  done < <(find "$HOOKS_DIR" -maxdepth 1 -type f -name '*.sh' 2>/dev/null | sort)
fi

# Fail loud on a zero-scan. A find that silently matches nothing would make the
# loop above vacuously green — the exact silently-passing shape README warns
# about (SC2164 note) and the shape validate-registry-paths.py guards with its
# "parsed 0 paths" warning.
if [ "$scanned" -eq 0 ]; then
  note "  FAIL $HOOKS_DIR — scanned 0 hook scripts."
  note "       The directory is missing or the scan is broken; either way this"
  note "       guard cannot vouch for anything. Not treated as 'nothing to do'."
  fail=1
fi

# ── direction B — referenced in settings.json, absent from disk ──────────────
# Catches the check-path-exists.sh class from the other side: a wired entry
# pointing at a file that was never added. Matches .sh and .js because
# .claude/pre-edit-guard.js is wired as a hook too.
if [ -f "$SETTINGS" ]; then
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    if [ ! -f "$ref" ]; then
      note "  FAIL $SETTINGS references '$ref', which does not exist on disk."
      note "       A wired entry pointing at nothing fails open — the hook never"
      note "       runs and nothing reports it."
      fail=1
    fi
  # The trailing (non-alnum|EOL) is load-bearing: without it the character class
  # spans a dot and '.claude/settings.json' yields a phantom '.claude/settings.js'
  # (".js" + "on"), which this guard reported as a missing file on its very first
  # run. A guard whose own extraction invents paths reports failures that cannot
  # be fixed — worse than silence, because someone will try.
  done < <(grep -oE '\.claude/[A-Za-z0-9_/-]+\.(sh|js)([^A-Za-z0-9]|$)' "$SETTINGS" 2>/dev/null \
             | sed -E 's/[^A-Za-z0-9]$//' | sort -u)
fi

# ── self-test ────────────────────────────────────────────────────────────────
# Proves BOTH directions fire and that a reasoned allowlist entry suppresses.
# Runs against a synthetic tree, never the real one.
if [ "${1:-}" = "--self-test" ]; then
  tmp=$(mktemp -d) || exit 1
  trap 'rm -rf "$tmp"' EXIT
  mkdir -p "$tmp/.claude/hooks" "$tmp/scripts/checks"
  cp "$0" "$tmp/scripts/checks/hooks-wiring-guard.sh"
  chmod +x "$tmp/scripts/checks/hooks-wiring-guard.sh"

  st_fail=0
  run() { ( cd "$tmp" && bash scripts/checks/hooks-wiring-guard.sh >/dev/null 2>&1 ); }
  expect() { # <expected-exit> <label>
    local want="$1" label="$2" got
    run; got=$?
    if [ "$got" -eq "$want" ]; then echo "  ok   $label (exit $got)"
    else echo "  FAIL $label — expected exit $want, got $got"; st_fail=1; fi
  }

  # case 1 — wired hook, present on disk → PASS
  printf '%s\n' 'echo hi' > "$tmp/.claude/hooks/wired.sh"
  printf '{"hooks":{"PreToolUse":[{"hooks":[{"command":"bash .claude/hooks/wired.sh"}]}]}}\n' > "$tmp/.claude/settings.json"
  expect 0 "case 1 — wired hook on disk"

  # case 2 — direction A: hook on disk, referenced nowhere → FAIL
  printf '%s\n' 'echo orphan' > "$tmp/.claude/hooks/orphan.sh"
  expect 1 "case 2 — direction A (on disk, unreferenced)"

  # case 3 — allowlisted WITH a reason → PASS again
  printf 'orphan.sh :: deliberately unwired pending a decision\n' > "$tmp/scripts/checks/hooks-wiring-allowlist.txt"
  expect 0 "case 3 — allowlisted with a reason"

  # case 4 — allowlisted with an EMPTY reason → FAIL (the reason is the point)
  printf 'orphan.sh ::\n' > "$tmp/scripts/checks/hooks-wiring-allowlist.txt"
  expect 1 "case 4 — allowlist entry with empty reason"
  printf 'orphan.sh :: deliberately unwired pending a decision\n' > "$tmp/scripts/checks/hooks-wiring-allowlist.txt"

  # case 5 — direction B: settings references a file that is not on disk → FAIL
  printf '{"hooks":{"PreToolUse":[{"hooks":[{"command":"bash .claude/hooks/wired.sh"},{"command":"bash .claude/hooks/ghost.sh"}]}]}}\n' > "$tmp/.claude/settings.json"
  expect 1 "case 5 — direction B (referenced, absent from disk)"

  # case 6 — zero hooks scanned must FAIL, not pass vacuously
  printf '{"hooks":{}}\n' > "$tmp/.claude/settings.json"
  rm -f "$tmp/.claude/hooks/"*.sh
  expect 1 "case 6 — zero-scan fails loud"

  if [ "$st_fail" -eq 0 ]; then echo "hooks-wiring-guard self-test: all cases passed"; exit 0; fi
  echo "hooks-wiring-guard self-test: FAILURES above"; exit 1
fi

if [ "$fail" -ne 0 ]; then
  note ""
  note "hooks-wiring-guard: FAILED — see the entries above."
  exit 1
fi
echo "hooks-wiring-guard: OK — every hook on disk is wired, every wired path exists."
exit 0
