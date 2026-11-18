# ‏Sentry Crons: למה ה-watchdog «פספס», ומה באמת קורה בחשבון

> **דוח. בלי שינוי בהגדרות החשבון.** הכרעות על התוכנית ועל מי מקבל את ה-monitor
> היחיד הן של ספיר ‏(MEH-3332). מה שתוקן בקוד נמצא ב-MEH-3350; שאר הקובץ הוא
> מדידה.
>
> **נמדד 17/11/2026 בין 06:15Z ל-06:50Z**, מול Sentry החי, מול Railway החי ומול
> הקוד. ארגון `df7d71a2ad7a`, אזור `us.sentry.io`, פרויקט `mehamakor-backend`.
> כל מספר כאן הוא as-of, לא תכונה קבועה. לפני שמסתמכים עליו — למדוד שוב.

---

## 1. הכשל: ה-job בריא, ה-check-in לא מגיע

השאלה הייתה «למה ה-cron פספס check-in ב-15/11». התשובה מבטלת את ניסוח השאלה:
הוא לא פספס פעם אחת, הוא מפספס כמעט תמיד — ולא מפני שהוא לא רץ.

### מה Sentry אומר

ה-monitor ‏`auto-reply-watchdog` במצב `error`. ‏`stats` לעשר השעות שלפני המדידה:

| שעה UTC | ok | missed |
|---|---|---|
| 21:00 | 1 | 11 |
| 22:00 | 0 | 12 |
| 23:00 | 0 | 12 |
| 00:00 | 0 | 12 |
| 01:00 | 0 | 12 |
| 02:00 | 2 | 10 |
| 03:00 | 1 | 11 |
| 04:00 | 0 | 12 |
| 05:00 | 0 | 12 |
| 06:00 | 0 | 2 |
| **סה״כ** | **4** | **114** |

### מה Railway אומר, על אותן דקות בדיוק

הלוג של השירות `FoodMamkor` בסביבת production:

```
05:08:42  Running job "_run_watchdog_job (trigger: interval[0:05:00] …)"  … executed successfully
05:13:42  Running job …                                                   … executed successfully
05:18:42  …  05:23:42  …  05:28:42  …  05:33:42  …  05:38:42  …  05:43:42
05:48:42  …  05:53:42  …  05:58:42  …  06:03:42  …  06:08:42  …  06:13:42
06:18:42  …  06:23:42  …  06:28:42  …  06:33:42  …  06:38:42  …  06:43:42  …  06:48:42
```

**21 ריצות ברצף, כל 5 דקות, בזמן, כל אחת 10–60 מילישניות.** Sentry רשם `missed`
על 06:03, ‏06:08 ו-06:13 — דקות שבהן הלוג מראה ריצה מוצלחת.

### מה זה שולל

| השערה | מצב |
|---|---|
| ה-container עשה restart והמתזמן אבד tick-ים | **נשללה.** ה-deployment האחרון ב-production הוא `57e98c64`, ‏16/11 20:48:45Z. אין restart בכל חלון המדידה. |
| המרווח (interval 5 דק׳, `checkin_margin` 5 דק׳) צמוד מדי למתזמן שבזיכרון | **נשללה.** ריצה שמתחילה בשנייה 42 ונגמרת 10 מילישניות אחר כך לא צריכה שום מרווח. הרחבת המרווח לא הייתה פותרת כלום, והיא **לא** נעשתה. |
| ה-job נתקע, ו-`max_instances=1` חוסם את הפעמים הבאות | **נשללה.** הלוג מראה `executed successfully` על כל ריצה. |
| `WATCHDOG_ENABLED=false` ב-production | **נשללה.** job מושבת לא מופיע בלוג של APScheduler. |

### מה נשאר

ה-check-in נשלח ולא מגיע. זה **לא** היה גלוי מאף מקום, מפני ש-`_safe_checkin`
תפס כל חריגה והחזיר `None` **בלי שורת לוג אחת**. כלומר מצב התקלה היחיד שבאמת
קרה הוא זה שהקוד הסתיר. זה תוקן ב-MEH-3350.

