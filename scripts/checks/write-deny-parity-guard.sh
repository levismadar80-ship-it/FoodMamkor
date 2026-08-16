#!/usr/bin/env bash
# write-deny-parity-guard.sh — MEH-1500 Phase B gate.
#
# WHAT: every `Edit(<path>)` entry in `.claude/settings.json`'s
#       permissions.deny must have BOTH a `Write(<path>)` and a
#       `MultiEdit(<path>)` counterpart. All three tools overwrite content;
#       denying one and allowing the others is a gap, not a policy.
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
# HOW TO SATISFY: add the missing Write()/MultiEdit() entries. The guard prints
#      them paste-ready. A broader glob counts: `Write(.env*)` covers `Edit(.env)`.
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

# A deny entry that LOOKS tool-scoped but does not parse is silently dropped by
# entries() below — and a dropped Edit() entry silently loses its cover
# requirement while the guard reports "ok". Measured 28/07: with several valid
# entries present, `Edit(secret.py) ` (trailing space), `edit(secret.py)`
# (lowercase) and `Edit(secret.py` (unclosed) each exited 0 saying "all 2 Edit()
# entries have cover", leaving secret.py unprotected and unmentioned. The
# ZEROSCAN check does not catch it: 16 entries minus one typo is 15, not 0.
#
# This is reachable by the exact action this guard gates — a human hand-pasting
# 28 lines into settings.json. So malformed entries are a hard failure, not a
# skip.
import re

_WELL_FORMED = re.compile(r'^([A-Za-z]+)\((.*)\)$')
_CASE_SENSITIVE = {"Edit", "Write", "MultiEdit"}
_LOWER = {t.lower(): t for t in _CASE_SENSITIVE}

malformed = []
for e in deny:
    m = _WELL_FORMED.match(e)
    if not m:
        # Looks like it was meant to be tool-scoped (has a paren) but isn't.
        if "(" in e or ")" in e:
            malformed.append((e, "not of the form Tool(path)"))
        continue
    tool = m.group(1)
    # A casing typo on the three tools THIS guard reasons about would otherwise
    # read as an unknown-but-valid tool and be ignored.
    if tool not in _CASE_SENSITIVE and tool.lower() in _LOWER:
        malformed.append((e, "wrong case — did you mean %s(...)?" % _LOWER[tool.lower()]))

if malformed:
    for e, why in malformed:
        print("BAD\t%s\t%s" % (e, why))
    print("BADCOUNT\t%d" % len(malformed))
    sys.exit(0)   # bash turns this into a hard failure; see the BADCOUNT branch


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

missing_w = [e for e in edits if covered_by(e, writes) is None]
missing_m = [e for e in edits if covered_by(e, multis) is None]

for m in missing_w:
    print("MISSW\t" + m)
for m in missing_m:
    print("MISSM\t" + m)
