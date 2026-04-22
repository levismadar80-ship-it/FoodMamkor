# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-22 (uv migration)

## Last session (uv migration — 2026-04-22)
PR: claude/migrate-pip-to-uv-8p7aT → staging (open, pending review)
Root cause fixed: `requirements.txt` had no transitive pins; `slowapi`'s
  transitive deps resolved incompatibly with `fastapi==0.115.6` in CI,
  causing `ImportError: PYDANTIC_V2` before any test ran.
Changes:
  - backend/requirements.txt REMOVED
  - backend/pyproject.toml ADDED — 22 direct deps, Python >=3.11
  - backend/uv.lock ADDED — 79 packages, all transitive deps pinned with hashes
  - Dockerfile: pip → uv (COPY --from=ghcr.io/astral-sh/uv, RUN uv sync --frozen
    --no-dev with BuildKit cache mount; ENV PATH .venv/bin:PATH)
  - .github/workflows/pr-checks.yml: setup-python+pip → astral-sh/setup-uv@v3
    + uv sync --frozen + GITHUB_PATH
  - docs/DEPLOYMENT.md: §8 table updated, §9 "Dependency management (uv)" added
Next: PR review → merge to staging → CI green → promote staging → main

## Previous last session
Date: 2026-04-22
PRs merged: #247 (MEH-211, copy sweep batch 1 — squash merged to staging)
PRs open: #242 (MEH-213, still pending CI)
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
Branch: feature/meh-210-phase-2-custom-questions (merged to staging via PR #252)
Staging HEAD: 86eefcf (feat(meh-210-phase-2): producer custom WhatsApp question chips)
Main HEAD: e42127e (production is many commits behind staging — needs promotion)

## PRs merged this session
- #248 — MEH-221 avatar upload + MEH-210 Phase 1 category chips + MEH-206 Phase 1 settings + MEH-203 category selector redesign
- #252 — MEH-210 Phase 2 custom WhatsApp question chips

## Open PRs
None.

## Next task
- MEH-205: /search page redesign (discovery-first) — next in queue
- MEH-206 Phases 2+3: role-aware tabs, users.preferred_city, POST /auth/logout-all-devices, 2-step delete — pending design session
- ProducerCard heart/favorite Phase C (post-login replay)
- Verify password reset end-to-end on staging (requires RESEND_API_KEY in Railway staging env)
- Promote staging → main (production is 78+ commits behind)

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
