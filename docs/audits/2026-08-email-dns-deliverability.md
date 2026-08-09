# אודיט deliverability + היגיינת DNS — SPF / DKIM / DMARC

**MEH-1982 · 09/08/2026 · אודיט קריאה בלבד — אפס שינויי קוד ייצור.**

מקור: הכרטיס — *"אף אחד לא בדק אם הם מגיעים"*. השאלה נכונה. **התשובה הפתיעה:**
האימות עצמו (SPF/DKIM/DMARC) **מוגדר ועובד**, והפער האמיתי הוא במקום אחר לגמרי —
בדיווח, לא באימות.

פורמט לפי `docs/audits/2026-08-business-shape-matrix.md`: ממצאים ממוספרים,
ציטוט `file:line` או פלט DNS גולמי לכל טענה.

---

## ⚠️ תיקון להנחת הכרטיס — לקרוא לפני הטבלה

הכרטיס מניח: *"בלעדיהם האימיילים הטרנזקציוניים נוחתים בספאם"* — כלומר שהרשומות
**חסרות**. **הן לא.** נמדד 09/08:

- **DKIM קיים** — מפתח RSA תקף ב-`resend._domainkey.mehamakor.online`
- **SPF קיים** — על `send.mehamakor.online`, שזה **בדיוק** המקום הנכון עבור Resend
- **DMARC קיים** — `v=DMARC1; p=none; rua=...`

זהו **דפוס ההתקנה הסטנדרטי של Resend**, והוא מיושם נכון. זה המופע הרביעי היום של
המחלקה ש-ORDERS §5 מתאר: כרטיס שטוען "חסר" על יכולת שכבר נשלחה (אחרי MEH-1955,
MEH-1956, MEH-160). **הבדיקה לפני הבנייה שילמה שוב** — הייתי מוסיף רשומות SPF
כפולות שהיו *שוברות* התקנה תקינה.

**מה שכן שבור** מפורט ב-F1–F3 למטה, והוא חשוב מכפי שהוא נשמע.

---

## איך נמדד — ולמה הבקרה הזאת חובה

בסנדבוקס של CC **אין `dig`, אין `nslookup`, אין `dnspython`**, ו-`dns.google`
חסום ע"י ה-proxy (`CONNECT tunnel failed, response 403` — אותה מחלקה כמו חסימת
Railway ב-CLAUDE.md). DNS גולמי מעל UDP/53 מול `8.8.8.8` **כן** עובד, אז נכתב
client מינימלי ב-Python נטו.

**ה-self-test תפס באג אמיתי לפני שנקראה ולו תוצאה אחת.** בגרסה הראשונה
`google.com TXT` החזיר **0 רשומות** בעוד `_dmarc.google.com` נפרס תקין — קטיעה
ב-512 בייט של UDP בלי EDNS0. תגובה קטועה נפרסת כ**אפס תשובות**, שזה **בדיוק אותו
פלט** כמו "הרשומה לא קיימת".

בלי הבקרה הזאת האודיט היה מדווח *"SPF חסר"* על דומיין שיש לו SPF — ממצא שקרי
שנראה זהה לממצא אמיתי. אחרי הוספת EDNS0 + נפילה ל-TCP: `google.com TXT` = **15
רשומות**. נכשל→עבר, מודגם.

בקרה שלילית: שם ב-`.invalid` חייב להחזיר **NXDOMAIN** ספציפית — לקבל
"NOERROR עם 0 תשובות" היה מכשיר בדיוק את הכשל הנ"ל.

---

## ספק השליחה — מהקוד, לא מניחוש (דרישת DoD)

| מה | ערך | מקור |
|---|---|---|
| ספק | **Resend, HTTP API** (לא SMTP — Railway חוסם 25/465/587) | `backend/app/services/email.py:1-5` · `resend.Emails.send` ב-`:159` |
| כתובת שולח | `מהמקור <noreply@mehamakor.online>` | `backend/app/config.py:81` |
| ערך production מתועד | זהה — `@mehamakor.online` | `docs/DEPLOYMENT.md:1206` (וגם `:143`) |

