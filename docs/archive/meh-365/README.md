# MEH-365 archive — PR #440 preserved work

Pre-existing implementation work from [PR #440](https://github.com/levismadar80-ship-it/FoodMamkor/pull/440) (closed without merging on 2026-05-01). Reference for **MEH-426** follow-up ticket. Do not delete.

## Contents

- `consolidation-with-buffer-fix.patch` — full 735-line diff vs `origin/staging` at the time PR #440 was opened. Touches 11 files: rtl-allowlist.txt restructured with explicit `# === PATH EXCEPTIONS` / `# === CONTENT PATTERNS` sections, `check-rtl.sh` refactored to a state-machine parser reading from the allowlist (eliminates the dual source of truth between its inline `ALLOWLIST=( ... )` array and the file), `verify-frontend.md` updated with the same parser plus a per-violation awk that avoids the merged-buffer false-negative, `rtl.md` documents the single-source pattern, plus CHANGELOG / SECURITY / DEPLOYMENT / dependency-audit.yml entries.
- `buffer-bug-fix.awk` — standalone reference for the merged-buffer fix. The awk processes each `--`-separated group from `grep -B1 -A1` and only suppresses a match if a content-pattern (`rtl-ok`) is within ±1 line of THAT specific match — not anywhere in the buffer. Includes inline rationale and the T_adj_6 regression-test description that motivated the fix.

## Context

PR #441 (merged as `c0c0ddf`) shipped the narrower scope (option I — adjacency check only). PR #440's broader scope (consolidation + per-violation awk + buffer-bug fix + T_adj_6) was deferred to MEH-426 to keep PR #441 small and reviewable. The buffer-bug fix is the most important carryover: without it, a single `rtl-ok` marker can silently suppress unrelated violations within `grep -B1 -A1`'s merged context window. PR #441's awk side-steps this by reading lines from disk per-violation instead of using grep's context window, but the per-violation awk in PR #440 is more general and the regression test should land as part of MEH-426.

## How to use

When MEH-426 starts:

```bash
git checkout staging && git pull
git checkout -b feature/meh-426-rtl-consolidation
git apply docs/archive/meh-365/consolidation-with-buffer-fix.patch
# Resolve any conflicts against post-MEH-365 staging.
# The buffer-bug-fix.awk is already inside the patch in verify-frontend.md;
# the standalone .awk file is documentation/reference only.
```

The `buffer-bug-fix.awk` file is sourceable for ad-hoc testing of the per-violation logic against fixture files.

## Provenance

- **Original PR:** https://github.com/levismadar80-ship-it/FoodMamkor/pull/440
- **Closed:** 2026-05-01 (superseded by PR #441 per scope decision)
- **Original branch:** `feature/meh-365-rtl-allowlist-consolidate` (head SHA `a79e33f`)
- **Linear:** MEH-426 (to be opened)
- **Related:** MEH-365 (Done, mechanism shipped via PR #441)
