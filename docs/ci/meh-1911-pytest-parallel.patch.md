# MEH-1911 — pytest מקבילי: patches מוכנים להדבקה (ספיר)

> **הבלוקים כאן מיועדים לספיר להדבקה ידנית.** `.github/workflows/**` הוא CC-deny
> (`.claude/settings.json`, MEH-671), וכך גם `backend/pyproject.toml` ו-`backend/uv.lock`.
> CC כתב את ה-diff בקובץ ה-`.md` הזה בלבד ולא נגע באף אחד משלושתם.

> ## ✅ החסם ש-MEH-1910 §3 תיאר — הוסר
>
> [`docs/ci/meh-1910-ci-speedup.patch.md`](./meh-1910-ci-speedup.patch.md) §3 כתב
> **"⛔ אל תחילי `-n auto` כפי שנוסח בכרטיס"**, כי הסוויטה רצה מול DB אחד משותף
> ושני fixtures הורסים כל הרצה מקבילה. **הבידוד נכתב והוכח ב-PR של MEH-1911**
> (`tests/conftest.py`) — כל worker מקבל DB משלו (`mehamakor_test_gw0`, `gw1`, …),
> נוצר ב-session start ונמחק ב-session end.
>
> אחרי שה-PR של MEH-1911 מוזג, הבלוקים למטה בטוחים להחלה.

---

## §1 — `backend/pyproject.toml`: הוספת `pytest-xdist` ל-dev deps

בקבוצת `[dependency-groups] dev` (`backend/pyproject.toml:34-44`), **אחרי**
השורה `"pytest-timeout>=2.4.0",` (`:41`) הוסיפי שורה אחת:

```toml
    "pytest-xdist>=3.8.0",
```

הקבוצה כולה אחרי השינוי:

```toml
[dependency-groups]
dev = [
    "mutmut>=3.6.0",
    "pip-audit>=2.10.0",
    "pytest>=8.0",
    "pytest-cov>=7.1.0",
    "pytest-rerunfailures>=16.4",
    "pytest-timeout>=2.4.0",
    "pytest-xdist>=3.8.0",
    "ruff>=0.15.20",
    "schemathesis>=4.0",
]
```

ואז, **באותו commit** (MEH-1527 — lock ו-manifest לא מתפצלים):

```bash
cd backend && uv lock
```

`pytest-xdist` גורר `execnet` בלבד. הגרסה שנבדקה בפועל בהוכחת היציבות: **3.8.0**.

---

## §2 — `.github/workflows/pr-checks.yml`: הוספת `-n auto`

> ### ⚠️ זה **לא** שינוי של שתי שורות כפי שהכרטיס תיאר — צריך **שתי ריצות**
>
> הכרטיס ביקש להוסיף `-n auto --durations=15` לשלב אחד. **זה לא מספיק**, מסיבה
> שנמדדה ולא שוערה: טסט אחד בסוויטה טוען טענה על **זמן שעון נמדד**, ולא ניתן
> למדוד זמן על מכונה שבה 3 workers אחרים רוויים ב-CPU.
>
> `tests/test_api.py::TestLoginTimingEqualization::test_login_timing_equivalence_across_failure_modes`
> (MEH-626) מודד p95 של שלושה ענפי כישלון ב-`/login` ודורש פער `< 20ms`, כדי
> שתוקף לא יוכל למנות משתמשים דרך הפרש זמנים. תחת `-n auto` על 4 ליבות הוא נפל
> **3 מתוך 3 פעמים**, פער p95 של **526ms** (`oauth_only=875ms` מול
> `wrong_email=349ms`) — כולל שלוש ריצות ה-`flaky` reruns שכבר היו לו.
>
> **ה-docstring של הטסט עצמו (MEH-647) כבר צפה את זה** וכתב במפורש: על runner
> עמוס המדידה מתקלקלת, ואז יש *"(1) verify on a quieter machine, (2) … do NOT
> silently raise the 20ms threshold — that hides regressions."*
>
> לכן הסף **לא נגעו בו** ([`.claude/rules/security.md`](../../.claude/rules/security.md)
> אוסר להחליש invariant כדי להריץ טסט), והטסט קיבל marker `serial` ורץ בריצה
> שנייה, סדרתית — שהיא בדיוק ה"quieter machine" שה-docstring ביקש. הכיסוי
> הביטחוני נשמר במלואו.

