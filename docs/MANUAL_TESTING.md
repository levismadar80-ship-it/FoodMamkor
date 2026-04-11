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
