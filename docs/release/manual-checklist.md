# סעיף ד׳ — איך ה-thread מריץ כל שורה (בלי ספיר)

> MEH-2896 (תוכנית העוגן, MEH-2892 §C.4). **נכתב מחדש ב-14/11/2026 (MEH-3151):** ספיר: «לא עושים בדיקות ידניות יותר… אני לא בודקת כלום». עד אז הקובץ הסביר איך ספיר מסמנת מהטלפון; הנוסח הקודם נמצא ב-git history של הקובץ.
>
> **הרשימה עצמה היא סעיף ד׳ ב-[RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md)** (ADR-028). כאן רק הצעדים של כל שורה. **אף צעד כאן לא נשלח לספיר.** מה שלא ניתן להריץ נרשם ב-PR הגרסה תחת «סיכון שנותר — לא נבדק».

## איך מסמנים

ה-thread שפותח את PR הגרסה מעתיק לגוף ה-PR רק את השורות **שהאזור שלהן השתנה בגרסה**, מסמן כל אחת, ומצרף לה ראיה: לינק לריצה, צילום שקרא בעצמו, או פלט של connector. שורה בלי ראיה נשארת `[ ]` עם הסבר (כלל 33). שורה שנכשלה = באג + כרטיס, והגרסה לא ממוזגת ל-main עד שהיא עוברת או עד שספיר כותבת שהיא משחררת בלעדיה.

**staging מה-sandbox:** Playwright עם `--ssl-version-max=tls1.2` וה-headers של Vercel Deployment Protection ([testing.md](../../.claude/rules/testing.md) § «Driving Playwright against staging»). login של חשבונות הדמו: עד 5 בדקה לכל IP, ולא בזמן שריצת E2E רצה על staging.

## אייפון — סימולציית WebKit

1. `PW_WEBKIT=1` מוסיף את הפרויקט `webkit-iphone13` (390×664, `isMobile`, `hasTouch`, ‏`frontend/playwright.config.ts`).
2. מריצים את חבילת ה-golden ואת דפי לוח הבקרה, דף בית עסק והמפה עם שלושת חשבונות הדמו (`docs/DEPLOYMENT.md` § «Staging QA auth fixtures»).
3. מצלמים ב-390 וקוראים את הצילומים: אין טקסט חתוך, אין כפתור מחוץ למסך, במפה יש בתי עסק.
4. מצטטים גם את ריצת `e2e-webkit` הלילית האחרונה (`e2e.yml`).

**מה הסימולציה לא מוכיחה:** WebKit של Playwright הוא לא Safari של iOS. אין בו מקלדת iOS, לחץ זיכרון, או מנוע הגלילה של המכשיר. זה נרשם כ«סיכון שנותר».

## מיילים ב-staging — Resend + Gmail connectors

**כתובות:** כתובת `+` חדשה בכל גרסה ובכל סוג, בתיבת ה-Gmail שה-connector קורא (`<תיבה>+v<גרסה>-customer@gmail.com`, `…-business@…`). הסיבה: ה-DB של staging נשמר בין גרסאות. הרשמה חוזרת עם אותה כתובת שולחת «ניסיון הרשמה כפול», וכתובת שכבר בניוזלטר לא מקבלת כלום.

| מה מפעילים (Playwright) | איך | עובר כש |
|---|---|---|
| הרשמת לקוח | `/he/register` | Resend: שני מיילים `delivered` (אימות, ברוכים הבאים). Gmail: שניהם בתיבה. הקישור במייל האימות, נפתח ב-WebKit, מאמת ב-`/he/verify-email` |
| הרשמת עסק | `/he/register/producer` | אימות + «ברוכים הבאים» לבעלי עסקים |
| איפוס סיסמה | `/he/forgot-password` | מייל מגיע; הקישור פותח את `/he/reset-password` |
| ניוזלטר | התיבה בתחתית דף הבית | «ברוכים הבאים למהמקור»; קישור «לבטל הרשמה» עובד |
| הרשמה לאירוע | דף אירוע עם הרשמה באתר | «ההרשמה ל-"…" נקלטה»; קישור «ביטול ההרשמה» עובד |

