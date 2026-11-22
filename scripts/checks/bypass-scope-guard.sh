#!/usr/bin/env bash
#
# bypass-scope-guard.sh — BLOCKING guard (MEH-3607) against sending the Vercel
# protection-bypass secret to every host a page loads.
#
# WHY
#   `extraHTTPHeaders` on a Playwright BROWSER context is sent to every request
#   the page makes: map tiles, Cloudinary, fonts, analytics. A script that puts
#   `x-vercel-protection-bypass` there hands the staging secret to those
#   services' logs. Measured 21/11 (MEH-3495): a request to
#   tile.openstreetmap.org carried it. The pattern was in four live scripts,
#   and .claude/rules/testing.md taught it until #5057.
#
# THE RULE
#   In frontend/ and scripts/ (outside node_modules, .next, e2e/_qa-archive/
#   and qa-artifacts/), any .js/.mjs/.cjs/.ts/.mts/.cts/.jsx/.tsx line with
#   `extraHTTPHeaders` in a file that mentions a bypass (/bypass/i) is reported,
#   unless:
#     - the nearest `newContext(` within the 8 lines above it is a
#       `request.newContext(` — an API request context with a baseURL calls
#       the target only; or
#     - the line is a comment (`//` or `*`); or
#     - `guard-ok: <reason>` is on the line or an adjacent one (+/-1).
#   The fix is `scopeBypassToOrigin(context, BASE, headers)` from
#   frontend/e2e/_bypass-scope.mjs (Vercel's bypass cookie; the browser never
#   holds the secret).
#
# KNOWN LIMIT
#   A file whose headers come from an import and that never says "bypass" is
#   not read. The helper's runtime guard is the second layer there.
#
#   e2e/_qa-archive/ and qa-artifacts/ are not scanned: they are kept as
#   history and nothing runs them (MEH-3531). The archive README says to port a
#   probe to the helper before running it against staging.
#
# USAGE
#   bash scripts/checks/bypass-scope-guard.sh             # exit 1 on a finding
#   bash scripts/checks/bypass-scope-guard.sh <dir>...    # scan other trees
#   bash scripts/checks/bypass-scope-guard.sh --self-test # classifier check
#
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
if [ $# -gt 0 ] && [ "$1" != "--self-test" ]; then SCAN_DIRS=("$@"); else SCAN_DIRS=(frontend scripts); fi

scan() {
  local findings=0 file line from
  while IFS=: read -r file line _; do
    [ -n "$file" ] || continue
    grep -qi 'bypass' "$file" || continue
    from=$(( line > 8 ? line - 8 : 1 ))
    # Excused only when the NEAREST newContext( above is a request context, so
    # a browser context opened after a request context is still reported.
    sed -n "${from},${line}p" "$file" | grep -o '[A-Za-z_.]*newContext(' | tail -1 | grep -q 'request\.newContext(' && continue
    sed -n "${line}p" "$file" | grep -qE '^[[:space:]]*(//|\*)' && continue
    sed -n "$(( line > 1 ? line - 1 : 1 )),$(( line + 1 ))p" "$file" | grep -qE 'guard-ok: *[^ ]' && continue
    echo "  FAIL $file:$line"
    echo "      $(sed -n "${line}p" "$file" | sed 's/^[[:space:]]*//')"
    findings=$(( findings + 1 ))
  done < <(grep -rn --include='*.mjs' --include='*.js' --include='*.cjs' --include='*.ts' \
             --include='*.mts' --include='*.cts' --include='*.tsx' --include='*.jsx' \
             --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=_qa-archive --exclude-dir=qa-artifacts \
             'extraHTTPHeaders' "$@" 2>/dev/null)
  return $(( findings > 0 ))
}

self_test() {
  local tmp got expected="leak.mjs:15 leak.mjs:4 leak.mjs:6 leak.ts:2"
  tmp="$(mktemp -d)"
  cat > "$tmp/leak.mjs" <<'FIXTURE'
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const H = { "x-vercel-protection-bypass": BYPASS };
// extraHTTPHeaders in a comment is prose
const a = await browser.newContext({ extraHTTPHeaders: H });
const b = await browser.newContext({
  extraHTTPHeaders: H,
});
const c = await request.newContext({
  baseURL: BASE,
  extraHTTPHeaders: H,
});
// guard-ok: fixture — a header that is not the bypass
const d = await browser.newContext({ extraHTTPHeaders: { "accept-language": "he" } });
const e = await request.newContext({ baseURL: BASE });
const f = await browser.newContext({ extraHTTPHeaders: H });
FIXTURE
  printf 'const H = { "x-vercel-protection-bypass": S };\nconst x = await browser.newContext({ extraHTTPHeaders: H });\n' > "$tmp/leak.ts"
  printf 'const x = await browser.newContext({ extraHTTPHeaders: { a: "1" } });\n' > "$tmp/nobypass.mjs"
  got="$(scan "$tmp" | sed -n 's#^  FAIL .*/\([^/]*:[0-9]*\)$#\1#p' | sort | tr '\n' ' ' | sed 's/ $//')"
  rm -rf "$tmp"
  if [ "$got" = "$expected" ]; then
    echo "bypass-scope-guard self-test PASS — reported: $got"; return 0
  fi
  echo "bypass-scope-guard self-test FAIL — expected [$expected], got [$got]"; return 1
}

if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi

echo "bypass-scope-guard (MEH-3607) — scanning: ${SCAN_DIRS[*]}"
echo "Rule: the Vercel bypass secret never goes in a browser context's extraHTTPHeaders."
if scan "${SCAN_DIRS[@]}"; then
  echo "OK — no browser context sends the bypass secret to every host."
  exit 0
fi
echo
echo "Use scopeBypassToOrigin() from frontend/e2e/_bypass-scope.mjs, which sends"
echo "the headers to the target origin only. See .claude/rules/testing.md, staging step 2."
exit 1
