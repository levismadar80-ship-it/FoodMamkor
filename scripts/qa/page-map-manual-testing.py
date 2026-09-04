#!/usr/bin/env python3
"""
Module:   page-map-manual-testing
Purpose:  Emit docs/qa/conversion-page-map.md — the section → app-page mapping
          for every `##` section of docs/MANUAL_TESTING.md, joined to the
          frozen triage matrix (docs/qa/manual-testing-matrix.md) so each
          MEH-1249 page chunk knows what it owns before it starts.
Touches:  nothing. Reads the two docs, writes one generated markdown file.
Does NOT: classify items or decide verdicts — the matrix stays the SoT for the
          rows it covers (Sapir, 04/09). It only COUNTS, and it counts by
          derivation, never by typing (testing.md § "derive counts").
Does NOT: guess a page. Every `##` heading must appear in SECTION_PAGE below;
          an unlisted heading fails the run (exit 1) so a new section written
          after this file cannot silently land nowhere.
Related:  scripts/qa/tier-manual-testing.py (the line-keyed tier sidecar),
          docs/qa/conversion-progress.md (the checkpoint file), MEH-1249.
History:  MEH-1249 chunk 0 (creation, 04/09 — "refresh scope, one page per
          chunk per PR").

HOW THE MATRIX IS JOINED (measured, not assumed)
  The matrix `Section` column is "verbatim from MANUAL_TESTING.md" at the
  triage commit, but 30 of its 165 distinct keys no longer equal a live `##`
  heading. Measured 04/09 they fall into four shapes, each handled below:
    1. `H2 › H3`            — the H2 half is the section
    2. a bare `###` name    — resolved to its parent `##`
    3. `<H2 prefix> — <H3>` — e.g. "Filter chips — /map — mobile (375px)"
    4. a `#` (H1) heading   — resolved to the first `##` after it
  plus one key that is a strict prefix of a heading that was later extended
  (MEH-1048). A key matching none of these is reported, never dropped.
  Six matrix rows have unescaped `|` inside the Item text, which shifts the
  verdict cell; the verdict is therefore found by value, not by column index.
"""
import re
import sys
import io
import pathlib
import collections
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "MANUAL_TESTING.md"
MATRIX = ROOT / "docs" / "qa" / "manual-testing-matrix.md"
OUT = ROOT / "docs" / "qa" / "conversion-page-map.md"

# The seven ticket verdicts plus `N/A`, which one row (matrix :559, a struck
# item whose status was removed by MEH-2124) carries; counted under "other".
VERDICTS = {"CONVERT-PW", "CONVERT-PYTEST", "COVERED", "STALE", "KEEP-RUNBOOK", "DEVICE-ONLY", "UNCLEAR", "N/A"}
ITEM_RE = re.compile(r"^\s*-\s\[[ xX]\]")

# The 13 buckets, in chunk order. The last one is not a page.
PAGES = [
    ("share", "/share", "chunk 1"),
    ("join", "/join", "chunk 2"),
    ("about", "/about/process (+ /about, /about/why-local)", "chunk 3"),
    ("legal", "legal — /privacy · /terms · /contact · /accessibility", "chunk 4"),
    ("producers", "/producers", "chunk 5"),
    ("map", "/map", "chunk 6"),
    ("home", "/ (home)", "chunk 7"),
    ("producer-detail", "/producer/[id]", "chunk 8"),
    ("register-producer", "/register/producer", "chunk 9"),
    ("login-register", "/login + /register", "chunk 10"),
    ("dashboard", "/producer/dashboard/*", "chunk 11"),
    ("admin", "/admin/*", "chunk 12"),
    ("cross-cutting", "cross-cutting / not a page (component tests, emails, backend-only, CI, runbooks, other routes)", "no chunk"),
]
PAGE_KEYS = [p[0] for p in PAGES]

