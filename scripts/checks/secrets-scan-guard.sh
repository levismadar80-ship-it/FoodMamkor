#!/usr/bin/env bash
# Module:   secrets-scan-guard.sh
# Purpose:  Refuse a diff that introduces a credential. Catches the class at
#           commit time instead of by accident during an unrelated sweep.
# Does NOT: scan history, and cannot. A secret already committed is not
#           removed by deleting the line — see the MEH-1997 note below.
# History:  MEH-1997 (creation) — a committed admin email + password was found
#           in `frontend/e2e/screenshots.spec.ts` while sweeping for something
#           else entirely. Nothing would have caught it; nothing was looking.
#
# SCOPE: the DIFF, not the tree. Deliberate, and the reason matters.
#
#   Scanning the whole tree would fire on every run until the MEH-1997
#   credential is rotated and removed — a permanently-red guard that everyone
#   learns to ignore, which is worse than no guard. Scanning the diff means it
#   is green today and fires the moment someone adds a NEW secret. The existing
#   one is tracked on its own card, where a human decision (rotation) belongs.
#
# WHAT IT CANNOT DO, stated so nobody mistakes green for clean:
#   - it does not scan git history; a rotated-but-still-committed secret is
#     invisible to it and stays that way
#   - it is regex, so it catches shapes, not semantics. A high-entropy string
#     that looks like nothing in particular passes.
#   Neither is a reason to skip it: the common case is a plausible-looking
#   password or token pasted into a test or a script, and that shape is exactly
#   what a regex catches.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 1

# TWO tiers, and the split is load-bearing.
#
# HIGH_CONFIDENCE: provider-issued prefixes. These are never false positives —
# nothing legitimately contains a live `ghp_`+36 or an `AKIA`+16 — so the
# placeholder allowlist must NOT apply to them. The self-test caught exactly
# this: AWS's own doc key `AKIAIOSFODNN7EXAMPLE` (guard-ok: documentation)
# contains the word
# "EXAMPLE", so an allowlist checked first swallowed a textbook AWS key id.
HIGH_CONFIDENCE=(
  'AKIA[0-9A-Z]{16}'
  'sk-(proj-)?[A-Za-z0-9_-]{20,}'   # incl. sk-proj-*: a hyphen breaks a bare alnum run
  'sk_live_[A-Za-z0-9]{16,}'
  'ghp_[A-Za-z0-9]{36}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'BEGIN [A-Z ]*PRIVATE KEY'
)

# HEURISTIC: an assignment of a literal to a credential-shaped name. Anchored
# on `=`/`:` so prose mentioning "password" does not fire. The allowlist DOES
# apply here, because this tier's whole job is guessing.
HEURISTIC=(
  '(password|passwd|pwd)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{6,}["'"'"']'
  '(secret|api[_-]?key|apikey|token)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_-]{16,}["'"'"']'
  # THE SHAPE THIS REPO ACTUALLY USES, and the reason MEH-1909 is a rule.
  # The credential that motivated this guard is `await pwd.fill("...")` in
  # frontend/e2e/screenshots.spec.ts — a method call, NOT an assignment. Every
  # pattern above anchors on `=` or `:`, so the first version of this guard
  # WOULD NOT HAVE CAUGHT THE SECRET IT WAS WRITTEN FOR. Found only by checking
  # the classifier against the real file instead of against invented fixtures.
  '(pwd|pass|password|passwd|secret|token)[a-z_]*\.(fill|type|sendKeys|setValue)\([[:space:]]*["'"'"'][^"'"'"']{6,}["'"'"']'
  # A literal address typed into a form is the other half of a login pair.
  '\.(fill|type|sendKeys)\([[:space:]]*["'"'"'][A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}["'"'"']'
)

