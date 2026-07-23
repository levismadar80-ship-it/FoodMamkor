# דוח פערים — פרטיות ומסחר אלקטרוני (MEH-1064)

> **גילוי נאות / Disclaimer.** ניתוח זה הופק על ידי כלי AI
> (`israeli-privacy-shield` + `israeli-ecommerce-compliance`) והוא **אינו ייעוץ
> משפטי**. כל שינוי בנוסח משפטי (מדיניות פרטיות, תנאי שימוש, הצהרות) מחייב אישור
> מפורש של ספיר, ובמקומות המסומנים — **חוות דעת של עורך/ת דין**. הדוח מסמן ליד כל
> פער הדורש שינוי טקסט משפטי: _"requires separate Sapir-approved ticket
> (MEH-1059 pattern)"_. הדוח הוא **קריאה בלבד** — לא שונה שום קוד או נוסח.
>
> **סקופ:** MEH-1064. תאריך: 2026-07-09. ענף: `feature/meh-1064-compliance-report`.
> **מסגרות דין שנבדקו:** חוק הגנת הפרטיות, התשמ״א–1981 + תיקון 13 (בתוקף
> 14.08.2025) + תקנות אבטחת מידע 2017 · חוק הגנת הצרכן, התשמ״א–1981 (מכר מרחוק).
> **הערת סקופ נוספת:** תקן נגישות IS 5568 / הצהרת נגישות — **מחוץ לסקופ**, מטופל
> ב-MEH-1059 (ראו §7).

---

## תמצית מנהלים (Executive summary)

הפלטפורמה כבר מציגה `/privacy` ו-`/terms` מפורטים בעברית, באנר עוגיות opt-in,
מנגנון מחיקת חשבון (`auth.py:1252` `delete_account`), ו-hashing של כתובות IP
בטבלאות האנליטיקה — בסיס טוב. הפערים המהותיים מרוכזים ב**דיוק גילוי הצדדים
השלישיים** ב-`/privacy` וב**עיבוד PII שאינו מגולה**.

**⚠️ ממצא אבטחה מוקדם (STOP condition b) — הועלה לספיר במיידי, לא נקבר בדוח:**
Sentry Session Replay רץ עם `maskAllText: false` ו-`replaysOnErrorSampleRate: 1.0`
(`frontend/sentry.client.config.js:14-20`) — כלומר בכל שגיאת פרונטאנד נשלח שחזור
סשן **עם טקסט גלוי** (כולל שם, אימייל וטלפון שהוקלדו בטפסי הרשמה / יצירת קשר)
לצד שלישי (Sentry) **שאינו מוזכר כלל** ברשימת הצדדים השלישיים ב-`/privacy`.
זהו PII שעשוי לזרום לצד שלישי מעבר למה ש-`/privacy` מגלה. פירוט: **CMP-02**.

---

## 1. מצאי נתונים (Data inventory)

טבלת סוגי המידע האישי הנאסף, נקודת האיסוף (file:line), אחסון, מעבד צד ג׳, וגילוי
ב-`/privacy`. מקורות הגילוי: `frontend/messages/he.json` (namespace `privacy`),
הנרנדר ב-`frontend/app/[locale]/privacy/page.js`.