# Heading (verbatim, exact) → bucket. A mixed section lands on the page where
# its FIRST test would start (the surface its first items name); sections whose
# items span 3+ surfaces with no primary one go to cross-cutting.
SECTION_PAGE = {
    "MEH-1938 chunk 5a — מיקום העסק: שורות `producer_locations` הן המקור היחיד, אפס fallback לעמודות (02/09)": "producer-detail",
    "MEH-2197 + MEH-2198 — מצב אפס של סינון-יום: קומפקטי, מודע-לסיבה, עם ימי משלוח (27/08)": "home",
    "MEH-2138 chunk F — מסך ההצלחה נוחת מול העיניים, לא מתחת לפוטר (21/08)": "register-producer",
    "MEH-2138 chunk E — מונה SLA בראש תור המנהלת (21/08)": "admin",
    "MEH-2138 chunk C — chip «חובה»/«רשות» בכותרת כל סקשן באקורדיון העריכה (21/08)": "dashboard",
    "MEH-1768 — עזרת ריבוי-הנקודות בהרשמה: קבועה, לא מאחורי ה-checkbox (26/08)": "register-producer",
    "MEH-2136 — מסך ההצלחה בהרשמה: היררכיית פעולה + ספירת השלמות אמיתית (21/08)": "register-producer",
    "MEH-226 — דחיית בית עסק: סיבה נשמרת, נראית לבעלים, ונשלחת במייל (14/08)": "admin",
    "MEH-1872 — שינוי שם עסק עובר מודרציה חוזרת (09/08)": "dashboard",
    "MEH-1227 — פורטרט המייסדת ב-/about נקרא כתמונה בקורא-מסך (08/08)": "about",
    "MEH-1919 — שקט בשדות ההרשמה הצרכנית (06/08)": "login-register",
    "MEH-1884 — שעות פתיחה נספרות בהשלמת הפרופיל (04/08)": "dashboard",
    "MEH-1840 — קישור האמון הקנוני: תגית \"מאומת\" → /about/process (02/08)": "producer-detail",
    "MEH-1807 — ולידציה חוצת-שלבים באשף הרשמת עסק (31/07)": "register-producer",
    "MEH-1800 — מחרוזות ה-placeholder בשדה החיפוש מחזירות תוצאות (31/07)": "home",
    "MEH-1692 — רצועת האמון: משפט מתחת לסף, ספירה מעליו (31/07)": "producer-detail",
    "MEH-1769 — באנר \"שמרנו טיוטה\" באשף ההרשמה (29/07)": "register-producer",
    "MEH-1599 — מסך \"אין לך גישה\" במקום הפניה שקטה (26/07)": "dashboard",
    "MEH-1547 — מונה \"+N\" של תגיות בכרטיס עסק = disclosure לחיץ (26/07)": "producers",
    "MEH-1592 — ה-Popover של \"+N\" לא מתנגש בתגיות שכנות (26/07)": "producers",
    "MEH-1537 — ולידציית פרטי קשר (אימייל / טלפון / קבוצת וואטסאפ) (26/07)": "dashboard",
    "MEH-1551 — ContactCard מצבי-קצה: ערוץ יחיד + phone-reveal in-place (26/07)": "producer-detail",
    "MEH-1583 — phone-reveal: גיאומטריה אחת לכל תאי המטריצה (26/07)": "producer-detail",
    "MEH-1552 — VRT state-coverage ל-producer-detail (מצבי-קצה) (26/07)": "cross-cutting",
    "MEH-1489 — משטחי הרשמה מודעי-התחברות (early gate + adaptive CTA + redirect) (23/07)": "register-producer",
    "MEH-1465 — בחירת קטגוריות מרובה (OR) בשורות הצ'יפים (22/07)": "producers",
    "MEH-683 — אייקוני קטגוריות: מערכת גיאומטרית אחידה (Phosphor + vendored) (21/07)": "cross-cutting",
    "MEH-1452 — tint אייקון קטגוריה בצבע הקטגוריה (צ'יפים, inactive בלבד) (22/07)": "producers",
    "MEH-1438 — סינון \"צמחוני\" (is_vegetarian ברמת מוצר)": "producers",
    "MEH-1439 — סמנטיקת dietary: tooltips + מודעות בעלת עסק": "dashboard",
    "MEH-1536 — בודק \"מגיעים אלייך?\" (DeliveryChecker ב-DeliveryBlock)": "producer-detail",
    "MEH-1435 — רשימת ערי משלוח קומפקטית (DeliveryBlock)": "producer-detail",
    "MEH-1772 — עלות משלוח פר-אזור (DeliveryBlock + דשבורד)": "producer-detail",
    "MEH-1388 — מרובי-מיקום מקצה-לקצה (epic — chunk 5, E2E + docs)": "map",
    "MEH-1421 — עורך מיקומים בדשבורד + סימן dedup באדמין (chunk 4a)": "dashboard",
    "MEH-1405 — ניהול אירועים וחוויות בדשבורד (רשימת \"שלי\" + עריכה + ביטול/מחיקה)": "dashboard",
    "MEH-1401 — מייל \"ברוכה הבאה\" ב-RTL HTML (21/07)": "cross-cutting",
    "MEH-1355 — CTA \"עריכת דף העסק\" בראש טאב \"העסק שלי\" (21/07)": "dashboard",
    "MEH-1403 — כפתור פריסט שעות = טוגל דו-כיווני מתויג": "dashboard",
    "MEH-1396 — צ'קליסט בדיקה לפני אישור בית עסק (אדמין, Phase 1)": "admin",
    "MEH-1334 — ProducerDetail Quiet Direction v3 (18/07)": "producer-detail",
    "MEH-1325 — לב עמוד בית העסק: סנכרון favorites-cache + ירוק (18/07)": "producer-detail",
    "MEH-1310 — שורת \"מועדפים\" בתפריט האווטאר הדסקטופי (18/07)": "cross-cutting",
    "MEH-1309 — כפתור \"חזרה לראש העמוד\" צף (18/07)": "home",
    "MEH-1291 — \"עודכן לאחרונה\" בעמוד העסק (18/07)": "producer-detail",
    "MEH-1289 — דף /about/why-local \"למה מקומי?\" (17/07)": "about",
    "MEH-1164 Chunk 2A — אכיפת אימות מייל לפני פרסום תוכן (17/07)": "cross-cutting",
    "MEH-1418 — צ'יפי toggle: אייקוני Phosphor + \"רישוי מאומת\" + שורות הסבר ב-FilterSheet (21/07)": "home",
    "MEH-1269 — \"קרוב אליי\" בבית = גאו אמיתי + צ'יפ סינון נראה (17/07)": "home",
    "MEH-1255 — משלוחים לכל הארץ חוץ מ־ (exclusion mode) (17/07)": "dashboard",
    "MEH-1256 — בחירה מהירה לפי אזור בשדה ערי משלוח (17/07)": "dashboard",
    "MEH-1259 — הסתרת badge \"אורגני\" מכל משטח ציבורי (17/07)": "cross-cutting",
    "MEH-1471 — שדה \"מאיפה שמעת עלינו?\" בהרשמת בית עסק (22/07)": "register-producer",
    "MEH-1258 — כרטיס \"רישיון יצרן\" בטאב עריכה (17/07)": "dashboard",
    "MEH-1167 — כרטיס \"תעודת כשרות\" בטאב עריכה (21/07)": "dashboard",
    "MEH sweep 16/07 — דשבורד בעלת עסק (1234/1236/1237/1238/1239)": "dashboard",
    "MEH-1229 — עקביות תמונות בתי-עסק (optimizeCloudinary + מפת יחסים פר-surface)": "cross-cutting",
    "MEH-1224 — רצועת כיתוב מתחת לתמונה + זום ב-hover (כרטיסי קטגוריה בבית)": "home",
    "MEH-1479 — כפתור \"נסו שוב\" במצב שגיאה של /favorites (22/07)": "cross-cutting",
    "MEH-1190…1196 — sweep (טלפון בהגדרות · opt-in וואטסאפ · LocationModal · ניקוי /map · כפתור קרוב-אליי · שורת שפה)": "cross-cutting",
    "MEH-1209 — כניסה לעריכת העסק מעמוד העסק הציבורי (owner-bar)": "producer-detail",
    "MEH-1186 — היררכיה ויזואלית ב-/producers (שפה אחת לכל התנהגות)": "producers",
    "MEH-1173 — כרטיס \"תיאור העסק\" (עוזר AI בתוך השדה + משפט תדמית)": "dashboard",
    "MEH-1174 — seam גילוי בבית (טיפ מעל הכותרת + כותרת דינמית + תג קטגוריה נשלף)": "home",
    "map-quality batch PR 3 — הסתרת צ'אט FAB ב-/map": "map",
    "MEH-1230 — GPS fix persists → \"מרחק\" + distance labels (/map)": "map",
    "map-quality batch PR 2 — מיון אמיתי ברשימת /map (דסקטופ)": "map",
    "map-quality batch PR 1 — כרטיס עסק אחיד ב-/map": "map",
    "MEH-1160 — דף /share \"ספרו עלינו\"": "share",
    "MEH-1145 Wave E3 — אימוץ ui/Input בטפסים כבדים (הגל האחרון)": "cross-cutting",
    "MEH-1145 Wave E2 — אימוץ ui/Input במשטחים ציבוריים": "cross-cutting",
    "MEH-435 chunk A — funnel events ב-/register/producer (PostHog)": "register-producer",
    "MEH-1142 — יישור גבהי כרטיסים ב-grids + הסרת method-hint": "home",
    "MEH-1085 — empty state מודע-סיבה בבית + פילטרי /events ב-URL": "home",
    "MEH-1103 — כיול גדלים: טקסט אינטראקטיבי ומטרות מגע (6 PRs)": "cross-cutting",
    "MEH-1048 — עמוד עסק: trust strip ליד ה-h1 (דירוג + מספר ביקורות + ציטוט)": "producer-detail",
    "MEH-1490 — שורת \"דירוג ב-Google\" שקטה (live-fetch בלבד)": "producer-detail",
    "MEH-1146 — עמוד עסק: לולאת גילוי \"עוד בתי עסק באזור\" (Chunk C)": "producer-detail",
    "MEH-1146 — עמוד עסק: כותרת דו-שכבתית + סדר סקציות (Chunk B)": "producer-detail",
    "MEH-2045 — ProductSheet: ניווט קודם/הבא בין מוצרים": "producer-detail",
    "MEH-1146 — עמוד עסק: כרטיס יצירת קשר עריכתי (Chunk A)": "producer-detail",
    "MEH-1047 — עמוד עסק: גלריית hero חדשה (grid, מצב עם תמונות)": "producer-detail",
    "MEH-1045 — bot hardening: fast-404 ל-catch-all + robots.txt + localeDetection:false": "cross-cutting",
    "MEH-995 — /join: דף הצטרפות כבית עסק": "join",
    "MEH-991 — design-parity sweep (Chunk 2, PRs #1468/#1472/#1476/#1477/#1479)": "cross-cutting",
    "MEH-994 — /register/producer: מסך \"לפני שמתחילים\" (pre-flight)": "register-producer",
    "MEH-1075 — /map filter IA: quick chips + FilterSheet": "map",
    "MEH-970 chunk 2-lite — /map near-me pill + empty-near-me guard (mobile)": "map",
    "MEH-815 — עמוד עסק: Tinted Masthead למצב ללא תמונות": "producer-detail",
    "MEH-853 — /register/producer frame 01 (DETAILS): city + address": "register-producer",
    "MEH-964 chunk 1A — producer dashboard nested-route shell": "dashboard",
    "MEH-964 chunk 1B — KPI strip on Overview + תובנות tab": "dashboard",
    "MEH-1134 — סקירה: סדר כרטיסים מותנה-מצב (completeness מעל availability)": "dashboard",
    "MEH-1099 — עורך תמונות: drag-drop + טיפי צילום": "dashboard",
    "MEH-1101 — תובנות: zero-state לפני פרסום + ערים ועוקבות עם n נמוך": "dashboard",
    "MEH-1102 — טאב כלים: ניקוי כפילות + אייקונים": "dashboard",
    "MEH-1158 — טאב עריכה: תצוגה מקדימה בכותרות האקורדיון": "dashboard",
    "MEH-1157 — טאב עריכה: 401 מפנה להתחברות + שגיאות ביו לפי סיבה": "dashboard",
    "MEH-1163 — כרטיס ביו: שדה ידני תמיד גלוי": "dashboard",
    "MEH-1100 — עורך הפרופיל: הגנת שינויים לא שמורים": "dashboard",
    "MEH-288 — ProfileCompletenessCard on producer dashboard": "dashboard",
    "MEH-1106 — ProfileCompletenessCard צ'קליסט 4-צעדים (card-only products, B1)": "dashboard",
    "MEH-773 Chunk B — DB integrity constraints (backend)": "cross-cutting",
    "MEH-805 — post-login redirect (3 senders → ?redirect=)": "login-register",
    "MEH-841 — comparison moved home→/about + layout A + copy refresh (supersedes MEH-525)": "about",
    "Overnight design batch 2026-06-12/13 (PRs #1073–#1080)": "home",
    "MEH-534 — /about/process \"תהליך הקבלה\" (S11 Direction D)": "about",
    "MEH-685 — Toast semantic icon API (Category D2 emoji strip)": "cross-cutting",
    "Friday-strip i18n fix (סרגל שישי)": "home",
    "MEH-788 — /register split-editorial (תמונה + טופס)": "login-register",
    "MEH-788 — hero דף הבית: תמונת תוצרת + Ken Burns": "home",
    "MEH-731 — navbar homepage-state (locale-path) + verify-banner relocation": "cross-cutting",
    "MEH-643 chunk 4 — Navbar floating-pill (FloatingNavbar v5)": "cross-cutting",
    "MEH-671 — Producer-signup smoke (now automated)": "cross-cutting",
    "MEH-1232 — Admin pending queue: photo thumbnails before approval": "admin",
    "MEH-669 — Admin producer-lockout fix": "admin",
    "MEH-669 recovery — for Smadar's local terminal only": "cross-cutting",
    "MEH-641 PR-A — auth chrome noindex verification": "login-register",
    "Anti-enumeration registration smoke test (MEH-328)": "login-register",
    "Stats counter reframe + skeleton (MEH-607)": "home",
    "HomepageMiniMap above the fold (MEH-604)": "home",
    "/map legend — disable empty-viewport categories (MEH-722)": "map",
    "Hide /neighbor pre-launch (MEH-598)": "cross-cutting",
    "Producer license number (MEH-530)": "admin",
    "Tier 1 — Claude (chat assistant)": "cross-cutting",
    "Tier 2 — Claude Code (CC)": "cross-cutting",
    "Tier 3 — Smadar (mobile real device)": "cross-cutting",
    "Anti-patterns (forbidden)": "cross-cutting",
    "Product price validation (MEH-295 backend)": "dashboard",
    "Producer status labels (MEH-294)": "admin",
    "Password policy wire-up (MEH-306 sub-A backend)": "login-register",
    "XSS sanitization sweep (MEH-329)": "cross-cutting",
    "~~Recipe ingredient cascade (MEH-311)~~": "cross-cutting",
    "MEH-51 — Trust Ladder + Kashrut Badges (PR #183)": "producers",
    "Producer Detail Page (feature/meh-producer-detail-redesign, 2026-04-18)": "producer-detail",
    "Legal pages (אפריל 2026)": "legal",
    "Security — POST /producers auth (PR #33)": "cross-cutting",
    "Events (קהילה — אירועים מקומיים)": "cross-cutting",
    "Filter chips — two-row layout (feature/meh-two-row-filter-chips, אפריל 2026)": "map",
    "Analytics — Producer + Admin dashboards (feature/producer-analytics, April 2026)": "admin",
    "Experiences (קהילה — חוויות קולינריות)": "cross-cutting",
    "Registration forms — RTL + dashboard copy": "register-producer",
    "Map city search width + dropdown z-index": "map",
    "Category card images — dairy + care": "home",
    "iOS Safari parallax verification": "home",
    "WhatsApp phone normalization": "producer-detail",
    "Form submit loading state — 5 forms": "cross-cutting",
    "CSP — Vercel Live feedback widget on preview URLs (fix/csp-allow-vercel-live-preview)": "cross-cutting",
    "Chat widget — plain Hebrew (feature/chatbot-plain-hebrew-v2)": "cross-cutting",
    "Eye toggle + inline form validation on /login + /register": "login-register",
    "Producer cards — 2-column mobile grid (task 9)": "home",
    "Compliance fixes (ESLint + RTL + accessibility + disclosures)": "cross-cutting",
    "Map z-index token system + UI bugfixes": "map",
    "/map desktop — marker click = card-sync (MEH-1010)": "map",
    "Dynamic OG tags + share message (social sharing)": "producer-detail",
    "Performance — Core Web Vitals (CWV audit)": "cross-cutting",
    "Component tests — vitest (automated)": "cross-cutting",
    "Share button on producer page (task 14)": "producer-detail",
    "Recently viewed businesses (task 13)": "home",
    "Advanced filter chips — homepage + /map (task 12)": "home",
    "\"קרוב אלי\" geolocation button on homepage (task 11)": "home",
    "/neighbor empty state (task 10)": "cross-cutting",
    "RTL Layout Regression — logical vs. physical classes": "cross-cutting",
    "Session Handoff": "cross-cutting",
    "איך לעדכן מסמך זה": "cross-cutting",
    "MEH-213: Business location types + cities autocomplete (PR #242)": "admin",
    "Smart Search — HeroSearch + /producers?q= (MEH-99, PR #199)": "home",
    "Google OAuth / CSP (fix #173, 2026-04-19)": "login-register",
    "MEH-287 — Producer registration WhatsApp welcome": "register-producer",
    "MEH-326 — JWT refresh token flow": "login-register",
    "MEH-291 Phase 3 — Unified availability card across 5 surfaces (May 2026)": "dashboard",
    "MEH-408 Phase 4 — DR drill (one-time, before MEH-408 closes)": "cross-cutting",
    "Cloudinary Orphan Cleanup (MEH-375)": "cross-cutting",
    "Phase 0 + 1 — OAuth & MCP wiring (DONE)": "cross-cutting",
    "Phase 2 — `/autofix-pr` slash command (DEFERRED)": "cross-cutting",
    "Phase 3 — Cloud Auto-Fix (DEFERRED)": "cross-cutting",
    "Pro plan caveat — token inflation": "cross-cutting",
    "Brand voice enforcement (MEH-472 hybrid)": "cross-cutting",
    "Status summary": "cross-cutting",
    "When to (re-)run": "cross-cutting",
    "Env vars required": "cross-cutting",
    "How to interpret": "cross-cutting",
    "UIS Pattern A (MEH-228) — admin double-submit protection": "admin",
    "/map producer card — distance from user (MEH-826 Gap 2)": "map",
    "MEH-848 — error toasts collapsed to error.generic (i18n refactor)": "cross-cutting",
    "/map list heading + subhead (MEH-826 Gap 3)": "map",
    "MEH-992 — group-buy dashboard form clarity": "dashboard",
    "MEH-997 — עמוד מודרציית מתכונים חדש (/admin/recipes)": "admin",
    "MEH-1115 — הסברי \"מה זה?\" בלוח הבקרה": "dashboard",
    "MEH-1116 — טאב עריכה כאקורדיון + עוגני URL": "dashboard",
    "MEH-1297 — ריבוי קטגוריות: סדר, cap 3, ותג \"ראשית\"": "register-producer",
    "MEH-1577 — שדות משלוח מובנים (delivery_fee + free_delivery_above)": "dashboard",
    "MEH-1869 — חלון הזמנות: כמה טווחים ביום (03/08)": "dashboard",
    "MEH-1871 — פאנל overlay נסגר בגלילה (03/08)": "producers",
    "MEH-1870 — שעות פתיחה: כמה טווחים ביום (03/08)": "dashboard",
    "MEH-1880 — שורת \"פתוח להזמנות\" על כרטיס העסק (04/08)": "producers",
    "MEH-1898 — הטבה בניסוח חופשי (סוג חמישי) (04/08)": "dashboard",
    "MEH-1917 — חלון הזמנות: פריסה שבועית מלאה מאחורי disclosure (06/08)": "producer-detail",
    "MEH-1916 — ה-CTA בגיליון המוצר הולך אחרי הערוץ שבחרה בעלת העסק (06/08)": "producer-detail",
    "MEH-1918 — קישור \"חוויות\" בניווט, מגודר לפי היצע (06/08)": "cross-cutting",
    "MEH-1872 — שינוי שם עסק עם מודרציה חוזרת (11/08)": "dashboard",
    "MEH-2100 — טיוטה: באנר ההשלמה ו«שליחה לבדיקה» (16/08)": "dashboard",
    "MEH-2072 — תוקף רישיון + רשימת תזכורות 30 יום (אדמין)": "admin",
    "MEH-1399 — רשימת בדיקה לפני אישור כדאטה + תיעוד סימונים (אדמין)": "admin",
}


