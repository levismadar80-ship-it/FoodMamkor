#!/usr/bin/env bash
#
# Module:   claude-md-line-cap-guard.sh
# Purpose:  Fail when CLAUDE.md exceeds its own documented 80-line cap, and
#           print the count on every run so the remaining headroom is visible
#           BEFORE it is gone rather than on the commit that breaks it.
# Touches:  nothing — reads CLAUDE.md (and lstat's AGENTS.md) and prints.
# Does NOT: judge what belongs in CLAUDE.md, enforce any cap on the files it
#           delegates to (`.claude/rules/*.md` have no cap by design), or touch
#           AGENTS.md as a second file — see the symlink section below.
# Related:  scripts/checks/run-all.sh (discovers + runs this),
#           scripts/checks/README.md (authoring contract),
#           CLAUDE.md § "How to update this file" (the rule being enforced).
# History:  MEH-1929 (creation; Tier 1 #3 of
#           docs/audits/2026-08-unenforced-rules-audit.md).
#
# WHY THIS EXISTS — the file enforces itself with memory, which is the bug
#   CLAUDE.md § "How to update this file" sets the cap AND names the exact way
#   it gets broken:
#
#     "Cap: <= 80 lines... The headroom is thinner than it looks - measure with
#      `wc -l CLAUDE.md` before planning an addition, never from memory."
#
#   It then relies on memory to enforce that. Verified 07/08 (MEH-1929) and
#   again 31/08: no guard, no hook, no pre-commit entry. This is the cheapest
#   possible item in that audit — `wc -l` against a constant — and it is the
#   canonical shape of architectural smell #2 (`.claude/rules/workflow.md`):
#   a "remember to check X" sentence standing in for a missing mechanism.
#
# THE COUNT IS `wc -l`, ON PURPOSE
#   CLAUDE.md names `wc -l CLAUDE.md` as THE instrument, so this guard uses the
#   same one. Agreeing with the documented command matters more than being
#   marginally more clever: a guard that reported a different number from the
#   command the file tells you to run would be a second owner for one fact.
#
#   `wc -l` counts NEWLINES, so a final line with no trailing newline is not
#   counted. That is a real one-line blind spot and exactly the size of the
#   discrepancy that matters at a boundary of 80, so it is detected and
#   reported rather than left to be discovered at 81. It is a WARNING, not a
#   failure: the count the rule is written against is still the `wc -l` one.
#
# AGENTS.md — COUNTED ONCE, AND ITS SHAPE IS CHECKED
#   `AGENTS.md` is a SYMLINK to `CLAUDE.md` (MEH-490), so counting both would
#   double-count one file. It is therefore not read here. But the symlink is
#   itself load-bearing: CLAUDE.md's own text records that a session which read
#   "mirrors" as "a synced copy" planned a duplicate edit (MEH-1801). If
#   AGENTS.md is ever a REAL FILE, that mirror has silently become two files
#   that can disagree — so this warns instead of skipping quietly. A silent
#   skip is precisely the null-that-reassures shape `.claude/rules/testing.md`
#   spends two sections on.
#
# WARN-ONLY BAND
#   At >= WARN_AT the guard prints WARNING and still exits 0. run-all.sh
#   surfaces that inline and summarises it as WARN without failing the run
#   (its "WARN SURFACING (MEH-1715)" block). The band exists so the last
#   couple of lines of headroom are visible while there is still time to do
#   something other than delete something in a hurry.
#
# USAGE
#   bash scripts/checks/claude-md-line-cap-guard.sh              # check
#   bash scripts/checks/claude-md-line-cap-guard.sh --self-test  # prove it fails
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164): an unguarded cd that fails leaves the
# guard measuring some other directory's CLAUDE.md, or none, and exiting 0.
cd "$REPO_ROOT" || exit 1

LIMIT=80
WARN_AT=78
TARGET="CLAUDE.md"

