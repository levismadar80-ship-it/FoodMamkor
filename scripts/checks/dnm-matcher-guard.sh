#!/usr/bin/env bash
#
# Module:   dnm-matcher-guard
# Purpose:  Pin the DO-NOT-MERGE gate's matcher to a fixture corpus, so neither
#           direction of drift can land unnoticed: a WIDENING that swallows
#           ordinary English (the #2637 false positive) or a NARROWING that lets
#           a real marker through (the far more dangerous direction).
# Touches:  nothing - reads the workflow file named in WORKFLOW below and greps
#           strings. No network, no writes.
# Does NOT: define the matcher. The matcher lives in the workflow, which is
#           CC-deny (MEH-671), and it MUST stay there: moving it into this
#           directory would put the DO-NOT-MERGE rule inside a file CC can edit,
#           which is privilege escalation under rule 32 and defeats the gate's
#           entire purpose. This guard only ASSERTS the workflow's behaviour.
#           It also does not judge PR bodies - that is the gate's own job.
# Related:  the `do-not-merge-gate` job in the workflow (see WORKFLOW),
#           docs/ci/dnm-gate-regex.patch.md (the staged narrowing, Sapir-applied),
#           scripts/checks/run-all.sh (dispatcher), scripts/checks/README.md.
# History:  MEH-1922 (creation - after the #2637 false positive).
#
# TWO MODES, ON PURPOSE
#   The narrowing this guard exists to protect is a workflow edit, and workflow
#   edits are Sapir's. So the guard has to be correct BEFORE and AFTER she
#   applies it, and must be green in both - a guard that reds the whole repo
#   while waiting on one person is a guard nobody keeps.
#
#     pre-patch   the live inline regex. Asserted against the BASELINE table:
#                 exactly what it does today, defects included. Green today;
#                 red the moment anyone edits the regex outside the sanctioned
#                 patch. The known defects are printed as a WARNING (surfaced by
#                 run-all.sh per MEH-1715), never silently tolerated.
#     post-patch  detected by DNM_TITLE_RE= / DNM_BODY_RE= in the workflow.
#                 Asserted against the TARGET table - the behaviour the patch
#                 promises. Any deviation fails.
#
#   The mode is read from the workflow, not from a flag, so it cannot get out of
#   step with reality.
#
# WHY THE BASELINE TABLE RECORDS DEFECTS AS EXPECTED
#   A guard asserting the ideal would be red from birth, and a permanently-red
#   guard is indistinguishable from a broken one. Asserting the MEASURED state
#   means every deviation is a real change someone made. The defects are not
#   hidden by this choice - they are enumerated in KNOWN_DEFECTS and printed on
#   every run.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

SELF_TEST=0
[ "${1:-}" = "--self-test" ] && { SELF_TEST=1; shift; }

# The workflow path is an optional positional arg ONLY so --self-test can feed
# synthetic matchers through the very same code path. run-all.sh and CI call
# this with no arguments, so the default below is what actually gates.
# rtl-ok: the default is a workflow FILENAME, not a CSS padding class. The RTL
# hook's pattern matches the filename - the same false-positive shape this guard
# exists to pin down, one directory over.
WORKFLOW="${1:-.github/workflows/pr-checks.yml}"
PATCH_DOC="docs/ci/dnm-gate-regex.patch.md"

