# צ'קליסט גרסה — לפני כל `staging → main`

> **מי מריצה:** ה-thread שפותח את ה-PR של `staging → main`. הוא מסמן כל שורה ב-PR
> ומצרף לה ראיה (לינק לריצה, צילום, פלט). שורה בלי ראיה נשארת `[ ]` ומקבלת הסבר (כלל 33).
> **ספיר לא בודקת כלום (החלטה שלה, 14/11/2026, MEH-3151).** אין כאן שורה שהמבצע שלה הוא היא. כל שורה רצה ע"י ה-thread, ה-CI, connector, או Claude ב-Chrome במחשב שלה. מה שאף כלי לא יכול להוכיח נרשם ב-PR הגרסה תחת «סיכון שנותר — לא נבדק», ולא נשלח אליה. הצעדים המדויקים לכל שורה בסעיף ד׳: [release/manual-checklist.md](./release/manual-checklist.md). (עד 14/11 סעיף ד׳ היה «טלפון אמיתי (ספיר)»; טבלת ההחלפה: MEH-3151.)
> **נולד ב-07/11/2026 (MEH-2796).** הוא מחליף את `docs/MANUAL_TESTING.md`
> ([ארכיון](./archive/MANUAL_TESTING-until-2026-11-07.md)) ואת הסעיף «Sanity checks before
> promoting» שהיה ב-[DEPLOYMENT.md](./DEPLOYMENT.md).

## איך הקובץ הזה נשאר קצר

- **התנהגות חדשה מקבלת טסט אוטומטי, לא שורה כאן** (workflow.md כלל 10).
- שורה נכנסת לכאן רק אם טסט ב-CI לא יכול לבדוק אותה. גם אז המבצע הוא ה-thread (סימולציית WebKit,
  connector, Claude ב-Chrome), לעולם לא ספיר. מה שגם הם לא יכולים להוכיח הולך ל«סיכון שנותר» בסעיף ד׳.
- התקרה היא 30 שורות. כשמגיעים אליה, מוציאים שורה ישנה לפני שמוסיפים חדשה.
- שורה שהפכה לטסט אוטומטי נמחקת מכאן באותו PR.

---

## א׳ — שערים אוטומטיים (ה-thread)

- [ ] `CI gate` ו-`Deploy gate` ירוקים על ה-head של `staging`
- [ ] ריצת `Playwright E2E` ירוקה על ה-push האחרון ל-`staging` (היא רצה תמיד על staging, MEH-2779)
- [ ] «Post-deploy checks» (`post-deploy-checks.yml`) ירוק אחרי ה-deploy האחרון של staging. ‏`staging-smoke` לא רץ מאז 05/2026 (MEH-2846)
- [ ] Sentry: אין issues חדשים מה-deploy של staging
- [ ] תיאור ה-PR מפרט כל שינוי התנהגות שנכנס מאז הגרסה הקודמת

## ב׳ — סיבוב על staging (ה-thread, Playwright ב-375 וב-1440)

- [ ] דף הבית נטען, וה-hero מוצג
- [ ] המפה מציגה בתי עסק
- [ ] כפתור WhatsApp בדף בית עסק נפתח עם הטקסט הנכון
- [ ] הצ'אט עונה על שאלת בדיקה
- [ ] אין שגיאות בקונסולה בדפים האלה

## ג׳ — דגלים ומשתני סביבה (ה-thread, טבלה ב-PR)

- [ ] לכל פיצ'ר שנכנס מאז הגרסה הקודמת ותלוי בדגל, במשתנה סביבה או בתבנית Meta: המצב הרצוי בפרודקשן (דולק/כבוי) מול המצב בפועל. דוגמאות נכון ל-07/11: `RESCUE_BAGS_ENABLED` + `NEXT_PUBLIC_RESCUE_BAGS_ENABLED` + `RESCUE_BAGS_CITIES`, `RESCUE_DIGEST_ENABLED` + תבנית `rescue_codes_digest_v1`, `WATCHDOG_ENABLED`
- [ ] משתנה סביבה חדש בפרודקשן? רק אחרי אישור של ספיר (כלל רגרסיה 8)
- [ ] `SUPER_ADMIN_EMAIL` מוגדר ב-Railway **production** לפני המיזוג ל-main. בלעדיו הבקאנד לא עולה (MEH-2890). הערך: האימייל של חשבון הבעלים בדיוק כפי שהוא מופיע ב-`/admin/users`. ה-thread בודק שהמשתנה קיים דרך Railway connector (`list-variables`, שם בלבד, בלי להדפיס ערך)

## ד׳ — מה שה-CI לא רואה (ה-thread, לא ספיר)

