# מהמקור — מדריך מיגרציות (Alembic)

> **Baseline:** `ef8fb1858f5b` — 34 טבלאות (ללא `alembic_version`). מוטמע על staging ו-production.
> **Alembic הוא הסמכות היחידה לשינויי סכמה.** `Base.metadata.create_all` הוסר מ-boot path ב-MEH-267.
> **גיבוי ושחזור:** מיגרציות מתקנות סכמה; גיבויים מתקנים data. ל-runbook של גיבוי/שחזור Postgres ראו [docs/BACKUPS.md](./BACKUPS.md).

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

## Expand-Contract לשינויים מסוכנים

שינויי סכמה מסוכנים — `DROP COLUMN` / `RENAME COLUMN` / שינוי טיפוס / הוספת `NOT NULL` על עמודה קיימת / היפוך כיוון FK — חייבים לעבור דרך **Expand-Contract**. תיעוד מלא ומחייב: [ADR-007](./decisions/ADR-007-expand-contract-schema-changes.md). 4 שלבים, 4 PRs נפרדים, soak של ≥7 ימים על staging לפני Phase 4 (`[DESTRUCTIVE]` בכותרת ה-PR).

1. **Phase 1 — Expand:** ADD עמודה/טבלה/אינדקס. Backfill ב-loop של `UPDATE` עם `LIMIT`, לא בגוף ה-migration.
2. **Phase 2 — Dual-write:** כתיבות ל-old וגם ל-new. קריאות עדיין מ-old.
3. **Phase 3 — Read cutover:** קריאות עוברות ל-new בכל ה-surfaces. old נשאר ל-rollback.
4. **Phase 4 — Contract:** `DROP` של old. תנאי-קדם (כל ארבעה): 7-day soak ✓, R2 backup ≤24h ✓, ללא dual-write divergence ✓, traffic על ה-new endpoint מוודא כתיבות אמיתיות ✓.

דוגמה קנונית: MEH-291 (Phase 1-3) → **MEH-1854** (Phase 4) — availability-state consolidation.

> **תוקן ב-MEH-1857 (02/08).** השורה הזו הפנתה ל-MEH-456 כטיקט ה-Phase 4. **הטיקט הזה אינו קיים ב-Linear** (נבדק 02/08 — `Could not find referenced Issue`). כלומר המדריך שמחייב Expand-Contract הצביע בעצמו על שלב contract שאף אחד לא פתח, וה-overlap של MEH-291 — שהוגדר ל-**7 ימים** — נמשך ~14 חודשים. זה המופע הרביעי של אותה מחלקה שנמצא באותו ציד, והוא הסיבה שהסקשן הבא קיים.

---

## שער LEGACY-expiry — לכל overlap יש תאריך תפוגה (MEH-1857)

**כשפותחים expand, קובעים מתי ה-contract קורה.** לא "ב-PR נפרד", לא "אחר כך" — תאריך.

```
LEGACY(YYYY-MM-DD, MEH-1234)
```

בכל הערה, לצד הטקסט שהייתם כותבים ממילא. התאריך = מתי ה-overlap חייב להיעלם; הטיקט = מי מסיר אותו.

`scripts/checks/legacy-expiry-check.sh` סורק את `backend/` ו-`frontend/` ו**נכשל** כאשר:

| מצב | התנהגות |
| -- | -- |
| התאריך עבר | ❌ נכשל, מדפיס `file:line` + הטיקט |
| מרקר **malformed** (בלי תאריך ISO או בלי טיקט) | ❌ נכשל — מרקר שלא יכול לפוג הוא בדיוק הפרצה שמחזירה את הבעיה |
| התאריך היום או בעתיד | ✅ עובר |
| הערת "legacy" רגילה **בלי** המרקר | ✅ מתעלם — ראו grandfather למטה |

**אפס עריכות workflow.** הסקריפט יושב ב-`scripts/checks/`, ו-`run-all.sh` מגלה אותו לבד תחת ה-job הנדרש **Repo guards** — זו בדיוק הסיבה שהתיקייה קיימת (`.github/workflows/**` הוא CC-deny, MEH-671). אומת: הדיספצ'ר עבר מ-9 ל-**10 guards ran**, עם `PASS legacy-expiry-check`.

