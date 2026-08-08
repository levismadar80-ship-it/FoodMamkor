# MEH-1910 — Phase 0: CI baseline (מדידה לפני כל שינוי)

**נמדד:** 2026-08-05, מתוך `pr-checks.yml` runs אמיתיים ב-GitHub Actions API.
**שיטה:** `list_workflow_jobs` לכל run → `started_at`/`completed_at` per job + per step.
**as-of:** כל המספרים כאן הם צילום של 05/08. ריצה בודדת אינה מגמה — למדוד מחדש לפני החלטה.

> **הערה על `gh`:** ה-prompt של הכרטיס ביקש `gh run list` / `gh run view`. ה-CLI הזה
> אינו זמין בסשן CC (ראו §5). המדידות נלקחו דרך GitHub MCP (`actions_list` /
> `actions_get`) — אותו API, אותם שדות.

---

## 1. שלוש ריצות שנמדדו

| # | run id | branch | פרופיל | סה"כ wall-clock |
|---|---|---|---|---|
| 1 | `30999068702` | `feature/meh-1788-webkit-ci-shadow` | frontend + backend | **13m 11s** |
| 2 | `30998737154` | `staging` (PR) | frontend + backend | **12m 30s** |
| 3 | `30998576511` | `feature/meh-1441-vrt-baselines` | frontend בלבד (pytest skipped) | **5m 41s** |

---

## 2. Per-job durations

### Run 1 — `30999068702` (frontend + backend)

| Job | משך | הערה |
|---|---|---|
| **Backend tests (pytest)** | **12m 18s** | ← **critical path**. שלב `Run tests with coverage gate` לבדו = **11m 36s** |
| Frontend unit tests (vitest) | 4m 48s | שלב `Run vitest unit suite` = 4m 14s |
| AI artifact scan (build output) | 1m 05s | `npm ci` 19s + `npm run build` 24s + סריקות **0s** |
| Frontend build (Next.js) | 1m 09s | שלב `Build` = 22s |
| Frontend tsc strict | 45s | warn-only |
| Frontend Knip | 40s | warn-only |
| Backend mypy | 18s | warn-only |
| Backend lint (ruff) | 14s | |
| Repo guards | 17s | |
| Paths filter / Env drift / qa-size / DNM / Branch-name | 2–15s | |
| CI gate (required) | 2s | נכנס ב-11:04:06, **מיד** אחרי סיום pytest ב-11:04:04 |

### Run 2 — `30998737154` (frontend + backend)

| Job | משך |
|---|---|
| **Backend tests (pytest)** | **11m 44s** (שלב הטסטים לבדו **10m 58s**) |
| Frontend unit tests (vitest) | 4m 50s |
| Frontend build (Next.js) | 1m 08s (שלב `Build` = 24s) |
| AI artifact scan | 1m 00s (`npm ci` 17s + `build` 23s) |
| שאר ה-jobs | ≤ 52s |
| CI gate | נכנס ב-10:58:26, מיד אחרי pytest ב-10:58:23 |

### Run 3 — `30998576511` (frontend בלבד)

| Job | משך |
|---|---|
| **Frontend unit tests (vitest)** | **5m 18s** ← **critical path** (שלב הטסטים = 4m 34s) |
| Frontend build (Next.js) | 58s |
| AI artifact scan | 56s |
| Backend tests (pytest) | `skipped` (paths-filter) |
| CI gate | נכנס ב-10:49:16, מיד אחרי vitest ב-10:49:14 |

---

## 3. ניתוח critical path — הממצא המרכזי

**ה-critical path של כל PR הוא job יחיד, ואינו ה-build הכפול.**

| פרופיל PR | critical path | חלקו מה-wall-clock |
|---|---|---|
| נוגע ב-backend | `Backend tests (pytest)` | 11m44s–12m18s = **93–96%** |
| frontend בלבד | `Frontend unit tests (vitest)` | 5m18s / 5m41s = **93%** |

**שרשרת ה-build הכפול (`build` → `ai-artifact-scan`) מסתיימת הרבה לפני סוף הריצה:**

| Run | השרשרת מסתיימת | הריצה מסתיימת | מרווח (slack) |
|---|---|---|---|
| 1 | 10:53:56 | 11:04:08 | **10m 12s** |
| 2 | 10:49:01 | 10:58:30 | **9m 29s** |
| 3 | 10:45:58 | 10:49:20 | **3m 22s** |

**מסקנה:** ביטול ה-build הכפול (PR-A) חוסך **0 שניות wall-clock** בכל שלושת
הפרופילים. גם אם ה-job היה נמחק לגמרי, ה-PR היה נגמר באותה שנייה בדיוק, כי
pytest/vitest עדיין רצים 3–10 דקות אחריו. זה מפעיל את **STOP condition (a)** של
ה-prompt: "if measurements show a bottleneck NOT covered below".