ה-CI החוסם מריץ Chromium בלבד (Pixel 5 באמולציה + Desktop). WebKit (מנוע Safari, iPhone 13) רץ כל לילה ולא חוסם (`e2e.yml` → `e2e-webkit`). השורות כאן משלימות את זה. ה-thread בוחר **רק את השורות שהאזור שלהן השתנה בגרסה**; אם אף אזור לא השתנה, PR הגרסה אומר את זה.

- [ ] **אייפון (WebKit 390):** חבילת ה-golden ו-`webkit-iphone13` (‏`PW_WEBKIT=1`) על staging עם ה-headers של testing.md; צילומי לוח בקרה, דף בית עסק ומפה שה-thread קרא. ריצת ה-WebKit הלילית האחרונה מצוטטת
- [ ] **אנדרואיד:** פרויקט `mobile` (Pixel 5) ירוק בריצת ה-E2E של staging (כבר בסעיף א׳; מצטטים את השורה)
- [ ] **מיילים ב-staging:** ה-thread נרשם עם כתובת `+` חדשה בתיבת ה-Gmail שה-connector קורא (`<תיבה>+v<גרסה>-<סוג>@gmail.com`) (לקוח, עסק, איפוס, ניוזלטר, אירוע). Resend connector: `delivered`. Gmail connector: המייל בתיבה; הקישור נשלף ונפתח ב-WebKit 390
- [ ] **ספאם ב-production** (אחרי ה-deploy ל-main): איפוס סיסמה + ניוזלטר לכתובת `+` חדשה באותה תיבה. ב-Gmail connector ה-`labelIds` כולל `INBOX` ולא `SPAM`; Resend `get-domain` מראה SPF/DKIM מאומתים
- [ ] **תצוגת קישור ב-WhatsApp:** ה-thread מריץ `python scripts/checks/smoke_production.py` אחרי ה-deploy ל-main ומצטט את שורות `WhatsApp link preview`. (ב-«Post-deploy checks» היא רצה רק כשה-push נגע ב-frontend/backend, ועם `continue-on-error` — לכן ירוק של ה-workflow לא מספיק; קוראים את השורה.) דף בית עסק: SKIP עד שיש עסק ב-production
- [ ] **קוד OTP ב-WhatsApp:** הממשק מכוסה ב-E2E עם מספר בדיקה. המסירה: ה-thread שולח קוד ב-staging למספר אמיתי שלא ב-`OTP_TEST_NUMBERS`, וקורא את סטטוס המסירה מ-Meta (`OutboundMessage.status` = `delivered`/`read`, ‏`admin_whatsapp.py`)
- [ ] **התחברות Google:** Claude ב-Chrome במחשב של ספיר (קובץ prompt ב-`/mnt/project-files/sapir-tasks/`). זו לא בדיקה שלה: היא רק מאשרת את כרטיס החיבור, כמו בכל משימת Chrome. אם המחשב לא זמין, השורה נרשמת «לא נבדק» ולא נשלחת אליה
- [ ] **Sentry:** ה-thread דרך Sentry connector — אין issue חדש ב-environment של הגרסה מאז ה-deploy

**סיכון שנותר — לא נבדק בשום כלי** (נכתב ב-PR הגרסה כ«לא נבדק», ולא חוסם):

- מקלדת iOS אמיתית והסרגל התחתון (MEH-2652). הלוגיקה מכוסה ב-`IosViewportPin.test.jsx`; המקלדת עצמה לא קיימת בשום סימולציה בלי Xcode
- «מרגיש חלק» באנימציה ובגלילה במכשיר אמיתי. המדד האוטומטי: Lighthouse ב-«Post-deploy checks»
- חלון השיתוף של iOS/Android עצמו. הקריאה ל-`navigator.share` מכוסה ב-`share.spec.ts`
- התחברות Apple: קוד ה-2FA נשלח למכשיר Apple. רלוונטי רק אם `NEXT_PUBLIC_APPLE_CLIENT_ID` מוגדר (ה-thread בודק ב-Vercel connector)
- תצוגת המייל באפליקציית Gmail עצמה. ה-HTML מצולם ב-WebKit במקום

## ה׳ — לא בכל גרסה (runbooks)

- בדיקת עומס, כשאחד התנאים שלה מתקיים: [runbooks/load-testing.md](./runbooks/load-testing.md)
- תרגיל שחזור גיבוי: אוטומטי, `backup-restore-verify.yml` שבועי (MEH-1517). ה-thread מצטט את הריצה האחרונה. [runbooks/dr-drill.md](./runbooks/dr-drill.md) רק אם היא אדומה
- שאר ה-runbooks: [runbooks/](./runbooks/)
