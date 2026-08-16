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
#           docs/ci/meh-1523-dnm-label-gate.patch.md (the staged MECHANISM swap),
#           scripts/checks/run-all.sh (dispatcher), scripts/checks/README.md.
# History:  MEH-1922 (creation - after the #2637 false positive);
#           MEH-1523 (label mode - after #2813 showed marker removal leaves no trace).
#
# THREE MODES, ON PURPOSE
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
#     label       detected by DNM_LABEL_RE= in the workflow. The MEH-1523
#                 mechanism swap: the marker is a GitHub label and the gate reads
#                 nothing else. Asserted against the LABEL table, PLUS a
#                 structural assertion that the step no longer reads PR text at
#                 all - see WHY THE STRUCTURAL ASSERTION EXISTS below.
#
#   The mode is read from the workflow, not from a flag, so it cannot get out of
#   step with reality. `label` is checked FIRST: it is the terminal state, and a
#   workflow carrying both a label matcher and the old regexes is a half-applied
#   patch, which the structural assertion is there to catch rather than average.
#
# WHY THE STRUCTURAL ASSERTION EXISTS (MEH-1523)
#   In label mode the interesting fixtures are the NEGATIVE ones - prose in a PR
#   body that must not block. But a label-only gate never reads a body, so those
#   fixtures pass *by construction*: they would pass just as well against a gate
#   that still scanned text and simply happened not to match my examples. A green
#   with two possible causes is not a signal (.claude/rules/testing.md).
#
#   So the negative direction is asserted STRUCTURALLY instead: the gate step must
#   contain no reference to PR_BODY / PR_TITLE / pull_request.title /
#   pull_request.body. That is the assertion MEH-1523 acceptance criterion 1
#   actually asks for - "delete the text-scanning path; do not leave it dormant" -
#   and it is falsifiable by exactly the change under test.
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
PATCH_DOC_LABEL="docs/ci/meh-1523-dnm-label-gate.patch.md"

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
  "NO AUDIT TRAIL - the marker lives in an editable PR body, so removing it leaves no trace (#2813)"
)

# -- label-mode fixture corpus (MEH-1523) ------------------------------------
# Format: <expected>|<label>|<comma-separated label names carried by the PR>
#
# The matcher runs against LABEL NAMES ONLY, each normalised to lowercase with
# every non-alphanumeric stripped - so `do-not-merge`, `DO NOT MERGE`,
# `do_not_merge` and `don't merge` all collapse to the same two forms
# (donotmerge / dontmerge) that `dono?tmerge` matches.
LABEL_FIXTURES=(
  # -- MUST block -------------------------------------------------------------
  "TRIP|the canonical marker label|do-not-merge"
  "TRIP|spacing + case variant|DO NOT MERGE"
  "TRIP|underscore variant|do_not_merge"
  "TRIP|apostrophe variant (normalises to dontmerge)|don't merge"
  "TRIP|DNM-LOCK as a label - ORDERS 1.4 names BOTH markers|dnm-lock"
  "TRIP|marker alongside ordinary labels|tooling,do-not-merge,docs"
  "TRIP|marker last in the list|docs,Bug,DNM-LOCK"

  # -- MUST NOT block ---------------------------------------------------------
  "PASS|no labels at all|"
  "PASS|ordinary labels only|tooling,docs,Bug"
  "PASS|a label that merely mentions merging|merge-queue"
  "PASS|near-miss wording that is not the marker|should-not-merge"
  "PASS|the repo's real queue label|cc-queue"

  # -- COMPOUND labels: the #2637 class, reborn on the label surface -----------
  # These are the reason the matcher is ANCHORED (^...$) rather than the bare
  # /dono?tmerge/ that MEH-1523 acceptance criterion 2 literally specifies.
  # Unanchored, the normalisation step (strip non-alphanumerics) turns
  # `audit-do-not-merge-findings` into `auditdonotmergefindings`, which CONTAINS
  # `donotmerge` and therefore trips a blocking gate on a documentation label.
  # That is exactly the false positive this whole ticket exists to remove, moved
  # from prose onto metadata - so the swap would have shipped the same bug it was
  # sent to fix. Found by the different-model adversarial reviewer, which
  # constructed the label; it was NOT caught by the original 12 fixtures.
  "PASS|compound label ABOUT the gate, not the marker|audit-do-not-merge-findings"
  "PASS|compound label describing the gate|explains-do-not-merge-gate"
  "PASS|marker text as a suffix of a longer label|blocked-do-not-merge-review"
)