**הסיבה הסבירה לנפילה — השערה, לא מאומת:** מכסת ה-cron monitors ב-100%
(MEH-3332). ‏Sentry מגביל או זורק את מעטפות ה-check-in, וה-SDK מכבד הגבלת קצב
בכך שהוא **מוחק את האירוע בשקט**, בלי לזרוק חריגה. זה מסביר גם את האובדן הכמעט
מלא וגם את ארבעת ה-check-ins שכן עברו, בחלונות שבהם ההגבלה שככה. מכאן אי אפשר
לאמת את זה: ‏`find_dropped_events` מחזיר קטגוריית `span`, לא `monitor`. אחרי
שה-PR של MEH-3350 נפרס, שורת `heartbeat_checkin_failed` בלוג של Railway תאמת או
תפריך את זה — ותכיל את השגיאה המדויקת.

> **לקח, מעבר לכרטיס הזה.** התראת «missed check-in» על job שרץ היא התראה על
> הטלמטריה, לא על ה-job. השערה שעוברת דרך הכרטיס («Railway עשה restart») נראתה
> סבירה לגמרי, ונשללה בשאילתה אחת ללוג. זה בדיוק הדפוס מ-`.claude/rules/testing.md`:
> לפני שמאמינים לשלילה, לשאול מה השאילתה לא הייתה יכולה לראות.

---

## 2. שבעה slugs בקוד, monitor אחד בחשבון

`@heartbeat` מופיע על **7** jobs ב-`backend/app/startup.py`. בחשבון קיים
**אחד**.

| slug | הוגדר ב-startup.py | לוח זמנים | monitor קיים? |
|---|---|---|---|
| `auto-reply-watchdog` | :351 | כל 5 דקות | **כן** |
| `onboarding-followups-daily` | :264 | `0 10 * * *` UTC | לא |
| `admin-pending-reminder-daily` | :329 | `0 5 * * *` UTC | לא |
| `analytics-rollup-daily` | :382 | `30 1 * * *` UTC | לא |
| `retention-purge-daily` | :413 | `30 2 * * *` UTC | לא |
| `rescue-codes-digest` | :438 | כל 5 דקות | לא |
| `weekly-owner-summary` | :497 | `0 8 * * sun` Asia/Jerusalem | לא |

התוכנית (Developer, ‏$0) מאפשרת cron monitor אחד, והוא תפוס. לכן **לשש משימות
הרקע אין שום ניטור**, ושתיקה שלהן לא מרימה כלום — בדיוק המצב ש-`@heartbeat` נועד
למנוע. זה לא באג בקוד: זו מגבלת תוכנית. מה שכן היה באג הוא שהקוד לא אמר את זה.
‏`MONITORED_SLUGS` ו-`UNMONITORED_SLUGS` ב-`job_heartbeat.py` מחזיקים את החלוקה
עכשיו, ו-`tests/test_meh3350_heartbeat_logging.py` נכשל על slug חדש שאינו באף
אחת מהרשימות, כך שאי אפשר להוסיף `@heartbeat` בלי להכריע לאיזה דלי הוא נכנס.

---

## 3. מה באמת נמצא בחשבון

### Cron monitors — 1 מתוך 1

`auto-reply-watchdog` · פרויקט `mehamakor-backend` · `active` · סביבה
`production` במצב `error` · `interval 5 minute`, ‏`checkInMargin` 5 דקות,
‏`maxRuntime` 30 דקות · ‏`lastCheckIn` 17/11 03:03:42Z.

### Uptime monitors — 1 מתוך 1

«Production API + DB (producers list)» · ‏`GET https://mehamakor.co.il/api/producers?limit=1`
· כל 300 שניות · סביבה `production` · ‏`uptimeStatus: ok`.

ה-monitor הזה **לא** נוצר מהריפו. ‏`.github/workflows/uptime.yml` הוא בדיקה
עצמאית של GitHub Actions שפותחת issue בכשל, ואין לה קשר ל-Sentry.

