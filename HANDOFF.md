# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-21

## Last session
Date: 2026-04-21
PR merged/opened: #209 (MEH-208 test triple-fix) — MERGED to staging (squash 5ca25d5)
Also open: PR #207 (Resend email migration, feature/meh-XXX-resend-email) — DRAFT
Summary:
  PR #209: fix(MEH-208) — 3 test bugs hidden by pytest -x stop-at-first-failure
    All three introduced in PR #205 (MEH-144), masked because -x stopped at the first failure.
    1. NameError: _notify_admin_new_producer else-branch used `producer.name` (out of scope) → `name`
    2. Lambda arity: stubs were lambda p: None (1 arg) for 2-arg functions → lambda *a, **k: None
       (PR #210 also fixed this; merged their version during conflict resolution)
    3. FakeSMTP.__init__ missing **kwargs: smtplib.SMTP(host, port, timeout=10) caused TypeError
       caught silently in try/except → send_message never called → assertion on sent["to"] failed

## Current state
Branch: staging
Staging HEAD: 5ca25d5 (MEH-208 squash merge of #209)
Main HEAD: e42127e (production release — staging ahead)

## Next task
  Open PRs:
  - PR #207: SMTP → Resend migration (feature/meh-XXX-resend-email → staging) — DRAFT, needs CI green
    Human prerequisites: create Resend account, verify mehamakor.online domain,
    add RESEND_API_KEY to Railway staging + production env vars
  - PR #203: MEH-126 Playwright E2E — draft, needs review
  - PR #204: MEH-142 edge cases audit (docs-only) — draft, needs review
  Candidates from backlog:
  - ProducerCard heart/favorite Phase C (post-login replay)
  - Lightbox for gallery images

First step: ask user which to tackle next (PR #207 likely priority — Railway SMTP egress blocked).

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| MEH-144: notifications via BackgroundTasks | Synchronous SMTP/Twilio blocked Vercel proxy → 502 + orphan users | April 2026 |
| MEH-144: 409 (not 400) for dup email on producer register | Actionable message directing user to login; 400 was silent | April 2026 |
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
- PR #207: SMTP → Resend migration (feature/meh-XXX-resend-email → staging) — DRAFT

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
