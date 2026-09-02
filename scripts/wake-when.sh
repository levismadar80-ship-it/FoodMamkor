#!/usr/bin/env bash
# wake-when.sh — run the WAKE-WHEN checks for every parked card on MEH-2227.
#
# WHAT THIS IS
#   Each parked card carries one condition that, when it becomes true, means the
#   gate holding it has opened and the card returns to the queue. This runs those
#   conditions and prints a verdict. That is all it does.
#
# WHY IT IS NOT IN scripts/checks/
#   run-all.sh auto-discovers *executable* *.sh directly in scripts/checks/ and
#   runs every one of them (see its discovery block). This is a REPORTER, not a
#   guard: it must never influence a PR's verdict. There are two ways to keep it
#   out of the dispatcher, and only one of them is honest:
#     - drop it in scripts/checks/ without +x -> run-all.sh prints
#       "NOTICE ... is not executable — not run. (chmod +x to enable)" on EVERY
#       run, forever. That notice exists to catch a guard that silently lost its
#       +x bit (the MEH-1030 self-disabling class). A file deliberately parked in
#       that state trains the reader to ignore the notice, which disarms it.
#     - keep it out of the directory entirely. <- this
#
# THE FIVE VERDICTS, and why SATISFIED is not OPEN
#   OPEN       the gate opened; the card goes back in the queue.
#   parked     the gate is still shut. The number moves, so you can see it move.
#   SATISFIED  the condition is permanently true and there is nothing to do.
#              Kept for audit, counted separately. Before drain 14 this printed
#              as OPEN forever (MEH-1915 s1), and a row that is OPEN on every run
#              teaches the reader that OPEN means nothing — the same disarming
#              this file refuses in the +x NOTICE case above.
#   SKIP       no condition can be expressed. Each SKIP names WHY, specifically.
#              "Sapir has to decide" is not a reason; "Sapir has to run X, which
#              leaves no trace in the repo" is.
#   UNSTARTED  a cc-queue card in an active state with NO gate at all. Added
#              drain 16. Before it, such a card appeared nowhere: not parked
#              (nothing holds it), not SKIP (no outside action is owed), not
#              OPEN (nothing opened). It was simply absent, and STEP 0 read as
#              "everything is accounted for" while three cc-queue cards sat in
#              Todo untouched. A card nobody is blocked on and nobody has
#              started is the one this file was least able to see, because it
#              only ever asked "has a gate opened?" and never "is there a gate?"
#
# ON THE SKIP REASONS (drain 14, 01/09)
#   All nine SKIP rows were re-derived from the cards. SEVEN were wrong or stale:
#   two cards' gates had already opened, one card was Done, one pair was already
#   covered by a check in this very file, and three reasons named the wrong gate.
#   A park reason is a claim of fact and rots exactly like any other (rule 34).
#   Whatever is left in a SKIP row below has been read at the card this week.
#
# WHAT `currency: ok` DOES NOT COVER — measured drain 18, on this file
#   The control compares $REF against origin. It says nothing about the SCRIPT
#   YOU ARE RUNNING. On 01/09 STEP 0 was executed from a local base branch two
#   commits behind its remote: the OLD script ran, printed three fewer rows
#   than exist, and reported `currency: ok` truthfully — because the remote ref
#   WAS current; the working tree was not. The output looked entirely ordinary
#   and was missing a quarter of the board.
#
#   No code fix, deliberately: a script cannot ask whether it is itself the
#   newest version without trusting the same tree it was read from. The habit
#   is the fix — fetch, hard-align the local base branch onto the fetched
#   remote ref, and only THEN run STEP 0. Reading the numbers first and
#   aligning afterwards is how that run happened.
#
# EXIT CODE
#   Always 0 — including when checks are OPEN, and including when the control
#   fails. An OPEN result is information, not a failure; nothing here should ever
#   be able to red a PR. --self-test is the one exception: it exits non-zero when
#   the classifier fails to discriminate, because a reporter whose classifier is
#   broken is worse than no reporter.
#
# USAGE
#   bash scripts/wake-when.sh              # against origin/staging
#   REF=origin/main bash scripts/wake-when.sh
#   bash scripts/wake-when.sh --self-test  # prove the classifier discriminates
set -uo pipefail

