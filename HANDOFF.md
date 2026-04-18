# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-18

## Last session
Date: 2026-04-18
PR merged/opened: #148 (feature/meh-60-producers-frontend-polish) — MERGED to staging
                 #149 (feature/meh-61-producers-backend-sort) — MERGED to staging
Summary: Two parallel PRs completing /producers discovery page polish.
  PR #148 (frontend): URL param sync (useSearchParams + router.replace in
    ProducersClient — filters persist in URL / back-button / shareable links),
    Suspense boundary on producers page.jsx, category emoji + initials placeholder
    in ProducerCard (replaces Leaf icon), lib/analytics.js Option-C stub
    (console.log dev, no-op prod) + 4 trackEvent call sites,
    RecentlyViewedStrip component (localStorage pills above chip bar).
  PR #149 (backend): GET /producers — default ORDER BY created_at DESC for
    non-geo path (was undefined order), sort=rating param (avg_rating DESC),
    new filter params: city (producer's own city), is_available_today, grass_fed.
    Updated docs/DATA.md.

## Current state
Branch: staging (clean, both PRs squash-merged)

## Next task
Linear issue: MEH-61 Wave 3 — 5 features, one PR each (in priority order):
  1. First-visit onboarding tours (useFirstVisit hook, 4 locations)
  2. Global search in Header (desktop MagnifyingGlass → /search?focus=1)
  3. URL-param filter persistence on homepage (category, city, delivery)
  4. Login/register page improvements (forgot-password, value-prop strip, placeholders)
  5. Hero redesign (100vh full-bleed, parallax, DESIGN.md spec — do last)

First step: confirm which Wave 3 feature to start → git checkout staging →
  git pull origin staging → git checkout -b feature/meh-6X-[description]
Do NOT start until user confirms which feature.

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

## Open PRs
None currently open.

## Known issues (not yet filed)
- Phase 3 text-right sweep on forms — awaiting decision
- ProducerCard heart/favorite — Phase C not yet implemented
- analytics.js prod hook not wired — stub only, needs Plausible/PostHog in future PR

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