קישור במייל של staging מוביל לדף שמוגן ב-Vercel: פותחים אותו ב-Playwright עם אותם headers.

## ספאם — production, אחרי ה-deploy ל-main

`staging` שולח מדומיין אחר ודרך חשבון Resend אחר, ו-Gmail מחליט לפי הדומיין השולח. לכן:

1. Resend `get-domain` על הדומיין של production: SPF ו-DKIM מאומתים.
2. ב-`mehamakor.co.il`: איפוס סיסמה לחשבון בדיקה קיים, והרשמה לניוזלטר עם כתובת `+` חדשה.
3. Gmail connector, `search_threads` עם `newer_than:1h`: ב-`labelIds` יש `INBOX` ואין `SPAM`. «קידומי מכירות» (`CATEGORY_PROMOTIONS`) בסדר לניוזלטר.

זו תיבה אחת אצל ספק אחד: אות כיווני, לא הבטחה לכל הספקים.

## קוד אימות ב-WhatsApp

- **הממשק** (שליחה, הזנה, הודעת הצלחה, הכרטיס נעלם): `e2e/flows/manual/dashboard-draft-submit.spec.ts` ו-`34-draft-submit-review.spec.ts`, עם מספר מ-`OTP_TEST_NUMBERS`.
- **המסירה לטלפון אמיתי:** ה-thread יוצר ב-staging עסק בטיוטה עם מספר אמיתי שלא ב-`OTP_TEST_NUMBERS`, ולוחץ «שלחו קוד אימות». עובר כש-Meta מחזירה סטטוס `delivered` או `read` (webhook → `OutboundMessage.status`; רשימת הלא-נמסרים: `backend/app/routers/admin_whatsapp.py`). אף אחד לא צריך להקליד את הקוד: הממשק כבר מכוסה.
- **לפני:** משתני `WHATSAPP_*` מוגדרים ב-staging (Railway connector, שמות בלבד). בלעדיהם האתר כותב «קוד נשלח» ושום דבר לא יוצא.

## תצוגת קישור ב-WhatsApp — production

אוטומטי: `scripts/checks/link_preview.py`, מתוך `smoke_production.py`, אחרי כל deploy ל-main. שולף את דף הבית ודף בית עסק עם User-Agent של WhatsApp, ומוודא ש-`og:title` ו-`og:image` נמצאים בתוך ה-`<head>` ושהתמונה עונה 200 עם `image/*`. ה-thread מצטט את השורה. דף בית עסק: SKIP עד שיש עסק ב-production.

## התחברות Google

Claude ב-Chrome במחשב של ספיר, עם חשבון Google אמיתי. קובץ ה-prompt ב-`/mnt/project-files/sapir-tasks/`. עובר כש: חוזרים לאתר מחוברים, בלי מסך שגיאה ובלי לולאה. מה שספיר עושה: מאשרת את כרטיס החיבור בלבד.

**Apple:** הכפתור מוצג רק כש-`NEXT_PUBLIC_APPLE_CLIENT_ID` מוגדר (`LoginClient.jsx:156`). ה-thread בודק ב-Vercel connector. אם מוגדר: «סיכון שנותר», כי קוד ה-2FA של Apple נשלח למכשיר Apple.

## חלון שיתוף

`e2e/flows/manual/share.spec.ts` מוודא ש-«שתפו» מעביר title + url ל-`navigator.share`, ומעתיק את הקישור כשאין `navigator.share`. החלון עצמו שייך למערכת ההפעלה: «סיכון שנותר», נמוך.

## Sentry

Sentry connector: `search_issues` ב-environment של הגרסה, מאז ה-deploy. אין issue חדש = עובר. Sentry ריק הוא לא ראיה לבריאות (MEH-1905), ולכן השורה הזו לא עומדת לבד.
