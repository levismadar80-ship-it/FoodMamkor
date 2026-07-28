#!/usr/bin/env bash
# write-deny-parity-guard.sh — MEH-1500 Phase B gate.
#
# WHAT: every `Edit(<path>)` entry in `.claude/settings.json`'s
#       permissions.deny must have a `Write(<path>)` counterpart.
#
# WHY: MEH-1500 Phase A established (by probe, 4 probes + 2 matched
#      same-directory controls) that `permissions.deny` DOES fire on Edit()
#      and that relative-path matching works — refuting both of the ticket's
#      original hypotheses. The real gap is narrower and worse: the deny list
#      is written almost entirely in terms of Edit(), so a path that is
#      protected from Edit() is NOT protected from Write(), which overwrites
#      the whole file. A protection that names one tool and not its strictly
#      more destructive sibling reads as coverage and isn't.
#
#      Phase B's fix is a `.claude/settings.json` edit, which CC cannot make
#      (that file denies itself — correctly). This guard is the gate on that
#      manual step. Without it the fix is another A2 hand-off, and A2 has
#      failed 0-for-2 (MEH-1720).
#
# HOW TO SATISFY: add the missing Write() entries. The guard prints them
#      paste-ready. A broader glob counts: `Write(.env*)` covers `Edit(.env)`.
#
# Discovered automatically by scripts/checks/run-all.sh (MEH-999) — no
# workflow edit, so no CC-deny surface touched.
#
# Self-test: bash scripts/checks/write-deny-parity-guard.sh --self-test
set -uo pipefail

REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# ---------------------------------------------------------------- the decision
# Pure: reads a settings.json path, prints findings, returns 0/1.
# Exercised directly by --self-test against synthetic files, so the tested
# logic and the live logic are the same code (MEH-1619).
check_settings() {
  local settings="$1"
  local label="${2:-$settings}"
  local rc=0

  # python3 absence must not be reported as a JSON problem — a wrong diagnosis
  # costs more debugging time than no diagnosis.
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  FAIL $label — python3 not on PATH; cannot parse settings. Fail-closed."
    return 1
  fi

  if [[ ! -f "$settings" ]]; then
    echo "  FAIL $label — no such file. Fail-closed: cannot verify parity."
    return 1
  fi

  # ONE python invocation that validates shape AND computes, so there is no
  # window where validity passed and computation silently died. Every shape
  # error exits non-zero with an ERR line; bash checks that status below.
  #
  # This replaced a two-call version where a valid-JSON-but-wrong-SHAPE file
  # (root is a list, permissions is a string, a non-string inside deny) passed
  # the validity call, threw AttributeError in the compute call, and left
  # $report empty — after which `[[ "" -gt 0 ]]` is FALSE in bash arithmetic
  # context and the guard printed "ok". Four of five malformed shapes reported
  # success, including one that hid a real Edit-without-Write gap. A guard
  # against silent failure that fails silently is worse than none.
  local report py_rc
  report="$(python3 - "$settings" 2>&1 <<'PY'
import json, sys

def die(msg):
    print("ERR\t" + msg)
    sys.exit(3)

try:
    doc = json.load(open(sys.argv[1]))
except Exception as exc:
    die("not valid JSON: %s" % exc)

if not isinstance(doc, dict):
    die("top level is %s, expected an object" % type(doc).__name__)
perms = doc.get("permissions", {})
if not isinstance(perms, dict):
    die("permissions is %s, expected an object" % type(perms).__name__)
deny = perms.get("deny", [])
if not isinstance(deny, list):
    die("permissions.deny is %s, expected a list" % type(deny).__name__)
nonstr = [i for i, e in enumerate(deny) if not isinstance(e, str)]
if nonstr:
    die("permissions.deny has non-string entries at index %s" % nonstr)

def entries(tool):
    p = tool + "("
    return [e[len(p):-1] for e in deny if e.startswith(p) and e.endswith(")")]

edits  = entries("Edit")
writes = entries("Write")
multis = entries("MultiEdit")

def covered_by(pat, pool):
    """Exact match, or a trailing-* pattern whose prefix this path starts with.
    Deliberately simple: it models the two glob shapes actually in this file
    (`.env*`, `.claude/hooks/**`) and nothing more. A guard that guesses at
    full glob subsumption would be a second, unverified matcher."""
    for w in pool:
        if w == pat:
            return w
        if w.endswith("*") and pat.startswith(w.rstrip("*")):
            return w
    return None

# Anti-vacuity: zero Edit entries means the parse shape drifted (key renamed,
# schema changed) and this guard would be trivially green forever — the exact
# silently-passing failure scripts/checks/README.md warns about.
if not edits:
    print("ZEROSCAN")
    sys.exit(0)

missing = [e for e in edits if covered_by(e, writes) is None]
mi_missing = [e for e in edits if covered_by(e, multis) is None]

for m in missing:
    print("MISS\t" + m)
print("COUNT\t%d\t%d" % (len(missing), len(edits)))
print("MULTI\t%d\t%d" % (len(mi_missing), len(edits)))
PY
)"
  py_rc=$?

  # Fail-closed on ANY non-zero exit or empty output. This is the check whose
  # absence produced the false green described above.
  if [[ $py_rc -ne 0 || -z "$report" ]]; then
    echo "  FAIL $label — could not parse settings (python exit $py_rc). Fail-closed."
    [[ -n "$report" ]] && sed 's/^/       /' <<<"$report"
    return 1
  fi

  # Belt-and-braces: the COUNT line is what every threshold below reads. If the
  # emit shape ever drifts, refuse rather than compare against empty strings.
  if ! grep -q '^COUNT' <<<"$report" && ! grep -q '^ZEROSCAN$' <<<"$report"; then
    echo "  FAIL $label — report carried no COUNT line; parse shape drifted. Fail-closed."
    return 1
  fi

  if grep -q '^ZEROSCAN$' <<<"$report"; then
    echo "  FAIL $label — parsed 0 Edit() deny entries."
    echo "       Either permissions.deny lost its Edit entries, or this guard's"
    echo "       parse shape has drifted. Failing loud rather than green."
    return 1
  fi

  local missing_count total multi_count
  missing_count="$(awk -F'\t' '/^COUNT/{print $2}' <<<"$report")"
  total="$(awk -F'\t' '/^COUNT/{print $3}' <<<"$report")"
  multi_count="$(awk -F'\t' '/^MULTI/{print $2}' <<<"$report")"

  if [[ "$missing_count" -gt 0 ]]; then
    echo "  FAIL $label — $missing_count of $total Edit() deny entries have no Write() counterpart."
    echo "       Write() overwrites the whole file, so these paths are denied to"
    echo "       the weaker tool and open to the stronger one."
    echo "       Add to permissions.deny in .claude/settings.json:"
    echo ""
    awk -F'\t' '/^MISS/{printf "      \"Write(%s)\",\n", $2}' <<<"$report"
    echo ""
    rc=1
  else
    echo "  ok   $label — all $total Edit() entries have Write() cover."
  fi

  # MultiEdit is REPORTED, not enforced. It is a separate policy decision
  # (does this harness expose MultiEdit to this repo's sessions?), and a guard
  # that silently widened the policy it was asked to enforce would be the same
  # over-reach class MEH-1708 filed as OVER-BROAD.
  if [[ "$multi_count" -gt 0 ]]; then
    echo "  warn $label — $multi_count of $total Edit() entries also lack a MultiEdit() counterpart."
    echo "       Not enforced here: whether MultiEdit needs the same cover is"
    echo "       Sapir's call, not this guard's. Reported so the number is known."
  fi

  return "$rc"
}

