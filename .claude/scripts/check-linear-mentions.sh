#!/usr/bin/env bash
# MEH-1379 — Linear auto-reopen guard, mechanical enforcement of workflow.md rule 29.
#
# Rule 29 bans a bare `MEH-XXXX` identifier in the TITLE or BODY of a docs-only
# PR that merely *mentions* issues: the Linear<->GitHub workspace app auto-links
# on identifier match and flips the mentioned (already-Done) issues back to
# In Progress, and a non-closing merge never restores them. The remedy is purely
# textual — write `PR #NNNN` or prose instead — so this check needs no Linear
# API, no token, no network, no environment variable.
#
# It extracts every `MEH-<digits>` occurrence that is NOT immediately preceded by
# a closing keyword (`Closes` / `Fixes` / `Resolves`, case-insensitive, optional
# colon). The one legitimate bare identifier — `Closes MEH-XXXX` for the issue the
# PR actually closes — is allowed and expected.
#
# MEH-1949 adds an OPTIONAL third argument: the branch name. Its semantics are
# INVERTED relative to title/body, and the inversion is the whole point:
#
#   title / body  — `Closes MEH-XX` is ALLOWED, a bare identifier is FORBIDDEN.
#   branch name   — a `meh-<N>` MAY auto-link, and no closing keyword can
#                   exist in a branch name. So banning the identifier is
#                   impossible AND wrong: the branch-name gate (MEH-1141)
#                   *requires* it —
#                       ^(feature|levismadar80)/meh-[0-9]+(-[a-z0-9]+)*$
#                   Two guards banning and requiring the same token would
#                   collide, and the branch gate would win because it is the
#                   required check.
#
# So the branch check is a CONSISTENCY check, not a ban: if the branch carries
# `meh-<N>`, the body must declare `Closes MEH-<N>` for that same N. Otherwise
# the merge may silently close a ticket the PR never claimed to close, with no
# keyword anywhere and nothing in the PR text saying so.
#
# This is the gap rule 29 leaves open. Rule 29 governs what the *text* says; the
# branch name can close a ticket regardless of the text — and, once measured,
# can also fail to. Neither direction is reliable, which is why the remedy is a
# post-merge check by a human and not a prediction by this script (rule 29b).
#
# MEH-2244 (chunk A) adds a THIRD check, on the body alone: it must carry, as a
# standalone line (whole line after trimming whitespace / CR), exactly one of
#
#     Closes MEH-<N>
#     Refs MEH-<N> (chunk <k>/<n>)
#
# Rule 29b measured the same PR text closing a card on one merge and leaving it
# untouched on the next, so the trailer is the only part of the close a reader
# can rely on — and a trailer that is not on its own line is not a trailer. A
# closing word inside parentheses, inside backticks, only in the TITLE, or a
# `Refs MEH-<N>` with no `(chunk k/n)` suffix all FAIL, and the failure prints
# the exact line(s) expected. `Refs MEH-<parent>` on one line plus
# `Closes MEH-<child>` on another satisfies it (the Closes line is the trailer).
#
# The rule-29 text scan is adjusted in ONE way for this: a whole-line
# `Refs MEH-<N> (chunk k/n)` is no longer reported as a bare identifier. The
# gate cannot require a line and flag it in the same run — the MEH-1949
# collision shape, one level down. A bare `Refs MEH-<N>` with no chunk suffix
# is still flagged exactly as before (fixture `bare-mention` pins that).
#
# Dependabot PRs are exempt from the closing-line check — no CC session authors
# them and they close no card. The author arrives as an optional FOURTH argument
# or the PR_AUTHOR env var (github.event.pull_request.user.login); the predicate
# mirrors scripts/checks/builder-model-guard.sh `is_exempt_bot_author`.
#
# Usage:
#   bash .claude/scripts/check-linear-mentions.sh <title-file> <body-file> [branch-name] [author-login]
#   PR_AUTHOR=<login> bash .claude/scripts/check-linear-mentions.sh <title-file> <body-file> [branch-name]
#   bash .claude/scripts/check-linear-mentions.sh --self-test
#
# The workflow writes github.event.pull_request.title / .body to two files and
# passes their paths, so no shell-quoting of untrusted PR text is ever needed.
# The branch name is passed as a plain string (github.event.pull_request.head.ref).
#
# Exit codes:
#   0 — clean (no bare mentions; a `Closes MEH-XXXX` is fine; body carries the line)
#   1 — one or more bare identifiers found (each listed with its source + line)
#   2 — invocation error (missing/unreadable input file, bad usage)
#   3 — the body has no standalone Closes / Refs-chunk line (MEH-2244). Takes
#       precedence over 1 when both apply — the bare mentions are still listed.
#       A DISTINCT code so a workflow can block on this rule alone while the
#       rule-29 text scan stays warn-only (`case $rc in 0|1) ;; *) exit 1`),
#       without a second script or a second invocation.
#
# The branch-consistency check emits ::warning:: and does NOT change the exit
# code. It is a warning by construction, not by timidity: a PR can legitimately
# be branched off a ticket without closing it (this repo does it deliberately —
# a batch sweep that advances a card without finishing it), and the remedy is
# for a human to decide whether to add the keyword or to reopen after merge.
# Failing the build on it would force one of those two into being automatic.
#
# The closing-line check DOES set a non-zero exit (3). It also prints a
# whole-word `WARNING` line so run-all-style surfacing (scripts/checks/run-all.sh
# WARN_TOKEN) shows it even where the caller swallows the exit code — which the live workflow job
# `Linear mention guard (rule 29, warn-only)` does: the step ends in `|| true`
# under `continue-on-error: true`. Whether that stays warn-only is the
# workflow's decision (docs/ci/meh-2244.patch.md), not this script's.
#
# Compatible with: GNU bash 4+, portable POSIX sed/grep ERE (no PCRE, no jq).
# Tested on Ubuntu CI and Git Bash for Windows.

