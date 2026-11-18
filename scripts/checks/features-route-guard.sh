#!/usr/bin/env bash
#
# Module:   features-route-guard.sh
# Purpose:  Fail when a page under frontend/app/[locale]/ has no row in the
#           route inventory of docs/FEATURES.md, or when the inventory names a
#           route that no longer exists. Keeps the feature list true by
#           construction instead of by memory (MEH-3175).
# Touches:  nothing — reads the tree and the doc, writes only to stdout.
# Does NOT: check the prose descriptions, the v1/v2 status tables, or API
#           endpoints (docs/DATA.md owns those). Only route ↔ row.
# Related:  docs/FEATURES.md «Every page on the site — route inventory»,
#           scripts/checks/run-all.sh (runs this with every other guard),
#           frontend/__tests__/DashboardPlacementGuard.test.js (same idea for
#           the dashboard registry).
# History:  MEH-3175 (creation). Root cause: June–September 2026 saw ~3,700
#           commits and zero edits to FEATURES.md; workflow rule 11 never fires
#           for a NEW feature because a new feature touches no doc.
#
# Inventory row format (one per route, without the [locale] prefix):
#   | `/producers/[category]/[region]` | What it is |
# Env overrides (self-test): FEATURES_DOC, FEATURES_APP_DIR.

set -uo pipefail

DOC_DEFAULT="docs/FEATURES.md"
APP_DEFAULT="frontend/app/[locale]"
# Read per call, not once at load, so the self-test can point each case at
# its own fixture (an earlier draft read them once and every case checked the
# real files — the self-test caught it).
doc_path() { printf '%s' "${FEATURES_DOC:-$DOC_DEFAULT}"; }
app_path() { printf '%s' "${FEATURES_APP_DIR:-$APP_DEFAULT}"; }

# Routes on disk: every page.js/jsx/ts/tsx under APP, as /path, sorted.
routes_on_disk() {
  local APP; APP="$(app_path)"
  [ -d "$APP" ] || return 1
  (cd "$APP" && find . -type f \( -name 'page.js' -o -name 'page.jsx' -o -name 'page.ts' -o -name 'page.tsx' \) \
     | sed -E 's|^\./||; s|/?page\.[jt]sx?$||; s|^|/|' \
     | sed -E 's|/\([^/)]+\)||g; s|^$|/|' ) | sort -u
}

