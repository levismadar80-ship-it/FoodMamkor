# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-22

## Last session
Date: 2026-04-22
PRs open: #242 (MEH-213, feature/meh-213-location-types)
Summary:
  PR #242 (MEH-213) — Business location types + canonical cities:
    Backend: City model + cities table (idempotent DDL); 4 new columns on producers
      (has_physical_location, offers_delivery, delivery_nationwide, delivery_cities TEXT[]);
      2 CHECK constraints (both-false blocked; nationwide XOR city-list); Pydantic v2
      model_validator for mutual-exclusion; GET /cities?q= autocomplete (60/min);
      scripts/seed_cities.py from data.gov.il; geo-search excludes delivery-only.
    Frontend: CitiesAutocomplete (debounced, ARIA combobox, keyboard nav);
      DeliveryBlock (3 states: nationwide / city chips / fallback + WhatsAppButton);
      ProducerDetail: conditional MiniMap + DeliveryBlock; ProducerCard: "משלוחים בלבד"
      badge; ProducerForm: "סוג העסק" section + cascading checkboxes + CitiesAutocomplete
      + client-side save guard; producer-completeness.js delivery-aware;
      CSV export 4 new columns; seo.js areaServed for delivery-only.
    Tests: test_producer_location_types.py (cities endpoint, both-false, nationwide+cities, geo-search exclusion).
    Build fix: CitiesAutocomplete JSDoc comment had "start-*/" which SWC parsed as
      closing the block comment — fixed on second commit.
    Merge: pulled latest staging (MiniMap.jsx Waze fix + ProducerReviews.jsx guard) into branch.

Previous sessions:
  PRs merged: #234 (MEH-141) + #236 (MEH-106) + #238 (MEH-212) + #237 (MEH-102) + #240 (MEH-102 bugfix) + #239 (Playwright E2E fixes) + #241 (MEH-102 bugfix v2)

Previous session context:
  PR #221: MEH-149 Cookie consent GDPR gate
  PR #222: MEH-157 Pending producer banner
  PR #223: MEH-152 WhatsApp desktop fallback
  PR #224: MEH-153 Cloudinary errors → Hebrew
  PR #225: MEH-155 Vacation badge auto-clear
  PR #226: MEH-156 JWT expiry re-auth
  PR #227: MEH-158 Modal focus return WCAG 2.1 AA
  PR #229: MEH-154 Excel mojibake detection
  PR #230: MEH-159 Pagination counter stale
  PR #232: MEH-151 Map SSR Googlebot
  MEH-160: SKIPPED (standing instruction from user)

## Current state
Branch: feature/meh-213-location-types (ahead of staging with MEH-213 work)
Staging HEAD: c5bc8f2 (includes MEH-102 bugfix v2 — Waze https + ProducerReviews Array.isArray)
Main HEAD: e42127e (production is many commits behind staging — needs promotion)

## Open PRs
#242 — MEH-213 business location types (feature/meh-213-location-types → staging)
  CI: pytest pending, Next.js build fixed (was failing due to */ in JSDoc comment), lint pending
  Preview: food-mamkor-git-feature-m-ba2835-levismadar80-ship-its-projects.vercel.app

## Next task
- Wait for CI green on PR #242 — then request user review + merge to staging
- After merge: run seed script on Railway staging: `python backend/scripts/seed_cities.py`
- Verify GET /cities?q=תל returns results on staging
- ProducerCard heart/favorite Phase C (post-login replay)
- Lightbox for gallery images

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| MEH-106: show count only when ≥5 | Low numbers reduce trust rather than build it | April 2026 |
| MEH-106: batch GROUP BY for list, scalar COUNT for detail | Avoids N+1; single query for full list page | April 2026 |
| MEH-141: admin_notes preserved on PATCH when body.admin_notes is None | Prevents data loss when status is reset without re-entering notes | April 2026 |
| MEH-141: examples stripped server-side | Prevent trailing whitespace stored in DB | April 2026 |
| MEH-141: modal z-[9000] (not z-50) | z-50 was hidden behind site header | April 2026 |
| MEH-143: role=producer AND is_producer=true (both) | Role gates dashboard; is_producer is durable even if admin clears producer_id | April 2026 |
| MEH-143: get_current_user_optional re-raises 403 | Blocked users must never be treated as anonymous — adversarial-review finding | April 2026 |
| MEH-143: upgrade guard checks producer_id OR is_producer | Prevents silent re-registration after admin clears producer_id | April 2026 |
| MEH-143: email-exists uses EmailStr + 30/min | 5/min was too low for blur-event cadence during form entry; 30/min balances UX vs enumeration | April 2026 |
| MEH-XXX: Email via Resend (not SMTP) | Railway blocks SMTP ports 25/465/587; Resend is HTTP | April 2026 |
| MEH-144: notifications via BackgroundTasks | Synchronous SMTP/Twilio blocked Vercel proxy → 502 + orphan users | April 2026 |
| MEH-144: 409 (not 400) for dup email on producer register | Actionable message directing user to login; 400 was silent | April 2026 |
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


## Known issues (not yet filed)
- Playwright spec 05 dual-Leaflet root cause (MapClient renders mapPane twice) is patched in tests only — :visible selector avoids the ambiguity. The architectural fix (conditional rendering instead of CSS hiding) is v2 scope.
- feature/meh-106-social-proof and feature/meh-212-playwright-ci-fix branches not deleted — git push --delete returns 403 in this env; delete manually from GitHub UI.
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
