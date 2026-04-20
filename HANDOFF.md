# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-20

## Last session
Date: 2026-04-20
PR merged/opened: #183 (feature/meh-51-trust-ladder) — MERGED to staging
Summary:
  PR #183: MEH-51 — kashrut multi-badge + 5-tier trust ladder (MERGED)
    - DB: phone_verified, ambassador, kashrut_badges[], kashrut_verified_at/expires_at
      on producers; phone_otp_tokens table; kashrut_badge_requests table.
    - Backend: trust_tier = real-time via compute_trust_tier() in services/trust_tier.py
      (injected at serialization via Pydantic model_validator mode="after").
    - POST /producers/me/verify-phone (WhatsApp OTP, cryptographically secure, 3/10min)
    - POST /producers/me/verify-phone/confirm (5/min rate limit)
    - POST /producers/me/kashrut-request (badge_code + cert_url)
    - GET/POST /admin/kashrut (review table + approve/reject)
    - POST /admin/producers/{id}/set-ambassador (400 if status != approved)
    - GET /admin/dashboard: pending_kashrut_requests in stats + pending_moderation_count
    - TrustBadge.jsx (tier 2-5 pills) + KashrutBadgeStrip.jsx (richer tooltips)
    - ProducerCard + ProducerDetail: badges shown
    - /register/producer: step 4 phone verification (skippable)
    - /admin/kashrut: review table + reject modal + instructional header
    - /admin/producers: ambassador toggle (approved only, ☆/⭐)
    - /admin/layout.js: kashrut nav badge (yellow pill when pending > 0)
    - Badge codes (8): rabanut, badatz, chalak, mehadrin, organic-kosher,
      shmitta, kilayim, artisan-dairy
      (grass-fed removed; raw-dairy → artisan-dairy "מוצרי חלב מהחווה")
    - Tests: 22/22 test_trust_ladder.py green
    - Adversarial review fixed 6 issues before merge:
      random→secrets, rate limit on confirm, __dict__ anti-pattern,
      expiry overwrite logic, Twilio info leak, cert_url validation

  Previous: #182 HANDOFF.md update (MERGED to staging)
  Previous: #181 map card polish (MERGED to staging)
  Previous: #180 circle pins with Phosphor icons (MERGED to staging)

## Current state
Branch: staging
Staging HEAD: d4e6e99 (MEH-51 trust ladder — merged)
Main HEAD: e42127e (production release — staging ahead by #168–#183)

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
| MEH-54: FavoriteAlert separate from ProducerFollower | ProducerFollower = bookmarks; FavoriteAlert = alerts | April 2026 |
| Design-review workflow installed | OneRedOak template customized for mehamakor brand | April 2026 |
| .btn-whatsapp utility class | Single source for WA green (#25D366) | April 2026 |
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

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
