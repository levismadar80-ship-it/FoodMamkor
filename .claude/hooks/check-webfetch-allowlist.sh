#!/usr/bin/env bash
# MEH-397 Layer 1: blocks WebFetch outside the supply-chain allowlist.
# Exit 2 = block. Fail-closed if jq missing (deny by default for safety).
#
# Allowlist (per Linear MEH-397):
#   github.com, anthropic.com, npmjs.com, pypi.org,
#   mehamakor.online (incl. staging.mehamakor.online),
#   vercel.com, railway.app
# Subdomain wildcards permitted (api.github.com, docs.anthropic.com, etc.).

set -u

if ! command -v jq >/dev/null 2>&1; then
  echo "WebFetch denied: jq not available; cannot verify host (MEH-397 fail-closed)." >&2
  exit 2
fi

input=$(cat)
url=$(echo "$input" | jq -r '.tool_input.url // ""')

if [ -z "$url" ]; then
  exit 0
fi

# Extract host: strip scheme, strip path, strip port, lowercase.
host=$(printf '%s' "$url" \
  | sed -E 's|^[a-zA-Z][a-zA-Z0-9+.-]*://||' \
  | sed -E 's|/.*$||' \
  | sed -E 's|@.*$||' \
  | sed -E 's|:[0-9]+$||' \
  | tr '[:upper:]' '[:lower:]')

if [ -z "$host" ]; then
  echo "WebFetch denied: could not parse host from '$url' (MEH-397)." >&2
  exit 2
fi

case "$host" in
  github.com|*.github.com) exit 0 ;;
  anthropic.com|*.anthropic.com) exit 0 ;;
  npmjs.com|*.npmjs.com|npmjs.org|*.npmjs.org) exit 0 ;;
  pypi.org|*.pypi.org) exit 0 ;;
  mehamakor.online|*.mehamakor.online) exit 0 ;;
  vercel.com|*.vercel.com) exit 0 ;;
  railway.app|*.railway.app) exit 0 ;;
esac

echo "WebFetch denied: host '$host' not in MEH-397 allowlist." >&2
echo "Allowlist: github.com, anthropic.com, npmjs.com, pypi.org, mehamakor.online, vercel.com, railway.app (+ subdomains)." >&2
exit 2
