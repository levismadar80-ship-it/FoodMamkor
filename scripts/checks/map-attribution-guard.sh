#!/usr/bin/env bash
#
# map-attribution-guard.sh — grep-level guard against the OSM-attribution
# deletion fixed in MEH-1633 (producer-page mini map, 27/07/2026).
#
# WHY THIS EXISTS
#   `attributionControl={false}` on a react-leaflet <MapContainer> deletes the
#   control that the sibling <TileLayer attribution='…'> prop feeds. Both props
#   are real, correctly-typed members of their component's API, so nothing
#   errors and nothing warns — and the attribution string is still right there
#   in the source, which is exactly what makes review read it as present. The
#   rendered map carries ZERO .leaflet-control-attribution elements.
#
#   That is not a cosmetic drift like the MEH-999 class this directory started
#   with. Serving OSM tiles without visible attribution violates the ODbL and
#   the OSM tile usage policy, and the practical downside is tile-blocking of
#   the whole domain. A prop whose failure mode is a legal exposure earns a
#   mechanical check.
#
# THE ONE RULE
#   No `attributionControl={false}` anywhere under frontend/. Deleting the prop
#   is the fix: react-leaflet's default is `true`, so absence renders the
#   control. There is no legitimate map surface on this site that may omit
#   attribution — every one of the three (MiniMap, HomepageMiniMap,
#   MapComponent) serves OSM tiles.
#
#   Scope is deliberately ONE pattern. It does not check that an `attribution`
#   string is present, correct, or non-empty — a grep cannot tell a valid ODbL
#   notice from a plausible-looking one, and pretending otherwise would make a
#   green run mean less than it does. What it guarantees: the control that
#   renders whatever attribution exists is never structurally removed.
#
# DELIBERATELY grep-level, not an ESLint plugin. This is a single literal
# token in JSX on three files. A grep a reader can verify by eye beats a
# parser plugin nobody maintains — same reasoning as ui-pattern-guard.sh:24-27.
#
# KNOWN GAP — prose matches too
#   The scan is line-based and has no notion of comments, so a code COMMENT
#   that quotes the literal prop trips it. That happened during this very
#   ticket: the fix comment in MiniMap.jsx originally spelled the token out and
#   reddened the guard. The direction of the error is the safe one (a false
#   positive you can see, not a false negative you cannot), so the pattern was
#   left simple. If you need to discuss the prop in a comment, describe it
#   ("a falsy `attributionControl` prop") rather than quoting it, or use the
#   escape hatch below.
#
# ESCAPE HATCH
#   Put `guard-ok: <reason>` in a comment on the offending line, or on either
#   adjacent line (±1) — the same ±1 window convention as ui-pattern-guard.sh
#   and the RTL hook's `rtl-ok` marker (.claude/hooks/check-rtl.sh). A reason
#   is required; the marker alone is not enough to suppress. Note that using it
#   here means shipping un-attributed OSM tiles — the reason had better be that
#   the surface stopped serving OSM tiles at all.
#
# USAGE
#   bash scripts/checks/map-attribution-guard.sh   # exit 1 on any violation
#   Run from anywhere. No arguments, no dependencies beyond bash + grep.
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# `|| exit 1` is load-bearing (SC2164): an unguarded cd that fails leaves the
# guard grepping the wrong directory, matching nothing, and exiting 0 — a
# silently-passing check. Under scripts/checks/run-all.sh that reads as PASS.
cd "$REPO_ROOT" || exit 1

SCAN_DIR="frontend"

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

echo "map-attribution-guard (MEH-1633) — repo root: $REPO_ROOT"
echo

# ---------------------------------------------------------------------------
# Rule 1 — no <MapContainer attributionControl={false}> under frontend/.
#
# Whitespace-tolerant inside the braces (`{ false }` is the same prop), and the
# scan excludes node_modules / build output so a vendored copy of someone
# else's example cannot red the repo. -F is not usable because of that
# tolerance, so the pattern is an ERE with the braces escaped.
# ---------------------------------------------------------------------------
echo "Rule 1: no attributionControl={false} on any Leaflet map surface"
while IFS=: read -r file line _; do
  [ -n "$file" ] || continue
  suppressed "$file" "$line" && continue
  report "$file" "$line" 'attributionControl={false} deletes the control the sibling TileLayer `attribution` prop feeds — the map renders ZERO .leaflet-control-attribution elements (ODbL / OSM tile-policy violation). Delete the prop; react-leaflet defaults it to true.'
done < <(grep -rnE 'attributionControl=\{[[:space:]]*false[[:space:]]*\}' "$SCAN_DIR" \
           --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
           --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=out 2>/dev/null)

echo
if [ "$violations" -gt 0 ]; then
  echo "map-attribution-guard FAILED — $violations violation(s)."
  echo "Fix them, or annotate a justified exception with 'guard-ok: <reason>' within +/-1 line."
  exit 1
fi
echo "map-attribution-guard OK — no violations."
exit 0
