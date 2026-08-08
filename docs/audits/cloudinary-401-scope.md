# Cloudinary 401 — מדידת היקף (MEH-1925, Phase 0)

**נמדד:** 2026-08-07, מתוך CC sandbox · **ענן:** `dfzpscjks`
**סטטוס:** 🔴 **production מושפע. ה-401 נמשך כרגע.** לא תוקן — Phase 0 מדידה בלבד.

---

## 1 · התשובה לשאלה המכריעה

> **כן. משתמשות אמיתיות ב-production רואות תמונות שבורות, עכשיו.**

זו הפרכה של ההנחה האופטימית שבכרטיס ("אולי רק preview/staging"). ששת הנכסים
שנבדקו החזירו `502` עם `OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED` —
קוד השגיאה של Vercel לכך שה-upstream (כלומר Cloudinary) החזיר 401/403.

`mehamakor.co.il` עצמו בריא (`200` על דף הבית). מה ששבור הוא **אך ורק** שכבת
התמונות מ-Cloudinary.

---

## 2 · המדידות עצמן — קודים ליטרליים

כל השורות דרך ה-Next image optimizer של production
(`https://mehamakor.co.il/_next/image?url=<asset>&w=1080&q=75`), שהוא **בדיוק
המסלול שדפדפן של משתמשת עובר בו** עבור `login` / `register` (ראו §4).

| נכס (`…/image/upload/` ואילך) | status | body |
|---|---|---|
| `f_auto,q_auto/login/hero-produce-crate.jpg` | **502** | `OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED` |
| `login/hero-produce-crate.jpg` (ללא טרנספורמציה) | **502** | `OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED` |
| `f_auto,q_auto/register/hero-box-produce.jpg` | **502** | `OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED` |
| `register/hero-box-produce.jpg` (ללא טרנספורמציה) | **502** | `OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED` |
| `home/hero-produce.jpg` | **502** | `OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED` |
| `v1782159035/events/hero-market.jpg` | **502** | `OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED` |

הנוסח המלא של ה-body:

```
An error occurred with this application.

OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED

iad1::67mqj-1786093912740-64ee21e8575c
```

**עקביות:** נכס ה-login נמדד 3 פעמים ברצף — `502` בכל שלוש. אין flake.

### 2.1 · למה זו אינה תקלת probe — מקרי בקרה

הכלל ב-`testing.md` ("ירוק/אדום מ-probe לא מאומת אינו אות") נאכף כאן לפני
שנכתבה שורת מסקנה אחת. שלושה מקרי בקרה, כולם דרך **אותו** endpoint:

| בקרה | תוצאה | מה זה שולל |
|---|---|---|
| `images.unsplash.com` (גם הוא ב-`remotePatterns`) | **200**, בתי JPEG אמיתיים, פעמיים | ה-optimizer עצמו תקין; לא תקלת Vercel כללית |
| `example.com` (לא ב-allowlist) | **400** | ה-optimizer אוכף `remotePatterns` — כלומר ה-URL שלי נבנה נכון ונקרא |
| `mehamakor.co.il/` | **200** | האתר חי; לא נפילה כללית |

**ההבחנה חדה:** אותו endpoint, באותה דקה — Unsplash `200`, Cloudinary `502
UNAUTHORIZED`. הכשל ממוקד ב-Cloudinary בלבד.

### 2.2 · מה **לא** נמדד — ואסור להסיק ממנו

- ⚠️ **`res.cloudinary.com` חסום ישירות מה-sandbox** —
  `curl: (56) CONNECT tunnel failed, response 403`, אותה מחלקה כמו חסימת
  `*.up.railway.app` (MEH-360). **זו אינה עדות ל-401.** ה-401 עצמו נמדד דרך
  ה-edge של Vercel, שאינו הרשת שלי — וזו דווקא עדות טובה יותר, כי היא
  משקפת מה ש-Cloudinary עונה לתשתית שמגישה בפועל.