set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
FIXTURES="$ROOT/.claude/scripts/test/fixtures/linear-mentions"

# Closing-keyword prefix, case-insensitive via bracket classes (portable ERE —
# no reliance on a `sed -i`/`grep -I` case flag). Optional colon, then whitespace.
CLOSING='([Cc][Ll][Oo][Ss][Ee][Ss]|[Ff][Ii][Xx][Ee][Ss]|[Rr][Ee][Ss][Oo][Ll][Vv][Ee][Ss]):?[[:space:]]+'

# MEH-2244 — the two standalone forms, anchored at BOTH ends so they match a
# whole (trimmed) line and nothing else. `(closes MEH-1)`, `` `Closes MEH-1` ``
# and `see Closes MEH-1 above` all fail the anchor; that is the entire check.
CLOSES_LINE="^${CLOSING}MEH-[0-9]+\$"
REFS_CHUNK_LINE='^[Rr][Ee][Ff][Ss]:?[[:space:]]+MEH-[0-9]+[[:space:]]+\([Cc][Hh][Uu][Nn][Kk][[:space:]]+[0-9]+/[0-9]+\)$'

# trim_line <string> — strip a trailing CR and leading/trailing whitespace.
trim_line() {
  local s="${1%$'\r'}"
  printf '%s' "$s" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

# is_exempt_bot_author <login> — MIRRORS scripts/checks/builder-model-guard.sh.
# Dependabot only. `github-actions[bot]` is deliberately NOT here — see that
# file's SCOPE note; widening an exemption is the rule-32 direction.
is_exempt_bot_author() {
  printf '%s' "${1:-}" | grep -qiE 'dependabot(\[bot\])?'
}

# scan_source <label> <file>
# Prints one ::warning:: line per bare identifier. Returns 1 if any found, else 0.
scan_source() {
  local label="$1" file="$2"
  local lineno=0 found=0 line stripped id
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    line="${line%$'\r'}"                       # tolerate CRLF (Windows / GitHub payload)
    # MEH-2244: a whole-line `Refs MEH-<N> (chunk k/n)` is the trailer the
    # closing-line check REQUIRES, so it cannot also be a bare mention here.
    # Whole-line only — `Refs MEH-<N>` without the suffix, or the same text
    # with anything else on the line, falls through and is flagged as before.
    if printf '%s' "$(trim_line "$line")" | grep -qE "$REFS_CHUNK_LINE"; then
      continue
    fi
    # Remove the allowed `Closes|Fixes|Resolves MEH-NNN` occurrences, then any
    # `MEH-NNN` still present on the line is a bare mention.
    stripped="$(printf '%s' "$line" | sed -E "s/${CLOSING}MEH-[0-9]+//g")"
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      printf '::warning::bare Linear identifier %s in %s line %s — use "Closes %s" only if this PR closes it, otherwise reference it as "PR #NNNN" or in prose (rule 29)\n' \
        "$id" "$label" "$lineno" "$id" >&2
      found=1
    done < <(printf '%s' "$stripped" | grep -oE 'MEH-[0-9]+' || true)
  done < "$file"
  return "$found"
}

# check_branch_consistency <branch-name> <body-file>
# INVERTED semantics vs scan_source — see the header. A `meh-<N>` in the branch
# MAY auto-close the ticket on merge with no keyword anywhere — measured firing
# 6 times and NOT firing once across 08-11/08 (workflow.md rule 29b). This check
# does not predict that; it asserts only that the branch and the body agree.
# Warn when the body does not declare `Closes MEH-<N>` for that same N.
# Always returns 0: warn-only by design.
check_branch_consistency() {
  local branch="$1" body_file="$2"
  local id num body

  # Dependabot branches are exempt — no CC session authors them, and
  # `dependabot/npm_and_yarn/...` can carry digits that are not ticket ids.
  case "$branch" in
    dependabot/*)
      return 0
      ;;
  esac

  # Read the body ONCE, before the loop. This used to sit inside it, re-reading
  # the file for every `meh-<N>` token in the branch name — CI reviewer, PR #2782.
  body="$(cat "$body_file" 2>/dev/null || true)"

  # Case-insensitive: branch names are lowercase by the MEH-1141 gate, but do
  # not depend on that here — a guard that only works on well-formed input is
  # not a guard.
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    num="${id##*-}"
    # The body is authoritative for the closing declaration. Match
    # `Closes|Fixes|Resolves MEH-<num>` with a trailing boundary so that
    # `Closes MEH-19` does not satisfy a branch carrying `meh-1949`.
    if printf '%s' "$body" | grep -qE "${CLOSING}MEH-${num}([^0-9]|$)"; then
      continue
    fi
    printf '::warning::branch name carries meh-%s but the body does not declare "Closes MEH-%s" — merging MAY close MEH-%s even though this PR never claimed to (measured 6 fires, 1 non-fire). Add the closing keyword, or check the ticket after merge and reopen if the DoD is unmet — then confirm the reopen held (rule 29b)\n' \
      "$num" "$num" "$num" >&2
  done < <(printf '%s' "$branch" | grep -oiE 'meh-[0-9]+' || true)

  return 0
}

# check_closing_line <body-file> [author-login]
# MEH-2244. Returns 0 when the body carries a standalone `Closes MEH-<N>` or
# `Refs MEH-<N> (chunk k/n)` line, or when the author is dependabot; returns 1
# otherwise, after printing a whole-word WARNING line (run-all surfacing) plus
# the exact lines expected. Reads the BODY ONLY — a closing word in the title
# is not a trailer, which is the `closes-in-title-only` fixture.
#
# The near-miss is reported by name when one is found, so the author learns
# *why* the line they wrote did not count, not just that none did.
check_closing_line() {
  local body_file="$1" author="${2:-}"
  local line trimmed near_miss=""

  if is_exempt_bot_author "$author"; then
    echo "check-linear-mentions: closing-line check SKIPPED — dependabot-authored PR (MEH-2244)"
    return 0
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    trimmed="$(trim_line "$line")"
    if printf '%s' "$trimmed" | grep -qE "$CLOSES_LINE" || printf '%s' "$trimmed" | grep -qE "$REFS_CHUNK_LINE"; then
      echo "check-linear-mentions: closing-line OK — body carries \"$trimmed\" as its own line (MEH-2244)"
      return 0
    fi
    # Diagnose the most common shapes that LOOK like a trailer and are not.
    # First match wins; only used for the message, never for the verdict.
    if [ -z "$near_miss" ]; then
      if printf '%s' "$trimmed" | grep -qE '^[Rr][Ee][Ff][Ss]:?[[:space:]]+MEH-[0-9]+$'; then
        near_miss="line \"$(printf '%s' "$trimmed" | head -c 80)\" — a Refs line needs the (chunk k/n) suffix; without it nothing says which chunk this is, and rule 29b measured bare Refs closing a card 2 times in 5"
      elif printf '%s' "$trimmed" | grep -qE "${CLOSING}MEH-[0-9]+"; then
        near_miss="line \"$(printf '%s' "$trimmed" | head -c 80)\" — the closing word is not on its own line (inside parentheses, backticks, or prose does not count)"
      fi
    fi
  done < "$body_file"

  printf '::warning::MEH-2244 WARNING — the PR body has no standalone closing/chunk line; the merge outcome is then whatever the branch slug does (rule 29b), with nothing in the text saying what was meant\n' >&2
  printf 'check-linear-mentions: expected exactly one of these as its own line in the PR BODY (not the title):\n' >&2
  printf '    Closes MEH-<N>\n' >&2
  printf '    Refs MEH-<N> (chunk <k>/<n>)\n' >&2
  if [ -n "$near_miss" ]; then
    printf 'check-linear-mentions: nearest miss: %s\n' "$near_miss" >&2
  fi
  return 1
}

run_self_test() {
  local rc=0 name title body expected got
  # MEH-1949: the branch-case loop's own locals (CI reviewer, PR #2782).
  local warns br fx
  # fixture -> expected exit code
  local -a cases=(
    "clean:0"
    "closes-only:0"
    "bare-mention:1"
    "mixed:1"
  )
  for c in "${cases[@]}"; do
    name="${c%:*}"; expected="${c##*:}"
    title="$FIXTURES/$name.title"
    body="$FIXTURES/$name.body"
    if [ ! -r "$title" ] || [ ! -r "$body" ]; then
      echo "SELF-TEST ERROR: fixture '$name' missing ($title / $body)" >&2
      return 2
    fi
    got=0
    scan_source "title" "$title" 2>/dev/null || got=1
    scan_source "body"  "$body"  2>/dev/null || got=1
    if [ "$got" -eq "$expected" ]; then
      echo "  PASS  $name (exit $got)"
    else
      echo "  FAIL  $name (expected $expected, got $got)" >&2
      rc=1
    fi
  done
  # ---- MEH-1949: branch-name consistency (INVERTED semantics — see header) ----
  # These assert on WARNING COUNT, not on exit code, because the branch check is
  # warn-only. Asserting the exit code here would pass identically whether the
  # check ran or not — a green with two possible causes is not a check.
  local -a branch_cases=(
    # branch|body-fixture|expected-warning-count
    "feature/meh-1379-guard|closes-only|0"
    "feature/meh-1949-branch-name-guard|closes-only|1"
    "feature/meh-1379-guard|clean|1"
    "dependabot/npm_and_yarn/next-15.5.0|clean|0"
    "docs/no-ticket-here|clean|0"
    "feature/meh-19-short|closes-only|1"
  )
  for c in "${branch_cases[@]}"; do
    IFS='|' read -r br fx expected <<<"$c"
    body="$FIXTURES/$fx.body"
    if [ ! -r "$body" ]; then
      echo "SELF-TEST ERROR: fixture body '$fx' missing ($body)" >&2
      return 2
    fi
    warns="$(check_branch_consistency "$br" "$body" 2>&1 >/dev/null | grep -c '::warning::' || true)"
    if [ "$warns" -eq "$expected" ]; then
      echo "  PASS  branch:$br vs $fx ($warns warning(s))"
    else
      echo "  FAIL  branch:$br vs $fx (expected $expected warning(s), got $warns)" >&2
      rc=1
    fi
  done

  # ---- MEH-2244: standalone closing / chunk line in the BODY ----
  # Asserted on the function's exit code, which IS the verdict here (unlike the
  # branch half, this check fails the run). Each fixture is named after the
  # input it covers, not the class — `closes-in-parens` cannot pretend to
  # cover `closes-in-title-only`.
  local -a closing_cases=(
    # fixture|author-login|expected-exit
    "valid-closes||0"
    "valid-refs-chunk||0"
    "valid-closes-with-parent-refs||0"
    "closes-in-title-only||1"
    "closes-in-parens||1"
    "refs-without-chunk||1"
    "dependabot|dependabot[bot]|0"
    # Same body WITHOUT the exemption must fail — otherwise the dependabot
    # row above is green for two reasons (exempt, or the body happens to
    # pass) and proves nothing about the predicate.
    "dependabot|levismadar80|1"
  )
  local author
  for c in "${closing_cases[@]}"; do
    IFS='|' read -r fx author expected <<<"$c"
    body="$FIXTURES/$fx.body"
    if [ ! -r "$body" ]; then
      echo "SELF-TEST ERROR: fixture body '$fx' missing ($body)" >&2
      return 2
    fi
    got=0
    check_closing_line "$body" "$author" >/dev/null 2>&1 || got=1
    if [ "$got" -eq "$expected" ]; then
      echo "  PASS  closing-line:$fx author='${author:-<none>}' (exit $got)"
    else
      echo "  FAIL  closing-line:$fx author='${author:-<none>}' (expected $expected, got $got)" >&2
      rc=1
    fi
  done

  # Inline controls — synthetic bodies that differ from a passing one by ONE
  # property, so a wrong verdict names the property. The negative control the
  # card asks for (`(closes MEH-1)` in parentheses) is the second row; the
  # first row is the same text with the parentheses removed, which is what
  # proves the parentheses — and not something else — carry the verdict.
  local -a inline_cases=(
    # description|expected-exit|body-text (\n = newline)
    "control: same line, no parentheses|0|Records the outcome.\ncloses MEH-1"
    "negative: (closes MEH-1) in parentheses|1|Records the outcome (closes MEH-1) of the batch."
    "negative: closing line inside backticks|1|Use \`Closes MEH-1\` when done."
    "negative: Refs with chunk but trailing prose|1|Refs MEH-1 (chunk 1/2) and more"
    "control: Refs chunk line with surrounding whitespace + CR|0|  Refs MEH-1 (chunk 2/2)  \r"
    "negative: empty body|1|"
  )
  local desc text tmp
  tmp="$(mktemp)"
  for c in "${inline_cases[@]}"; do
    IFS='|' read -r desc expected text <<<"$c"
    printf '%b' "$text" > "$tmp"
    got=0
    check_closing_line "$tmp" "" >/dev/null 2>&1 || got=1
    if [ "$got" -eq "$expected" ]; then
      echo "  PASS  closing-line inline — $desc (exit $got)"
    else
      echo "  FAIL  closing-line inline — $desc (expected $expected, got $got)" >&2
      rc=1
    fi
  done
  rm -f "$tmp"

  # The rule-29 scan must ACCEPT the required chunk line and still REJECT the
  # same identifier without the suffix. Two rows: dropping either one leaves
  # the other green for a reason unrelated to the change (testing.md, "a green
  # with two possible causes").
  local -a scan_cases=(
    # fixture|expected-scan-exit
    "valid-refs-chunk|0"
    "refs-without-chunk|1"
  )
  for c in "${scan_cases[@]}"; do
    IFS='|' read -r fx expected <<<"$c"
    got=0
    scan_source "body" "$FIXTURES/$fx.body" 2>/dev/null || got=1
    if [ "$got" -eq "$expected" ]; then
      echo "  PASS  rule-29 scan vs $fx (exit $got)"
    else
      echo "  FAIL  rule-29 scan vs $fx (expected $expected, got $got)" >&2
      rc=1
    fi
  done

  # ---- end-to-end: the REAL dispatch, exit code and all ----
  # Everything above exercises the functions in isolation, so the main flow's
  # own logic — the "exit 3 outranks exit 1 when both halves fail" precedence
  # at the bottom of this file — was untested (CI reviewer, PR #3367). Each row
  # re-invokes this script as a subprocess with real fixture files and asserts
  # the process exit code, which is the only thing CI ever reads.
  local -a e2e_cases=(
    # fixture|author-login|expected-process-exit
    "valid-closes||0"
    "valid-refs-chunk||0"
    # scan fails (two extra bare ids) AND the closing line passes -> 1 alone
    "mixed||1"
    # closing line missing, scan clean -> 3 alone
    "clean||3"
    # BOTH halves fail: bare `Refs MEH-N` trips the scan AND is not a
    # standalone form -> 3 must win over 1
    "refs-without-chunk||3"
    "dependabot|dependabot[bot]|0"
    "dependabot|levismadar80|3"
  )
  local self="${BASH_SOURCE[0]}"
  for c in "${e2e_cases[@]}"; do
    IFS='|' read -r fx author expected <<<"$c"
    title="$FIXTURES/$fx.title"
    body="$FIXTURES/$fx.body"
    if [ ! -r "$title" ] || [ ! -r "$body" ]; then
      echo "SELF-TEST ERROR: fixture '$fx' missing ($title / $body)" >&2
      return 2
    fi
    got=0
    bash "$self" "$title" "$body" "" "$author" >/dev/null 2>&1 || got=$?
    if [ "$got" -eq "$expected" ]; then
      echo "  PASS  end-to-end:$fx author='${author:-<none>}' (exit $got)"
    else
      echo "  FAIL  end-to-end:$fx author='${author:-<none>}' (expected $expected, got $got)" >&2
      rc=1
    fi
  done

  if [ "$rc" -eq 0 ]; then
    # Counts derived, never hardcoded — a literal here goes stale the moment
    # someone adds a case, and a stale claim in a passing message is worse
    # than no claim (CI reviewer, PR #2782).
    echo "self-test: all ${#cases[@]} text fixtures + ${#branch_cases[@]} branch cases + ${#closing_cases[@]} closing-line fixtures + ${#inline_cases[@]} closing-line inline controls + ${#scan_cases[@]} scan/chunk cases + ${#e2e_cases[@]} end-to-end cases passed"
  else
    echo "self-test: FAILURES above" >&2
  fi
  return "$rc"
}

# ---- dispatch ----
if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit $?
fi

TITLE_FILE="${1:-}"
BODY_FILE="${2:-}"
BRANCH_NAME="${3:-}"   # MEH-1949 — optional; absent means the branch half is skipped
PR_AUTHOR="${4:-${PR_AUTHOR:-}}"   # MEH-2244 — optional; 4th arg wins over the env var

if [ -z "$TITLE_FILE" ] || [ -z "$BODY_FILE" ]; then
  echo "usage: check-linear-mentions.sh <title-file> <body-file> [branch-name] [author-login] | --self-test" >&2
  exit 2
fi
for f in "$TITLE_FILE" "$BODY_FILE"; do
  if [ ! -r "$f" ]; then
    echo "::error::check-linear-mentions: input file not found or unreadable: $f" >&2
    exit 2
  fi
done

violation=0
scan_source "title" "$TITLE_FILE" || violation=1
scan_source "body"  "$BODY_FILE"  || violation=1

# MEH-1949 — branch half. Warn-only, so it never touches $violation.
if [ -n "$BRANCH_NAME" ]; then
  check_branch_consistency "$BRANCH_NAME" "$BODY_FILE"
fi

# MEH-2244 — closing-line half. Fails the run on its own (exit 3); tracked
# separately so the final line names which check failed and the exit code
# says which rule — see the header's exit-code table.
missing_line=0
check_closing_line "$BODY_FILE" "$PR_AUTHOR" || missing_line=1

if [ "$violation" -eq 0 ] && [ "$missing_line" -eq 0 ]; then
  echo "check-linear-mentions: OK — no bare Linear identifiers"
  exit 0
fi
if [ "$violation" -ne 0 ]; then
  echo "check-linear-mentions: bare Linear identifier(s) found — see warnings above (rule 29)" >&2
fi
if [ "$missing_line" -ne 0 ]; then
  echo "check-linear-mentions: no standalone Closes / Refs-chunk line in the PR body — see expected lines above (MEH-2244)" >&2
  exit 3
fi
exit 1
