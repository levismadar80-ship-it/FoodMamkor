# חוויות

**מה הן עושות.** ביקור מאורח אצל בית העסק — סיור, טעימה, סדנה חוזרת. אותה זרימת הרשמה כמו אירוע, עם קטגוריה משלה ומודרציה של AI על התיאור.

**Routes**
* `frontend/app/[locale]/(whats-on)/experiences/` (לשונית בתוך `frontend/app/[locale]/(whats-on)/layout.js`, MEH-3463) · `frontend/app/[locale]/experiences/[id]/`
* `frontend/app/[locale]/producer/dashboard/experiences/` ‏(+ `new`, `[id]/edit`)
* `frontend/app/[locale]/admin/experiences/`

**קבצים מרכזיים**
* `backend/app/routers/experiences.py`
* `backend/app/services/experience_moderation.py` — בדיקת AI, נכשלת פתוח בלי `ANTHROPIC_API_KEY`.
* `backend/app/services/experience_sessions.py` — מועדים של סדנה חוזרת (MEH-3441): עד 12 קדימה, ומקומות, המתנה ורישום כפול לכל מועד. סדנה חוזרת בלי מועדים נשארת מאגר מקומות אחד.
* `frontend/components/ExperienceSessionsField.jsx` — «מועדים» בתוך «החוויה חוזרת» בטופס בעלת העסק (MEH-3447): שורה לכל מועד, הסרת מועד עם נרשמות שואלת קודם.
* `frontend/components/RegistrationCta.jsx` — כפתור ההרשמה. לחיצה על וואטסאפ, התקשרות או «שאלה» נספרת לבית העסק (`trackChannelClick`, MEH-2991), כמו בדף בית העסק. קישור הרשמה חיצוני לא נספר. שומר: `frontend/__tests__/RegistrationCtaContactCount.test.jsx`.
* `frontend/components/RegistrationSessionSelect.jsx` — «מועד», השדה הראשון בטופס ההרשמה (MEH-3447). מועד מלא נשאר לבחירה והופך לרשימת ההמתנה של אותו מועד. רשימת הנרשמות בלוח הבקרה (`frontend/components/RegistrationsList.jsx`) מקובצת לפי מועד. שומר: `frontend/__tests__/ExperienceSessionsUi.test.jsx`.
* `frontend/lib/use-duplicate-source.js` — «שכפול» ברשימת החוויות פותח את `new?from=<id>` עם כל השדות מלאים חוץ מהתאריך. השורה נמצאת ב-`/experiences/mine` (MEH-3438). הטסט `frontend/__tests__/NewExperienceDashboardPage.test.jsx`.

**Flags.** אין.

**טסטים**
* `tests/test_experiences.py` · `tests/test_experience_moderation_unit.py`
* `tests/test_meh3441_session_signups.py` — **השומר** של המועדים: מועד מלא לצד מועד פנוי, אותה כתובת בשני מועדים, הסרת מועד מבטלת את ההרשמות שלו.
* `tests/test_meh2602_experience_category.py` · `tests/test_meh1176_experience_email_notifications.py` · `tests/test_meh3219_b12_recurring_experience.py`

**מזהי רישום שזה מכסה.** `experiences`.
