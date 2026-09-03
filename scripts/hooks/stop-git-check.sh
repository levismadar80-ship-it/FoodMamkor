#!/usr/bin/env bash
#
# Module:   stop-git-check
# Purpose:  In-repo port of the machine-level Stop hook
#           ~/.claude/stop-hook-git-check.sh (wired from
#           ~/.claude/launcher-settings.json, NOT from this repo), so it can be
#           reviewed, versioned and proven. Same four checks — uncommitted
#           changes · untracked files · commits GitHub will show as Unverified ·
#           unpushed commits — with the two defects the cards name fixed:
#             MEH-1839  the signature block reported ONE merged reason for two
#                       independent checks ("missing signature, or committer
#                       email is not …") and advised `--amend --reset-author`
#                       even when nothing it changes was wrong. Here each
#                       reason is checked, reported and remedied separately.
#             MEH-2117  "does origin have this branch?" was answered from the
#                       LOCAL remote-tracking ref (`git rev-parse origin/X`),
#                       which a stale ref answers wrongly (measured: a branch
#                       with 0 heads on origin, rev-parse SUCCEEDS). Here it is
#                       answered by `git ls-remote --heads`, and the narrowed
#                       option (ב) from the card applies: when the remote branch
#                       exists and the local one is NOT fast-forwardable onto it
#                       (diverged), stay silent — "please push" would be the
#                       wrong instruction (the push would be a force).
# Touches:  one network read (`git ls-remote origin <branch>`, bounded by
#           `timeout` when available). No writes: no fetch, no ref updates.
# Does NOT: verify signatures. Neither can the machine hook: gpg.ssh.
#           allowedSignersFile is unset in these containers, so %G? returns N
#           for correctly-signed commits (MEH-1839). Presence of the
#           `gpgsig`/`gpgsig-sha256` header is what is checked, and the message
#           says so. GitHub is the verification authority.
#           Also NOT the build/test Stop hook — that is the sibling
#           scripts/hooks/stop-build-and-test.sh, wired from .claude/settings.json.
# Related:  ~/.claude/stop-hook-git-check.sh (the original; re-read 03/09 —
#           its signature block ALREADY moved to the raw gpgsig header, i.e.
#           MEH-1839 proposal 3 landed upstream; proposals 2 and 4 — separate
#           reasons, conditional amend — had not, and `rev-parse` at :41 is
#           still how upstream is chosen) ·
#           docs/ci/meh-2117-stop-hook-in-repo.patch.md (the launcher-settings
#           hunk Sapir applies so the machine points here) ·
#           .claude/rules/testing.md ("A green that has two possible causes").
# History:  MEH-2117 + MEH-1839 (creation — one move covers both, same file).
#
# ENV
#   STOP_GIT_CHECK_LS_REMOTE_TIMEOUT  seconds for the ls-remote (default 15)
#
# EXIT CODES
#   0  nothing to report (or stop_hook_active, or not a git repo / no remote)
#   2  something to do — the reason(s) on stderr (Claude Code blocks on 2)
#
set -uo pipefail

if [ "${1:-}" = "--self-test" ]; then SELF_TEST=1; else SELF_TEST=0; fi

LS_REMOTE_TIMEOUT="${STOP_GIT_CHECK_LS_REMOTE_TIMEOUT:-15}"
SIGNING_IDENTITY="noreply@anthropic.com"   # the email CCR's signing key is registered to