# -- fixture corpus ----------------------------------------------------------
# Format: <kind>|<expected-pre>|<expected-post>|<label>|<text>
#   kind          title | body   (the gate reads both; the narrowing treats them
#                                 differently - a title marker counts anywhere,
#                                 a body marker only as its own line)
#   expected-*    TRIP | PASS
#
# The two #2637 rows are the motivating false positive, taken from that PR body.
# They are the reason this file exists; do not soften them.
FIXTURES=(
  # -- real markers: MUST trip, in both modes, forever ------------------------
  "title|TRIP|TRIP|title carries DO NOT MERGE + reason|DO NOT MERGE - waiting on Sapir"
  "title|TRIP|TRIP|title carries hyphenated marker|DO-NOT-MERGE"
  "title|TRIP|TRIP|title carries DNM-LOCK|feat(x): something DNM-LOCK"
  "body|TRIP|TRIP|body line is exactly the marker|DO NOT MERGE"
  "body|TRIP|TRIP|body line is marker + reason|DO NOT MERGE - waiting on the release"
  "body|TRIP|TRIP|body line is DNM-LOCK|DNM-LOCK"

  # -- the [DNM] token -------------------------------------------------------
  # MEH-1922 acceptance criteria treat [DNM] as a real marker. Measured: the
  # CURRENT regex does not match it at all - a false NEGATIVE in a blocking
  # gate. Recorded as PASS pre-patch because that is the truth, and as TRIP
  # post-patch because the patch closes it.
  "title|PASS|TRIP|title carries [DNM] token|[DNM] feat: something"
  "body|PASS|TRIP|body line is [DNM]|[DNM]"

  # -- decorated markers -----------------------------------------------------
  # Found while drafting the patch: a first-draft body rule that allowed only
  # `-`, `*`, `>` as a line prefix MISSED all four of these, which are ordinary
  # ways a human writes the marker. The shipped rule strips any run of leading
  # NON-alphanumerics instead, which is both simpler and strictly tighter.
  "body|TRIP|TRIP|marker in bold markdown|**DO NOT MERGE**"
  "body|TRIP|TRIP|marker as a heading|## DO NOT MERGE"
  "body|TRIP|TRIP|marker after an emoji|(!) DO NOT MERGE - waiting on Sapir"
  "body|PASS|TRIP|[DNM] after an emoji|(x) [DNM]"

  # -- ordinary English: MUST NOT trip once narrowed --------------------------
  "body|TRIP|PASS|#2637 day-merging test name|many open days that do NOT merge means no disclosure"
  "body|TRIP|PASS|#2637 vitest bullet form|x many open days that do NOT merge"
  "body|TRIP|PASS|bulleted prose, marker mid-line|- many open days that do NOT merge"
  "body|PASS|PASS|near-miss: 'should not merge' was never matched|we should not merge this until CI is green"
  "body|TRIP|PASS|prose about ranges not merging|the test asserts days that do not merge stay separate"
  "body|TRIP|PASS|prose describing this very gate|Fixes the do-not-merge false positive from #2637"
  "body|TRIP|PASS|marker mid-sentence, not a directive|nothing here says do not merge as an instruction"
)

# Defects the baseline table encodes as expected. Printed on every pre-patch run
# so "green" is never read as "healthy".
KNOWN_DEFECTS=(
  "FALSE POSITIVE - ordinary English containing the words blocks the PR (this is what blocked #2637)"
  "FALSE NEGATIVE - the [DNM] token does not match at all, so it silently fails to block"
)

fail=0
warn=0
note() { printf '  %s\n' "$1"; }


# -- self-test ---------------------------------------------------------------
# Repo precedent: .claude/scripts/audit-skills.sh --self-test, which CI asserts
# must exit 1. Same idea - a guard that has never been seen failing is a green
# light of unknown wiring. Each synthetic below is a matcher a careless edit
# could plausibly produce; the guard must reject every one of them.
run_self_test() {
  local tmp rc pass=0 total=0
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  emit_wf() { # $1=file  $2=regex
    printf '%s\n' \
      "  do-not-merge-gate:" \
      "    steps:" \
      "      - run: |" \
      "          if printf '%s' \"\$X\" | grep -Eiq '$2'; then" \
      "            exit 1" \
      "          fi" > "$1"
  }

  check() { # $1=label  $2=file  $3=expected-exit
    total=$((total+1))
    set +e; bash "${BASH_SOURCE[0]}" "$2" >/dev/null 2>&1; rc=$?; set -e
    if [ "$rc" -eq "$3" ]; then
      echo "  ok   $1 (exit $rc)"; pass=$((pass+1))
    else
      echo "  FAIL $1 (exit $rc, wanted $3)"
    fi
  }

  echo "dnm-matcher-guard --self-test"

  # (a) the CURRENT matcher must be accepted - this is the baseline table.
  emit_wf "$tmp/baseline.yml" '(^|[^A-Za-z0-9_-])do[ _-]?not[ _-]?merge([^A-Za-z0-9_-]|$)|DNM-LOCK'
  check "baseline matcher accepted" "$tmp/baseline.yml" 0

  # (b) WIDENED - drops the boundary guards, so it swallows even more prose.
  #     Must be rejected: this is the #2637 failure getting worse.
  emit_wf "$tmp/widened.yml" 'do.?not.?merge|DNM'
  check "widened matcher rejected" "$tmp/widened.yml" 1

  # (c) GUTTED - matches only the literal hyphenated form, so a real
  #     "DO NOT MERGE" in a title sails through. The dangerous direction.
  emit_wf "$tmp/gutted.yml" 'DO-NOT-MERGE'
  check "gutted matcher rejected" "$tmp/gutted.yml" 1

  # (d) NEUTERED - matches nothing at all. A gate that never blocks.
  emit_wf "$tmp/neutered.yml" 'zzz_never_matches_zzz'
  check "neutered matcher rejected" "$tmp/neutered.yml" 1

  echo "  $pass/$total self-test cases behaved correctly"
  [ "$pass" -eq "$total" ] || return 1
  return 0
}

