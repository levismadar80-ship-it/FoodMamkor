# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-21

## Last session
Date: 2026-04-21
PRs merged: #221 #222 #223 #224 #225 #226 #227 #229 #230 #232 (MEH-142 audit batch — all P1 issues)
Summary:
  PR #221: MEH-149 Cookie consent GDPR gate — trackEvent() gated on localStorage["cookieConsent"]==="all"; ClarityScript client component; 5 tests
  PR #222: MEH-157 Pending producer banner — enhanced pending/rejected banners with SLA + CTA; 3 tests
  PR #223: MEH-152 WhatsApp desktop fallback — getWhatsAppHref() util (matchMedia hover+pointer); applied to 6 call sites; 5 tests
  PR #224: MEH-153 Cloudinary errors → Hebrew — raw exceptions swallowed, Hebrew messages to users; 3 backend tests
  PR #225: MEH-155 Vacation badge auto-clear — vacation_until DATE column; Pydantic model_validator auto-clears expired; startup SQL cleanup; 4 backend tests
  PR #226: MEH-156 JWT expiry re-auth — auth:expired CustomEvent + AuthProvider listener + Hebrew toast with /login redirect; 3 tests
  PR #227: MEH-158 Modal focus return WCAG 2.1 AA — useFocusReturn(open) hook; applied to LocationModal, LoginPromptModal, ReportButton (+ dialog semantics); 5 tests
  PR #229: MEH-154 Excel mojibake detection — _has_mojibake() detects ×/ø; parse_row flags rows; import_rows batch-rejects; 5 tests
  PR #230: MEH-159 Pagination counter stale — GET /producers/count (60/min); liveTotal state; x-total-count header sync; visibilitychange refresh; 6 tests
  PR #232: MEH-151 Map SSR Googlebot — page.js async SC fetches 100 producers (1h ISR); sr-only <nav> for Googlebot; MapClient.jsx untouched; 6 tests
  MEH-160: SKIPPED (standing instruction from user)

Previous session context:
  PR #212 MEH-139, PR #213 MEH-143, PR #214 MEH-138, PR #228 email-exists rate limit

Previous session context (already on staging):
  PR #210: MEH-128 Vibe Coding Responsibility system (pre-edit-guard.js, central-components)
  PR #203: MEH-126 Playwright E2E (5 flow specs, e2e.yml CI workflow)
  PR #162: MEH-162 4 security BLOCKs fixed (OAuth IDOR, upload OOM, email header injection, forgot-password)
  Human action completed: RESEND_API_KEY added to Railway (staging + production) ✅
  PR #204: MEH-142 audit closed — too far behind staging

## This session (2026-04-21 continuation)
PRs merged this session: #220 (Playwright CI fixes) + #228 (email-exists 30/min) + #231 (rate limit audit) + #233 (startup env warnings)
  PR #220: spec 01 h1→h1,h2 + spec 02 data-testid="hero-search-submit" — Playwright green
  PR #228: GET /auth/email-exists rate limit 5/min → 30/min
  PR #231: GET /auth/me 60/min → 120/min; POST /verify-phone/confirm 5/min → 3/min
  PR #233: lifespan startup WARNING if ADMIN_EMAIL / RESEND_API_KEY / TWILIO_ACCOUNT_SID unset

## Current state
Branch: staging
Staging HEAD: 5ab56cb (feat: startup env var warnings — PR #233)
Main HEAD: e42127e (production is many commits behind — needs promotion)

## Open PRs
None.

## PRs #215–#219 — ready to re-queue CI
Playwright fix is now on staging. These PRs (MEH-142 batch) can have CI re-run.

## Next task
  - Re-queue CI on PRs #215, #216, #217, #218, #219
  - Promote staging → main when ready
  - ProducerCard heart/favorite Phase C (post-login replay)
  - Lightbox for gallery images
  - Events section on homepage

First step: ask user which to tackle next.

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
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
