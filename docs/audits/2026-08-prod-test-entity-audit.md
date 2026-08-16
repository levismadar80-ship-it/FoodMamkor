# אודיט read-only — ישויות בדיקה ב-production DB לפני launch

> **נמדד 2026-08-11** מול `https://mehamakor.co.il/api` — **GET בלבד, אפס כתיבות.**
> מקור הכרטיס: MEH-1992 (מ-MEH-1189 שורה 2). Phase 0 חובה: MEH-1967.

---

## התשובה בשורה אחת

**כן — וזה כל הקטלוג.** כל **5** בתי העסק המאושרים ב-production הם fixtures מ-`backend/seed_data.py`.
אין ולו בית עסק אמיתי אחד. חמשת השמות מתאימים ל-`TEST_NAME_PATTERNS` של ה-seeder — כלומר הם
ישויות בדיקה **לפי ההגדרה של הריפו עצמו**, לא לפי שיפוט שלי.

**מה שהאודיט הזה לא יכול לומר:** האם קיימות ישויות בדיקה **לא-מאושרות** (pending/rejected), או
מחוץ לטבלת `producers`. ה-API הציבורי חושף approved בלבד. זה פער שנסגר רק מול ה-DB — §5.

---

## 1 · סימון מקור לכל טענה

הכרטיס דורש שכל טענה תסומן: MEH-1967 / staging / production. הטבלה הזו היא החוזה.

| # | טענה | מקור | איך אומת |
|---|---|---|---|
| T1 | 5 עסקים מאושרים ב-production, כולם fixtures | **production** | הרצתי מחדש היום את `scripts/checks/data-readiness.py` (GET בלבד) |
| T2 | ה-slugs הם בדיוק חמשת ה-slugs של `seed_data.py` | **production** + repo | השוואת קבוצות, §3 |
| T3 | חמשת השמות תפוסים ע"י `TEST_NAME_PATTERNS` | repo (`seed_demo_producers.py:79-91`) | קריאה, ללא הרצה |
| T4 | `golan-cheese` מאושר אך לא בקטלוג (`on_vacation`) | **production** | `/producers/count`=5 מול `/producers`=4 |
| T5 | הממצא זהה לדוח MEH-1967 מ-09/08 | **production** (מדידה חוזרת) | diff על סט השורות — זהה |
| T6 | ‏"בדיקת UX", "מטבח הבית", "מהמקור" נצפו ב-staging 13/07 | **staging** | MEH-1189, לא אומת מחדש כאן |
| T7 | אין ישויות בדיקה לא-מאושרות ב-production | **לא ידוע** | ה-API לא חושף אותן — §5 |

> **T7 היא השורה החשובה.** היעדר תוצאה ב-API הציבורי אינו ראיה להיעדר שורה ב-DB:
> listing מעיד על **נוכחות**, לעולם לא על **היעדר** (CLAUDE.md, "Known Bug Patterns").

---

## 2 · Phase 0 — מה MEH-1967 כן ולא ענה

הכרטיס מורה לקרוא את MEH-1967 במלואו לפני כל שאילתה, ולעצור אם הוא כבר עונה.

**הוא עונה — חלקית, ובאופן שלא היה מתוכנן.** MEH-1967 נכתב על **שלמות דטה**, לא על ישויות
בדיקה; גוף הכרטיס אף מפריד בינו לבין MEH-1189 מפורשות. אבל ה-deliverable שלו
(`docs/reports/data-readiness-2026-08-09.md`) רץ מול `DEFAULT_BASE_URL = "https://mehamakor.co.il/api"`
— **production** — ומנה כל עסק מאושר עם עמודת `מקור` שמסווגת `fixture` מול `אמיתי`. זו בדיוק
הראיה הפר-שורתית שהכרטיס הזה ביקש, שהופקה כתוצר לוואי של שאלה אחרת.

**למה בכל זאת הרצתי מדידה ולא הסתפקתי בקובץ:** הדוח נושא as-of של 09/08, והיום 11/08.
artifact שנוצר בקפדנות נושא **אמינות, לא עדכניות** — ושחזור מחזיר את הראשונה בלבד
(`.claude/rules/testing.md`, "Restoring an old artifact is not ratification"). ההרצה החוזרת
היא GET בלבד ולכן בתוך גדר ה-read-only. **התוצאה: סט השורות זהה** — כלומר הדוח של 09/08 עדיין
תקף, וזה נמדד ולא הונח.

