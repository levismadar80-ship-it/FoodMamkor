# מהמקור — ממשק אדמין + בדיקות
> קרא קובץ זה כשעובדים על /admin או בדיקות

## מבנה האדמין
sidebar קבוע ב: `frontend/app/admin/layout.js` — 8 דפים

| דף | URL | תוכן |
|----|-----|-------|
| Dashboard | /admin | 4 ראשיים + 4 משניים + התראות + גרף עסקים חדשים 6 חודשים + ערים מובילות + DAU 30 יום + לוח בריאות שרת + פעילות (ראה "אנליטיקס על /admin") |
| בתי עסק | /admin/producers | טבלה + חיפוש + ייבוא/ייצוא Excel + אישור מהיר |
| משתמשים | /admin/users | חיפוש + שינוי role + חסימה |
| תוכן | /admin/content | קטגוריות CRUD + עורך about/terms |
| דיווחים | /admin/reports | ממוין לפי דחיפות + פתור/השהה/התעלם |
| אנליטיקס | /admin/analytics | גרפים + heat map + top producers |
| חוויות | /admin/experiences | מיתון חוויות — 5 טאבים (ממתינות לאישור / דרוש תיקון / מאושרות / נדחו / הכל) + כפתורי אישור/דחייה/בקשת שינויים + התראת מייל למארח |
| הגדרות | /admin/settings | אימייל/WhatsApp אדמין + freemium + בדיקת Twilio/Cloudinary |

## Backend
קובץ: `backend/app/routers/admin_extra.py`

endpoints: `/admin/users`, `/admin/categories`, `/admin/pages/{slug}`,
           `/admin/analytics`, `/admin/settings`, `/admin/dashboard`

מודלים:
- `AdminSetting(key, value)`
- `StaticPage(slug, title, body)`
- שדה `users.is_blocked` — login דוחה עם 403

## בדיקות אוטומטיות
```
tests/test_api.py       — 24 pytest (auth, producers, filters, admin guard)
tests/test_e2e.spec.ts  — Playwright (public pages + admin guard)
tests/conftest.py       — fixture עם DB מבודד (mehamakor_test)
tests/README.md         — הוראות הרצה
```

הרצה:
```bash
pytest tests/test_api.py        # 24/24 passing
npx playwright test             # E2E
```

## Freemium
| תוכנית | מחיר | תמונות | מוצרים | סטטיסטיקות |
|--------|------|--------|---------|-------------|
| חינם | ₪0 | עד 3 | לא | לא |
| פרמיום | TBD | ללא הגבלה | כן | כן |

## אנליטיקס על /admin (feature/producer-analytics — April 2026)

ה-dashboard ב-`/admin` הורחב בסשן של אפריל 2026 עם קבוצת מטריקות חדשה.
כל הנתונים מגיעים מאותו endpoint (`GET /admin/dashboard`) כדי שרענון הדף
לא יפזר בקשות נפרדות.

**שורת stat cards משנית** (מתחת לקבוצה הראשית של 4):
- משתמשים חדשים השבוע (delta מתוך סה״כ)
- עסקים חדשים השבוע (delta מתוך סה״כ)
- סה״כ אירועים (קישור ל-/admin/content)
- סה״כ חוויות (קישור ל-/admin/experiences)

**גרפים:**
- **DAU — 30 ימים אחרונים** — SVG inline, מבוסס על `users.last_active_at`
  שמתעדכן דרך `get_current_user()` בכל בקשה מאומתת (מגובל ל-1 כתיבה לכל
  5 דקות כדי לא להעמיס על ה-DB).
- **ערים מובילות** — מצטבר מ-`producer_page_views.city` (top 10, שורות עם
  `NULL` city לא נספרות — מגיע רק ממשתמשות מחוברות עם שדה city בפרופיל).

**פאנל בריאות שרת:**
- `response_time_avg_ms` ו-`requests_per_minute` משעה אחרונה, מחושבים מ-
  sliding window bounded deque ב-`app/services/analytics.py` עם lock-sub-μs.
- הנתונים per-process בזיכרון בלבד. מתאפסים בכל deploy. לא משתפים בין
  workers — אם Railway מריץ את הבקאנד עם יותר מ-worker אחד, המדד
  משקף רק אחד מהם. הערה מוצגת בפאנל.

**Badge "פריטים ממתינים לאישור" על sidebar:**
- נטען ב-`frontend/app/admin/layout.js` כ-fetch ל-`/admin/dashboard` בכל
  שינוי של `pathname`, כך שהמספר מתעדכן כשעוברים בין דפי admin.
- הסכום: `pending_producers + open_reports + flagged_home_products +
  pending_experiences` (הארבע המטריצות פתוחות בנפרד ב-stats dict).
- מופיע כ-pill צהוב (`bg-yellow-400 text-yellow-900`) על הניווט "לוח
  מחוונים" בלבד, רק כשהספירה > 0. כל הערך מוצג מתחת ל-stat cards של
  ה-alerts המפורטת (pending producers / open reports / flagged).

**POST /producers/{id}/whatsapp-click** — anonymous, rate-limited 10/min per IP.
הקליינט (`WhatsAppButton.jsx` + inline `<a>` ב-`ProducerDetail.jsx`) יורה
`navigator.sendBeacon` מיד לפני פתיחת חלון wa.me. beacon לא חוסם את
פתיחת החלון — אפילו אם ה-tracking נכשל, המשתמש מגיע ל-WhatsApp.

**Source of truth ב-DB:** ראה `docs/DATA.md` סקציית "Analytics" —
`producer_page_views`, `producer_whatsapp_clicks`, `users.last_active_at`.