REF="${REF:-origin/staging}"
cd "$(git rev-parse --show-toplevel)" || exit 0

# The PR-checks workflow the F-9 row reads. Held in a variable, and annotated,
# because the literal filename trips check-rtl.sh: the name begins with the two
# characters of the physical Tailwind padding-end class, so the matcher reads a
# CSS violation in a shell script. False positive, annotated rather than
# allowlisted — .claude/hooks/rtl-allowlist.txt is CC-deny.
PR_CHECKS_WF=".github/workflows/pr-checks.yml"   # rtl-ok: a filename, not a CSS class

SNAP="frontend/e2e/visual/parity.spec.ts-snapshots/producer-detail-desktop-linux.png"

# ---------------------------------------------------------------------------
# count — occurrences of a token in one path at $REF. Empty result normalises
# to 0 at the call site, never here: a caller that cannot tell "absent" from
# "grep failed" is the bug this file's control exists to catch.
# ---------------------------------------------------------------------------
count() { git grep -c "$1" "$REF" -- "$2" 2>/dev/null | sed 's/.*://' | head -1 || true; }

# ---------------------------------------------------------------------------
# verdict — THE CLASSIFIER. Every row's OPEN/parked decision goes through here,
# so --self-test below exercises the real implementation and not a copy of it
# (.claude/rules/testing.md: "Exercise the real implementation, never a copy").
# ---------------------------------------------------------------------------
verdict() {   # <op: eq|ge|lt> <now> <threshold>  ->  prints open | parked
  case "$1" in
    eq) if [ "$2" -eq "$3" ]; then echo open; else echo parked; fi ;;
    ge) if [ "$2" -ge "$3" ]; then echo open; else echo parked; fi ;;
    lt) if [ "$2" -lt "$3" ]; then echo open; else echo parked; fi ;;
    *)  echo "verdict: unknown operator '$1'" >&2; return 2 ;;
  esac
}

# ---------------------------------------------------------------------------
# currency — THE SECOND CLASSIFIER, added drain 16 after it cost two wrong
# verdicts in one run.
#
# The control below proves $REF *resolves*. It cannot prove $REF is *current*,
# and those are different failures with the same appearance. On a fresh
# container origin/staging is whatever the harness cloned; every `git grep` then
# answers about a base branch that has moved. Measured 01/09, one run, before
# any fetch — `git fetch origin staging` reported `+ 17011b6...826b6df (forced
# update)`, i.e. the ref had been four commits behind:
#
#   row            stale reading            true reading
#   MEH-1855 ch2   OPEN   (now=0)           parked (now=1)
#   MEH-1915 s1    REGRESSED "CODEOWNERS    SATISFIED — it is on the base
#                  is GONE from staging"
#
# A false OPEN sends a session to do work that is still gated; a false REGRESSED
# reports a guard as deleted when it is present. Both printed under `control:
# ok`, because the old control asked the wrong question.
#
# Pure, so --self-test can drive it in every direction without a network:
# it takes the two SHAs and classifies, it does not fetch them.
# ---------------------------------------------------------------------------
currency() {   # <local-sha> <remote-sha>  ->  current | stale | unverified
  [ -n "${2:-}" ] || { echo unverified; return; }
  [ -n "${1:-}" ] || { echo unverified; return; }
  if [ "$1" = "$2" ]; then echo current; else echo stale; fi
}

# remote_head — the SHA origin currently has for $REF's branch, or empty when
# it cannot be asked. Empty is NOT "same"; it flows to `unverified` above, so a
# network-blocked environment gets an honest "not checked" instead of a silent
# pass. Never let this default to the local SHA.
remote_head() {
  git ls-remote --heads origin "${REF#origin/}" 2>/dev/null | awk 'NR==1{print $1}'
}