# ---------------------------------------------------------------------------
# The measurement, factored out so the self-test exercises the REAL function
# rather than a second copy of the arithmetic (a copy is free to drift from the
# one that matters — .claude/rules/testing.md).
#
# Echoes the wc -l count. Returns 1 if the file is unreadable, so a missing
# file can never be mistaken for a comfortable zero.
# ---------------------------------------------------------------------------
count_lines() {
  local f="$1"
  [ -r "$f" ] || return 1
  wc -l < "$f" | tr -d ' '
}

# 0 = the file ends with a newline (so wc -l counted every line).
ends_with_newline() {
  local f="$1"
  [ -s "$f" ] || return 0
  [ "$(tail -c 1 "$f" | wc -l | tr -d ' ')" = "1" ]
}

# The verdict, given a count. 0 = at/under cap, 1 = over.
over_cap() {
  [ "$1" -gt "$LIMIT" ]
}

# 0 = the mirror is broken: the path EXISTS but is not a symlink, i.e. a second
# real file that can drift from CLAUDE.md. A path that does not exist at all is
# not this guard's business and returns 1.
#
# Factored out so the self-test can exercise it on scratch paths. The obvious
# alternative -- swapping the real AGENTS.md for a file and running the guard --
# is a destructive experiment on a load-bearing symlink to prove a two-token
# predicate, and this repo denies that shape of command for good reason.
mirror_broken() {
  local f="$1"
  [ -e "$f" ] && [ ! -L "$f" ]
}

# ---------------------------------------------------------------------------
# --self-test — run FIRST on every normal invocation (builder-model-guard.sh
# precedent). A guard whose self-test only runs when someone remembers to pass
# a flag is a guard nobody has checked; running it as a preflight means CI
# gates the guard's own correctness, not just the repo's.
#
# The cases are chosen to DISCRIMINATE, not merely to be red somewhere:
# LIMIT-1 / LIMIT / LIMIT+1 pin the boundary in both directions, so an
# off-by-one in `over_cap` fails here instead of shipping. Case 5 is anchored
# to the repo's own CLAUDE.md rather than a fixture (MEH-1909): fixtures prove
# the probe works on shapes I invented, not on the file it is aimed at.
# ---------------------------------------------------------------------------
self_test() {
  local failures=0 ran=0 tmp verdict n
  tmp="$(mktemp)" || return 2

  check() {
    local name="$1" expected="$2" actual="$3"
    ran=$(( ran + 1 ))
    if [ "$expected" = "$actual" ]; then
      echo "  ok   $name (expected $expected, got $actual)"
    else
      echo "  FAIL $name (expected $expected, got $actual)"
      failures=$(( failures + 1 ))
    fi
  }

  # 1-3: the boundary, from below, on it, and above.
  for n in $(( LIMIT - 1 )) "$LIMIT" $(( LIMIT + 1 )); do
    : > "$tmp"
    for _ in $(seq 1 "$n"); do echo "x" >> "$tmp"; done
    verdict=$(over_cap "$(count_lines "$tmp")" && echo over || echo under)
    if [ "$n" -gt "$LIMIT" ]; then
      check "boundary/${n}-lines" "over" "$verdict"
    else
      check "boundary/${n}-lines" "under" "$verdict"
    fi
  done

  # 4: a final line with no trailing newline is NOT counted by wc -l. This is
  #    the blind spot the WARNING exists for; the self-test pins that wc -l
  #    really does undercount here, so the warning is not decoration.
  : > "$tmp"
  for _ in $(seq 1 "$LIMIT"); do echo "x" >> "$tmp"; done
  printf 'no-trailing-newline' >> "$tmp"
  check "no-trailing-newline/undercounts" "$LIMIT" "$(count_lines "$tmp")"
  check "no-trailing-newline/detected" "no" \
    "$(ends_with_newline "$tmp" && echo yes || echo no)"

  # 5: the AGENTS.md mirror predicate, both directions. A symlink must read
  #    intact and a real file must read broken -- if only the second were
  #    asserted, a predicate hardwired to "broken" would pass.
  : > "$tmp"
  check "mirror/real-file-is-broken" "broken" \
    "$(mirror_broken "$tmp" && echo broken || echo intact)"
  ln -sf "$tmp" "${tmp}.link"
  check "mirror/symlink-is-intact" "intact" \
    "$(mirror_broken "${tmp}.link" && echo broken || echo intact)"
  check "mirror/absent-is-intact" "intact" \
    "$(mirror_broken "./definitely-not-a-file-$$" && echo broken || echo intact)"
  rm -f "${tmp}.link"

  # 6: the real file. A probe that has only ever seen fixtures has not been
  #    shown to work on the shape the repo actually uses.
  n="$(count_lines "$TARGET")" || n="UNREADABLE"
  check "real-file/readable" "yes" "$([ "$n" != "UNREADABLE" ] && echo yes || echo no)"

  # 7: fail-loud on an unreadable file — the null must not read as zero.
  check "missing-file/fails" "1" \
    "$(count_lines "./definitely-not-a-file-$$" >/dev/null 2>&1; echo $?)"

  rm -f "$tmp"

  echo
  echo "$ran assertion(s) ran, $failures failed."
  [ "$failures" -eq 0 ]
}

