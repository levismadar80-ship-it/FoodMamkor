# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-19

## Last session
Date: 2026-04-19
PR merged/opened: #171 (feature/meh-admin-role-management) — MERGED to staging
Summary:
  PR #171: Admin role management on /admin/users.
    - Replace role <select> with explicit "העלי לאדמין" / "הסירי הרשאות" buttons
    - Confirmation modal with Hebrew text before applying role change
    - "אדמין" badge (green #EAF3DE/#2e6853) + "מוגן" badge (gold) for super-admin
    - Hide demote button for super-admin (levismadar80@gmail.com) and own row
    - Backend: SUPER_ADMIN_EMAIL constant + 403 guards in update_user_role

  Previous session PRs (same date, earlier):
  #170 MEH-47 BottomNav smart auth slot

## Current state
Branch: staging (clean, all PRs squash-merged)
Staging HEAD: 30069d7
Main HEAD: e42127e (production release — all PRs #147–#166; staging ahead by #168–#171)

## Next task
Admin role management shipped. Candidate next tasks (confirm with user):
  - ProducerCard heart/favorite Phase C (post-login replay — known issue below)
  - Contact-click analytics endpoint
  - Lightbox for gallery images
  - Events section on producer detail page (feature/meh-XX-producer-events slot)
  - availability_return_date schema change (v2 backend)

First step: confirm which task → git checkout staging → git pull → git checkout -b feature/[description]

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
None.

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
