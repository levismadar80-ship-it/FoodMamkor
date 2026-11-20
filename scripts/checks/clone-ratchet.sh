#!/usr/bin/env bash
#
# Module:   clone-ratchet.sh
# Purpose:  Fail when a PR copies a block of code (8+ meaningful lines) from
#           one source file into another, beyond the copies frozen in
#           scripts/checks/clone-baseline.txt. Copy-paste debt only shrinks.
# Touches:  nothing — reads tracked files under backend/app and frontend/
#           {app,components,lib}.
# Does NOT: count tests, generated code or alembic revisions; judge whether a
#           listed copy is fine.
# Related:  scripts/checks/lib/clone_ratchet.py (the scanner).
# History:  MEH-3464 (creation).
#
# CONTROL: --self-test builds two fake files with a shared block and requires
# it to be found (and boilerplate not to be). It runs first on every call.
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1
python3 scripts/checks/lib/clone_ratchet.py --self-test || { echo "clone-ratchet: self-test failed — every result below is void."; exit 1; }
[ "${1:-}" = "--self-test" ] && exit 0
python3 scripts/checks/lib/clone_ratchet.py "$REPO_ROOT" "$@"
