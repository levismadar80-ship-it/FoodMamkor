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
#   branch name   — every `meh-<N>` IS an auto-link, and no closing keyword can
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
# the merge silently closes a ticket the PR never claimed to close — the branch
# auto-links with no keyword needed, and nothing in the PR text says so.
#
# This is the gap rule 29 leaves open. Rule 29 governs what the *text* says; the
# branch name closes tickets regardless of the text.
#
# Usage:
#   bash .claude/scripts/check-linear-mentions.sh <title-file> <body-file> [branch-name]
#   bash .claude/scripts/check-linear-mentions.sh --self-test
#
# The workflow writes github.event.pull_request.title / .body to two files and
# passes their paths, so no shell-quoting of untrusted PR text is ever needed.
# The branch name is passed as a plain string (github.event.pull_request.head.ref).
#
# Exit codes:
#   0 — clean (no bare mentions; a `Closes MEH-XXXX` is fine)
#   1 — one or more bare identifiers found (each listed with its source + line)
#   2 — invocation error (missing/unreadable input file, bad usage)
#
# The branch-consistency check emits ::warning:: and does NOT change the exit
# code. It is a warning by construction, not by timidity: a PR can legitimately
# be branched off a ticket without closing it (this repo does it deliberately —
# a batch sweep that advances a card without finishing it), and the remedy is
# for a human to decide whether to add the keyword or to reopen after merge.
# Failing the build on it would force one of those two into being automatic.
#
# Compatible with: GNU bash 4+, portable POSIX sed/grep ERE (no PCRE, no jq).
# Tested on Ubuntu CI and Git Bash for Windows.

set -u

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
FIXTURES="$ROOT/.claude/scripts/test/fixtures/linear-mentions"

# Closing-keyword prefix, case-insensitive via bracket classes (portable ERE —
# no reliance on a `sed -i`/`grep -I` case flag). Optional colon, then whitespace.
CLOSING='([Cc][Ll][Oo][Ss][Ee][Ss]|[Ff][Ii][Xx][Ee][Ss]|[Rr][Ee][Ss][Oo][Ll][Vv][Ee][Ss]):?[[:space:]]+'

# scan_source <label> <file>
# Prints one ::warning:: line per bare identifier. Returns 1 if any found, else 0.
scan_source() {
  local label="$1" file="$2"
  local lineno=0 found=0 line stripped id
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    line="${line%$'\r'}"                       # tolerate CRLF (Windows / GitHub payload)
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
# is an auto-link that will close the ticket on merge with no keyword anywhere.
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
    printf '::warning::branch name carries meh-%s but the body does not declare "Closes MEH-%s" — the branch auto-links, so merging will close MEH-%s even though this PR never claimed to. Add the closing keyword, or reopen the ticket immediately after merge (rule 29, branch half)\n' \
      "$num" "$num" "$num" >&2
  done < <(printf '%s' "$branch" | grep -oiE 'meh-[0-9]+' || true)

  return 0
}

run_self_test() {
  local rc=0 name title body expected got
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
  local warns
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

  if [ "$rc" -eq 0 ]; then
    echo "self-test: all 4 text fixtures + 6 branch cases passed"
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

if [ -z "$TITLE_FILE" ] || [ -z "$BODY_FILE" ]; then
  echo "usage: check-linear-mentions.sh <title-file> <body-file> [branch-name] | --self-test" >&2
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

if [ "$violation" -eq 0 ]; then
  echo "check-linear-mentions: OK — no bare Linear identifiers"
  exit 0
fi
echo "check-linear-mentions: bare Linear identifier(s) found — see warnings above (rule 29)" >&2
exit 1
