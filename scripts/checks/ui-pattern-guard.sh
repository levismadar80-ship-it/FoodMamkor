#!/usr/bin/env bash
#
# ui-pattern-guard.sh — grep-level guard against the three producer-dashboard
# UI-consistency defects fixed in MEH-999 (QA sweep, 26/07/2026).
#
# WHY THIS EXISTS
#   All three defects were "each page hand-rolls its own version of a thing the
#   design system already owns". Nothing failed, nothing errored — the pages
#   just drifted apart, and only a manual QA pass found them. A grep guard is
#   the cheapest mechanism that turns that class into a red check.
#
# THE THREE RULES
#   1. Hand-rolled empty state — a dashboard page renders a `t("…empty…")`
#      string without importing EmptyState. The shared component owns the
#      icon / title / description / single-CTA structure (MEH-289 copy shape).
#   2. Hand-rolled back link — a dashboard page links to /producer/dashboard*
#      with a label that carries a text arrow, without importing BackLink.
#      BackLink owns the arrow direction; a hand-rolled one cannot flip per
#      locale.
#   3. Text arrow inside a translation VALUE for a back key. A "←"/"→"
#      character is a fixed glyph: whichever direction it points, it is wrong
#      in the other locale. The arrow belongs to BackLink as an icon.
#
# DELIBERATELY grep-level, not AST / ESLint-plugin. These are shape checks on a
# handful of files, and a grep that a reader can verify by eye beats a parser
# nobody maintains. Patterns are intentionally simple; that means they can
# false-positive, hence the escape hatch below.
#
# ESCAPE HATCH
#   Put `guard-ok: <reason>` in a comment on the offending line, or on either
#   adjacent line (±1) — the same ±1 window convention as the RTL hook's
#   `rtl-ok` marker (.claude/hooks/check-rtl.sh). A reason is required; the
#   marker alone is not enough to suppress.
#
# KNOWN GAP (rule 3 scope)
#   Rule 3 checks only the namespaces MEH-999 migrated to BackLink. Two other
#   keys ending in `.back` still carry a "→" text arrow and are NOT flagged:
#     - recipes.detail.back        (frontend/messages/he.json)
#     - admin …    .back           (frontend/messages/he.json)
#   Their pages do not use BackLink, so blanking the arrow from the string
#   would leave them with no arrow at all — a visual regression, not a fix.
#   Widen NAMESPACES below as each of those pages is migrated.
#
# USAGE
#   bash scripts/checks/ui-pattern-guard.sh          # exit 1 on any violation
#   Run from the repo root. No arguments, no dependencies beyond bash + grep.
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164): an unguarded cd that fails leaves the
# guard grepping the wrong directory, matching nothing, and exiting 0 — a
# silently-passing check. Under scripts/checks/run-all.sh that reads as PASS.
cd "$REPO_ROOT" || exit 1

DASHBOARD_DIR="frontend/app/[locale]/producer/dashboard"
HE_JSON="frontend/messages/he.json"

# Namespaces whose `.back` / `.back_link` keys are BackLink-owned (rule 3).
NAMESPACES='manage_events|manage_experiences|recipes\.dashboard|group_buys\.dashboard|sweep_tail\.followers'

violations=0

# Is `guard-ok:` present on line N of FILE, or on N-1 / N+1?
suppressed() {
  local file="$1" line="$2" from to
  from=$(( line > 1 ? line - 1 : 1 ))
  to=$(( line + 1 ))
  sed -n "${from},${to}p" "$file" 2>/dev/null | grep -q 'guard-ok:'
}

report() {
  echo "  VIOLATION $1:$2"
  echo "      $3"
  violations=$(( violations + 1 ))
}

echo "ui-pattern-guard (MEH-999) — repo root: $REPO_ROOT"
echo

