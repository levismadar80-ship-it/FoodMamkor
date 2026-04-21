# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-21

## Last session
Date: 2026-04-21
PRs merged: #212 (MEH-139 email readonly) + #213 (MEH-143 role upgrade) + #214 (MEH-138 profile photo) + #228 (email-exists rate limit fix)
Summary:
  PR #212: settings email field permanently read-only; isOAuth detection in ProfileTab
  PR #213: role upgrade — existing consumer adds producer to same account
    - User.is_producer BOOLEAN DEFAULT FALSE (durable flag)
    - POST /auth/register/producer: optional JWT → upgrade path vs new-registration
    - GET /auth/email-exists (EmailStr, 5/min) — UX hint for duplicate email
    - Frontend: isUpgrade flag, authLoading guard, upgrade banner, email-blur warning
      with "התחברי ←" link to /login?redirect=/register/producer
    - Login page: ?redirect= param respected (email + OAuth), Suspense wrapper added
    - auth-context.js: refreshUser() added
    - get_current_user_optional: re-raises 403 for blocked users (adversarial-review fix)
    - Upgrade guard checks producer_id OR is_producer
    - 5 new tests + is_producer assertion on new-registration test
  PR #214: profile photo upload + Google OAuth sync
    - users.avatar_url column (VARCHAR, migration in _migrate_columns)
    - POST /upload/avatar — magic-byte validated, 400px face-crop, 10/hour, no freemium gate
    - PATCH /users/me + UserOut now include avatar_url
    - Google OAuth: saves picture field on create; backfills on return login if null
    - /settings ProfileTab: avatar circle → clickable label + spinner overlay
    - Header + BottomNav: user.avatar → user.avatar_url
    - 2 new tests

Previous session context (already on staging):
  PR #210: MEH-128 Vibe Coding Responsibility system (pre-edit-guard.js, central-components)
  PR #203: MEH-126 Playwright E2E (5 flow specs, e2e.yml CI workflow)
  PR #162: MEH-162 4 security BLOCKs fixed (OAuth IDOR, upload OOM, email header injection, forgot-password)
  Human action completed: RESEND_API_KEY added to Railway (staging + production) ✅
  PR #204: MEH-142 audit closed — too far behind staging

## Current state
Branch: staging
Staging HEAD: 6c5d4ba (fix: email-exists rate limit 30/min — PR #228)
Main HEAD: e42127e (production release — staging significantly ahead, needs promotion)

## Open PRs
- #220 `feature/playwright-fix-spec-02` → staging | Playwright CI fixes (spec 01 h1→h1,h2 + spec 02 data-testid) | CI re-running, pending merge
  - Once #220 merges, re-queue CI on waiting PRs: #215, #216, #217, #218, #219

## Next task
  Candidates from backlog:
  - Promote staging → main (production) — staging is many commits ahead; production still missing /auth/email-exists
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