print("COUNT\t%d\t%d\t%d" % (len(missing_w), len(missing_m), len(edits)))
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

  # ORDER MATTERS: malformed entries are checked FIRST. A BAD report carries no
  # COUNT line, so the drift check below would fire on it and print
  # "parse shape drifted" — a true statement about the wrong thing, sending the
  # reader to this script when the fault is in their settings.json edit.
  #
  # Malformed entries fail before parity because a dropped entry makes the
  # parity numbers a lie rather than merely incomplete.
  if grep -q '^BADCOUNT' <<<"$report"; then
    local bad_n
    bad_n="$(awk -F'\t' '/^BADCOUNT/{print $2}' <<<"$report")"
    echo "  FAIL $label — $bad_n deny entr(y/ies) look tool-scoped but do not parse."
    echo "       A malformed entry is SILENTLY DROPPED: an Edit() that does not"
    echo "       parse loses its cover requirement and this guard would report ok."
    echo ""
    awk -F'\t' '/^BAD\t/{printf "      %s\n          ^ %s\n", $2, $3}' <<<"$report"
    echo ""
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

  local miss_w miss_m total
  miss_w="$(awk -F'\t' '/^COUNT/{print $2}' <<<"$report")"
  miss_m="$(awk -F'\t' '/^COUNT/{print $3}' <<<"$report")"
  total="$(awk -F'\t' '/^COUNT/{print $4}' <<<"$report")"

  # Both tools are ENFORCED as of the 28/07 decision. MultiEdit was previously
  # reported-not-enforced, deliberately, to avoid widening policy unasked
  # (the OVER-BROAD shape MEH-1708 filed). Sapir settled it on the repo's own
  # convention: 6 of the 7 write-class PreToolUse matchers in settings.json are
  # `Edit|Write|MultiEdit`, so this repo already treats the three as one class.
  # Denying Edit(x) while allowing MultiEdit(x) is a gap, not a policy.
  #
  # (The 7th matcher is `Edit|Write|NotebookEdit`. NotebookEdit is NOT enforced
  # here and that is not an oversight: it edits .ipynb, and none of the
  # protected paths is a notebook, so cover would be vacuous. Revisit only if a
  # notebook ever joins the protected set.)
  if [[ "$miss_w" -gt 0 || "$miss_m" -gt 0 ]]; then
    echo "  FAIL $label — protected paths are denied to Edit() but open to a stronger tool."
    echo "       Write() and MultiEdit() both overwrite content Edit() is denied."
    echo "       Missing: $miss_w Write(), $miss_m MultiEdit(), of $total Edit() entries."
    echo "       Add to permissions.deny in .claude/settings.json:"
    echo ""
    awk -F'\t' '/^MISSW/{printf "      \"Write(%s)\",\n", $2}' <<<"$report"
    awk -F'\t' '/^MISSM/{printf "      \"MultiEdit(%s)\",\n", $2}' <<<"$report"
    echo ""
    rc=1
  else
    echo "  ok   $label — all $total Edit() entries have Write() and MultiEdit() cover."
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

  _mk exact '{"permissions":{"deny":["Edit(a.py)","Write(a.py)","MultiEdit(a.py)"]}}'
  _expect exact 0 "case 1 — full cover (Write + MultiEdit)"

  _mk gap '{"permissions":{"deny":["Edit(a.py)"]}}'
  _expect gap 1 "case 2 — Edit with neither counterpart"

  _mk glob '{"permissions":{"deny":["Edit(.env.local)","Write(.env*)","MultiEdit(.env*)"]}}'
  _expect glob 0 "case 3 — trailing-* glob covers both"

  _mk partial '{"permissions":{"deny":["Edit(a.py)","Write(a.py)","MultiEdit(a.py)","Edit(b.py)"]}}'
  _expect partial 1 "case 4 — one covered, one not"

  # THE DISCRIMINATING CASE for the 28/07 decision. Under the previous
  # warn-only behaviour this exact input exited 0 with a warn line. If this
  # ever goes green again, MultiEdit enforcement has silently regressed.
  _mk write_only '{"permissions":{"deny":["Edit(a.py)","Write(a.py)"]}}'
  _expect write_only 1 "case 4b — Write cover but NO MultiEdit (was exit 0 pre-decision)"

  _mk multi_only '{"permissions":{"deny":["Edit(a.py)","MultiEdit(a.py)"]}}'
  _expect multi_only 1 "case 4c — MultiEdit cover but no Write"

  _mk zero '{"permissions":{"deny":["Bash(rm *)","Read(./.env)"]}}'
  _expect zero 1 "case 5 — zero Edit entries fails loud (anti-vacuity)"

  _mk broken '{"permissions":{"deny":[oops'
  _expect broken 1 "case 6 — malformed JSON fails closed"

  # The discrimination check (MEH-1619): a WRONG matcher — one that accepted
  # any Write() entry regardless of path — would pass case 2's shape if the
  # file merely contained some unrelated Write. Prove we reject that.
  _mk decoy '{"permissions":{"deny":["Edit(a.py)","Write(totally-unrelated.py)","MultiEdit(totally-unrelated.py)"]}}'
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

  # Cases 13-16: MALFORMED tool-scoped entries alongside VALID ones.
  # The suite passed 14/14 while this whole class was live, because every
  # earlier case had a single Edit entry — so a typo dropped the count to zero
  # and ZEROSCAN caught it by luck. The real file has 16; one typo leaves 15
  # and ZEROSCAN never fires. Each case below carries two well-covered entries
  # plus one typo'd entry whose cover requirement would silently vanish.
  local VALID='"Edit(a.py)","Write(a.py)","MultiEdit(a.py)","Edit(b.py)","Write(b.py)","MultiEdit(b.py)"'

  _mk t_trailspace "{\"permissions\":{\"deny\":[$VALID,\"Edit(secret.py) \"]}}"
  _expect t_trailspace 1 "case 13 — trailing space after Edit(...)"

  _mk t_lowercase "{\"permissions\":{\"deny\":[$VALID,\"edit(secret.py)\"]}}"
  _expect t_lowercase 1 "case 14 — lowercase edit( instead of Edit("

  _mk t_unclosed "{\"permissions\":{\"deny\":[$VALID,\"Edit(secret.py\"]}}"
  _expect t_unclosed 1 "case 15 — missing closing paren"

  # Control for 13-15: identical file, entry spelled correctly. Must ALSO fail,
  # but for the parity reason. If this ever passed, the three above would be
  # failing for the wrong cause and would prove nothing.
  _mk t_control "{\"permissions\":{\"deny\":[$VALID,\"Edit(secret.py)\"]}}"
  _expect t_control 1 "case 16 — control: correct spelling, genuine parity gap"

  # And the anti-false-positive: a fully-covered file with NO typos must pass.
  # Without this, cases 13-16 could be satisfied by a guard that reds everything.
  _mk t_clean "{\"permissions\":{\"deny\":[$VALID]}}"
  _expect t_clean 0 "case 17 — well-formed and fully covered still passes"

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
