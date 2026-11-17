#!/usr/bin/env bash
#
# Module:   fee-promise-guard
# Purpose:  Keep the retired «בלי עמלות / no commissions» promise out of the
#           texts that agents and outreach read before writing to a business.
# Touches:  nothing — reads .agents/** and docs/outreach/**.
# Does NOT: check the site's own copy. frontend/messages/*.json is owned by
#           frontend/__tests__/PricingCopyGuard.test.js (every price sentence
#           lives under pricing.* and takes its numbers from lib/pricing.js);
#           one owner per fact (workflow.md Smell #1).
# Related:  docs/decisions/ADR-042-revenue-model-v3.md (commissions allowed on
#           paid events, workshops, group buys and rescue bags; «לעולם» allowed
#           nowhere in pricing copy), docs/PRICING.md (the numbers).
# History:  MEH-3389 (creation). On 17/11 .agents/product-marketing-context.md,
#           which every marketing skill reads, still said "No transaction
#           fees, no commissions, ever" three days after ADR-042 retired it.
#           The site and the terms had been updated; the context the agents
#           draft from had not, and nothing could see it.
#
# THE RULE
#   An absolute no-fee promise in .agents/** or docs/outreach/**: «בלי עמלות»,
#   «ללא עמלות», «אין עמלות», "no commission(s)", "no transaction fee(s)",
#   "zero fees", "commission-free". Case-insensitive.
#
# ESCAPE HATCH
#   `guard-ok: <reason>` on the same line (an HTML comment in markdown), for a
#   line that QUOTES the retired promise as history. A reason is required.
#
# USAGE
#   bash scripts/checks/fee-promise-guard.sh             # exit 1 on a finding
#   bash scripts/checks/fee-promise-guard.sh <dir>...    # scan other trees
#   bash scripts/checks/fee-promise-guard.sh --self-test # fixtures, real scanner
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PATTERN='בלי עמלות|ללא עמלות|אין עמלות|no commissions?\b|no transaction fees?\b|zero fees?\b|commission-free'

scan() {
  # Prints "path:line: text" for each finding; returns the count via stdout tail.
  local found=0 dir
  for dir in "$@"; do
    [ -e "$dir" ] || continue
    while IFS= read -r hit; do
      [ -z "$hit" ] && continue
      if printf '%s' "$hit" | grep -qE 'guard-ok:[[:space:]]*[^[:space:]>-]'; then
        continue
      fi
      echo "WARNING $hit"
      found=$((found + 1))
    done < <(grep -rniE --include='*.md' --include='*.txt' --include='*.json' --include='*.yml' --include='*.yaml' "$PATTERN" "$dir" 2>/dev/null)
  done
  echo "findings=$found"
}

if [ "${1:-}" = "--self-test" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  cat > "$tmp/fixture.md" <<'EOF'
line1 Free to join. No transaction fees, ever.
line2 חינם, בלי עמלות.
line3 The base page is free; paid bookings carry a commission.
line4 «בלי עמלות» was the old line. <!-- guard-ok: history, quotes the retired promise -->
line5 «אין עמלות» <!-- guard-ok: -->
line6 Commission-free for everyone.
EOF
  out="$(bash "${BASH_SOURCE[0]}" "$tmp")"
  got="$(printf '%s\n' "$out" | grep '^WARNING' | grep -oE 'line[0-9]' | tr '\n' ' ')"
  want="line1 line2 line5 line6 "
  if [ "$got" = "$want" ]; then
    echo "fee-promise-guard self-test: OK ($got)"
    exit 0
  fi
  echo "fee-promise-guard self-test: FAIL — reported [$got], expected [$want]"
  exit 1
fi

if [ "$#" -gt 0 ]; then
  out="$(scan "$@")"
else
  # Control: the scanned trees must exist, or a clean result means nothing.
  for d in "$ROOT/.agents" "$ROOT/docs/outreach"; do
    if [ ! -d "$d" ]; then
      echo "::error::fee-promise-guard: $d is missing — a clean scan of nothing is not a pass."
      exit 1
    fi
  done
  out="$(scan "$ROOT/.agents" "$ROOT/docs/outreach")"
fi

printf '%s\n' "$out" | grep '^WARNING' || true
n="$(printf '%s\n' "$out" | sed -n 's/^findings=//p')"
if [ "${n:-0}" -gt 0 ]; then
  echo "::error::fee-promise-guard: $n line(s) promise «no fees». Commissions are allowed since ADR-042; describe the model and point to docs/PRICING.md."
  exit 1
fi
echo "fee-promise-guard: OK (0 findings)"