### Sample rates — מהקוד, לא מהדשבורד

| מה | ערך | file:line |
|---|---|---|
| backend traces | 0.1 ב-production · 0.01 בכל השאר | `backend/app/sentry.py:481-482`, בשימוש ב-`:559` |
| backend profiles | **לא מוגדר בכלל** — אין profiling | אין `profiles_sample_rate` באף מקום |
| backend errors | ‏`error_sampler` + `before_send` + תקרת burst לפי fingerprint | `backend/app/sentry.py:442`, `:565` |
| frontend traces (דפדפן) | 0.1 ל-`mehamakor.co.il` / `www` · 0.01 בכל השאר | `frontend/lib/sentry-sampling.js:18-19, 24-28` |
| frontend traces (server / edge) | 0.1 כש-`VERCEL_ENV === "production"` · 0.01 אחרת | `frontend/lib/sentry-sampling.js:31-33` |
| frontend replays, בשגיאה | **1.0** | `frontend/instrumentation-client.js:41` |
| frontend replays, session | 0 | `frontend/instrumentation-client.js:42` |
| frontend errors | נשלחות במלואן | `frontend/lib/sentry-sampling.js:14` |

### המכסות לפי המייל מ-15/11 ‏09:23Z (MEH-3332)

| מכסה | ניצול |
|---|---|
| Cron monitors | **1 / 1 — 100%** |
| Uptime monitors | **1 / 1 — 100%** |
| Spans | 22% ‏(1,094,567 מתוך 5M) |
| Replays | 38% ‏(19 מתוך 50) |
| Errors | 3% ‏(137 מתוך 5,000) |

---

## 4. האם אנחנו נשארים בתוכנית החינמית

**כן, חוץ משני סוגי ה-monitors, ששניהם מלאים.** זה לא «עומד לפרוץ» — זה
**פרץ**: המספר הראשון בסעיף 1 (114 מתוך 118) הוא מה שגבול של 1 נראה כמו, בפועל.

שלוש נקודות סיכון לעתיד, לפי הסדר:

1. **‏`replaysOnErrorSampleRate: 1.0` מול מכסה של 50 הקלטות בחודש.** היום 19.
   דף אחד עם שגיאה חוזרת שורף את המכסה בשעות. זו ההגדרה היחידה בקוד שיכולה
   להעביר מכסה מ-38% ל-100% בלי שאף אחד יעשה כלום.
2. **כל check-in הוא אירוע cron שנספר.** שני ה-jobs שרצים כל 5 דקות שולחים 288
   ביום כל אחד, כ-17 אלף בחודש יחד. במכסה של monitor אחד זה לא נחשב כרגע, אבל
   בשדרוג תוכנית זה הדבר הראשון שיגדל.
3. **Spans ב-22%.** נוח, והיה 95% ב-staging לפני MEH-2887. ה-frontend מחליט
   «production» לפי hostname או `VERCEL_ENV`, כלומר host חדש מקבל 1% — מצד
   הבטיחות, לא מצד הדיוק.

**ההחלטות של ספיר** (MEH-3332), ולא של CC:

* איזה job מקבל את ה-monitor היחיד. אם זה נשאר ה-watchdog — שש המשימות האחרות
  נשארות בלי ניטור, וזה בסדר רק אם זו בחירה מודעת.
* האם לשדרג תוכנית. ‏«Pay-as-you-go Budget: Enabled» מופיע במייל, ובכל זאת
  ה-monitors לא נוצרו — כלומר התקציב הזה לא חל על הסוג הזה, או שהוא לא הופעל
  בפועל. לא ניתן לבדוק מכאן.
* ‏`replaysOnErrorSampleRate` — להוריד מ-1.0, או להשאיר ולדעת שזו המכסה הבאה.

**מה CC כבר עשה, בלי להמתין:** הנראות. כשל בשליחת check-in כבר לא שקט
(MEH-3350), וההפרש בין «מנוטר» ל«לא מנוטר» כתוב בקוד ונבדק בטסט.