# Residual, stated rather than hidden: anchoring means a label like
# `do-not-merge-yet` normalises to `donotmergeyet` and does NOT fire. That is
# accepted because the marker is ONE canonical label Sapir creates in repo
# settings (patch doc section 6) - a near-miss name has to be deliberately
# created to exist at all, and the anchored rule is the predictable one. The
# variant-tolerance AC2 actually asks for (`do_not_merge`, `DO NOT MERGE`,
# `don't merge`) is fully preserved, because all of those normalise to the same
# two strings the anchored matcher accepts.

# -- text that MUST be irrelevant in label mode ------------------------------
# These are the MEH-1523 acceptance-criteria fixtures 3-5 plus the two real
# incidents. In label mode they are NOT evaluated against a regex, because the
# gate has no text path left to evaluate them against - that absence is asserted
# structurally instead (see WHY THE STRUCTURAL ASSERTION EXISTS at the top).
# They are listed so a reader can see exactly which strings the swap frees, and
# so the #2121 / #2813 sentences remain permanently on the record.
TEXT_MUST_NOT_MATTER=(
  "#2121 verbatim - the orchestrator's own safety note|do not merge until Sapir confirms"
  "#2813 verbatim - CC's own prose, which reddened a required gate|Do not merge this as complete."
  "#2637 verbatim - a pasted vitest test name|many open days that do NOT merge"
  "the phrase in a commit message|fix(ci): explain why we do not merge on red"
  "the phrase in a fenced code block|    grep -Eiq 'do[ _-]?not[ _-]?merge'"
)

# Tokens whose presence anywhere in the gate step proves a text path survives.
FORBIDDEN_TEXT_TOKENS=(
  "PR_BODY"
  "PR_TITLE"
  "pull_request.title"
  "pull_request.body"
)

fail=0
warn=0
note() { printf '  %s\n' "$1"; }

# -- helpers shared by label mode --------------------------------------------

# Print just the `do-not-merge-gate:` job block, so the structural assertion
# cannot be fooled by a PR_BODY reference belonging to some OTHER job in the
# same workflow (there are several). Ends at the next key indented two spaces.
gate_block() {
  awk '
    /^[[:space:]][[:space:]][A-Za-z0-9_-]+:[[:space:]]*$/ {
      # Exact key match, not a substring: a future job named e.g.
      # `pre-do-not-merge-gate-setup` must NOT be read as this gate.
      inblock = ($0 ~ /^[[:space:]][[:space:]]do-not-merge-gate:[[:space:]]*$/) ? 1 : 0
    }
    inblock { print }
  ' "$WORKFLOW"
}

# Collapse a label name to the form the matcher runs against: lowercase, every
# non-alphanumeric removed. `DO NOT MERGE` -> donotmerge; `don't merge` ->
# dontmerge. This MUST mirror the workflow's own normalisation step; the patch
# doc pins both to the same two commands so they cannot drift silently.
normalise_label() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]'
}

