# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-18

## Last session
Date: 2026-04-18
PR merged/opened: #148 (feature/meh-60-producers-frontend-polish) — DRAFT open
                 #149 (feature/meh-61-producers-backend-sort) — DRAFT open
Summary: Two parallel PRs for /producers discovery page polish.
  PR #148 (frontend): URL param sync (useSearchParams + router.replace in
    ProducersClient so filters persist in URL / back-button / shareable links),
    Suspense boundary on producers page.jsx (required for useSearchParams),
    category emoji + initials placeholder in ProducerCard (replaces Leaf icon),
    lib/analytics.js Option-C stub (console.log dev, no-op prod) + 4 trackEvent
    call sites, RecentlyViewedStrip component (localStorage pills above chip bar).
  PR #149 (backend): GET /producers — default ORDER BY created_at DESC for non-geo
    path (was undefined order), sort=rating param (avg_rating DESC), new filter
    params: city (producer's own city), is_available_today, grass_fed.
    Updated docs/DATA.md.

## Current state
Branch: feature/meh-61-producers-backend-sort (main repo checkout after PR B work)
  feature/meh-60-producers-frontend-polish — pushed, PR #148 open (draft), lint ✅
  feature/meh-61-producers-backend-sort — pushed, PR #149 open (draft), lint queued

## Next task
Both PRs need user review + Vercel preview check before merging to staging.
Linear issue MEH-61 describes Wave 3 (5 features, separate PRs each):
  1. First-visit onboarding tours (useFirstVisit hook, 4 locations)
  2. Global search in Header (desktop MagnifyingGlass icon → /search?focus=1)
  3. URL-param filter persistence on homepage
  4. Login/register page improvements
  5. Hero redesign (100vh full-bleed, parallax, DESIGN.md spec — do last)

First step for Wave 3: confirm user wants to proceed → git checkout staging →
  git pull origin staging → git checkout -b feature/meh-6X-[description]
Do NOT start until user says go.

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| CHIPS_CONFIG replaces HOME_TOGGLE_CHIPS | Single source of truth for chip definitions | April 2026 |
| ProducersClient uses ChipScrollRow (PR-2 done) | Inline chips swapped for ChipScrollRow | April 2026 |
| /producers — build from scratch | Migrating homepage is too risky | April 2026 |
| Analytics — Option C (lib/analytics.js) | No backend PR needed | April 2026 |
| No sidebar on /producers | Top bar fits Israeli UX + filter count | April 2026 |
| Placeholder: category emoji + initials | Better identity than leaf icon | April 2026 |
| ProducerCard: remove 5-icon footer | 0/12 benchmarks show inline contact row | April 2026 |
| RTL: logical properties only | Physical left-*/right-* cause RTL bugs | April 2026 |
| Backend sort defaults newest-first | Deterministic pagination, no PostGIS needed | April 2026 |
| Worktree for parallel PRs but sign from main | Signing server rejects /tmp paths | April 2026 |

## Open PRs
- #148 feature/meh-60-producers-frontend-polish → staging (draft, lint ✅, Vercel building)
- #149 feature/meh-61-producers-backend-sort → staging (draft, lint queued, Vercel building)

## Known issues (not yet filed)
- Phase 3 text-right sweep on forms — awaiting decision
- ProducerCard heart/favorite — Phase C not yet implemented
- git worktree + signing server: /tmp worktrees can't sign commits; must apply
  patch in main repo. Workaround: save diff, remove worktree, checkout branch
  in main repo, apply patch, commit. Add to regression notes if this recurs.

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
