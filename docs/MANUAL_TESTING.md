# מהמקור — Manual Testing Checklist
> עדכון: אפריל 2026 | מתעדכן אחרי כל PR

רשימת בדיקות ידניות על הסביבה החיה לפני שחרור לפרודקשן.
פורמט: `[ ] Test — איך לבדוק — תוצאה מצופה`

---

## Legal pages (אפריל 2026)

- [ ] /privacy — פתחי בדפדפן — מכיל "תיקון 13" ושם Cloudinary/Google
- [ ] /terms — פתחי בדפדפן — מכיל "חוק רישוי עסקים" ו-18+
- [ ] /contact — מלאי טופס ושלחי — התגובה "תודה! נחזור אליך בקרוב 🌿"
- [ ] /contact — אחרי שליחה — מגיע אימייל ל-`CONTACT_EMAIL` (`levismadar80@gmail.com`) עם שם/אימייל/הודעה בגוף, `From:` גם הוא `levismadar80@gmail.com` (לא spoofed)
- [ ] /contact — אחרי שליחה — יש שורה ב-`contact_messages` עם הערכים הנכונים (בדקי דרך `/admin` או `psql`)
- [ ] /contact — שלחי 6 פניות ברצף מאותה IP — השישית מחזירה 429
- [ ] /contact — זמני השבת של SMTP (או SMTP_USER ריק) — הטופס עדיין מחזיר 200 וה-DB שומר את השורה (fail-open)
- [ ] /accessibility — פתחי בדפדפן — מכיל תאריך עדכון ופרטי קשר
- [ ] Footer — גללי למטה — 4 לינקים: מדיניות / תנאי / נגישות / קשר
- [ ] Cookie banner — כנסי בחלון פרטי — מופיע עם 2 כפתורים
- [ ] "רק הכרחיים" — לחצי — banner נעלם, analytics לא נטען
- [ ] Producer registration — נסי לשלוח בלי checkboxes — כפתור disabled (גם checkbox הרישיונות וגם checkbox תנאי השימוש חובה)
- [ ] DirectoryDisclaimer — כנסי לדף יצרן — disclaimer מוצג מעל כפתור הדיווח
- [ ] DirectoryDisclaimer — גללי את גריד "מהמטבח של השכן" — כל כרטיסייה מציגה את ה-disclaimer בתחתית

---

## Security — POST /producers auth (PR #33)

- [ ] `curl -X POST /api/producers -d '{...}' -H "Content-Type: application/json"` ללא Authorization — 401
- [ ] אותה קריאה עם JWT תקף — 201, שורה חדשה ב-`producers` עם `status=pending`
- [ ] `pytest tests/test_api.py::TestProducers -v` על staging — כל 9 הבדיקות ירוקות כולל 4 החדשות: `test_post_producers_requires_auth`, `test_post_producers_rejects_invalid_token`, `test_post_producers_with_auth_creates_pending_producer`, `test_post_producers_with_blocked_user_fails`
- [ ] הזרימה הציבורית `POST /auth/register/producer` עדיין עובדת ללא אימות (לא הושפעה מהתיקון)

---

## Events (קהילה — אירועים מקומיים)

- [ ] /events — נטען עם פילטרים לפי עיר + תאריך
- [ ] /events/new — טופס עם 12 שדות בעברית (שם, תיאור, עיר, תאריך, שעה, מחיר, קיבולת, קטגוריה, תמונה, אימייל יצירת קשר, וואטסאפ, סוג אירוע)
- [ ] שלחי אירוע בדיקה — מגיע pending ב-/admin/events
- [ ] אשרי — מופיע ב-/events הציבורי
- [ ] "נשארו X מקומות" — מופיע כשנשאר מקום
- [ ] אימייל ל-`ADMIN_EMAIL` — מגיע כשמוגש אירוע חדש
- [ ] אימייל למארח — מגיע כשמאושר/נדחה

---

## Analytics — Producer + Admin dashboards (feature/producer-analytics, April 2026)

### Tracking infrastructure
- [ ] GET /producers/{id} — פתחי את עמוד היצרן פעם אחת — יש שורה חדשה ב-`producer_page_views` עם `viewer_ip_hash` שאינו null, `city` null (לא מחוברת), `referrer` null
- [ ] GET /producers/{id}?from=search — פתחי עם ה-param — שורה חדשה עם `referrer='search'`
- [ ] GET /producers/{id} עם Authorization header של משתמשת שלה city='תל אביב' — שורה חדשה עם `city='תל אביב'`
- [ ] `curl -H "User-Agent: Googlebot/2.1" /producers/{id}` — 200 תקין אבל **אין** שורה חדשה (bot filter)
- [ ] POST /producers/{id}/whatsapp-click — 200 + שורה ב-`producer_whatsapp_clicks`
- [ ] POST 11 קריאות ברצף מאותה IP — השישית עד ה-עשירית: 200; ה-11: 429 (rate limit 10/min)
- [ ] POST /producers/bad-uuid/whatsapp-click — 404, אין שורה

