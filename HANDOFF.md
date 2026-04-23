# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-22 (MEH-259 smoke test added; MEH-256 rate-limit fix merged; MEH-257 closed as duplicate)

## Most recent — MEH-259 smoke test (2026-04-22, late night)

Seven-check post-deploy verification script. Fails loudly when a
security primitive is wrong. Covers MEH-256 (rate-limit isolation),
MEH-254 (IDOR), MEH-248 (password min_length), plus invariants
(auth required, security headers, CORS strict, rate-limit enforcement).

Files:
- `scripts/smoke_test.py` — 7 check functions + runner
- `scripts/smoke_test_prod.sh` — bash wrapper
- `docs/SMOKE-TEST.md` — runbook + add-a-check guide

Run: `scripts/smoke_test_prod.sh` (defaults to production) or
`scripts/smoke_test_prod.sh https://foodmamkor-staging.up.railway.app`.

**Not in CI yet** — run manually first, wire into the deploy workflow
as a follow-up once it's consistently green.

## MEH-256 rate-limit fix (PR #296, merged `2938ec9`)

Real fix using `X-Real-IP` as the primary signal (unspoofable, set by
Railway edge from own TCP-peer view). Supersedes PR #286 (closed as
superseded). Removes MEH-256 debug probe from rate_limit.py.

**⏭ Required ops action before the fix has effect:**
Set `TRUSTED_PROXY=1` on Railway staging + production backend
Variables. Without it the key function falls through to
`get_remote_address` and the bug persists. See `docs/DEPLOYMENT.md` §D.

## MEH-257 closed as Duplicate

Created earlier in the session before MEH-256 stabilized as the
canonical id. Same bug, same fix — MEH-256 closes it.

---

## Earlier in the session — MEH-260 staging deploy drift (2026-04-22, evening)

**Incident:** Railway `foodmamkor-staging` was running stale code for
**weeks**. Discovered during MEH-256 investigation when access logs
showed 404s on endpoints that exist in `staging` HEAD. Full writeup:
`docs/INCIDENTS/2026-04-staging-deploy-drift.md`.

**Two stacked root causes:**
1. Railway staging env's GitHub source was pointing at `main`, not
   `staging`. **User fixed via dashboard.**
2. Railway's BuildKit rejects the uv cache mount without a
   service-specific id. **Fixed in code** — PR #291
   (`458d651`) removed the cache mount entirely.

**Merged this session (all on `staging`):**
- #287 debug XFF logging → **reverted** via #288 before causing issues
- #288 revert MEH-256 debug
- #289 add `id=uv-cache` (first attempt — Railway rejected)
- #290 **closed** (merge conflict — superseded by #291)
- #291 remove uv cache mount (second attempt — expected to work)

**Current state — AWAITING HUMAN VERIFICATION:**
- Last staging commit: `458d651`
- Railway build should now succeed; user must verify:
  ```bash
  BACKEND=https://foodmamkor-staging.up.railway.app
  curl -s "$BACKEND/health"
  curl -s "$BACKEND/holiday-mode"
  python scripts/check_api_contract.py --probe "$BACKEND"
  ```

**Implications:**
- The 9 PRs merged earlier today (MEH-247/248/249/250/251/252/253/254/255)
  were all in a vacuum — all CI passes are meaningless until the
  probe confirms 0 orphans. Re-verify every CRITICAL/HIGH once staging
  is actually live (MEH-254 IDOR fix is the top priority).
- **MEH-244 (production drift)** is suspected to be the SAME root
  cause. Do NOT touch production until staging verification is clean.
- **MEH-256 XFF investigation** is blocked — debug `print` was removed
  in #288. If still needed, open a follow-up to re-add as structured
  `log.info` (cleaner lifecycle).

**Prevention follow-up (not done in this session):**
- Flip `api-contract-probe-staging` in `.github/workflows/deploy.yml`
  from `continue-on-error: true` to hard failure once baseline shows
  0 orphans.
- Add a weekly deploy-freshness check script.

---

## Previous — MEH-242 audit session + 9 PR batch (2026-04-22, day)

10 Linear issues opened from MEH-242 audit (MEH-246…255); 9 merged to
staging over the afternoon. Details in Linear / commit log. All of
those merges are **subject to re-verification** pending MEH-260
confirmation that staging is now running the right code.