# ---------------------------------------------------------------------------
# baseline_drift — MEH-1694's own <precondition_hard>, made runnable.
#
# Prints the number of commits touching the producer-detail surface since the
# last commit that WROTE the desktop baseline. 0 means Sapir's vrt-update
# dispatch is current and part B may start.
#
# Prints -1, never 0, when it cannot measure. That distinction is the whole
# point: in a SHALLOW clone `git log -- <path>` reports the graft commit as
# having written every file (MEH-1519), the range is then empty, and the row
# would read "0 -> baselines fresh" — the reassuring answer, produced by the
# probe being blind. -1 is surfaced as VOID by the caller.
# ---------------------------------------------------------------------------
baseline_drift() {
  [ "$(git rev-parse --is-shallow-repository)" = "false" ] || { echo -1; return; }
  local sha
  sha=$(git log -1 --format=%H "$REF" -- "$SNAP" 2>/dev/null)
  [ -n "$sha" ] || { echo -1; return; }
  git log --oneline "$sha..$REF" -- \
    'frontend/app/[locale]/producer/[id]' \
    frontend/components/public \
    frontend/messages/he.json 2>/dev/null | wc -l | tr -d ' '
}

# ---------------------------------------------------------------------------
# --self-test — run it FIRST when changing anything here. If the classifier
# cannot sort a correct state from a broken one, nothing this file reports
# afterwards is worth reading (MEH-1619).
#
# Six synthetic cases pin the three operators in BOTH directions. Case 7 proves
# an unknown operator fails loudly rather than defaulting to a verdict. Cases
# 8-11 are anchored to REAL repo state, per MEH-1909: a suite built only from
# invented shapes passes against shapes the repo does not use.
# ---------------------------------------------------------------------------
self_test() {
  local fails=0 ran=0
  chk() {  # <label> <expected> <actual>
    ran=$((ran + 1))
    if [ "$2" = "$3" ]; then
      printf '  ok    %-46s -> %s\n' "$1" "$3"
    else
      printf '  FAIL  %-46s -> %s (expected %s)\n' "$1" "$3" "$2"; fails=$((fails + 1))
    fi
  }

  echo "wake-when --self-test"
  echo
  echo "  synthetic — each operator in both directions:"
  chk "eq  now=0 thr=0"  open   "$(verdict eq 0 0)"
  chk "eq  now=1 thr=0"  parked "$(verdict eq 1 0)"
  chk "ge  now=1 thr=1"  open   "$(verdict ge 1 1)"
  chk "ge  now=0 thr=1"  parked "$(verdict ge 0 1)"
  chk "lt  now=3 thr=4"  open   "$(verdict lt 3 4)"
  chk "lt  now=4 thr=4"  parked "$(verdict lt 4 4)"

  echo
  echo "  an unknown operator must fail, not pick a verdict:"
  local rc; verdict zz 1 1 >/dev/null 2>&1; rc=$?
  chk "unknown operator exits 2" 2 "$rc"

  echo
  echo "  currency — the classifier that would have caught drain 16's two false verdicts:"
  chk "same sha            -> current"    current    "$(currency aaa111 aaa111)"
  chk "different sha       -> stale"      stale      "$(currency aaa111 bbb222)"
  # The load-bearing pair. An empty remote SHA means "could not ask", and the
  # tempting implementation treats it as agreement — which prints `current` for
  # a ref nobody checked, the reassuring answer produced by a blind probe. Both
  # empty directions are pinned so that shortcut cannot be reintroduced quietly.
  chk "remote unknown      -> unverified" unverified "$(currency aaa111 '')"
  chk "local unknown       -> unverified" unverified "$(currency '' bbb222)"

  echo
  echo "  anchored to real repo state at $REF (MEH-1909 — synthetic shapes are not enough):"
  local present absent drift
  present=$(count 'class Producer' backend/app/models/models.py); present=${present:-0}
  chk "count() finds a token that IS in models.py" open "$(verdict ge "$present" 1)"
  absent=$(count 'zzz_wake_when_absent_token_xyz' backend/app/models/models.py); absent=${absent:-0}
  chk "count() returns 0 for a token that is NOT"  parked "$(verdict ge "$absent" 1)"
  # baseline_drift needs TWO cases, and the second is the load-bearing one.
  #
  # "returns >= 0" is NOT a check: a blind probe that answers 0 satisfies it, and
  # 0 is precisely the reassuring value (= "baselines fresh, part B may start").
  # That hole was found by breaking the sentinel and watching this suite stay
  # green while the real run printed OPEN now=0. So:
  #   (1) the sentinel path is exercised on a ref that genuinely cannot resolve;
  #   (2) the measured value is cross-checked against a SECOND, independent
  #       instrument over the same range. A probe that has gone blind returns 0
  #       while the cross-check returns the true count, and they disagree.
  local unresolvable
  unresolvable=$(REF=refs/heads/zzz-wake-when-no-such-ref baseline_drift)
  chk "baseline_drift() -> -1 when it cannot measure" "-1" "$unresolvable"

  local drift sha cross
  drift=$(baseline_drift)
  sha=$(git log -1 --format=%H "$REF" -- "$SNAP" 2>/dev/null)
  cross=$(git rev-list --count "$sha..$REF" -- \
    'frontend/app/[locale]/producer/[id]' \
    frontend/components/public \
    frontend/messages/he.json 2>/dev/null)
  chk "baseline_drift() agrees with an independent count" "$cross" "$drift"
  # MEH-1909: synthetic shapes are not enough. This drives currency() through
  # the REAL git plumbing — a branch name that exists on origin must classify as
  # current-or-stale (never unverified, which would mean ls-remote itself is
  # broken), and one that cannot exist must classify as unverified.
  local real_cur nosuch
  real_cur=$(currency "$(git rev-parse "$REF" 2>/dev/null)" "$(remote_head)")
  case "$real_cur" in current|stale) real_cur=resolved ;; esac
  chk "currency() on the real $REF resolves" resolved "$real_cur"
  nosuch=$(currency "$(git rev-parse "$REF" 2>/dev/null)" \
           "$(git ls-remote --heads origin zzz-wake-when-no-such-branch 2>/dev/null | awk 'NR==1{print $1}')")
  chk "currency() on a branch origin lacks -> unverified" unverified "$nosuch"

  echo
  if [ "$fails" -gt 0 ]; then
    echo "self-test FAILED — $fails of $ran cases. The classifier does not discriminate;"
    echo "every verdict this file prints is void until this passes."
    return 1
  fi
  echo "self-test ok — $ran cases, all discriminating."
  return 0
}

