# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-18

## Last session
Date: 2026-04-18
PR merged/opened: #150 (feature/meh-producer-detail-sidebar-v2) — MERGED to staging
  Also open (previous session): #148 (feature/meh-60-producers-frontend-polish) — DRAFT
                                #149 (feature/meh-61-producers-backend-sort) — DRAFT
Summary: Producer detail sidebar v2 — visual audit follow-up (5 changes):
  1. Initials fix: word-initial algorithm (words[0][0]+words[1][0]) replaces
     slice(0,2). "גבינות הר הגולן" → "גה" not "גב" (which means back/spine).
  2. Vacation banner: amber → slate (neutral unavailable, not warm/sale).
     is_available_today chip suppressed during vacation.
  3. Sidebar declutter: removed "צרי קשר" header, WhatsAppShareButton (green
     conflict), and MapButton. Sidebar now: primary CTA → 2-tile contact grid
     → FollowButton → WA group link → ShareButton.
  4. Main column action row: MapButton + WhatsAppShareButton (gray outlined,
     "שלחי לחברה") added after inline CTA, visible at all breakpoints.
  5. Mobile highlights strip: icon-only below sm: breakpoint (~24px fold saving).
Summary of previous session PRs (#148, #149):
  PR #148 (frontend): URL param sync, Suspense boundary, category emoji + initials
    in ProducerCard, lib/analytics.js Option-C stub, RecentlyViewedStrip component.
  PR #149 (backend): GET /producers default ORDER BY created_at DESC, sort=rating
    param, city/is_available_today/grass_fed filter params. Updated docs/DATA.md.

## Current state
Branch: feature/meh-producer-detail-sidebar-v2 (merged, can delete)
Staging: PR #150 squash-merged (98b96385). PRs #148 and #149 still open as drafts.

## Next task
PRs #148 and #149 need user review + Vercel preview check before merging to staging.
After those: Wave 3 (Linear MEH-61), 5 features, separate PRs each:
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
| Sidebar: no "צרי קשר" header | Primary CTA speaks for itself | April 2026 |
| WA share button: gray outlined | Avoids green conflict with primary WA CTA | April 2026 |
| Vacation banner: slate not amber | Neutral unavailable vs warm/sale semantics | April 2026 |

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
