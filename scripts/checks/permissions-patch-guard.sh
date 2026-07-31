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
# INVERTED under MEH-1803. This check used to assert that eslint.config.mjs
# reached an ASK. That requirement was WITHDRAWN: the ask-tier shipped, was
# live-tested, and did not gate — the session permission mode approves file
# edits before hooks are consulted, so the ask was never reached and the file
# went from blocked to freely editable. The desired state is now the ORIGINAL
# one: a full block. This is no longer manual-delivery tracking (that is items
# 2 and 3 only); it is an INVARIANT, and its failure is a regression.
check_eslint_blocked() {
  if [ ! -r "$PLC_HOOK" ]; then
    report "$PLC_HOOK: not readable — cannot verify the eslint-config block."
    return
  fi

  local target_rc control_rc
  target_rc=$(hook_exit "$PLC_HOOK" "$(edit_payload "frontend/eslint.config.mjs")")
  # THE CONTROL FLIPS WITH THE ASSERTION, and this is the part that is easy to
  # get wrong. The old check expected exit 0, so its control had to prove the
  # hook still blocked SOMETHING. This one expects exit 2 — so a hook that
  # blocked EVERYTHING would satisfy it for the worst possible reason. The
  # control must therefore prove the opposite: an unprotected path still passes.
  control_rc=$(hook_exit "$PLC_HOOK" "$(edit_payload "frontend/components/Footer.jsx")")

  # Control first — if it fails, the assertion below is unreadable either way.
  if [ "$control_rc" != "0" ]; then
    report "$PLC_HOOK: NEGATIVE CONTROL FAILED — an unprotected path (Footer.jsx) exited $control_rc, expected 0." \
      "The hook is blocking paths it does not own, so 'eslint.config.mjs blocks' proves nothing:" \
      "a hook that blocks everything satisfies it. Fix this before reading the result below."
    return
  fi

  if [ "$target_rc" != "2" ]; then
    report "REGRESSION — the ask-tier is back. See MEH-1803." \
      "$PLC_HOOK: frontend/eslint.config.mjs exited $target_rc, expected 2 (full block)." \
      "MEH-1779 item 1 was REVERTED because an ask does not gate: the permission mode" \
      "approves file edits before hooks are consulted, so the path became freely editable." \
      "Do not re-apply section 1 of docs/guardrails/meh-1779-permissions.patch.md." \
      "To change eslint.config.mjs, write docs/guardrails/eslint.config.PROPOSED.mjs and open a PR."
  else
    echo "  OK — eslint.config.mjs blocks (MEH-1803 reverted the ask-tier)."
    echo "       MEH-1767 route = PROPOSED file + PR. Independent of this guard."
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

  # --- fixtures for the INVERTED check 1 (MEH-1803) --------------------------
  # Without these, "eslint.config.mjs must block" is a check that has never been
  # observed failing — and the state it must catch is precisely the one that
  # shipped and had to be reverted. Fixtures, never the live hook: pointing this
  # at the real file would make the test agree with whatever is on disk.
  #
  # reverted  — blocks the lint config, lets an unowned path through  -> clean
  # asktier   — the MEH-1779 shape: exit 0 + ask JSON for the config  -> FLAGGED
  # blockall  — blocks everything, incl. Footer.jsx                   -> FLAGGED
  #             (satisfies "eslint blocks" for the worst reason; the
  #              control is the only thing that separates it from reverted)
  {
    echo '#!/usr/bin/env bash'
    echo 'p=$(cat | sed -E "s/.*\"file_path\":\"([^\"]*)\".*/\1/")'
    echo 'case "$p" in *eslint.config.mjs|*.eslintrc.json) exit 2 ;; esac'
    echo 'exit 0'
  } > "$tmp/reverted.sh"
  {
    echo '#!/usr/bin/env bash'
    echo 'p=$(cat | sed -E "s/.*\"file_path\":\"([^\"]*)\".*/\1/")'
    echo 'case "$p" in *eslint.config.mjs)'
    echo '  printf "{\"hookSpecificOutput\":{\"permissionDecision\":\"ask\"}}\n"; exit 0 ;;'
    echo 'esac'
    echo 'exit 0'
  } > "$tmp/asktier.sh"
  printf '#!/usr/bin/env bash\ncat >/dev/null\nexit 2\n' > "$tmp/blockall.sh"

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

  echo "  -- inverted check 1 (MEH-1803): eslint.config.mjs must BLOCK --"
  for name in reverted:0 asktier:1 blockall:1; do
    expected="${name##*:}"
    name="${name%%:*}"
    problems=0
    enforcing=1
    PLC_HOOK="$tmp/$name.sh" check_eslint_blocked >/dev/null 2>&1
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
    echo "self-test OK — webfetch: applied/unapplied/over-permissive separated;"
    echo "               check 1: reverted clean, ask-tier FLAGGED, block-all FLAGGED."
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
# MEH-1803 — the limit of check 1, printed on EVERY run rather than buried in a
# comment, because a green here was read as "the gate works" and it does not
# mean that. Proven live on 31/07: the hook emitted its ask and exited 0, and
# the edit went through with no prompt, because the session permission mode
# (acceptEdits) approves file edits at an earlier stage than hooks are
# consulted. Check 1 runs the hook in a shell; the harness is not in the loop.
echo "  NOTE a hook check proves what the HOOK EMITS, not what the HARNESS ENFORCES."
echo "       A hook decision other than 'deny' can be pre-empted by the session"
echo "       permission mode and never reached. Only 'deny' is evaluated ahead"
echo "       of the mode — which is why item 1 was reverted (MEH-1803)."
echo "       See docs/guardrails/meh-1779-permissions.patch.md."
echo

# Invariant first, then the two items still awaiting a manual paste.
check_eslint_blocked
check_workflow_deny
check_webfetch_allowlist

echo
if [ "$problems" -eq 0 ]; then
  echo "permissions-patch-guard OK — the eslint-config block holds, items 2-3 applied."
  exit 0
fi

if [ "$enforcing" -eq 1 ]; then
  echo "permissions-patch-guard FAILED — $problems finding(s)."
  echo "Manual-delivery tracking is items 2-3 only; a REGRESSION line is not a missing paste."
  echo "Source: docs/guardrails/meh-1779-permissions.patch.md"
  exit 1
fi

echo "permissions-patch-guard WARNED — $problems finding(s)."
echo "On $ENFORCE_FROM this same output becomes a merge-blocking failure."
echo "Items 2-3 are two pastes into two files: docs/guardrails/meh-1779-permissions.patch.md."
echo "Item 1 is NOT a paste — it is an invariant, and its failure means the ask-tier returned."
exit 0
