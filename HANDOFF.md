# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-20

## Last session
Date: 2026-04-20
PR merged/opened: #185 (feature/meh-50-friday-mode) — MERGED to staging
Summary:
  PR #185: MEH-50 — שוק שישי homepage mode + Thu/Fri scheduled push
    - lib/friday-mode.js: isFridayMode() — Thu 18:00 → Fri 14:00 Israel time
      (Intl.DateTimeFormat Asia/Jerusalem; localStorage override for admin;
      try/catch for Safari private mode; 60s interval updates UI at window boundary)
    - FridayDeliveryStrip.jsx: horizontal scroll of is_available_today producers
    - app/page.js: hero subtitle swaps; strip below hero; fridayMode on all ProducerCards
    - ProducerCard.jsx: "🛒 מגיעה היום" pill when fridayMode + is_available_today
    - worker/index.js: Thu 19:00 + Fri 07:00 scheduled push (setTimeout in SW)
    - admin/settings: "מצב שוק שישי — override" toggle + localStorage hydration
    - .gitignore: public/worker-*.js excluded (no more artifact churn)
    - Adversarial review: 7 issues fixed before merge
      (localStorage try/catch, city dep, SW re-schedule bug, settings hydration,
       bool/string normalization, missing interval, missing fridayMode prop)

  Previous: #184 HANDOFF.md update (MERGED to staging)
  Previous: #183 MEH-51 trust ladder (MERGED to staging)

## Current state
Branch: staging
Staging HEAD: 042d337 (MEH-50 שוק שישי — just merged)
Main HEAD: e42127e (production release — staging ahead by #168–#185)

## Next task
  1. Admin analytics: add referral count per producer (skipped from MEH-49 scope)
  2. ProducerCard heart/favorite Phase C (post-login replay)
  3. Lightbox for gallery images
  4. Events section on producer detail page
  5. availability_return_date schema change (v2 backend)

Deferred from design bundle (do NOT start without explicit user confirmation):
  - Item 4: New homepage editorial sections (EditorialBreath, MeetAProducer, HowItWorks)
  - Item 5: Botanical logo mark for Header/Layout

First step: git checkout staging → git pull → pick next task

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| MEH-50: isFridayMode() pure client-side (no API) | Intl handles DST; no extra fetch on homepage | April 2026 |
| MEH-50: SW timer-based push (not server-push) | v1 scope; server-push is v2 path | April 2026 |
| MEH-50: admin override via localStorage + AdminSetting | Testing on admin's browser only; no global override needed | April 2026 |
| MEH-51: trust_tier real-time (not stored) | No nightly job needed; computed via model_validator | April 2026 |
| MEH-51: OTP via WhatsApp (TWILIO_WHATSAPP_FROM) | No new env vars; fail-open if creds missing | April 2026 |
| MEH-51: kashrut_badges[] additive to producers.kosher | No regression; both coexist | April 2026 |
| MEH-51: ambassador = admin-manual toggle only | Trust tier 5 is editorial, not algorithmic | April 2026 |
| MEH-51: OTP uses secrets.choice (not random) | Security: random is predictable | April 2026 |
| MEH-51: artisan-dairy replaces raw-dairy; grass-fed removed | Refined spec — 8 valid badge codes | April 2026 |
| MEH-51: set-ambassador returns 400 if status != approved | Guard against tier-5 on inactive producers | April 2026 |
| Map pins: circle divIcon (not teardrop) | Design system v2 — consistent with benchmark apps | April 2026 |
| Combined box-shadow string (not cascading) | CSS cascade: last box-shadow wins | April 2026 |
| Tile warmth in globals.css (not MapComponent) | .leaflet-tile-pane only exists inside Leaflet | April 2026 |
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

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