### escape hatch — א-סימטרי בכוונה

`guard-ok: <reason>` (במוסכמה של [`scripts/checks/README.md`](../scripts/checks/README.md)) משתיק ממצא **malformed** — ו**לעולם לא** ממצא **expired**.

ה-hatch נועד ל"השער זיהה את השורה הזו לא נכון": הערה ב-`backend/` שמצטטת את תבנית המרקר בזמן שהיא מסבירה את המוסכמה נראית לסורק בדיוק כמו מרקר אמיתי. זה false positive ומגיע לו פתח.

תאריך שפג אינו זיהוי שגוי — הוא **הממצא**. השתקה שלו הייתה בונה מחדש את החור שהשער סוגר: הערה אחת וה-overlap פטור לנצח, כלומר אותה פרצה של "מרקר בלי תאריך" בתחפושת. כדי להפסיק כישלון תפוגה — או מסיימים את ה-contract, או מזיזים את התאריך במקום שreviewer רואה.

### איך מאריכים

עורכים את התאריך ב-PR שעובר review. זו הנקודה: ההארכה הופכת ל**החלטה גלויה** במקום לשכחה שקטה. שתי האפשרויות — לסיים את ה-contract או להאריך במודע — הן שתיהן החלטות, וזה ההבדל מהמצב הקודם.

### Grandfather (מכוון)

הערות "legacy" קיימות **בלי** המרקר אינן נסרקות, ואין סריקה רטרואקטיבית. השער מכסה חוב **חדש** ואת שלושת האתרים שנזרעו. סריקה רטרואקטיבית הייתה מייצרת קיר אדום בלי בעלים לכל שורה — ושער שאי אפשר להוריק הוא שער שמכבים.

### שלושת המרקרים החיים

| קובץ | טיקט | מה זה |
| -- | -- | -- |
| `producer_me.py:418` | MEH-1854 | dual-write של MEH-291 — חלון 7 ימים שנמשך ~14 חודשים |
| `models.py:119` | MEH-1855 | `starting_price_label` — alias שהבעלות עליו **התהפכה** (הציבור קורא את ה-alias, הבעלים כותבת את הקנוני) |
| `models.py:573` | MEH-1857 | `products.price_range` — ה-follow-up שהוא מפנה אליו מעולם לא נפתח; מפנה לטיקט הזה עד שייפתח אחד אמיתי |

### הרצה

```bash
bash scripts/checks/run-all.sh                          # כל השערים (כולל זה)
bash scripts/checks/legacy-expiry-check.sh              # רק זה
bash scripts/checks/legacy-expiry-check.sh --self-test  # מוכיח שהוא מבחין
```

ה-`--self-test` רץ מול `scripts/fixtures/legacy-expiry-fixture.txt` — **חמישה** מקרים: פג-תוקף, עתידי, malformed, grandfathered, ו-malformed-שהושתק-ב-guard-ok — ומאמת גם את **הספירות**, לא רק את קוד היציאה. שער שנכשל מהסיבה הלא נכונה, או שמסמן גם את המרקר העתידי, אינו עושה את עבודתו. הריצו אותו לפני שסומכים על ירוק כלשהו.

⚠️ **אל תכתבו את התבנית המילולית `LEGACY(` בתוך `backend/` או `frontend/`** אלא כמרקר אמיתי — הסורק מוצא את המחרוזת בכל מקום, כולל בתוך תיעוד של המוסכמה עצמה. (זה קרה ב-fixture בזמן הכתיבה: הפרוזה שהסבירה את case 3 הכילה את התבנית והספירה קפצה מ-1 ל-3. התיעוד של המוסכמה חי כאן ב-`docs/` וב-`scripts/`, ששניהם מחוץ לסריקה.)

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
  → alembic upgrade head          ← broken-chain gate (revision / down_revision)
  → psql verify: table count (excl. alembic_version) = EXPECTED_TABLES
  → alembic check                ← MEH-492 — sole model↔migration drift gate
  → pytest