if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi

printf '\nWAKE-WHEN — parked-card gate checks against %s\n' "$REF"
printf 'as-of %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---------------------------------------------------------------------------
# CONTROL — runs FIRST, and every result below is void if it fails.
#
# Without it this reporter has exactly the failure mode it exists to avoid: if
# REF is missing or unfetched, every `git grep -c` returns 0 — and 0 is the
# parked value for some rows and the OPEN value for others. The output would
# look perfectly ordinary and mean nothing. So: prove the ref resolves AND that
# a token known to be present is actually found.
# ---------------------------------------------------------------------------
control_ok=1
git rev-parse --verify --quiet "$REF" >/dev/null || control_ok=0
if [ "$control_ok" = 1 ]; then
  sentinel=$(count 'class Producer' backend/app/models/models.py)
  [ -n "${sentinel:-}" ] && [ "${sentinel:-0}" -ge 1 ] || control_ok=0
fi

if [ "$control_ok" != 1 ]; then
  echo "  CONTROL FAILED — '$REF' does not resolve, or a token known to be present"
  echo "  was not found in it. EVERY result this script could print is void: a"
  echo "  missing ref makes every grep return 0, and 0 is the parked value for"
  echo "  some rows and the OPEN value for others."
  echo "  Fix: git fetch origin staging"
  echo
  echo "wake-when: VOID (control failed). Reporter only — exiting 0."
  exit 0
