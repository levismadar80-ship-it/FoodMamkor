#!/usr/bin/env bash
#
# Module:   copy-length-guard
# Purpose:  A button label over 3 words, an SEO title over 60 characters or an
#           SEO description over 160, NEW in frontend/messages/he.json. Logic and
#           self-test live in copy_length.py next to this file; this wrapper is
#           what run-all.sh discovers.
# History:  MEH-3670 (creation, item 8 of MEH-3652).
#
# USAGE
#   bash scripts/checks/copy-length-guard.sh                    # the gate
#   bash scripts/checks/copy-length-guard.sh --update-baseline  # regenerate
#   bash scripts/checks/copy-length-guard.sh --self-test        # fixtures
set -uo pipefail
exec python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/copy_length.py" "$@"
