# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-19

## Last session
Date: 2026-04-19
PR merged/opened: #180 + #181 — MERGED to staging
Summary:
  PR #180: feat(map): circle pins with Phosphor icons — design system v2
    - map-categories.js: replaced `emoji` field with Phosphor `icon` component +
      `iconName` string. Icons: Cow, Plant, Cheese, Bread, JarLabel, FlowerTulip, Leaf.
    - MapComponent.jsx: new `createCategoryMarker` — 28/36px circle divIcon, white
      Phosphor icon inside, verified badge (✓, 10px, border-white), combined box-shadow
      string (active glow + premium gold ring), opacity:0.4 for visited/dimmed.
    - MapClient.jsx: removed `{cat.emoji}` from legend display.

  PR #181: feat(map): tile warmth + price gold + category dot
    - globals.css: `.leaflet-tile-pane { filter: saturate(0.7) brightness(1.05) sepia(0.1); }`
    - MapProducerCard.jsx: category color dot (bottom-end corner of thumbnail, 10px,
      border-white, aria-hidden); price label split to own line in Cormorant Garamond
      italic gold (#8B6914), category name on preceding line in site-muted 12px.

  Previous: #179 MEH-55 holiday timeline (MERGED to staging)
  Previous: #178 MEH-54 favorite alerts (MERGED to staging)

## Current state
Branch: staging (clean — both PRs squash-merged)
Staging HEAD: 62678c7 (feat(map): tile warmth + price gold + category dot #181)
Main HEAD: e42127e (production release — staging ahead by #168–#181)

## Next task
Candidate tasks (in rough priority order):
  1. Admin analytics: add referral count per producer (skipped from MEH-49 scope)
  2. ProducerCard heart/favorite Phase C (post-login replay)
  3. Lightbox for gallery images
  4. Events section on producer detail page
  5. availability_return_date schema change (v2 backend)

Deferred from design bundle (do NOT start without explicit user confirmation):
  - Item 4: New homepage editorial sections (EditorialBreath, MeetAProducer, HowItWorks,
    revised Hero, revised CategoryGrid)
  - Item 5: Botanical logo mark for Header/Layout

First step: pick a task from the candidate list above, branch from staging:
  git checkout staging && git pull origin staging && git checkout -b feature/meh-XX-description

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| Map pins: circle divIcon (not teardrop) | Design system v2 — consistent with benchmark apps | April 2026 |
| Phosphor icons in divIcon via renderToStaticMarkup | Only valid approach — MapComponent is ssr:false | April 2026 |
| Combined box-shadow string (not cascading) | CSS cascade: last box-shadow wins; must merge into one value | April 2026 |
| Tile warmth in globals.css (not MapComponent) | .leaflet-tile-pane only exists inside Leaflet — safe global scope | April 2026 |
| MEH-54: FavoriteAlert separate from ProducerFollower | ProducerFollower = bookmarks; FavoriteAlert = granular per-type alerts | April 2026 |
| MEH-54: fail-open for push (no VAPID keys = no-op) | Consistent with AI fail-open rule; WA still works independently | April 2026 |
| MEH-54: delivery_area_cities fix in producer_me.py | Was silently ignored via setattr; now uses _apply_delivery_cities() like admin | April 2026 |
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
None (all recent PRs merged to staging)

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
- MEH-54 VAPID keys: VAPID_PRIVATE_KEY + VAPID_PUBLIC_KEY must be set in
  Railway env for push to work. Generate with pywebpush. Fail-open until set.

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
