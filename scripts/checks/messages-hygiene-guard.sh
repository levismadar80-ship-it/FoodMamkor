#!/usr/bin/env bash
#
# Module:   messages-hygiene-guard
# Purpose:  A NEW dead key or a NEW copied Hebrew string in
#           frontend/messages/he.json. The logic and its self-test live in
#           messages_hygiene.py next to this file; this wrapper exists so
#           run-all.sh (which runs every executable *.sh here) picks it up.
# History:  MEH-3657 (creation, under MEH-3652).
#
# USAGE
#   bash scripts/checks/messages-hygiene-guard.sh                    # the gate
#   bash scripts/checks/messages-hygiene-guard.sh --update-baseline  # regenerate
#   bash scripts/checks/messages-hygiene-guard.sh --self-test        # fixtures
set -uo pipefail
exec python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/messages_hygiene.py" "$@"