| סוג נתון | נקודת איסוף (file:line) | אחסון | מעבד צד ג׳ | מגולה ב-`/privacy`? |
|---|---|---|---|---|
| שם מלא | `backend/app/models/models.py:270` (`User.name`) · הרשמה | Postgres (Railway) | Sentry replay (פוטנציאלי, CMP-02) | כן — `he.json` `privacy.sections.data.items.identity` |
| אימייל | `models.py:269` (`User.email`) · הרשמה/התחברות | Postgres | Resend (מיילים), Google (OAuth) | כן — `data.items.identity` (אך Resend לא נקוב — CMP-01) |
| Password hash | `models.py:271` (`User.password_hash`) · הרשמה | Postgres | — | לא במפורש (משתמע; bcrypt) |
| עיר | `models.py:273` (`User.city`) · פרופיל | Postgres | — | כן — `data.items.identity` |
| טלפון | `models.py:274` (`User.phone`) · פרופיל/OTP | Postgres | Meta WhatsApp (OTP/התראות) | כן — `data.items.identity` |
| Google ID | `models.py:279` (`User.google_id`) · Google OAuth | Postgres | Google | כן — `data`/`third_parties.items.google` |
| Apple ID | `models.py:280` (`User.apple_id`) · Apple OAuth (`next.config.js:87-88`) | Postgres | Apple | **לא** — `/privacy` מזכיר רק Google (CMP-01) |
| Avatar URL | `models.py` (`User.avatar_url`) · OAuth picture / העלאה | Cloudinary | Cloudinary, Google | חלקית — `third_parties.items.cloudinary` |
| `last_active_at` | `models.py:293` · כל בקשה מאומתת | Postgres | — | משתמע ב-`data.items.cookies` (נתוני התנהגות) |
| פרטי בית עסק (שם, איש קשר, כתובת, lat/lng, טלפון, אינסטגרם, אתר, whatsapp_group, contact_email, facebook) | `models.py:47-70` (`Producer.*`) · הרשמת עסק | Postgres | — | כן — `data.items.business` |
| תמונות בית עסק | `models.py` (`Producer.images`) · העלאה | Cloudinary | Cloudinary | כן — `third_parties.items.cloudinary` |
| כתובת IP (hash) | `models.py:908` (`ProducerPageView.viewer_ip_hash`) · צפייה בעמוד עסק | Postgres (SHA-256+salt, `analytics.py:hash_ip`) | — | כן — `data.items.technical` (מגולה "IP"; בפועל מוצפן — עדיף) |
| כתובת IP (rate-limit) | `backend/app/rate_limit.py` (`get_real_client_ip`) · כל בקשה | לא נשמר (transient) | — | לא רלוונטי (לא מאוחסן) |
| IP hash — קליק יצירת קשר | `models.py:975` (`ContactClick.ip_hash`) · קליק CTA | Postgres (hash) | — | משתמע — `data.items.cookies` |
| קליק WhatsApp | `models.py:917-947` (`ProducerWhatsAppClick`) · קליק CTA | Postgres | Meta (יעד הקישור) | כן — `data.items.cookies` |
| דירוגים/תגובות | `models.py:834` (`ProducerReview.body`), `models.py:867` (`HomeProductRating.comment`) · שליחת ביקורת | Postgres | Anthropic (מיתון תוכן) | כן — `data.items.ugc` |
| פניות טופס יצירת קשר | `models.py:800-802` (`ContactMessage.name/email/message`) · טופס | Postgres | Resend (התראה) | כן — `data.items.ugc` |
| דוא״ל ניוזלטר | `models.py:792` (`NewsletterSubscriber.email`) · הרשמה לניוזלטר | Postgres | Resend | כן — `data.items.ugc`/`why.notifications` |
| OTP טלפון | `models.py:1082` (`PhoneOtpToken.phone/code`) · אימות טלפון | Postgres | Meta WhatsApp | משתמע — `data.items.identity` |
| הפניית referral | `models.py:985-1005` (`ReferralClick`) · הרשמה עם `/ref/{code}` | Postgres | — | לא במפורש |
| מיקום מקורב (דפדפן) | client geolocation (opt-in) · מפה | לא נשמר בשרת | — | כן — `data.items.location` |
| Session Replay (טקסט גלוי) | `frontend/sentry.client.config.js:14-20` · בכל שגיאה | **Sentry (צד ג׳)** | **Sentry** | **לא** (CMP-02) |
| אנליטיקת התנהגות | `frontend/components/ClarityScript.jsx:25` · consent=all | Microsoft Clarity | **Microsoft** (אך חסום CSP — CMP-09) | **לא** (CMP-01/09) |