## Open PR (MEH-245 deployment verification — 2026-04-22)
PR: #277 (feature/meh-245-deployment-verification → staging, draft, 3 commits)
Summary:
  MEH-245 pivoted mid-session from "frontend↔backend contract audit" to
  "deployment verification tool" after discovering the three console 404s
  flagged in MEH-244 were not static code drift:
    - /holiday-mode → exists at backend/app/main.py:407 on staging
      (commit 663e3b7). Root cause is staging↔production deploy drift.
    - /admin/group-buys → exists at backend/app/routers/group_buys.py:19
      (admin_router registered at backend/app/main.py:395). Same cause.
    - /auth/profile-image → lives only on the unmerged MEH-243 branch.
      Out of scope here; MEH-243 will ship both sides together.

  Shipped in this PR:
    - docs/AUDIT-API-CONTRACT.md — post-mortem + runbook for the 3 modes
    - scripts/check_api_contract.py — static / --probe URL / --cross-env.
      Static on staging: 178 frontend call sites, 154 backend routes,
      0 orphan frontend calls, 0 method mismatches, 23 dead backend
      routes flagged for triage (not deleted here).
    - .github/workflows/deploy.yml — two warn-only jobs
      (api-contract-static on every PR/push, api-contract-probe-staging
      after staging Railway redeploy). Flip to hard failure after MEH-244.

  MEH-244 was re-scoped in Linear to a post-MEH-245 diagnosis task — run
  the cross-env probe against production, redeploy if drift confirmed,
  close as not-reproducible otherwise.