מה כן חוסך PR-A: כ-**1 runner-minute לכל PR פרונטנד** בחיוב (billing), לא ב-latency.

---

## 4. פירוק העלות שהכרטיס מכוון אליה

| סעיף בכרטיס | מה נמדד בפועל | השפעה על wall-clock |
|---|---|---|
| §1 build כפול (PR-A) | `ai-artifact-scan` = 1m00s–1m05s, לא על ה-critical path | **0s** |
| §2 `.next/cache` (PR-A+C) | שלב `Build` cold = **21–24s** בלבד | ≤ 15s, ועל job שאינו critical path → **~0s** |
| §3 `npm ci` × 5 | 16–19s לכל job, כולם במקביל, אף אחד אינו critical path | **0s** |
| §4 pytest סריאלי (PR-B) | **11m 36s / 10m 58s** | **כאן נמצא כל הפרס** |
| §5 "Update branch" | ראו §6 — ההנחה בכרטיס אינה נכונה | — |

**Bottleneck שאינו מכוסה באף אחד מ-PR-A/B/C: `vitest` (4m14s–4m34s זמן טסטים נטו).**
בכל PR פרונטנד־בלבד הוא ה-critical path. שום סעיף ב-MEH-1910 לא נוגע בו.
אין `--shard`, אין `pool`/`maxThreads` ב-scope. זה הפער הכי גדול בכרטיס אחרי pytest.

---

## 5. Ruleset — מה נבדק ומה לא

**גישה ישירה נחסמה.** `GET /repos/{owner}/{repo}/rulesets` מחזיר **403**:
`"GitHub access is not enabled for this session. An org admin must connect the
Claude GitHub App for this organization."` גם `gh` CLI אינו זמין בסשן. לכן לא
ניתן לקרוא את ruleset 15240090 ישירות — כפי שה-prompt צפה ("If 403 → note it,
Sapir will screenshot").

**במקומו — הוכחה עקיפה מתוך ההיסטוריה, שהיא חד-משמעית.**
תחת "Require branches to be up to date" (strict), GitHub חוסם merge של ענף שאינו
מכיל את קצה ה-base. כלומר עבור כל merge commit, ההורה הראשון (`^1`, קצה staging)
**חייב** להיות ancestor של ההורה השני (`^2`, קצה הענף).

```
git log --merges --first-parent origin/staging -200
  → 164 PR merges נבדקו
  → 91 מהם (55%) מוזגו כשההורה הראשון אינו ancestor של השני
  → כלומר: 91 merges שה-strict היה חוסם
  → האחרון: f5d6cc2a, 2026-08-03 16:53 (PR #2542)
```

**מסקנה: `Require branches to be up to date` היה כבוי לפחות עד 2026-08-03 16:53.**

⚠️ **מה זה לא מוכיח:** 23 ה-merges מאז 03/08 16:53 כולם up-to-date, אבל זה עקבי
עם *שתי* האפשרויות — כלל 25 מחייב `git merge origin/staging` לפני כל push, כך
ש-up-to-date הוא ממילא ברירת המחדל. לכן אי אפשר להסיק מהם שה-strict נדלק. הטענה
כאן היא **as-of 03/08 16:53**, ודורשת אישור של ספיר מול המסך.

**המשמעות לסעיף §5 בכרטיס:** ההנחה "Update branch מריץ הכל מחדש כנראה בגלל
Require branches to be up to date" **אינה מאושרת**. אם strict כבוי, הלחיצה על
"Update branch" אינה נכפית ע"י ה-ruleset — היא נובעת מכלל 25 (סנכרון חובה לפני
push) ומ-`synchronize` שמפעיל את כל ה-workflows מחדש. זה משנה את ההמלצה: אין מה
"לכבות" ב-ruleset, כי הוא כנראה כבר כבוי.