> **מגבלה שיש לומר בפירוש:** `EMAIL_FROM_ADDRESS` ניתן לדריסה ב-Railway
> (`config.py:79-80`), ו-CC **לא יכול לקרוא env vars של Railway** (gate 2). שתי
> השורות למעלה הן ברירת המחדל בקוד + הערך המתועד — **לא** הערך החי. אם ספיר דרסה
> אותו ל-`@send.mehamakor.online` או ל-`.co.il`, ניתוח הפערים משתנה. **זו ההנחה
> היחידה באודיט הזה שלא נמדדה, והיא נושאת את F1.**

---

## מצב נמדד — `mehamakor.online` (דומיין השליחה בפועל)

| רשומה | קיים היום | נדרש | מצב |
|---|---|---|---|
| `send.` SPF | `v=spf1 include:amazonses.com ~all` | כנ"ל | ✅ |
| `send.` MX | `10 feedback-smtp.eu-west-1.amazonses.com` | כנ"ל | ✅ |
| DKIM `resend._domainkey` | מפתח RSA 1024-bit תקף | כנ"ל | ✅ |
| DMARC `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@mehamakor.online` | מדיניות + rua שמגיע | ⚠️ **F1+F2** |
| **apex TXT (SPF)** | **אין** | `v=spf1 ... ~all` | ❌ **F3** |
| **apex MX** | **אין** | — (אבל ראו F1) | ❌ **F1** |
| NS | `ns1/ns2.vercel-dns.com` | — | — |
| wildcard | `*` נפתר ל-IP של Vercel | — | הערה |

## מצב נמדד — `mehamakor.co.il` (הדומיין הקנוני)

`frontend/public/robots.txt` קובע: *"canonical public domain is mehamakor.co.il
(Sapir 18/07)"* (MEH-1322), ו-`Sitemap:` מצביע לשם.

| רשומה | קיים היום | מצב |
|---|---|---|
| apex SPF | `v=spf1 include:_spf.mx.cloudflare.net ~all` | ✅ |
| apex MX | Cloudflare (`route1/2/3.mx.cloudflare.net`) | ✅ |
| DKIM `resend._domainkey` | מפתח RSA תקף (שונה מזה של `.online`) | ✅ |
| DMARC | `v=DMARC1; p=none; rua=mailto:dmarc@mehamakor.co.il` | ⚠️ `p=none` |
| `send.` SPF | `v=spf1 include:amazonses.com ~all` | ✅ |
| NS | Cloudflare | — |

**הדומיין הקנוני מוגדר טוב יותר מדומיין השליחה.** ה-flip ל-`.co.il`
(`config.py:80`, "Phase 2") ינחת על תשתית מוכנה — זו בשורה טובה, ושווה לתעד אותה
כדי שה-flip לא ייתפס כמסוכן.

---

## למה זה **לא** נוחת בספאם היום — המנגנון, לא ניחוש

שווה לכתוב במפורש כי זה מה שהופך את F1–F3 מ"קטסטרופה" ל"פער אמיתי אך תחום":

1. **SPF נבדק מול ה-envelope (`MAIL FROM`)**, לא מול הכותרת `From:`. Resend שולח
   עם Return-Path תחת `send.mehamakor.online` — **ולכן ה-MX וה-SPF יושבים שם**.
   ה-SPF **עובר**.
2. **DKIM חותם עם `d=mehamakor.online`** (המפתח יושב תחת האפקס) — כלומר הוא
   **מיושר** (aligned) מול `From: noreply@mehamakor.online`.
3. **DMARC דורש יישור של SPF *או* DKIM.** DKIM מיושר → **DMARC עובר**. גם ה-SPF
   מיושר ב-relaxed mode (תת-דומיין של אותו דומיין ארגוני).

**מסקנה:** האימות תקין. הפער אינו באימות אלא ב**נראות ובאכיפה**.

---

## F1 — דוחות ה-DMARC נשלחים לתיבה שאינה קיימת (החמור מבין השלושה)

`_dmarc.mehamakor.online` מבקש דוחות ל-`dmarc@mehamakor.online`. **ל-apex אין
MX.** לפי RFC 5321 §5.1 שרת נופל חזרה לרשומת ה-A — שהיא
`216.198.79.1` / `64.29.17.1`, כלומר **ה-edge של Vercel**, שאינו מריץ SMTP.

**כלומר: אף דוח DMARC לא הגיע מעולם ולא יגיע.**

