#!/usr/bin/env bash
#
# Module:   docs-ordering-guard.sh
# Purpose:  Warn when a pull request declares `Describes-PRs: #N, #M` and any of
#           those PRs is not yet merged into the base branch — i.e. the docs are
#           about to land ahead of the code they describe.
# Touches:  nothing — reads the git log and the PR body. In CI it may deepen the
#           base branch via `git fetch` (writes .git only, never the worktree).
# Does NOT: verify that the prose is TRUE. It checks one reference relationship
#           — "is #N on the base branch yet" — and nothing else. A CHANGELOG
#           entry naming the right PR number and describing it wrongly passes
#           this guard cleanly. It also does NOT parse `#NNNN` out of the diff:
#           that mechanism was measured at a 95.9% false-positive rate (47 of
#           49) in MEH-2103 Phase 0 and rejected.
# Related:  scripts/checks/run-all.sh (discovers + runs this; surfaces WARNING),
#           scripts/checks/changelog-branch-guard.sh (rule 31 — the FILE split;
#             this guard is the ORDER half of the same rule),
#           .claude/rules/workflow.md (rule 31 — the rule this enforces).
# History:  MEH-2103 (creation).
#
# WHY THIS EXISTS
#   On 16/08 five PRs from one batch were armed for auto-merge in parallel. Four
#   landed; #2974 did not (its branch had fallen behind staging). The docs PR
#   (#2975) is always green and touches no shared file, so it overtook the code
#   it documented: `82b4382` put "מוזג: … #2974" into HANDOFF.md and
#   docs/CHANGELOG.md while `frontend/components/admin/AdminLoadError.jsx` did
#   not exist on staging at all. Drift window 12:13:44Z → 13:20:41Z, 67 minutes.
#
#   HANDOFF.md is the file every new session reads to orient itself (L2 of the
#   memory architecture). A session that reads a false HANDOFF starts from a
#   wrong premise and builds on it — that contaminates the truth layer itself,
#   not just one PR.
#
#   Base rate is NOT one incident: MEH-2103 Phase 0 measured 2 of the last 30
#   merged docs-only PRs (6.7%), the second being #2912 → #2877 on 14/08, which
#   had gone unreported until then.
#
# WHY WARN-ONLY, AND NOT FROM THE FREQUENCY
#   1. The damage self-heals the moment the code PR lands — a temporarily wrong
#      statement, not a corrupted artifact.
#   2. A blocking gate here creates a deadlock only Sapir can release (rule 30
#      forbids CC clearing its own block), and the thing blocked is a backfill.
#   3. Both measured instances share ONE root — arming every PR of a batch in
#      parallel while one of them is always-green — which the non-tool
#      mitigation ("do not arm a docs PR before the PRs it describes have
#      merged") already covers.
#   That argument is about the SHAPE of the failure, so it holds at 9/30 too. It
#   is not an "it only happened once" argument.
#
# THE TWO NULLS THIS GUARD MUST NOT CONFLATE
#   "#2974 is not in the base log" has TWO causes: it is genuinely unmerged (the
#   finding), or the clone is too shallow to contain it (the guard is blind).
#   `repo-guards` checks out with a plain actions/checkout@v7 and NO fetch-depth
#   — depth 1 — so a naive implementation reports EVERY reference as unmerged
#   and its warning carries no information at all.
#
#   So the guard deepens the base branch itself, then reports three states:
#     MERGED        — found on the base branch
#     NOT MERGED    — absent, AND the history was complete enough to say so
#     UNVERIFIABLE  — absent, but the clone is still shallow. NOT a pass, and
#                     deliberately not phrased as one.
#   `--self-test` case 6 drives a commit that IS on the base branch but lies
#   beyond a shallow boundary the remote refuses to deepen, and requires
#   UNVERIFIABLE. A naive implementation says "NOT MERGED" there and goes red.
#
#   Because the guard deepens itself, it needs NO change to the workflow that
#   runs it — which is the whole point, that file being CC-deny (MEH-671).
#
# HOW A PR IS KNOWN TO HAVE LANDED
#   GitHub writes one of exactly two machine-generated subjects, and they are
#   mutually exclusive (workflow.md rule 21 leans on the same discriminator):
#     squash:       "<title> (#N)"
#     merge commit: "Merge pull request #N from <owner>/<branch>"
#   Both are matched. Matching only the squash form would report every
#   merge-commit landing as missing — `--self-test` case 5 locks that.
#
# USAGE
#   bash scripts/checks/docs-ordering-guard.sh
#   bash scripts/checks/docs-ordering-guard.sh --self-test
#
#   Overrides, used by the self-test and available for local runs:
#     DOCS_ORDER_PR_BODY   — the PR body text (else read from GITHUB_EVENT_PATH)
#     DOCS_ORDER_BASE      — base ref to check against (else GITHUB_BASE_REF,
#                            else origin/staging)
#
set -uo pipefail