- ⚠️ **staging לא נמדד.** `staging.mehamakor.online/_next/image` מפנה
  (`302`) ל-`vercel.com/sso-api` — Vercel Deployment Protection. ללא
  אימות אי אפשר למדוד משם. **לא ידוע** אם staging מתנהג אחרת, ואין שום
  סיבה להניח שכן.
- ⚠️ **מתי זה התחיל — לא ידוע.** אין לי גישה לחשבון Cloudinary ולא ל-logs
  היסטוריים. הסימן המוקדם ביותר בידינו הוא ריצת ה-E2E של PR #2648 (07/08).
  → **עודכן ב-Phase 0b: זה כבר לא לא-ידוע.** התקלה תוארכה לחלון של ~20 שעות
  (06/08 13:58Z → 07/08 10:12Z) ממקור שלישי — ראו **נספח א׳.1**.

---

## 3 · מה זה שולל לגבי הסיבה

**זה לא strict transformations.** זו ההשערה המובילה בכרטיס, והמדידה מפריכה
אותה: URL **ללא שום טרנספורמציה** (`login/hero-produce-crate.jpg`) נכשל
בדיוק כמו זה עם `f_auto,q_auto`. strict transformations היה חוסם את
המותמר ומתיר את המקור.

**זה לא deploy שלנו.** קבצי אספקת התמונות לא נגעו לאחרונה:
`frontend/next.config.js` — `4b53be54` (02/08, fonts) ·
`frontend/lib/cloudinary.js` — `95882f1c` (16/07). שינוי הקוד האחרון קדם
לתקלה בימים עד שבועות.

**נשארו על השולחן** (כולם דורשים את הקונסולה — ספיר): credits חודשיים
שנגמרו · חשבון מושהה/חסום · restricted media types · rotation של מפתח.
**איני יודע איזה מהם** — סטטוס `401` לבדו אינו מבחין ביניהם.

→ **צומצם ב-Phase 0b: `rotation של מפתח` נשלל.** האספקה אינה מציגה מפתח כלל,
ולכן מפתח שסובב אינו יכול להסביר את ה-401 שלה. נותרו שלושה. ראו **נספח א׳.3**.

---

## 4 · איך נבנים ה-URLs — file:line

**אספקה: unsigned לחלוטין.** אין חתימה, אין מפתח, אין `sign_url` בשום
מסלול אספקה בפרונטאנד. ה-URL מורכב כמחרוזת:

- `frontend/lib/cloudinary.js:22` — `optimizeCloudinary(url, opts)`; מזריק
  `f_auto,q_auto` ב-`:28`, מוסיף `c_fill,g_auto,ar_<ratio>` ב-`:32`
  ו-`c_limit`/`w_<n>` ב-`:40-41`, ומחזיר `url.replace("/upload/", …)` ב-`:43`.
- `frontend/lib/cloudinary.js:24` — נכס שאינו `res.cloudinary.com` מוחזר כמו שהוא.

נכסים קשיחים בקוד (7 ייחודיים):

| file:line | נכס |
|---|---|
| `frontend/app/[locale]/login/LoginClient.jsx:120` | `login/hero-produce-crate.jpg` |
| `frontend/app/[locale]/register/RegisterClient.jsx:210` | `register/hero-box-produce.jpg` |
| `frontend/app/[locale]/home/HomeHero.jsx:21` | `home/hero-produce.jpg` |
| `frontend/app/[locale]/events/EventsClient.jsx:49` | `events/hero-market.jpg` |
| `frontend/app/[locale]/experiences/ExperiencesClient.jsx:19` | `staging/pick-pexels-8586455.jpg` |
| `frontend/app/[locale]/group-buys/GroupBuysClient.jsx:18` | `staging/pick-pexels-35113948.jpg` |
| `frontend/app/[locale]/about/AboutClient.jsx:174` | `WhatsApp_Image_…_dl4ldr.jpg` |

**ה-7 האלה הם רצפה, לא תקרה.** תמונות של בתי עסק ומוצרים מועלות ל-Cloudinary
ומוגשות מאותו ענן, כך שההיקף בפועל הוא **כל תמונת תוכן באתר**, לא שבעה hero-ים.

### 4.1 · next.config + שני מסלולי אספקה נפרדים