if [ "$SELF_TEST" -eq 1 ]; then
  run_self_test || exit 1
  exit 0
fi

if [ ! -f "$WORKFLOW" ]; then
  echo "$WORKFLOW:0: FAIL - workflow not found; cannot verify the DNM matcher."
  exit 1
fi

GATE_LINE="$(grep -n 'do-not-merge-gate' "$WORKFLOW" | head -1 | cut -d: -f1)"
GATE_LINE="${GATE_LINE:-0}"

TITLE_RE="$(sed -n "s/^[[:space:]]*DNM_TITLE_RE='\(.*\)'[[:space:]]*$/\1/p" "$WORKFLOW" | head -1)"
BODY_RE="$(sed -n "s/^[[:space:]]*DNM_BODY_RE='\(.*\)'[[:space:]]*$/\1/p" "$WORKFLOW" | head -1)"

if [ -n "$TITLE_RE" ] && [ -n "$BODY_RE" ]; then
  MODE="post-patch"
else
  MODE="pre-patch"
  RAW="$(grep "grep -Eiq" "$WORKFLOW" | grep -i "not.\?merge\|DNM" | head -1)"
  INLINE_RE="$(printf '%s' "$RAW" | sed "s/.*grep -Eiq '\(.*\)'; then.*/\1/")"
  if [ -z "$INLINE_RE" ] || [ "$INLINE_RE" = "$RAW" ]; then
    echo "$WORKFLOW:$GATE_LINE: FAIL - could not extract the DNM matcher."
    note "The guard reads the matcher out of the workflow so it tests the REAL"
    note "rule and not a copy of it. Extraction returning nothing means the step"
    note "changed shape. Re-read it and update this guard deliberately."
    exit 1
  fi
  TITLE_RE="$INLINE_RE"
  BODY_RE="$INLINE_RE"
fi

# Pre-patch the gate greps title and body as one blob, so a plain match is
# faithful. Post-patch the body rule is per-line and anchored, which `grep -E`
# already evaluates line-by-line - so the same call models both, and the
# difference lives entirely in the anchors the patch introduces.
trips() {
  local re
  case "$1" in
    title) re="$TITLE_RE" ;;
    *)     re="$BODY_RE" ;;
  esac
  printf '%s' "$2" | grep -Eiq "$re"
}

echo "DNM matcher guard - mode: $MODE"
echo "  matcher source: $WORKFLOW:$GATE_LINE"

for row in "${FIXTURES[@]}"; do
  IFS='|' read -r kind exp_pre exp_post label text <<<"$row"
  expected="$exp_pre"
  [ "$MODE" = "post-patch" ] && expected="$exp_post"

  if trips "$kind" "$text"; then actual="TRIP"; else actual="PASS"; fi

  if [ "$actual" != "$expected" ]; then
    echo "$WORKFLOW:$GATE_LINE: FAIL - [$kind] $label"
    note "expected: $expected   actual: $actual"
    note "text: $text"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "The DNM matcher no longer behaves as pinned."
  note "If you INTENDED to change it, update the fixture table in this file in"
  note "the same commit, and say which direction you moved it - widening"
  note "(more PRs blocked) or narrowing (a real marker can slip through)."
  note "The narrowing this repo has already agreed on is staged in $PATCH_DOC."
  exit 1
fi

if [ "$MODE" = "pre-patch" ]; then
  echo
  echo "WARNING - the live matcher is the PRE-PATCH one. Pinned, but defective:"
  for d in "${KNOWN_DEFECTS[@]}"; do note "- $d"; done
  note "Fix staged for Sapir in $PATCH_DOC (workflows are CC-deny, MEH-671)."
  note "This guard flips to the stricter TARGET table automatically once applied."
  warn=1
fi

if [ "$warn" -ne 0 ]; then
  echo "dnm-matcher-guard: ${#FIXTURES[@]} fixtures pinned, WARNED (see above)."
else
  echo "dnm-matcher-guard: ${#FIXTURES[@]} fixtures pinned, all as expected."
fi
exit 0