**סיכום מעבדי צד ג׳ בפועל מול הגילוי:**

| מעבד | תפקיד | file:line | מגולה ב-`/privacy`? |
|---|---|---|---|
| Cloudinary | אחסון/עיבוד תמונות | `frontend/next.config.js` CSP `img-src` | ✅ כן |
| Google | OAuth, Fonts, אנליטיקה | `next.config.js:84,87` | ✅ כן |
| Anthropic | AI צ׳אט/מיתון | `backend/app/services/*` | ✅ כן |
| **Meta (WhatsApp)** | הודעות WhatsApp/OTP | `backend/app/services/whatsapp.py:3,83,221` | ⚠️ מסומן בטעות כ-**"Twilio"** (`third_parties.items.twilio`) — CMP-01 |
| **Resend** | שליחת מיילים | `backend/app/services/email.py:1` | ❌ לא נקוב — CMP-01 |
| **Sentry** | ניטור שגיאות + Session Replay | `sentry.client.config.js:9-26`, `next.config.js:87` | ❌ לא נקוב — CMP-01/CMP-02 |
| **Microsoft Clarity** | אנליטיקת התנהגות | `ClarityScript.jsx`, `layout.js:166,234` | ❌ לא נקוב (וגם חסום CSP) — CMP-09 |
| **Apple** | Apple OAuth | `next.config.js:87-88`, `User.apple_id` | ❌ לא נקוב — CMP-01 |
| Vercel & Railway | אחסון/שרתים | `.claude/rules/deployment.md` | ✅ כן |

---

## 2. טבלת פערים (Gap table)

מיפוי לפי checklist-ים של שני ה-skills. severity: high/med/low. "launch-blocking" =
האם חוסם עלייה לאוויר. הערה: הפלטפורמה **אינה מבצעת עסקאות** (DNA — `terms`
`sections.service.body`: "אינה מוכרת מוצרים, אינה צד לעסקה"), ולכן חלק מדרישות
הצרכנות N/A (ראו §4).

