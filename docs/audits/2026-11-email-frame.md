# תבניות המייל: המסגרת

> נמדד 17/11/2026. **11 תבניות HTML**, ועוד 17 אתרי שליחה בטקסט בלבד (שם RTL,
> פלטה ונייד לא רלוונטיים). כל המיילים עוברים דרך
> `backend/app/services/email.py::send_email` ל-Resend.

---

## ארבעת הצירים שנבדקו

| ציר | לפני | אחרי |
|---|---|---|
| ‏**RTL** | ‏10 מתוך 11 עם `dir="rtl" lang="he"` על `<html>` | 11 מתוך 11 |
| ‏**viewport** | ‏**4 מתוך 11.** שבע תבניות עם `<head><meta charset="UTF-8"></head>` ותו לא | 11 מתוך 11 |
| ‏**פלטה** | ‏**55 ערכי צבע מחוץ ל-`tailwind.tokens.json`** | 0 |
| ‏**קישורים** | כולם נבנים מ-`settings.frontend_url`; אף תבנית לא מקבעת host | ללא שינוי — זה כבר היה נכון |

### ‏viewport — למה זה נראה

בלי `<meta name="viewport">` לקוח מייל בטלפון מרנדר ברוחב שולחני ומכווץ. שבע
תבניות (שש ב-`auth_emails.py` ואחת ב-`report_info.py`) נשלחו ככה, בעוד חמש
תבניות חדשות יותר כן נשאו את התג. זו לא החלטה — זו סחיפה: מי שכתב את החדשות ידע,
ומי שתחזק את הישנות לא.

### נייד — ‏`cellpadding="40"`

אותן שבע תבניות עטפו כרטיס `width="100%"` ב-`cellpadding="40"`, כלומר **80px
ריפוד צדדי**, ועוד `padding:32px 0` על העוטף — כך שהכרטיס נוגע בקצה המסך וטקסט
מקבל כ-280px מתוך 360. התבניות החדשות יותר משתמשות ב-`padding:24px 12px` בחוץ
ו-`padding` פנימי. ‏10 מופעים יושרו לדפוס החדש. **CSS בלבד.**

### פלטה — המיפויים

נגזרים מ-`frontend/tailwind.tokens.json`, לטוקן הקרוב ביותר:

| היה | הפך ל | הטוקן |
|---|---|---|
| `#3a3a3a` | `#1C1A17` | `text` |
| `#666` · `#888` · `#8a8478` | `#5C584F` | `fg-muted` |
| `#999` | `#6B6860` | `muted` |
| `#eee` · `#e5e0d8` · `#efeae0` | `#E5DFD3` | `border` |
| `#fffefb` | `#FFFFFF` | לבן |

**‏`#8a8478` הוא לא רק מחוץ לפלטה — הוא נכשל בניגודיות.** כ-3.3:1 על
`#F5F0E8`, מתחת לרף 4.5:1. הוא הופיע בשורת החתימה של ארבע תבניות.
‏`#e5e0d8` ו-`#efeae0` הם near-miss של `#E5DFD3`: שלושה גוונים כמעט זהים של אותו
קו גבול, שאיש לא התכוון שיהיו שלושה.

### ‏`rescue_no_show` — המייל היחיד בלי מסגרת

הוא פלט `<div dir="rtl" style="font-family:Arial">` ותו לא: בלי `<html>`, בלי
viewport, בלי תקרת רוחב, עם טקסט בגודל ברירת המחדל. בטלפון הוא נראה כמו טקסט
חשוף לרוחב המסך בזמן שאחיו נראו כמו כרטיס. עכשיו הוא קורא ל-`_shell` של
`registration_emails.py` — **אותו shell, לא העתק**. המחרוזות לא השתנו; רק
המסגרת. בדרך הוא גם קיבל את הלוגו, שלא היה לו.

---

## הבדיקה

`tests/test_meh0000_email_frame.py` — ארבעה צירים, parametrized על כל קובץ עם
מסמך HTML ב-`backend/app`. הוא **קורא קוד מקור ולא מרנדר**, אותה צורה
ש-`test_email_logo.py:221` כבר קבעה כאן.

**הודגם נכשל** (MEH-1619) מול התבניות שלפני התיקון:

```
failures by check: {palette: 7, viewport: 2}
total: 9
```

ואחרי: `0`.

