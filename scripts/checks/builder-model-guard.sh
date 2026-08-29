#!/usr/bin/env bash
#
# Module:   builder-model-guard
# Purpose:  Enforce maker != checker mechanically. Every commit declares the
#           model that wrote it in a `Builder-Model:` trailer, and the guard
#           fails when that value equals the adversarial reviewer's pinned
#           model — the condition under which the review has no evidentiary
#           value at all.
# Touches:  nothing — reads the git object store and one workflow file.
# Does NOT: check that the declared model is TRUE. Nothing in this repo can:
#           the trailer is an assertion by the session that wrote the commit.
#           What this guarantees is that the assertion EXISTS and does not
#           collide with the pin — not that it is honest. A session that lies
#           in the trailer defeats it, and no grep can tell.
# Related:  scripts/checks/changelog-branch-guard.sh (merge-ref parent
#           resolution, MEH-1634), scripts/checks/map-attribution-guard.sh
#           (guard shape + escape hatch), docs/ci/adversarial-review.patch.md
#           (§2 — the model-identity reasoning this guard mechanises),
#           .github/workflows/claude-review.yml (the pin, parsed at runtime).
# History:  MEH-1668 (creation — closes the MEH-1654 declaration gap).
#
# WHY THIS EXISTS
#   MEH-1654 established that the adversarial reviewer must not be the model
#   that wrote the diff, and that the action cannot check this itself: it knows
#   its own model, never the builder's. So the guarantee was a DECLARATION in
#   the PR body that Sapir read and judged, every PR, by hand.
#
#   That failed immediately, on the ticket about it. MEH-1654 declared
#   `Model: Sonnet 4.6`; the session ran as `claude-opus-5`; the proposed pin
#   was `claude-opus-5`. Reviewer and builder were the same model on the PR
#   whose subject was reviewer identity. CC reported it unprompted — which is
#   precisely what must not be the mechanism.
#
#   A git trailer is checkable, survives squash-merge into the commit body, and
#   needs no workflow edit to enforce: run-all.sh finds this file on its own.
#
# WARN-ONLY, WITH A DATE THAT ENDS IT
#   Zero commits in this repo's history carry the trailer, so a blocking guard
#   would have redded all 17 open PRs on landing. It therefore WARNS until
#   ENFORCE_FROM below, then blocks — mechanically, with no second ticket and
#   nobody remembering. An expiry a human has to action is a promise, not a
#   deadline, and this repo has the empty MEH-487 calibration tally to show for
#   that class (eleven weeks, zero rows, a pointer to a section never created).
#
#   Everything the guard can say — missing trailer, pin collision, a pin it
#   could not parse — is a warning before the date and a failure after it. One
#   rule, no per-finding exceptions to remember.
#
# WHICH COMMIT IT READS  (spec correction, stated because it inverts the brief)
#   MEH-1668 said "resolve real HEAD via the MEH-1634 first-parent path". The
#   mechanism is right and the parent is not: GitHub builds refs/pull/N/merge
#   by merging the PR head INTO the base, so parent 1 is the BASE — which is
#   what changelog-branch-guard.sh wants and the opposite of what this guard
#   wants. The PR's own head commit is parent **2**. Taking parent 1 would read
#   a commit already on staging and report on the wrong author entirely.
#
#   Same shallow-safe mechanism either way: parents come from the raw commit
#   object (`git cat-file commit HEAD`), which survives shallow grafting where
#   `git rev-parse HEAD^2` does not.
#
#   Outside CI (GITHUB_REF unset or not a merge ref) HEAD is the commit itself.
#   The gate on GITHUB_REF is load-bearing: a feature branch synced with
#   `git merge origin/staging` (rule 25) is ALSO a merge commit, and its
#   parent 2 is whatever staging happened to be — not this branch's work.
#
# DEPENDABOT
#   Exempt, unconditionally. No CC session authors those commits, so no trailer
#   will ever appear on one; without the exemption every future dependency bump
#   is blocked forever. Detected from the commit author, not GITHUB_ACTOR — a
#   human re-running a dependabot job would otherwise flip the answer.
#
# ESCAPE HATCH
#   `guard-ok: <reason>` in the commit message. A reason is required; the bare
#   marker does not suppress.
#
#   The +/-1 line window used by map-attribution-guard.sh and the RTL hook
#   applies ONLY to the pin-collision case, anchored on the `Builder-Model:`
#   line. For a MISSING trailer there is no offending line to anchor to, so the
#   marker is accepted anywhere in the message. Stating the asymmetry rather
#   than implying a window that cannot exist.
#
# USAGE
#   bash scripts/checks/builder-model-guard.sh
#   BUILDER_MODEL_GUARD_ENFORCE=1 bash scripts/checks/builder-model-guard.sh
#     — forces post-expiry behaviour. This is how the negative controls
#       demonstrate the blocking arm before the date arrives; it is not a
#       production switch and nothing in CI sets it.
#
set -uo pipefail