# ── the check ────────────────────────────────────────────────────────────────
run_check() {
  local input=""
  if [ ! -t 0 ]; then input="$(cat 2>/dev/null || true)"; fi
  if command -v jq >/dev/null 2>&1 && [ -n "$input" ]; then
    [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ] && return 0
  fi

  git rev-parse --git-dir >/dev/null 2>&1 || return 0
  [ -n "$(git remote)" ] || return 0     # nothing to push to — every message below would be unsatisfiable

  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "There are uncommitted changes in the repository. Please commit and push these changes to the remote branch." >&2
    return 2
  fi
  if [ -n "$(git ls-files --others --exclude-standard)" ]; then
    echo "There are untracked files in the repository. Please commit and push these changes to the remote branch." >&2
    return 2
  fi

  local current_branch; current_branch="$(git branch --show-current)"
  [ -n "$current_branch" ] || return 0   # detached HEAD: nothing to say about a branch

  # ── MEH-2117: ask the REMOTE whether the branch exists, not a local ref ────
  # `ls-remote --exit-code` returns 2 when no ref matched. Any other failure
  # (offline, auth, timeout) is a third state and is NOT collapsed into
  # "absent" — it falls back to the local ref and says so, because the two
  # nulls "no such branch" and "could not ask" must never read the same.
  local remote_sha="" remote_state
  local ls_out ls_rc
  if command -v timeout >/dev/null 2>&1; then
    ls_out="$(timeout "$LS_REMOTE_TIMEOUT" git ls-remote --exit-code --heads origin "refs/heads/$current_branch" 2>/dev/null)"; ls_rc=$?
  else
    ls_out="$(git ls-remote --exit-code --heads origin "refs/heads/$current_branch" 2>/dev/null)"; ls_rc=$?
  fi
  case "$ls_rc" in
    0) remote_state="present"; remote_sha="${ls_out%%[[:space:]]*}" ;;
    2) remote_state="absent" ;;
    *) remote_state="unknown"
       if git rev-parse -q --verify "origin/$current_branch" >/dev/null 2>&1; then
         remote_sha="$(git rev-parse "origin/$current_branch")"
         echo "note: could not reach origin (ls-remote exit $ls_rc); using the local ref origin/$current_branch, which may be stale." >&2
       fi ;;
  esac

  # ── MEH-1839: signature + identity, as TWO checks with TWO remedies ────────
  # Scope: commits on no remote ref at all (upstream's own scoping, kept — it is
  # what stops the hook sweeping teammates' published commits, #69586). Gated on
  # signing being configured, as before.
  if [ "$(git config --type=bool commit.gpgsign 2>/dev/null)" = "true" ]; then
    local sha ce unsigned="" wrong_email=""
    while read -r sha ce; do
      [ -n "$sha" ] || continue
      if ! git cat-file commit "$sha" 2>/dev/null | sed '/^$/q' | grep -qE '^gpgsig(-sha256)? '; then
        unsigned+="  ${sha:0:7}"$'\n'
      fi
      if [ "$ce" != "$SIGNING_IDENTITY" ]; then
        wrong_email+="  ${sha:0:7} committer=$ce"$'\n'
      fi
    done < <(git log --format='%H %ce' HEAD --not --remotes 2>/dev/null)

    if [ -n "$unsigned" ] || [ -n "$wrong_email" ]; then
      echo "Commit(s) on branch '$current_branch' that GitHub will show as Unverified:" >&2
      if [ -n "$unsigned" ]; then
        echo "REASON 1 — no signature header (gpgsig) on:" >&2
        printf '%s' "$unsigned" >&2
        echo "  (presence check on the raw commit header; signatures are not VERIFIED locally — gpg.ssh.allowedSignersFile is unset here, GitHub is the authority)" >&2
        echo "  Remedy: commit.gpgsign is on, so re-committing signs it: 'git commit --amend --no-edit' for the tip, or 'git rebase --exec \"git commit --amend --no-edit\" <base>' for earlier ones. (Resetting the author changes nothing for this reason and is not prescribed.)" >&2
      fi
      if [ -n "$wrong_email" ]; then
        echo "REASON 2 — committer email is not $SIGNING_IDENTITY on:" >&2
        printf '%s' "$wrong_email" >&2
        echo "  Remedy: 'git config user.email $SIGNING_IDENTITY && git config user.name Claude', then 'git commit --amend --no-edit --reset-author' (this is the reason --reset-author actually fixes)." >&2
      fi
      echo "Then push." >&2
      return 2
    fi
  fi

  # ── unpushed commits — MEH-2117 option (ב), narrowed ───────────────────────
  case "$remote_state" in
    absent)
      local n; n="$(git rev-list HEAD --not --remotes --count 2>/dev/null || echo 0)"
      if [ "$n" -gt 0 ]; then
        echo "Branch '$current_branch' has $n unpushed commit(s) and no remote branch (origin has no refs/heads/$current_branch — asked via ls-remote). Please push these changes to the remote repository." >&2
        return 2
      fi ;;
    present|unknown)
      [ -n "$remote_sha" ] || return 0
      # Fast-forwardable = the remote head is an ancestor of HEAD. If it is not
      # (diverged, or the remote object is not even known locally), a "please
      # push" would be wrong — the push would need force — so say nothing.
      # That silence is the card's accepted trade, recorded there, not hidden.
      if git merge-base --is-ancestor "$remote_sha" HEAD 2>/dev/null; then
        local ahead; ahead="$(git rev-list "$remote_sha..HEAD" --count 2>/dev/null || echo 0)"
        if [ "$ahead" -gt 0 ]; then
          echo "There are $ahead unpushed commit(s) on branch '$current_branch' (origin/$current_branch is at ${remote_sha:0:7}, an ancestor of HEAD). Please push these changes to the remote repository." >&2
          return 2
        fi
      fi ;;
  esac
  return 0
}

