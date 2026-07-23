# מהמקור — גיבוי ושחזור Postgres (Railway)

> **גיבוי שלא שוחזר פעם אחת = לא קיים.** המסמך הזה הוא הצ'קליסט: איך מוודאים
> שיש גיבוי, איך מגבים ידנית, ואיך מריצים restore drill שמוכיח שהגיבוי שמיש.
> קהל: ספיר, טרמינל Windows/MINGW (Git Bash).
>
> **Alembic הוא הסמכות היחידה לשינויי סכמה** ([MEH-267](./MIGRATIONS.md)) — ה-runbook
> הזה לא מציע עריכות schema, רק `dump` / `restore`. שחזור מחזיר את המצב שהיה
> בגיבוי; מיגרציות מתקנות סכמה, גיבויים מתקנים data.
>
> **אזהרת credentials:** כל הפקודות למטה משתמשות ב-`$DATABASE_URL` בלבד — לעולם
> אל תדביקי URL אמיתי או סיסמה לתוך המסמך, ל-shell history, או ל-PR. קבלי את
> ה-URL מ-Railway בזמן ריצה (ראו §2).

---

## 1 · בדיקת automatic backups ב-Railway

Railway מריצה snapshots אוטומטיים על ה-Postgres volume. לוודא שהם פעילים:

1. בדשבורד Railway → הפרויקט `believable-tenderness` → בחרי את שירות ה-Postgres.
2. תחת שירות ה-Postgres, בטאב הגיבויים/Backups — ודאי שה-automatic backups
   מסומנים כפעילים ושמופיע לפחות snapshot אחד עם timestamp עדכני.
3. **Retention:** ודאי מהי מדיניות השמירה (כמה snapshots / כמה ימים אחורה)
   ורשמי אותה. אם אין snapshot מהשבוע האחרון — זו התראה, לא "בסדר".

> אם שם המסך המדויק ב-Railway UI שונה — חפשי תחת שירות ה-Postgres את הקטע
> שמציג snapshots/backups. אל תסתמכי על "כנראה מופעל" — ודאי snapshot ממשי עם
> תאריך.

**מה זה מכסה ומה לא:** snapshots של Railway מגנים מפני אובדן volume ומאפשרים
point-in-time restore בגבול ה-retention. הם **לא** מחליפים dump ידני לפני
שינוי מסוכן (§2), ולא מוכיחים שהשחזור עובד — רק drill מוכיח (§3).

---

## 2 · Manual dump (גיבוי ידני לפני שינוי מסוכן)

לפני migration מסוכן, seed גדול, או כל פעולה שעלולה לאבד data — קחי dump ידני.

```bash
# 1. קבלי את ה-DATABASE_URL של הסביבה מ-Railway (Variables של שירות ה-Postgres),
#    והכניסי אותו למשתנה סביבה בטרמינל שלך בלבד — לא לקובץ, לא ל-git.
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DBNAME"   # placeholder — הדביקי את האמיתי בטרמינל

# 2. dump בפורמט custom (-Fc) — דחוס וניתן ל-pg_restore סלקטיבי.
#    שם הקובץ כולל תאריך כדי לא לדרוס גיבוי קודם.
pg_dump "$DATABASE_URL" -Fc -f "mehamakor_$(date +%Y%m%d_%H%M%S).dump"

# 3. ודאי שהקובץ נוצר ואינו ריק.
ls -lh mehamakor_*.dump
```

> **לעולם אל תשמרי את קובץ ה-dump או את ה-URL בתוך הריפו.** ה-dump מכיל data
> אמיתי (מיילים, טלפונים) — שמרי אותו מחוץ ל-git, במקום מוצפן/פרטי.
>
> אחרי סיום העבודה: `unset DATABASE_URL` כדי לא להשאיר את ה-URL בסביבת הטרמינל.

---

## 3 · Restore drill (ההוכחה שהגיבוי שמיש)

drill = שחזור של גיבוי ל-DB **זמני** (לא production, לא staging) + הרצת שאילתות
אימות. זה הצעד שהופך "יש לנו גיבוי" ל-"הגיבוי עובד".