SELF_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164) — see scripts/checks/README.md.
cd "$REPO_ROOT" || exit 1

TRAILER='Describes-PRs'

# ---------------------------------------------------------------------------
# pr_body — the PR description, from the override or the event payload.
#
# GITHUB_EVENT_PATH is present in EVERY step of a workflow run with no `env:`
# wiring at all, which is why this guard needs no workflow edit.
#
# Echoes the body, or returns 1 when it cannot be obtained. "Cannot obtain" is
# never collapsed into "empty" — an empty body and an unreadable one produce
# different messages, because only one of them could ever be a finding.
# ---------------------------------------------------------------------------
pr_body() {
  if [ -n "${DOCS_ORDER_PR_BODY+x}" ]; then
    printf '%s\n' "$DOCS_ORDER_PR_BODY"
    return 0
  fi

  local ev="${GITHUB_EVENT_PATH:-}"
  [ -n "$ev" ] && [ -r "$ev" ] || return 1

  if command -v jq >/dev/null 2>&1; then
    jq -r '(.pull_request.body // "")' "$ev" 2>/dev/null && return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    ev = json.load(fh)
print((ev.get("pull_request") or {}).get("body") or "")
' "$ev" 2>/dev/null && return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# declared_prs — PR numbers from the trailer, on stdin, deduped, in order.
#
# Accepts `Describes-PRs: #2974, #2975` and `Describes-PRs: 2974 2975`. ONLY the
# trailer line is read: a `#2974` sitting anywhere else in the body is ignored on
# purpose — parsing loose `#NNNN` is exactly mechanism (a), measured at 95.9%
# false positives (186 references, 2 real; 30 were not PR numbers at all,
# including a "#2" used as a table ordinal).
# ---------------------------------------------------------------------------
declared_prs() {
  sed -n "s/^[[:space:]]*${TRAILER}:[[:space:]]*//p" \
    | tr ',' ' ' \
    | tr -s '[:space:]' '\n' \
    | sed -n 's/^#\{0,1\}\([0-9]\{1,\}\)$/\1/p' \
    | awk '!seen[$0]++'
}

# ---------------------------------------------------------------------------
# resolve_base — echoes a rev to check against, or returns 1.
# ---------------------------------------------------------------------------
resolve_base() {
  local candidate
  for candidate in "${DOCS_ORDER_BASE:-}" \
                   "${GITHUB_BASE_REF:+origin/$GITHUB_BASE_REF}" \
                   origin/staging origin/main staging; do
    [ -n "$candidate" ] || continue
    if git rev-parse --verify --quiet "${candidate}^{commit}" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  # Shallow CI checkout: the base branch may not be in this clone at all yet.
  if [ -n "${GITHUB_BASE_REF:-}" ] &&
     git fetch --no-tags --quiet --depth=50 origin "$GITHUB_BASE_REF" 2>/dev/null &&
     git rev-parse --verify --quiet FETCH_HEAD^{commit} >/dev/null 2>&1; then
    git rev-parse FETCH_HEAD
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# deepen_base <ref> — try to make the history complete enough that ABSENCE
# means something. Best-effort by design: the caller re-reads is-shallow
# afterwards and downgrades its own verdict rather than trusting this worked.
# ---------------------------------------------------------------------------
deepen_base() {
  local ref="$1" fetch_ref="${GITHUB_BASE_REF:-}" depth
  [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = true ] || return 0

  if [ -z "$fetch_ref" ]; then
    case "$ref" in origin/*) fetch_ref="${ref#origin/}" ;; esac
  fi
  [ -n "$fetch_ref" ] || return 0

  git fetch --no-tags --quiet --unshallow origin "$fetch_ref" 2>/dev/null
  [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = true ] || return 0

  for depth in 250 1000 5000; do
    git fetch --no-tags --quiet --depth="$depth" origin "$fetch_ref" 2>/dev/null || return 0
    [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = true ] || return 0
  done
  return 0
}

# ---------------------------------------------------------------------------
# subjects_for <base> — every commit subject on <base>, memoised.
#
# ⚠️ THE CAPTURE IS LOAD-BEARING, NOT AN OPTIMISATION. The obvious form
#
#     git log "$base" --format='%s' | grep -qE '…'      # WRONG
#
# is broken under this file's `set -o pipefail`: `grep -q` exits the instant it
# matches, `git log` then dies of SIGPIPE (141), and pipefail propagates 141 as
# the pipeline's status — so a SUCCESSFUL match returns non-zero and the PR is
# reported as not merged.
#
# It is a size-dependent bug, which is why it survives fixtures: a fixture log
# of ten commits is fully written before grep exits, so every synthetic case
# passes. Against staging's ~2,400 commits it fails every time. That is exactly
# the MEH-1909 shape, and the real-corpus case (self-test, last) is what caught
# it — the synthetic cases above were all green while this was wrong.
# ---------------------------------------------------------------------------
_SUBJ_BASE=""
_SUBJ_CACHE=""
subjects_for() {
  if [ "$_SUBJ_BASE" != "$1" ]; then
    _SUBJ_CACHE="$(git log "$1" --format='%s' 2>/dev/null)"
    _SUBJ_BASE="$1"
  fi
  printf '%s\n' "$_SUBJ_CACHE"
}

# ---------------------------------------------------------------------------
# is_merged <base> <n> — is PR #n on <base>?
#
# Matches BOTH landed forms (see HOW A PR IS KNOWN TO HAVE LANDED above).
# `(#N)` is anchored to end-of-subject and `Merge pull request #N` to the start,
# so a bare "#2974" mid-sentence in some unrelated subject cannot produce a
# false MERGED — the worst failure available here, because it silently converts
# a real finding into a pass.
# ---------------------------------------------------------------------------
is_merged() {
  local base="$1" n="$2"
  grep -qE "\(#${n}\)\$|^Merge pull request #${n}([^0-9]|\$)" <<EOF
$(subjects_for "$base")
EOF
}

# ---------------------------------------------------------------------------
# is_docs_only — true when HEAD's diff against the base touches only docs.
# Used ONLY to choose which no-trailer message to print; it never gates a
# warning, so an imprecise answer here cannot manufacture a finding.
# ---------------------------------------------------------------------------
is_docs_only() {
  local base="$1" mb files f
  mb="$(git merge-base HEAD "$base" 2>/dev/null)" || return 1
  [ -n "$mb" ] || return 1
  files="$(git diff --name-only "$mb" HEAD 2>/dev/null)" || return 1
  [ -n "$files" ] || return 1
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in
      docs/*|.claude/*|.ai/*|HANDOFF.md) continue ;;
      */*) return 1 ;;
      *.md) continue ;;
      *) return 1 ;;
    esac
  done <<EOF