| ID | דרישה (חוק + סעיף / skill) | מצב נוכחי | פער | severity | תיקון מוצע (שורה) | launch-blocking? |
|---|---|---|---|---|---|---|
| CMP-01 | גילוי מדויק של מקבלי מידע — חוק הגנת הפרטיות §11 (חובת יידוע) + `privacy-shield` Step 3 (consent to transfer) · e-commerce Step 6 | `/privacy` `third_parties` מפרט Cloudinary/Google/Anthropic/"Twilio"/Vercel&Railway | Meta מסומן כ-"Twilio"; Resend, Sentry, Apple, Clarity חסרים לגמרי | **high** | לעדכן רשימת `third_parties.items` בעברית — לתקן Twilio→Meta, להוסיף Resend/Sentry/Apple | כן |
| CMP-02 | מזעור וגילוי עיבוד — §11 + תיקון 13 (מזהים מקוונים) + `privacy-shield` Step 3 · תקנות אבטחה 2017 | Sentry Replay `maskAllText:false`, `replaysOnErrorSampleRate:1.0` (`sentry.client.config.js:14-20`) שולח טקסט גלוי לצד ג׳ לא מגולה, **ללא תלות בהסכמת עוגיות** | PII (שם/אימייל/טלפון בטפסים) עשוי לזרום ל-Sentry ללא גילוי וללא consent | **high** | `maskAllText:true` + `blockAllMedia:true`, לגלות Sentry ב-`/privacy`, לשקול gating בהסכמה | כן |
| CMP-03 | העברת מידע לחו״ל — תקנה 2 לתקנות העברת מידע + `privacy-shield` Step 4 | מידע מעובד ב-Cloudinary/Sentry/Meta/Anthropic/Vercel/Railway (סבירות גבוהה לשרתי חו״ל) | אין ציון מנגנון העברה/DPA/הסכמה ספציפית; `has_cross_border=NEEDED` (ראו §3) | **med** | לוודא DPA/SCC מול כל מעבד; להוסיף סעיף העברה לחו״ל ל-`/privacy` — **requires legal counsel** | לא |
| CMP-04 | זיהוי עוסק — חוק הגנת הצרכן §למכר מרחוק + e-commerce Step 5 | `operator` block: "טופז שנפ." + שם מסחרי + אימייל בלבד (`he.json` `privacy/terms.sections.operator`) | חסרים מספר עוסק/ח.פ, כתובת פיזית, טלפון | **med** | להוסיף ל-operator block; **תלוי בשאלה אם חובת מכר-מרחוק חלה** — requires legal counsel | לא |
| CMP-05 | רישום מאגר — חוק §8 + תיקון 13 (צמצום) + `compliance_checker.py` | לא רשום | הסקריפט קובע **NO** (לא גוף ציבורי, לא data-broker, <10k) — ראו §3 | low | ניטור בלבד; חוזר לרלוונטיות ב-10k+ עם מטרת סחר במידע | לא |
| CMP-06 | רמת אבטחה — תקנות אבטחה 2017 | היום BASIC (הסקריפט) | ב-10k+ רשומות → MEDIUM: הצפנה, ממונה אבטחה, DPA (ראו §3) | med (עתידי) | לתכנן מעבר ל-MEDIUM לפני חציית 10k | לא |
| CMP-07 | מינוי ממונה הגנת פרטיות (PPO) — תיקון 13 | לא ממונה | לא נדרש כרגע (לא גוף ציבורי/data-broker/עיבוד רגיש בהיקף) | low | אין פעולה; לתעד את ההחלטה | לא |
| CMP-08 | הסכמה — §1 + חוק התקשורת §30א (עוגיות best-practice) · e-commerce Step 6 | באנר opt-in (`CookieBanner.jsx`), Clarity gated על consent=all (`ClarityScript.jsx:12`) | **Sentry רץ ללא תלות בהסכמה** — עוגיות/מזהים לא-הכרחיים נטענים לפני opt-in | **med** | לתלות טעינת Sentry-replay בהסכמה, או להגדירו כ"הכרחי" ולגלותו | לא |
| CMP-09 | דיוק גילוי עוגיות — e-commerce Step 6 | `/privacy` §6 מדבר על "עוגיות אנליטיקה"; הבאנר "כל/הכרחיות" | Clarity מוגדר אך **חסום CSP** (`next.config.js:84` `script-src` ללא `clarity.ms`) → לא נטען בפועל; פער בין הנוסח למציאות | low | להסיר Clarity או להוסיפו ל-CSP; ליישר את נוסח §6 למצב בפועל | לא |
| CMP-10 | תוכנית תגובה לאירוע/דיווח הפרה — תקנות אבטחה 2017 + תיקון 13 | לא נמצא נוהל מתועד בקוד/דוקס | אין נוהל breach-notification (דיווח לרשות "ללא דיחוי" + ליחיד בנזק משמעותי) | med | לכתוב runbook (לא נוסח משפטי ציבורי) | לא |
| CMP-11 | טיפול בבקשות נושא-מידע — §13 (עיון) + Step 6 | `/privacy` §5: פנייה ל-contact@, 30 יום; מחיקה עצמית ב-`auth.py:1252` (`delete_account`, כולל תמונות Cloudinary `:1359`) | תהליך קיים ומגובה בקוד — פער נמוך; לוודא זמני מענה בפועל | low | ניטור SLA בלבד | לא |
| CMP-12 | הסכמי עיבוד (DPA) — תקנה 15 לתקנות אבטחה (מיקור-חוץ) | לא מתועד | אין DPA ידוע מול Cloudinary/Resend/Sentry/Meta/Anthropic/Vercel/Railway | med | לחתום/לתייק DPA לכל מעבד — requires legal counsel | לא |
| CMP-13 | קטינים — §(מדיניות) | `/privacy` §8 + `terms` §3: 18+ | תואם; אין איסוף מדעת מתחת ל-18 | low | אין פעולה | לא |
| CMP-14 | זכות ביטול / תקופת צינון — חוק הגנת הצרכן פרק ד1 | אין עסקאות בפלטפורמה | **N/A** — אך חייב להיאמר במפורש (ראו §4), לא להישמט | low | להצהיר N/A ב-`/terms`/`/privacy` אם רלוונטי | לא |
| CMP-15 | הצגת מחיר כולל מע״מ — חוק הגנת הצרכן + e-commerce Step 2 | אין מחירים/תשלום בפלטפורמה | **N/A** (ראו §4) | low | אין פעולה | לא |