# ---------------------------------------------------------------------------
# The date the warn-only window closes. 2026-08-17.
#
# WHY THIS DATE: it is not "Patch A lands", which is a hand-paste with no gate
# and could be any day. The binding constraint is trailer PROPAGATION across
# the 17 PRs open on 27/07 — several long-lived (#2055, #2180) and 8 of them
# dependabot branches that only refresh on their own bump cycle. Three weeks
# covers two full weekly batches plus a dependabot cycle. It also lands after
# the pin is expected to flip sonnet-4-6 -> opus-5, so the collision arm gets
# exercised on real traffic while it is still only a warning.
# ---------------------------------------------------------------------------
ENFORCE_FROM="2026-08-17"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164): an unguarded cd that fails leaves the
# guard reading the wrong repo and exiting 0 — a silently-passing check.
cd "$REPO_ROOT" || exit 1

REVIEW_WORKFLOW=".github/workflows/claude-review.yml"
TRAILER_KEY="Builder-Model"
VRT_WORKFLOW=".github/workflows/vrt-update.yml"

# ---------------------------------------------------------------------------
# have_commit / fetch_commit — a shallow clone resolves a SHA it never fetched,
# so `git rev-parse` alone proves nothing. Mirrors changelog-branch-guard.sh.
# ---------------------------------------------------------------------------
have_commit() { git cat-file -e "${1}^{commit}" 2>/dev/null; }

fetch_commit() {
  local sha="$1" depth
  if git fetch --no-tags --quiet --depth=1 origin "$sha" 2>/dev/null && have_commit "$sha"; then
    return 0
  fi
  # Deepen the PR's own branch — the head commit is its tip, so the base
  # branch (what changelog-branch-guard deepens) would never reach it.
  [ -n "${GITHUB_HEAD_REF:-}" ] || return 1
  for depth in 50 250 1000; do
    git fetch --no-tags --quiet --depth="$depth" origin "$GITHUB_HEAD_REF" 2>/dev/null || return 1
    have_commit "$sha" && return 0
  done
  return 1
}

# ---------------------------------------------------------------------------
# THE EXEMPTION PREDICATE — the one rule --self-test drives.
#
#   is_exempt_bot_author "<name> <email>"  ->  0 = exempt, 1 = checked
#
# Extracted from the inline `if` it used to be so the self-test exercises the
# REAL implementation. A second copy in the test would be free to drift from
# the one that matters, and the drift would be invisible.
#
# SCOPE, deliberately narrow: dependabot ONLY. `github-actions[bot]` — which
# is what vrt-update.yml commits as — is NOT exempt and MUST NOT be added here
# without a decision. Widening this predicate shrinks the set of commits the
# guard checks; workflow.md rule 32 ("CC adds constraints, never removes")
# makes that direction off-limits to a session acting on its own. The
# self-test below pins the split so a widening cannot land silently.
# ---------------------------------------------------------------------------
is_exempt_bot_author() {
  printf '%s' "${1:-}" | grep -qiE 'dependabot(\[bot\])?'
}

# The generic Actions identity. NOT exempt on its own — see the two-condition
# rule below. Every workflow in the repo can commit under this name, so an
# identity-only exemption would open the gate to any commit any future workflow
# makes. The condition is what it TOUCHED, not who it is.
is_github_actions_author() {
  printf '%s' "${1:-}" | grep -qiE 'github-actions(\[bot\])?'
}

# VRT baseline paths, matching what vrt-update.yml:176 stages
# (`git add frontend/e2e/visual/*-snapshots`).
VRT_BASELINE_RE='^frontend/e2e/visual/[^/]+-snapshots/'