# One fixture row: does this set of label names trip the gate?
labels_trip() {
  local csv="$1" name norm
  local IFS=','
  # An empty label list must never trip - read it as zero labels, not one empty.
  [ -z "$csv" ] && return 1
  for name in $csv; do
    norm="$(normalise_label "$name")"
    [ -n "$norm" ] || continue
    printf '%s' "$norm" | grep -Eq "$LABEL_RE" && return 0
  done
  return 1
}


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

  # -- label mode (MEH-1523) -------------------------------------------------
  # Emits a LABEL-shaped gate. The optional third argument injects one extra
  # line into the step, which is how the structural assertion is exercised.
  emit_label_wf() { # $1=file  $2=label-regex  $3=optional extra line in the step
    {
      printf '%s\n' \
        "  do-not-merge-gate:" \
        "    steps:" \
        "      - env:" \
        "          PR_LABELS: \${{ toJSON(github.event.pull_request.labels.*.name) }}" \
        "        run: |" \
        "          DNM_LABEL_RE='$2'"
      if [ -n "${3:-}" ]; then printf '          %s\n' "$3"; fi
      # A second job, so the block-extraction boundary is exercised rather than
      # assumed: everything below this line must NOT be read as part of the gate.
      printf '%s\n' "  repo-guards:" "    steps:" "      - run: echo PR_BODY"
    } > "$1"
  }

  # (e) the agreed label matcher must be ACCEPTED - this is the LABEL table.
  emit_label_wf "$tmp/label-ok.yml" '^(dono?tmerge|dnmlock)$'
  check "label matcher accepted" "$tmp/label-ok.yml" 0

  # (e2) UNANCHORED - the form MEH-1523 acceptance criterion 2 literally
  #      specifies, and the form this guard shipped with in its first draft.
  #      Normalisation strips non-alphanumerics, so `audit-do-not-merge-findings`
  #      becomes `auditdonotmergefindings`, which CONTAINS `donotmerge` and trips
  #      a BLOCKING gate on a documentation label. That is the #2637 false
  #      positive moved from prose onto metadata - the swap shipping the same bug
  #      it was sent to fix.
  #
  #      This case is the MEH-1619 discrimination requirement made concrete: it
  #      goes RED against the previous version of this matcher and GREEN against
  #      the anchored one, so it can tell the two apart. The original 12 fixtures
  #      could not - every one of them passed under both forms.
  emit_label_wf "$tmp/label-unanchored.yml" 'dono?tmerge|dnmlock'
  check "unanchored label matcher rejected (substring false positive)" "$tmp/label-unanchored.yml" 1

  # (f) TEXT PATH SURVIVING - the label matcher is correct, but the step still
  #     greps the body. Every negative fixture still passes, so ONLY the
  #     structural assertion can catch this. It is the whole reason that
  #     assertion exists, and this is the case that proves it discriminates.
  emit_label_wf "$tmp/label-textleft.yml" '^(dono?tmerge|dnmlock)$' \
    'printf "%s" "$PR_BODY" | grep -Eiq "do[ _-]?not[ _-]?merge" && exit 1'
  check "label matcher WITH a surviving text path rejected" "$tmp/label-textleft.yml" 1

  # (g) GUTTED - matches the hyphenated literal only. Since the gate normalises
  #     labels by stripping non-alphanumerics, `do-not-merge` never reaches the
  #     matcher in that form, so this blocks NOTHING. The dangerous direction.
  emit_label_wf "$tmp/label-gutted.yml" 'do-not-merge'
  check "gutted label matcher rejected" "$tmp/label-gutted.yml" 1

  # (h) WIDENED - any label mentioning merging trips it, so `merge-queue` blocks
  #     the PR. The #2637 failure reincarnated on the label surface.
  emit_label_wf "$tmp/label-widened.yml" 'merge'
  check "widened label matcher rejected" "$tmp/label-widened.yml" 1

  # (i) NEUTERED - matches nothing.
  emit_label_wf "$tmp/label-neutered.yml" 'zzz_never_matches_zzz'
  check "neutered label matcher rejected" "$tmp/label-neutered.yml" 1

  # (j) HALF-APPLIED - the marker moved to a label but DNM-LOCK was dropped from
  #     the matcher, so a PR labelled dnm-lock sails through. ORDERS 1.4 names
  #     both markers, so losing one is a false negative in a blocking gate.
  emit_label_wf "$tmp/label-nolock.yml" '^(dono?tmerge)$'
  check "label matcher missing DNM-LOCK rejected" "$tmp/label-nolock.yml" 1

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
LABEL_RE="$(sed -n "s/^[[:space:]]*DNM_LABEL_RE='\(.*\)'[[:space:]]*$/\1/p" "$WORKFLOW" | head -1)"

