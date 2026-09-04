<!-- dir: rtl — מסמך עברית, יישור לימין -->

# יידוע בנקודת האיסוף (§11 אחרי תיקון 13) — חמש השורות, בהקשרן

> **טיוטה לסקירת עו"ד — לא ייעוץ משפטי.** נכון ל-03/09/2026, מול
> `origin/staging` @ `186adfd8`. חמש השורות **מאושרות מילולית ע"י ספיר (02/09,
> בלוק האישור בכרטיס MEH-1981)** ומורכבות בקוד בענף הזה. הנוסח אינו פתוח
> לשינוי ע"י CC; מה שפתוח הוא השאלות בסוף המסמך.

---

## 1 · מה הרשות דורשת (מהמדריך המקצועי, מאי 2025 — מצוטט בכרטיס MEH-1981, עמוד 12)

פנייה לאדם לקבלת מידע אישי לשם עיבודו במאגר צריכה לכלול:

1. אם חלה חובה חוקית למסור, או שהמסירה תלויה ברצונו — **ומהי תוצאת אי-ההסכמה**
2. **המטרה** שלשמה מבוקש המידע
3. **למי יימסר** המידע ומטרות המסירה
4. קיומה של **זכות עיון** (§13)
5. קיומה של **זכות לבקש תיקון** (§14)

ובנוסף (הנחיית `duty_to_notify`): **שם בעל השליטה במאגר ודרכי ההתקשרות**.

**המודל שנבחר (ICO-style, שכבתי):** בנקודת האיסוף — שורה אחת עם **מטרה + למי נמסר** + קישור; **בעמוד הפרטיות** — שם המפעילה, דרכי התקשרות, זכויות §13/§14, וולונטריות ותוצאת אי-הסכמה. השאלה לעו"ד היא אם השכבה הזאת מספיקה (ראו §5).

---

## 2 · חמש השורות — נוסח, משטח, מיקום בקוד

| מפתח (`he.json` → `privacy.collection_notice.*`) | נוסח מאושר (he) | משטח | מה קורה למידע בפועל (נמדד) |
|---|---|---|---|
| `chat` | **מה שנכתב כאן נשלח ל-Anthropic כדי לנסח את התשובה.** | `frontend/components/ChatWidget.jsx` — מתחת לשורת ההקלדה בפאנל הצ'אט | ההודעה נשלחת ל-`client.messages.create` (`backend/app/routers/chat.py:227`), מודל `claude-haiku-4-5-20251001` (`:50`). **הצ'אט אינו נשמר במסד הנתונים** — אין `db.add`/`Depends(get_db)` ב-`chat.py` (grep ריק). |
| `password_reset` | האימייל משמש לשליחת קישור האיפוס בלבד. | `frontend/app/[locale]/forgot-password/ForgotPasswordClient.jsx` — מתחת לשדה האימייל | `POST /auth/forgot-password` (`auth.py:1359`) מייצר טוקן, שומר `users.reset_token` + `reset_token_expires_at` (שעה, `:1368-1370`), ושולח אימייל דרך Resend (`:1378`). תמיד מחזיר 200 (anti-enumeration, `:1365`). |
| `experience` | מה שנשלח כאן מיועד לפרסום באתר, אחרי בדיקה. | `frontend/components/ExperienceForm.jsx` — מעל כפתור השליחה | טבלת `experiences` (`models.py:1551`): כותרת, תיאור, תמונה, קטגוריה, תאריך/שעה, סוג מיקום, עיר, **כתובת (פרטית — רק בעלת החוויה ואדמין רואות, `:1578` הערה)**, מחיר, דרישות, סטטוס מודרציה. עובר בדיקת תוכן אוטומטית (Anthropic — מגולה ב-`privacy.sections.third_parties.items.anthropic` פריט 2). |
| `event` | מה שנשלח כאן מיועד לפרסום באתר, אחרי בדיקה. | `frontend/components/EventForm.jsx` — מעל כפתור השליחה | טבלת `events` (`models.py:1483`): כותרת, תיאור, תאריך/שעה, מיקום, עיר, lat/lng, תמונה, קטגוריה, מחיר, מקסימום משתתפות, קישור הרשמה. מוצג לציבור אחרי אישור העסק. |
| `category_request` | הבקשה נשלחת אלינו לעיון ואינה מתפרסמת באתר. | `frontend/components/CategoryRequestModal.jsx` — מעל כפתורי הפעולה | טבלת `category_requests` (`models.py:1993`): `requested_name`, `examples`, `producer_id` (nullable), סטטוס, הערות אדמין. נקרא רק ב-`GET /admin/category-requests` (`category_requests.py:66`). |

