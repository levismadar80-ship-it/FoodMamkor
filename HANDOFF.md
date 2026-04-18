# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-18

## Last session
Date: 2026-04-18
PR merged/opened: #139 (feature/session-handoff)
Summary: Added session handoff system + RTL regression protection.

## Current state
Branch: staging (clean after this PR)
Status: RTL fixes merged. Producers page redesign pending.

## Next task
Linear issue: MEH-XX — /producers page redesign
Description: Build ProducersClient.jsx from scratch (not migrate from homepage).
First step: Read audit findings from previous session, then implement Phase 1.

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
| — | — | — | — |

## Known issues (not yet filed)
- Phase 3 text-right sweep on forms — awaiting decision
- /producers sort param needs backend PR (Phase 2)
- ProducerCard heart/favorite — Phase C not yet implemented

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
