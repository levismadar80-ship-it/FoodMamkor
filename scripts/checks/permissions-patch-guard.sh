#!/usr/bin/env bash
# permissions-patch-guard.sh — MEH-1779 hand-off gate.
#
# WHAT: asserts the three guardrail changes staged in
#       docs/guardrails/meh-1779-permissions.patch.md have actually been
#       applied to .claude/settings.json and .claude/hooks/**.
#
#         1. frontend/eslint.config.mjs reaches an ASK decision instead of a
#            block in protect-lint-config.sh  (unblocks MEH-1767)
#         2. .github/workflows/** is denied for Edit + Write + MultiEdit
#         3. five documentation hosts are allowlisted for WebFetch
#
# WHY A GUARD AND NOT A DOC: CC cannot make these edits — .claude/settings.json
#       and .claude/hooks/** deny themselves, correctly (workflow.md rule 32).
#       So they are a hand-off, and this repo already knows how that goes:
#       write-deny-parity-guard.sh:19-22 records the identical wall on MEH-1500
#       Phase B and that the route has failed 0-for-2 (MEH-1720). MEH-1500's
#       answer was not a better-written doc, it was a guard that stays visible
#       until the manual step happens. This is that guard, for MEH-1779.
#
# OUTCOME-BASED WHERE IT CAN BE. Checks 1 and 3 do not grep the hooks — they
#       RUN them with synthetic payloads and read the exit code, because
#       MEH-1779's own principle is that the test must be outcome-based: an
#       `overrides` block containing "off" is textually an addition and
#       semantically a removal, so text cannot tell you what a guard does.
#       Both carry a NEGATIVE CONTROL, which is the half that actually
#       discriminates: a hook that has been globally weakened would satisfy the
#       positive assertion alone and fail the control.
#       Check 2 is textual — a script cannot invoke the permission layer to
#       observe a deny — and is the weaker of the three. Stated, not hidden.
#
# WARN-ONLY, WITH A DATE THAT ENDS IT
#       Arming this as a hard failure today would red every PR until Sapir
#       applies a hand-paste, which is punishing the wrong party for the wrong
#       thing. It therefore WARNS until ENFORCE_FROM and fails on/after it.
#       The date is checked by the script itself: an expiry a human has to
#       remember is a promise, and this repo has the empty MEH-487 calibration
#       tally to show for that class.
#
# USAGE
#   bash scripts/checks/permissions-patch-guard.sh
#   bash scripts/checks/permissions-patch-guard.sh --self-test
#     — feeds the classifier applied / unapplied / over-permissive fixtures and
#       asserts how it sorts them. Run this FIRST: if the guard cannot tell a
#       correct state from a broken one, nothing it reports afterwards is worth
#       reading (.claude/rules/testing.md, MEH-1619).
#   MEH1779_GUARD_ENFORCE=1 bash scripts/checks/permissions-patch-guard.sh
#     — forces post-expiry behaviour, so the blocking arm can be demonstrated
#       before the date arrives. Not a production switch; nothing in CI sets it.
#
set -uo pipefail

# ---------------------------------------------------------------------------
# The date the warn-only window closes. 2026-08-07.
#
# WHY THIS DATE: unlike MEH-1668's, this hand-off has no propagation delay to
# absorb — it is three paste-in edits to two files, doable in one sitting. A
# week is the review latency, not the work. It is also deliberately SHORT
# because MEH-1767 is blocked behind item 1: every day of warn-only window is a
# day that ticket cannot start.
# ---------------------------------------------------------------------------
ENFORCE_FROM="2026-08-07"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164): an unguarded cd that fails leaves the
# guard reading the wrong repo and exiting 0 — a silently-passing check.
cd "$REPO_ROOT" || exit 1

# Overridable so --self-test can point the same code at fixtures. Production
# runs never set these.
PLC_HOOK="${MEH1779_PLC_HOOK:-.claude/hooks/protect-lint-config.sh}"
WFA_HOOK="${MEH1779_WFA_HOOK:-.claude/hooks/check-webfetch-allowlist.sh}"
SETTINGS="${MEH1779_SETTINGS:-.claude/settings.json}"

DOC_HOSTS=(
  developers.google.com
  docs.claude.com
  cloudinary.com
  w3.org
  developer.mozilla.org
)

problems=0
report() {
  echo "  $([ "${enforcing:-0}" -eq 1 ] && echo VIOLATION || echo WARNING) $1"
  shift
  for line in "$@"; do echo "      $line"; done
  problems=$(( problems + 1 ))
}

# --- helpers ---------------------------------------------------------------