# Routes in the doc: the first backticked cell of every inventory row.
routes_in_doc() {
  local DOC; DOC="$(doc_path)"
  [ -r "$DOC" ] || return 1
  awk '
    /^## Every page on the site/ { on=1; next }
    on && /^## / { on=0 }
    on && /^\| `\// { sub(/^\| `/, ""); sub(/`.*/, ""); print }
  ' "$DOC" | sort -u
}

check() {
  local disk doc missing stale n_disk n_doc DOC APP
  DOC="$(doc_path)"; APP="$(app_path)"
  disk="$(routes_on_disk)" || { echo "features-route-guard: cannot read $APP"; return 1; }
  doc="$(routes_in_doc)"   || { echo "features-route-guard: cannot read $DOC"; return 1; }
  n_disk=$(printf '%s\n' "$disk" | grep -c . || true)
  n_doc=$(printf '%s\n' "$doc" | grep -c . || true)
  # A parse that found nothing is a broken instrument, never a clean result.
  if [ "$n_disk" -eq 0 ] || [ "$n_doc" -eq 0 ]; then
    echo "features-route-guard: parsed $n_disk routes on disk and $n_doc in the doc — refusing to call that clean."
    return 1
  fi
  missing="$(comm -23 <(printf '%s\n' "$disk") <(printf '%s\n' "$doc"))"
  stale="$(comm -13 <(printf '%s\n' "$disk") <(printf '%s\n' "$doc"))"
  if [ -z "$missing" ] && [ -z "$stale" ]; then
    echo "features-route-guard: OK — $n_disk routes, all listed in $DOC."
    return 0
  fi
  if [ -n "$missing" ]; then
    echo "features-route-guard: page(s) with no row in the route inventory of $DOC:"
    printf '%s\n' "$missing" | sed 's/^/  missing: /'
    echo "  → add a row:  | \`<route>\` | <what it is> |  (rule: a new page = a new row, MEH-3175)"
  fi
  if [ -n "$stale" ]; then
    echo "features-route-guard: inventory row(s) for routes that no longer exist:"
    printf '%s\n' "$stale" | sed 's/^/  stale:   /'
  fi
  return 1
}

self_test() {
  local status=0 cases=0 tmp out rc DOC APP
  DOC="$DOC_DEFAULT"; APP="$APP_DEFAULT"
  tmp="$(mktemp -d)"
  expect() {
    local name="$1" want="$2" doc="$3" app="$4" grep_for="${5:-}"
    cases=$(( cases + 1 ))
    out="$(FEATURES_DOC="$doc" FEATURES_APP_DIR="$app" check 2>&1)"; rc=$?
    local got=PASS; [ "$rc" -ne 0 ] && got=FAIL
    if [ "$got" = "$want" ] && { [ -z "$grep_for" ] || printf '%s' "$out" | grep -qF -- "$grep_for"; }; then
      echo "  [ok] $name → $got"
    else
      echo "  [XX] $name → $got (wanted $want${grep_for:+, output naming '$grep_for'})"
      printf '%s\n' "$out" | sed 's/^/       /'
      status=1
    fi
  }
  echo "features-route-guard --self-test"
  # Anchored to the real repo: the live doc and tree must agree.
  # (Skipped in the preflight, where the real check runs right after and
  # reports the same thing under its own name.)
  [ -z "${FRG_PREFLIGHT:-}" ] && expect "real doc vs real tree" PASS "$DOC" "$APP"
  # Drop one real row → that exact route is reported missing.
  grep -vF '| `/rescue` |' "$DOC" > "$tmp/doc-missing.md"
  expect "real doc minus /rescue row" FAIL "$tmp/doc-missing.md" "$APP" "missing: /rescue"
  # Add a row for a route that does not exist → reported stale.
  sed 's#^| `/contact` |#| `/no-such-page` | ghost |\n&#' "$DOC" > "$tmp/doc-stale.md"
  expect "real doc plus a ghost row" FAIL "$tmp/doc-stale.md" "$APP" "stale:   /no-such-page"
  # A new page on disk with no row → missing. Built as a tiny synthetic tree.
  mkdir -p "$tmp/app/a" "$tmp/app/b/[id]" "$tmp/app/(group)/c"
  touch "$tmp/app/page.js" "$tmp/app/a/page.jsx" "$tmp/app/b/[id]/page.js" "$tmp/app/(group)/c/page.js"
  printf '## Every page on the site\n| `/` | h |\n| `/a` | a |\n| `/b/[id]` | b |\n| `/c` | c |\n## next\n| `/outside` | not in section |\n' > "$tmp/doc-ok.md"
  expect "synthetic tree, route group stripped, rows outside section ignored" PASS "$tmp/doc-ok.md" "$tmp/app"
  mkdir -p "$tmp/app/d"; touch "$tmp/app/d/page.js"
  expect "synthetic tree plus an unlisted page" FAIL "$tmp/doc-ok.md" "$tmp/app" "missing: /d"
  # An empty parse is a broken instrument, not a pass.
  printf '# nothing here\n' > "$tmp/doc-empty.md"
  expect "doc with no inventory section" FAIL "$tmp/doc-empty.md" "$tmp/app" "refusing to call that clean"
  rm -rf "$tmp"
  echo "  ran $cases cases"
  return "$status"
}

main() {
  if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi
  local st
  st="$(FRG_PREFLIGHT=1 self_test 2>&1)" || {
    printf '%s\n' "$st"
    echo "features-route-guard: SELF-TEST FAILED."
    exit 1
  }
  check
}

main "$@"