fi
echo "  control: ok ($REF resolves; sentinel token found)"

# --- currency, the half the old control could not see (drain 16) ---------
cur=$(currency "$(git rev-parse "$REF" 2>/dev/null)" "$(remote_head)")
case "$cur" in
  current)
    echo "  currency: ok ($REF matches origin)"
    ;;
  stale)
    echo
    echo "  ⛔ $REF IS STALE — it does not match what origin has for"
    echo "     '${REF#origin/}'. Every row below is a measurement of the WRONG tree."
    echo "     This is not hypothetical: on 01/09 a run in this exact state"
    echo "     printed OPEN for MEH-1855 ch2 (truly parked) and REGRESSED for"
    echo "     MEH-1915 s1 (truly SATISFIED), both under 'control: ok'."
    echo "     Fix: git fetch origin ${REF#origin/}"
    echo
    echo "wake-when: VOID (ref is stale). Reporter only — exiting 0."
    exit 0
    ;;
  *)
    echo "  currency: UNVERIFIED — could not reach origin to compare."
    echo "            Not a pass. If this container has network, run"
    echo "            'git fetch origin ${REF#origin/}' before trusting any row."
    ;;
esac

# --- depth, which degrades one row rather than all of them ---------------
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  echo "  depth:    SHALLOW — baseline_drift cannot measure and reports VOID."
  echo "            'git fetch --unshallow origin' to restore it. The other rows"
  echo "            read blobs at \$REF and are unaffected."
fi
echo

open=0; parked=0; satisfied=0; skipped=0; void=0; unstarted=0

report() {   # <card> <desc> <now> <open|parked>
  if [ "$4" = open ]; then
    printf '  OPEN    %-16s %-38s now=%s\n' "$1" "$2" "$3"; open=$((open + 1))
  else
    printf '  parked  %-16s %-38s now=%s\n' "$1" "$2" "$3"; parked=$((parked + 1))
  fi
}

v=$(count 'LEGACY(2026-10-01, MEH-1855)' backend/app/models/models.py); v=${v:-0}
report "MEH-1855 ch2" "marker gone (wake when 0)"         "$v" "$(verdict eq "$v" 0)"

v=$(count 'rejection_reason_code' backend/app/models/models.py); v=${v:-0}
report "MEH-2210 A"   "column present (wake when >=1)"    "$v" "$(verdict ge "$v" 1)"

# B and C are YELLOW end-to-end with self-QA + auto-merge on green (card §4,
# "Chunks B, C: YELLOW end-to-end"). They never needed a per-chunk go — only
# chunk A is the RED gate. So B/C wake on exactly the condition above, and the
# SKIP row that used to carry them was covered by a check in this same file.
report "MEH-2210 B/C" "waits on chunk A, same signal"     "$v" "$(verdict ge "$v" 1)"

v=$(count 'the job ran and did not pass' "$PR_CHECKS_WF"); v=${v:-0}
report "MEH-1907 F-9" "F-9 string present (wake >=1)"     "$v" "$(verdict ge "$v" 1)"

v=$(count 'does not have' .github/workflows/vrt-update.yml); v=${v:-0}
report "MEH-2224"     "false claim gone (wake when 0)"    "$v" "$(verdict eq "$v" 0)"

v=$(count 'MEH-' .github/pull_request_template.md); v=${v:-0}
report "MEH-2167"     "fewer MEH ids (wake when <4)"      "$v" "$(verdict lt "$v" 4)"

# MEH-1981 — added drain 16. It carried NO row: drain 14 retired its "waiting on
# a lawyer" gate (correctly — Sapir's 30/08 split removed it) and nothing
# replaced it, so a High cc-queue card in Todo became invisible to STEP 0. Its
# real blocker turns out to be a REPO FILE and therefore checkable: steps 0 and
# 2 need the Privacy Authority's guidance from gov.il, the domain is not in the
# WebFetch allowlist, and check-webfetch-allowlist.sh fails closed. Sapir adding
# the domain is the wake signal. (Step 3 is separately gated by rule 22 — new
# user-facing Hebrew needs her verbal approval — which is a decision, not a
# state, so it is not what this row measures.)
v=$(count 'gov\.il' .claude/settings.json); v=${v:-0}
report "MEH-1981 s0/s2" "gov.il in WebFetch allowlist (>=1)" "$v" "$(verdict ge "$v" 1)"