# paths_are_vrt_baseline_only — pure, so --self-test drives it directly.
#   stdin: newline-separated paths.  0 = at least one path AND all baseline.
# EMPTY INPUT RETURNS 1, deliberately. "No paths" is what an unreadable diff
# looks like in a shallow clone (measured: `git diff-tree` there exits 0 with
# no output), and a vacuous "all of nothing matched" would hand the exemption
# to any bot commit whose diff the guard could not read. An empty commit is not
# a baseline regen either, so requiring >=1 path costs nothing real.
paths_are_vrt_baseline_only() {
  local line seen=0
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    seen=1
    printf '%s' "$line" | grep -qE "$VRT_BASELINE_RE" || return 1
  done
  [ "$seen" -eq 1 ]
}

# commit_changed_paths — prints the paths a commit changed; returns 1 when that
# CANNOT BE DETERMINED, which the caller must treat as "not exempt".
#
# Needs the PARENT object, not just the commit: repo-guards checks out at
# fetch-depth 1 (pr-checks.yml) and a depth-1 clone of a merge commit does not
# carry its parents (measured). fetch_commit() is the same on-demand helper the
# target resolution above already relies on.
commit_changed_paths() {
  local ref="$1" parent
  parent="$(git cat-file commit "$ref" 2>/dev/null | awk '/^parent/{print $2; exit}')"
  [ -n "$parent" ] || return 1                       # root commit: undeterminable
  have_commit "$parent" || fetch_commit "$parent" || return 1
  git diff-tree --no-commit-id --name-only -r "$parent" "$ref" 2>/dev/null || return 1
}

# is_exempt_bot_commit — the two-condition rule.
#   dependabot            -> exempt on identity alone (unchanged)
#   github-actions[bot]   -> exempt ONLY if the diff is confined to baselines
#   anything else         -> checked
is_exempt_bot_commit() {
  local author="$1" ref="${2:-}" paths
  is_exempt_bot_author "$author" && return 0
  is_github_actions_author "$author" || return 1
  [ -n "$ref" ] || return 1
  paths="$(commit_changed_paths "$ref")" || return 1
  printf '%s\n' "$paths" | paths_are_vrt_baseline_only
}

