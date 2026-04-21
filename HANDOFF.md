# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-21

## Last session
Date: 2026-04-21
PR merged/opened: #196 (feature/meh-whatsapp-click-tracking) — MERGED to staging
Summary:
  PR #196: WhatsApp click tracking fix — whatsapp_clicks_week showed 0
    - Root cause: producer_whatsapp_clicks table missing in older Railway DBs
      (model added after initial DB init; create_all never ran for this table)
    - Fix 1: _migrate_columns() now runs CREATE TABLE IF NOT EXISTS
      producer_whatsapp_clicks before the column-level ALTER TABLE loop
    - Fix 2: ProducerWhatsAppClick model gains user_id (nullable UUID FK → users)
      so authenticated clicks are attributed; endpoint accepts optional JWT
    - pytest: TestWhatsAppClickTracking (4 cases) — anonymous click, authed
      click with user_id, 404 on unknown producer, dashboard week count
    - Build ✅, lint ✅, Vercel preview ✅

  PRs #193–#195: MEH-116 full site copy refresh (MERGED to staging)
    - Banned phrases swept: מגדלים קטנים, שכנות שמבשלות, אוכל אמיתי, יצרן→בעל עסק
    - About page full rewrite (Sapir story, accordion tips, testimonials placeholder)
    - ParallaxQuote attribution prop, Footer newsletter redesign
    - Chatbot system prompt updated; auth.py welcome email updated

  Previous: #187 MEH-56 async WhatsApp onboarding (MERGED to staging)

## Current state
Branch: feature/meh-whatsapp-click-tracking (merged) — now on staging
Staging HEAD: e0d69ef (WhatsApp click tracking fix — just merged #196)
Main HEAD: e42127e (production release — staging ahead by multiple PRs)

## Next task
  Producer reviews system (see spec in last user message):
    - DB: producer_reviews table (UNIQUE per user+producer, rating 1–5, body TEXT)
    - Backend: POST /producers/{id}/reviews (gated: must have clicked WhatsApp),
      GET /producers/{id}/reviews (paginated 10), avg_rating + reviews_count update
    - Frontend: review form on producer detail (post-WhatsApp click), star display,
      badge on ProducerCard (≥3 reviews)
    - Trust: auth required, one review per producer per user, Haiku moderation
  First step: git checkout staging → git checkout -b feature/producer-reviews

  Deferred:
  1. Admin analytics: referral count per producer
  2. ProducerCard heart/favorite Phase C (post-login replay)
  3. Lightbox for gallery images
  4. Events section on producer detail page

Deferred from design bundle (do NOT start without explicit user confirmation):
  - Item 4: New homepage editorial sections (EditorialBreath, MeetAProducer, HowItWorks)
  - Item 5: Botanical logo mark for Header/Layout

First step: git checkout staging → git pull → pick next task

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| MEH-56: status=pending_whatsapp (not pending) | Distinguishes minimal-form signups; both shown in admin pending queue | April 2026 |
| MEH-56: IG scrape via public meta (no OAuth) | v1 scope; OAuth too complex; fail-open to free text | April 2026 |
| MEH-56: completion checklist frontend-only | All fields in GET /producers/me; no new backend needed | April 2026 |
| MEH-50: isFridayMode() pure client-side (no API) | Intl handles DST; no extra fetch on homepage | April 2026 |
| MEH-50: SW timer-based push (not server-push) | v1 scope; server-push is v2 path | April 2026 |
| MEH-50: admin override via localStorage + AdminSetting | Testing on admin's browser only; no global override needed | April 2026 |
| MEH-51: trust_tier real-time (not stored) | No nightly job needed; computed via model_validator | April 2026 |
| MEH-51: OTP via WhatsApp (TWILIO_WHATSAPP_FROM) | No new env vars; fail-open if creds missing | April 2026 |
| MEH-51: kashrut_badges[] additive to producers.kosher | No regression; both coexist | April 2026 |
| MEH-51: ambassador = admin-manual toggle only | Trust tier 5 is editorial, not algorithmic | April 2026 |
| MEH-51: OTP uses secrets.choice (not random) | Security: random is predictable | April 2026 |
| MEH-51: artisan-dairy replaces raw-dairy; grass-fed removed | Refined spec — 8 valid badge codes | April 2026 |
| RTL: logical properties only | Physical left-*/right-* cause RTL bugs | April 2026 |
| Backend sort defaults newest-first | Deterministic pagination, no PostGIS needed | April 2026 |

## Open PRs
None (all merged to staging)

## Known issues (not yet filed)
- Phase 3 text-right sweep on forms — partially done in PR #162
  (register/producer only); register/page.js + other forms still TBD
- ProducerCard heart/favorite — Phase C not yet implemented (post-login replay)
- Map WhatsApp CTA: old producer records without phone still skip the button.
  Verify in production after staging redeploy.
- MEH-54 VAPID keys: must be set in Railway env for push to work. Fail-open until set.
- MEH-50 SW timer push: only fires while SW is active. Server-side push (v2) needed
  for reliable delivery when app is closed.
- MEH-56 Instagram scrape: Instagram throttles bots — scrape may fail for most handles.
  Users fall back to free-text input which still works via Haiku.

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
