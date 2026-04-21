# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-21

## Last session
Date: 2026-04-21
PR merged/opened: #202 (MEH-95/96 WhatsApp colour tokens) — MERGED to staging (SHA ccd8fc8)
                 #200 (MEH-129 CLAUDE.md execution principles) — MERGED to staging (SHA 50cc2b5)
                 #136 (map legend collapsible) — MERGED to staging (SHA fa50ad0)
                 #159 (MEH-62 security deps) — MERGED to staging (SHA 894dc49)
                 #199 (MEH-99 smart search) — MERGED to staging (SHA 3833645)
Summary:
  PR #202: MEH-95/96 WhatsApp colour tokens
    - Added .btn-whatsapp, .btn-whatsapp-outline, .bg-whatsapp utilities to globals.css
    - Replaced all 7 inline #25D366 occurrences (PrimaryContactButton, WhatsAppButton,
      admin/outreach, register/producer, GroupBuyDetailClient, producer/dashboard,
      MapProducerCard)
    - grep -rn '25D366' frontend/ returns only globals.css ✅
    - Adversarial review: no BLOCKs; one advisory (duplicate focus ring) — non-issue in context
    - Build ✅, Vercel preview ✅

  Previous: #199 (MEH-99 smart search) — MERGED to staging

## Current state
Branch: staging
Staging HEAD: ccd8fc8 (MEH-95/96 WhatsApp colour tokens — squash merge of #202)
Main HEAD: e42127e (production release — staging ahead by multiple PRs)

## Next task
  Open PRs as of 2026-04-21 (run `gh pr list --state open` for current state):
  - #136: map legend collapsible (feature branch)
  - #159: security deps update
  - #184, #186: stale handoff updates (may be closeable)

  Deferred:
  - Admin analytics: referral count per producer
  - ProducerCard heart/favorite Phase C (post-login replay)
  - Lightbox for gallery images
  - Events section on producer detail page

  Deferred from design bundle (do NOT start without explicit user confirmation):
  - Item 4: New homepage editorial sections (EditorialBreath, MeetAProducer, HowItWorks)
  - Item 5: Botanical logo mark for Header/Layout

First step: decide which open PR to review/merge next — ask user.

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| MEH-78: mapPane dual-instance fix via BoundingClientRect | At effect time, display:none containers have 0 dimensions — reliable, no extra prop | April 2026 |
| MEH-78: sepia removed from tile filter | Was desaturating the global viewport, making markers look muted | April 2026 |
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
- #202: MEH-95/96 WhatsApp colour tokens — MERGED to staging 2026-04-21
- #200: MEH-129 CLAUDE.md execution principles — MERGED to staging 2026-04-21
- #159: MEH-62 security deps — MERGED to staging 2026-04-21
- #199: MEH-99 smart search — MERGED to staging 2026-04-21
- #198: feature/meh-78-map-bugs — MEH-78 map bugs — MERGED to staging 2026-04-21
- #184, #186: stale HANDOFF PRs — CLOSED 2026-04-21 (no merge needed)
- #136: map legend collapsible — MERGED to staging 2026-04-21
- No other open PRs

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
- MEH-78 viewport resize: `mapApiRef.current` is set once on mount based on container
  visibility. If user resizes from desktop→mobile (or vice-versa) without a page
  reload, the registered API may point to the wrong map. Acceptable for v1 — full
  fix requires ResizeObserver-driven re-registration (v2 path).

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