# ---------------------------------------------------------------------------
# self-test
#
# Cases 1-3 are synthetic and cover the edges. Case 4 is anchored in a REAL
# repo file (MEH-1909): it reads the committer identity out of vrt-update.yml
# rather than restating it, so the assertion tracks the workflow instead of a
# fixture's idea of it. If Sapir changes that identity, this case follows.
# ---------------------------------------------------------------------------
self_test() {
  echo "builder-model-guard --self-test"
  echo
  local failures=0 ran=0

  expect() { # expect LABEL WANT_RC AUTHOR
    local label="$1" want="$2" author="$3" got
    ran=$((ran + 1))
    is_exempt_bot_author "$author"; got=$?
    if [ "$got" -eq "$want" ]; then
      echo "  ok    ${label}  (rc=${got})"
    else
      echo "  FAIL  ${label}  (want rc=${want}, got ${got})  author=${author}"
      failures=$((failures + 1))
    fi
  }

  # 1-2: the discriminating pair. Same commit message in the wild; the author
  #      string is the only difference, and it must flip the verdict.
  expect "dependabot is exempt" 0 \
    'dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>'
  expect "github-actions is NOT exempt" 1 \
    'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>'
  # 3: a human/session author is never exempt.
  expect "a session author is NOT exempt" 1 \
    'Claude <noreply@anthropic.com>'

  # 4-7: the two-condition rule, driven through the pure path classifier.
  expect_paths() { # expect_paths LABEL WANT_RC <<paths>>
    local label="$1" want="$2" paths="$3" got
    ran=$((ran + 1))
    printf '%s\n' "$paths" | paths_are_vrt_baseline_only; got=$?
    if [ "$got" -eq "$want" ]; then
      echo "  ok    ${label}  (rc=${got})"
    else
      echo "  FAIL  ${label}  (want rc=${want}, got ${got})"
      failures=$((failures + 1))
    fi
  }
  expect_paths "baseline-only diff is confined" 0 \
    'frontend/e2e/visual/parity.spec.ts-snapshots/about-desktop-linux.png
frontend/e2e/visual/parity.spec.ts-snapshots/about-mobile-linux.png'
  expect_paths "a code path is NOT confined" 1 \
    'frontend/e2e/visual/parity.spec.ts-snapshots/about-desktop-linux.png
scripts/checks/builder-model-guard.sh'
  expect_paths "an EMPTY diff is NOT confined (vacuous-truth trap)" 1 ''
  expect_paths "a lookalike path outside the dir is NOT confined" 1 \
    'frontend/e2e/visual/parity.spec.ts-snapshots-evil/x.png'

  # 8-9: REAL-COMMIT ANCHORS (MEH-1909). Synthetic paths prove the classifier
  # works on shapes I invented; these prove it is aimed at what this repo
  # actually produces. Skipped only when the object is genuinely absent from a
  # shallow clone — and that is reported, never silently counted as a pass.
  local real_bot="fc2c795e" real_code="dc72902c"
  anchor_commit() { # anchor_commit LABEL SHA WANT_RC
    local label="$1" sha="$2" want="$3" paths got
    ran=$((ran + 1))
    if ! have_commit "$sha"; then
      echo "  FAIL  real-commit anchor ${label} (${sha}) — object absent from this clone."
      echo "        Not counted as a pass: an anchor that cannot read its subject"
      echo "        proves nothing. Deepen the clone and re-run."
      failures=$((failures + 1))
      return
    fi
    paths="$(commit_changed_paths "$sha")" || { echo "  FAIL  real-commit anchor ${label} — diff undeterminable"; failures=$((failures + 1)); return; }
    printf '%s\n' "$paths" | paths_are_vrt_baseline_only; got=$?
    if [ "$got" -eq "$want" ]; then
      echo "  ok    real-commit anchor ${label} (${sha}, $(printf '%s\n' "$paths" | grep -c .) path(s)) rc=${got}"
    else
      echo "  FAIL  real-commit anchor ${label} (${sha}) want rc=${want}, got ${got}"
      failures=$((failures + 1))
    fi
  }
  anchor_commit "the VRT bot regen"      "$real_bot"  0
  anchor_commit "a real code commit"     "$real_code" 1

  # 4: REAL-FILE ANCHOR. Compose the author from vrt-update.yml's own
  #    `git config` lines and assert the guard still checks it.
  ran=$((ran + 1))
  local vrt_name vrt_email vrt_author
  vrt_name="$(sed -nE 's/^[[:space:]]*git config user\.name[[:space:]]+"(.*)"[[:space:]]*$/\1/p' "$VRT_WORKFLOW" 2>/dev/null | head -1)"
  vrt_email="$(sed -nE 's/^[[:space:]]*git config user\.email[[:space:]]+"(.*)"[[:space:]]*$/\1/p' "$VRT_WORKFLOW" 2>/dev/null | head -1)"
  if [ -z "$vrt_name" ] || [ -z "$vrt_email" ]; then
    # Fail loudly rather than silently skipping: a case that cannot read its
    # subject is not a case that passed. This is the null-that-reassures trap
    # the repo's own testing rules spend two sections on.
    echo "  FAIL  real-file anchor  — could not parse the committer identity from ${VRT_WORKFLOW}."
    echo "        Every other result in this run is suspect: the anchor is what proves"
    echo "        the predicate is aimed at the shape this repo actually uses."
    failures=$((failures + 1))
  else
    vrt_author="${vrt_name} <${vrt_email}>"
    is_exempt_bot_author "$vrt_author"
    if [ $? -eq 1 ]; then
      echo "  ok    real-file anchor: ${VRT_WORKFLOW} commits as '${vrt_author}' and is NOT exempt"
    else
      echo "  FAIL  real-file anchor: ${VRT_WORKFLOW} commits as '${vrt_author}', which the"
      echo "        predicate now treats as EXEMPT. The exemption was widened; see rule 32."
      failures=$((failures + 1))
    fi
  fi

  echo
  # Derived, never stated: a hardcoded count goes stale the moment a case is
  # added, and a passing run would then misreport its own coverage.
  if [ "$failures" -eq 0 ]; then
    echo "builder-model-guard --self-test OK — ${ran} case(s), 0 failures."
    return 0
  fi
  echo "builder-model-guard --self-test FAILED — ${ran} case(s), ${failures} failure(s)."
  return 1
}

