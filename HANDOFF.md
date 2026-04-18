# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-18

## Last session
Date: 2026-04-18
PR merged/opened: #144 (feature/producers-grid-client) — MERGED to staging
Summary: PR-1 of /producers discovery redesign. Converted /producers from
  no-filter SSR page to SSR shell + ProducersClient (client island). Added
  4 boolean filter chips (כשר / אורגני / משלוח / מאומת), grid-cols-2 mobile
  fix, active-filter strip with counter, 3 honest empty states. Extracted
  buildChipParams + CHIPS_CONFIG to lib/producer-filters.js (shared between
  homepage and ProducersClient). Resolved merge conflict with #142 (ChipScrollRow
  landed on staging) by keeping ChipScrollRow and replacing HOME_TOGGLE_CHIPS
  with CHIPS_CONFIG.

## Current state
Branch: feature/producers-grid-client (merged, can delete)
Staging: PR #144 squash-merged. #142 (ChipScrollRow) also already on staging.

## Next task
Linear issue: PR-2 — /producers "בעיר שלי" chip + ChipScrollRow integration
Description: Now that #142 (ChipScrollRow) and #144 (ProducersClient) are on
  staging, add "בעיר שלי" chip to ProducersClient using LocationModal (already
  on staging from PR #130). Also swap ProducersClient's inline chip buttons for
  ChipScrollRow (same pattern as homepage).
First step: git checkout staging → git pull origin staging →
  git checkout -b feature/producers-filter-pr2

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| CHIPS_CONFIG replaces HOME_TOGGLE_CHIPS | Single source of truth for chip definitions | April 2026 |
| ProducersClient uses inline chip buttons (PR-1) | ChipScrollRow swap deferred to PR-2 | April 2026 |
| /producers — build from scratch | Migrating homepage is too risky | April 2026 |
| Analytics — Option C (lib/analytics.js) | No backend PR needed | April 2026 |
| No sidebar on /producers | Top bar fits Israeli UX + filter count | April 2026 |
| Placeholder: category emoji + initials | Better identity than leaf icon | April 2026 |
| ProducerCard: remove 5-icon footer | 0/12 benchmarks show inline contact row | April 2026 |
| RTL: logical properties only | Physical left-*/right-* cause RTL bugs | April 2026 |

## Open PRs
None currently open.

## Known issues (not yet filed)
- Phase 3 text-right sweep on forms — awaiting decision
- /producers sort param needs backend PR (Phase 2)
- ProducerCard heart/favorite — Phase C not yet implemented

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
