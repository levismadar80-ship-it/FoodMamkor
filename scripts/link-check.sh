#!/usr/bin/env bash
#
# Module:   link-check.sh
# Purpose:  One command that produces a link report from a clean state — build
#           the frontend, start it, crawl it, stop it. The whole point of the
#           card is that the sweep is repeatable, and a checker that needs four
#           remembered steps is not.
# Touches:  frontend/.next (a production build), one localhost port.
# Does NOT: live in scripts/checks/. That directory is auto-discovered by
#           scripts/checks/run-all.sh and becomes a leg of the required
#           Repo-guards gate; MEH-1963 scopes CI wiring out. Also does NOT
#           decide what counts as broken — scripts/link-check.mjs owns that.
# Related:  scripts/link-check.mjs (the crawler + its --self-test),
#           frontend/public/robots.txt (the exclusion set honoured).
# History:  MEH-1963 (creation).
#
# Usage:  bash scripts/link-check.sh [--skip-build] [--port N] [-- <crawler args>]
#
# EXIT: 0 = no broken internal links · 1 = broken links, or the crawler's
#       preflight found the target cannot report a 404 at all.
#
# READ THE WARNING THE CRAWLER PRINTS. Against a target with no backend, a
# single-segment miss (/<slug>) answers 200 rather than 404 — middleware.js
# fails open by design (MEH-1899) — so those links are NOT validated. The
# crawler detects that condition itself and says so; it is a scoped green, not
# an absolute one.
set -euo pipefail

cd "$(dirname "$0")/.."

PORT=3000
SKIP_BUILD=0
CRAWLER_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    --port) PORT="$2"; shift 2 ;;
    --) shift; CRAWLER_ARGS=("$@"); break ;;
    *) CRAWLER_ARGS+=("$1"); shift ;;
  esac
done

# Run the crawler's own self-test FIRST. Its robots resolver is a classifier,
# and a classifier that cannot tell an allowed path from a disallowed one makes
# every number after it meaningless (.claude/rules/testing.md — "where the
# assertion is a classifier, ship the self-test, and run it first").
echo "== link-check self-test =="
node scripts/link-check.mjs --self-test

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "== next build =="
  (cd frontend && npm run build >/dev/null)
fi

echo "== next start (port $PORT) =="
# `setsid` puts the server in its OWN process group so cleanup can kill the
# whole tree — `next start` spawns a `next-server` child, and killing just the
# wrapper leaves the port held for the next run.
#
# The group matters in the other direction too, and getting it wrong is not
# theoretical: the first version read the child's PGID with `ps -o pgid=` and
# killed that. A plain background job INHERITS this script's process group, so
# that killed the script itself — the crawl finished, printed `broken: 0`, and
# the run still exited 143 with "Terminated". A cleanup that takes down its own
# caller turns every green into a red.
setsid bash -c "cd frontend && exec npx next start -p $PORT" >/dev/null 2>&1 &
SERVER_PID=$!
cleanup() {
  local pgid
  pgid="$(ps -o pgid= "$SERVER_PID" 2>/dev/null | tr -d ' ')"
  if [[ -n "$pgid" && "$pgid" != "$$" && "$pgid" != "$(ps -o pgid= $$ | tr -d ' ')" ]]; then
    kill -- "-$pgid" 2>/dev/null || true
  else
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "http://localhost:$PORT/"; then break; fi
  sleep 1
done

echo "== crawl =="
node scripts/link-check.mjs "http://localhost:$PORT" "${CRAWLER_ARGS[@]}"