**החליפי** את השלב `Run tests with coverage gate` (`pr-checks.yml:396-404`)
בשני השלבים הבאים:

```yaml
      - name: Run tests (parallel)
        run: |
          backend/.venv/bin/python -m pytest tests/ \
            -n auto -m "not serial" \
            --cov=backend/app \
            --cov-report=term \
            --durations=15 \
            --tb=long --timeout=60
        env:
          TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_test
          SECRET_KEY: ci-test-secret-not-for-production
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_test

      - name: Run serial tests + coverage gate
        run: |
          backend/.venv/bin/python -m pytest tests/ \
            -m serial \
            --cov=backend/app --cov-append \
            --cov-report=xml \
            --cov-report=html \
            --cov-report=term \
            --cov-fail-under=70 \
            --tb=long --timeout=60
        env:
          TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_test
          SECRET_KEY: ci-test-secret-not-for-production
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/mehamakor_test
```

**למה בדיוק ככה:**

- `-m "not serial"` / `-m serial` — שני חצאים משלימים. סכום ה-collected של
  שתיהן שווה בדיוק ל-collected הסדרתי (**2,737 + 1 = 2,738**), כך שאף טסט לא
  נעלם בין הריצות. זו הבדיקה שצריך להריץ אם משנים את הביטוי.
- `--cov-append` בריצה השנייה — בלעדיו הריצה השנייה **מוחקת** את נתוני הכיסוי
  של הראשונה ו-`--cov-fail-under` היה נאכף על טסט אחד בלבד.
- `--cov-fail-under=70` נשאר **רק בשלב השני**, כלומר נאכף על הסכום המאוחד.
- `--cov-report=xml/html` נשארים בשלב השני בלבד, כי הם צריכים לשקף את הסכום —
  שלב ה-Smokeshow שאחריו (`:415-426`) קורא `htmlcov` ולכן לא משתנה.

בלוק ה-`env:` המקורי (`:405-409`) מועתק לשני השלבים, ללא שינוי בתוכן.

### מה **לא** צריך להשתנות — בניגוד למה ש-MEH-1910 §3 שיער

- **שירות ה-Postgres ב-CI לא זקוק לשום שינוי** (`pr-checks.yml:294-307`).
  `POSTGRES_USER: postgres` הוא superuser, ולכן `CREATE DATABASE` זמין; ו-image
  הרשמי `postgres:15` תמיד יוצר את מסד הנתונים `postgres` ב-initdb, שהוא
  ה-maintenance connection שה-conftest מתחבר אליו כדי ליצור ולמחוק. אין צורך
  ב-env var חדש ואין צורך בהרשאה נוספת.
- **`--dist loadfile` לא נדרש.** §3 הציע אותו כהקלה על בעיית ה-DB המשותף.
  הבידוד מייתר אותו, וההוכחה רצה על ברירת המחדל (`--dist load`), שמפזרת גם
  טסטים מאותו קובץ בין workers שונים — כלומר interleaving **חזק יותר** מזה
  ש-`loadfile` היה מייצר. אפשר להוסיף אותו, אבל הוא מקטין את הרווח ואינו קונה
  בטיחות נוספת.
- **`WITH (FORCE)`** ב-`DROP DATABASE` דורש PG13+; ה-CI מקובע ל-`postgres:15`,
  ולכן נתמך.

---

## §3 — אחרי ההחלה