הצירוף הוא מה שנושך: `p=none` **בלי** דוחות שמגיעים = הרשומה **לא אוכפת כלום
וגם לא מדווחת כלום**. היא דקורציה. זו בדיוק המחלקה של
`.claude/rules/testing.md` — *מנגנון שנראה כמו אות ואינו אות*: כל בדיקה חיצונית
תראה "DMARC מוגדר ✅" ותמשיך הלאה.

**חשוב:** `mehamakor.co.il` **כן** מחזיק MX, ולכן שם ה-rua מצביע לכתובת
שמסוגלת עקרונית לקבל — בכפוף לקיום כלל routing בפועל ב-Cloudflare, **שלא ניתן
לאמת מ-DNS** ונשאר לספיר.

## F2 — `p=none` בשני הדומיינים

`p=none` = ניטור בלבד. מזייף שישלח בשם `mehamakor.online` **לא ייחסם**. זו נקודת
פתיחה תקנית ונכונה — אבל היא אמורה **להתקדם**, ובלי F1 מתוקן אין את הדאטה שמצדיק
את ההתקדמות.

**סדר הפעולות מחייב:** מתקנים את F1 → אוספים דוחות 2–4 שבועות → מקדמים ל-
`quarantine` → ל-`reject`. **קפיצה ל-`p=reject` לפני שיש דוחות היא הימור** על כך
שאין שולח לגיטימי שנשכח.

## F3 — אין SPF על ה-apex של `mehamakor.online`

לא שובר את השליחה (ראו המנגנון למעלה), אבל משאיר את האפקס **ללא מדיניות**: שולח
מזייף עם envelope `@mehamakor.online` מקבל תוצאת SPF `none` במקום `softfail`.
יחד עם `p=none` (F2), שום שכבה לא עוצרת אותו.

---

## הרשומות המדויקות להדבקה — שורה לכל פער

> **רישום:** `mehamakor.online` יושב על **Vercel DNS**; `mehamakor.co.il` על
> **Cloudflare**. שני ממשקים שונים.

### F3 — SPF על האפקס (Vercel DNS, דומיין `mehamakor.online`)

```
Host/Name:  @
Type:       TXT
Value:      v=spf1 include:amazonses.com ~all
TTL:        3600
```

**למה `~all` ולא `-all`:** אם Resend ישלח אי-פעם עם envelope באפקס, `-all` ישבור
את זה מיידית. `~all` (softfail) נותן את אותה הצהרה בלי הסיכון. אפשר להדק ל-`-all`
אחרי שדוחות ה-DMARC (F1) יראו חודש בלי שולח לא מזוהה. **אל תדביקי `-all` עכשיו.**

### F1 — שהדוחות באמת יגיעו (שתי רשומות, שתיהן נדרשות)

הפתרון הזול הוא להפנות את הדוחות לדומיין שכבר יודע לקבל דואר (`.co.il`). אבל
דיווח **חוצה-דומיין** דורש הרשאה מפורשת בצד המקבל — RFC 7489 §7.1. בלי הרשומה
השנייה, שרתים מכבדי-תקן **יסרבו לשלוח** את הדוחות, וזה ייכשל בשקט בדיוק כמו היום.

**רשומה 1 — עדכון ה-DMARC (Vercel DNS, `mehamakor.online`):**

```
Host/Name:  _dmarc
Type:       TXT
Value:      v=DMARC1; p=none; rua=mailto:dmarc@mehamakor.co.il; fo=1
TTL:        3600
```

**רשומה 2 — הרשאת הדיווח החוצה-דומיין (Cloudflare, `mehamakor.co.il`):**

```
Host/Name:  mehamakor.online._report._dmarc
Type:       TXT
Value:      v=DMARC1
TTL:        3600
```

> שם המארח המלא יוצא `mehamakor.online._report._dmarc.mehamakor.co.il`. ב-Cloudflare
> מזינים רק את החלק שלפני הדומיין, כפי שכתוב.
>
> **ואז — הכי חשוב ולא DNS:** לוודא ש-`dmarc@mehamakor.co.il` **באמת מגיע לתיבה
> שאת קוראת** (Cloudflare → Email Routing → כלל ל-Gmail שלך). זה החלק היחיד
> שאי-אפשר לאמת מ-DNS, וזה החלק שכשל היום.

