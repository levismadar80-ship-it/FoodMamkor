#!/usr/bin/env bash
#
# Module:   changelog-branch-guard.sh
# Purpose:  Fail a CODE pull request that also carries docs/CHANGELOG.md or
#           HANDOFF.md, so the MEH-1372 rule ("append-only logs go in their own
#           docs-only PR") is a gate instead of a suggestion.
# Touches:  nothing — reads the git diff and prints to stdout/stderr. In CI it
#           may run one `git fetch --depth=1` of the base branch (see BASE
#           RESOLUTION); that writes only to .git, never the worktree.
# Does NOT: police CHANGELOG *content*, formatting, or ordering, and does NOT
#           stop a docs-only PR from touching either file — that backfill path
#           is the whole point of MEH-1372 and must stay open. It also does not
#           look at commit messages: the unit is the PR's net diff.
# Related:  scripts/checks/run-all.sh (discovers + runs this),
#           scripts/checks/README.md (the authoring contract),
#           .claude/rules/workflow.md (rule 31 — the rule this enforces).
# History:  MEH-1602 (creation — mechanises MEH-1372); MEH-1602 follow-up
#           (root-level *.md counts as docs, + its regression case);
#           MEH-1634 (base resolution — stop diffing against a moving tip).
#
# WHY THIS EXISTS
#   MEH-1372 landed as prose, which makes it advice an agent can skip. The same
#   evening it was written, PR #2207 carried a CHANGELOG entry, absorbed 7
#   staging merges, and ended up with TWO contradictory MEH-1569 entries —
#   caught by a human reading the log, by no gate at all. Append-only logs
#   conflict on every concurrent merge; keeping them out of code branches is
#   what removes the conflict, and only a red check enforces it.
#
# THE RULE (one rule; --self-test drives six classification cases through it,
#           plus two end-to-end base-resolution cases — see mid_cycle_case)
#   Let DOCS = docs/**, .claude/**, .ai/**, HANDOFF.md, and root-level *.md
#   FAIL  when the diff touches at least one file OUTSIDE DOCS *and* touches
#         docs/CHANGELOG.md or HANDOFF.md.
#   PASS  when the diff is docs-only (even if it is entirely CHANGELOG+HANDOFF).
#   PASS  when the diff is code-only and touches neither log.
#   PASS  when the diff is root-level Markdown (CLAUDE.md) + a log — the case
#         this guard got WRONG on PR #2228 and now locks with a regression test.
#   Full taxonomy, including the cases deliberately left undecided:
#   scripts/checks/README.md -> "File taxonomy".
#
# BASE RESOLUTION (why this is more than one line)
#   The `repo-guards` job checks out with a plain `actions/checkout@v7` — depth
#   1 — and passes no base-SHA env, so a three-dot diff cannot work there: a
#   shallow clone has no merge base. The neighbouring `qa-artifacts-size` job
#   sets `fetch-depth: 0` precisely because it needs one, and
#   rtl-ok: the workflow filename below is a path, not a pl-/pr- padding class
#   .github/workflows/pr-checks.yml is CC-deny (MEH-671), so this guard cannot
#   ask for the same treatment.
#
#   So it resolves a base itself, in this order, announcing which it used:
#     1. $CHANGELOG_GUARD_BASE            — explicit override            [frozen]
#     2. first parent of refs/pull/N/merge — the PR's own merge base,
#                                            fetched on demand           [frozen]
#     3. $GITHUB_BASE_REF                 — tip of the base branch NOW   [moving]
#     4. origin/<default>                 — local dev, full history      [moving]
#
#   MEH-1634 — WHY (2) EXISTS AND WHY THE KIND TAG IS LOAD-BEARING
#   A `pull_request` checkout puts HEAD at refs/pull/N/merge — head already
#   merged into base — so `git diff BASE HEAD` is exactly the PR's net change,
#   but ONLY when BASE is the very commit that merge ref was built on. GitHub
#   recomputes that merge ref on push/base-change events, not continuously, so
#   by the time this guard runs the base branch has usually moved on. Diffing
#   the merge ref against the *current* tip reports everything that landed on
#   staging in between — in REVERSE, as though this branch deleted it.
#
#   That is not theoretical. Run 30248101409 (27/07, PR on
#   feature/meh-1546-staging-verification) went red with "47 code files"
#   including backend/app/routers/alerts.py, while the very same run's
#   paths-filter reported FRONTEND_TOUCHED=false BACKEND_TOUCHED=false — a
#   docs-only PR. All 47 were staging's churn; one of them was a docs backfill
#   carrying docs/CHANGELOG.md, which is what tipped the classifier into a
#   VIOLATION. ~3 CI cycles burned on MEH-1623/1624 the same morning.
#
#   The fix reads the merge ref's FIRST PARENT — the frozen base the ref was
#   actually built against — and fetches just that commit. Path (2) is gated on
#   GITHUB_REF matching refs/pull/*/merge on purpose: on a feature branch that
#   ran `git merge origin/staging` (rule 25) HEAD is also a merge commit, but
#   there parent 1 is the branch's own previous tip, not a base.
#
#   A base is tagged `frozen` (two-dot is exact) or `moving` (two-dot is NOT).
#   With a moving base the guard requires a real merge base and diffs three-dot;
#   if it cannot compute one it EXITS NON-ZERO rather than emit the unsound
#   two-dot answer that caused MEH-1634. Same discipline as the no-base case
#   below: never report a verdict for a comparison it could not actually make.
#
#   If no base can be resolved the guard EXITS NON-ZERO. It must never report
#   OK for a check it did not actually perform — that is the decorative-guard
#   failure mode MEH-420 closed for skill hashes.
#
# USAGE
#   bash scripts/checks/changelog-branch-guard.sh              # guard the diff
#   bash scripts/checks/changelog-branch-guard.sh --self-test  # prove all 8 cases
#
set -uo pipefail

