#!/usr/bin/env bash
#
# vv-pin-guard.sh — BLOCKING guard (MEH-3889): every layer anchored to the
# bottom of the screen opts into the iOS drift pin.
#
# WHY
#   iOS 26 Safari can lay out `position: fixed` layers against a stale
#   viewport, after the keyboard closes or a fast scroll, so anything with
#   `bottom: …` floats hundreds of px up the screen (Sapir's 31/10 and 26/11
#   iPhone screenshots). components/IosViewportPin.jsx measures the gap and
#   publishes --vv-shift; a layer is re-seated only if it carries `vv-pin`
#   (globals.css). On 26/11 seven bottom sheets were found without it — each
#   one a copy of the same bug waiting for a phone to find it.
#
# THE RULE
#   In frontend/app, frontend/components and frontend/lib (tests excluded), a
#   string literal that holds the `fixed` class and either
#     - a `bottom-…` class (a bar, sheet or button pinned to the bottom), or
#     - `inset-0` together with `items-end` (a backdrop whose panel sits at
#       the bottom — pin the PANEL, so the file must say `vv-pin` somewhere)
#   must carry `vv-pin`, unless `vv-pin-exempt: <reason>` is on the line or an adjacent one.
#   Responsive-only `md:fixed` / `lg:fixed` and `hidden md:…` desktop layers
#   are out of scope: the drift is a phone bug.
#
# KNOWN LIMIT
#   A class string built from variables, or a `style={{ position: "fixed" }}`
#   object, is not read. Only literal class strings are.
#
# USAGE
#   bash scripts/checks/vv-pin-guard.sh               # exit 1 on a finding
#   bash scripts/checks/vv-pin-guard.sh <dir>...      # scan other trees
#   bash scripts/checks/vv-pin-guard.sh --self-test   # classifier check
#
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

scan() {
  node - "$@" <<'JS'
const fs = require("fs");
const path = require("path");
const roots = process.argv.slice(2);
const files = [];
const walk = (d) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", "__tests__", "e2e"].includes(e.name)) continue;
      walk(p);
    } else if (/\.(jsx?|tsx?|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) files.push(p);
  }
};
roots.forEach(walk);
let n = 0;
const lit = /(["'`])((?:(?!\1)[^\\]|\\.)*?)\1/g;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const lines = src.split("\n");
  const fileHasPin = /\bvv-pin\b/.test(src);
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const m of line.matchAll(lit)) {
      const cls = m[2].split(/\s+/);
      if (!cls.includes("fixed")) continue;
      if (cls.includes("hidden")) continue; // desktop-only layer
      const bottom = cls.some((c) => /^-?bottom-/.test(c));
      const endSheet = cls.includes("inset-0") && cls.some((c) => c === "items-end");
      if (!bottom && !endSheet) continue;
      if (bottom && cls.includes("vv-pin")) continue;
      if (endSheet && !bottom && fileHasPin) continue;
      const near = lines.slice(Math.max(0, i - 1), i + 2).join("\n");
      if (/vv-pin-exempt:\s*\S/.test(near)) continue;
      console.log(`  FAIL ${f}:${i + 1}`);
      console.log(`      ${line.trim().slice(0, 160)}`);
      n++;
    }
  });
}
process.exit(n ? 1 : 0);
JS
}

self_test() {
  local tmp got expected="a.jsx:2 a.jsx:6 b.jsx:1"
  tmp="$(mktemp -d)"
  cat > "$tmp/a.jsx" <<'FIXTURE'
const ok = <div className="vv-pin fixed inset-x-0 bottom-0" />;
const bad = <div className="fixed inset-x-0 bottom-0 z-sheet" />;
const desk = <aside className="hidden md:flex fixed top-16 bottom-0" />;
const resp = <div className="md:fixed md:bottom-0" />;
// a comment: className="fixed bottom-0"
const bad2 = <div className={`fixed bottom-[calc(1rem+8px)] z-x`} />;
const gap = 1;
// vv-pin-exempt: fixture — rides its own edge var
const ex = <div className="fixed inset-x-0 bottom-0" />;
const top = <div className="fixed inset-x-0 top-0" />;
FIXTURE
  # A backdrop with a bottom panel and no pin anywhere in the file.
  printf 'const s = <div className="fixed inset-0 flex items-end" />;\n' > "$tmp/b.jsx"
  # The same backdrop, with the PANEL pinned: passes.
  printf 'const s = <div className="fixed inset-0 flex items-end"><div className="vv-pin p-4" /></div>;\n' > "$tmp/c.jsx"
  got="$(scan "$tmp" | sed -n 's#^  FAIL .*/\([^/]*:[0-9]*\)$#\1#p' | sort | tr '\n' ' ' | sed 's/ $//')"
  rm -rf "$tmp"
  if [ "$got" = "$expected" ]; then
    echo "vv-pin-guard self-test PASS — reported: $got"; return 0
  fi
  echo "vv-pin-guard self-test FAIL — expected [$expected], got [$got]"; return 1
}

if [ "${1:-}" = "--self-test" ]; then self_test; exit $?; fi
if [ $# -gt 0 ]; then SCAN_DIRS=("$@"); else SCAN_DIRS=(frontend/app frontend/components frontend/lib); fi

echo "vv-pin-guard (MEH-3889) — scanning: ${SCAN_DIRS[*]}"
if scan "${SCAN_DIRS[@]}"; then
  echo "OK — every bottom-anchored fixed layer carries vv-pin (or a vv-pin-exempt reason)."
  exit 0
fi
echo
echo "Add the vv-pin class (components/IosViewportPin.jsx) so iOS drift re-seats it,"
echo "or write 'vv-pin-exempt: <reason>' on the line or an adjacent one."
exit 1