```bash
# 1. הרימי DB זמני מקומי (Docker) — לא נוגעים ב-Railway.
docker run --rm -d --name mm_restore_drill \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mehamakor_drill \
  -p 5433:5432 postgres:15

# 2. שחזרי את ה-dump מ-§2 ל-DB הזמני.
export DRILL_URL="postgresql://postgres:postgres@localhost:5433/mehamakor_drill"
pg_restore --no-owner --no-acl -d "$DRILL_URL" mehamakor_YYYYMMDD_HHMMSS.dump

# 3. שאילתות אימות — הן ה-Definition of Done של ה-drill.
```

**אימות א' — ספירת טבלאות.** חייבת להתאים ל-`EXPECTED_TABLES` שב-CI gate
(`.github/workflows/pr-checks.yml`, job "Verify alembic schema"). **נכון לכתיבת
המסמך: 38.** ה-CI gate הוא ה-source of truth — אם הוא עודכן (נוספה/נמחקה
טבלה), עדכני את המספר כאן לפי הערך שם, לא להיפך.

```bash
psql "$DRILL_URL" -tAc \
  "SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema='public'
     AND table_type='BASE TABLE'
     AND table_name <> 'alembic_version';"
# מצופה: 38 (או הערך הנוכחי של EXPECTED_TABLES ב-pr-checks.yml)
```

**אימות ב' — data אמיתי קיים.** הטבלאות המרכזיות חייבות להחזיר count > 0
(גיבוי ריק = data-drift כמו ב-[MEH-1349](https://linear.app/mehamakor/issue/MEH-1349)):

```bash
psql "$DRILL_URL" -tAc "SELECT COUNT(*) FROM producers;"   # מצופה: > 0
psql "$DRILL_URL" -tAc "SELECT COUNT(*) FROM users;"       # מצופה: > 0
psql "$DRILL_URL" -tAc "SELECT COUNT(*) FROM reviews;"     # מצופה: > 0
```

```bash
# 4. ניקוי — הפילי את ה-DB הזמני.
docker stop mm_restore_drill
unset DRILL_URL
```

**ה-drill נחשב מוצלח רק אם:** `pg_restore` הסתיים ללא שגיאות, ספירת הטבלאות =
`EXPECTED_TABLES`, ושלוש הספירות > 0. תעדי תוצאה + תאריך ב-Chunk 2 של
[MEH-1442](https://linear.app/mehamakor/issue/MEH-1442).

---

## 4 · תדירות

| מתי | פעולה |
|---|---|
| לפני כל migration מסוכן / seed גדול | manual dump (§2) |
| **חודשי — עד ההשקה** | restore drill מלא (§3) + תיעוד תוצאה + תאריך |
| אחרי ההשקה | drill רבעוני (או אחרי כל שינוי סכמה מרכזי) |

drill שלא תועד = drill שלא קרה. רשמי תאריך + תוצאה כל פעם.

---

## 5 · Disaster scenarios — הצעד הראשון

| תרחיש | צעד ראשון |
|---|---|
| **מחיקת data בטעות** (DELETE/TRUNCATE שגוי, seed שדרס) | אל תריצי כלום נוסף על ה-DB. קחי dump של המצב הנוכחי (§2), ואז שחזרי את ה-snapshot האחרון מ-Railway (§1) ל-DB זמני, אמתי (§3), ורק אז החליטי על point-in-time restore. |
| **Migration שגוי** (סכמה נשברה) | `alembic downgrade -1` ידנית דרך Railway Shell ([MIGRATIONS.md → Rollback](./MIGRATIONS.md)). אם ה-data נפגע ולא רק הסכמה — שחזרי מ-snapshot כמו בתרחיש המחיקה. |
| **Railway outage** (השירות למטה) | בדקי [status.railway.app](https://status.railway.app). זו לא בעיית data — אין מה לשחזר. אל תריצי restore בזמן outage. חכי לחזרת השירות, ואז ודאי ש-`GET /health` של ה-backend חוזר 200. |

---

## קישורים

- [docs/MIGRATIONS.md](./MIGRATIONS.md) — Alembic, rollback, ה-CI drift gate + `EXPECTED_TABLES`
- [MEH-265](https://linear.app/mehamakor/issue/MEH-265) — post-mortem schema/data drift (הרציונל)
- [MEH-1263](https://linear.app/mehamakor/issue/MEH-1263) / [MEH-1349](https://linear.app/mehamakor/issue/MEH-1349) — data drift ב-staging (ה-evidence)
