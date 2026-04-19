# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-18

## Last session
Date: 2026-04-19
PR merged/opened: #168 (feature/infinite-scroll-producers) — MERGED to staging
                 #169 (feature/meh-40-hide-empty-neighbor-section) — MERGED to staging
Summary:
  PR #168: Infinite scroll on /producers — IntersectionObserver replaces
    pagination; PAGE_SIZE=24; live counter; branded spinner; end-of-list
    message; SEO ServerPageLinks kept as fallback. No visible change until
    catalog > 24 items.
  PR #169: MEH-40 — hide "מהמטבח של השכן" homepage section entirely when
    homeProducts=[]. Entire <section> wrapped in homeProducts.length > 0 &&;
    empty-state paragraph removed.

  Previous session PRs (2026-04-18):
  #165 CLAUDE.md Rule 16 + .gitignore, #166 MEH-94 design token sweep,
  #167 staging→main release

## Current state
Branch: staging (clean, all PRs squash-merged)
Staging HEAD: 9ef24bc
Summary:
  PR #165: CLAUDE.md Rule 16 (git worktrees for parallel features) + .gitignore
    (.claude/worktrees/). Old rules 16→17, 17→18, 18→19.
  PR #166: MEH-94 + design token sweep across 5 files:
    - HomeProductCard: low-rating badge yellow→slate-neutral (MEH-94)
    - globals.css: .btn-whatsapp utility (single source for WA green)
    - MapClient (8 fixes), ProducerDetail (7 fixes), NeighborClient (2 fixes)
    - 13 inline hex instances → Tailwind tokens (bg-light, bg-primary-dark,
      border-border, text-site-muted, etc.)
    - WA group link: green outline → gray outline per HANDOFF decision

  Previous session PRs (same date, earlier):
  PR #164 (design-review workflow install + full site audit)

## Current state
Branch: staging (clean, in sync with main)
Staging HEAD: 7b1c10b
Main HEAD: e42127e (production release — all PRs #147–#166)

## Next task
Infinite scroll + MEH-40 shipped. Candidate next tasks (confirm with user):
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