def parse_sections(text):
    """Return [(line, h2, items, [h3...])] for every `##` outside code fences,
    plus a map h1_line -> next-h2 index for H1-keyed matrix rows."""
    fence = False
    secs = []
    h1_pending = []
    h1_map = {}
    for n, line in enumerate(text.splitlines(), 1):
        if line.startswith("```"):
            fence = not fence
            continue
        if fence:
            continue
        if line.startswith("## "):
            secs.append({"line": n, "h": line[3:].strip(), "items": 0, "h3": []})
            for h1 in h1_pending:
                h1_map[h1] = len(secs) - 1
            h1_pending = []
            continue
        if line.startswith("# "):
            h1_pending.append(line[2:].strip())
            continue
        if line.startswith("### ") and secs:
            secs[-1]["h3"].append(line[4:].strip())
            continue
        if ITEM_RE.match(line) and secs:
            secs[-1]["items"] += 1
    return secs, h1_map


def parse_matrix(text):
    """Return [(section_key, ordinal_or_None, verdict, destructive)] for the full matrix."""
    body = text.split("## Full matrix", 1)[1]
    rows = []
    for line in body.splitlines():
        if not line.startswith("| ") or line.startswith("| Section") or line.startswith("|---"):
            continue
        cells = [c.strip() for c in line.split("|")[1:-1]]
        if len(cells) < 5:
            continue
        key = cells[0]
        ordinal = int(cells[1]) if cells[1].isdigit() else None
        vi = next((i for i, c in enumerate(cells) if c in VERDICTS), None)
        if vi is None:
            rows.append((key, ordinal, "UNPARSED", "?"))
            continue
        verdict = cells[vi]
        destructive = cells[vi + 1] if vi + 1 < len(cells) else "?"
        rows.append((key, ordinal, verdict, destructive))
    return rows