**תווית הקישור** בכל החמש: שימוש חוזר ב-`auth.register.consumer.terms.privacy_link` («למדיניות הפרטיות», `he.json:208`) — מחרוזת אחת לכל האתר, לא שורה שישית. הקישור פותח `/privacy` בלשונית חדשה (`CollectionNotice.jsx`).

**אנגלית** (`en.json`, אותם מפתחות) — תרגום נאמן, לא קופי חדש; «Anthropic» נשמר כשם. שער ה-parity (MEH-978, `__tests__/en-parity-guard.test.js`) ירוק.

**טסט** — `frontend/__tests__/CollectionNoticeApprovedCopy.test.jsx` מצמיד את חמש המחרוזות מילולית: ב-JSON וברינדור של כל משטח. שינוי בנוסח = הטסט אדום = הכרעת כלל 22, לא עריכת i18n.

---

## 3 · מלאי הנתונים — מה האתר שומר בפועל (grep, 03/09)

הטבלה הזאת היא **מה שהקוד עושה**, לא מה שהמדיניות אומרת. הפער ביניהם הוא החומר לעו"ד.

| טבלה (`backend/app/models/models.py`) | שדות אישיים | מי מוסר | מגולה ב-`/privacy`? |
|---|---|---|---|
| `users` (`:645`) | email, name, city, phone, google_id/apple_id, avatar_url, reset_token, email_verify_token, last_active_at, terms_accepted_at | המשתמשת, בהרשמה | כן — `sections.data.items.identity` |
| `producers` (`:54`) | פרטי העסק: שם, תיאור, כתובת, טלפון/וואטסאפ, קישורים, מספר רישיון, הצהרות תזונה/כשרות | בעלת העסק | כן — `sections.data.items.business` **(מספר רישיון והצהרות — לא נקובים במפורש; לא אומת שהניסוח מכסה)** |
| `contact_messages` (`:1626`) | name, email, message | הפונה | חלקית — `items.ugc` («פניות דרך טפסי יצירת קשר») |
| `newsletter_subscribers` (`:1618`) | email | הנרשמת | כן — `sections.why.items.notifications` («רק אם נרשמת») |
| `category_requests` (`:1993`) | requested_name, examples, producer_id | בעלת עסק | **לא נקוב** — מכוסה בשורת היידוע החדשה בלבד |
| `experiences` (`:1551`) · `events` (`:1483`) | תוכן לפרסום + **כתובת פרטית** בחוויות | בעלת עסק / מארחת | חלקית — `items.ugc`; הכתובת הפרטית לא נקובה |
| `producer_page_views` (`:1729`) | `viewer_ip_hash` (SHA-256 + salt מ-`settings.secret_key`, `services/analytics.py:158-168`), city (למשתמשת מחוברת), referrer, created_at | נאסף אוטומטית בכל צפייה | `items.technical` («כתובת IP») — **ה-hash אינו נקוב; ראו שאלה 5.3** |
| `producer_whatsapp_clicks` (`:1774`) | user_id (אם מחוברת), clicked_at, city | נאסף אוטומטית | `items.cookies` («לחיצות») |
| `alert_log` (`:1295`) | user_id, producer_id, channel, sent_at | נאסף אוטומטית | **לא נקוב** |
| `outreach_leads` (`:771`) | name, phone, instagram, website, city, notes | **אדמין, ממקורות פומביים — לא נושא המידע** | **לא** — ראו `outreach-leads-section-14.md` |
| צ'אט | תוכן ההודעה | המשתמשת | כן — `third_parties.items.anthropic` פריט 1. **לא נשמר אצלנו** (chat.py ללא DB). |