> ## 🔄 תוקן 05/08 — הפסקה שמעל שגויה להיום. **strict דלוק.**
>
> הסייג שנוסח כאן ("as-of 03/08 16:53 · לא ניתן להסיק מה-23 שמאז") היה הזהירות
> הנכונה, והוא נפרע באותו יום. שלוש ראיות שנאספו 05/08:
>
> 1. **`mergeable_state: "behind"`** על PR #2623 החי. GitHub מדווח `behind` רק
>    כשיש דרישת up-to-date; בלעדיה PR מפגר-אך-מיזוגי מדווח `clean`.
> 2. **12/12 ה-merges האחרונים ל-`staging` up-to-date** (מול 55% שאינם בחלון
>    ההיסטורי).
> 3. **המכריעה:** commit `123141f6` — *"Merge branch 'staging' into
>    feature/meh-1910-ci-baseline-and-staged-patches"*, מחבר `sapirschnapp`,
>    **15:14:16**, שתי דקות לפני ש-auto-merge מיזג את PR #2622 ב-15:16.
>    **CC לא יצר אותו.** זהו עדכון-ענף-אוטומטי-לפני-מיזוג — ההתנהגות של
>    auto-merge כאשר strict דלוק.
>
> **לכן: ההנחה של §5 בכרטיס נכונה היום, וכיבוי strict הוא לבר אמיתי.** ההמלצה
> שלא לעבור ל-merge queue **לא השתנתה** — היא נשענה על כך ש-merge queue מוסיף זמן
> CI לסוויטה איטית, טיעון בלתי תלוי ב-strict.
>
> **מה שנשאר נכון:** המדידה ההיסטורית עצמה (91/164). strict לא היה דלוק עד
> 03/08 16:53. **מתי נדלק — לא ניתן לקבוע מכאן** (ה-403 על ה-ruleset בתוקף),
> ולכן אישור מול המסך עדיין נדרש.

---

## 6. חסם על PR-B שהכרטיס לא מזהה — pytest-xdist מול DB משותף

הכרטיס מבקש `-n auto` + לאמת "pytest-cov + xdist combine correctly". הסיכון
האמיתי גדול יותר ונמצא ב-fixtures, לא ב-coverage.

`tests/conftest.py` מפעיל את כל הטסטים מול **מסד נתונים אחד משותף**
(`TEST_DATABASE_URL`, `tests/conftest.py:12-15`), ומחזיק שני fixtures הרסניים:

| מיקום | fixture | מה הוא עושה |
|---|---|---|
| `tests/conftest.py:58-65` | `_bootstrap_schema` — `scope="session", autouse=True` | `Base.metadata.drop_all()` → `create_all()` → yield → `drop_all()` |
| `tests/conftest.py:102-114` | `_clean_tables` — `autouse=True` (function scope) | `TRUNCATE TABLE <כל הטבלאות> RESTART IDENTITY CASCADE` **לפני כל טסט** |

תחת `-n auto` על runner עם 4 ליבות נוצרים 4 workers, **כולם מול אותו DB**:

1. כל worker מריץ את ה-session fixture בנפרד → worker B עושה `drop_all` בזמן
   ש-worker A באמצע טסט.
2. כל worker עושה `TRUNCATE` של **כל** הטבלאות לפני **כל** טסט → worker B מוחק
   את השורות ש-worker A בדיוק יצר.

זה לא flake — זה כשל שיטתי. `-n auto` כפי שנוסח בכרטיס **יאדים את הסוויטה מיד**,
או גרוע מכך יעבור לסירוגין. 2,033 פונקציות טסט ב-181 קבצים חולקות את ה-fixtures האלה.

**מה באמת נדרש ל-PR-B:** בידוד DB per-worker — למשל שם DB נגזר מ-
`PYTEST_XDIST_WORKER` (`gw0`, `gw1`, …) עם יצירה/מחיקה per-worker, והתאמה של
שירות ה-Postgres ב-CI. זו עבודה אמיתית על `tests/conftest.py`, לא flag.
לחלופין `--dist loadgroup` עם סריאליזציה של גישת ה-DB — שמוותר על רוב הרווח.

**לא נבדק (ואומר זאת במפורש):** לא הרצתי את הסוויטה עם xdist. הקביעה למעלה
נגזרת מקריאת ה-fixtures, לא מריצה. אימות מלא דורש הרצה — ולא ביצעתי אותה.

---

## 7. סיכום — סדר עדיפויות מתוקן

| עדיפות | פעולה | חיסכון wall-clock צפוי | מצב |
|---|---|---|---|
| **1** | pytest parallel (PR-B) — **אחרי** בידוד DB per-worker | 12m → ~4m על 4 workers | חסום: דורש `conftest.py` + `pyproject`/`uv.lock` (CC-deny) |
| **2** | vitest sharding — **לא בכרטיס** | 5m18s → ~2m על 3 shards | לא ב-scope; דורש החלטה |
| 3 | `.next/cache` (PR-A/C) | ~0s (chore של billing) | חסום: `.github/workflows/**` CC-deny |
| 4 | ביטול build כפול (PR-A) | **0s** — ~1 runner-minute billing | חסום: CC-deny |

**יעד הכרטיס (≥50% קיצור wall-clock) מושג אך ורק דרך פריט 1**, ופריט 1 גדול
משמעותית ממה שהכרטיס מתאר.
