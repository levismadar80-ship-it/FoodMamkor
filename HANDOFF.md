# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-18

## Last session
Date: 2026-04-18
PR merged/opened: #154 (feature/meh-61b-header-search) — MERGED to staging
                 #155 (feature/meh-61c-url-filter-persistence) — MERGED to staging
                 #156 (feature/meh-61d-login-improvements) — MERGED to staging
                 #157 (feature/meh-61e-hero-redesign) — MERGED to staging
                 #158 (feature/meh-61a-onboarding) — MERGED to staging
Summary:
  Wave 3 (MEH-61) fully complete (all 5 features shipped):
  PR #154 (61b): mobile search icon + "/" keyboard shortcut → /search?focus=1.
  PR #155 (61c): full URL-param persistence for all chip filters on homepage.
  PR #156 (61d): register page brand mark, value-prop strip, OAuth guard.
  PR #157 (61e): hero search pill spec-accurate sizing, aria-labels.
  PR #158 (61a): first-visit 4-step onboarding tour (use-onboarding.js singleton,
    OnboardingTip.jsx, steps 0-1 on homepage inline, steps 2-3 above BottomNav tabs,
    2s delay on step 0, 7-day localStorage expiry).

## Current state
Branch: staging (clean, all PRs squash-merged)
Staging HEAD: a356823

## Next task
Wave 3 complete. Candidate next tasks (confirm with user):
  - ProducerCard heart/favorite Phase C (post-login replay — known issue below)
  - Contact-click analytics endpoint
  - Lightbox for gallery images
  - Events section on producer detail page (feature/meh-XX-producer-events slot)
  - availability_return_date schema change (v2 backend)

First step: confirm which task → git checkout staging → git pull → git checkout -b feature/[description]

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| CHIPS_CONFIG replaces HOME_TOGGLE_CHIPS | Single source of truth for chip definitions | April 2026 |
| ProducersClient uses ChipScrollRow (done) | Inline chips swapped for ChipScrollRow | April 2026 |
| /producers — build from scratch | Migrating homepage is too risky | April 2026 |
| Analytics — Option C (lib/analytics.js) | No backend PR needed | April 2026 |
| No sidebar on /producers | Top bar fits Israeli UX + filter count | April 2026 |
| Placeholder: category emoji + initials | Better identity than leaf icon | April 2026 |
| ProducerCard: remove 5-icon footer | 0/12 benchmarks show inline contact row | April 2026 |
| RTL: logical properties only | Physical left-*/right-* cause RTL bugs | April 2026 |
| Backend sort defaults newest-first | Deterministic pagination, no PostGIS needed | April 2026 |
| Worktree commits must come from main repo | Signing server rejects /tmp worktree paths | April 2026 |
| Sidebar: no "צרי קשר" header | Primary CTA speaks for itself | April 2026 |
| WA share button: gray outlined | Avoids green conflict with primary WA CTA | April 2026 |
| Vacation banner: slate not amber | Neutral unavailable vs warm/sale semantics | April 2026 |
| ParallaxQuote uses Ken Burns (not fixed) | "Fixed feels dated" — deliberate choice | April 2026 |
| Onboarding: module singleton, no Context | Simpler than wrapping layout in a Provider | April 2026 |

## Open PRs
None.

## Known issues (not yet filed)
- Phase 3 text-right sweep on forms — awaiting decision
- ProducerCard heart/favorite — Phase C not yet implemented (post-login replay)
- git worktree + signing server: /tmp worktrees can't sign commits; must apply
  patch in main repo. Workaround: save diff, remove worktree, checkout branch
  in main repo, apply patch, commit.

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
