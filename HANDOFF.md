# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-19

## Last session
Date: 2026-04-19
PR merged/opened: #176 (feature/meh-52-group-buy) — OPEN, awaiting review
Summary:
  PR #176: MEH-52 — קבוצת רכש MVP (group buy with commit counter + price unlock).
    - GroupBuy + GroupBuyCommit models (auto-created via create_all, no migration needed)
    - GET/POST /group-buys, GET/POST/DELETE /group-buys/{id}/commit (producer + public)
    - GET/PATCH /admin/group-buys admin endpoints (separate admin_router)
    - Auto-funds when commits reach min_participants; reverts if cancelled below threshold
    - /group-buys list page — cards with progress bar, city/status filter
    - /group-buys/[id] detail — commit form, 30s live polling, confetti on fund, WA share
    - /producer/dashboard/group-buys — my group buys tab + inline create form
    - /admin/group-buys — status management table
    - Quick-link cards added to producer dashboard + admin dashboard

  Previous session: #175 MEH-49 referral loop (MERGED)

## Current state
Branch: feature/meh-52-group-buy (PR #176 open, Vercel building)
Staging HEAD: cd4d8fe
Main HEAD: e42127e (production release — all PRs #147–#166; staging ahead by #168–#175)

## Next task
After PR #176 merges:
  - Admin analytics: add referral count per producer (skipped from MEH-49 scope)
  - ProducerCard heart/favorite Phase C (post-login replay)
  - Lightbox for gallery images
  - Events section on producer detail page
  - availability_return_date schema change (v2 backend)

First step: approve PR #176 → merge → git checkout staging → git pull → next feature

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| Design-review workflow installed | OneRedOak template customized for mehamakor brand | April 2026 |
| CLAUDE.md Rule 16: git worktrees | Parallel features → worktrees not stash; rules 16→17→18→19 | April 2026 |
| .btn-whatsapp utility class | Single source for WA green (#25D366) across MapClient + ProducerDetail | April 2026 |
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
#176 — MEH-52 קבוצת רכש MVP (feature/meh-52-group-buy) — awaiting review + Vercel preview

## Known issues (not yet filed)
- Phase 3 text-right sweep on forms — partially done in PR #162
  (register/producer only); register/page.js + other forms still TBD
- ProducerCard heart/favorite — Phase C not yet implemented (post-login replay)
- git worktree + signing server: /tmp worktrees can't sign commits; must apply
  patch in main repo. Workaround: save diff, remove worktree, checkout branch
  in main repo, apply patch, commit.
- Map WhatsApp CTA: phone now in ProducerListOut (PR #162) so buttons can
  surface, but old producer records without phone still skip the button.
  Verify in production after staging redeploy.
- Linear bot naming conflict: MEH-62/63/64/65 in Linear are CLAUDE.md rule
  docs, not these PRs. Linkback is cosmetic only, no impact.
- Design audit token-drift findings: FIXED in PR #166. All inline hex instances
  replaced with Tailwind tokens. No remaining token-drift items from audit.

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