# Placeholders and env reads are not secrets. Kept tight on purpose: a broad
# allowlist is how a scanner quietly stops scanning.
ALLOW='(process\.env|os\.environ|getenv|<[A-Za-z_]+>|\$\{|xxx+|your[_-]|example|placeholder|dummy|changeme|REDACTED|\*{4,})'

# Returns 0 when the line looks like a credential. The ONE classifier — the
# self-test exercises this same function, never a second copy, because a copy
# is free to drift from the one that matters.
#
# `grep -- "$p"` is required: a pattern starting with `-` is otherwise parsed
# as an option. The PEM pattern used to begin with dashes and grep rejected the
# whole invocation, which the self-test surfaced as noise rather than a miss.
looks_like_secret() {
  local line="$1" p
  for p in "${HIGH_CONFIDENCE[@]}"; do
    echo "$line" | grep -qiE -- "$p" && return 0
  done
  echo "$line" | grep -qiE -- "$ALLOW" && return 1
  for p in "${HEURISTIC[@]}"; do
    echo "$line" | grep -qiE -- "$p" && return 0
  done
  return 1
}

if [ "${1:-}" = "--self-test" ]; then
  # Known answers. Includes NEGATIVE controls: if the classifier stops
  # discriminating and calls everything a secret, these fail it.
  fail=0
  must_flag=(
    'password = "hunter2hunter2"' # guard-ok: self-test fixture, not a live credential
    'API_KEY: "abcdefghijklmnop1234"' # guard-ok: self-test fixture, not a live credential
    'aws = "AKIAIOSFODNN7EXAMPLE"' # guard-ok: self-test fixture, not a live credential
    'token="ghp_012345678901234567890123456789012345"' # guard-ok: self-test fixture, not a live credential
    # REAL-CORPUS ANCHOR (MEH-1909). Structure lifted verbatim from
    # frontend/e2e/screenshots.spec.ts:176 — the credential that motivated this
    # guard. Only the VALUE is substituted; the surrounding form is the repo's.
    # This case FAILED against the first version of this guard, which is how
    # the missing method-call pattern was found. Do not delete it if that file
    # is later cleaned: re-anchor it to another real occurrence instead. A
    # synthetic-only suite proves the probe works on shapes I invented.
    'await pwd.fill("s0me-real-looking-pw");' # guard-ok: self-test fixture, not a live credential
    'await email.fill("admin@somedomain.co.il");' # guard-ok: self-test fixture, not a live credential
  )
  must_pass=(
    'password = os.environ["DEMO_ADMIN_PASSWORD"]'
    'password: "changeme"'
    'const token = process.env.GITHUB_TOKEN'
    '# rotate the password before deleting the line'
    'PASSWORD_MIN_LENGTH = 12'
    # Real negative controls: lines that genuinely appear in this repo and must
    # never fire. Both are from screenshots.spec.ts, near the positive anchor.
    "const pwd = page.locator(\"input[type=password]\").first();"
    'await pwd.fill(process.env.E2E_ADMIN_PASSWORD);'
  )
  for l in "${must_flag[@]}"; do
    looks_like_secret "$l" || { echo "SELF-TEST: missed -> $l"; fail=1; }
  done
  for l in "${must_pass[@]}"; do
    looks_like_secret "$l" && { echo "SELF-TEST: false positive -> $l"; fail=1; }
  done
  # Counted from the arrays, never hardcoded — a literal drifts silently the
  # first time a case is added, which is a small lie in the one line a reader
  # uses to judge coverage.
  [ "$fail" -eq 0 ] && echo "secrets-scan self-test OK — ${#must_flag[@]} positives, ${#must_pass[@]} negative controls"
  exit "$fail"
fi