`frontend/next.config.js:130-135` — `images.remotePatterns` מתיר
`res.cloudinary.com` ו-`images.unsplash.com`. אין `loader` מותאם ואין
`loaderFile`; זהו ה-optimizer המובנה.
`frontend/next.config.js:83` — CSP `img-src` מתיר `https://res.cloudinary.com`.

**שני מסלולים, שני סימפטומים — זה משנה את מה שהמשתמשת רואה:**

| מסלול | דוגמה | מה קורה עכשיו |
|---|---|---|
| `next/image` → `/_next/image` | login, register (`import Image from "next/image"`, `LoginClient.jsx:6`, `RegisterClient.jsx:6`) | הדפדפן מקבל **502** מ-Vercel |
| `background-image: url(…)` ישירות | ה-hero בדף הבית — נמדד ב-HTML החי של production | הדפדפן פונה **ישירות** ל-Cloudinary ומקבל **401** |

המסלול השני נצפה ב-HTML החי:
`<div class="kenburns-right absolute" style="…background-image:url(https://res.cloudinary.com/dfzpscjks/image/upload/f_auto,q_auto,c_fill,g_auto,ar_16:9,w_1920/home/hero-produce.jpg)">`.
אותו נכס בדיוק החזיר `502 UNAUTHORIZED` דרך ה-optimizer, ולכן הוא unauthorized
ב-Cloudinary — כלומר גם הפנייה הישירה נכשלת. (הפנייה הישירה עצמה לא נמדדה: ה-sandbox
חסום מ-Cloudinary. זו **הסקה**, ומסומנת ככזו.)

---

## 5 · היקף שני שלא היה בכרטיס: העלאות

מסלול האספקה unsigned, אבל **ה-backend מחזיק אישורי Cloudinary להעלאה**:
`backend/app/config.py:47-48` (`cloudinary_api_key` / `cloudinary_api_secret`),
בשימוש ב-`backend/app/routers/upload.py:123-124`, `:188-189`, `:275-276`
וב-`backend/app/services/oauth_verifiers.py:84-85`.

אם הסיבה היא חשבון מושהה או מפתח שסובב, **גם העלאת תמונה של בעלת עסק שבורה**
— לא רק הצפייה. זה לא נמדד (דורש חשבון פעיל וקריאה מאומתת), ומועלה כאן כי
הוא משנה את הדחיפות: תקלת צפייה היא נזק תדמיתי, תקלת העלאה חוסמת onboarding.

→ **הורחב ב-Phase 0b, והניסוח כאן גס מדי.** ההעלאה **לא אושרה כשבורה** — היא
תלויה בסיבה, ויש טבלת הכרעה. וכפי שנשלל למעלה, "מפתח שסובב" אינו מסביר את
ה-401 של האספקה מלכתחילה. ראו **נספח א׳.3**.

---

## 6 · ולמה אף התראה לא ירתה

הסימן היחיד היה שני VRT snapshots אדומים (`login.png`, `register.png`), שנראו
כרגרסיית קוד. מה שהכריע שלא: `LoginClient.jsx` לא נגעה כלל ב-PR #2648.

זו בדיוק מחלקת MEH-1727 — נכס חיצוני שנופל משנה את הפריים, ו-VRT מדווח עליו
כרגרסיית קוד — עם הבדל אחד מהותי: שם הסיבה הייתה flake, וכאן היא כשל
עקבי ומתמשך **שנוגע במשתמשות**. VRT היה כאן מערכת ההתראה היחידה, בשוגג, והוא
מדווח בערוץ הלא נכון לאדם הלא נכון.

**אין ניטור על זמינות נכסי Cloudinary.** זו הפרצה שאיפשרה לתקלת production
להתגלות במקרה, דרך snapshot אדום ב-PR לא קשור.

---

## 7 · מה שנשאר לספיר (CC חסומה)

1. **קונסולת Cloudinary → Usage** — האם ה-credits נגמרו?
2. **קונסולת Cloudinary → Settings → Security** — restricted media types /
   strict transformations / חשבון מושהה?
