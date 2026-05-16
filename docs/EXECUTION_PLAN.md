# 📋 EXECUTION_PLAN.md — מהמקור Pre-Launch & Beyond

> **Source of truth** for execution sequencing of all 143 Linear tasks.  
> Generated: 2026-05-10  
> Linear MCP relations: 22 blockedBy + 74 relatedTo (96 links applied)  
> Companion docs: `docs/EXECUTION_PROTOCOL.md` (per-task workflow), Linear MEH-130 (roadmap)

---

## 🎯 The Thesis (immutable)

**מהמקור הוא מגזין, לא marketplace.**

- Brand voice: עברית RTL, נקבה, "בית עסק" (לא "יצרן")
- Brand locks: `#2e6853` primary · `#F5F0E8` bg · `#8B6914` gold
- Fonts: Frank Ruhl Libre 900 · DM Sans · Cormorant italic
- Stack: Next.js + FastAPI + PostgreSQL + Cloudinary + Leaflet

Every decision is filtered through this thesis. Read first when in doubt.

---

## 🚦 Autonomy Levels

לכל משימה יש **autonomy level** שמגדיר כמה Claude Code יכולה לרוץ לבד:

| Level | משמעות | מתי |
|-------|--------|-----|
| 🟢 **GREEN** | Full Auto — את מאשרת רק את ה-PR | Single-file, no schema, mechanical pattern, audits |
| 🟡 **YELLOW** | Plan Approval Once — את מאשרת תוכנית, CC מבצעת | Multi-file features, refactors, i18n waves |
| 🔴 **RED** | Step-by-Step — chunk-by-chunk approval | Design/brand, migrations, env vars, security, strategy |

**Total:** 54 GREEN · 45 YELLOW · 44 RED.

→ פירוט מנגנון ה-autonomy: ראה `docs/EXECUTION_PROTOCOL.md`.

---

## 📊 Phase Overview

| Phase | תיאור | משימות | זמן משוער | מתחילים |
|------|-------|--------|----------|---------|
| **1** | 🚨 Critical Bugs | 8 | 1-2 שבועות | מיד |
| **2** | ✍️ Foundation Copy | 11 | 1-2 שבועות | אחרי Phase 1 |
| **3** | 🎨 Visual/Design | 17 | 3-4 שבועות | אחרי Phase 2 + design tokens |
| **4** | 🔧 Backend/UX | 12 | 2-3 שבועות | במקביל ל-Phase 3 |
| **5** | 🛠️ Pre-launch Tooling | 44 | 3-4 שבועות | במקביל לכל מה שאפשר |
| **6** | 🛡️ Audits + Launch | 19 | 1-2 שבועות | לפני launch |
| **7** | 🌅 Post-launch | 24 | 6+ חודשים | אחרי launch |

**Phases 1-6 = ~3 חודשים pre-launch (with parallel execution).**

---

## 🚨 Phase 1 — Critical Bugs (START HERE)

**אלה חוסמים אמינות.** לא להעלות לpublic לפני שכולם נסגרים. מומלץ לעבוד עליהם **בסדר הזה** כי חלק חוסמים visual sections ב-Phase 3.

**Autonomy mix:** 🟢 5 · 🟡 2 · 🔴 1

