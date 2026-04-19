# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-19

## Last session
Date: 2026-04-19
PR merged/opened: #178 (feature/meh-54-favorite-alerts) — OPEN (draft)
Summary:
  PR #178: MEH-54 — "הודעי לי כש..." favorite alerts + PWA push notifications.
    - DB: favorite_alerts table (user_id, producer_id, notify_new_event,
      notify_new_product, notify_delivery_area, push_subscription JSON,
      whatsapp_opt_in). UniqueConstraint per (user, producer) pair.
    - Backend: GET/PUT /users/me/favorites/{id}/alerts; GET /push-vapid-key;
      fire_alerts() BackgroundTasks helper (push + Twilio WA); pywebpush added.
    - POST /events hooks → fires notify_new_event to opted-in users.
    - PUT /producers/me: fixed delivery_area_cities (was silently no-op'd via
      setattr); fires notify_delivery_area when new cities added.
    - Frontend: worker/index.js SW push handlers (bundled via next-pwa
      customWorkerDir); lib/push.js subscribe util; AlertPrefsPanel component;
      FavoriteButton shows AlertPrefsPanel inline after first-time favorite;
      /favorites: 🔔 bell per card opens AlertPrefsPanel.

  Previous: #177 MEH-53 vanity URL + story card (MERGED to staging)
  Previous: #176 MEH-52 group buy (MERGED to staging)

## Current state
Branch: feature/meh-54-favorite-alerts (open PR #178 — draft)
Staging HEAD: 144e8d4 (after MEH-53 handoff commit)
Main HEAD: e42127e (production release — staging ahead by #168–#177)

## Next task
After PR #178 is approved + merged:
  - Admin analytics: add referral count per producer (skipped from MEH-49 scope)
  - ProducerCard heart/favorite Phase C (post-login replay)
  - Lightbox for gallery images
  - Events section on producer detail page
  - availability_return_date schema change (v2 backend)

First step: review PR #178 → approve → merge → git checkout staging → git pull → next feature

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
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
- #178: feature/meh-54-favorite-alerts — MEH-54 alerts (draft, awaiting review)

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
