# MEH-1910 — CI speedup: YAML patches מוכנים להדבקה (ספיר)

> **הבלוקים כאן מיועדים לספיר להדבקה ידנית.** `.github/workflows/**` הוא CC-deny
> (`.claude/settings.json`, MEH-671) — וכך גם `pyproject.toml` ו-`uv.lock`. CC כתב
> את ה-diff בקובץ `.md` הזה בלבד ולא נגע באף workflow. אומת אמפירית 05/08:
> `Edit(.github/workflows/pr-checks.yml)` החזיר
> `File is in a directory that is denied by your permission settings.`

> ## ⛔ קראי את זה לפני שאת מדביקה משהו
>
> **מדידת Phase 0 הפכה את סדר העדיפויות של הכרטיס.**
> המדידה המלאה: [`qa-artifacts/MEH-1910/ci-baseline.md`](../../qa-artifacts/MEH-1910/ci-baseline.md).
>
> - **PR-A (ביטול ה-build הכפול) חוסך 0 שניות wall-clock.** ה-job
>   `ai-artifact-scan` מסיים 3–10 דקות **לפני** סוף הריצה בכל שלוש הריצות
>   שנמדדו. הוא לא על ה-critical path. הוא כן חוסך ~1 runner-minute של billing.
> - **PR-C (`.next/cache`) חוסך ~0 שניות.** שלב ה-`Build` cold הוא **21–24s**
>   בסך הכול, ועל job שאינו critical path.
> - **PR-B (pytest) הוא כל הפרס — ואי אפשר להחיל אותו כפי שנוסח.** ראו §3.
> - **ה-bottleneck השני בגודלו, `vitest`, אינו מוזכר בכרטיס כלל.** ראו §4.
>
> כלומר: A ו-C בטוחים אבל כמעט חסרי ערך ל-latency; B הוא בעל הערך אבל דורש
> עבודה שהכרטיס לא תיאר. ההחלטה מה להחיל היא שלך.

---

## §1 — PR-A: artifact passing במקום build כפול

**ערך:** ~1 runner-minute billing לכל PR פרונטנד. **latency: 0.**
**סיכון:** נמוך. גרף ה-jobs, ה-`needs` ו-`ci-gate` לא משתנים (MEH-1582 בטוח).

### 1a — ב-job `build`, אחרי `- name: Build` (`pr-checks.yml:192-196`), הוסיפי:

```yaml
      - name: Upload .next for downstream scan jobs
        uses: actions/upload-artifact@v4
        with:
          name: next-build-${{ github.run_id }}
          path: |
            frontend/.next
            !frontend/.next/cache
          retention-days: 1
          if-no-files-found: error
```

`!frontend/.next/cache` מוציא את ה-cache מה-artifact (הוא גדול ולא נסרק).
`github.run_id` בשם מבטיח ש-PRs מקבילים לא יקראו artifact אחד של השני.

### 1b — ב-job `ai-artifact-scan`, **החליפי** את שלושת השלבים
`Set up Node.js 20` + `Install dependencies` + `Build (scan target)`
(`pr-checks.yml:233-246`) בשלב יחיד:

```yaml
      - name: Download .next from the build job
        uses: actions/download-artifact@v4
        with:
          name: next-build-${{ github.run_id }}
          path: frontend/.next
```

**אל תיגעי בשאר.** `- uses: actions/checkout@v7` (`:231`) **נשאר** — הוא זה
שמספק את `public/`, ששתי הסריקות קוראות. שלבי `Scan 2a` / `Scan 2b`
(`:248-284`) נשארים **מילה במילה**, על אותם paths (`.next public`).

### ✅ בדיקת נכונות של PR-A — הסריקות עדיין סורקות את אותו דבר

| מה | לפני | אחרי |
|---|---|---|
| `.next` | נבנה מקומית ב-job | הורד מ-`build` — **אותו build בדיוק** |
| `public/` | מ-`checkout` | מ-`checkout` (ללא שינוי) |
| פקודות 2a/2b | `find`/`grep` | זהות, byte-for-byte |