**כל שורה המסומנת "requires legal counsel" או שהתיקון נוגע בנוסח `/privacy`/`/terms`
מחייבת: _requires separate Sapir-approved ticket (MEH-1059 pattern)_.** בפרט:
CMP-01, CMP-02 (חלק הנוסח), CMP-03, CMP-04, CMP-08, CMP-09, CMP-14.

---

## 3. תיקון 13 — חובת רישום מאגר + קביעת רמת אבטחה

הורץ מקומית `.agents/skills/israeli-privacy-shield/scripts/compliance_checker.py`.
הרצה **הצליחה** (לא הופעל מסלול ה-STOP הידני). קלטי ההערכה עבור מהמקור:
`has_sensitive=false` (מזון/יצירת קשר — לא בריאות/גנטיקה/דעות/פלילי),
`is_government=false`, `is_health_finance=false`, `is_direct_marketing=false`
(פלטפורמת חיבור, לא סוחרת מידע), `is_credit_service=false`, `has_cross_border=true`.
מכיוון שספירת הרשומות המדויקת אינה ידועה ומהווה את הסף הקובע (10,000), הורצו שני
תרחישים.

**פלט הסקריפט — verbatim (JSON mode summary):**

```
########## SCENARIO A — current scale (<10k records, non-sensitive) ##########
Organization: Mehamakor (מהמקור)
Security Level Required: BASIC
Database Registration Required: NO
Cross-Border Transfer Review: NEEDED
Checklist items: 9

########## SCENARIO B — post-growth (>=10k records, non-sensitive) ##########
Organization: Mehamakor (מהמקור)
Security Level Required: MEDIUM
Database Registration Required: NO
Cross-Border Transfer Review: NEEDED
Checklist items: 17
```

**Checklist מלא — verbatim (מתוך `--output` JSON):**

```
=== SCENARIO A (BASIC, 9 items) ===
  [ ] 1. Physical security of premises (basic)
  [ ] 2. Access control (user authentication) (basic)
  [ ] 3. Activity logging (basic)
  [ ] 4. Backup procedures (basic)
  [ ] 5. Written security procedures document (basic)
  [ ] 6. Employee awareness training (basic)
  [ ] 7. Privacy policy published (Hebrew) (basic)
  [ ] 8. Consent mechanisms in place (basic)
  [ ] 9. Data subject request handling process (basic)

=== SCENARIO B (MEDIUM, 17 items) ===
  [ ] 1. Physical security of premises (basic)
  [ ] 2. Access control (user authentication) (basic)
  [ ] 3. Activity logging (basic)
  [ ] 4. Backup procedures (basic)
  [ ] 5. Written security procedures document (basic)
  [ ] 6. Employee awareness training (basic)
  [ ] 7. Privacy policy published (Hebrew) (basic)
  [ ] 8. Consent mechanisms in place (basic)
  [ ] 9. Data subject request handling process (basic)
  [ ] 10. Encryption of data at rest and in transit (medium)
  [ ] 11. Security officer (memune al bitachon meida) appointed (medium)
  [ ] 12. Periodic access review (medium)
  [ ] 13. Enhanced logging and monitoring (medium)
  [ ] 14. Incident response procedures (medium)
  [ ] 15. Third-party access controls (medium)
  [ ] 16. Data processing agreements with service providers (medium)
  [ ] 17. Cross-border transfer safeguards (medium)
```