# Absolute path to THIS file, resolved before the cd below — the self-test
# copies it into a throwaway clone, and a relative BASH_SOURCE would not
# survive that cd (invoking the guard from any other directory).
SELF_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164) — see scripts/checks/README.md.
cd "$REPO_ROOT" || exit 1

LOGS=("docs/CHANGELOG.md" "HANDOFF.md")

# A path is "docs" if it is under docs/, under .claude/, under .ai/, or is a
# root-level Markdown document.
#
# The root-level `*.md` arm is MEH-1602 follow-up, found by this guard
# false-positiving on its own first real customer: a CLAUDE.md-only correction
# PR was classified as a CODE change (CLAUDE.md is not under docs/), which
# would have blocked it from carrying the CHANGELOG entry that documents it.
# Root docs — CLAUDE.md, AGENTS.md, README.md — are documentation by any
# reading; only the top level is matched, so a nested `frontend/**/*.md` still
# counts as part of a code change.
#
# The `.ai/**` arm is MEH-1607: `.ai/diagrams/` is session-start documentation
# whose own header requires updating it in the same PR as a router change
# (workflow rule 12). Classifying it as code made rules 12 and 31 contradict
# each other and forced every router PR to split in two (PR #2225 + #2226).
is_docs_path() {
  case "$1" in
    docs/*|.claude/*|.ai/*|HANDOFF.md) return 0 ;;
    */*) return 1 ;;          # anything nested that isn't docs/, .claude/, .ai/
    *.md) return 0 ;;         # root-level Markdown: CLAUDE.md, AGENTS.md, …
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# classify — reads the changed-file list on stdin.
#
# The rule itself, isolated from how the diff was obtained so --self-test can
# exercise it directly. Returns 1 on violation.
# ---------------------------------------------------------------------------
classify() {
  local files=() f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    files+=("$f")
  done

  if [ ${#files[@]} -eq 0 ]; then
    echo "  empty diff — nothing to check."
    return 0
  fi

  local code_files=() offending=() log
  for f in "${files[@]}"; do
    if is_docs_path "$f"; then
      for log in "${LOGS[@]}"; do
        [ "$f" = "$log" ] && offending+=("$f")
      done
    else
      code_files+=("$f")
    fi
  done

  if [ ${#code_files[@]} -eq 0 ]; then
    echo "  docs-only diff (${#files[@]} file(s)) — the MEH-1372 backfill path. OK."
    return 0
  fi

  if [ ${#offending[@]} -eq 0 ]; then
    echo "  code diff (${#code_files[@]} file(s)), no append-only logs touched. OK."
    return 0
  fi

  echo "  VIOLATION — this PR changes code AND an append-only log."
  echo
  for f in "${offending[@]}"; do
    echo "    $f:1  must not be in a code branch (MEH-1372)"
  done
  echo
  echo "  Code files that make this a code PR (showing up to 5 of ${#code_files[@]}):"
  local i=0
  for f in "${code_files[@]}"; do
    echo "    $f"
    i=$(( i + 1 ))
    [ "$i" -ge 5 ] && break
  done
  echo
  echo "  WHY: docs/CHANGELOG.md and HANDOFF.md are append-only. Every concurrent"
  echo "  merge to staging conflicts on them, and resolving those conflicts across"
  echo "  cycles is what produced the duplicated, contradictory MEH-1569 entry on"
  echo "  PR #2207. Keeping the logs out of code branches removes the conflict."
  echo
  echo "  FIX: drop them from this branch, then backfill in a docs-only PR —"
  echo "    git checkout origin/staging -- ${LOGS[*]}"
  echo "  and re-add the entries in a separate PR touching only docs/ + HANDOFF.md."
  return 1
}

# ---------------------------------------------------------------------------
# have_commit <sha> — is this commit object actually present in the clone?
# `git rev-parse` alone is not enough: in a shallow clone it happily resolves
# a SHA whose object was never fetched.
# ---------------------------------------------------------------------------
have_commit() {
  git cat-file -e "${1}^{commit}" 2>/dev/null
}

# ---------------------------------------------------------------------------
# fetch_commit <sha> — pull one commit into a shallow clone. Two routes,
# because neither works everywhere:
#   (a) fetch the SHA directly — GitHub allows this (actions/checkout depends
#       on it) but a plain `git daemon` / bare remote does not by default.
#   (b) deepen the base branch until the SHA lands. The frozen base is an
#       ancestor of the base branch, so a large enough --depth reaches it.
# ---------------------------------------------------------------------------
fetch_commit() {
  local sha="$1" depth
  if git fetch --no-tags --quiet --depth=1 origin "$sha" 2>/dev/null && have_commit "$sha"; then
    return 0
  fi
  [ -n "${GITHUB_BASE_REF:-}" ] || return 1
  for depth in 50 250 1000; do
    git fetch --no-tags --quiet --depth="$depth" origin "$GITHUB_BASE_REF" 2>/dev/null || return 1
    have_commit "$sha" && return 0
  done
  return 1
}

# ---------------------------------------------------------------------------
# merge_ref_base — first parent of refs/pull/N/merge, i.e. the exact commit
# this PR's merge ref was built on. Echoes the SHA or returns 1.
#
# Gated on GITHUB_REF: a feature branch synced with `git merge origin/staging`
# (rule 25) is also a merge commit, but there parent 1 is the branch's own
# previous tip and using it would under-report the diff.
# ---------------------------------------------------------------------------
merge_ref_base() {
  case "${GITHUB_REF:-}" in
    refs/pull/*/merge) ;;
    *) return 1 ;;
  esac

  local parents first
  # Parent lines live in the commit header, above the first blank line. The
  # raw object survives shallow grafting; `git rev-parse HEAD^` does not.
  parents="$(git cat-file commit HEAD 2>/dev/null | sed -n '/^$/q; s/^parent //p')"
  [ "$(printf '%s\n' "$parents" | grep -c .)" -ge 2 ] || return 1
  first="$(printf '%s\n' "$parents" | head -n 1)"
  [ -n "$first" ] || return 1

  have_commit "$first" || fetch_commit "$first" || return 1
  printf '%s\n' "$first"
}

# ---------------------------------------------------------------------------
# resolve_base — echoes "<rev>\t<how>\t<frozen|moving>" or returns 1.
# See BASE RESOLUTION above for the ordering and what the kind tag means.
# ---------------------------------------------------------------------------
resolve_base() {
  if [ -n "${CHANGELOG_GUARD_BASE:-}" ]; then
    if git rev-parse --verify --quiet "${CHANGELOG_GUARD_BASE}^{commit}" >/dev/null; then
      printf '%s\t%s\t%s\n' "$CHANGELOG_GUARD_BASE" "CHANGELOG_GUARD_BASE override" frozen
      return 0
    fi
    echo "  base override CHANGELOG_GUARD_BASE=$CHANGELOG_GUARD_BASE is not a commit." >&2
    return 1
  fi

  # MEH-1634: the PR's own frozen merge base, before any moving-tip fallback.
  local frozen
  if frozen="$(merge_ref_base)" && [ -n "$frozen" ]; then
    printf '%s\t%s\t%s\n' "$frozen" "refs/pull/N/merge first parent" frozen
    return 0
  fi

  if [ -n "${GITHUB_BASE_REF:-}" ]; then
    if git rev-parse --verify --quiet "origin/${GITHUB_BASE_REF}^{commit}" >/dev/null; then
      printf '%s\t%s\t%s\n' "origin/${GITHUB_BASE_REF}" "GITHUB_BASE_REF (already fetched)" moving
      return 0
    fi
    # Shallow CI checkout: the base branch is not in this clone yet.
    if git fetch --no-tags --quiet --depth=1 origin "$GITHUB_BASE_REF" 2>/dev/null &&
       git rev-parse --verify --quiet FETCH_HEAD^{commit} >/dev/null; then
      printf '%s\t%s\t%s\n' "$(git rev-parse FETCH_HEAD)" "GITHUB_BASE_REF (fetched --depth=1)" moving
      return 0
    fi
    echo "  could not fetch base ref $GITHUB_BASE_REF from origin." >&2
    return 1
  fi

  local head_branch candidate
  head_branch="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"
  for candidate in "$head_branch" "origin/staging" "origin/main"; do
    [ -n "$candidate" ] || continue
    if git rev-parse --verify --quiet "${candidate}^{commit}" >/dev/null; then
      printf '%s\t%s\t%s\n' "$candidate" "local fallback" moving
      return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# changed_files <base> <kind> — the PR's net diff. Three-dot whenever a merge
# base is computable; two-dot ONLY against a frozen base, where it is exact.
# Returns 1 rather than guess. See BASE RESOLUTION (MEH-1634).
# ---------------------------------------------------------------------------
changed_files() {
  local base="$1" kind="$2" mb
  mb="$(git merge-base HEAD "$base" 2>/dev/null)"
  if [ -n "$mb" ]; then
    echo "  diff: merge-base ${mb:0:8}..HEAD (three-dot)" >&2
    git diff --name-only "$mb" HEAD
    return 0
  fi
  if [ "$kind" = frozen ]; then
    echo "  diff: two-dot ${base:0:8}..HEAD (frozen base — exact for a merge ref)" >&2
    git diff --name-only "$base" HEAD
    return 0
  fi
  echo "  no merge base with $base, and that base is a MOVING ref." >&2
  echo "  Two-dot here would report staging's own churn as this branch's" >&2
  echo "  changes — the MEH-1634 false positive. Refusing to guess." >&2
  return 1
}

# ---------------------------------------------------------------------------
# --self-test — build a throwaway repo and drive the classification cases
# through the real diff path, then hand off to mid_cycle_case for the two that
# exercise base resolution on a shallow pull-request checkout (MEH-1634).
# ---------------------------------------------------------------------------
self_test() {
  local tmp status=0 base_sha cases=0
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  (
    cd "$tmp" || exit 1
    git init --quiet -b staging .
    git config user.email guard@test.local
    git config user.name  guard-self-test
    mkdir -p docs frontend/components .ai/diagrams backend/app
    echo "# changelog"          > docs/CHANGELOG.md
    echo "# handoff"            > HANDOFF.md
    echo "# claude"             > CLAUDE.md
    echo "export const a = 1;"  > frontend/components/Thing.jsx
    echo "# api routes"         > .ai/diagrams/api-routes.md
    echo "x = 1"                > backend/app/thing.py
    git add -A && git commit --quiet -m base
  ) || { echo "self-test: could not build fixture repo"; return 1; }

  base_sha="$(git -C "$tmp" rev-parse HEAD)"

  run_case() {
    local name="$1" expect="$2" mutate="$3" files rc got
    git -C "$tmp" checkout --quiet -B case "$base_sha"
    ( cd "$tmp" && eval "$mutate" )
    git -C "$tmp" add -A
    git -C "$tmp" commit --quiet -m "$name"

    files="$(git -C "$tmp" diff --name-only "$base_sha" HEAD)"
    echo "── case: $name (expect $expect)"
    printf '%s\n' "$files" | sed 's/^/     changed: /'
    printf '%s\n' "$files" | classify
    rc=$?
    cases=$(( cases + 1 ))
    got=PASS; [ "$rc" -ne 0 ] && got=FAIL
    if [ "$got" = "$expect" ]; then
      echo "   [ok] got $got"
    else
      echo "   [XX] got $got, expected $expect"
      status=1
    fi
    echo
  }

  echo "changelog-branch-guard --self-test"
  echo

  run_case "code + CHANGELOG" FAIL \
    "echo 'export const a = 2;' > frontend/components/Thing.jsx; echo '- entry' >> docs/CHANGELOG.md"

  run_case "docs-only (CHANGELOG + HANDOFF)" PASS \
    "echo '- entry' >> docs/CHANGELOG.md; echo '- note' >> HANDOFF.md"

  run_case "code-only" PASS \
    "echo 'export const a = 3;' > frontend/components/Thing.jsx"

  # Regression lock for the defect this guard found in ITSELF on PR #2228:
  # CLAUDE.md is not under docs/ or .claude/, so the first version classified
  # the project's primary documentation file as CODE and would have red-lined
  # every CLAUDE.md-only docs PR — including the one correcting the very rule
  # this guard enforces. Root-level Markdown is documentation; if that arm of
  # is_docs_path() is ever removed, this case goes red instead of the change
  # slipping through silently.
  run_case "root-level *.md + CHANGELOG" PASS \
    "echo '- rule change' >> CLAUDE.md; echo '- entry' >> docs/CHANGELOG.md"

  # MEH-1607 — .ai/** is documentation (session-start diagrams). Rule 12
  # requires .ai/diagrams/api-routes.md to ride in the same PR as a router
  # change AND its CHANGELOG entry; classifying .ai/** as code forced every
  # such PR to split (PR #2225 + #2226). This case locks the docs arm...
  run_case ".ai/diagrams + CHANGELOG" PASS \
    "echo '- route' >> .ai/diagrams/api-routes.md; echo '- entry' >> docs/CHANGELOG.md"

  # ...and this one proves the fix did not hollow the guard out: real code
  # (*.py) + CHANGELOG must still be a violation. A "fix" that greens the
  # case above by weakening classification would go red here.
  run_case "backend *.py + CHANGELOG" FAIL \
    "echo 'x = 2' > backend/app/thing.py; echo '- entry' >> docs/CHANGELOG.md"

  # MEH-1634 — the two cases above this line all drive `classify` directly, so
  # none of them can see a base-resolution bug. These two drive the REAL script
  # end-to-end over a shallow pull-request checkout.
  mid_cycle_case true  "direct SHA fetch (GitHub-shaped remote)" || status=1
  mid_cycle_case false "deepened base branch (SHA fetch refused)" || status=1
  cases=$(( cases + 2 ))

  if [ "$status" -eq 0 ]; then
    echo "self-test OK — all $cases cases behaved as specified."
  else
    echo "self-test FAILED."
  fi
  return "$status"
}

# ---------------------------------------------------------------------------
# mid_cycle_case <allow_sha_fetch> <label> — MEH-1634 regression lock.
#
# Reconstructs run 30248101409 exactly: a docs-only PR whose refs/pull/N/merge
# was built on staging@T0, with a CODE merge (T1) and a docs backfill carrying
# docs/CHANGELOG.md + HANDOFF.md (T2) landing on staging since. Guard runs on a
# depth-1 checkout of the merge ref, as the repo-guards job does.
#
#   before MEH-1634: base = staging tip (T2), no merge base → two-dot T2..M,
#                    which reports T1's code file AND T2's logs in reverse →
#                    "VIOLATION", exit 1. A green CI cycle burned for nothing.
#   after:           base = M's first parent (T0) → two-dot T0..M → the one
#                    file this PR actually added → "docs-only diff", exit 0.
#
# The two invocations differ only in whether the remote honours a by-SHA fetch,
# so both routes in fetch_commit() are exercised rather than one being decorative.
# ---------------------------------------------------------------------------
mid_cycle_case() {
  local allow_sha="$1" label="$2"
  local tmp origin clone out rc t0

  tmp="$(mktemp -d)"
  origin="$tmp/origin"
  clone="$tmp/clone"

  echo "── case: MEH-1634 mid-cycle docs PR — $label (expect PASS)"

  (
    mkdir -p "$origin" && cd "$origin" || exit 1
    git init --quiet -b staging .
    git config user.email guard@test.local
    git config user.name  guard-self-test
    git config uploadpack.allowAnySHA1InWant "$allow_sha"
    mkdir -p docs/qa backend/app
    echo "# changelog"  > docs/CHANGELOG.md
    echo "# handoff"    > HANDOFF.md
    echo "x = 1"        > backend/app/thing.py
    git add -A && git commit --quiet -m "T0 base"

    # The PR: docs-only, branched at T0.
    git checkout --quiet -b feature
    echo "- 32/32 verified" > docs/qa/evidence.md
    git add -A && git commit --quiet -m "docs(qa): staging verification evidence"

    # GitHub builds refs/pull/1/merge against staging AS IT IS NOW (T0).
    git checkout --quiet -b prmerge staging
    git merge --quiet --no-ff feature -m "Merge feature into staging"
    git update-ref refs/pull/1/merge HEAD

    # ...and only afterwards does staging move: a code PR, then a docs backfill.
    git checkout --quiet staging
    echo "x = 2" > backend/app/thing.py
    git add -A && git commit --quiet -m "T1 someone else's code PR"
    echo "- another entry" >> docs/CHANGELOG.md
    echo "- another note"  >> HANDOFF.md
    git add -A && git commit --quiet -m "T2 docs backfill (the mid-cycle lander)"
  ) || { echo "   [XX] could not build fixture"; rm -rf "$tmp"; return 1; }

  t0="$(git -C "$origin" rev-parse refs/pull/1/merge^1)"
  echo "     merge ref built on T0=${t0:0:8}; staging tip is now $(git -C "$origin" rev-parse --short staging)"

  (
    mkdir -p "$clone" && cd "$clone" || exit 1
    git init --quiet -b staging .
    git config user.email guard@test.local
    git config user.name  guard-self-test
    git remote add origin "$origin"
    # Exactly what actions/checkout@v7 does on a pull_request with fetch-depth 1.
    git fetch --no-tags --quiet --depth=1 origin refs/pull/1/merge
    git checkout --quiet --detach FETCH_HEAD
    mkdir -p scripts/checks
  ) || { echo "   [XX] could not build shallow clone"; rm -rf "$tmp"; return 1; }

  # The real implementation, byte-for-byte — not a re-statement of it.
  local self="scripts/checks/$(basename "$SELF_PATH")"
  cp "$SELF_PATH" "$clone/$self"

  out="$(cd "$clone" && CHANGELOG_GUARD_BASE= GITHUB_BASE_REF=staging \
    GITHUB_REF=refs/pull/1/merge \
    bash "$self" 2>&1)"
  rc=$?

  printf '%s\n' "$out" | sed 's/^/     /'
  rm -rf "$tmp"

  if [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q "docs-only diff"; then
    echo "   [ok] got PASS"
    echo
    return 0
  fi
  echo "   [XX] got exit $rc — expected a clean docs-only PASS"
  echo
  return 1
}

# ---------------------------------------------------------------------------
main() {
  echo "changelog-branch-guard (MEH-1602) — enforces MEH-1372"
  echo

  local resolved base how kind rest files
  if ! resolved="$(resolve_base)"; then
    echo "changelog-branch-guard FAILED — could not determine a base revision."
    echo "  Refusing to report OK for a check that did not run (MEH-420 precedent)."
    echo "  Set CHANGELOG_GUARD_BASE=<rev> to point it at one explicitly."
    exit 1
  fi
  base="${resolved%%$'\t'*}"
  rest="${resolved#*$'\t'}"
  how="${rest%%$'\t'*}"
  kind="${rest##*$'\t'}"
  echo "  base: $base  [$how, $kind]"

  if ! files="$(changed_files "$base" "$kind")"; then
    echo "changelog-branch-guard FAILED — could not compute a sound diff (MEH-1634)."
    echo "  Set CHANGELOG_GUARD_BASE=<rev> to point it at a frozen base explicitly."
    exit 1
  fi
  echo
  printf '%s\n' "$files" | classify || {
    echo
    echo "changelog-branch-guard FAILED."
    exit 1
  }

  echo
  echo "changelog-branch-guard OK."
  exit 0
}

case "${1:-}" in
  --self-test) self_test ;;
  "")          main ;;
  *)           echo "usage: $(basename "$0") [--self-test]" >&2; exit 2 ;;
esac