def build_resolver(secs, h1_map):
    by_h2 = {s["h"]: i for i, s in enumerate(secs)}
    by_h3 = {}
    for i, s in enumerate(secs):
        for h3 in s["h3"]:
            by_h3.setdefault(h3, i)

    def resolve(key):
        if key in by_h2:
            return by_h2[key], "h2"
        if " › " in key:
            a = key.split(" › ", 1)[0].strip()
            if a in by_h2:
                return by_h2[a], "h2›h3"
        if key in by_h3:
            return by_h3[key], "h3"
        for h3, i in by_h3.items():
            if key.endswith(h3) and len(key) > len(h3):
                return i, "prefix+h3"
        if key in h1_map:
            return h1_map[key], "h1→next h2"
        for h2, i in by_h2.items():
            if h2.startswith(key):
                return i, "h2 prefix"
        return None, "unresolved"

    return resolve


def summarise(secs, rows, resolve):
    per = collections.defaultdict(lambda: {"rows": 0, "item_rows": 0, "v": collections.Counter(), "destr": 0, "how": set()})
    unresolved = collections.Counter()
    for key, ordinal, verdict, destr in rows:
        i, how = resolve(key)
        if i is None:
            unresolved[key] += 1
            continue
        p = per[i]
        p["rows"] += 1
        if ordinal is not None:
            p["item_rows"] += 1
        p["v"][verdict] += 1
        if destr == "yes":
            p["destr"] += 1
        p["how"].add(how)
    return per, unresolved