# ---------------------------------------------------------------------------
# Three rows added drain 17, and the reason they are rows is the finding.
#
# All three cards were being carried as "Sapir does something outside the repo"
# — the SKIP shape. They are not. Each one's gate is a line in a file on this
# branch, so each is a CHECK, and the difference matters: a SKIP row is a note
# nobody can act on, while these flip on their own the moment Sapir's edit
# lands, with no session having to notice.
# ---------------------------------------------------------------------------

# MEH-1754 — the resolver itself landed 02/08 (#2514) and 12/08 (#2832); verified
# drain 17 across all seven SSR entity routes (each carries the 404 check and a
# throw; none returns a bare null). The card's ONLY open item is item 5, and its
# gate is two `NEXT_PUBLIC_API_URL` lines in pr-checks.yml — the `Frontend build`
# and `AI artifact scan` steps, both of which run their own `npm run build`.
# Measured drain 17: pr-checks.yml carries ZERO occurrences (e2e.yml and
# vrt-update.yml have it; the file that gates the PR does not).
v=$(count 'NEXT_PUBLIC_API_URL' "$PR_CHECKS_WF"); v=${v:-0}
report "MEH-1754 item5" "NEXT_PUBLIC_API_URL in pr-checks (>=1)" "$v" "$(verdict ge "$v" 1)"

# MEH-2184 — the qa-artifacts size cap's pathspec is root-only, so the gate is
# blind to frontend/qa-artifacts/. Not hypothetical: Playwright runs with
# working-directory: frontend, so a spec writing the relative path
# "qa-artifacts/X" lands under frontend/ — the blind half is the DEFAULT write
# target. Measured drain 17: 495 tracked files / 14.8 MB the cap cannot see.
# Wakes when the pathspec stops being root-only (the patch adds a glob).
v=$(count 'qa-artifacts/\*\*' "$PR_CHECKS_WF"); v=${v:-0}
report "MEH-2184"      "cap pathspec globbed (wake >=1)"    "$v" "$(verdict ge "$v" 1)"

# MEH-2043 — PR 1 (self-host the StoryCardCanvas fonts) already landed: the
# component carries no gstatic reference and next.config.js says so at :90-105.
# What remains is PR 2, dropping the CSP entry, which next.config.js itself
# defers "until the fix has been checked with the network blocked". That is a
# security change and waits for a go; the row exists so the card stops reading
# as "fonts still fetch from Google".
v=$(count 'fonts\.gstatic\.com' frontend/next.config.js); v=${v:-0}
report "MEH-2043 pr2"  "gstatic gone from CSP (wake when 0)" "$v" "$(verdict eq "$v" 0)"

# MEH-1694 part B — the card's own <precondition_hard>, run rather than quoted.
v=$(baseline_drift)
if [ "$v" -lt 0 ] 2>/dev/null; then
  printf '  VOID    %-16s %-38s %s\n' "MEH-1694 B" "baseline freshness UNMEASURABLE" \
    "(shallow clone — run: git fetch --unshallow origin)"
  void=$((void + 1))
else
  report "MEH-1694 B"  "surface commits since baseline (0)" "$v" "$(verdict eq "$v" 0)"
fi

echo
echo "  Satisfied — condition permanently met, retained for audit, NOT open work:"
if git cat-file -e "$REF:.github/CODEOWNERS" 2>/dev/null; then
  echo "    SATISFIED  MEH-1915 s1     CODEOWNERS is on the base branch (PR #3246, 9bb90379)."
  echo "                               Measured drain 13: the file REQUESTS a reviewer, it does"
  echo "                               not REQUIRE one — #3247 matched '*' and merged with zero"
  echo "                               reviews. Steps 2-4 (the ruleset) are Sapir's and are not"
  echo "                               a repo state, so nothing here can ever report on them."
  satisfied=$((satisfied + 1))
