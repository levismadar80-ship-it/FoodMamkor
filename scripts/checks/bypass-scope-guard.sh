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
#   In frontend/ (outside node_modules, .next, e2e/_qa-archive/ and
#   qa-artifacts/), a line with
#   `extraHTTPHeaders` in a file that mentions a bypass (/bypass/i) is reported,
#   unless:
#     - a `request.newContext(` opens within the 8 lines above it — an API
#       request context with a baseURL calls the target only; or
#     - the line is a comment (`//` or `*`); or
#     - `guard-ok: <reason>` is on the line or an adjacent one (+/-1).
#   The fix is `scopeBypassToOrigin(context, BASE, headers)` from
#   frontend/e2e/_bypass-scope.mjs.
#
#   e2e/_qa-archive/ and qa-artifacts/ are not scanned: they are kept as
#   history and nothing runs them (MEH-3531). The archive README says to port a
#   probe to the helper before running it against staging.
#
# USAGE
#   bash scripts/checks/bypass-scope-guard.sh             # exit 1 on a finding
#   bash scripts/checks/bypass-scope-guard.sh <dir>       # scan another tree
#   bash scripts/checks/bypass-scope-guard.sh --self-test # classifier check
#
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
SCAN_DIR="${1:-frontend}"

scan() {
  local dir="$1" findings=0 file line from
  while IFS=: read -r file line _; do
    [ -n "$file" ] || continue
    grep -qi 'bypass' "$file" || continue
    from=$(( line > 8 ? line - 8 : 1 ))
    sed -n "${from},${line}p" "$file" | grep -q 'request\.newContext(' && continue
    sed -n "${line}p" "$file" | grep -qE '^[[:space:]]*(//|\*)' && continue
    sed -n "$(( line > 1 ? line - 1 : 1 )),$(( line + 1 ))p" "$file" | grep -qE 'guard-ok: *[^ ]' && continue
    echo "  FAIL $file:$line"
    echo "      $(sed -n "${line}p" "$file" | sed 's/^[[:space:]]*//')"
    findings=$(( findings + 1 ))
  done < <(grep -rn --include='*.mjs' --include='*.js' --include='*.ts' --include='*.cjs' \
             --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=_qa-archive --exclude-dir=qa-artifacts \
             'extraHTTPHeaders' "$dir" 2>/dev/null)
  return $(( findings > 0 ))
}

self_test() {
  local tmp got expected="leak.mjs:4 leak.mjs:6"
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
FIXTURE
  printf 'const x = await browser.newContext({ extraHTTPHeaders: { a: "1" } });\n' > "$tmp/nobypass.mjs"
  got="$(scan "$tmp" | sed -n 's#^  FAIL .*/\([^/]*:[0-9]*\)$#\1#p' | tr '\n' ' ' | sed 's/ $//')"
  rm -rf "$tmp"
  if [ "$got" = "$expected" ]; then
    echo "bypass-scope-guard self-test PASS — reported: $got"; return 0
  fi
  echo "bypass-scope-guard self-test FAIL — expected [$expected], got [$got]"; return 1
}

if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi

echo "bypass-scope-guard (MEH-3607) — scanning: $SCAN_DIR"
echo "Rule: the Vercel bypass secret never goes in a browser context's extraHTTPHeaders."
if scan "$SCAN_DIR"; then
  echo "OK — no browser context sends the bypass secret to every host."
  exit 0
fi
echo
echo "Use scopeBypassToOrigin() from frontend/e2e/_bypass-scope.mjs, which sends"
echo "the headers to the target origin only. See .claude/rules/testing.md, staging step 2."
exit 1