### Producer dashboard (/producer/dashboard)
- [ ] התחברי כיצרן — הדף מציג שם + כפתור זמינות היום + 6 כרטיסיות סטטיסטיקה + 2 תרשימים + 3 quick links
- [ ] כרטיסיית "צפיות בפרופיל" מציגה 3 מספרים: `last_7d / last_30d / total`
- [ ] כרטיסיית "הופעות בחיפוש" מציגה את אותו פורמט (רק צפיות עם `referrer='search'`)
- [ ] כרטיסיית "לחיצות ווטסאפ" מציגה 3 מספרים מ-`producer_whatsapp_clicks`
- [ ] כרטיסיית "עוקבות" מציגה את הספירה הכללית + `+X השבוע`
- [ ] כרטיסיית "דירוג ממוצע" מציגה מספר עם decimal + "מתוך X ביקורות"
- [ ] כרטיסיית "מוצרים פעילים במטבח" סופרת רק home_products של **המשתמשת המחוברת** עם `is_active=true`
- [ ] תרשים "צפיות ב-30 הימים האחרונים" — SVG line chart עם 30 נקודות, תוויות תאריך בהתחלה/אמצע/סוף
- [ ] תרשים "ערים מובילות" — horizontal bars עד 5 ערים; אם אין נתונים מציג טקסט fallback
- [ ] לחיצה על WhatsApp בעמוד יצרן (לא משלך) — ב-Network tab רואים POST /whatsapp-click sendBeacon נשלח לפני פתיחת חלון wa.me
- [ ] חזרה ל-/producer/dashboard — ספירת whatsapp_clicks עלתה ב-1

### Admin dashboard (/admin)
- [ ] סה״כ תצוגה: 4 stat cards ראשיים + 4 משניים (new_users_this_week, new_producers_this_week, total_events, total_experiences) + alert cards + 2 גרפים + פאנל בריאות שרת + פעילות
- [ ] "DAU — 30 ימים אחרונים" — line chart עם 30 נקודות, מבוסס `users.last_active_at`
- [ ] ערים מובילות (עד 10) — מצטבר מ-`producer_page_views.city` על פני **כל** היצרנים
- [ ] פאנל בריאות שרת מציג `response_time_avg_ms` ו-`requests_per_minute` + הערה "per-process בזיכרון"
- [ ] על בוט עם traffic בסיסי (curl /producers), ספירת `sample_count` עולה, avg וכו׳ מתעדכנים
- [ ] אחרי redeploy של Railway — הפאנל מתאפס (ok)

### Sidebar pending moderation badge
- [ ] צרי יצרנית חדשה עם status=pending + דיווח פתוח אחד + מוצר ביתי FLAGGED אחד + חוויה pending אחת
- [ ] /admin/dashboard — כרטיסיות alerts מפרטות את ה-4
- [ ] ב-sidebar על "לוח מחוונים" מופיע pill צהוב עם המספר 4
- [ ] מעבר ל-/admin/producers, ה-badge עדיין מופיע עם 4 (ה-layout טוען מחדש על כל שינוי pathname)
- [ ] אישור כל ה-4 → הרענון הבא: ה-badge נעלם

### Privacy invariant
- [ ] `SELECT viewer_ip_hash FROM producer_page_views LIMIT 10` — כל הערכים הם hex 64-תווים (SHA-256), אף אחד לא נראה כמו כתובת IP
- [ ] `SELECT column_name FROM information_schema.columns WHERE table_name='producer_page_views'` — אין עמודה `viewer_ip` בלי hash

---

## Experiences (קהילה — חוויות קולינריות)

> Experiences are **different** from Events: they go through a two-step
> moderation flow (Claude Haiku pre-check → admin approval) instead of
> a simple admin approval. The admin UI is a separate page at
> `/admin/experiences` with 5 tabs for each moderation state.

- [ ] /experiences — נטען עם פילטרים
- [ ] /experiences/new — טופס זמין למשתמשים מחוברים (ולא לאנונימיים)
- [ ] שלחי חוויה בדיקה — נכנסת ל-Claude Haiku pre-check; אם pass → `pending` ב-/admin/experiences; אם fail → `changes_requested` עם הסבר מהמודל
- [ ] /admin/experiences — 5 טאבים: "ממתינות לאישור" / "דרוש תיקון" / "מאושרות" / "נדחו" / "הכל"
- [ ] אשרי חוויה — מופיעה ב-/experiences הציבורי
- [ ] "בקשי שינויים" — אימייל למארח עם ההערות שלך מה-modal
- [ ] "דחי" — אימייל למארח עם סיבת הדחייה
- [ ] Claude Haiku לא זמין (ANTHROPIC_API_KEY ריק) — החוויה עוברת ישירות ל-`pending` (fail-open), הגשה לא נכשלת

---

## איך לעדכן מסמך זה
אחרי כל PR שמוסיף פיצ׳ר/עמוד חדש:
1. הוסיפי סקציה חדשה או הרחיבי קיימת בפורמט `[ ] Test — איך — מצופה`.
2. שימרי את הבדיקות קצרות — פעולה אחת, תוצאה אחת.
3. סמני ✅ רק אחרי שרצה הבדיקה על staging/production.
