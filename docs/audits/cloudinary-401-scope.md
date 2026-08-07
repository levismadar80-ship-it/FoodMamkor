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