**קביעה (database-registration duty + security level):**

- **חובת רישום מאגר:** **אינה חלה** בשני התרחישים. תיקון 13 צמצם את החובה לגופים
  ציבוריים ולמאגרים של 10,000+ אנשים שמטרתם העיקרית **מסירת מידע לאחרים** (data
  brokers). מהמקור אינה עונה על אף אחד מהם. **חוזר לבחינה** אם המטרה תשתנה או אם
  יתווסף שירות אשראי/מידע.
- **רמת אבטחה:** **BASIC** כיום (הנחת <10k רשומות). **קופצת ל-MEDIUM** בחציית 10k
  רשומות אנשים — ומוסיפה 8 בקרות: הצפנה במנוחה/בתעבורה, מינוי ממונה אבטחה, סקירת
  הרשאות תקופתית, ניטור מוגבר, נהלי תגובה לאירוע, בקרת גישת צד ג׳, **DPA מול
  מעבדים**, ואמצעי העברה לחו״ל. → CMP-06.
- **העברה לחו״ל:** **NEEDED** בכל תרחיש — יש לוודא הגנה נאותה/DPA/SCC מול מעבדי
  החו״ל. → CMP-03/CMP-12.
- **הכרעות שהן שאלת פרשנות משפטית** (למשל האם היקף עיבוד הביקורות/מיתון-ה-AI מגיע
  ל"עיבוד מידע רגיש בהיקף משמעותי" לצורך PPO, או האם ספירת הרשומות נמדדת לפי
  משתמשים ייחודיים בלבד) — **requires legal counsel**, לא הוכרעו בדוח.

---

## 4. חוק הגנת הצרכן (Consumer protection)