⚠️ **נקודה אחת לאמת אחרי ההחלה:** `upload-artifact@v4` **אינו משמר הרשאות
קבצים ואינו משמר symlinks**. הסריקות משתמשות ב-`find -type f` ו-`grep -rl`, ששניהם
לא תלויים בהרשאות — אז זה אמור להיות שקוף. אבל אם `.next` מכיל symlinks, הן
ישוטחו. **לא בדקתי אם `.next` מכיל symlinks** — כדאי לוודא בריצה הראשונה
שמספר הקבצים ב-`.next` אחרי ה-download דומה לזה שלפני.

---

## §2 — PR-A/C: `.next/cache` + node_modules cache

**ערך מדוד: ~0 שניות wall-clock.** מובא כאן כי הכרטיס ביקש, לא כי הוא ישנה משהו.
שלב ה-`Build` cold הוא 21–24s; גם cache מושלם חוסך פחות מ-20s, על job שאינו
critical path.

### 2a — `.next/cache` (המתכון הרשמי של Next.js)

להוסיף **לפני** שלב ה-`Build`, בכל אחד מ: `pr-checks.yml` job `build`,
`e2e.yml` (לפני `:133`), `vrt-update.yml` (לפני `:109`):

```yaml
      - name: Cache Next.js build cache
        uses: actions/cache@v6
        with:
          path: frontend/.next/cache
          key: nextjs-${{ runner.os }}-${{ hashFiles('frontend/package-lock.json') }}-${{ hashFiles('frontend/**/*.{js,jsx,ts,tsx}') }}
          restore-keys: |
            nextjs-${{ runner.os }}-${{ hashFiles('frontend/package-lock.json') }}-
```

`e2e.yml` ו-`vrt-update.yml` — **שתיהן באותו PR** (כותרת "keep the two in sync").

### 2b — node_modules cache עם דילוג על `npm ci`

חמשת ה-jobs ב-`pr-checks.yml` עם `npm ci`: `:190`, `:241`, `:571`, `:606`, `:629`.
(אם §1b הוחל, `:241` נעלם ונשארים ארבעה.)

```yaml
      - name: Cache node_modules
        id: node-modules-cache
        uses: actions/cache@v6
        with:
          path: frontend/node_modules
          key: node-modules-${{ runner.os }}-node20-${{ hashFiles('frontend/package-lock.json') }}

      - name: Install dependencies
        if: steps.node-modules-cache.outputs.cache-hit != 'true'
        run: npm ci
```

**קריטי — בלי `restore-keys` כאן.** partial hit היה מדלג על `npm ci` עם
`node_modules` שאינו תואם ל-lockfile. exact-key בלבד. זה בדיוק ה-idiom של
`Cache Playwright browsers` הקיים (`e2e.yml:117-132`).

---

## §3 — PR-B: pytest. ⛔ אל תחילי `-n auto` כפי שנוסח בכרטיס

**זה החסם המהותי שהכרטיס לא זיהה.**

הסוויטה רצה מול **DB אחד משותף** (`TEST_DATABASE_URL`, `tests/conftest.py:12-15`),
עם שני fixtures שהורסים כל הרצה מקבילה:

| מיקום | fixture | מה קורה תחת xdist |
|---|---|---|
| `tests/conftest.py:58-65` | `_bootstrap_schema`, `scope="session", autouse=True` — `drop_all()`/`create_all()` | כל worker מריץ אותו בנפרד → worker B מוחק טבלאות בזמן ש-worker A באמצע טסט |
| `tests/conftest.py:102-114` | `_clean_tables`, `autouse=True` — `TRUNCATE TABLE <הכול> RESTART IDENTITY CASCADE` לפני כל טסט | worker B מוחק את השורות ש-worker A בדיוק יצר |

`-n auto` על runner עם 4 ליבות = 4 workers מול אותו DB. זה **לא flake** — זה כשל
שיטתי על פני 2,033 פונקציות טסט ב-181 קבצים.