# ── self-test ────────────────────────────────────────────────────────────────
# Throwaway repos under mktemp: a bare "origin" plus a clone. Each case is one
# constructed state and one required message (or required silence). The
# signed-commit case CONSTRUCTS a gpgsig header with `git hash-object -t commit`
# — no key material is needed for a presence check, and that is precisely the
# point of MEH-1839 proposal 3.
self_test() {
  local pass=0 total=0 rc out
  # Globals on purpose: the EXIT trap fires after this function has returned,
  # so a `local` here would be unbound under `set -u` by the time it runs.
  SELFTEST_TMP="$(mktemp -d)"
  SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  trap 'rm -rf "$SELFTEST_TMP"' EXIT
  local tmp="$SELFTEST_TMP"
  local origin="$tmp/origin.git" work="$tmp/work"
  local G="git -c user.name=T -c user.email=$SIGNING_IDENTITY -c commit.gpgsign=false -c push.negotiate=false"

  check() { # $1=label $2=expected-exit $3=actual-exit [$4=required substring] [$5=forbidden substring]
    total=$((total+1))
    if [ "$3" -eq "$2" ] && { [ -z "${4:-}" ] || printf '%s' "$out" | grep -qF "$4"; } \
       && { [ -z "${5:-}" ] || ! printf '%s' "$out" | grep -qF "$5"; }; then
      echo "  ok   $1 (exit $3)"; pass=$((pass+1))
    else
      echo "  FAIL $1 (exit $3, wanted $2${4:+, must contain: $4}${5:+, must NOT contain: $5})"
      printf '%s\n' "$out" | sed 's/^/       | /' | tail -12
    fi
  }
  run_hook() { set +e; out="$(cd "$work" && bash "$SELF" 2>&1 </dev/null)"; rc=$?; set -e; }
  commit() { (cd "$work" && echo "$1" > "$1.txt" && $G add -A && $G commit -q -m "$1" "${@:2}"); }
  # Rewrite HEAD as an identical commit carrying a (fake) gpgsig header.
  sign_head() {
    (cd "$work" && git cat-file -p HEAD \
      | awk 'BEGIN{done=0} /^committer /{print; print "gpgsig -----BEGIN SSH SIGNATURE-----"; print " U1NIU0lHAAAAAQ== (selftest)"; print " -----END SSH SIGNATURE-----"; done=1; next} {print}' \
      | git hash-object -t commit -w --stdin \
      | xargs -I{} git update-ref "refs/heads/$(git branch --show-current)" {})
  }

  echo "stop-git-check --self-test"
  git init -q --bare -b main "$origin"
  git init -q -b main "$work"
  (cd "$work" && git remote add origin "$origin" && git config commit.gpgsign true)
  commit base; sign_head
  (cd "$work" && $G push -q origin main)

  # (1) clean, pushed → silent
  run_hook; check "clean + pushed → exit 0" 0 "$rc"

  # (2) uncommitted change → reported
  echo dirty >> "$work/base.txt"; run_hook
  check "uncommitted change → exit 2" 2 "$rc" "uncommitted changes"
  (cd "$work" && git checkout -q -- base.txt)

  # (3) signed commit, unpushed, on the existing remote branch → the UNPUSHED
  #     message, and NOT a signature complaint (MEH-1839 DoD, direction 1:
  #     allowedSignersFile is unset here and the commit is still not flagged).
  commit signed; sign_head; run_hook
  check "signed unpushed commit → unpushed message, no signature complaint" 2 "$rc" "unpushed commit(s) on branch 'main'" "REASON 1"

  # (4) genuinely UNSIGNED commit → REASON 1 named, REASON 2 absent, and the
  #     remedy does not say --reset-author (MEH-1839 DoD, direction 2 + item 4).
  commit unsigned; run_hook
  check "unsigned commit → REASON 1 only" 2 "$rc" "REASON 1" "REASON 2"
  printf '%s' "$out" | grep -A3 "REASON 1" | grep -q -- "--reset-author" && rc=1 || rc=0
  check "...and its remedy does not prescribe --reset-author" 0 "$rc"
  (cd "$work" && git reset -q --hard HEAD~1)

  # (5) signed but WRONG committer email → REASON 2 only, remedy has --reset-author
  (cd "$work" && echo e > e.txt && git add -A && git -c user.name=X -c user.email=someone@example.com -c commit.gpgsign=false commit -q -m email)
  sign_head; run_hook
  check "wrong committer email → REASON 2 only" 2 "$rc" "REASON 2" "REASON 1"
  printf '%s' "$out" | grep -A3 "REASON 2" | grep -q -- "--reset-author" && rc=0 || rc=1
  check "...and its remedy DOES prescribe --reset-author" 0 "$rc"
  (cd "$work" && git reset -q --hard HEAD~2)   # back to the pushed `base`

  # (6) DIVERGED: remote has a commit the local branch does not, and local has
  #     its own → option (ב): silent. (Construct by pushing from a second clone.)
  local other="$tmp/other"; git clone -q "$origin" "$other"
  (cd "$other" && echo o > o.txt && $G add -A && $G commit -q -m other && $G push -q origin main)
  commit local; sign_head; run_hook
  check "diverged from origin/main → silent (a push would be a force)" 0 "$rc"
  (cd "$work" && git fetch -q origin && git reset -q --hard origin/main)

  # (7) STALE LOCAL REF — the MEH-2117 §2 construction. A remote-tracking ref
  #     for a branch origin does NOT have. rev-parse would say "exists" and
  #     report "unpushed on origin/ghost"; ls-remote says absent, so the hook
  #     must report a NEW branch with no remote branch.
  (cd "$work" && git checkout -q -b ghost && git update-ref refs/remotes/origin/ghost HEAD)
  commit ghostwork; sign_head; run_hook
  check "stale origin/ghost ref, no such branch on origin → 'no remote branch' via ls-remote" 2 "$rc" "no remote branch"
  (cd "$work" && git checkout -q main && git branch -q -D ghost && git update-ref -d refs/remotes/origin/ghost)

  # (8) new branch, unpushed → reported as new
  (cd "$work" && git checkout -q -b feature/new); commit newwork; sign_head; run_hook
  check "new unpushed branch → reported" 2 "$rc" "no remote branch"
  (cd "$work" && git checkout -q main && git branch -q -D feature/new)

  # (9) stop_hook_active → exit 0 even with dirty tree
  echo dirty >> "$work/base.txt"
  set +e; out="$(cd "$work" && printf '{"stop_hook_active": true}' | bash "$SELF" 2>&1)"; rc=$?; set -e
  check "stop_hook_active=true → exit 0" 0 "$rc"
  (cd "$work" && git checkout -q -- base.txt)

  echo "  $pass/$total self-test cases behaved correctly"
  [ "$pass" -eq "$total" ]
}

if [ "$SELF_TEST" -eq 1 ]; then
  set -e
  self_test || exit 1
  exit 0
fi
run_check
exit $?
