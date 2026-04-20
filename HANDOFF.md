# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-20

## Last session
Date: 2026-04-20
PR merged/opened: #187 (feature/meh-56-whatsapp-onboarding) — MERGED to staging
Summary:
  PR #187: MEH-56 — async WhatsApp onboarding + AI bio writer
    - /register/producer: 2-step minimal form (account + שם עסק/טלפון/קטגוריה)
      status=pending_whatsapp on create; WhatsApp welcome sent to producer phone
    - backend/app/services/bio_generator.py (new): Instagram scrape + Claude Haiku
      Hebrew bio ≤150 chars; fail-open on missing API key
    - POST /producers/me/bio/generate (5/hour rate limit)
    - Producer dashboard: pending_whatsapp banner, 7-item completion checklist
      with progress bar + "+X% נראות" labels; AI bio panel (generate + save)
    - Admin: pending filter + counts include pending_whatsapp; statusBadge
      maps pending_whatsapp → "ממתין — וואטסאפ" (orange)
    - Adversarial review: 2 issues fixed (ToS checkbox re-added, admin badge regression)
    - All checks green: lint ✅, Vercel ✅

  Previous: #185 MEH-50 שוק שישי (MERGED to staging)
  Previous: #184 HANDOFF.md update (MERGED to staging)
  Previous: #183 MEH-51 trust ladder (MERGED to staging)

## Current state
Branch: staging
Staging HEAD: 723512a (MEH-56 async WhatsApp onboarding — just merged)
Main HEAD: e42127e (production release — staging ahead by #168–#187)

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