**הבקרות — שתיים, ושתיהן חובה:**

1. ‏`test_the_scan_found_the_templates_at_all` רץ ראשון. כל שאר הטענות הן על
   קבוצה, ורשימת קבצים ריקה מספקת בבת אחת את «אף תבנית לא חסרה viewport» ואת
   «אף צבע לא מחוץ לפלטה». זה בדיוק «probe שהפלט הריק שלו הוא גם הפלט המרגיע»
   מ-`.claude/rules/testing.md`.
2. ‏`test_prose_about_markup_is_not_markup` נועל רגרסיה **בבדיקה עצמה**. הריצה
   הראשונה שלה דיווחה על `rescue_no_show.py` כמסמך HTML בלי `<head>` — וההתאמה
   היחידה הייתה **הערה** שכתבתי באותו קובץ, שאומרת שלמייל לא היה `<html>`.
   בדיקה שמדווחת על התיעוד של עצמה היא בדיקה שלומדים להתעלם ממנה.

**מה שעבר בשתי הריצות:** ציר ה-RTL וציר הקישורים. שניהם כבר היו נכונים, והבדיקה
לא לוקחת עליהם קרדיט.

---

## מחכה לספיר — פגם שלא הצלחתי לתקן

**‏`FRONTEND_URL` לא נכשל-סגור בפרודקשן, ואני חסומה מלתקן את זה.**

`backend/app/config.py:131` — `frontend_url: str = "http://localhost:3000"`.
זה המקור **היחיד** לכל קישור בכל מייל (`email_branding.py:25`, ו-
`f"{settings.frontend_url}/..."` בכל אתר שליחה). אם המשתנה ב-Railway אי פעם לא
יוגדר בפרודקשן, כל קישור לאיפוס סיסמה, כל קישור אימות, כל הזמנת בעלים והלוגו
עצמו יצביעו ל-localhost.

השומר היחיד, `_check_frontend_url_consistency` ב-`startup.py:73-101`, **כותב
WARNING וחוזר**. הוא לא יכול לעצור deploy. הוא גם לא יורה כש-env לא מוגדר, והוא
מקבל `https://mehamakor.online` בפרודקשן בלי להתלונן, בעוד ש-CLAUDE.md קובע
`mehamakor.co.il` כדומיין הקנוני.

**ניסיתי פעמיים לערוך את `config.py` ונחסמתי** (פעם דרך shell, פעם דרך כלי
העריכה: «File is in a directory that is denied»). לפי כלל 32b — לא עוקפים דחייה
דרך פועל אחר. אז הנה הקוד, להוספה בסוף `_load_settings`, מיד לפני `return s`,
באותה צורה ומאותו נימוק כמו השומר של `SUPER_ADMIN_EMAIL` שנמצא שם כבר:

```python
    _frontend_url = s.frontend_url.strip()
    if _is_production and (
        not _frontend_url
        or "localhost" in _frontend_url
        or "127.0.0.1" in _frontend_url
        or "staging" in _frontend_url.lower()
    ):
        raise RuntimeError(
            "FRONTEND_URL must be the production site in production — it is "
            f"{_frontend_url or '(empty)'!r}. Every link in every email is "
            "built from it, so a localhost or staging value sends customers "
            "there. Set it on the Railway production environment."
        )
```

נכשל-סגור בטוח כאן מאותה סיבה שכתובה ליד השומר הקיים: Railway ממשיכה להגיש את
ה-deployment הקודם כשחדש נכשל ב-healthcheck, ולכן זה חוסם deploy רע ולא מפיל את
האתר.

**הערה נפרדת:** `routers/admin_decisions.py:406` מכיל הערה מיושנת —
«On prod frontend_url == mehamakor.online». הערה בלבד, לא קוד.

---

## מה **לא** נבדק

* **איך זה נראה בפועל בתוכנות מייל.** זה פריט מוכר ב-MEH-3083 («בדיקת תצוגה של
  המיילים»), והוא אחרי ההשקה. כל מה שכאן נמדד מהמקור, לא מ-Gmail או מ-Outlook.
* **הערכים החיים ב-Railway.** ה-sandbox לא מגיע לשם.
* **גדלי גופן מתחת ל-14px** — 11px ו-12px בשורות footer ובקישורי גיבוי. זו
  החלטת עיצוב, לא הפרת כלל, ולכן לא נגעתי.
