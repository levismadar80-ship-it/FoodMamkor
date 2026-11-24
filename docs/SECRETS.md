# מפתחות וסודות — איפה כל אחד גר

> **שמות בלבד. אף ערך לא נכתב כאן, ולא בשום מקום אחר בריפו.**
> נכתב 20/11/2026 (MEH-3520), אחרי שמפתח Places הוחלף במפתח מפרויקט Google
> עם חיוב שפג (MEH-3517). המטרה: לכל סוד יש ספק, חשבון, פרויקט ומקום אחד שבו
> הוא מוגדר, ומי שמחליפה אותו יודעת מאיפה לקחת את החדש.

«נבדק» = מישהו פתח את הקונסול של הספק ובדק בתאריך הזה. «לא נבדק» = ידוע רק
מהקוד ומ-`.env.example`, והשורה מחכה לבדיקה.

---

## לפני שמחליפים מפתח (כל ספק)

1. פותחים את הפרויקט או החשבון של המפתח, ובודקים שהוא זה שבטבלה למטה.
2. בגוגל: *Billing* של אותו פרויקט מחובר לחשבון חיוב פעיל, לא trial שנגמר.
3. מחליפים ב-Railway (production ו-staging) או ב-Vercel, לפי העמודה «איפה».
4. אחרי ה-redeploy מריצים את בדיקת הבריאות של אותו שירות (עמודה «בדיקה»).
   אדום → מחזירים את הערך הקודם קודם, ואז חוקרים.
5. מעדכנים את השורה כאן (תאריך, שם המפתח בקונסול).

---

## Google Cloud

חשבון Google של ספיר (בכרום: `authuser=2`). **פרויקט אחד: `mehamakor`**
(מספר 591935721343), מחובר לחשבון החיוב «Mehamkor». נבדק 20/11/2026.

| משתנה | איפה | המפתח בקונסול | הגבלות | בדיקה |
|---|---|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Railway production + staging | «mehamakor server places» (נוצר 20/11/2026) | API: Places API (New) בלבד · אפליקציה: None (השרת קורא, אין Referer) | `GET /api/health/places` → `{"status":"ok"}` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Vercel | «Maps Platform API Key» | HTTP referrers · 35 APIs. ציבורי מעצם הגדרתו (נשלח לדפדפן) | המפה בעמוד בית עסק נטענת |
| `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Railway + Vercel | OAuth client «מהמקור» (591935721343-jjrc…) | Web application | כניסה עם Google ב-`/login` |
| `GOOGLE_CLIENT_SECRET` | Railway production + staging (נוסף 24/11/2026) | סוד של אותו client «מהמקור» (Client secrets) | — (צד שרת בלבד) | כניסה עם Google: בלעדיו `POST /api/auth/google/code` עונה 503. החלפה: «Add secret» בקונסול, הדבקה בשתי הסביבות, ורק אז מחיקת הישן (MEH-3690) |

**לא להשתמש:** הפרויקט `project-cddabfa3-9d77-4d7a-862` («My First Project»,
ארגון levismadar80-org) יושב על חשבון חיוב trial שנגמר. כל מפתח ממנו מחזיר 403
מ-Places. מפתח השרת שנוצר שם נמחק ב-20/11; עדיין יש בו «Maps Platform API Key»
שאף אחד לא משתמש בו (מועמד למחיקה, באישור ספיר). בחשבון `authuser=0` יש עוד
שישה פרויקטים לא קשורים, גם הם על trial.

---

## שאר הספקים

| משתנה | ספק | איפה | חשבון / פרויקט | מצב |
|---|---|---|---|---|
| `JWT_SECRET_KEY` (או `SECRET_KEY`) | — (נוצר מקומית) | Railway | — | חובה ב-production, אחרת השרת לא עולה (`config.py`). לא נבדק מתי הוחלף לאחרונה |
| `EDGE_PROXY_SECRET` | — (נוצר מקומית) | Railway + Vercel, אותו ערך בשניהם | — | לא נבדק |
| `DATABASE_URL` | Railway Postgres | Railway (מוזרק) | פרויקט Railway `67ecffa1…` | מנוהל ע"י Railway |
| `MIGRATION_DATABASE_URL`, `DATABASE_URL_PRODUCTION`, `DATABASE_URL_STAGING` | Railway Postgres | מקומי / CI | אותו פרויקט | `DATABASE_URL_PRODUCTION` אסור בסשן של Claude (security.md) |
| `ANTHROPIC_API_KEY` | Anthropic | Railway | `/api/health/ai` (MEH-3724) | חסר → AI במצב fail-open (CLAUDE.md); לקוח שלא נבנה או לא עונה → 503 ב-`/api/health/ai` + Sentry |
| `RESEND_API_KEY` | Resend | Railway, נפרד ל-staging (MEH-3405) | לא נבדק | |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ID` | Meta (WhatsApp Cloud API) | Railway, staging על מספר בדיקות נפרד (MEH-3405) | לא נבדק | |
| `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` | — (נוצר מקומית, Web Push) | Railway, נפרד ל-staging (MEH-3405) | — | |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_CLOUD_NAME` | Cloudinary | Railway | לא נבדק | |
| `BACKEND_SENTRY_DSN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Sentry | Railway + Vercel | לא נבדק | DSN אינו סוד במלוא מובן המילה, אבל לא מפרסמים |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog | Vercel | לא נבדק | ציבורי (נשלח לדפדפן) |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Microsoft Clarity | Vercel | לא נבדק | ציבורי |
| `APPLE_CLIENT_ID`, `NEXT_PUBLIC_APPLE_CLIENT_ID` | Apple | Railway + Vercel | לא נבדק | |
| `ADMIN_PASSWORD`, `SMOKE_ADMIN_PASSWORD` | — | Railway | — | לא נבדק באיזו סביבה מוגדר |
| `DEMO_OWNER_PASSWORD`, `DEMO_CONSUMER_PASSWORD`, `DEMO_ADMIN_PASSWORD` | — | Railway staging + סביבת הסשן | — | חשבונות QA של staging בלבד (testing.md) |
| `OTP_TEST_CODE` | — | Railway staging | — | staging בלבד |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel | GitHub secrets + סביבת הסשן | פרויקט Vercel | לא לכתוב לקובץ, ללוג או ל-PR |

---

## מה עוד לא נבדק

כל שורה עם «לא נבדק» בעמודת החשבון. הבדיקה לכל אחת: לפתוח את הקונסול של
הספק, לרשום איזה חשבון ואיזה פרויקט, ומתי המפתח נוצר. Claude יכולה לנווט
בכרום ולקרוא את הקונסול, אבל לא מעתיקה ולא כותבת ערכים: את ההעתקה וההדבקה
עושה ספיר.
