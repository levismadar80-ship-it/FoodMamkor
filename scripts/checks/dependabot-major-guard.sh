#!/usr/bin/env bash
# dependabot-major-guard.sh — MEH-3726
#
# A dependabot PR that bumps a dependency across a MAJOR version may not land
# as a plain version bump. anthropic 0.107.1 → 2.10.0 (#5154) passed every
# test (all mocked) and would have turned every AI feature off in production:
# the 1.0 SDK rejected our http_client and the fail-open path swallowed it.
# Industry rule (GitHub docs, dependabot community): patch = merge, minor =
# review, major = a migration task.
#
# Fails when ALL of these hold:
#   - the PR head branch is dependabot/*
#   - the title is a single bump "bump <pkg> from <A> to <B>" and A → B is a
#     major step: the major number changed (0.107 → 2.10, 1.x → 2.x), or, in
#     0.x, the minor number changed (0.163 → 0.165) — semver treats 0.x minor
#     releases as breaking. 0.0.33 → 0.0.34 is not major.
#   - the PR has no `major-reviewed` label
#   - the diff touches nothing but dependency manifests/lockfiles — i.e. no
#     one has done migration work on the branch yet.
#
# Grouped dependabot PRs ("bump the X group …") are minor/patch by
# .github/dependabot.yml and are skipped. Non-dependabot PRs are skipped.
#
# Inputs (CI): GITHUB_EVENT_PATH (title, labels, head ref), GITHUB_BASE_REF.
# Test overrides: DEPMAJOR_HEAD, DEPMAJOR_TITLE, DEPMAJOR_LABELS, DEPMAJOR_FILES.
set -uo pipefail

MANIFEST_RE='(^|/)(uv\.lock|pyproject\.toml|requirements[^/]*\.txt|package\.json|package-lock\.json|\.github/workflows/[^/]+\.ya?ml)$'

# is_major A B → 0 when A → B is a major step (semver, 0.x minor counts).
is_major() {
  python3 - "$1" "$2" <<'PY'
import re, sys
def parts(v):
    nums = [int(x) for x in re.findall(r"\d+", v)[:3]]
    return nums + [0] * (3 - len(nums))
a, b = parts(sys.argv[1]), parts(sys.argv[2])
if a[0] != b[0]:
    sys.exit(0)
if a[0] == 0 and a[1] != b[1]:
    sys.exit(0)
sys.exit(1)
PY
}

event_field() {
  local ev="${GITHUB_EVENT_PATH:-}"
  [ -n "$ev" ] && [ -f "$ev" ] || return 1
  python3 - "$ev" "$1" <<'PY'
import json, sys
pr = (json.load(open(sys.argv[1])) or {}).get("pull_request") or {}
f = sys.argv[2]
if f == "title":
    print(pr.get("title") or "")
elif f == "head":
    print((pr.get("head") or {}).get("ref") or "")
elif f == "labels":
    print(",".join(l.get("name", "") for l in pr.get("labels") or []))
PY
}

changed_files() {
  if [ -n "${DEPMAJOR_FILES+x}" ]; then printf '%s\n' "$DEPMAJOR_FILES"; return 0; fi
  [ -n "${GITHUB_BASE_REF:-}" ] || return 1
  git fetch --no-tags --quiet --depth=100 origin "$GITHUB_BASE_REF" 2>/dev/null || true
  git diff --name-only "origin/$GITHUB_BASE_REF...HEAD" 2>/dev/null
}