else
  echo "    REGRESSED  MEH-1915 s1     CODEOWNERS is GONE from $REF — it was on the base."
  open=$((open + 1))
fi

# ---------------------------------------------------------------------------
# Gates that genuinely cannot be expressed. Listed so the set stays complete —
# a reporter that silently omits them reads as "everything is covered".
#
# Each line names the ACTION that would open it and why it leaves no trace.
# Deliberately NOT given invented conditions: the two candidates rejected on
# 01/09 (a token already present for another reason, and a string whose real
# spelling differed by one space) are what an unrun check looks like.
# ---------------------------------------------------------------------------
echo
echo "  Not expressible — an action outside the repo, named:"
skips=$(cat <<'SKIPS'
    SKIP    MEH-2189        Sapir runs `seed_demo_producers --confirm` on Railway.
                            NOT "MEH-2168 Done" — that was wrong; the card says
                            it has no blocker. The code merged (PR #3115); what
                            is missing is a seed run and one green e2e signal,
                            and a Railway run writes nothing to this repo.
    SKIP    MEH-1508 ch3ב/ג Sapir's RATIFY/FIX verdict on the non-deterministic
                            home VRT diff (MEH-1519/1531), plus DEMO_ADMIN_PASSWORD
                            on Railway. NOT "per-chunk go" — the 09/08 ruling grants
                            chunk-by-chunk authority; `needs-sapir` is on this card
                            for those two ACTIONS. ch3א already shipped (#3191/#3194).
    SKIP    MEH-1938 ch5    Sapir action: GIVE THE GO for chunk 5 (Contract/RED,
                            full WAIT). Its named blocker MEH-1909 closed 16/08, so
                            this waits on a request nobody has made - which is not a
                            gate, it is an unowned item (drain 15 ruling). Chunks
                            2-4b and B1-B6 got a bundled go and have merged.
    SKIP    MEH-1207        Sapir action: REPLACE `MEH-1146` in that card's title with
                            an identifier that resolves, or drop the blocked marker.
                            `get_issue MEH-1146` returns "Could not find referenced
                            Issue"; an archived-inclusive query did not surface it
                            either. NOT a claim that it never existed - a lookup that
                            excludes archived is indistinguishable from that (MEH-1948).
                            Worse than a closed blocker: there is no entity whose
                            status can change, so this card cannot ever open by itself.
    SKIP    MEH-2226        Sapir posts two @dependabot commands in the GitHub UI.
                            NOT "hooks write" — the card's own Phase 0 (30/08) put
                            the mangling OUTSIDE the repo (harness/MCP write path,
                            controls both ways), so no .claude/hooks/ edit is needed
                            or possible. A GitHub comment leaves no repo trace.
SKIPS
)
printf '%s\n' "$skips"
# DERIVED, not stated. `skipped=4` stood here for one commit and was caught by
# the CI reviewer — a hardcoded tally in the file whose own message quotes
# "Derive counts, never state them" (testing.md / MEH-1976). Add or remove a
# SKIP row above and this number follows on its own.
skipped=$(printf '%s\n' "$skips" | grep -c '^[[:space:]]*SKIP')

# ---------------------------------------------------------------------------
# UNSTARTED — added drain 16, and the reason it exists is the shape of the gap
# it closes rather than the length of the list.
#
# Every other section here answers "has a gate opened?". A card with no gate is
# invisible to that question in both directions: it is never OPEN because
# nothing opened, and never parked because nothing holds it. So the summary line
# could report a clean board while cc-queue cards sat in Todo that nobody had
# started and nobody was blocked on — which is what happened. Three cc-queue
# cards were in Todo through several sweeps; the sweeps were not wrong, they
# were reading an instrument that could not represent the state.
#
# ENTRY RULE: a cc-queue card in an active state (Todo / In Progress), or one
# this file retired into limbo, for which no gate can be written because none
# exists. If a gate exists, it belongs in the checks above; if an outside action
# is owed, it belongs in SKIP. UNSTARTED means the work is simply unclaimed.
# ---------------------------------------------------------------------------
echo
echo "  Unstarted — cc-queue, no gate, nobody blocked. This is WORK, not a park:"
unstarted_rows=$(cat <<'UNSTARTED'
    UNSTART MEH-2107        Retired from this file 01/09 when its blocker MEH-1906 went
                            Done (completedAt 2026-08-30T10:38:03Z), which removed it from
                            the report without putting it anywhere else. It is queue-ready
                            and nobody is blocked on it: delivery-axis E2E coverage, High,
                            cc-queue, GREEN, ordinary CC work rather than a Sapir action.
                            NOT "nobody has looked at it" — §7 of the card was corrected on
                            31/08 with the measured unblock AND two design findings worth
                            reading before starting (the mutation check cannot run against
                            staging, and a register spec against staging is MEH-1502
                            self-pollution). What is stale is the TITLE, which still reads
                            "[חסום ע"י MEH-1906]" — and a title is what a sweep sorts on.
    UNSTART MEH-2237        17-gate CI reliability audit — Phase 0, read-only, a document
                            rather than code. High, cc-queue, no gate: nothing blocks it
                            and nobody is waiting on anyone. Not reached in drain 17,
                            which is why it is here rather than in a session summary.
                            The evidence it needs was gathered along the way and is
                            already in the log: F-1 (nine legs ran, zero read), the
                            cancelled-run guard, skip-green, the aggregator-duration
                            misread, MEH-1514's height-not-content VRT, and MEH-2184's
                            blindness measured in this same run.
UNSTARTED
)
printf '%s\n' "$unstarted_rows"
# Derived, for the same reason the SKIP tally is (testing.md — "Derive counts,
# never state them"; a stated tally here was caught by the CI reviewer once).
unstarted=$(printf '%s\n' "$unstarted_rows" | grep -c '^[[:space:]]*UNSTART')

echo
echo "  Retired this run (drain 14) — the gate opened or the card closed:"
cat <<'RETIRED'
    RETIRED MEH-1249        Gate was "MEH-1909 open". It closed 16/08. Caught by this
                            file's first run after 16 days and three judgement sweeps.
    RETIRED MEH-2107        Gate was "blocked by MEH-1906" (in the card title).
                            MEH-1906 is Done, completedAt 2026-08-30T10:38:03Z - two
                            days. Card is cc-queue and its scope is CC work, so it
                            resolves to "back in the queue", not to a Sapir action.
                            Drain 16: "back in the queue" was where it stopped being
                            tracked. Now carried as UNSTART above.
    RETIRED MEH-1981        Gate was "lawyer". Sapir's 30/08 split scoped the card to
                            what CC can do WITHOUT one (steps 0-3); the lawyer half is
                            a separate post-launch card and is no longer a DoD line.
                            Its own two prerequisites (#2743, #2746) are both on staging.
                            Drain 16: retiring it left the card with no row for two days.
                            It has a real gate after all — gov.il, checked above.
    RETIRED MEH-2087        Card is Done (31/08 22:10Z) and its single remaining CC task
                            is verified: ProducerDetailOut(ProducerListOut) inherits
                            availability_state + vacation_until (schemas.py:2248/2250,
                            :2429), and the frontend consumes them.
RETIRED

printf '\nwake-when: %d OPEN · %d parked · %d satisfied · %d skipped · %d unstarted · %d void. Reporter only — exit 0.\n' \
  "$open" "$parked" "$satisfied" "$skipped" "$unstarted" "$void"
echo "Anything OPEN goes back in the queue (MEH-2227 §4ה). VOID means the probe could"
echo "not see — treat it as unknown, never as parked. UNSTARTED is work with no gate"
echo "at all: it does not need anything to happen first, only for someone to take it."
exit 0