---

## 3 · הראיה — כל שורה מאושרת ב-production (11/08)

| # | שם | slug | עיר | מקור | מאושר | בקטלוג |
|---|---|---|---|---|---|---|
| 1 | גבינות הר הגולן | `golan-cheese` | קצרין | **fixture** | ✓ | ❌ (`on_vacation`) |
| 2 | טבע פור - סבונים ושמנים | `teva-pure` | זכרון יעקב | **fixture** | ✓ | ✓ |
| 3 | מאפיית המחמצת של דנה | `dana-sourdough` | תל אביב | **fixture** | ✓ | ✓ |
| 4 | תסס - מותססים טבעיים | `tases-ferments` | ירושלים | **fixture** | ✓ | ✓ |
| 5 | חוות הגליל - בשר אורגני | `galil-farm` | כרמיאל | **fixture** | ✓ | ✓ |

**עסקים אמיתיים: 0 מתוך 5.**

`id` ו-`created_at` אינם בטבלה כי ה-API הציבורי אינו מחזיר אותם. הם ב-§5.

### 3.1 · הסיווג אינו שיפוט שלי — הוא של הריפו

שני מקורות בלתי-תלויים בקוד, שניהם נקראו ולא הורצו:

**(א) התאמת slugs מלאה.** חמשת ה-slugs שה-API מחזיר זהים לחמשת ה-slugs ב-`backend/seed_data.py`:
`galil-farm · golan-cheese · dana-sourdough · tases-ferments · teva-pure`. חיתוך = 5, הפרש = 0.

**(ב) חמשת השמות תפוסים ע"י `TEST_NAME_PATTERNS`** (`backend/scripts/seed_demo_producers.py`) —
הרשימה שה-seeder עצמו משתמש בה כדי לזהות "עסקי בדיקה שהצטברו" ל-`--reset`:

| שם ב-production | ה-substring שתופס אותו |
|---|---|
| גבינות הר הגולן | `גבינות הר הגולן` |
| טבע פור - סבונים ושמנים | `טבע פור` |
| מאפיית המחמצת של דנה | `מאפיית המחמצת` |
| תסס - מותססים טבעיים | `תסס` |
| חוות הגליל - בשר אורגני | `חוות הגליל` |

**5/5.** כלומר: אילו מישהו היה מריץ `--reset` מול production, הוא היה מוחק את כל הקטלוג.
(לא הורץ. אסור. מצוין כאן כמדד לחומרה, לא כהצעה.)

### 3.2 · מונחי החיפוש של הכרטיס — מה נמצא ומה לא

| מונח | בין המאושרים ב-production | הערה |
|---|---|---|
| `תסס` | ✅ **נמצא** — `tases-ferments` | fixture |
| `מטבח הבית` | ❌ לא נמצא | ב-`TEST_NAME_PATTERNS`; נצפה ב-staging (T6) |
| `בדיקת UX` | ❌ לא נמצא | ב-`TEST_NAME_PATTERNS`; נצפה ב-staging (T6) |
| `מהמקור` | ❌ לא נמצא | ב-`TEST_NAME_PATTERNS` |
| `claude` / `משק דוגמה קלוד` | ❌ לא נמצא | ב-`TEST_NAME_PATTERNS` |
| `demo` | ❌ לא נמצא | — |
| `test` | ❌ לא נמצא | — |

**כל ❌ בטבלה הזו חל על שורות מאושרות בלבד** ואינו ראיה להיעדרן מה-DB. ראו T7 ו-§5.

---

## 4 · חומרה ל-launch

הכרטיס מנסח את הסיכון: *"עסק בדיקה גלוי ב-launch = פגיעת אמון ישירה בכל ה-LOCK של אישור ידני לכל עסק."*