3. **לאשר בנייד** על `mehamakor.co.il` שהתמונות אכן שבורות (המדידה כאן היא
   HTTP, לא עין אנושית).
4. להכריע אם זו תקרית שמצדיקה תיקון מיידי.

**לא בוצע ובכוונה:** אין תיקון, אין fallback image, אין loader, אין שכבת
cache, אין שינוי tolerance ב-VRT, ואין רגנרוט ל-baselines. `login.png`
ו-`register.png` נשארים אדומים — הם מדווחים על תקלה אמיתית, וקיבוע baseline
עכשיו היה מנציח את המצב השבור (בדיוק תקדים MEH-1552).

---

## 8 · תוקף המסמך

כל טענה כאן היא מדידה מ-2026-08-07 עם as-of. `401` הוא מצב חי שיכול להשתנות
בלי שאיש יגע בקוד — **למדוד מחדש לפני פעולה**, לא לצטט את הטבלה הזאת כמצב נוכחי.

פקודת השחזור:

```
curl -sS -o /dev/null -w "%{http_code}\n" \
  "https://mehamakor.co.il/_next/image?url=https%3A%2F%2Fres.cloudinary.com%2Fdfzpscjks%2Fimage%2Fupload%2Flogin%2Fhero-produce-crate.jpg&w=1080&q=75"
```

`200` = נסגר · `502` = נמשך.

---
---

# נספח א׳ — תיארוך, מסלול ההעלאה, והיקף מדוד (Phase 0b, 2026-08-07)

השלמה לשלושת הדברים ש-Phase 0 השאיר במפורש כלא-נמדדים. **הטבלה למעלה נשארת
כפי שהיא** — היא ה-as-of של הבוקר, והנספח אינו מחליף אותה.

---

## א׳.1 · מתי זה התחיל — **חלון של ~20 שעות, לא שבועות**

| | ערך |
|---|---|
| **נקי לאחרונה (מדוד)** | **2026-08-06T13:58:50Z** |
| **שבור לראשונה (מדוד)** | **2026-08-07T10:12:39Z** |
| **מסקנה** | התקלה החלה בחלון שביניהם — **פחות מיממה**. לא שבועות. |

**המקור, אחרי ששני המקורות שהתבקשו נחסמו:**

* ⛔ **Sentry — לא נגיש.** `curl https://sentry.io/api/0/` → `CONNECT tunnel failed, response 403`. אין sentry-cli, אין connector, ו-`sentry.io` אינו ב-WebFetch allowlist. **לא ניתן לשאול את Sentry מסשן CC.**
* ⛔ **לוגי Vercel — לא נגישים.** `curl https://api.vercel.com/v2/user` → `CONNECT tunnel failed, response 403`. אין vercel CLI ואין API token (רק `VERCEL_AUTOMATION_BYPASS_SECRET`, שאינו אישור API).
* ✅ **מקור שלישי שכן עבד:** `/tmp/next-start.log` — כל job של Playwright מדפיס את 200 השורות האחרונות שלו לתוך הלוג (`Print next-start log (capture-only, MEH-1712)`). שם יושבות שורות `⨯ upstream image response failed … 401` **מילולית**.

**הראיות:**

* **נקי:** run `31108022292`, job `92638253783` (`b4b1c173`, staging). ה-log מכיל **רק** `▲ Next.js 16.2.12 / ✓ Ready in 132ms` — **אפס** שורות 401. הסוויטה: `executed=199 (expected=198 unexpected=0 flaky=1 skipped=29)`.
* **שבור:** run `31168465813`, job `92834827202` (`7f379793`, staging). עשרות שורות 401. הסוויטה: `executed=199 (expected=184 unexpected=15 …)`, ובהן `parity.spec.ts:700 login` ו-`:713 register`.

**הנגטיב הזה נושא משקל** כי אותה ריצה בדיוק כן מרנדרת את login/register/producer — אילו Cloudinary היה מחזיר 401 באותו רגע, השורות היו שם, בדיוק כפי שהן מופיעות בריצה של 07/08.

### א׳.2 · שני מסלולים שקריים נשללו — ולמה זה משנה