def coverage_cell(items, p):
    if p is None:
        return f"rows=0 · uncovered={items}", items, 0
    conv_pw = p["v"]["CONVERT-PW"]
    conv_py = p["v"]["CONVERT-PYTEST"]
    cov = p["v"]["COVERED"]
    stale = p["v"]["STALE"]
    other = p["rows"] - conv_pw - conv_py - cov - stale
    uncovered = items - p["item_rows"]
    conv = f"{conv_pw}" if not conv_py else f"{conv_pw}+{conv_py}py"
    if uncovered < 0:
        unc = f"0 (matrix has {-uncovered} more item-rows than live items)"
        covered_items = items
    else:
        unc = str(uncovered)
        covered_items = p["item_rows"]
    cell = f"rows={p['rows']} · CONVERT={conv} · COVERED={cov} · STALE={stale} · other={other} · uncovered={unc}"
    return cell, max(uncovered, 0), covered_items


def destructive_cell(p):
    if p is None:
        return "—"
    return f"yes ({p['destr']})" if p["destr"] else "no"


def self_test():
    """Anchored to the real files (MEH-1909): the join must resolve the four
    measured key shapes, and the verdict-by-value parser must survive a row
    with an unescaped pipe."""
    fails = 0
    ran = 0

    def chk(label, expected, actual):
        nonlocal fails, ran
        ran += 1
        ok = expected == actual
        print(f"  {'ok  ' if ok else 'FAIL'}  {label:<64} -> {actual!r} (expected {expected!r})")
        if not ok:
            fails += 1

    print("page-map-manual-testing --self-test\n")
    secs, h1_map = parse_sections(SRC.read_text(encoding="utf-8"))
    rows = parse_matrix(MATRIX.read_text(encoding="utf-8"))
    resolve = build_resolver(secs, h1_map)
    chk("parser finds sections at all", True, len(secs) > 100)
    chk("parser finds items at all", True, sum(s["items"] for s in secs) > 1000)
    chk("matrix rows parsed", True, len(rows) > 1000)
    chk("no matrix row left UNPARSED (verdict found by value)", 0, sum(1 for r in rows if r[2] == "UNPARSED"))
    # shape 1/exact — the /share section, 6 rows in the matrix
    i, how = resolve('MEH-1160 — דף /share "ספרו עלינו"')
    chk("exact H2 key resolves (MEH-1160)", "h2", how)
    chk("...to the section holding /share", True, i is not None and "/share" in secs[i]["h"])
    # shape 2 — a bare H3 key
    i, how = resolve("Tracking infrastructure")
    chk("bare H3 key resolves to its parent H2", "h3", how)
    chk("...which is the Analytics section", True, i is not None and secs[i]["h"].startswith("Analytics"))
    # shape 3 — H2-prefix + H3
    i, how = resolve("Filter chips — /map — mobile (375px)")
    chk("'<H2 prefix> — <H3>' key resolves", "prefix+h3", how)
    # shape 4 — H1 key
    i, how = resolve("Load testing (MEH-559)")
    chk("H1 key resolves to the first H2 after it", "h1→next h2", how)
    # extended heading
    i, how = resolve("MEH-1048 — עמוד עסק: trust strip ליד ה-h1")
    chk("strict-prefix key resolves to the extended heading", "h2 prefix", how)
    # negative control — a key that must NOT resolve, or the resolver is too loose
    i, how = resolve("this heading does not exist anywhere in the document")
    chk("control: a fake key stays unresolved", "unresolved", how)
    # every heading is assigned a page — the property the file exists for
    unassigned = [s["h"] for s in secs if s["h"] not in SECTION_PAGE]
    chk("every live `##` heading has a page", [], unassigned)
    stale_keys = [h for h in SECTION_PAGE if h not in {s["h"] for s in secs}]
    chk("no SECTION_PAGE key is stale (heading gone or edited)", [], stale_keys)
    print()
    if fails:
        print(f"self-test FAILED - {fails} of {ran}. Every count below is void.")
        return 1
    print(f"self-test ok - {ran} cases.")
    return 0


