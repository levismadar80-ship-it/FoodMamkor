# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-21

## Last session
Date: 2026-04-21
PR merged/opened: #200 (MEH-129 CLAUDE.md execution principles) — MERGED to staging (SHA 50cc2b5)
                 #136 (map legend collapsible) — MERGED to staging (SHA fa50ad0)
                 #159 (MEH-62 security deps) — MERGED to staging (SHA 894dc49)
                 #199 (MEH-99 smart search) — MERGED to staging (SHA 3833645)
Summary:
  PR #199: MEH-99 smart search
    - GET /search: cross-field ILIKE across producers (name+desc), products (name+desc),
      cities (producer.city + delivery_areas.city), categories — grouped SearchOut response
    - GET /search/trending: top 5 queries with results_count>0, 1hr in-memory cache
    - HeroSearch component: 300ms debounce, AbortController, keyboard nav, ARIA combobox,
      recent searches (localStorage mehamakor_recent_searches, max 5), trending fallback
    - /producers?q= filter: ProducersClient searchQ state, "תוצאות עבור: X" heading,
      active-filter chip, search empty state with category pills, highlightMatch utility
    - highlightMatch.js: regex-safe, returns <mark> elements with bg-transparent font-bold
    - search_queries analytics table (created by _migrate_columns in main.py)
    - ILIKE wildcard escaping fixed in producers.py (%, _, \ escaped before pattern build)
    - Adversarial review (pre-merge): 1 BLOCK fixed — missing @limiter.limit on
      GET /search/trending; 3 advisory issues also fixed (unused exists import removed,
      wildcard escaping, unused SmartSearch import in page.js)
    - tests/test_search.py: 8 tests covering name/city/category/product, pending exclusion,
      case-insensitive, exact-name-first, zero-result logging, X-Total-Count
    - Build ✅, lint ✅

  Previous: #198 (MEH-78 map bugs) — MERGED to staging

## Current state
Branch: staging
Staging HEAD: 3833645 (MEH-99 smart search — squash merge of #199)
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
- #159: MEH-62 security deps — MERGED to staging 2026-04-21
- #199: MEH-99 smart search — MERGED to staging 2026-04-21
- #198: feature/meh-78-map-bugs — MEH-78 map bugs — MERGED to staging 2026-04-21
- #184, #186: stale HANDOFF PRs — CLOSED 2026-04-21 (no merge needed)
- #200: MEH-129 CLAUDE.md execution principles — MERGED to staging 2026-04-21
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