תיארוך לפי **חותמות הזמן של הכשלים** היה נותן תשובה שגויה בכ-20 שעות. שלושת הכשלים של 06/08 נבדקו אחד-אחד, ואף אחד מהם אינו Cloudinary:

| כשל | הסיבה האמיתית |
|---|---|
| 06/08 **13:52** | **flake.** `unexpected=0, flaky=1` — אף טסט לא נפל; ה-job האדים בגלל `--fail-on-flaky-tests`. ה-log **נקי מ-401**. |
| 06/08 **15:35** | **השבתת GitHub Actions.** `Failed to resolve action download info. Error: Service Unavailable` → `R_E2E: abandoned`. הסוויטה לא רצה כלל. |
| 06/08 14:12 | לא נבדק (מיצוי תקציב זמן). |

**ובכיוון ההפוך — `conclusion: success` בסדרת staging הוא לרוב skip-green.** אומת על run `31167103748`: `Playwright E2E (Vercel preview): skipped`, `E2E gate: success`. דחיפה docs-only מדלגת על ה-job וה-run עדיין ירוק. **ירוק שם אינו עדות ש-VRT עבר.** זו בדיוק המחלקה של "ירוק משתי סיבות מנוגדות" ב-`testing.md`.

---

## א׳.3 · האם ה-onboarding חסום — **לא אושר כשבור. תלוי בסיבה.**

> **חד וברור: לא מדדתי העלאה, ולכן איני יכולה לומר שהיא שבורה.** מה שלהלן הוא **הסקה מקוד**, מסומנת ככזו.

**המסלול, file:line:**

`backend/app/config.py:46-48` (`cloudinary_cloud_name` / `cloudinary_api_key` / `cloudinary_api_secret`)
→ `backend/app/routers/upload.py:121-125` (`cloudinary.config(...)` בשלושתם) → `:129-135` (`uploader.upload(...)`)
· מסלול ה-avatar: `upload.py:186-190` → `:196-206` · וכן `backend/app/services/oauth_verifiers.py:84-85`.

**ההבדל שקובע הכול:** **האספקה אינה נושאת שום אישור** (`lib/cloudinary.js:22-43` — מניפולציית מחרוזת בלבד, בלי חתימה). **ההעלאה נושאת `api_key` + `api_secret`.** אותו **חשבון** (`cloud_name`), שני מנגנוני אימות שונים.

**מכאן נובעת שלילה שמצמצמת את רשימת המועמדים של ספיר:**

> **סיבוב/ביטול של `api_key` אינו יכול להסביר את ה-401 של האספקה** — האספקה אינה מציגה מפתח כלל. אם הסיבה היחידה הייתה מפתח שסובב, האספקה הייתה ממשיכה לעבוד. היא לא. **לכן זו אינה הסיבה.**

**טבלת ההכרעה — מה שספיר תמצא בקונסולה קובע:**

| סיבה | האספקה | ההעלאה | onboarding |
|---|---|---|---|
| credits חודשיים שנגמרו | ✗ | **✗ צפוי** | **חסום** |
| חשבון מושהה / חסום | ✗ | **✗ צפוי** | **חסום** |
| restricted media types / delivery access control | ✗ | ✓ צפוי | תקין |
| `api_key` שסובב | ✓ (היה עובד) | ✗ | — **נשלל, ראו למעלה** |

**למה לא נמדד:**

* העלאה אמיתית ל-production **אסורה** ואינה נעשתה.
* **גם staging אינו מוצא בטוח:** ה-`cloud_name` הוא אותו ענן `dfzpscjks`, כך שהעלאה מ-staging כותבת נכס אמיתי לתוך אותו חשבון. זו כתיבה ל-production בכל מובן שחשוב.
* בדיקת Sentry לכשלי העלאה של משתמשות אמיתיות — **בלתי אפשרית**, `sentry.io` חסום (א׳.1).