$files
EOF
  return 0
}

# ---------------------------------------------------------------------------
# check — the whole rule. Echoes its report; returns 0 clean, 1 when it warned.
# THE RETURN CODE IS NOT THE EXIT CODE: main() always exits 0 (warn-only). The
# distinction exists so the self-test can assert on the verdict.
# ---------------------------------------------------------------------------
check() {
  local base body refs shallow n
  local merged=() unmerged=() unverifiable=()

  if ! base="$(resolve_base)"; then
    echo "  WARNING: no base branch could be resolved — this check did NOT run."
    echo "  The absence of a finding below is therefore not evidence of anything."
    return 1
  fi

  if ! body="$(pr_body)"; then
    echo "  not a pull-request context (no readable GITHUB_EVENT_PATH, no override)."
    echo "  Nothing to check — this guard only has an opinion about a PR body."
    return 0
  fi

  refs="$(printf '%s\n' "$body" | declared_prs)"

  if [ -z "$refs" ]; then
    if is_docs_only "$base"; then
      echo "  docs-only PR with no ${TRAILER}: trailer — nothing declared, nothing checked."
      echo "  If this PR describes code that is not on $base yet, declare it:"
      echo "      ${TRAILER}: #2974, #2975"
      echo "  and this guard will hold the claim to account. Undeclared is unchecked;"
      echo "  that is the accepted cost of NOT parsing loose #NNNN (95.9% false positives)."
    else
      echo "  no ${TRAILER}: trailer in the PR body — nothing to check."
    fi
    return 0
  fi

  deepen_base "$base"
  shallow="$(git rev-parse --is-shallow-repository 2>/dev/null)"

  for n in $refs; do
    if is_merged "$base" "$n"; then
      merged+=("$n")
    elif [ "$shallow" = true ]; then
      unverifiable+=("$n")
    else
      unmerged+=("$n")
    fi
  done

  echo "  base: $base   declared: $(printf '#%s ' $refs)"
  [ ${#merged[@]} -gt 0 ] && echo "  MERGED:       $(printf '#%s ' "${merged[@]}")"

  if [ ${#unverifiable[@]} -gt 0 ]; then
    echo
    echo "  WARNING — UNVERIFIABLE: $(printf '#%s ' "${unverifiable[@]}")"
    echo "  Not found on $base, but the clone is STILL SHALLOW after deepening,"
    echo "  so absence proves nothing and this guard did not run for them."
    echo "  Do not read this as 'they are merged'. Do not read it as 'they are not'."
  fi

  if [ ${#unmerged[@]} -gt 0 ]; then
    echo
    echo "  WARNING — declared as described, but NOT on $base:"
    echo
    for n in "${unmerged[@]}"; do
      echo "    #$n  not merged"
    done
    echo
    echo "  This PR's prose becomes false on $base the moment it lands, and"
    echo "  HANDOFF.md is what the next session reads to orient itself (MEH-2103)."
    echo
    echo "  FIX: land those PRs first. Do NOT rewrite the entry to drop the claim —"
    echo "  it becomes true when they land, and editing history to match a temporary"
    echo "  state is worse than the drift it papers over."
    echo
    echo "  Warn-only: the damage self-heals on merge, and a blocking gate here"
    echo "  would need Sapir to release it (rule 30)."
  fi

  if [ ${#unmerged[@]} -gt 0 ] || [ ${#unverifiable[@]} -gt 0 ]; then
    return 1
  fi
  echo "  all declared PRs are on $base."
  return 0
}

# ---------------------------------------------------------------------------
# --self-test
#
# Case 1 reconstructs the 16/08 incident, which CANNOT be reproduced against the
# live repo: #2974 landed at 13:20:41Z, so the literal Phase 0 criterion
# ("#2974 is not an ancestor of origin/staging") PASSES today, and a literal
# re-run concludes the incident never happened. The fixture freezes the state
# the incident actually occurred in.
#
# Case 6 is the one a naive implementation fails: a commit that IS on the base
# branch but lies beyond a shallow boundary the remote refuses to deepen.
# Reporting "NOT MERGED" there is the false-red this guard exists to avoid, and
# from the log it is indistinguishable from a true finding.
#
# Case 8 is anchored to THIS repository's real staging log rather than to a
# fixture. Every case above it proves the matcher works on subjects the fixture
# invented; only case 8 proves it works on the subjects this repo actually
# writes (MEH-1909: an ast probe passed 4 synthetic cases and returned None for
# all 14 real files, because every fixture used a shape the repo never uses).
# ---------------------------------------------------------------------------
self_test() {
  local status=0 cases=0 out

  run_case() {
    local name="$1" expect="$2" body="$3" base="$4" rc got
    cases=$(( cases + 1 ))
    echo "── case $cases: $name (expect $expect)"
    out="$(DOCS_ORDER_PR_BODY="$body" DOCS_ORDER_BASE="$base" check 2>&1)"
    rc=$?
    printf '%s\n' "$out" | sed 's/^/     /'
    got=CLEAN; [ "$rc" -ne 0 ] && got=WARN
    if [ "$got" = "$expect" ]; then
      echo "   [ok] got $got"
    else
      echo "   [XX] got $got, expected $expect"
      status=1
    fi
    echo
  }

  echo "docs-ordering-guard --self-test"
  echo

  # -- fixture: staging as it stood inside the 16/08 drift window -------------
  local tmp here
  tmp="$(mktemp -d)"
  (
    cd "$tmp" || exit 1
    git init --quiet -b staging .
    git config user.email guard@test.local
    git config user.name  guard-self-test
    echo seed > seed.txt && git add -A && git commit --quiet -m seed
    git commit --quiet --allow-empty -m "fix(address): z-[1010] (#2970)"
    git commit --quiet --allow-empty -m "fix(ui): 14 dialogs (#2972)"
    git commit --quiet --allow-empty -m "docs(z-index): ledger (#2973)"
    git commit --quiet --allow-empty -m "docs: session log (#2975)"
    git checkout --quiet -b with-2974 staging
    git commit --quiet --allow-empty -m "fix(admin): 8 fail-open sites (#2974)"
    git checkout --quiet -b merge-commit-form staging
    git commit --quiet --allow-empty \
      -m "Merge pull request #2974 from levismadar80-ship-it/feature/meh-2096-admin-fail-open"
    git checkout --quiet staging
  ) >/dev/null 2>&1 || { echo "self-test: could not build fixture"; rm -rf "$tmp"; return 1; }

  here="$PWD"
  cd "$tmp" || { rm -rf "$tmp"; return 1; }

  local incident_body="docs: session log for the Lane 1 batch

${TRAILER}: #2970, #2972, #2973, #2974"

  run_case "16/08 reconstruction — #2974 absent from staging" WARN \
    "$incident_body" staging

  # A guard that warned about ALL FOUR references would also read as "WARN"
  # above. This case is what makes case 1 evidence rather than a coincidence.
  cases=$(( cases + 1 ))
  echo "── case $cases: the reconstruction names exactly #2974, not all four"
  out="$(DOCS_ORDER_PR_BODY="$incident_body" DOCS_ORDER_BASE=staging check 2>&1)"
  if printf '%s' "$out" | grep -q '#2974  not merged' &&
     ! printf '%s' "$out" | grep -qE '#(2970|2972|2973)  not merged'; then
    echo "   [ok] #2974 named; #2970/#2972/#2973 correctly reported MERGED"
  else
    echo "   [XX] the warning does not discriminate between the four references"
    status=1
  fi
  echo

  run_case "same PR body, after #2974 lands (squash form)" CLEAN \
    "$incident_body" with-2974

  run_case "a merge-commit landing is recognised too" CLEAN \
    "$incident_body" merge-commit-form

  run_case "no trailer in the body" CLEAN \
    "docs: a session log that declares nothing" staging

  cd "$here" || { rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"

  # -- case: shallow clone must say UNVERIFIABLE, never "not merged" ----------
  cases=$(( cases + 1 ))
  echo "── case $cases: on base but beyond a shallow boundary (expect UNVERIFIABLE)"
  local stmp origin clone i
  stmp="$(mktemp -d)"; origin="$stmp/origin"; clone="$stmp/clone"
  (
    mkdir -p "$origin" && cd "$origin" || exit 1
    git init --quiet -b staging .
    git config user.email guard@test.local
    git config user.name  guard-self-test
    # Refuse every deepening route, so the guard genuinely cannot escape
    # being blind — otherwise this case would silently test nothing.
    git config uploadpack.allowAnySHA1InWant false
    git config uploadpack.allowfilter false
    echo seed > seed.txt && git add -A && git commit --quiet -m seed
    git commit --quiet --allow-empty -m "fix(admin): 8 fail-open sites (#2974)"
    for i in 1 2 3 4 5 6 7 8; do
      git commit --quiet --allow-empty -m "later work (#30$i)"
    done
  ) >/dev/null 2>&1 || { echo "   [XX] could not build shallow fixture"; rm -rf "$stmp"; return 1; }

  (
    mkdir -p "$clone" && cd "$clone" || exit 1
    git init --quiet -b staging .
    git config user.email guard@test.local
    git config user.name  guard-self-test
    git remote add origin "$origin"
    git fetch --no-tags --quiet --depth=1 origin staging
    mkdir -p scripts/checks
  ) >/dev/null 2>&1 || { echo "   [XX] could not build shallow clone"; rm -rf "$stmp"; return 1; }

  # The REAL file, copied in — not this shell's already-loaded functions. The
  # script cd's to its own repo root, so running $SELF_PATH from the clone
  # would silently measure the live repo instead of the fixture.
  cp "$SELF_PATH" "$clone/scripts/checks/$(basename "$SELF_PATH")"
  out="$(cd "$clone" && DOCS_ORDER_PR_BODY="${TRAILER}: #2974" \
        DOCS_ORDER_BASE=FETCH_HEAD GITHUB_BASE_REF= \
        bash "scripts/checks/$(basename "$SELF_PATH")" --check-only 2>&1)"
  printf '%s\n' "$out" | sed 's/^/     /'
  if printf '%s' "$out" | grep -q 'UNVERIFIABLE' &&
     ! printf '%s' "$out" | grep -q 'not merged'; then
    echo "   [ok] reported UNVERIFIABLE — a naive implementation says 'not merged' here"
  else
    echo "   [XX] a shallow clone was reported as a finding — the exact false-red"
    echo "        this guard exists to avoid (repo-guards checks out at depth 1)"
    status=1
  fi
  echo
  rm -rf "$stmp"

  # -- case: the REAL corpus, not a fixture ----------------------------------
  cases=$(( cases + 1 ))
  echo "── case $cases: matcher against THIS repo's real staging log (not a fixture)"
  local real_base="" candidate probe
  for candidate in origin/staging staging origin/main; do
    if git rev-parse --verify --quiet "${candidate}^{commit}" >/dev/null 2>&1; then
      real_base="$candidate"; break
    fi
  done
  if [ -z "$real_base" ]; then
    echo "   [XX] no staging/main ref in this clone — the real-corpus case could not"
    echo "        run, so the synthetic cases above stand unanchored (MEH-1909)."
    status=1
  else
    # Read a genuinely-landed PR number out of the log rather than hardcoding
    # one, so this case cannot rot into a stale citation.
    probe="$(git log "$real_base" --format='%s' -400 2>/dev/null \
             | sed -n 's/.*(#\([0-9]\{1,\}\))$/\1/p' | head -n 1)"
    if [ -n "$probe" ] && is_merged "$real_base" "$probe" &&
       ! is_merged "$real_base" 99999999; then
      echo "   [ok] #$probe (a real landing on $real_base) -> MERGED; #99999999 -> not found"
    else
      echo "   [XX] the matcher does not recognise this repo's own commit subjects."
      echo "        Synthetic fixtures passing while the real corpus fails is MEH-1909."
      status=1
    fi
  fi
  echo

  if [ "$status" -eq 0 ]; then
    echo "self-test OK — all $cases cases behaved as specified."
  else
    echo "self-test FAILED."
  fi
  return "$status"
}

main() {
  echo "docs-ordering-guard (MEH-2103) — enforces the ORDER half of rule 31"
  echo "mode: WARN-ONLY"
  echo

  check || true

  echo
  echo "docs-ordering-guard OK (warn-only — never fails the run)."
  exit 0
}

case "${1:-}" in
  --self-test)  self_test ;;
  # Internal: run `check` alone. Used by the shallow-clone case, which must
  # execute the real file from inside another repository.
  --check-only) check; exit 0 ;;
  "")           main ;;
  *)            echo "usage: $(basename "$0") [--self-test]" >&2; exit 2 ;;
esac