**חלופה** (אם עדיף לא לגעת ב-`.co.il`): להוסיף MX ל-apex של `.online`. יקר יותר
ומיותר — הדומיין הזה ממילא לא אמור לקבל דואר.

### F2 — התקדמות המדיניות (רק אחרי 2–4 שבועות של דוחות)

```
שלב 2:  v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@mehamakor.co.il; fo=1
שלב 3:  v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@mehamakor.co.il; fo=1
שלב 4:  v=DMARC1; p=reject; rua=mailto:dmarc@mehamakor.co.il; fo=1
```

אותו רצף תקף גם ל-`_dmarc.mehamakor.co.il` (שם ה-rua כבר מקומי ולא צריך את רשומה 2).

---

## צעד האימות לספיר (דרישת DoD) — mail-tester

**אחרי** הדבקת הרשומות והמתנה של ~30 דקות להתפשטות:

1. לפתוח https://www.mail-tester.com — האתר מייצר כתובת חד-פעמית.
2. **להפעיל אימייל טרנזקציוני אמיתי** לכתובת הזאת, לא להעתיק ידנית: להירשם עם
   הכתובת, או להריץ "שכחתי סיסמה". זה בודק את מה שהמערכת **באמת** שולחת.
3. מצופה: **SPF ✅ · DKIM ✅ · DMARC ✅**, ציון ‎9/10 ומעלה.
4. אם DKIM נכשל — סימן שהדומיין ב-Resend אינו זה שב-`EMAIL_FROM_ADDRESS`.

**בדיקה חוזרת של ה-DNS מהטרמינל שלך** (Git Bash / PowerShell ב-Windows):

```
nslookup -type=TXT _dmarc.mehamakor.online 8.8.8.8
nslookup -type=TXT mehamakor.online 8.8.8.8
nslookup -type=TXT mehamakor.online._report._dmarc.mehamakor.co.il 8.8.8.8
```

---

## Skeptic Mode — מה **לא** נבדק, ולמה

הפרדה מכוונת בין מה שנמדד לבין מה שלא, כי "לא בדקתי X" עדיף על "X כנראה עובד"
(exec §9).

| פריט | מצב | סיבה |
|---|---|---|
| **הערך החי של `EMAIL_FROM_ADDRESS`** | ❌ לא נבדק | env var ב-Railway, gate 2. **נושא את F1** — ראו האזהרה למעלה. |
| **www→apex על `.online`** | ❌ לא נבדק | ה-proxy החזיר `403` גם ל-`mehamakor.online` וגם ל-`www.` — בשני מסלולים (curl ו-WebFetch). רשומות ה-A **קיימות** לשניהם; התנהגות ה-**redirect** לא נמדדה. |
| **www→apex על `.co.il`** | ⚠️ חלקי | האפקס: `HTTP 200`, שרשרת TLS תקינה (`ssl_verify_result=0`). `www.mehamakor.co.il` חסום ב-proxy. |
| **staging לא מאונדקס** | ⚠️ ממצא חלקי | `robots.txt` הוא `Allow: /` **בלי** שום חריג ל-staging, כלומר ההגנה נשענת **כולה** על ה-SSO של Vercel. אם ה-SSO ייפול, staging אינדקסבילי ומתחרה בתוכן כפול. לא ניתן לאמת מהסנדבוקס (egress חסום). |
| **כלל ה-routing ב-Cloudflare** | ❌ לא ניתן | לא נגזר מ-DNS. זה החלק שכשל ב-F1. |
| **שליחה בפועל** | ❌ לא בוצע | האודיט read-only; אין הרצת שליחה. mail-tester הוא הצעד שסוגר את זה. |

---

## מה **לא** נעשה כאן

אפס שינויי קוד ייצור, אפס שינויי DNS (אין ל-CC גישה, ולא אמורה להיות). האודיט
**ממליץ ולא מתקן**, ולא נפתחו ממנו טיקטים — ממצא אינו עבודה שאושרה לעצמה
(ORDERS §5).

`docs/audits/` נבחר כיעד כדי שהממצא יהיה **greppable מהריפו**; תגובת Linear לבדה
נעלמת מהעין של סשן עתידי.