**איך זה ייראה אם כן ייכשל:** `HTTP 500` + `"שגיאה בהעלאת התמונה — נסי שוב בעוד רגע"` (`upload.py:139-143`), ו-`log.error("Cloudinary upload failed: %s", e)`. **כשל רועש, לא שקט.**
⚠️ ה-fallback ל-placeholder (`upload.py:112-115`) נדלק **רק** כאשר `cloudinary_cloud_name` **ריק** — הוא **אינו** תופס 401. אין מסלול שקט שמסתיר את התקלה.

---

## א׳.4 · היקף — מה שבור בפועל (מדוד)

**כל השורות נמדדו דרך ה-optimizer של production** (`mehamakor.co.il/_next/image`), כולן `502 OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED`:

| נכס | משטח |
|---|---|
| `login/hero-produce-crate.jpg` | `/login` |
| `register/hero-box-produce.jpg` | `/register` |
| `home/hero-produce.jpg` | `/` (רקע ה-hero) |
| `v1782159035/events/hero-market.jpg` | `/events` |
| `WhatsApp_Image_…_dl4ldr.jpg` | `/about` |
| **`mehamakor/demo/ruach-hasadeh-hero`** | **תמונת בית עסק** |
| **`mehamakor/demo/ruach-hasadeh-challah`** (`ar_1:1,w_160`) | **תמונת מוצר** |

שתי השורות המודגשות הן העיקר: **תמונות בתי עסק ומוצרים שבורות, לא רק שבעה hero-ים.** זה הקטלוג עצמו.

**מלוג ה-E2E של 07/08** (אותו ענן, אותו מסלול) נצפו 401 גם על 9 תמונות בתי עסק נוספות (`lehem-vezman`, `kvushim-savta-miriam`, `meshek-harel-bakar`, `hagina-rotem`, `sabon-ez-naama`, `kaveret-ayal`, `gvinot-tamar`, `machlevet-emek-haela`) ו-4 תמונות מוצר (`ruach-hasadeh-{spelt,sourdough,cookies,challah}`) בגזרות `ar_4:3` · `ar_1:1,w_160` · `ar_1:1,w_128`.

**משטחים שנגזרים מהקוד** (`grep`, file:line): `/` (`HomeHero.jsx:21`) · `/login` (`LoginClient.jsx:120`) · `/register` (`RegisterClient.jsx:210`) · `/about` (`AboutClient.jsx:174`) · `/events` (`EventsClient.jsx:49`) · `/experiences` (`ExperiencesClient.jsx:19`) · `/group-buys` (`GroupBuysClient.jsx:18`) · וכל משטח שמרנדר `ProducerCard` / גיליון מוצר.

**➕ ממצא שלא היה ברשימה: תצוגות שיתוף חברתי.** `frontend/lib/seo.js:110` מעביר תמונות OG דרך Cloudinary — כלומר **גם התצוגה המקדימה בוואטסאפ/פייסבוק שבורה**. זה לא נראה באתר בכלל, ולכן לא היה מתגלה בבדיקה ידנית.

> **הערה על דף הבית, לדיוק ולא לוויכוח.** תמונות **הקטגוריות** בדף הבית הן Unsplash ואכן תקינות — זה נכון ולא נבדק מחדש. אבל **רקע ה-hero** של דף הבית הוא Cloudinary: `HomeHero.jsx:21`, ונמדד `502`. ב-HTML החי הוא יושב כ-`background-image: url(…)` ולא כ-`next/image` — כלומר הדפדפן פונה **ישירות** ל-Cloudinary ומקבל **401**, בלי לעבור דרך ה-optimizer. לכן דף הבית — המשטח בעל התנועה הגבוהה ביותר — **כן מושפע**, דרך ה-hero ולא דרך הקטגוריות.

---

## א׳.5 · מה עדיין לא ידוע

* **הסיבה** — דורשת את הקונסולה. ספיר.
* **האם ההעלאה שבורה בפועל** — הסקה בלבד (א׳.3).
* **staging** — עדיין לא נמדד ישירות (מוגן ב-Vercel SSO).
* **הרגע המדויק** בתוך חלון ה-20 שעות — ניתן לצמצום ע"י בדיקת ריצות E2E נוספות בין 06/08 13:58Z ל-07/08 10:12Z; לא נעשה, ואינו משנה את ההכרעה.
