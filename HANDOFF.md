# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-18

## Last session
Date: 2026-04-18
PR merged/opened: #164 (feature/design-review-workflow) — MERGED to staging
Summary:
  Installed /design-review workflow (OneRedOak/claude-code-workflows) customized
  for מהמקור. Tooling-only; no app code touched.
  - .claude/commands/design-review.md (slash command)
  - .claude/agents/design-review.md (subagent, Playwright-enabled)
  - .claude/commands/design-review/design-principles.md (mehamakor brand tokens,
    RTL rules, component rules, Hebrew copy rules, triage matrix)
  Ran full site audit on 8 components. Theme of findings: token drift (inline
  hex values bypassing Tailwind design system) — RTL, tap targets, and Hebrew
  copy are all solid.

  Previous session PRs (2026-04-18 earlier):
  PR #159–#162 (bug-hunt audit cycle, see prior HANDOFF entry in git log)
  PR #163 (HANDOFF.md update)

## Current state
Branch: staging (clean, all PRs squash-merged)
Staging HEAD: 65e2e08

## Next task
Design-review workflow installed. Candidate next tasks (confirm with user):
  - Fix design audit findings (token drift sweep — inline hex → Tailwind tokens,
    HomeProductCard yellow badge → slate, WA green utility class):
    ProducerDetail.jsx:311-326, MapClient.jsx:507/543/580/618/634,
    HomeProductCard.jsx:71, NeighborClient.jsx:87, ProducerDetail.jsx:758
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
- Design audit token-drift findings (PR #164): inline hex values in
  ProducerDetail.jsx:311-326/758, MapClient.jsx:507/543/580/618/634,
  HomeProductCard.jsx:71 (yellow badge → slate), NeighborClient.jsx:87.
  Not yet filed as Linear issues. Batch-fix PR suggested as next task.

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