# edit_payload PATH — a minimal PreToolUse Edit envelope for one file.
edit_payload() {
  printf '{"tool_name":"Edit","tool_input":{"file_path":"%s","old_string":"a","new_string":"b"}}' "$1"
}

# hook_exit HOOK PAYLOAD — run a hook, return its exit code, discard output.
hook_exit() {
  printf '%s' "$2" | bash "$1" >/dev/null 2>&1
  echo $?
}

# fetch_exit HOOK HOST
fetch_exit() {
  printf '{"tool_input":{"url":"https://%s/some/path"}}' "$2" \
    | bash "$1" >/dev/null 2>&1
  echo $?
}

# --- check 1: eslint.config.mjs reaches ask, and the hook still blocks ------
check_ask_mode() {
  if [ ! -r "$PLC_HOOK" ]; then
    report "$PLC_HOOK: not readable — cannot verify item 1."
    return
  fi

  local target_rc control_rc
  target_rc=$(hook_exit "$PLC_HOOK" "$(edit_payload "frontend/eslint.config.mjs")")
  # CONTROL PATH CHOICE. It must be a path THIS HOOK owns — i.e. one listed in
  # its own PROTECTED_FULL. The obvious-looking frontend/next.config.js is NOT:
  # it is protected by a deny rule in settings.json, and the hook exits 0 for it
  # by design. Using it made this control fail against a perfectly healthy hook
  # on the guard's first run. .claude/hooks/protect-lint-config.sh is the hook's
  # own self-protection entry (PROTECTED_FULL:25) and is the strongest available
  # invariant: whatever else changes, the hook must never make ITSELF askable.
  control_rc=$(hook_exit "$PLC_HOOK" "$(edit_payload ".claude/hooks/protect-lint-config.sh")")

  # The control comes first on purpose. If the hook has stopped blocking
  # ANYTHING, the item-1 assertion below would pass for the worst possible
  # reason, and reporting "item 1 applied" then would be actively misleading.
  if [ "$control_rc" != "2" ]; then
    report "$PLC_HOOK: NEGATIVE CONTROL FAILED — its own self-protection entry exited $control_rc, expected 2." \
      "The hook has stopped blocking a path that must stay blocked." \
      "Item 1 is NOT verifiable while this is true: an ask-mode pass here would be indistinguishable" \
      "from a hook that no longer protects anything. Fix this before reading the item-1 result."
    return
  fi

  if [ "$target_rc" = "2" ]; then
    report "$PLC_HOOK: frontend/eslint.config.mjs still BLOCKS (exit 2) — item 1 not applied." \
      "Apply section 1 of docs/guardrails/meh-1779-permissions.patch.md." \
      "MEH-1767 stays blocked until this passes."
  fi
}

# --- check 2: .github/workflows/** denied for all three write tools --------
check_workflow_deny() {
  if ! command -v jq >/dev/null 2>&1; then
    report "jq not available — cannot verify item 2 (deny entries)."
    return
  fi
  if [ ! -r "$SETTINGS" ]; then
    report "$SETTINGS: not readable — cannot verify item 2."
    return
  fi

  local missing=()
  local tool
  for tool in Edit Write MultiEdit; do
    if ! jq -e --arg e "$tool(.github/workflows/**)" \
         '.permissions.deny | index($e)' "$SETTINGS" >/dev/null 2>&1; then
      missing+=("$tool(.github/workflows/**)")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    report "$SETTINGS: missing ${#missing[@]} deny entr(y/ies) for .github/workflows/** — item 2 not applied." \
      "${missing[@]}" \
      "All three are required — write-deny-parity-guard reds on Edit() without its Write()/MultiEdit() siblings." \
      "NOTE: this check is TEXTUAL. It proves the strings are present, not that the" \
      "permission layer honours them, and it cannot see the credential-scope change" \
      "(Sapir, manually in GitHub) which is the actual primary control."
  fi
}

# --- check 3: documentation hosts allowlisted, list still closed -----------
check_webfetch_allowlist() {
  if [ ! -r "$WFA_HOOK" ]; then
    report "$WFA_HOOK: not readable — cannot verify item 3."
    return
  fi

  # Negative control first, same reasoning as check 1: an allowlist that has
  # stopped rejecting satisfies every positive assertion below.
  local leak_rc
  leak_rc=$(fetch_exit "$WFA_HOOK" "evil.example")
  if [ "$leak_rc" != "2" ]; then
    report "$WFA_HOOK: NEGATIVE CONTROL FAILED — evil.example exited $leak_rc, expected 2." \
      "The allowlist is no longer closed. This is worse than item 3 being unapplied," \
      "and it makes the per-host results below meaningless."
    return
  fi

  local blocked=() host rc
  for host in "${DOC_HOSTS[@]}"; do
    rc=$(fetch_exit "$WFA_HOOK" "$host")
    [ "$rc" != "0" ] && blocked+=("$host")
  done

  if [ "${#blocked[@]}" -gt 0 ]; then
    report "$WFA_HOOK: ${#blocked[@]} of ${#DOC_HOSTS[@]} documentation host(s) still blocked — item 3 not applied." \
      "${blocked[@]}" \
      "Apply section 3 of docs/guardrails/meh-1779-permissions.patch.md." \
      "vercel.com is deliberately absent from this list — it was already allowlisted."
  fi
}

