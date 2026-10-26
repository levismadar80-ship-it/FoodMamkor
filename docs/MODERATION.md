# מהמקור — מודרציית AI

> מה ה-AI בודק באתר, מה קורה עם התשובה שלו, ומי מחליט בסוף.
> נכון ל-26/10/2026, אחרי מיזוג PR #3607, #3608, #3609, #3610 ו-#3612. הפניות `קובץ:שורה` נבדקו מול הקוד באותו יום; בנתבים מצוין שם הפונקציה כדי שלא יזוז.

---

## ארבעת המשטחים

| משטח | מה נבדק | REJECTED | APPROVED / FLAGGED | שער אנושי | fail-open |
|---|---|---|---|---|---|
| **ביקורות** | גוף הביקורת (`reviews.py:_moderate_review_body`) | 422, לא נשמר (`routers/reviews.py:create_review_nested`) | **מתפרסם מיד**. הסטטוס נשמר ב-`ai_moderation_status`, ו-FLAGGED מקבל תג «סומן ע״י AI» ב-`/admin/reviews` (PR #3621) | אין. אדמין יכולה להסתיר או למחוק בדיעבד | APPROVED |
| **חוויות** | כותרת, תיאור, קטגוריה, עיר, מחיר, משתתפים (`services/experience_moderation.py`) | 400, לא נשמר (`routers/experiences.py:submit_experience`) | נשמר `status=pending`, והסטטוס של ה-AI נשמר ב-`moderation_status` | תמיד: אדמין מאשרת כל חוויה | APPROVED |
| **מתכונים** | כותרת, תיאור, מצרכים, הוראות (`services/producer_recipe_moderation.py`) | 400, לא נשמר (`routers/producer_recipes.py:create_my_recipe`) | נשמר `moderation_status=pending`, וסיבת ה-AI נשמרת ב-`moderation_notes` | תמיד: אדמין מאשרת כל מתכון | APPROVED |
| **סיכון בית עסק** | פרופיל בית העסק בהרשמה ובשיוך (`services/producer_risk.py`) | — | ציון 0–100 + נימוק ב-`producers.risk_score` / `risk_reasoning`, מוצג בטבלת `/admin/producers` | הציון הוא רק מידע לאדמין | ציון NULL (אדמין לא רואה ציון) |

הסיכון רץ כ-background task ולא חוסם הרשמה (`routers/auth.py` — שני מסלולי ההרשמה, `routers/producer_claim.py` — שיוך).

**ביקורות הן המשטח היחיד שמתפרסם בלי אדמין**, ולכן fail-open שם פירושו שביקורת עולה בלי שום בדיקה. זה הנימוק לדיווח ב-Sentry שמתואר בהמשך.

### מה עוד לא סגור
- **ביקורת FLAGGED עדיין מתפרסמת** (PR #3621). הסימון רק מסמן לאדמין. עריכה עם אותו טקסט שומרת את הסימון. fail-open נשמר כ-APPROVED, כך שבדף האדמין אי אפשר להבחין בינו לבין אישור אמיתי.
- **הסתרה של אדמין דביקה** (PR #3612): כשהכותבת עורכת ביקורת מוסתרת היא נשארת מוסתרת. הכותבת גם לא יכולה למחוק ביקורת מוסתרת (404). רק `PUT /admin/reviews/{id}/unhide` מחזיר אותה.
- `home_product_moderation.py` שייך למערכת שבהסרה (MEH-796) ועדיין משתמש ב-`settings.anthropic_model`. הוא לא חלק מהמסמך הזה, וגם לא קיבל את השיפורים שלמטה.

---

## המודל

כל ארבעת המשטחים קוראים ל-`AI_FAST_MODEL` (`config.py:257`, היום `claude-haiku-5-5`) דרך `ai_fast_request_kwargs()` בלבד. כך יש מקור אחד למודל, ל-`thinking: disabled` ול-`effort: low`. החלפת מודל = שינוי שורה אחת והרצת ה-eval.

**Structured outputs** (PR #3608): כל קריאה מעבירה JSON Schema מתוך `services/moderation_schemas.py` (`MODERATION_VERDICT_SCHEMA`, `REVIEW_VERDICT_SCHEMA`, `RISK_SCORE_SCHEMA`). ה-API מחזיר JSON תקף לסכמה בכל תשובה שהושלמה, כך שתשובה עם fence, עם טקסט מסביב או עם סטטוס מומצא כבר לא נופלת ל-fail-open. מגבלת ה-API: אין `minLength`/`maxLength` או גבולות מספריים, ונדרש `additionalProperties: false`. את הגבולות אוכפים בקוד (`_clamp_score`, `_truncate_reasoning`).

**סירוב** (`stop_reason="refusal"`): מטופל כ-FLAGGED ולא כ-fail-open, כי מסווג הבטיחות של המודל זיהה משהו בתוכן עצמו.

---

## הגנה מפני prompt injection (PR #3609)

ההוראות נמצאות ב-`system`. התוכן שהמשתמשת הגישה עובר ב-`user` כ-JSON, עטוף בתגית עם סיומת אקראית לכל בקשה (`services/moderation_prompt.py:wrap_submission`, `secrets.token_hex(4)`), ונאמר למודל במפורש שזה נתונים ולא הוראות. משתמשת לא יכולה לנחש את הסיומת, ולכן גם לא יכולה "לסגור" את התגית מתוך הטקסט שלה. `producer_risk.py` השתמש באותו דפוס עוד קודם.

---

## fail-open — LOCK, ועכשיו גם גלוי (PR #3607)

הכלל לא השתנה: אין מפתח, שגיאת API או תשובה לא קריאה ← APPROVED (בסיכון: NULL). מה שנוסף הוא אות שזה קרה. `services/moderation_fail_open.py:report_fail_open(surface, reason)` כותב warning ל-structlog (Railway logs) ואירוע Sentry אחד לכל מקרה.

- tags: `moderation_fail_open=true`, `moderation_surface` (`review` / `experience` / `recipe` / `producer_risk`), `fail_open_reason`
- `fail_open_reason`: `no_client` (אין מפתח), `api_error`, `truncated` (נחתך ב-`max_tokens`), `unparseable`, `bad_status`, `error`, ובסיכון בלבד גם `refusal` (במשטחי התוכן סירוב הוא FLAGGED ולא fail-open)
- fingerprint: `["moderation-fail-open", surface, reason]`. ה-burst cap הקיים (`app/sentry.py`, 12 ליום לכל fingerprint) מגביל את צריכת המכסה, ולכן בתקלה מתמשכת המונה ב-Sentry הוא רצפה. הספירה המלאה נמצאת ב-Railway logs.
- התראה: כלל ב-Sentry ברמת tag (סכום על כל ה-fingerprints) על `moderation_fail_open:true` עם `moderation_surface` ב-`review`/`experience`/`recipe`. `producer_risk` לא נכלל, כי שם לא מאושר כלום, רק ציון ריק. זה צעד ידני, ב-`MANUAL_TESTING.md` § MEH-2352.

---

## ה-eval

`scripts/oneoff/eval_meh2335_moderation.py` מריץ 37 מקרים על שלושת משטחי הטקסט, כולל ניסיונות injection, ומשווה את המודל המהיר ל-Opus (`--with-opus`). מריצים אותו מ-staging עם מפתח API אמיתי. הפקודה המדויקת נמצאת ב-HANDOFF, בסעיף של PR #3592. בכל החלפת מודל או שינוי prompt בודקים שלושה דברים: 0 fail-opens, כל מקרי ה-injection נחסמים, ואחוז ההסכמה עם Opus לא יורד.

תוצאה אחרונה (26/10, על כל ה-stack): 0 fail-opens, כל ה-injection ב-REJECTED, הסכמה עם Opus ב-36/37.

---

## מתכונים — מה ה-prompt לא שופט (PR #3610)

מתכון קצר אבל שלם זה בסדר. קישור למוצר של בית העסק הוא רשות. ה-AI לא שופט טעם או טכניקה. FLAGGED רק כשחסרה רשימת מצרכים או שאין הוראות בכלל. הסיבה: האדמין ממילא בודקת כל מתכון, ו-FLAGGED שגוי רק מוסיף לה רעש.
