# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-18

## Last session
Date: 2026-04-18
PR merged/opened: #142 (feature/meh-two-row-filter-chips) — OPEN, draft
Summary: Two-row filter chip layout (category + attribute) with edge-fade,
  active-chip scroll-into-view, removable filter tags, expanded chip matches
  to cover seed DB category names, border-top on legend collapsible.

## Current state
Branch: feature/meh-two-row-filter-chips
Status: PR #142 open as draft. Awaits user approval + merge to staging.
  After merge → start feature/meh-XX-filter-overflow (Task A: trigger chip
  + FilterBottomSheet for 15+ chip scalability).

## Next task
Linear issue: MEH-XX — filter overflow chip + bottom sheet
Description: Add "סינון (N) +" trigger chip at end of category row when
  total chips > VISIBLE_CHIP_LIMIT (=5). Opens 75vh bottom sheet with all
  filters + "החל סינון" apply button. Branch off staging AFTER #142 merges.
First step: Merge #142 → git checkout staging → git pull →
  git checkout -b feature/meh-XX-filter-overflow.

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| /producers — build from scratch | Migrating homepage is too risky | April 2026 |
| Analytics — Option C (lib/analytics.js) | No backend PR needed | April 2026 |
| No sidebar on /producers | Top bar fits Israeli UX + filter count | April 2026 |
| Placeholder: category emoji + initials | Better identity than leaf icon | April 2026 |
| ProducerCard: remove 5-icon footer | 0/12 benchmarks show inline contact row | April 2026 |
| RTL: logical properties only | Physical left-*/right-* cause RTL bugs | April 2026 |

## Open PRs
| # | Title | Status | Waiting for |
|---|-------|--------|-------------|
| 142 | feat: two-row filter chip layout | Draft | User approval + merge |

## Known issues (not yet filed)
- Phase 3 text-right sweep on forms — awaiting decision
- /producers sort param needs backend PR (Phase 2)
- ProducerCard heart/favorite — Phase C not yet implemented

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