# ---------------------------------------------------------------------------
# Arguments. Before this existed the script parsed NOTHING, so any flag —
# `--self-test` included — silently ran the normal guard and exited 0. A green
# that means "your flag was ignored" is indistinguishable from a green that
# means "the test passed", which is the exact failure class .claude/rules/
# testing.md documents. An unknown flag now exits 2.
# ---------------------------------------------------------------------------
case "${1:-}" in
  --self-test) self_test; exit $? ;;
  "")          ;;
  *)           echo "builder-model-guard: unknown argument '$1'" >&2
               echo "  usage: bash scripts/checks/builder-model-guard.sh [--self-test]" >&2
               exit 2 ;;
esac

echo "builder-model-guard (MEH-1668) — repo root: $REPO_ROOT"
echo

# ---------------------------------------------------------------------------
# PREFLIGHT — run the self-test on every normal run.
#
# Without this the self-test is a test nobody runs: `repo-guards` invokes each
# guard with no arguments (run-all.sh:145) and NO workflow runs --self-test on
# anything in this directory. Pinning the exemption split would then be a claim
# rather than a gate, and a future widening of is_exempt_bot_author() would
# land green. Wiring it into CI directly would need a .github/workflows/** edit
# (CC-deny); running it here needs nothing and gates it transitively.
#
# Cost is a few milliseconds and no subprocess. On success it is silent, so a
# normal run's output is unchanged.
# ---------------------------------------------------------------------------
if ! self_test_output="$(self_test 2>&1)"; then
  printf '%s\n' "$self_test_output"
  echo
  echo "builder-model-guard FAILED — its own self-test does not pass."
  echo "The guard refuses to judge a commit while its exemption rule is broken:"
  echo "a verdict from an instrument that fails its own control is worth nothing."
  exit 1
fi

# ---------------------------------------------------------------------------
# Mode. Everything below reports through warn() or fail() and never exits
# early, so one run tells you about every problem at once.
# ---------------------------------------------------------------------------
today="$(date -u +%F)"
if [ -n "${BUILDER_MODEL_GUARD_ENFORCE:-}" ]; then
  enforcing=1
  mode_note="forced by BUILDER_MODEL_GUARD_ENFORCE"
elif [[ "$today" > "$ENFORCE_FROM" || "$today" == "$ENFORCE_FROM" ]]; then
  enforcing=1
  mode_note="on/after ENFORCE_FROM=$ENFORCE_FROM"
else
  enforcing=0
  mode_note="warn-only until $ENFORCE_FROM (today $today)"
fi
echo "  mode: $([ "$enforcing" -eq 1 ] && echo ENFORCING || echo WARN-ONLY) — $mode_note"
echo

problems=0
report() {
  echo "  $([ "$enforcing" -eq 1 ] && echo VIOLATION || echo WARNING) $1"
  shift
  for line in "$@"; do echo "      $line"; done
  problems=$(( problems + 1 ))
}