# --- self-test -------------------------------------------------------------
# Feeds the webfetch classifier three synthetic states and asserts it sorts
# them. The over-permissive fixture is the one that matters: it is the state a
# text-matching guard would wave through, and the reason the checks above run
# their negative control before their positive assertion.
self_test() {
  local tmp rc fails=0
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  # applied: the five hosts allowed, everything else refused
  {
    echo '#!/usr/bin/env bash'
    echo 'host=$(cat | sed -E "s/.*https:\/\/([^\/\"]*).*/\1/")'
    echo 'case "$host" in'
    for h in "${DOC_HOSTS[@]}"; do echo "  $h) exit 0 ;;"; done
    echo 'esac'
    echo 'exit 2'
  } > "$tmp/applied.sh"

  # unapplied: refuses everything (today's state for these hosts)
  printf '#!/usr/bin/env bash\ncat >/dev/null\nexit 2\n' > "$tmp/unapplied.sh"

  # over-permissive: allows everything, including what must be refused
  printf '#!/usr/bin/env bash\ncat >/dev/null\nexit 0\n' > "$tmp/overpermissive.sh"

  chmod +x "$tmp"/*.sh

  echo "permissions-patch-guard --self-test"
  echo

  local name expected
  for name in applied:0 unapplied:1 overpermissive:1; do
    expected="${name##*:}"
    name="${name%%:*}"
    problems=0
    enforcing=1
    MEH1779_WFA_HOOK="$tmp/$name.sh" WFA_HOOK="$tmp/$name.sh" check_webfetch_allowlist >/dev/null 2>&1
    rc=$([ "$problems" -eq 0 ] && echo 0 || echo 1)
    if [ "$rc" = "$expected" ]; then
      echo "  OK   $name -> $([ "$rc" = 0 ] && echo clean || echo flagged)"
    else
      echo "  FAIL $name -> expected $([ "$expected" = 0 ] && echo clean || echo flagged), got the other"
      fails=$(( fails + 1 ))
    fi
  done

  echo
  if [ "$fails" -eq 0 ]; then
    echo "self-test OK — the classifier separates applied / unapplied / over-permissive."
    exit 0
  fi
  echo "self-test FAILED — $fails case(s) misclassified. Do not trust this guard's output."
  exit 1
}

# --- main ------------------------------------------------------------------
if [ "${1:-}" = "--self-test" ]; then
  WFA_HOOK=""   # replaced per-fixture inside self_test
  self_test
fi

echo "permissions-patch-guard (MEH-1779) — repo root: $REPO_ROOT"
echo

today="$(date -u +%F)"
if [ -n "${MEH1779_GUARD_ENFORCE:-}" ]; then
  enforcing=1
  mode_note="forced by MEH1779_GUARD_ENFORCE"
elif [[ "$today" > "$ENFORCE_FROM" || "$today" == "$ENFORCE_FROM" ]]; then
  enforcing=1
  mode_note="on/after ENFORCE_FROM=$ENFORCE_FROM"
else
  enforcing=0
  mode_note="warn-only until $ENFORCE_FROM (today $today)"
fi
echo "  mode: $([ "$enforcing" -eq 1 ] && echo ENFORCING || echo WARN-ONLY) — $mode_note"
echo

check_ask_mode
check_workflow_deny
check_webfetch_allowlist

echo
if [ "$problems" -eq 0 ]; then
  echo "permissions-patch-guard OK — MEH-1779 items 1-3 are applied."
  exit 0
fi

if [ "$enforcing" -eq 1 ]; then
  echo "permissions-patch-guard FAILED — $problems item(s) of MEH-1779 still unapplied."
  echo "Source: docs/guardrails/meh-1779-permissions.patch.md"
  exit 1
fi

echo "permissions-patch-guard WARNED — $problems item(s) of MEH-1779 still unapplied."
echo "On $ENFORCE_FROM this same output becomes a merge-blocking failure."
echo "Source: docs/guardrails/meh-1779-permissions.patch.md — three pastes into two files."
exit 0