# ---------------------------------------------------------------------------
# Rule 1 — hand-rolled empty state on a manage-list page.
#
# SCOPE: the five "my <things>" list pages, which are what EmptyState governs —
# a whole page whose list came back empty, needing icon + title + description +
# one action. Deliberately NOT every dashboard file:
#   - dashboard/edit/**  and dashboard/insights/** render inline "no data yet"
#     lines INSIDE dense widgets (a chart with no points, a card zone with no
#     rows). A full EmptyState with a 56px icon and a CTA would be wrong there.
#   - `t("license.summary_empty")` (edit/page.js) is an accordion summary
#     placeholder, not an empty state at all — it only matches on the substring.
# Add a page here when it grows a real page-level empty state.
# ---------------------------------------------------------------------------
MANAGE_LISTS="events experiences recipes group-buys followers"

echo "Rule 1: manage-list empty states must use EmptyState"
for name in $MANAGE_LISTS; do
  file="$DASHBOARD_DIR/$name/page.js"
  [ -f "$file" ] || continue
  grep -Eq 't\("[A-Za-z0-9_.]*empty[A-Za-z0-9_.]*"' "$file" || continue
  grep -q 'components/ui/EmptyState' "$file" && continue
  while IFS=: read -r line _; do
    [ -n "$line" ] || continue
    suppressed "$file" "$line" && continue
    report "$file" "$line" 'renders a t("…empty…") string but does not import EmptyState (@/components/ui/EmptyState)'
  done < <(grep -nE 't\("[A-Za-z0-9_.]*empty[A-Za-z0-9_.]*"' "$file")
done

# ---------------------------------------------------------------------------
# Rule 2 — hand-rolled back link in a dashboard page.
# A back link is "a link to /producer/dashboard* whose label carries an arrow".
# ---------------------------------------------------------------------------
echo "Rule 2: dashboard back links must use BackLink"
while IFS= read -r file; do
  [ -n "$file" ] || continue
  grep -q 'components/ui/BackLink' "$file" && continue
  while IFS=: read -r line _; do
    [ -n "$line" ] || continue
    suppressed "$file" "$line" && continue
    report "$file" "$line" 'hand-rolled back link (arrow + /producer/dashboard href) — use BackLink (@/components/ui/BackLink)'
  done < <(grep -nE '(←|→|ArrowLeft|ArrowRight).*href="/producer/dashboard|href="/producer/dashboard[^"]*".*(←|→|ArrowLeft|ArrowRight)' "$file")
done < <(find "$DASHBOARD_DIR" -type f -name '*.js' -o -type f -name '*.jsx' 2>/dev/null)

# ---------------------------------------------------------------------------
# Rule 3 — text arrow inside a back-key translation value.
# ---------------------------------------------------------------------------
echo "Rule 3: no text arrows in BackLink-owned .back / .back_link values"
current_ns=""
while IFS=: read -r line content; do
  [ -n "$line" ] || continue
  # Track the nearest enclosing namespace key so the check stays scoped.
  case "$content" in
    *'"manage_events"'*)       current_ns="manage_events" ;;
    *'"manage_experiences"'*)  current_ns="manage_experiences" ;;
    *'"dashboard"'*)           current_ns="${current_ns}.dashboard" ;;
    *'"followers"'*)           current_ns="sweep_tail.followers" ;;
  esac
  printf '%s' "$content" | grep -Eq '"back(_link)?"[[:space:]]*:' || continue
  printf '%s' "$content" | grep -q '←\|→' || continue
  echo "$current_ns" | grep -Eq "$NAMESPACES" || continue
  suppressed "$HE_JSON" "$line" && continue
  report "$HE_JSON" "$line" 'text arrow in a BackLink-owned back key — the arrow is BackLinks icon, not part of the copy'
done < <(grep -nE '"(manage_events|manage_experiences|dashboard|followers)"|"back(_link)?"[[:space:]]*:' "$HE_JSON")

echo
if [ "$violations" -gt 0 ]; then
  echo "ui-pattern-guard FAILED — $violations violation(s)."
  echo "Fix them, or annotate a justified exception with 'guard-ok: <reason>' within +/-1 line."
  exit 1
fi
echo "ui-pattern-guard OK — no violations."
exit 0