| ID | Priority | Type | משימה | Autonomy |
|----|----------|------|------|----------|
| **MEH-508** | 🔥 Urgent | REFACTOR | 🔧 Backend: Twilio → Direct Meta Cloud API refactor | 🔴  |
| **MEH-520** | 🔥 Urgent | BUG | 🐛 Copy fix: Header banner — "אלפי בעלות עסק" misleading claim (le | 🟡  |
| **MEH-521** | 🔥 Urgent | BUG | 🐛 Homepage stats counter — fix "0 בתי עסק" + add graceful fallbac | 🟡  |
| **MEH-321** | 🔴 High | BUG | 🟠 /api/producers/me returns 422 after producer registration (Pyda | 🟢  |
| **MEH-208** | 🟡 Med | BUG | 🐛 Copy fix: Editorial paragraph 1 — "רק שעכשיו את רואה אותם" → "כ | 🟢  |
| **MEH-209** | 🟡 Med | BUG | 🐛 Copy fix: /about hero — פסקה 1 שורה 2 | 🟢  |
| **MEH-515** | 🟡 Med | BUG | 🐛 rating_dispatcher: עטיפת send(click) ב-try/except — מניעת batch | 🟢  |
| **MEH-517** | 🟡 Med | BUG | 🐛 React #418 hydration mismatch — staging admin (גילתה במהלך MEH- | 🟢  |

### 🎯 Start Here Order — Phase 1

1. **MEH-520** — header banner contradiction (5 min)
2. **MEH-521** — stats counter API (1-2 hrs) — **חוסם MEH-524 + MEH-538**
3. **MEH-321** — `/api/producers/me` 422 (1 hr)
4. **MEH-517** — React #418 hydration (2 hrs)
5. **MEH-515** — rating dispatcher (1 hr)
6. **MEH-208 + MEH-209** — copy fixes /about (30 min combined)
7. **MEH-78** — map default coords (15 min)

**זמן משוער:** 1-2 ימי עבודה רצופים. כל המשימות 🟢 GREEN — full auto.

## ✍️ Phase 2 — Foundation Copy

**Copy לפני visual.** העתיד-משתמשת רואה copy ב-2 שניות הראשונות, ויזואל ב-5. Hero + criteria + founder credibility = הסיפור הבסיסי.

**Autonomy mix:** 🟢 2 · 🟡 7 · 🔴 2

| ID | Priority | Type | משימה | Autonomy |
|----|----------|------|------|----------|
| **MEH-522** | 🔴 High | RESEARCH | 📝 Copy: Hero subheading — 3 research-driven candidates (Smadar pi | 🟡  |
| **MEH-176** | 🟡 Med | COPY | 📝 Cowork שלב 2 — Templates Library (producer, whatsapp, weekly re | 🟡  |
| **MEH-413** | 🟡 Med | COPY | 📝 Producer commitment template — script for first 10 producer mee | 🔴  |
| **MEH-414** | 🟡 Med | COPY | 📝 Producer commitments template — personal trust-by-action docume | 🔴  |
| **MEH-526** | 🟡 Med | COPY | 📝 Content: הרחבת 5 קריטריוני כניסה למאמר עומק (SEO + trust) | 🟡  |
| **MEH-527** | 🟡 Med | DESIGN | 📝 /about: Founder credibility amplification — "תוכניתנית + רפואה  | 🟡  |
| **MEH-532** | 🟡 Med | COPY | 📝 [Sub 4/4] "ספרי את הסיפור" — description prominence + Hebrew pl | 🟡  |
| **MEH-534** | 🟡 Med | DESIGN | 📝 Content + Design: עמוד "תהליך הקבלה למהמקור" | 🟡  |
| **MEH-535** | 🟡 Med | COPY | 📧 Newsletter copy upgrade + welcome email — leverages existing en | 🟡  |
| **MEH-541** | ⚪ Low | COPY | 📚 docs/COPY_BANK.md — תיעוד source-of-truth לכל copy decisions | 🟢  |
| **MEH-545** | ⚪ Low | COPY | 🌐 Hebrew Writer skill — anti-detection sweep על copy מ-MEH-520-54 | 🟢  |

## 🎨 Phase 3 — Visual/Design

**אחרי copy.** Trust strip, comparison, mini-map, design system refactors. **CRITICAL ORDER:** MEH-136 (design tokens) → 131-135 (page refactors) במקביל.

**Autonomy mix:** 🟢 6 · 🟡 5 · 🔴 6

| ID | Priority | Type | משימה | Autonomy |
|----|----------|------|------|----------|
| **MEH-123** | 🔥 Urgent | DESIGN | MEH-109 — Claude Design Session 1: Logo + Hero redesign | 🔴  |
| **MEH-122** | 🔴 High | DESIGN | Design — Map redesign: split view + bottom sheet + custom markers | 🔴  |
| **MEH-136** | 🔴 High | DESIGN | Design tokens — הוספת elevation + typography scale + editorial sp | 🔴  |
| **MEH-203** | 🔴 High | DESIGN | 🎨 Redesign: Category selector בטופס הרשמת עסק (12 pills → search  | 🔴  |
| **MEH-451** | 🔴 High | DESIGN | 🌱 לוגו חדש — קונספט הזרע (3 שכבות + אסימטריה) | 🔴  |
| **MEH-523** | 🔴 High | DESIGN | 🎨 Design + copy: שלב 4 חדש "הכירי" ב"איך זה עובד" — trust step חס | 🟡  |
| **MEH-524** | 🔴 High | DESIGN | 🎨 Design + feature: Trust signals strip — 4 honest counters בעמוד | 🟡  |
| **MEH-525** | 🔴 High | DESIGN | 📝 Content + design: Comparison strip "סופר vs מהמקור" — 3 rows, c | 🟡  |
| **MEH-76** | 🔴 High | DESIGN | עיצוב מחדש בית העסק | 🔴  |
| **MEH-131** | 🟡 Med | REFACTOR | Refactor — /login page: התאמה ל-design system החדש | 🟢  |
| **MEH-132** | 🟡 Med | REFACTOR | Refactor — /register + /register/producer: התאמה ל-design system | 🟢  |
| **MEH-133** | 🟡 Med | REFACTOR | Refactor — /neighbor: התאמה ל-design system החדש | 🟢  |
| **MEH-134** | 🟡 Med | REFACTOR | Refactor — /events: התאמה ל-design system החדש | 🟢  |
| **MEH-135** | 🟡 Med | REFACTOR | Refactor — /about: editorial breathing + design system | 🟢  |
| **MEH-537** | 🟡 Med | AUDIT | 🎨 Design audit: Premium feel vs Community feel — warmth tokens ca | 🟡  |
| **MEH-538** | 🟡 Med | FEATURE | 🗺️ Homepage: Mini-map preview above categories — discovery promin | 🟢  |
| **MEH-542** | 🟡 Med | DESIGN | 📰 Producer Stories Section — homepage section עם סיפורים אמיתיים | 🟡  |

### 🎯 Start Here Order — Phase 3

**Critical chain:** MEH-136 (tokens) → MEH-131-135 (refactors).  
**Parallel:** MEH-122 (map redesign) + MEH-76 (producer detail) + MEH-123 (logo).

1. **MEH-136** 🔴 — Design tokens expand (depends on Sessions 1-3 with Smadar)
2. **MEH-123** 🔴 — Logo Session 1 (Smadar runs Claude Design session)
3. **MEH-451** 🔴 — Logo concept implementation (after 123)
4. **MEH-131-135** 🟢 — Page refactors (parallel, after 136)
5. **MEH-122** 🔴 — Map redesign (parallel, design session needed)
6. **MEH-76** 🔴 — Producer Detail redesign (parallel, design session needed)
7. **MEH-538** 🟢 — Mini-map preview (after MEH-521)
8. **MEH-524** 🟡 — Trust strip (after MEH-521)

## 🔧 Phase 4 — Backend/UX

**במקביל ל-Phase 3.** WhatsApp chain, multi-channel, dashboard, onboarding. תלוי ב-WhatsApp Meta setup (MEH-507 ידני).

**Autonomy mix:** 🟢 2 · 🟡 10 · 🔴 0

| ID | Priority | Type | משימה | Autonomy |
|----|----------|------|------|----------|
| **MEH-529** | 🔥 Urgent | FEATURE | 🍷 [Sub 1/4] Add 3 categories — wine, spices, chocolate (pre-launc | 🟡  |
| **MEH-288** | 🔴 High | DESIGN | 🎨 Design: Profile completeness card on producer dashboard | 🟡  |
| **MEH-289** | 🔴 High | DESIGN | 📝 Copy + design: 6 producer-dashboard empty states (3-line struct | 🟢  |
| **MEH-290** | 🔴 High | FEATURE | ✨ Feature: Producer first-visit onboarding tour (4 steps) | 🟡  |
| **MEH-296** | 🔴 High | DESIGN | 🎨 Contact routing: Producer chooses how customers reach her (mult | 🟡  |
| **MEH-509** | 🔴 High | OTHER | 🤖 WhatsApp automation: welcomes + approvals + after-hours + AI ri | 🟡  |
| **MEH-530** | 🔴 High | FEATURE | 📜 [Sub 2/4] producer_license_number field + conditional validatio | 🟡  |
| **MEH-531** | 🔴 High | FEATURE | 🏆 [Sub 3/4] Badge "רישיון יצרן ✓" in badges.js | 🟢  |
| **MEH-201** | 🟡 Med | FEATURE | City autocomplete component — reuse existing /cities endpoint | 🟡  |
| **MEH-292** | 🟡 Med | FEATURE | ✨ Feature: Shared InfoTooltip component + 10 instrumented labels | 🟡  |
| **MEH-297** | 🟡 Med | FEATURE | ✨ Feature: Quick producer signup — auto-fill from existing websit | 🟡  |
| **MEH-539** | 🟡 Med | FEATURE | 🎁 Producer onboarding follow-ups (4 emails + 3 guides) — extends  | 🟡  |

## 🛠️ Phase 5 — Other Pre-launch (Tooling/Refactors)

**i18n sweep + tooling + secondary features.** רץ במקביל ל-Phases 3+4. י18n waves (472→476) הן sequential, אבל אפשר להתקדם בכל wave בלי לחסום משהו אחר.

**Autonomy mix:** 🟢 27 · 🟡 10 · 🔴 7

| ID | Priority | Type | משימה | Autonomy |
|----|----------|------|------|----------|
| **MEH-124** | 🔴 High | DESIGN | MEH-124 — Claude Design: עדכון תוכן לפני כל session | 🔴  |
| **MEH-160** | 🔴 High | OTHER | 🤖 Analytics bot filtering — spoofed UA bypass | 🟢  |
| **MEH-409** | 🔴 High | OTHER | 🤝 First 10 producers from personal network — pre-launch supply se | 🔴  |
| **MEH-434** | 🔴 High | OTHER | 🔭 Launch cohort observability protocol — tag month-1 users + Sent | 🔴  |
| **MEH-478** | 🔴 High | OTHER | 🐞 Sandbox/MCP visibility discrepancies — list_branches returned i | 🟢  |
| **MEH-484** | 🔴 High | FEATURE | 🧪 Playwright --fail-on-flaky-tests + trace on retry | 🟢  |
| **MEH-105** | 🟡 Med | OTHER | Map Pins — אייקוני Phosphor + הקטנה ל-28px | 🟢  |
| **MEH-177** | 🟡 Med | OTHER | 🧪 Cowork שלב 3 — First Producer Workflow (end-to-end test) | 🟡  |
| **MEH-222** | 🟡 Med | BUG | 🎨 Avatar UX — לא ברור שאפשר ללחוץ על התמונה לשינוי | 🟢  |
| **MEH-224** | 🟡 Med | FEATURE | Admin dashboard — tooltips + explanations for all features | 🟡  |
| **MEH-226** | 🟡 Med | OTHER | Admin rejection UI — where does admin type rejection reason? | 🟡  |
| **MEH-263** | 🟡 Med | OTHER | 📋 LocationModal z-index חוסם GPS button — לבדוק אחרי launch: UX א | 🟢  |
| **MEH-264** | 🟡 Med | OTHER | 🔧 Vercel Deployment Protection bypass secret | 🔴  |
| **MEH-272** | 🟡 Med | OTHER | Add CHECK constraints to Producer ORM + migration (defense-in-dep | 🟡  |
| **MEH-273** | 🟡 Med | OTHER | Alembic follow-ups from MEH-267 adversarial review | 🟢  |
| **MEH-282** | 🟡 Med | FEATURE | ♻️ Migrate GSI integration to @react-oauth/google (replaces MEH-2 | 🟡  |
| **MEH-323** | 🟡 Med | FEATURE | 🔵 TypeScript hybrid setup — tsconfig + allowJs + lib/api-types.ts | 🟡  |
| **MEH-328** | 🟡 Med | FEATURE | 🛡️ Anti-Enumeration on /register — generic response per OWASP Aut | 🟡  |
| **MEH-339** | 🟡 Med | FEATURE | ✨ Feature: Video embed בפרופיל בית עסק (IG Reels / YouTube / Vime | 🟡  |
| **MEH-344** | 🟡 Med | OTHER | ⚡ Slash commands — /commit-push-pr, /handoff, /start-meh | 🟢  |
| **MEH-354** | 🟡 Med | FEATURE | 🔄 /retro slash command — end-of-session behavior retro | 🟢  |
| **MEH-366** | 🟡 Med | TOOLING | 📋 i18n migration — scoping + plan | 🔴  |
| **MEH-405** | 🟡 Med | OTHER | Add Rules 22 + 23 to workflow.md — PR scope verification + Linear | 🟢  |
| **MEH-429** | 🟡 Med | OTHER | 🔧 Upgrade psycopg2-binary | 🔴  |
| **MEH-448** | 🟡 Med | OTHER | 🧹 Clean ALL 18 baseline ruff violations | 🟢  |
| **MEH-472** | 🟡 Med | TOOLING | 🌐 i18n Wave 2 — Header/Footer/Hero | 🟢  |
| **MEH-473** | 🟡 Med | TOOLING | 🌐 i18n Wave 3 — producer detail / card + map widgets + ICU plural | 🟢  |
| **MEH-474** | 🟡 Med | TOOLING | 🌐 i18n Wave 4 — auth + profile + dashboards (CVE check required) | 🟢  |
| **MEH-475** | 🟡 Med | TOOLING | 🌐 i18n Wave 5 — long tail + admin + language toggle UI | 🟢  |
| **MEH-476** | 🟡 Med | TOOLING | 🌐 i18n Wave 6 — SEO surfaces: sitemap.js per-locale extension + h | 🟢  |
| **MEH-480** | 🟡 Med | FEATURE | 🤖 Nested CLAUDE.md stubs — 4 directory briefings for Claude Code | 🟢  |
| **MEH-486** | 🟡 Med | DOCS | 📐 ADR-007 — Expand-Contract is the only sanctioned schema-change  | 🟢  |
| **MEH-518** | 🟡 Med | FEATURE | 🔧 Admin UI rename: כפתור "Twilio test" → "WhatsApp test" (post-ME | 🟢  |
| **MEH-182** | ⚪ Low | OTHER | 🔧 Routine B — Quick Task Drafter (PR drafts for labeled tasks) | 🟡  |
| **MEH-312** | ⚪ Low | BUG | 🟢 recipes.category_id חסר ondelete — quick win SET NULL | 🟢  |
| **MEH-334** | ⚪ Low | BUG | 🛡️ Boot-time guard — warn on FRONTEND_URL/ENV mismatch | 🟢  |
| **MEH-343** | ⚪ Low | OTHER | 🍎 Provision Apple OAuth — env vars + iPhone smoke vs pyjwt 2.12 ( | 🟡  |
| **MEH-463** | ⚪ Low | SECURITY | 🛡️ Finish T3 env migration | 🔴  |
| **MEH-481** | ⚪ Low | DOCS | 📜 File-header contract — codify docstring template in code-execut | 🟢  |
| **MEH-482** | ⚪ Low | FEATURE | 🔖 Sentinel markers — codify MEH-XXX / DO NOT / REUSES in code-exe | 🟢  |
| **MEH-501** | ⚪ Low | DOCS | 📚 Decision — Defer AutoDream activation, codify in ADR-008 | 🟢  |
| **MEH-502** | ⚪ Low | OTHER | 🪝 Gap analysis — Claude Code hooks coverage vs official Agent SDK | 🟢  |
| **MEH-503** | ⚪ Low | OTHER | 🧪 e2e.yml — root-cause fix for paths-filter base-ref fallback (fo | 🟢  |
| **MEH-514** | ⚪ Low | OTHER | Add `git reset --hard <ref>` to bash-safety-hook allowlist when r | 🟢  |

### 🎯 Start Here Order — Phase 5 (i18n chain)

**i18n waves are SEQUENTIAL — must complete in order:**

1. **MEH-472** Wave 2 (In Progress) — Header/Footer/Hero
2. **MEH-473** Wave 3 — Producer/Map (after Wave 2)
3. **MEH-474** Wave 4 — Auth/Profile (after Wave 3, +CVE check)
4. **MEH-475** Wave 5 — Long tail + toggle UI
5. **MEH-476** Wave 6 — SEO surfaces

**Parallel work** (לא תלוי ב-i18n): cleanup, tooling, security hardening.

## 🛡️ Phase 6 — Audits + Launch

**רק אחרי שכל ה-content מוכן.** 7 audits + 3 QA E2E + AI leak defense → MEH-125 (launch checklist) → 🚀.

**Autonomy mix:** 🟢 12 · 🟡 3 · 🔴 4

| ID | Priority | Type | משימה | Autonomy |
|----|----------|------|------|----------|
| **MEH-225** | 🔥 Urgent | QA | 🛡️ Pre-Launch QA Framework — Prevent bugs & edge cases site-wide | 🟢  |
| **MEH-227** | 🔥 Urgent | BUG | 🔍 Audit 1/7 — RTL & Physical CSS violations | 🟢  |
| **MEH-228** | 🔥 Urgent | BUG | 🔍 Audit 2/7 — Missing UI states (loading/error/empty/success) | 🟢  |
| **MEH-229** | 🔥 Urgent | BUG | 🔍 Audit 3/7 — Security (IDOR, rate limits, injection, secrets) | 🟢  |
| **MEH-233** | 🔥 Urgent | BUG | 🔍 Audit 7/7 — Mobile responsiveness | 🟢  |
| **MEH-215** | 🔴 High | BUG | ✅ QA ידני — מסע הרשמת משתמשת חדשה (E2E) | 🟢  |
| **MEH-216** | 🔴 High | BUG | ✅ QA — הוספת בית עסק חדש (publish → approve → visible) E2E | 🟢  |
| **MEH-217** | 🔴 High | BUG | ✅ QA ידני — Admin panel מקצה-לקצה (6 טאבים) | 🟢  |
| **MEH-230** | 🔴 High | BUG | 🔍 Audit 4/7 — Accessibility (aria, keyboard, contrast, focus) | 🟢  |
| **MEH-232** | 🔴 High | BUG | 🔍 Audit 6/7 — Copy consistency (Hebrew, feminine, RTL, typos) | 🟢  |
| **MEH-258** | 🔴 High | BUG | 📋 SECURITY-CHECKLIST.md — document known traps per category | 🟡  |
| **MEH-411** | 🔴 High | RESEARCH | 📊 Research: Magic number of producers — what's the inflection poi | 🔴  |
| **MEH-412** | 🔴 High | AUDIT | 🔍 Audit: Single-player mode value — what does a producer get with | 🔴  |
| **MEH-415** | 🔴 High | AUDIT | 🔁 Resilience audit — 3 critical flows that must work without foun | 🔴  |
| **MEH-449** | 🔴 High | FEATURE | 🛡️ AI artifact leak defense — 4-layer build/deploy guard | 🟢  |
| **MEH-214** | 🟡 Med | BUG | 🔍 Staging audit — web_fetch sweep של כל הroutes לפני launch | 🟢  |
| **MEH-452** | 🟡 Med | AUDIT | 🔍 Schema.org AEO enhancements — openingHours + servesCuisine + Or | 🔴  |
| **MEH-464** | 🟡 Med | REFACTOR | 🛡️ Refactor env.js: codify client-safe invariant to prevent serve | 🟡  |
| **MEH-465** | 🟡 Med | SECURITY | 🛡️ Split env.js into client/server files (structural fix for recu | 🟡  |

### 🎯 Start Here Order — Phase 6

**Sequence:**
1. Run all 7 audits בparallel (227-233) — 🟢 GREEN, generate reports
2. Triage findings → open sub-MEHs for fixes
3. Run E2E QA tests (215, 216, 217)
4. AI leak defense (449) + Pre-launch QA framework (225)
5. Final launch checklist (MEH-125) → 🚀

## 🎭 Phase 0 — Epics & Meta

Parent issues שלא מתבצעים ישירות — הם wrappers של sub-tickets.

**Autonomy mix:** 🟢 0 · 🟡 0 · 🔴 8

| ID | Priority | Type | משימה | Autonomy |
|----|----------|------|------|----------|
| **MEH-130** | 🔥 Urgent | EPIC | 🗺️ מהמקור Roadmap — סדר עבודה מלא (v2) | 🔴  |
| **MEH-504** | 🔥 Urgent | EPIC | 🔴 WhatsApp Business launch — Direct Cloud API + Coexistence (epic | 🔴  |
| **MEH-125** | 🔴 High | EPIC | MEH-125 — Pre-Launch Checklist: Redesign | 🔴  |
| **MEH-174** | 🔴 High | EPIC | 🚀 Epic — הקמת Claude Cowork כ-operations hub למהמקור | 🔴  |
| **MEH-195** | 🔴 High | EPIC | 🚀 Pre-launch — 10 missing/broken essentials (parent) | 🔴  |
| **MEH-519** | 🔴 High | EPIC | 📰 Epic — Content & messaging overhaul (research-driven, May 2026) | 🔴  |
| **MEH-528** | 🔴 High | EPIC | 🎯 Onboarding Flow v2 — categories + license + story (Epic) | 🔴  |
| **MEH-180** | 🟡 Med | EPIC | 🤖 Epic — Claude Code Routines | 🔴  |

## 🌅 Phase 7 — Post-launch

**HARD BLOCKED until launch + 30 days + 50 producers.** Hosts research, personalization, press kit, observability v2.

**Autonomy mix:** 🟢 0 · 🟡 8 · 🔴 16

| ID | Priority | Type | משימה | Autonomy |
|----|----------|------|------|----------|
| **MEH-270** | 🟡 Med | RESEARCH | 🔬 Research — architecture patterns from top OSS projects (post-la | 🔴  |
| **MEH-416** | 🟡 Med | FEATURE | 🤲 Founder-in-the-loop principle — 5 meetings/week beats 5 feature | 🔴  |
| **MEH-108** | ⚪ Low | OTHER | v2 — מנוי שבועי CSA (ירקות/ביצים קבועות) | 🟡  |
| **MEH-178** | ⚪ Low | RESEARCH | ⏰ Cowork שלב 4 — Scheduled Tasks (דוח שבועי + keyword research) — | 🟡  |
| **MEH-239** | ⚪ Low | BUG | 💬 WhatsApp Business API infrastructure (post-launch v2) | 🟡  |
| **MEH-310** | ⚪ Low | RESEARCH | 🛠️ Custom Mehamakor research skills — interview guides לבעלי עסקי | 🟡  |
| **MEH-324** | ⚪ Low | RESEARCH | 📋 Research: TypeScript full migration plan (post-launch) | 🟡  |
| **MEH-340** | ⚪ Low | RESEARCH | 🎬 Research: Editorial intro card — premium production service (po | 🔴  |
| **MEH-347** | ⚪ Low | DESIGN | 🎨 Visual verification loop ל-design sessions (Playwright) — POST- | 🔴  |
| **MEH-348** | ⚪ Low | AUDIT | 🔍 Skill audit — 16 skills installed, retire dead ones (POST-LAUNC | 🔴  |
| **MEH-387** | ⚪ Low | DESIGN | 🎨 Personalization layer (post-launch) — Editorial homepage + tags | 🔴  |
| **MEH-388** | ⚪ Low | OTHER | [Sub 1/5] 🏷️ Tags taxonomy + data model — dietary, values, busine | 🔴  |
| **MEH-389** | ⚪ Low | OTHER | [Sub 2/5] 👤 User preferences profile — dietary, values, home_city | 🔴  |
| **MEH-390** | ⚪ Low | OTHER | [Sub 3/5] 🎯 Onboarding mini-quiz — 3 שאלות, אופציונלי, dismissabl | 🔴  |
| **MEH-391** | ⚪ Low | OTHER | [Sub 4/5] 📰 Editorial homepage rotation + admin tool — Hero + 4 s | 🔴  |
| **MEH-392** | ⚪ Low | OTHER | [Sub 5/5] 🔗 "בתי עסק דומים" ב-ProducerDetail — content-based simi | 🔴  |
| **MEH-430** | ⚪ Low | DOCS | docs: ROADMAP.md — add MEH-428 post-launch block | 🟡  |
| **MEH-435** | ⚪ Low | OTHER | 📊 Product analytics: PostHog integration (events + funnels) — POS | 🟡  |
| **MEH-533** | ⚪ Low | OTHER | 🍳 [Post-launch review] Make Eat partnership for home bakers (Pers | 🔴  |
| **MEH-536** | ⚪ Low | RESEARCH | 🎯 Research: "Editor's pick" weekly highlights — fits magazine mod | 🔴  |
| **MEH-540** | ⚪ Low | FEATURE | 📰 Press kit + LinkedIn page — post-launch + 30 days | 🔴  |
| **MEH-543** | ⚪ Low | RESEARCH | 🏘️ Research: מארחות שכונה (LRQDO model) — feasibility post-launch | 🔴  |
| **MEH-544** | ⚪ Low | RESEARCH | 🗺️ Research: Discovery layer v2 — homepage discovery patterns pos | 🔴  |
| **MEH-86** | ⚪ Low | OTHER | Infinite scroll on /producers (replace pagination) | 🟡  |

---

## 🔗 How to Use This Document

### As Smadar (decision maker):
1. **לכל יום:** קראי את ה-Phase הנוכחי + Start Here Order
2. **בחירת משימה:** העדיפי 🟢 GREEN לעבודה רצופה (אין הפרעות)
3. **משימת 🔴 RED:** הקציי לה זמן מובנה — דורשת דיון
4. **Linear is source of truth:** תיאור המשימה ב-Linear מנצח את הטבלה הזו

### As Claude (operator):
1. **לפני כל task:** קראי את ה-`autonomy` field
2. **🟢:** רוץ end-to-end, עצור רק לפני git push, פתחי PR
3. **🟡:** הגישי numbered plan → המתיני ל-"go" → רוץ עד PR
4. **🔴:** chunk-by-chunk, אישור per chunk

### As Claude Code (executor):
1. **קראי `docs/EXECUTION_PROTOCOL.md`** לפני שמתחילים משימה
2. **בדקי `autonomy` field** ב-Linear description
3. **לכל משימת 🟢:** הוספת autoApprove rules ל-`.claude/settings.json` יכולה לחסוך זמן

---

## 📅 Recommended Timeline (Pre-launch)

```
Week 1-2:  Phase 1 (Critical bugs) + Start design sessions (123, 76, 122)
Week 3-4:  Phase 2 (Copy) + WhatsApp setup (507) + i18n Wave 2-3
Week 5-6:  Phase 3 (Visual) + Phase 4 (Backend) + i18n Wave 4
Week 7-8:  Phase 4 finish + Phase 5 (tooling) + i18n Wave 5
Week 9-10: Phase 5 finish + i18n Wave 6 + start Phase 6 audits
Week 11-12: Phase 6 (audits + QA) → MEH-125 → 🚀 LAUNCH
Week 13+:  Phase 7 (post-launch)
```

**Total pre-launch:** ~12 weeks (3 months) with parallel execution.

---

## 🚧 Critical Path (BlockedBy chains)

המשימות הבאות **חוסמות את הסדר הכללי** — אם נפלות תאחרת:

1. **MEH-521 (stats)** → MEH-524, MEH-538
2. **MEH-136 (design tokens)** → MEH-131, 132, 133, 134, 135 (5 tickets!)
3. **MEH-508 (WhatsApp Cloud API)** → MEH-509, MEH-518
4. **MEH-123 (Logo Session 1)** → MEH-451
5. **MEH-529 (categories)** → MEH-530 → MEH-531
6. **MEH-472 (i18n W2)** → 473 → 474 → 475 → 476
7. **MEH-464 (env invariant)** → MEH-465 (env split)

**Bottleneck #1:** MEH-136 — חוסם 5 משימות. קריטי להעביר.  
**Bottleneck #2:** MEH-521 — קל לתקן (1-2 שעות), אבל חוסם trust signals.

---

## 📝 Updates

**Update history (רשמי כאן כשמשתנה משהו):**
- 2026-05-10: Initial creation. 143 tasks classified. 96 links applied to Linear.