**עקרון מפתח:** מהמקור היא פלטפורמת חיבור/תצוגה בלבד — **לא מתבצעות עסקאות, אין
תשלום, אין סל קניות** (`terms.sections.service.body`: "מציגה מידע בלבד... אינה
מוכרת מוצרים, אינה צד לעסקה... כל עסקה נעשית ישירות בין המוכרת לקונה"). לכן:

- **תקופת צינון / זכות ביטול (מכר מרחוק, פרק ד1):** ככל הנראה **N/A** — אין "עסקה"
  מול הפלטפורמה. **חייב להיאמר במפורש ולא להישמט** (CMP-14). ההכרעה הסופית אם
  הפלטפורמה נחשבת "עוסק" במובן החוק — **requires legal counsel**.
- **הצגת מחיר כולל מע״מ (§Step 2):** **N/A** — אין מחירים מוצגים לתשלום בפלטפורמה
  (CMP-15).
- **חובת גילוי עוסק (Step 5):** **חלה חלקית** — גם ללא עסקאות, זיהוי מפעילת האתר
  הוא תקין ומקובל. כיום מוצג "טופז שנפ." + שם מסחרי + אימייל בלבד; חסרים מספר
  עוסק/ח.פ, כתובת פיזית וטלפון (CMP-04). היקף החובה תלוי בשאלת ה"עוסק" —
  **requires legal counsel**.
- **כיסוי `/terms`:** מקיף — מהות שירות, אחריות רישוי בית עסק (`licensing`), גיל
  18+, אחריות מוצרים, שכבות אימות (`verified`), דיווח הפרות, קניין רוחני, דין חל
  (ישראל, ת״א–יפו). מבנה תקין; הפער היחיד הוא זיהוי-עוסק (CMP-04).

---

## 5. עוגיות ואחסון מקומי (Cookies & storage)

**מה נקבע בפועל מול מה ש-`/privacy` מגלה מול מנגנון ההסכמה:**

| מנגנון | מה נשמר בפועל (file:line) | הסכמה? | גילוי ב-`/privacy` §6 |
|---|---|---|---|
| `cookieConsent` (localStorage) | "all" \| "essential" (`CookieBanner.jsx:26,55`) | — (מנגנון ההסכמה עצמו) | מתואר: "אני מסכימה / רק הכרחיים" ✅ |
| JWT `token` (localStorage) | טוקן התחברות (`ProducerOAuthButtons.jsx:42`) | הכרחי (פטור) | מתואר כ"עוגיות הכרחיות" ✅ |
| `lang`, `chatWasOpened`, `favorite_hint_shown`, recent-searches, `wa_clicked_*` | העדפות/מצב UI (localStorage/sessionStorage) | הכרחי/פונקציונלי | לא נקוב פרטנית; משתמע |
| Microsoft Clarity | סקריפט אנליטיקה (`ClarityScript.jsx:25`) | gated על `consent=all` ✅ | **לא נקוב**; ובנוסף **חסום CSP** → לא נטען בפועל (CMP-09) |
| Sentry Replay | שחזור סשן על שגיאה (`sentry.client.config.js:17`) | **ללא הסכמה** ❌ | **לא נקוב** (CMP-02/CMP-08) |

**מסקנות:**
1. הבאנר הוא opt-in תואם best-practice (PPA) — טוב.
2. **פער עיקרי:** Sentry-replay נטען ללא תלות בהסכמת המשתמש/ת ואינו מגולה (CMP-02,
   CMP-08).
3. **אי-התאמה:** Clarity מוגדר בקוד אך חסום ב-CSP (`next.config.js:84` — אין
   `https://www.clarity.ms` ב-`script-src`) → נוסח §6 מתאר אנליטיקה שלמעשה אינה
   פעילה (CMP-09).
4. מזהים מקוונים / התנהגות (תיקון 13) — נאספים (IP-hash, קליקים, צפיות) ומגולים
   בעיקרם ב-`data.items.technical`/`cookies`.

---

## 6. פערים הדורשים שינוי נוסח משפטי (סיכום ניתוב)

כל אחד מהבאים **requires separate Sapir-approved ticket (MEH-1059 pattern)** — אין
לשנות נוסח `/privacy`/`/terms`/`he.json`/`en.json` בלי אישור ספיר (ובמסומן, עו״ד):

- **CMP-01** — תיקון רשימת הצדדים השלישיים ב-`/privacy` (Twilio→Meta; הוספת
  Resend/Sentry/Apple). _(שינוי נוסח)_
- **CMP-02** — גילוי Sentry ב-`/privacy` + החלטת מיסוך. _(נוסח + קוד — ראו §אבטחה)_
- **CMP-03** — סעיף העברת מידע לחו״ל. _(נוסח + requires legal counsel)_
- **CMP-04** — הוספת זיהוי-עוסק ל-operator block. _(נוסח + requires legal counsel)_
- **CMP-08/CMP-09** — יישור נוסח §6 (עוגיות) למצב בפועל. _(נוסח)_
- **CMP-14** — הצהרת N/A לזכות ביטול, אם רלוונטי. _(נוסח + requires legal counsel)_

---

## 7. מחוץ לסקופ (Out of scope)

- **תקן נגישות IS 5568 / הצהרת נגישות** — מטופל ב-**MEH-1059**. קיים עמוד
  `/accessibility` (`frontend/app/[locale]/accessibility/page.js`). לא נבדק כאן.
- **יישום באנר הסכמה / כתיבת נוסח מדיניות / הצעות schema/DB** — מחוץ לסקופ הדוח
  (report-only, over-engineering guard).

---

_הופק תחת MEH-1064 · `israeli-privacy-shield` + `israeli-ecommerce-compliance` ·
כלי AI, לא ייעוץ משפטי · כל מימוש מחייב אישור ספיר ותיקט נפרד._