if [ "${1:-}" = "--self-test" ]; then
  echo "claude-md-line-cap-guard --self-test"
  echo
  self_test
  exit $?
elif [ -n "${1:-}" ]; then
  echo "claude-md-line-cap-guard: unknown flag '$1'" >&2
  exit 2
fi

# --- preflight: the guard checks itself before it checks the repo -----------
if ! self_test_out="$(self_test 2>&1)"; then
  echo "claude-md-line-cap-guard SELF-TEST FAILED — the guard is not trustworthy."
  echo "$self_test_out"
  exit 1
fi

# --- the actual check ------------------------------------------------------
if ! count="$(count_lines "$TARGET")"; then
  echo "  FAIL $TARGET: unreadable — cannot measure the ${LIMIT}-line cap."
  echo "A guard that cannot see its subject must fail, not report OK."
  exit 1
fi

warned=0

# AGENTS.md must still be the symlink, not a second copy of the file.
if mirror_broken AGENTS.md; then
  echo "  WARNING AGENTS.md:1"
  echo "      AGENTS.md is a REAL FILE, not a symlink to $TARGET (MEH-490)."
  echo "      The mirror is supposed to be mechanical. Two real files can"
  echo "      disagree, and every edit now needs doing twice (MEH-1801)."
  warned=1
fi

if ! ends_with_newline "$TARGET"; then
  echo "  WARNING $TARGET:$(( count + 1 ))"
  echo "      Final line has no trailing newline, so wc -l does not count it."
  echo "      The real line count is $(( count + 1 )); wc -l reports $count."
  warned=1
fi

if over_cap "$count"; then
  echo "  FAIL $TARGET:$count"
  echo "      $count lines — over the ${LIMIT}-line cap by $(( count - LIMIT ))."
  echo "      Do not raise the cap. Move the addition to .claude/rules/ (domain"
  echo "      rule) or docs/ (long-form), or extend an existing line in place —"
  echo "      that costs zero lines. See CLAUDE.md 'How to update this file'."
  exit 1
fi

if [ "$count" -ge "$WARN_AT" ]; then
  echo "  WARNING $TARGET:$count"
  echo "      $count/${LIMIT} lines — $(( LIMIT - count )) line(s) of headroom left."
  echo "      Plan the next addition as a .claude/rules/ file, not a new line here."
  warned=1
fi

if [ "$warned" -eq 1 ]; then
  echo "claude-md-line-cap-guard WARNED — $TARGET is $count/${LIMIT} lines. Not blocking."
  exit 0
fi

echo "claude-md-line-cap-guard OK — $TARGET is $count/${LIMIT} lines."
exit 0
