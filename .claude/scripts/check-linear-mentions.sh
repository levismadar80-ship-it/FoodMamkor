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
# Usage:
#   bash .claude/scripts/check-linear-mentions.sh <title-file> <body-file>
#   bash .claude/scripts/check-linear-mentions.sh --self-test
#
# The workflow writes github.event.pull_request.title / .body to two files and
# passes their paths, so no shell-quoting of untrusted PR text is ever needed.
#
# Exit codes:
#   0 — clean (no bare mentions; a `Closes MEH-XXXX` is fine)
#   1 — one or more bare identifiers found (each listed with its source + line)
#   2 — invocation error (missing/unreadable input file, bad usage)
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
  if [ "$rc" -eq 0 ]; then
    echo "self-test: all 4 fixtures passed"
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

if [ -z "$TITLE_FILE" ] || [ -z "$BODY_FILE" ]; then
  echo "usage: check-linear-mentions.sh <title-file> <body-file> | --self-test" >&2
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

if [ "$violation" -eq 0 ]; then
  echo "check-linear-mentions: OK — no bare Linear identifiers"
  exit 0
fi
echo "check-linear-mentions: bare Linear identifier(s) found — see warnings above (rule 29)" >&2
exit 1