# ---------------------------------------------------------------------------
# LABEL MODE (MEH-1523) - checked first, because it is the terminal state.
# ---------------------------------------------------------------------------
if [ -n "$LABEL_RE" ]; then
  echo "DNM matcher guard - mode: label"
  echo "  matcher source: $WORKFLOW:$GATE_LINE"
  echo "  label matcher:  $LABEL_RE"
  echo

  # (1) STRUCTURAL - the text path must be GONE, not dormant. This is the
  #     assertion that makes the negative fixtures below mean anything; without
  #     it they pass against a gate that still scans text (testing.md: a green
  #     with two possible causes is not a signal).
  block="$(gate_block)"
  if [ -z "$block" ]; then
    echo "$WORKFLOW:$GATE_LINE: FAIL - could not isolate the do-not-merge-gate job block."
    note "Label mode asserts the ABSENCE of a text path, and an absence cannot be"
    note "asserted against an empty extraction - that would pass for the wrong"
    note "reason. Re-read the job and update this guard deliberately."
    exit 1
  fi
  for tok in "${FORBIDDEN_TEXT_TOKENS[@]}"; do
    if printf '%s' "$block" | grep -qF "$tok"; then
      echo "$WORKFLOW:$GATE_LINE: FAIL - the gate still reads PR text ($tok)."
      note "MEH-1523 acceptance criterion 1: the text-scanning path is DELETED,"
      note "not disabled. A label gate that still greps a body has two markers,"
      note "and the prose one is the one that fires by accident (#2637, #2813)."
      fail=1
    fi
  done

  # (2) BEHAVIOURAL - the label matcher itself, both directions.
  for row in "${LABEL_FIXTURES[@]}"; do
    IFS='|' read -r expected label csv <<<"$row"
    if labels_trip "$csv"; then actual="TRIP"; else actual="PASS"; fi
    if [ "$actual" != "$expected" ]; then
      echo "$WORKFLOW:$GATE_LINE: FAIL - [label] $label"
      note "expected: $expected   actual: $actual"
      note "labels: ${csv:-(none)}"
      fail=1
    fi
  done

  if [ "$fail" -ne 0 ]; then
    echo
    echo "The DNM label gate no longer behaves as pinned."
    note "If you INTENDED to change it, update LABEL_FIXTURES in this file in the"
    note "same commit, and say which direction you moved it - widening (more PRs"
    note "blocked) or narrowing (a real marker can slip through)."
    note "The agreed mechanism is documented in $PATCH_DOC_LABEL."
    exit 1
  fi

  echo "  ${#LABEL_FIXTURES[@]} label fixtures pinned, all as expected."
  echo "  text path absent - none of ${#FORBIDDEN_TEXT_TOKENS[@]} forbidden tokens present."
  echo
  echo "  Freed by the swap (no longer capable of blocking a PR):"
  for row in "${TEXT_MUST_NOT_MATTER[@]}"; do
    IFS='|' read -r label text <<<"$row"
    note "- $label"
    note "    $text"
  done
  echo
  echo "dnm-matcher-guard: label mode, ${#LABEL_FIXTURES[@]} fixtures pinned, all as expected."
  exit 0
fi

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
  note "TWO patches are staged for Sapir (workflows are CC-deny, MEH-671). They"
  note "fix different things and the second SUPERSEDES the first:"
  note "  1. $PATCH_DOC"
  note "     narrows the regex - closes defects 1 and 2, keeps text scanning."
  note "  2. $PATCH_DOC_LABEL"
  note "     swaps the mechanism to a label - closes all THREE, including the"
  note "     audit trail, and deletes the text path. Apply this one and 1 is moot."
  note "This guard flips to the matching stricter table automatically once applied."
  warn=1
fi

if [ "$warn" -ne 0 ]; then
  echo "dnm-matcher-guard: ${#FIXTURES[@]} fixtures pinned, WARNED (see above)."
else
  echo "dnm-matcher-guard: ${#FIXTURES[@]} fixtures pinned, all as expected."
fi
exit 0