**צדדים שלישיים** (`privacy.sections.third_parties.items`, נקרא 03/09): Cloudinary · Google · Anthropic · Meta (WhatsApp Cloud API) · Resend · Sentry · Microsoft Clarity · PostHog · Vercel & Railway. הרשימה **תואמת** את הבדיקה של 01/09 בכרטיס. **לא אומת בסשן הזה** שאין ספק עשירי בקוד — הבדיקה של 01/09 היא המקור.

---

## 4 · מה עמוד הפרטיות כבר נושא מחמשת פריטי §11

| פריט §11 | איפה | הערה |
|---|---|---|
| וולונטריות + תוצאת אי-הסכמה | `privacy.sections.data.voluntary` + `auth.register.*.collection_notice` | קיים |
| מטרה | `privacy.sections.why.*` + השורה בנקודת האיסוף | קיים |
| למי נמסר | `privacy.sections.third_parties.*` + השורה (Anthropic נקוב בצ'אט) | קיים |
| זכות עיון §13 | `privacy.sections.rights.items.access` | קיים; מימוש באימייל, מענה תוך 30 יום (`rights.outro`) |
| זכות תיקון §14 | `privacy.sections.rights.items.rectify` | קיים |
| שם בעל השליטה + דרכי התקשרות | `privacy.sections.operator.*` (מפעילת האתר, שם מסחרי, אימייל `CONTACT_EMAIL`) | קיים. **הערה:** `operator_value` נוקב בשם פרטי; לא אומת שהוא הישות המשפטית הנכונה — שאלה 5.5 |

---

## 5 · שאלות לעו"ד (ההכרעה שלה = הכרטיס משתחרר)

1. **שכבתיות.** האם «שורה בנקודת האיסוף (מטרה + למי) + קישור לעמוד שנושא את השאר» מקיימת את §11 לכל אחד מחמשת המשטחים — ובפרט בצ'אט, שבו אין הרשמה ואין הסכמה קודמת?
2. **חריג המאגר הקטן** (מדריך, עמוד 6): האם מאגר המשתמשות נופל בחריג «שם, מען ודרכי התקשרות ≤100,000»? הערכתנו: **לא**, כי מאגר העסקים נושא מספרי רישיון, מיקום והצהרות. הכרעה משפטית.
3. **`viewer_ip_hash`** — SHA-256 מומלח, salt קבוע לפריסה (לא מסתובב, `analytics.py:160-168`). מידע אישי לצורך תיקון 13 («מזהה מקוון», מדריך עמוד 5)? התשובה קובעת גם את `retention-windows-draft.md`.
4. **«כשר» על עסק** — האם הצהרת כשרות של בית עסק היא «דעה דתית» של אדם (מידע בעל רגישות מיוחדת)? הערכתנו: לא — זו תכונה של עסק. הכרעה משפטית.
5. **בעל השליטה במאגר** — האם `privacy.sections.operator.operator_value` הוא הישות הנכונה (אדם פרטי / עוסק / חברה), והאם נדרשת כתובת פיזית ולא רק אימייל?
6. **שדות לא-נקובים** (§3 למעלה): `category_requests`, `alert_log`, כתובת פרטית בחוויות, מספר רישיון והצהרות של העסק, ה-hash — האם נדרש לנקוב בהם במפורש ב-`sections.data`, או שהקטגוריות הקיימות מכסות?
7. **ניידות** — `rights.items.portability` מבטיח «עותק בפורמט דיגיטלי נגיש». **לא אומת** שקיים מסלול ייצוא בקוד (לא נבדק בסשן הזה). אם אין — האם ההבטחה חייבת מימוש לפני השקה?

---

## 6 · מה מחוץ למסמך

* נוסח משפטי «מלוטש» לעמוד הפרטיות — שלב 4 בפיצול של 30/08, post-launch.
* באנר עוגיות — MEH-1950 (שאלת offset, לא שאלת נוסח).
* אבטחת מידע מתועדת — MEH-1959 (headers) ו-`docs/SECURITY.md`; לא נסקר כאן.