Next (after #277 merges):
  1. Wait for staging redeploy, then run MEH-244 cross-env probe:
     `python scripts/check_api_contract.py --cross-env \
       --staging https://staging.mehamakor.online \
       --prod https://mehamakor.online`
     and triage per docs/AUDIT-API-CONTRACT.md → "The three known 404s".
  2. After MEH-244 closes with prod green, flip both CI jobs in
     .github/workflows/deploy.yml from `continue-on-error: true` to hard
     failure.
  3. Triage the 23 dead backend routes listed in docs/AUDIT-API-CONTRACT.md.

---

## Last session merged to staging (MEH-87 + MEH-83 + MEH-84 — 2026-04-22)
PRs opened this session:
  - #270 (MEH-87): Tab focus trap in LoginPromptModal — draft, CI pending
  - #272 (MEH-83): Lightbox on gallery images — draft, CI running
  - #274 (MEH-84): GPS center button on /map — draft, CI queued
PRs merged this session:
  - #264 (uv migration, claude/migrate-pip-to-uv-8p7aT) — merged to staging ✅

MEH-87 (Task 1) — LoginPromptModal Tab focus trap:
  Root cause: focus trap was missing (only ESC was handled, not Tab/Shift+Tab).
  Fix: `modalRef` on dialog div + Tab/Shift+Tab handler in existing `handleKey`
  useEffect; cycles through all focusable elements within the dialog.
  File: frontend/components/LoginPromptModal.jsx

MEH-86 (Task 2) — Infinite scroll on /producers:
  SKIPPED — spec pre-condition not met: requires ≥50 producers in DB, only 5.

MEH-83 (Task 3) — Lightbox on gallery images:
  New file: frontend/components/Lightbox.jsx (pure React, zero deps)
  Updated: frontend/components/ImageGallery.jsx — image wrapped in <button>,
    opens Lightbox on click; focus returns to trigger button on close.
  CSS: globals.css — lightboxFadeIn 200ms + lightboxImgFade 150ms keyframes.
  RTL: ArrowLeft=next, ArrowRight=prev; nav arrows use start-4/end-4.
  A11y: role=dialog, aria-modal, Tab trap, focus-on-close, body scroll lock.
  Test: frontend/e2e/flows/06-lightbox.spec.ts

MEH-84 (Task 4) — GPS center button on /map:
  Updated: frontend/app/map/MapClient.jsx
  Button: absolute bottom-24 end-4, 44×44px, z-[1000], hidden lg:flex (desktop only).
  Icon: NavigationArrow → CircleNotch spinner during wait.
  3 per-error-code toasts: denied / unavailable / timeout in Hebrew.
  NaN guard before flyTo. Mobile unchanged (has its own "קרוב אלי" in filter bar).
  Test: frontend/e2e/flows/07-gps-button.spec.ts

## Previous last session (uv migration — 2026-04-22)
PR: #264 (claude/migrate-pip-to-uv-8p7aT) — merged to staging ✅
Root cause: `requirements.txt` had no transitive pins; `slowapi`'s
  transitive deps resolved incompatibly with `fastapi==0.115.6` in CI.
Changes: backend/requirements.txt removed; pyproject.toml + uv.lock added;
  Dockerfile pip→uv; pr-checks.yml setup-uv@v3; docs/DEPLOYMENT.md §8+§9.

## Previous last session
Date: 2026-04-22
PRs merged: none this session
PRs open: #265 (MEH-236), #266 (MEH-187), #267 (MEH-88 — all CI green), #268 (MEH-89 — CI running)
Summary:
  MEH-236 (Task 1) — CardHeart can't undo favorite (heart stays filled after second click):
    Root cause: `guestSaved` state never reset on login, so `filled = favorited || guestSaved`
    stays true. Fix: `setGuestSaved(false)` at top of useEffect when user is defined.
    Secondary fix: DELETE 404 treated as success (stale cache / other device).
    PR #265: frontend/components/ProducerCard.jsx only.

  MEH-187 (Task 2) — Vercel Speed Insights Real User Monitoring:
    Added @vercel/speed-insights@1.3.1 + <SpeedInsights /> in layout.js.
    PR #266: frontend/package.json + package-lock.json + app/layout.js.
    Note: initial CI failure (npm ci lockfile mismatch) fixed in follow-up commit.

  MEH-88 (Task 3) — products.image_url schema change (v2, approved):
    Backend: _migrate_columns products.image_url TEXT; Product model; ProductCreate /
      ProductUpdate / ProductOut schemas; producer_me.py GET/POST/PUT/DELETE
      /producers/me/products with IDOR ownership checks.
    Frontend: ProducerDetail product cards — 64×64 thumbnail with Package icon fallback;
      settings BusinessTab — new ProductsSection (list + add with image upload + delete).
    Tests: tests/test_product_image.py (9 cases: create/update/clear/delete/IDOR/isolation).
    PR #267: all CI green (lint ✅, build ✅, tests ✅, adversarial ✅).

  MEH-89 (Task 4) — availability_return_date (v2, approved):
    No new DB column needed — vacation_until DATE already existed from MEH-155.
    Backend: ProducerUpdate schema gets availability_status + vacation_until so admin
      PUT /producers/:id can set them (previously producer-only).
    Frontend: ProducerDetail — 3 vacation banner locations now show "חוזרת ב-{date}"
      (he-IL locale) or "חוזרת בקרוב" fallback using producer.vacation_until.
    Frontend: Admin ProducerForm — new "זמינות" section with pill buttons + conditional
      date picker; vacation_until nulled in payload when status ≠ vacation.
    PR #268: CI running.

Previous session — PRs #265/#266 (MEH-236 + MEH-187, opened but not yet merged):
Summary:
  MEH-211 (batch 1 copy sweep) — MEH-202 + MEH-204 + MEH-207:
    4 files changed, text only, no logic/DB/design.
    MEH-202: "לממכר מזון" → "למכירת המוצרים" in register/producer step 4
      consent checkbox (page.js:405) + terms §2 paragraph 2 (terms/page.js:35).
      First paragraph of terms §2 (legal list) untouched.
    MEH-204: Search placeholder "חפשי ירקות טריים, בשר grass-fed..." →
      "לחם מחמצת, ביצים אורגניות, ירקות ופירות" in search/page.jsx:112 +
      language-context.js:34 (Hebrew locale). English locale untouched.
    MEH-207: /register/producer hero H1 "הוסיפי את העסק שלך" → "תני לעסק שלך בית";
      subtitle → "5 דקות. בלי עמלות. בלי מתווכים.";
      OAuth info box now email-only across 2 block spans (removes user.name to
      sidestep MEH-206 truncation bug).
    Post-fix verification: all 5 banned strings → zero results across frontend/.

  Previous session — MEH-218 — CLAUDE.md modular refactor (2026 best practices):
    Motivation: CLAUDE.md at 245 lines, over its own 245 cap. Duplicate compact
      triggers (40% vs 60%); 3 overlapping bug-handling sections; inline Mermaid
      diagrams duplicating .ai/diagrams/; Known Bug Patterns + custom commands
      that were documentation, not rules. Anthropic / HumanLayer / Hightower
      (March 2026) all recommend modular .claude/rules/ split.
    3 commits, docs + .claude/ only (zero code files touched):
      1. docs(meh-218) — docs/BUG_PATTERNS.md + docs/LOCKED_DECISIONS.md extracted
         verbatim with expanded "why" / "the trap" sections.
      2. feat(meh-218) — .claude/rules/ split into 7 domain files (rtl, security,
         testing, deployment, frontend, backend, workflow — 602 lines total).
         All rule content preserved verbatim.
      3. refactor(meh-218) — CLAUDE.md rewritten 245 → 138 lines. Removed:
         inline Mermaid diagrams (already in .ai/diagrams/), Known Bug Patterns
         section (→ docs/BUG_PATTERNS.md), Custom commands duplication, verbose
         rail/anthropic prose. Unified Bug Protocol (was 3 sections). Single
         /compact rule (was duplicated at 40% and 60%). Top-10 workflow rules
         summarized with pointer to .claude/rules/workflow.md.
    Verification: wc -l CLAUDE.md = 138 ≤ 150 cap; ls .claude/rules/ = 7 files;
      grep -r 'left-3\|right-3' .claude/ → only .claude/rules/rtl.md;
      no Mermaid or Architecture Diagrams section in CLAUDE.md.
    Zero rules deleted — every rule from the old file survived somewhere.
    Hard cap lowered from 245 → 150 lines; update policy: new domain rules
      go into .claude/rules/*.md, not back into CLAUDE.md.

Previous session (2026-04-22, earlier):
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
Branch: feature/meh-84-gps-button (PR #274, CI queued)
Last branch: feature/meh-83-lightbox (PR #272, CI running)
Staging HEAD: updated — PR #264 (uv migration) merged this session
Main HEAD: e42127e (production still behind staging — needs promotion)

## PRs merged this session
- #264 — uv migration (claude/migrate-pip-to-uv-8p7aT) ✅

## Open PRs
- #265 — MEH-236: CardHeart can't undo favorite (draft)
- #266 — MEH-187: Vercel Speed Insights (draft)
- #267 — MEH-88: products.image_url + CRUD — all CI green ✅ (draft)
- #268 — MEH-89: vacation return date in banner + admin form (draft)
- #270 — MEH-87: LoginPromptModal Tab focus trap (draft, CI pending)
- #272 — MEH-83: Lightbox on gallery images (draft, CI running)
- #274 — MEH-84: GPS button on /map (draft, CI queued)

## Next task
- Wait for CI on #270, #272, #274 → then review + merge in order
- MEH-86: Infinite scroll on /producers — BLOCKED until ≥50 producers in DB
- MEH-205: /search page redesign (discovery-first) — next feature in queue
- Review and merge #265 → #268 to staging (older open PRs, still valid)
- Promote staging → main (production is behind)

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
| MEH-218: CLAUDE.md cap 245 → 150 | Above 200 lines the file stops being a one-page index; domain rules belong in .claude/rules/*.md, trap context in docs/LOCKED_DECISIONS.md | April 2026 |
| MEH-218: diagrams deleted from CLAUDE.md | Inline Mermaid duplicated .ai/diagrams/ which is the canonical source and is auto-loaded via --append-system-prompt | April 2026 |
| MEH-218: Bug Protocol unified into 1 section | Three overlapping sections (Regression rules + Bug Pattern Protocol + Known Bug Patterns) caused confusion; split into "protocol" (CLAUDE.md) and "pattern library" (docs/BUG_PATTERNS.md) | April 2026 |
| MEH-88: products CRUD via /producers/me/products (not embedded in PUT /me) | Separate resource endpoints enable per-product image upload and clean IDOR checks | April 2026 |
| MEH-89: no new availability_return_date column — vacation_until (MEH-155) covers it | Duplicate column would diverge; vacation_until already auto-clears, exposed in all schemas, used by producer dashboard | April 2026 |


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