1. ריצת CI אמיתית אחת עם `-n auto` — היעד בכרטיס הוא **≤5 דק'** ל-job של pytest
   (מ~12).
2. `--durations=15` ידפיס את 15 הטסטים האיטיים ביותר — קלט ל-MEH-1529
   (schemathesis/timeout), שבו מקביליות עשויה לשנות את התמונה.

---

## §4 — הוכחת היציבות שרצה לפני שהבלוקים האלה נכתבו

כל המספרים נמדדו על 4 ליבות (Xeon @ 2.80GHz), Postgres 16 מקומי, מול הסוויטה
המלאה. **לא הרצת CI** — ראו "מה עדיין לא נבדק" למטה.

### Baseline סדרתי

| | conftest מקורי | conftest אחרי MEH-1911 |
|---|---|---|
| passed / skipped / xfailed | 2368 / 369 / 1 | **2368 / 369 / 1** |
| coverage | 89% (8923 stmts, 1004 missed) | **89% (8923, 1004)** |
| exit | 0 | **0** |
| wall | 769s | **767s** |

זו ההוכחה ל-backward compatibility: במצב סדרתי ההתנהגות זהה.

### 5 ריצות מקביליות — כולן ירוקות

| ריצה | pass מקבילי | pass סדרתי | סה"כ wall | collected | coverage |
|---|---|---|---|---|---|
| `-n auto` #1 | 212.8s | 66.8s | **294s** | 2737 + 1 | 89% |
| `-n auto` #2 | 224.3s | 66.2s | **305s** | 2737 + 1 | 89% |
| `-n auto` #3 | 204.9s | 66.6s | **287s** | 2737 + 1 | 89% |
| `-n 2` | 354.8s | 66.4s | **436s** | 2737 + 1 | 89% |
| `-n 4` | 238.4s | 67.0s | **319s** | 2737 + 1 | 89% |

בכל חמש: `2367 passed, 369 skipped, 1 xfailed` במקבילי + `1 passed` בסדרתי —
כלומר **2,738 collected** ו-**2,368 passed**, בדיוק כמו ב-baseline הסדרתי.
ה-coverage היה `8923 / 1004 / 89%` בכל ריצה — **סטייה 0.0pt**, הרבה בתוך
טווח ה-0.5pt שהכרטיס דרש.

**הרווח:** 769s → **287–319s** ב-`-n auto` (פי ~2.5). ה-pass המקבילי לבדו
הוא 205–224s מול 758s (פי ~3.5); ה-pass הסדרתי מוסיף 66s קבועים.

### מקרה הבקרה — בלי הבידוד זה נשבר

הרצת `pytest tests/test_api.py -n 4` על ה-conftest **המקורי**: שגיאה על ~82%
מהמודול (`EEEE…`) ואז תקיעה עד kill אחרי 10 דקות. אותה פקודה בדיוק ירוקה עם
הבידוד — כלומר ההוכחה מבחינה בין המצבים ולא רק "עברה".

### 18 מסדי נתונים נוצרו ונמחקו

אחרי חמש הריצות (3×4 + 2 + 4 = 18 DBs פר-worker), `pg_database` מכיל רק את
`mehamakor_test`. ה-teardown ב-`pytest_sessionfinish` עובד.

### מה עדיין לא נבדק

- **לא רצה ריצת CI אמיתית עם `-n auto`.** כל המדידות מקומיות; runner של
  GitHub הוא 2-core ולא 4, כך שהיחס שם יהיה שונה — קטן יותר. היעד של ≤5 דק'
  בכרטיס סביר לאור המספרים כאן אבל **לא נמדד**.
- **`-n 4` אינו נקודת מדידה עצמאית במכונה הזאת:** יש בה 4 ליבות, ולכן
  `-n auto` הוא `-n 4`. שתי הריצות נבדלות ב-interleaving בפועל, לא במספר
  ה-workers. `-n 2` הוא כן מספר workers שונה.