# RUN THE SELF-TEST FIRST, ON EVERY INVOCATION.
#
# testing.md: "Where the assertion is a classifier, ship the self-test. Run it
# FIRST — if the classifier can't tell a correct state from a broken one,
# nothing it reports afterwards is worth reading."
#
# This is also what wires it into CI without touching .github/workflows (CC-deny,
# MEH-671): run-all.sh already runs this guard under the required Repo guards
# job, so a broken classifier now reds that job instead of quietly passing
# everything. The CI reviewer flagged the flag-nobody-calls version on #2754.
if ! "$0" --self-test >/dev/null 2>&1; then
  echo "secrets-scan: FAIL — the classifier's own self-test does not pass."
  echo "  Not scanning: a classifier that cannot sort known inputs cannot be"
  echo "  trusted to report on unknown ones. Run --self-test to see which case."
  exit 1
fi

# The diff is computed only AFTER the self-test gate above. Ordering bug found
# in this file's own first version: the "no added lines" early-exit sat above
# the `--self-test` branch, so on a branch with no diff the self-test printed
# "no added lines" and exited 0 WITHOUT RUNNING. A self-test that can silently
# not run is the same defect class it exists to catch.
BASE="${GUARD_DIFF_BASE:-origin/staging}"
git rev-parse --verify --quiet "$BASE" >/dev/null 2>&1 || BASE="HEAD~1"
git rev-parse --verify --quiet "$BASE" >/dev/null 2>&1 || {
  # WARNING: prefix is load-bearing — run-all.sh keys its WARN token on it.
  echo "WARNING: secrets-scan — no usable diff base; ZERO lines scanned."
  exit 0
}

# Is `guard-ok:` on line N of FILE, or on N-1 / N+1?
# REUSES: scripts/checks/ui-pattern-guard.sh:65 — README.md names it the
# reference implementation; every guard honours the same marker so contributors
# learn one idiom rather than one per guard.
suppressed() {
  local file="$1" line="$2" from to
  from=$(( line > 1 ? line - 1 : 1 ))
  to=$(( line + 1 ))
  sed -n "${from},${to}p" "$file" 2>/dev/null | grep -q 'guard-ok:'
}

# Walk the diff tracking `+++ b/<path>` and the `@@ … +N @@` hunk header so a
# finding names file:line. README.md line 23 makes that a hard requirement, not
# a nicety: a FAIL saying "a secret was found" without saying WHERE forces the
# reader to re-derive the diff by hand. CI reviewer, #2754.
hits=0
file=""
lineno=0

while IFS= read -r raw; do
  case "$raw" in
    '+++ b/'*) file="${raw#+++ b/}" ;;
    '+++ '*|'--- '*|'diff '*|'index '*|'new file'*|'deleted file'*) : ;;
    '@@'*)
      newpart="${raw#*+}"
      lineno="${newpart%%[, ]*}"
      ;;
    '+'*)
      line="${raw#+}"
      if looks_like_secret "$line"; then
        if suppressed "$file" "$lineno"; then
          echo "  suppressed $file:$lineno — guard-ok: present"
        else
          safe="$(echo "$line" \
            | sed -E 's/(["'"'"'])[^"'"'"']{4,}(["'"'"'])/\1***\2/g' \
            | sed -E 's/[A-Za-z0-9_+\/-]{16,}/***/g')"
          echo "  VIOLATION $file:$lineno"
          echo "      possible secret: $(echo "$safe" | cut -c1-80)"
          hits=$(( hits + 1 ))
        fi
      fi
      lineno=$(( lineno + 1 ))
      ;;
    '-'*) : ;;
    *) lineno=$(( lineno + 1 )) ;;
  esac
done < <(git diff "$BASE"...HEAD --unified=1 -- .)

if [ "$hits" -gt 0 ]; then
  echo "secrets-scan: FAIL — $hits added line(s) look like a credential."
  echo "  If it is real: do not just delete the line. Rotate first — the value"
  echo "  is in git history the moment it is pushed. Read an env var instead."
  echo "  If it is a false positive: make the placeholder obvious (example/"
  echo "  changeme/<token>), which is also better for the next reader."
  exit 1
fi

echo "secrets-scan: OK — no credential-shaped additions"
exit 0