check() {
  local head title labels files
  head="${DEPMAJOR_HEAD-$(event_field head)}" || head=""
  case "$head" in dependabot/*) ;; *) echo "dependabot-major-guard: not a dependabot PR — skip"; return 0 ;; esac
  title="${DEPMAJOR_TITLE-$(event_field title)}"
  labels="${DEPMAJOR_LABELS-$(event_field labels)}"

  local from to pkg
  read -r pkg from to < <(python3 - "$title" <<'PY'
import re, sys
t = sys.argv[1]
m = re.search(r"\bbump (?!the )(\S+) from v?(\S+) to v?(\S+)", t, re.I) or re.search(
    r"\bupdate (\S+) requirement from [<>=~^!]*v?(\S+) to [<>=~^!]*v?(\S+)", t, re.I)
print(" ".join(m.groups()) if m else "")
PY
)
  if [ -z "${to:-}" ]; then echo "dependabot-major-guard: grouped or unparsed title — skip"; return 0; fi
  if ! is_major "$from" "$to"; then echo "dependabot-major-guard: $pkg $from → $to is not a major step — ok"; return 0; fi
  case ",$labels," in *,major-reviewed,*) echo "dependabot-major-guard: $pkg $from → $to has major-reviewed — ok"; return 0 ;; esac

  files="$(changed_files)" || { echo "dependabot-major-guard: cannot read the diff — FAIL (a diff git cannot produce is never 'no change')"; return 1; }
  local migration
  migration="$(printf '%s\n' "$files" | grep -v -E "$MANIFEST_RE" | grep -v '^$' | head -n 1)"
  if [ -n "$migration" ]; then
    echo "dependabot-major-guard: $pkg $from → $to is major and the branch carries migration work ($migration …) — ok"
    return 0
  fi
  echo "dependabot-major-guard: $pkg $from → $to is a MAJOR bump with only manifest/lockfile changes."
  echo "  Read the package's migration guide, fix the code on this branch (tests that build the real client),"
  echo "  or add the 'major-reviewed' label after checking nothing in the code needs to change (MEH-3726)."
  return 1
}

self_test() {
  local status=0
  run_case() {  # name expect head title labels files
    local rc
    DEPMAJOR_HEAD="$3" DEPMAJOR_TITLE="$4" DEPMAJOR_LABELS="$5" DEPMAJOR_FILES="$6" check >/dev/null 2>&1; rc=$?
    if { [ "$2" = PASS ] && [ $rc -eq 0 ]; } || { [ "$2" = FAIL ] && [ $rc -ne 0 ]; }; then echo "  [ok] $1"
    else echo "  [XX] $1 (rc=$rc)"; status=1; fi
  }
  local lock=$'backend/uv.lock\nbackend/pyproject.toml' db="dependabot/pip/backend/staging/x"
  echo "dependabot-major-guard --self-test"
  # Anchored to the real case that motivated the guard (#5154's title).
  run_case "#5154 anthropic 0.107.1 → 2.10.0, lockfile only" FAIL "$db" "chore(deps): bump anthropic from 0.107.1 to 2.10.0 in /backend" "dependencies" "$lock"
  run_case "same, with migration work on the branch" PASS "$db" "chore(deps): bump anthropic from 0.107.1 to 2.10.0 in /backend" "dependencies" "$lock"$'\nbackend/app/routers/chat.py'
  run_case "same, with major-reviewed label" PASS "$db" "chore(deps): bump anthropic from 0.107.1 to 2.10.0 in /backend" "dependencies,major-reviewed" "$lock"
  run_case "1.x → 2.x lockfile only" FAIL "$db" "Bump foo from 1.9.0 to 2.0.0" "" "$lock"
  run_case "0.x minor (0.163.0 → 0.165.0) counts as major" FAIL "$db" "chore(deps): bump fastapi from 0.163.0 to 0.165.0" "" "$lock"
  run_case "0.0.x patch is minor-equal → ok" PASS "$db" "bump bar from 0.0.33 to 0.0.34" "" "$lock"
  run_case "2.0.55 → 2.1.9 minor" PASS "$db" "chore(deps): bump sqlalchemy from 2.0.55 to 2.1.9" "" "$lock"
  run_case "patch 2.53.2 → 2.53.3" PASS "$db" "bump resend from 2.53.2 to 2.53.3" "" "$lock"
  run_case "v-prefixed actions bump v3 → v4" FAIL "dependabot/github_actions/x" "chore(ci-deps): bump dorny/paths-filter from v3.0.4 to v4.0.3" "" ".github/workflows/pr-checks.yml"
  run_case "requirement title, minor (hypothesis 6.155.2 → 6.170.15)" PASS "$db" "chore(deps): update hypothesis requirement from >=6.155.2 to >=6.170.15 in /backend" "" "$lock"
  run_case "requirement title, major" FAIL "$db" "chore(deps): update httpx requirement from >=0.28.1 to >=1.0.0 in /backend" "" "$lock"
  run_case "grouped PR skipped" PASS "$db" "chore(deps): bump the pip-minor-patch group in /backend with 4 updates" "" "$lock"
  run_case "not a dependabot PR skipped" PASS "feature/meh-1-x" "bump anthropic from 0.107.1 to 2.10.0" "" "$lock"
  run_case "label as a substring does not count" FAIL "$db" "bump anthropic from 0.107.1 to 2.10.0" "not-major-reviewed" "$lock"
  # The real event reader: a pull_request payload on disk.
  local ev; ev="$(mktemp)"
  printf '%s' '{"pull_request":{"title":"chore(deps): bump anthropic from 0.107.1 to 2.10.0 in /backend","head":{"ref":"dependabot/pip/backend/staging/anthropic-2.10.0"},"labels":[{"name":"dependencies"}]}}' > "$ev"
  local rc
  GITHUB_EVENT_PATH="$ev" DEPMAJOR_FILES="$lock" check >/dev/null 2>&1; rc=$?
  rm -f "$ev"
  if [ $rc -ne 0 ]; then echo "  [ok] real event payload reader → FAIL on #5154"; else echo "  [XX] real event payload reader passed #5154"; status=1; fi
  return $status
}

case "${1:-}" in
  --self-test) self_test; exit $? ;;
esac

self_test >/dev/null || { echo "dependabot-major-guard: self-test failed — the guard itself is broken"; self_test; exit 1; }
if [ -z "${GITHUB_EVENT_PATH:-}" ] && [ -z "${DEPMAJOR_HEAD+x}" ]; then
  echo "dependabot-major-guard: not a pull-request context — skip"
  exit 0
fi
check
