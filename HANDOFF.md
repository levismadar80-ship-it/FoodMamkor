# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-22

## Last session
Date: 2026-04-22
PRs merged: #234 (MEH-141) + #236 (MEH-106) + #238 (MEH-212) + #237 (MEH-102) + #240 (MEH-102 bugfix) + #239 (Playwright E2E fixes)
Summary:
  PR #239: fix 3 Playwright E2E failures —
    Bug A (spec 03 desktop): CTA locator .first() resolved to md:hidden mobile CTA;
      fix: :visible on both arms of OR-selector in 03-view-producer-detail.spec.ts
    Bug B (spec 03+04 mobile, also real UX bug): ProducerCard handleRootClick did nothing
      when onClick prop absent; clicking card body below h3 never navigated;
      fix: useRouter + router.push(producerHref) in ProducerCard.jsx
    Bug C (spec 05 mobile): MapClient renders mapPane twice (desktop+mobile containers);
      both Leaflet instances mount → two .leaflet-container in DOM;
      fix: :visible on waitForSelector + fallback toBeVisible in 05-map-navigation.spec.ts
  PR #240: MEH-102 bugfix — CSP img-src: added https://unpkg.com (Leaflet marker icons); Array.isArray guard on similar-producers r.data; Waze button hidden on desktop via mobile UA detection
  PR #238: MEH-212 Playwright E2E CI — deployment_status trigger replaces Vercel bot comment poll; TEST_URL from event; timeout-minutes 20→15; fallback (repository_dispatch) documented in DEPLOYMENT.md; confirmed working: job fires in ~3m 35s
  PR #237: MEH-102 Producer detail content — opening_hours column + migration; OpeningHours.jsx; MiniMap.jsx; similar producers section; MEH-79 closed as duplicate
  PR #236: MEH-106 Social proof — favorites_count on ProducerCard + ProducerDetail
  PR #234: MEH-141 Category request flow — category_requests table + modal + admin panel

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
Branch: staging
Staging HEAD: 6fe93f8 (includes #240 MEH-102 bugfix)
Main HEAD: e42127e (production is many commits behind — needs promotion)

## Open PRs
None.

## Next task
- PR #239 merged ✅ — Playwright E2E failures fixed
- ProducerCard heart/favorite Phase C (post-login replay)
- Lightbox for gallery images
- Events section on homepage

First step: ask user which to tackle next.

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