```

**כשה-gate נכשל:**
- `alembic upgrade head` נכשל → migration chain שבורה (revision חסר, down_revision שגוי) — נתפס ישירות ב-upgrade. **MEH-836** הסיר את ה-assertion על `EXPECTED_REV` / `alembic_version` (היה toil ידני; `alembic check` + upgrade מכסים את אותו class).
- `table count` שגוי → טבלה נוספה/נמחקה ב-migration בלי לעדכן את `EXPECTED_TABLES`
- `alembic check` נכשל (MEH-492) → drift בין `Base.metadata` (מודלים) לסכמה ש-`upgrade head` יצרה. הסיבה הקלאסית: הוסיפי שדה ל-`models.py` בלי `alembic revision --autogenerate`. הפלט מצביע על העמודה/הטבלה החסרה. תיקון: ג'נרטי revision חדש, הריצי `upgrade head` מקומית, ופחתי לעדכן את `EXPECTED_TABLES` אם זו טבלה חדשה.

כאשר מוסיפים טבלה חדשה: עדכני `EXPECTED_TABLES=34` → `EXPECTED_TABLES=35` (וכן הלאה) ב-pr-checks.yml.

### ספירת ראשים — `alembic heads` בלבד. לא grep. (MEH-1909)

**הפקודה הסמכותית:**

```bash
cd backend && uv run alembic heads   # ראש יחיד = שורה אחת
```

`alembic upgrade head` נכשל ממילא על ריבוי ראשים (*"Multiple head revisions are present"*), אז ה-gate מכסה את זה — **אבל רק ב-job של ה-backend, שהוא paths-filtered ומדלג על PR שנוגע ב-frontend בלבד.** לכן בהכנת release, שבה סופרים ראשים ידנית מול טווח, כדאי להריץ את הפקודה במפורש.

⚠️ **אל תספרי ראשים ב-grep על הקבצים.** זו לא הקפדה תיאורטית — סקריפט אד-הוק שעשה בדיוק את זה דיווח **שני ראשים** בהכנת release #2 (MEH-1909), והשרשרת הייתה תקינה לחלוטין.

**המלכודת, כדי שלא תחזור:** קבצי revision בריפו נושאים את המחרוזת `down_revision` **גם בתוך docstrings**, בצורת פרוזה בלי מרכאות —

```python
"""
down_revision = a9f2c7d41b6e (MEH-1490 producer_google_place_id) — the single
...
"""
revision: str = "d51508a7c9e2"
down_revision: Union[str, None] = "a9f2c7d41b6e"   # ← ההשמה האמיתית, 14 שורות מתחת
```

regex עם `re.search` על `^down_revision.*=` תופס את **שורת ה-docstring** ועוצר שם. אין בה ערך מרוכאה, כלומר לא נחלץ מזהה, וההורה האמיתי לא נספר — ומי שההורה שלו לא נספר **נראה כמו ראש**.

**שתי הנגזרות, ושתיהן חלות מעבר לאלמביק:**

1. אם בכל זאת סופרים בכלי משלכן — `findall` על **כל** שורות ההשמה, וחילוץ מזהים **מרוכאים בלבד**; ו-`down_revision` יכול להיות tuple (`("a", "b")`) ב-merge revisions, אז המזהים הם רבים ולא אחד.
2. **הכלי צריך self-test על קישור שידוע כתקין.** הסקריפט המתוקן מאמת ש-`d51508a7c9e2 → a9f2c7d41b6e` נפתר לפני שהוא סופר משהו. בלי זה, "שני ראשים" ו"הכלי שבור" נראים זהה.

זה המקרה של *"validate a probe on a case whose answer you already know"* (`.claude/rules/testing.md`) על משטח שבו **עצירה שגויה יקרה במיוחד** — release שנעצר על שרשרת תקינה עולה יותר מ-grep שנכתב נכון מלכתחילה.

**מקומית, לפני PR:** `cd backend && uv run alembic check` — אם CI ייכשל, זה ייכשל מקומית קודם. דורש Postgres רץ + `alembic upgrade head` ניקיון לפני זה.

**MEH-836 — CC רשאית לכתוב migrations:** עם הסרת ה-deny על `backend/alembic/versions/**` (Edit+Write ב-`.claude/settings.json`), Claude Code יכולה לחבר revision כתוב-ביד בעצמה (hand-written, לא `--autogenerate`). ה-apply נשאר אוטומטי ב-boot של ה-Dockerfile (`alembic upgrade head`) — אין צעד ידני להחלת המיגרציה.

### אודיט DROP ב-`upgrade()` — שלוש מחלקות חומרה, לא מילה אחת (MEH-1909)

**«אפס DROPs ב-`upgrade()`» היא טענה שאסור לכתוב, כי "DROP" מכסה שתי תשובות שונות.** בהכנת release #2 גוף ה-PR טען בדיוק את זה, והוא היה **שגוי** — בעוד שמסקנת הבטיחות שנשענה עליו הייתה **נכונה**. זהו הצירוף המסוכן: משפט שקורא סומכת עליו בלי לגזור מחדש, שמסקנתו במקרה יצאה נכונה.

בכל אודיט release, סווגי כל קריאת `op.*` הרסנית ב-`upgrade()` לאחת משלוש:

| מחלקה | פעולות | משמעות | שער |
|---|---|---|---|
| **A · אובדן נתונים** | `drop_table` · `drop_column` | טבלה או עמודה נעלמת. **זו המחלקה שחוסמת release.** | חייבת להיות **0** |
| **B · סכימה בלבד** | `drop_constraint` · `drop_index` | אין אובדן נתונים. לרוב DROP+ADD להרחבה — ל-Postgres אין `ALTER … ALTER CONSTRAINT` ל-CHECK, אז זו הצורה **היחידה** לשנות תנאי | מותרת · לתעד פר-מופע |
| **C · `op.execute` גולמי** | SQL חופשי | עלול להסתיר `DROP` בטקסט | לקרוא בעין · לבדוק טוקן `DROP` |

**דוגמה חיה מהטווח של release #2:** `e4b1c72d9a35:93` מריצה `op.drop_constraint("producer_offer_type", …)` בתוך `upgrade()` ומיד אחריה `create_check_constraint` עם תנאי רחב יותר. מחלקה B: כל שורה שסיפקה את התנאי הישן מספקת את החדש, אפס אובדן, אפס סיכון rollback. **ניסוח נכון:** *"אפס `drop_table`/`drop_column` ב-`upgrade()`; `drop_constraint` אחד, מחלקה B, מתועד"* — ולא *"אפס DROPs"*.

**המכשיר: `ast`, לא grep.** כל קריאת `op.*` מיוחסת לפונקציה ש**עוטפת אותה לקסיקלית**, כולל קריאות בתוך helper ברמת המודול שה-`upgrade()` קורא לו. `grep` על קרבה למילה `downgrade` לא יכול לבצע את הייחוס הזה — והוא גם יסווג helper כזה כבטוח.

**ה-`downgrade()` הריק אינו פגם כשמדובר ב-merge revision.** גוף ה-PR טען *"כל 14 הרביזיות נושאות `downgrade()` מלא"*; בפועל **12** נושאות, ושתי ה-merge revisions ריקות **מעצם הבנייה** — merge revision מחברת שני קווי שושלת ואין לה תוכן משלה להפוך. לספור אותן כפגם מייצר אזעקת שווא; לספור אותן כמלאות מייצר טענה שקרית. לתעד בנפרד.

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

## עדכון EXPECTED_TABLES לאחר merge

לאחר מיגרציה שמוסיפה או מוחקת טבלה:

1. הרצי `alembic upgrade head` מקומית.
2. ספרי טבלאות: `psql ... -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'alembic_version';"`.
3. עדכני `EXPECTED_TABLES` ב-`.github/workflows/pr-checks.yml`.

> **MEH-836:** `EXPECTED_REV` הוסר מ-`pr-checks.yml` — אין יותר head hardcoded לשמור מסונכרן (היה toil ידני בכל מיגרציה). drift מודל↔מיגרציה נתפס ע"י `alembic check` בלבד; chain שבורה ע"י `alembic upgrade head`. רק `EXPECTED_TABLES` (כשנוספת/נמחקת טבלה) עדיין דורש עדכון ידני.