# ------------------------------------------------------------------ self-test
self_test() {
  local tmp rc=0 got
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  _mk() { printf '%s' "$2" > "$tmp/$1.json"; }
  _expect() { # name expected_rc description
    check_settings "$tmp/$1.json" "case:$1" >/dev/null 2>&1
    got=$?
    if [[ "$got" -eq "$2" ]]; then echo "  ok   $3 (exit $got)"
    else echo "  FAIL $3 — expected exit $2, got $got"; rc=1; fi
  }

  _mk exact '{"permissions":{"deny":["Edit(a.py)","Write(a.py)"]}}'
  _expect exact 0 "case 1 — exact Write cover"

  _mk gap '{"permissions":{"deny":["Edit(a.py)"]}}'
  _expect gap 1 "case 2 — Edit with no Write"

  _mk glob '{"permissions":{"deny":["Edit(.env.local)","Write(.env*)"]}}'
  _expect glob 0 "case 3 — trailing-* glob covers"

  _mk partial '{"permissions":{"deny":["Edit(a.py)","Write(a.py)","Edit(b.py)"]}}'
  _expect partial 1 "case 4 — one covered, one not"

  _mk zero '{"permissions":{"deny":["Bash(rm *)","Read(./.env)"]}}'
  _expect zero 1 "case 5 — zero Edit entries fails loud (anti-vacuity)"

  _mk broken '{"permissions":{"deny":[oops'
  _expect broken 1 "case 6 — malformed JSON fails closed"

  # The discrimination check (MEH-1619): a WRONG matcher — one that accepted
  # any Write() entry regardless of path — would pass case 2's shape if the
  # file merely contained some unrelated Write. Prove we reject that.
  _mk decoy '{"permissions":{"deny":["Edit(a.py)","Write(totally-unrelated.py)"]}}'
  _expect decoy 1 "case 7 — an unrelated Write() does NOT count as cover"

  # No _mk: the file is deliberately never created.
  _expect missing 1 "case 8 — absent settings.json fails closed"

  # Cases 9-12: VALID JSON, WRONG SHAPE. A distinct class from case 6, and the
  # one that used to fail OPEN. Case 6 (unparseable) passing is not evidence
  # that these do — that assumption is exactly what shipped the false green.
  _mk root_list '[]'
  _expect root_list 1 "case 9 — root is a list, not an object"

  _mk root_string '"just-a-string"'
  _expect root_string 1 "case 10 — root is a bare string"

  _mk perms_string '{"permissions":"not-an-object"}'
  _expect perms_string 1 "case 11 — permissions is a string"

  # The nastiest: a real Edit-without-Write gap alongside a stray non-string.
  # Pre-fix this printed "ok" and hid the gap.
  _mk deny_nonstring '{"permissions":{"deny":["Edit(a.py)",42]}}'
  _expect deny_nonstring 1 "case 12 — non-string inside deny (hid a real gap)"

  return "$rc"
}

# ----------------------------------------------------------------------- main
if [[ "${1:-}" == "--self-test" ]]; then
  echo "write-deny-parity-guard --self-test"
  if self_test; then
    echo "write-deny-parity-guard: self-test OK"; exit 0
  else
    echo "write-deny-parity-guard: SELF-TEST FAILED"; exit 1
  fi
fi

echo "write-deny-parity-guard (MEH-1500 Phase B)"
if check_settings "$REPO_ROOT/.claude/settings.json" ".claude/settings.json"; then
  echo "write-deny-parity-guard: OK"
  exit 0
else
  echo ""
  echo "write-deny-parity-guard: FAILED — see above."
  echo "This guard gates a manual .claude/settings.json edit that CC cannot make"
  echo "(the file denies itself). Sapir applies the block; the guard goes green."
  exit 1
fi