**מה שנדרש קודם (מחוץ ל-scope שהכרטיס תיאר):** בידוד DB per-worker — שם DB
נגזר מ-`PYTEST_XDIST_WORKER` (`gw0`/`gw1`/…), יצירה ומחיקה per-worker,
והתאמת שירות ה-Postgres ב-CI. `--dist loadgroup` הוא חלופה שמוותרת על רוב הרווח.

**רק אחרי שהבידוד קיים**, השינוי ב-`pr-checks.yml:396-404`:

```yaml
      - name: Run tests with coverage gate
        run: |
          backend/.venv/bin/python -m pytest tests/ \
            -n auto --dist loadfile \
            --cov=backend/app \
            --cov-report=xml --cov-report=html --cov-report=term \
            --cov-fail-under=70 \
            --durations=15 \
            --tb=long --timeout=60
```

ו-`pytest-xdist` נוסף ל-dev deps ב-`backend/pyproject.toml` (ליד
`pytest-rerunfailures`, `:40`) עם `uv lock` באותו commit (MEH-1527).

`--dist loadfile` מקבץ טסטים לפי קובץ — מפחית את שטח ההתנגשות אבל **אינו פותר**
את בעיית ה-DB המשותף. הוא תוספת, לא תחליף לבידוד.

**על pytest-cov + xdist:** `pytest-cov` תומך ב-xdist ומאחד תת-תהליכים אוטומטית,
כך ש-`--cov-fail-under=70` אמור להמשיך לאכוף על הסכום המאוחד. **לא אימתתי את זה
בהרצה** — לא הרצתי את הסוויטה עם xdist בכלל.

---

## §4 — מה שחסר מהכרטיס: `vitest`

בכל PR פרונטנד־בלבד, **`vitest` הוא ה-critical path** — 5m18s job, 4m34s זמן
טסטים נטו (run `30998576511`). בריצות מעורבות הוא השני אחרי pytest (4m48s–4m50s).

שום סעיף ב-MEH-1910 לא נוגע בו. אין `--shard`, אין כוונון `pool`/`maxThreads`.
אחרי pytest זה הפריט הגדול ביותר, והוא זול יחסית (sharding של vitest ב-CI הוא
matrix + `--shard=i/n`). **מוצע ככרטיס נפרד** — לא הוספתי אותו כאן כי הוא מחוץ
ל-`<scope>` שהכרטיס הגדיר, ו-`<over_engineering_guard>` אוסר הרחבה עצמאית.

---

## §5 — Ruleset: strict מול merge queue

**לא ניתן לקרוא את ה-ruleset מסשן CC.** `GET /repos/.../rulesets` → **403**
(`"GitHub access is not enabled for this session"`); `gh` CLI אינו זמין.