# ---------------------------------------------------------------------------
# pr_head_sha — SECOND parent of refs/pull/N/merge (the PR's own head commit).
# See "WHICH COMMIT IT READS" above for why it is parent 2, not parent 1.
# Echoes the SHA, or returns 1 when this is not a PR-merge checkout.
# ---------------------------------------------------------------------------
pr_head_sha() {
  case "${GITHUB_REF:-}" in
    refs/pull/*/merge) ;;
    *) return 1 ;;
  esac

  local parents second
  # Parent lines live in the commit header, above the first blank line. The
  # raw object survives shallow grafting; `git rev-parse HEAD^2` does not.
  parents="$(git cat-file commit HEAD 2>/dev/null | sed -n '/^$/q; s/^parent //p')"
  [ "$(printf '%s\n' "$parents" | grep -c .)" -ge 2 ] || return 1
  second="$(printf '%s\n' "$parents" | sed -n '2p')"
  [ -n "$second" ] || return 1

  have_commit "$second" || fetch_commit "$second" || return 1
  printf '%s\n' "$second"
}

# ---------------------------------------------------------------------------
# skip_sync_merges <rev> — walk first parents past any merge commits sitting on
# top of the branch, and echo the first commit that is not a merge.
#
# WHY: rule 25 REQUIRES `git merge origin/staging` before every push, so a
# compliant branch tip is very often a sync merge — and a sync merge is not
# authored work, so it carries no trailer and never will. Inspecting it would
# red exactly the branches that followed the rule. Caught by MEH-1668's own CI
# negative control 5a, which redded on its own sync merge (08c295c) rather than
# on the commit under test; the four local controls could not see it, because
# locally the tip is a plain commit.
#
# First parent is the right direction and the safe one: on a feature-branch
# sync merge, parent 1 is the branch's OWN previous tip and parent 2 is
# origin/staging, so the walk stays on this branch's work and cannot wander
# into base history. Bounded at 20 hops — a branch buried under 20 consecutive
# merges with no commit of its own is not a case worth guessing at, and an
# unbounded loop on a malformed history is worse than an honest give-up.
# ---------------------------------------------------------------------------
skip_sync_merges() {
  local rev="$1" hops=0 parents
  while [ "$hops" -lt 20 ]; do
    parents="$(git cat-file commit "$rev" 2>/dev/null | sed -n '/^$/q; s/^parent //p')"
    [ "$(printf '%s\n' "$parents" | grep -c .)" -ge 2 ] || { printf '%s\n' "$rev"; return 0; }
    rev="$(printf '%s\n' "$parents" | head -n 1)"
    have_commit "$rev" || fetch_commit "$rev" || return 1
    hops=$(( hops + 1 ))
  done
  return 1
}

# ---------------------------------------------------------------------------
# Resolve the commit under inspection.
# ---------------------------------------------------------------------------
if target="$(pr_head_sha)" && [ -n "$target" ]; then
  how="refs/pull/N/merge second parent (PR head)"
else
  target="$(git rev-parse HEAD 2>/dev/null)"
  how="HEAD (not a PR-merge checkout)"
fi

if [ -n "$target" ] && authored="$(skip_sync_merges "$target")" && [ -n "$authored" ]; then
  if [ "$authored" != "$target" ]; then
    how="$how -> first non-merge ancestor (skipped sync merge)"
  fi
  target="$authored"
fi

if ! have_commit "$target"; then
  report "cannot read the commit under inspection ($how)." \
         "Resolved to '$target', which is not present in this clone." \
         "The guard refuses to answer rather than pass on a commit it never read."
  # Nothing further is knowable; fall through to the verdict.
  message=""
  author=""
else
  message="$(git log -1 --format=%B "$target" 2>/dev/null)"
  author="$(git log -1 --format='%an <%ae>' "$target" 2>/dev/null)"
  echo "  inspecting: $(git rev-parse --short "$target" 2>/dev/null) via $how"
  echo "  author:     $author"
  echo
fi

# ---------------------------------------------------------------------------
# Dependabot exemption — author-based, before any trailer check.
# The predicate lives in is_exempt_bot_author() (defined near the top) so that
# --self-test drives the REAL rule rather than a second copy of it.
# ---------------------------------------------------------------------------
if is_exempt_bot_commit "$author" "$target"; then
  if is_exempt_bot_author "$author"; then
    echo "builder-model-guard SKIPPED — dependabot-authored commit."
    echo "  No CC session writes these, so no trailer can ever exist on one."
  else
    echo "builder-model-guard SKIPPED — baseline-regen commit."
    echo "  Authored by github-actions[bot] AND confined to VRT baseline paths,"
    echo "  so there is no model to attribute. A bot commit touching anything"
    echo "  else is still checked — the exemption is what it TOUCHED, not who."
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Parse the reviewer pin from the workflow. NEVER hardcoded: a hardcoded copy
# drifts silently the moment the pin moves, and a guard comparing against a
# stale pin passes exactly the collision it exists to catch.
# ---------------------------------------------------------------------------
pin=""
if [ ! -f "$REVIEW_WORKFLOW" ]; then
  report "$REVIEW_WORKFLOW not found — cannot read the reviewer pin." \
         "Without the pin the collision check is unenforceable."
else
  pin="$(grep -oE -- '--model[[:space:]]+[A-Za-z0-9._-]+' "$REVIEW_WORKFLOW" \
          | head -n 1 | awk '{print $2}')"
  if [ -z "$pin" ]; then
    report "could not parse a '--model <id>' pin out of $REVIEW_WORKFLOW." \
           "The collision check is disabled until it parses again." \
           "If the pin moved to a different field, this guard must follow it."
  else
    echo "  reviewer pin: $pin (parsed from $REVIEW_WORKFLOW)"
    echo
  fi
fi

# ---------------------------------------------------------------------------
# The trailer.
# ---------------------------------------------------------------------------
trailer_line="$(printf '%s\n' "$message" | grep -nE "^${TRAILER_KEY}:[[:space:]]*" | head -n 1)"

# guard-ok anywhere (missing-trailer case — no line to anchor a window on).
suppressed_anywhere() {
  printf '%s\n' "$message" | grep -qE 'guard-ok:[[:space:]]*\S'
}

# guard-ok within +/-1 line of the trailer (collision case).
suppressed_near_trailer() {
  local line="$1" from to
  from=$(( line > 1 ? line - 1 : 1 ))
  to=$(( line + 1 ))
  printf '%s\n' "$message" | sed -n "${from},${to}p" | grep -qE 'guard-ok:[[:space:]]*\S'
}

if [ -z "$trailer_line" ]; then
  if ! suppressed_anywhere; then
    report "commit message carries no ${TRAILER_KEY}: trailer." \
           "Add this line to the commit message (last block, with the other trailers):" \
           "" \
           "    ${TRAILER_KEY}: <the model id this session ran as, e.g. claude-opus-5>" \
           "" \
           "Amend with: git commit --amend" \
           "Rationale + the full convention: .claude/rules/workflow.md 'Commit discipline'."
    # A non-exempt BOT author is a distinct situation with a distinct remedy,
    # and the wrong remedy is the tempting one. Say so at the point of failure.
    # Guidance, NOT a second violation: printed directly rather than through
    # report(), which would increment the problem count and make one problem
    # read as two.
    if printf '%s' "$author" | grep -qF '[bot]'; then
      echo "      ---"
      echo "      NOTE the author above is a bot, and it is not the exempt one."
      echo "      No session authored this commit, so no trailer could have been"
      echo "      written into it. The sanctioned unblock is an authored follow-up"
      echo "      commit on the branch — which you need anyway, because a bot push"
      echo "      fires no workflows (CLAUDE.md, MEH-1112/1113)."
      echo "      Do NOT widen the exemption to make this green: that shrinks the set"
      echo "      of commits this guard checks, the one direction rule 32 forbids."
      echo "      Whether the exemption should be identity-based at all is an open"
      echo "      decision, not a quick fix."
    fi
  fi
else
  lineno="${trailer_line%%:*}"
  value="$(printf '%s\n' "$trailer_line" | sed -E "s/^[0-9]+:${TRAILER_KEY}:[[:space:]]*//" \
            | sed -E 's/[[:space:]]+$//')"

  if [ -z "$value" ]; then
    report "${TRAILER_KEY}: trailer is present but empty (message line $lineno)." \
           "An empty declaration is not a declaration. Give the model id."
  else
    echo "  declared builder: $value"
    echo
    if [ -n "$pin" ] && [ "$value" = "$pin" ]; then
      if ! suppressed_near_trailer "$lineno"; then
        report "maker == checker: builder '$value' equals the reviewer pin '$pin'." \
               "The adversarial review on this PR has no evidentiary value — the" \
               "model reviewing the diff is the model that wrote it, which is the" \
               "exact condition MEH-1654 exists to prevent." \
               "Either build with a different model, or move the pin in" \
               "$REVIEW_WORKFLOW (Sapir — .github/ is CC-deny, MEH-671)."
      fi
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Verdict.
# ---------------------------------------------------------------------------
echo
if [ "$problems" -eq 0 ]; then
  echo "builder-model-guard OK — no problems."
  exit 0
fi

if [ "$enforcing" -eq 1 ]; then
  echo "builder-model-guard FAILED — $problems problem(s)."
  echo "Fix them, or annotate a justified exception with 'guard-ok: <reason>' in the commit message."
  exit 1
fi

echo "builder-model-guard WARNED — $problems problem(s), not failing before $ENFORCE_FROM."
echo "On $ENFORCE_FROM this same output becomes a merge-blocking failure. Fix it now, not then."
exit 0