def main():
    if "--self-test" in sys.argv:
        return self_test()
    if self_test() != 0:
        print("\nRefusing to emit the page map from a join that does not resolve.")
        return 1
    print()

    secs, h1_map = parse_sections(SRC.read_text(encoding="utf-8"))
    rows = parse_matrix(MATRIX.read_text(encoding="utf-8"))
    resolve = build_resolver(secs, h1_map)
    per, unresolved = summarise(secs, rows, resolve)

    total_items = sum(s["items"] for s in secs)
    total_rows = len(rows)
    joined_rows = total_rows - sum(unresolved.values())
    covered_items = 0
    uncovered_items = 0
    cells = {}
    for i, s in enumerate(secs):
        cell, unc, cov = coverage_cell(s["items"], per.get(i))
        cells[i] = cell
        covered_items += cov
        uncovered_items += unc

    by_page = collections.defaultdict(list)
    for i, s in enumerate(secs):
        by_page[SECTION_PAGE[s["h"]]].append(i)

    today = date.today().isoformat()
    buf = io.StringIO()
    w = buf.write
    w("# MEH-1249 — conversion page map: `##` section → app page\n\n")
    w("> **GENERATED — do not hand-edit.** Re-run `python3 scripts/qa/page-map-manual-testing.py`\n")
    w("> (it self-tests first and refuses to emit if the join does not resolve).\n")
    w(f"> Source: `docs/MANUAL_TESTING.md` + `docs/qa/manual-testing-matrix.md` · as-of **{today}**.\n\n")
    w("**Status:** chunk 0 of the stage-2 conversion (MEH-1249). This file is the plan's index; the\n")
    w("per-chunk log lives in `docs/qa/conversion-progress.md`.\n\n")
    w("**Sapir's ruling (04/09):** *\"refresh scope (1,654), one page per chunk per PR\"* — the conversion\n")
    w("scope is the **current** `docs/MANUAL_TESTING.md`, the frozen matrix stays the SoT for the rows it\n")
    w("covers, and each chunk = one app **page** = one PR.\n\n")
    w("**The key rule:** a matrix row's verdict is not re-derived. An item the matrix does **not** cover gets\n")
    w("its verdict **inside the page chunk that touches it** — same 7-column schema, **appended** to the matrix,\n")
    w("never regenerated. \"Uncovered\" below therefore means *not yet triaged*, not *not converted*.\n\n")
    w("**Two things to know before trusting a row:**\n\n")
    w("- `docs/MANUAL_TESTING.md` is organised by **ticket** (one `##` per ticket/batch), not by route — there is\n")
    w("  no route table in the document itself. The `page` column here is a **judgement** recorded once in\n")
    w("  `SECTION_PAGE` inside the generator: a mixed section lands on the page where its first items start;\n")
    w("  a section spanning 3+ surfaces with no primary one is `cross-cutting`. Every heading must be listed —\n")
    w("  an unlisted or edited heading fails the run, so a new section cannot silently land nowhere.\n")
    w("- `docs/qa/manual-testing-tiers.md` is a **line-number-keyed** sidecar generated by\n")
    w("  `scripts/qa/tier-manual-testing.py`. Any chunk PR that edits `MANUAL_TESTING.md` (and every chunk does —\n")
    w("  it replaces converted items with pointer lines) shifts every line after the edit. **Re-run the tier\n")
    w("  script in every chunk PR that touches `MANUAL_TESTING.md`**, and this generator too.\n\n")
    w("## Counts (derived)\n\n")
    w("| Stat | Value |\n|---|---|\n")
    w(f"| `##` sections (outside code fences) | **{len(secs)}** |\n")
    w(f"| checklist items (`- [ ]` / `- [x]`) | **{total_items:,}** |\n")
    w(f"| matrix rows | **{total_rows:,}** ({joined_rows:,} joined to a live section, {sum(unresolved.values())} unresolved) |\n")
    w(f"| items with a matrix row (covered by the frozen triage) | **{covered_items:,}** |\n")
    w(f"| items with no matrix row (verdict owed by the chunk that touches them) | **{uncovered_items:,}** |\n")
    w(f"| destructive rows (matrix `yes`) | **{sum(p['destr'] for p in per.values())}** |\n\n")
    w("Per page (sections · items · items with a matrix row · items without · destructive rows):\n\n")
    w("| # | page | sections | items | covered | uncovered | destructive |\n|---|---|---|---|---|---|---|\n")
    for key, label, chunk in PAGES:
        idx = by_page.get(key, [])
        it = sum(secs[i]["items"] for i in idx)
        cov = sum(coverage_cell(secs[i]["items"], per.get(i))[2] for i in idx)
        unc = sum(coverage_cell(secs[i]["items"], per.get(i))[1] for i in idx)
        des = sum(per[i]["destr"] for i in idx if i in per)
        w(f"| {chunk} | {label} | {len(idx)} | {it} | {cov} | {unc} | {des} |\n")
    w(f"| | **total** | **{len(secs)}** | **{total_items:,}** | **{covered_items:,}** | **{uncovered_items:,}** | **{sum(p['destr'] for p in per.values())}** |\n\n")
    if unresolved:
        w("### Matrix rows whose `Section` key resolves to no live heading\n\n")
        w("Kept, not dropped — these rows still carry a verdict; the section they described was deleted or\n")
        w("renamed after the triage commit. The chunk that finds the live home for one of these re-keys it.\n\n")
        w("| matrix key | rows |\n|---|---|\n")
        for k, c in unresolved.most_common():
            k_md = k.replace("|", "\\|")
            w(f"| {k_md} | {c} |\n")
        w("\n")
    w("## The map\n\n")
    w("`matrix coverage` = `rows` joined from the matrix · `CONVERT` (PW, `+Npy` = CONVERT-PYTEST) · `COVERED` ·\n")
    w("`STALE` · `other` (KEEP-RUNBOOK / DEVICE-ONLY / UNCLEAR) · `uncovered` (live items with no row).\n")
    w("`rows` can exceed the item count by the matrix's section-level rows (checkbox-less sections got one row each).\n")
    w("`line` is the heading's line **as of this generation** — it moves every time the document is edited.\n\n")
    for key, label, chunk in PAGES:
        idx = by_page.get(key, [])
        it = sum(secs[i]["items"] for i in idx)
        w(f"### {label} — {chunk} ({len(idx)} sections · {it} items)\n\n")
        if not idx:
            w("_no section maps here_\n\n")
            continue
        w("| page | MT section (verbatim heading) | line | items | matrix coverage (rows / CONVERT / COVERED / STALE / other / uncovered) | destructive (from matrix) |\n")
        w("|---|---|---|---|---|---|\n")
        for i in sorted(idx, key=lambda j: secs[j]["line"]):
            s = secs[i]
            h = s["h"].replace("|", "\\|")
            w(f"| {label.split(' — ')[0].split(' (')[0]} | {h} | {s['line']} | {s['items']} | {cells[i]} | {destructive_cell(per.get(i))} |\n")
        w("\n")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(buf.getvalue(), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  sections:        {len(secs)}")
    print(f"  items:           {total_items}")
    print(f"  matrix rows:     {total_rows} (joined {joined_rows}, unresolved {sum(unresolved.values())})")
    print(f"  covered items:   {covered_items}")
    print(f"  uncovered items: {uncovered_items}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
