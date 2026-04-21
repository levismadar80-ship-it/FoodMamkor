# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-21

## Last session
Date: 2026-04-21
PR merged/opened: #201 (PR quality gate) — MERGED to staging (SHA f838500)
Summary:
  PR #201: 3-layer PR quality gate
    - .github/pull_request_template.md: Type checkboxes, CI + manual checklists
    - .github/workflows/pr-checks.yml: build (Next.js) + pytest + adversarial-review jobs
    - tests/conftest.py: added _reset_rate_limiter autouse fixture — SlowAPIMiddleware checks
      rate limits before Pydantic validation, so even 422-bound requests burn quota; the
      12 POST /contact tests exhaust the 5/hour limit without the reset
    - backend/app/auth.py: fixed get_current_user to reject blocked users with 403 — previously
      blocked users could still use valid JWTs on all authenticated endpoints (only /auth/login
      had the is_blocked check). Root cause found by running the full test suite locally.
    - docs/DEPLOYMENT.md: documented exact CI check names for GitHub branch protection setup
    - Build ✅, all 57 pytest tests pass ✅

  Previous: #202 (MEH-95/96 WhatsApp colour tokens) — MERGED to staging 2026-04-21

## Current state
Branch: staging
Staging HEAD: f838500 (PR quality gate — squash merge of #201)
Main HEAD: e42127e (production release — staging ahead by multiple PRs)

## Next task
  No open PRs. Ask user what to work on next.
  Candidates from backlog:
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
- No open PRs as of 2026-04-21

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
