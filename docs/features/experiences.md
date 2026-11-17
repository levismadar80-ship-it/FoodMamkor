# חוויות

**מה הן עושות.** ביקור מאורח אצל בית העסק — סיור, טעימה, סדנה חוזרת. אותה זרימת הרשמה כמו אירוע, עם קטגוריה משלה ומודרציה של AI על התיאור.

**Routes**
* `frontend/app/[locale]/experiences/` · `frontend/app/[locale]/experiences/[id]/`
* `frontend/app/[locale]/producer/dashboard/experiences/` ‏(+ `new`, `[id]/edit`)
* `frontend/app/[locale]/admin/experiences/`

**קבצים מרכזיים**
* `backend/app/routers/experiences.py`
* `backend/app/services/experience_moderation.py` — בדיקת AI, נכשלת פתוח בלי `ANTHROPIC_API_KEY`.

**Flags.** אין.

**טסטים**
* `tests/test_experiences.py` · `tests/test_experience_moderation_unit.py`
* `tests/test_meh2602_experience_category.py` · `tests/test_meh1176_experience_email_notifications.py` · `tests/test_meh3219_b12_recurring_experience.py`

**מזהי רישום שזה מכסה.** `experiences`.