**הוכחה עקיפה חד-משמעית מההיסטוריה:** תחת strict, GitHub חוסם merge של ענף שאינו
מכיל את קצה ה-base — כלומר `^1` חייב להיות ancestor של `^2` בכל merge commit.
מתוך **164** PR merges אחרונים ל-`staging`, **91 (55%)** אינם מקיימים זאת;
האחרון `f5d6cc2a`, **2026-08-03 16:53** (PR #2542).

→ **`Require branches to be up to date` היה כבוי לפחות עד 03/08 16:53.**

⚠️ 23 ה-merges מאז כן up-to-date, אבל זה עקבי עם שתי האפשרויות — כלל 25 מחייב
ממילא סנכרון לפני push. **הטענה היא as-of 03/08 16:53 ודורשת אישור מול המסך.**

### ההמלצה

**אל תעברי ל-merge queue, ואל תשני את ה-ruleset.**

1. **אין מה לכבות.** ההנחה בכרטיס (§5 — "Update branch מריץ הכל מחדש כנראה בגלל
   strict") לא אושרה, וכנראה הפוכה: strict כבר כבוי. הכאב של "Update branch"
   נובע מכלל 25 (`git merge origin/staging` חובה לפני כל push) + `synchronize`
   שמפעיל מחדש את כל ה-workflows — לא מה-ruleset.
2. **merge queue לא פותר את הבעיה הזאת.** הוא מריץ CI על מיזוג מדומה בתור. אם
   ה-CI עצמו לוקח 12 דקות, merge queue **מוסיף** 12 דקות לכל מיזוג בתור. הוא
   פתרון לתחרות על merge בקצב גבוה — לא לריצה איטית.
3. **זמינות: merge queue אינו זמין. נסגר במדידה, לא בהשערה.**
   התנאי הוא repo **ציבורי בבעלות ארגון**, או repo פרטי תחת GitHub Enterprise Cloud.
   `GET /repos/levismadar80-ship-it/FoodMamkor` (05/08) מחזיר
   `"visibility": "public"`, `"private": false`, ו-`owner.type: "User"` — כלומר
   **ציבורי אבל בבעלות חשבון אישי**, ולכן נופל בין שני התנאים. זו אותה מסקנה
   שהגיעה אליה MEH-1527 §4.1, מאותה סיבה (חשבון אישי).

   ⚠️ **תיקון לניסוח קודם בקובץ הזה.** השורה כאן אמרה *"`FoodMamkor` פרטי, ואת רמת
   ה-plan לא הצלחתי לקרוא"*. החצי הראשון **שגוי** — הריפו ציבורי. החסם ב-403 היה על
   קריאת ה-**ruleset**, ומזה הוסק בטעות שגם ה-metadata של הריפו אינו קריא; בפועל
   `search_repositories` מחזיר את מלוא אובייקט הריפו כולל `visibility`. המסקנה
   המעשית לא משתנה, אבל העובדה כן — וזה מסוג הטענות שנקראות כמאומתות בסבב הבא.

   **הנגזרת שאינה על CI ומשמעותית יותר:** אם הריפו ציבורי, אז
   `show_full_output: true` ב-`claude-review.yml` שופך את מלוא הפלט של ה-reviewer
   ללוג Actions **גלוי לציבור** — וההערה בקובץ עצמו כבר מזהירה מזה בדיוק. ראו את
   ההערכה המלאה ב-MEH-1844; בקצרה: החשיפה השולית של הוספת `Read/Glob/Grep`
   (PR #2607) קרובה לאפס, כי הקבצים שהם קוראים כבר ציבוריים ואין `.env` ב-checkout
   נקי — אבל ההחלטה עצמה על הדגל היא של ספיר, לא מסקנה של המסמך הזה.
4. **אם merge queue כן ייבחר בעתיד** — כל workflow יזדקק ל-trigger `merge_group`,
   אחרת ה-required checks לעולם לא ידווחו בתור והמיזוגים ייתקעו. **follow-up
   בלבד, לא להוסיף עכשיו** (הוראה מפורשת ב-`<acceptance_criteria>`).

**הפעולה בעלת הערך היחידה כאן היא §3** — לקצר את ה-CI עצמו. כל שאר הדיון על
strict/merge-queue הוא אופטימיזציה של תור סביב bottleneck שלא זז.

---

## §6 — סדר החלה מוצע

| # | פעולה | ערך | סיכון |
|---|---|---|---|
| 1 | לאשר מול המסך: strict דלוק או כבוי ב-ruleset 15240090 | מסיר את ההשערה היחידה שנשארה פתוחה | אפס (קריאה) |
| 2 | לפתוח כרטיס לבידוד DB per-worker ב-`conftest.py`, ואז §3 | **12m → ~4m** | בינוני — נוגע ב-fixtures של 2,033 טסטים |
| 3 | לפתוח כרטיס ל-vitest sharding (§4) | **5m18s → ~2m** בפרונטנד | נמוך |
| 4 | §1 (artifact passing) — אם שווה לך ~1 runner-minute/PR | billing בלבד | נמוך |
| 5 | §2 (caches) | ~0s | נמוך |

**DoD של הכרטיס (≥50% קיצור wall-clock) לא מושג ע"י PR-A/B/C כפי שנוסחו** — הוא
מושג ע"י פריט 2, שגדול ממה שהכרטיס תיאר, ופריט 3, שאינו בכרטיס.
