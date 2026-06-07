# Launch cohort observability (MEH-434)

מטרה: להבדיל בין סשנים של משתמשות שנרשמו ב-30 הימים הראשונים אחרי ה-launch
(`launch_cohort:month_1`) לבין traffic אקראי מאוחר יותר — כדי שב-Sentry Replay
אפשר יהיה לסנן ולראות רק את ה-launch cohort.

## איך לסנן ב-Sentry

1. Sentry → **Replays**
2. בשורת החיפוש: `launch_cohort:month_1`
3. רואים רק סשנים של משתמשות שנרשמו בחלון ה-launch.

ה-tag מוצמד אוטומטית לכל משתמשת מחוברת (דרך `Sentry.setTag` ב-`auth-context`).
Anonymous visitors לא מתויגים — רק logged-in users עם `/auth/me`.

## Watchlist — 8 שאלות

1. איפה משתמשות נוטשות (where bailed)
2. איפה נתקעות (where stuck)
3. time-to-first-WhatsApp-click
4. יחס search → producer
5. signup completion rate
6. scroll depth ב-`/producer/[id]`
7. שימוש ב-city filter
8. mobile vs desktop split

**Cadence:** יום 1 · יום 7 · יום 30.

## ⚠️ חובה ביום ה-go-live

לעדכן את `LAUNCH_START` ב-**`frontend/lib/launch-cohort.js`** לתאריך ה-launch
האמיתי (כרגע placeholder `2026-05-15`). `LAUNCH_END` נגזר אוטומטית (+30 יום).
PR קטן נפרד (~5 דק). להוסיף ל-checklist של MEH-125 (pre-launch).

## מה NOT לעשות

- **אין PII ב-tags** — לא email, לא name, לא phone, לא city. רק התווית `month_1`.
- רק `Sentry.setTag` — **לא** `Sentry.setUser`.
- אין env var חדש — `LAUNCH_START` const מכוון (החלטה חד-פעמית).

## הערת scope — מה מומש ומה נדחה

ה-slice שמומש (MEH-434, batch-6) הוא **code-only / client-side**: ה-cohort
מחושב בדפדפן מ-`user.created_at` (שכבר חוזר ב-`UserOut` → `/auth/me`,
`backend/app/schemas/schemas.py:752`) ומוצמד כ-Sentry tag. אין שינוי
backend/schema.

**נדחה (DEFER)** מתוך ה-Numbered Plan המקורי של MEH-434 — דורש backend, מחוץ
ל-scope של slice זה:

- `backend/app/routers/auth.py` — constants `LAUNCH_START/END` + helper
  `_compute_launch_cohort` + הוספת השדה ל-`GET /auth/me`.
- `backend/app/schemas/schemas.py` — `UserOut.launch_cohort: str | None`.
- `backend/tests/test_auth.py` — 3 cases.

הגרסה ה-client-side מספקת את אותו tag ל-Sentry בלי ה-round-trip; אם בעתיד
רוצים את ה-cohort גם server-side (למשל ל-analytics endpoints), אפשר להוסיף
את ה-backend slice מעל זה בלי לסתור.
