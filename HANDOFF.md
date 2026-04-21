# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-21

## Last session
Date: 2026-04-21
PR merged/opened: #198 (feature/meh-78-map-bugs) — OPEN (draft, awaiting Vercel preview)
Summary:
  PR #198: MEH-78 map bugs — 3 fixes in 3 files (MapComponent, MapClient, globals.css)
    - Bug 1 (map center Golan/Syria): dual-map render — `mapPane` JSX const used
      in BOTH `hidden lg:grid` (desktop) and `lg:hidden` (mobile) slots mounts two
      independent MapComponent instances. The mobile map registered SECOND, always
      overwriting `mapApiRef.current` + `parentMapRef.current`. On desktop, all
      imperative calls (goToMyLocation, focusProducer, getBounds) went to the
      hidden mobile map. Fix: `registerMapApi` now calls `api.getContainer()
      .getBoundingClientRect()` and skips if width===0&&height===0. Same guard
      added to `parentMapRef.current` in the map init effect.
    - Bug 2 (faded/gray markers): `.leaflet-tile-pane { filter: saturate(0.7)
      brightness(1.05) sepia(0.1) }` was desaturating+tinting the viewport
      enough to make category-colored markers look muted. Changed to
      `saturate(0.85) brightness(1.02)` (sepia removed). Added `filter: none`
      on `.leaflet-marker-pane` as defensive rule.
    - Bug 3 (NaN flyTo crash): added `isNaN` guard in `goToMyLocation` before
      `mapInstanceRef.current.flyTo(latlng, ...)`. All three flyTo call sites
      now guarded: focusProducer via CoordSchema.safeParse, goToMyLocation via
      isNaN check, setView via hardcoded Jerusalem coords.
    - Build ✅, lint ✅ (warnings only, all pre-existing), Vercel building

  Previous: #196 (WhatsApp click tracking) + #197 (producer reviews) — MERGED

## Current state
Branch: feature/meh-78-map-bugs (open PR #198, draft)
Staging HEAD: e0d69ef (WhatsApp click tracking — last merged)
Main HEAD: e42127e (production release — staging ahead by multiple PRs)

## Next task
  After PR #198 is approved and merged to staging:
  1. Deferred:
     - Admin analytics: referral count per producer
     - ProducerCard heart/favorite Phase C (post-login replay)
     - Lightbox for gallery images
     - Events section on producer detail page

  Deferred from design bundle (do NOT start without explicit user confirmation):
  - Item 4: New homepage editorial sections (EditorialBreath, MeetAProducer, HowItWorks)
  - Item 5: Botanical logo mark for Header/Layout

First step: await PR #198 approval, then merge to staging.

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
- #198: feature/meh-78-map-bugs — MEH-78 map bugs (draft, Vercel building)

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
