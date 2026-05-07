# מהמקור — מדריך מיגרציות (Alembic)

> **Baseline:** `ef8fb1858f5b` — 34 טבלאות (ללא `alembic_version`). מוטמע על staging ו-production.
> **Alembic הוא הסמכות היחידה לשינויי סכמה.** `Base.metadata.create_all` הוסר מ-boot path ב-MEH-267.

---

## הוספת עמודה חדשה

```bash
cd backend

# 1. הוסיפי את השדה ב-ORM (backend/app/models/models.py)
#    לדוגמה: new_field = Column(String, nullable=True)

# 2. צרי revision אוטומטי
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mehamakor_dev \
  .venv/bin/alembic revision --autogenerate -m "add_new_field_to_producers"

# 3. בדקי את הקובץ שנוצר ב-backend/alembic/versions/
#    ודאי שה-upgrade() + downgrade() נכונים לפני הֶמשך

# 4. החלי מקומית
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mehamakor_dev \
  .venv/bin/alembic upgrade head

# 5. בדקי שהסכמה תואמת
psql -h localhost -U postgres -d mehamakor_dev -c "\d producers"
```

> **חשוב:** תמיד הוסיפי `nullable=True` לעמודות חדשות על טבלאות קיימות — NOT NULL ללא ברירת מחדל ייכשל על שורות קיימות.

---

## בדיקה מקומית לפני PR

```bash
cd backend

# Reset מלא + upgrade מאפס — מדמה את ה-CI gate
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mehamakor_dev \
  .venv/bin/alembic downgrade base

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mehamakor_dev \
  .venv/bin/alembic upgrade head

# ודאי שהגעת ל-revision הנכון
psql -h localhost -U postgres -d mehamakor_dev \
  -tAc "SELECT version_num FROM alembic_version;"
```

ה-CI gate (`.github/workflows/pr-checks.yml`) עושה בדיוק את זה על Postgres טרי — אם לא עובד מקומית, לא יעבור ב-CI.

---

## Rollback (downgrade)

```bash
cd backend

# חזרה revision אחד אחורה
DATABASE_URL=postgresql://... .venv/bin/alembic downgrade -1

# חזרה ל-revision ספציפי
DATABASE_URL=postgresql://... .venv/bin/alembic downgrade ef8fb1858f5b

# בדיקת ה-revision הנוכחי
DATABASE_URL=postgresql://... .venv/bin/alembic current
```

**Rollback ב-Railway (production / staging):**
1. Deploy גרסה קודמת של הקוד (Railway → Deployments → Rollback).
2. גרסת הקוד הישנה מריצה `alembic upgrade head` שמוביל לגרסה שהיא מכירה — אבל **לא מוריד עמודות שנוספו לאחר מכן**.
3. לירידה מפורשת בסכמה: הרצי `alembic downgrade -1` ידנית דרך Railway Shell לפני ה-rollback.

---

## CI Migration Drift Gate

כל PR מריץ את השלבים הבאים (`.github/workflows/pr-checks.yml`):

```
Postgres 15 service (fresh DB)
  → alembic upgrade head
  → psql verify: alembic_version = ef8fb1858f5b
  → psql verify: table count (excl. alembic_version) = 34
  → alembic check                ← MEH-492
  → pytest
```

**כשה-gate נכשל:**
- `alembic_version` שגוי → migration chain שבורה (revision חסר, down_revision שגוי)
- `table count` שגוי → טבלה נוספה/נמחקה ב-migration בלי לעדכן את `EXPECTED_TABLES`
- `alembic check` נכשל (MEH-492) → drift בין `Base.metadata` (מודלים) לסכמה ש-`upgrade head` יצרה. הסיבה הקלאסית: הוסיפי שדה ל-`models.py` בלי `alembic revision --autogenerate`. הפלט מצביע על העמודה/הטבלה החסרה. תיקון: ג'נרטי revision חדש, הריצי `upgrade head` מקומית, ופחתי לעדכן את `EXPECTED_TABLES` אם זו טבלה חדשה.

כאשר מוסיפים טבלה חדשה: עדכני `EXPECTED_TABLES=34` → `EXPECTED_TABLES=35` (וכן הלאה) ב-pr-checks.yml.

**מקומית, לפני PR:** `cd backend && uv run alembic check` — אם CI ייכשל, זה ייכשל מקומית קודם. דורש Postgres רץ + `alembic upgrade head` ניקיון לפני זה.

---

## Troubleshooting

### `FAILED: Can't locate revision identified by 'xxxxxxx'`
```
down_revision ב-revision החדש מצביע על SHA שלא קיים.
פיתרון: בדקי backend/alembic/versions/ — ודאי ש-down_revision תואם ל-id של הקובץ הקודם.
```

### `connection refused` בעת הרצת alembic
```
DATABASE_URL לא מוגדר, או ה-DB לא רץ.
בדקי: echo $DATABASE_URL && psql "$DATABASE_URL" -c "\l"
```

### `Target database is not up to date`
```
alembic current ≠ alembic heads. הרצי alembic upgrade head.
```

### `Multiple head revisions`
```
שתי branches הוסיפו revisions במקביל ללא merge.
פיתרון: alembic merge heads -m "merge_parallel_revisions"
```

### `Column already exists` / `relation already exists`
```
Migration כותבת DDL ישיר (CREATE/ALTER) ללא IF NOT EXISTS.
הוסיפי IF NOT EXISTS, או השתמשי ב-op.execute עם בדיקה קודמת.
```

---

## עדכון EXPECTED_TABLES ו-EXPECTED_REV לאחר merge

לאחר שה-baseline revision עצמו משתנה (מיגרציה שמוסיפה טבלאות):

1. הרצי `alembic upgrade head` מקומית.
2. השגי את ה-revision: `alembic current`.
3. ספרי טבלאות: `psql ... -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'alembic_version';"`.
4. עדכני `EXPECTED_REV` ו-`EXPECTED_TABLES` ב-`.github/workflows/pr-checks.yml`.
5. עדכני את השורה הראשונה של קובץ זה (Baseline).