המצב בפועל חמור יותר מהניסוח: **זה לא עסק בדיקה אחד בין אמיתיים — זה הקטלוג כולו.**
ארבעה מהם מוגשים כרגע ל-`/producers` בפרודקשן. בנוסף, `ADMIN_NOTE` של ה-seeder אומר במפורש
*"STAGING ONLY: never promote/import this row to production"* — כלומר שורות שנושאות את הכוונה
הזו נמצאות בדיוק במקום שהיא אוסרת.

**זה דוח. המחיקה אינה שלי** — היא של ספיר, דרך פאנל האדמין, שורה-שורה (MEH-409 מחזיק את נתיב
המחיקה של ה-flagship). האודיט לא מציע סקריפט ניקוי, ובכוונה.

---

## 5 · הפער שנשאר — ומה בדיוק ספיר צריכה להריץ

**גישה ל-production DB היא credential של ספיר, לא באג הרשאות.** לא ניסיתי לעקוף אותה ולא
הסקתי מצב prod מ-staging. ה-API הציבורי חושף `approved` בלבד, ולכן שלושה חורים נשארים פתוחים:
שורות `pending`/`rejected`, טבלאות שאינן `producers`, ו-`id`/`created_at`.

**SELECT בלבד. אפס mutations.** להרצה מול production:

```sql
-- (1) כל שורת producers שנתפסת ע"י דפוסי הבדיקה — בכל סטטוס
SELECT id, name, slug, status, created_at
FROM producers
WHERE name ILIKE ANY (ARRAY[
        '%יצרן לדוגמה%','%מסונן%','%מהמקור%','%בדיקת UX%','%משק דוגמה קלוד%',
        '%מטבח הבית%','%טבע פור%','%חוות הגליל%','%גבינות הר הגולן%',
        '%מאפיית המחמצת%','%תסס%','%demo%','%test%','%claude%'
      ])
   OR slug IN ('galil-farm','golan-cheese','dana-sourdough','tases-ferments','teva-pure')
ORDER BY status, created_at;

-- (2) התפלגות סטטוסים — הבקרה. אם (1) מחזיר אפס ו-(2) מחזיר אפס, הבדיקה עצמה לא רצה.
SELECT status, COUNT(*) FROM producers GROUP BY status ORDER BY 2 DESC;

-- (3) משתמשים שנוצרו לבדיקה
SELECT id, email, role, created_at
FROM users
WHERE email ILIKE '%test%' OR email ILIKE '%demo%'
   OR email ILIKE '%example.com' OR email ILIKE '%claude%'
ORDER BY created_at;

-- (4) תוכן תלוי — כמה שורות ייפגעו אם עסק יימחק
SELECT p.slug, COUNT(pr.id) AS products
FROM producers p LEFT JOIN products pr ON pr.producer_id = p.id
WHERE p.slug IN ('galil-farm','golan-cheese','dana-sourdough','tases-ferments','teva-pure')
GROUP BY p.slug ORDER BY 2 DESC;
```

**שאילתה (2) היא בקרה, לא סקרנות.** `אפס שורות` מ-(1) מיוצר בשני עולמות — *אין ישויות בדיקה*,
ו*השאילתה לא רצה / רצה מול DB אחר*. (2) מפריד ביניהם: ב-DB חי הוא **חייב** להחזיר שורות.
אם (2) שקט, כל אפס אחר בריצה הזו חסר ערך. (`.claude/rules/testing.md` — "A probe whose null
output is also its reassuring output is not evidence".)

---

## 6 · שחזור

```
python scripts/checks/data-readiness.py                      # ברירת מחדל = production, GET בלבד
python scripts/checks/data-readiness.py --self-test          # אימות המסווג
```

הסקריפט נכשל בקול אם `backend/seed_data.py` אינו נקרא או מתפרסר לאפס slugs — כלומר סיווג-יתר של
fixtures כ"אמיתיים" אינו יכול לקרות בשקט. זה תנאי שנקרא ואומת בקוד (`seed_slugs()`), לא הונח.

## 7 · מה לא נעשה

- ❌ לא הורץ `seed_demo_producers.py` — לא עם `--reset`, לא עם `--confirm`, בשום סביבה
- ❌ אפס `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE`
- ❌ אפס `alembic upgrade` / `downgrade` / `stamp`
- ❌ לא נמחקה ולא שונתה שום שורה
- ✅ הקובץ היחיד שנוצר הוא הדוח הזה
