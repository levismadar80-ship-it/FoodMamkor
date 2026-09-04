# אודיט אמינות לשערי ה-CI — איזה check הרוויח את מקומו (MEH-2237, Phase 0)

**תאריך:** 2026-09-01 לילה · **סקופ:** כל job שרץ על `pull_request` · **תוצר:** המסמך הזה בלבד. **אפס שינויי workflow, אפס כרטיסים חדשים.** ההכרעות שמכאן והלאה — של ספיר.

> **הקריטריון המנחה** (מהכרטיס): *שלב נשאר אם היה תופס באג או תקלה שקרו בפועל.* לא «פחות שערים» — «שערים שמודדים». בפרויקט הזה אין מהנדסת שנייה שקוראת diff; ה-CI הוא הרקורדיה היחידה, ולכן **שער שירוק בלי לבדוק גרוע מהיעדר שער.**

---

## 0 · גבולות המכשיר — לקרוא לפני שסומכים על מספר

| גבול | נמדד | השלכה |
| -- | -- | -- |
| REST `api.github.com` | `403 GitHub access is not enabled for this session` | כל ההיסטוריה דרך ה-GitHub MCP בלבד |
| `actions_list` | `per_page=100` מבוקש → **30 מוחזרים, תמיד**; אין פילטר תאריך/conclusion | דפדוף מהחדש לישן, נעצר בתת-חלונות מפורשים |
| חלון | הכרטיס ביקש 30 יום (02/08 → 01/09) | **בפועל נמנו:** `pr-checks` 27/08→01/09 (390 ריצות) + בדיקת דף 30 (14–16/08); `e2e`/`deploy` 01/09 (60) + 14–15/08; `claude-review` 01/09; `i18n` 29/08→; `dependency-audit` 29/08→; `skills-audit` — **אין ריצה אחרי 16/08**. **02–14/08 ו-16–27/08 לא נמנו.** |
| משך | `created_at → updated_at` (ריצה) / `started_at → completed_at` (job) | **wall-clock כולל תור**, לא דקות חיוב. הכרטיס ביקש `gh api …/timing` — לא זמין (403) |
| לוגים | 3 ריצות החזירו 404 לכל job | runner מעולם לא הוקצה (`runner_id: 0`) — תשתית, לא שער |

**«לא נצפה בחלון» פירושו לא נצפה בתת-החלון שנמנה, ותו לא.** רשימה היא ראיה לנוכחות, לעולם לא להיעדר (CLAUDE.md).

**מדידת ה-adversarial input** נעשתה מקומית, בלי push, עם **בקרה על עץ נקי** לכל probe — כלל testing.md: probe שלא הודגם אדום ולא הודגם ירוק אינו ראיה לאף כיוון. הקבצים הזמניים הוצאו מהריפו מיד; `git status` נקי.

---

## 1 · המלאי — 17 שערים על PR (+2 אגרגטורים), לפי שם ה-check המדויק

| # | check (כפי שמופיע ב-PR) | workflow:line | תנאי | warn-only? | באגרגטור |
| -- | -- | -- | -- | -- | -- |
| 1 | Branch name gate | `pr-checks.yml:44-60` | תמיד (פרט ל-`staging→main`) | לא | **באף אחד** |
| 2 | DO-NOT-MERGE marker gate | `:62-77` | תמיד | לא | CI gate (`check_ran`) |
| 3 | Repo guards | `:79-86` | תמיד | לא (18 guards בפנים; 4 מהם warn-only) | CI gate (`check_ran`) |
| 4 | qa-artifacts size cap | `:88-126` | תמיד | לא | CI gate (`check_ran`) |
| 5 | Frontend build (Next.js) | `:169-210` | frontend ∨ workflows, לא draft | לא | CI gate (`check_ran`) |
| 6 | AI artifact scan (build output) | `:220-282` | כמו 5, אחרי 5 | לא | CI gate (`check_ran`) |
| 7 | Backend tests (pytest) | `:287-439` | backend ∨ workflows, לא draft | לא | CI gate (`check_ran`) |
| 8 | Backend lint (ruff) | `:452-489` | כמו 7 | לא | CI gate (`check_ran`) |
| 9 | Env drift (.env.example) | `:499-509` | לא draft (ללא paths) | לא | CI gate (`check_ran`) |
| 10 | Backend mypy (strict, warn-only) | `:531-555` | כמו 7 | **כן** — `continue-on-error` + `\|\| true` | CI gate (`check`, לא-קפדני) |
| 11 | Frontend Knip (dead code, warn-only) | `:562-587` | כמו 5 | **כן** — שתי שכבות | CI gate (`check`) |
| 12 | Frontend tsc strict (warn-only) | `:597-622` | כמו 5 | **כן** — שתי שכבות | CI gate (`check`) |
| 13 | Frontend unit tests (vitest) | `:624-644` | כמו 5 | לא | CI gate (`check_ran`) |
| 14 | Linear mention guard (rule 29, warn-only) | `:656-673` | PR ללא stack | **כן** — `\|\| true` | **באף אחד** |
| 15 | Backend dependency audit (pip-audit) | `:681-702` | `deps` נגעו | לא | CI gate (`check_ran` כש-deps) |
| 16 | Frontend lint (RTL + Next.js rules) | `deploy.yml:117-146` | frontend ∨ workflows | לא (אבל ראו §3) | Deploy gate (`ok`) |
| 17 | API contract audit (static) | `deploy.yml:154-174` | frontend ∨ backend ∨ workflows | לא | Deploy gate (`ok`) |
| 18 | Playwright E2E (Vercel preview) | `e2e.yml:80-391` | frontend, לא dependabot | לא | `E2E gate ` (רווח בסוף השם, `:564`) — **לא ב-required set** |
| 19 | Playwright E2E (WebKit — shadow, non-blocking) | `e2e.yml:432-561` | כמו 18 | **כן** — `continue-on-error` | **באף אחד** (`:566`) |
| 20 | Adversarial review (calibration) | `claude-review.yml:44-128` | לא draft, לא docs | **כן** — `continue-on-error` | אין |
| 21 | Backend/Frontend dependency audit | `dependency-audit.yml:38-124` | deps paths | לא | אין |
| 22 | parity (i18n ICU) | `i18n-icu-parity.yml:33-43` | `messages/**` | לא | אין (הקובץ עצמו אומר: לעולם לא required) |
| 23 | Skills supply chain audit | `skills-audit.yml:36-86` | skills paths | לא | אין |
| — | CI gate (required) · Deploy gate (required) | `pr-checks.yml:704-861` · `deploy.yml:379-409` | `always()` | — | **שני ה-contexts היחידים ש-`protect-staging` דורש** |

הכרטיס אמר «17»; הספירה המדויקת תלויה במה סופרים: **15 jobs ב-`pr-checks` + 2 ב-`deploy` = 17 שרצים על כל PR עם קוד**, ועוד 6 ב-workflows עצמאיים שרצים לפי paths. כולם בטבלה.

---

## 2 · הפסק — job, ראיה, דלי

**עמודות:** (a) הכשל האחרון על **פגם אמיתי** (run id + PR/ענף + השורה); (b) **ירוק בזמן שמשהו נשבר** בסקופ המוצהר שלו, או אדום שלא חסם; (c) חציון משך wall-clock; **adversarial** = קלט מקומי שאמור להפיל, ותוצאתו; **דלי** — אחד בדיוק, עם משפט הראיה.

### 2.1 `pr-checks.yml`

| check | (a) כשל אמיתי אחרון | (b) ירוק-כששבור / אדום-שלא-חסם | (c) משך | adversarial (מקומי) | **דלי** — הראיה |
| -- | -- | -- | -- | -- | -- |
| **Branch name gate** | לא נצפה (רק בריצות runner-404) | — | 4s | `claude/drain-night-long-haul-0zci01` → **FAIL**; `feature/meh-2237-…` ו-`dependabot/…` → PASS | **KEEP-PER-PR** — ה-regex מבחין (הודגם), זול. **⚠️ אבל הוא באף אגרגטור** (`:707-721` לא נוקב בו) ואינו ב-required set ⇒ **אדום שלו לא חוסם merge**. השער האמיתי לענפים הוא ה-hook `check-branch-name.sh` בסשן CC. הצעה ב-§5 |
| **DO-NOT-MERGE marker gate** | `33480763451` (01/09, `feature/meh-1907-superseded-probe`, «Scratch PR… Do not merge») — **מכוון**, השער עשה את עבודתו | **≥3 false positives על פרוזה**: `33270083966` (**release `staging→main`**, 29/08) · `33324653032` (30/08, מחלקת #2813) · `31902925493` (15/08 — המשפט «No do-not-merge marker in this body» הפיל אותו) | 3s | לא נבנה — ה-regex מתועד ב-`dnm-matcher-guard.sh` עם truth-table | **KEEP-PER-PR** — תפס סמנים מכוונים (≥2 בחלון), 3 שניות. ה-FP הוא MEH-1523 (מעבר לתווית), patch מוכן: `docs/ci/meh-1523-dnm-label-gate.patch.md` |
| **Repo guards** | `33493134235` (01/09, `meh-1907-workflows-only-enforcement`, `5344c3a`): `FAIL builder-model-guard … no Builder-Model: trailer` — **7/7** הכשלים בחלון הם guard זה | **2 מתוך 7 על קומיטים שאף סשן CC לא כתב:** `33266645433` (regen של ה-VRT bot, `fc2c795e`) · `33268805816` (עריכת web-UI של ספיר על meh-2168). ה-guard פוטר dependabot בלבד. **ו-4 guards בפנים לא יכולים להפיל:** `docs-ordering` · `israel-clock` · `vrt-baseline-sync` (exit 0 תמיד) · `openapi-codegen` Tiers B/C (מדולגים תמיד ב-CI) | 17s | לא נדרש — 14/18 נושאים `--self-test`, 3 מריצים אותו כ-preflight בכל ריצה (`alembic-head`, `builder-model`, `secrets-scan`) | **KEEP-PER-PR** — 7 תפיסות אמיתיות בחלון + #2228 שנתפס ע"י `changelog-branch-guard` (README). **ממצא:** ה-FP על bot/web-UI הוא כלל שחסר (§5) |
| **qa-artifacts size cap** | לא נצפה (0/22) | **ירוק על 14.8MB** — `frontend/qa-artifacts/` (495 קבצים) לעולם לא נספר, כי ה-pathspec `qa-artifacts/` מעוגן לשורש (**MEH-2184**, נמדד 01/09 drain יז') | 17s | לא נבנה מחדש — MEH-2184 כבר מדד את שני הכיוונים | **KEEP-PER-PR** לחצי שהוא רואה; **CANNOT-FAIL על `frontend/qa-artifacts/`** — התיקייה שהסוויטה כותבת אליה כברירת מחדל. patch: `docs/ci/meh-2184-qa-artifacts-pathspec.patch.md` |
| **Frontend build (Next.js)** | כשל `npm run build` אמיתי — **לא נצפה**; כל הכשלים = `npm ci` ERESOLVE על ענפי dependabot (`33507326147`) | — | 58s (65·59·61·71) | לא נבנה (build מלא ≈ דקות; שגיאת syntax מפילה אותו טריוויאלית — לא ראיה) | **KEEP-PER-PR** — שער הקומפילציה היחיד, זול. «לא נצפה» ≠ «לא יכול» |
| **AI artifact scan (build output)** | לא נצפה (0/12 ריצות) | — | 67s (**כולל `npm run build` שני, עצמאי** — jobs לא חולקים workspace) | **בקרה** על ה-build המקומי האמיתי: 2a `[]`, 2b שלושת הליטרלים `[]`; **planted** `public/CLAUDE.md` → 2a מחזיר `[public/CLAUDE.md]` → היה מאדים | **KEEP-PER-PR** — מבחין (הודגם), אבל **משלם build שלם** בשביל `find` + `grep`. הצעה ב-§5: לקפל לתוך ה-build job |
| **Backend tests (pytest)** | `33401275568` (31/08, `meh-2020-slug-charset`): `assert 422 == 201` + `ImportError: RESERVED_SLUGS` — **אמיתי**; גם `33066806706` (27/08) | — | **8m46s** (8:42·8:30·9:27) — הארוך ביותר | לא נדרש — 2 תפיסות אמיתיות בחלון | **KEEP-PER-PR** — תפיסה מוכחת. יקר, אבל זה שער הנכונות היחיד של ה-backend |
| **Backend lint (ruff)** | כלל ruff — **לא נצפה**; רק `uv.lock --check` על dependabot (`33490947040`) | — | 20s | planted `import os` לא בשימוש + משתנה מת → **`Found 2 errors`**; בקרה: `All checks passed!` | **KEEP-PER-PR** — מבחין (הודגם), 20 שניות, לא נבדק ע"י ההיסטוריה |
| **Env drift (.env.example)** | `33446188668` (31/08, `meh-2230`): `BLOCK — QA_BASE`; `33332085295` (30/08): `BLOCK — PW_CHROME` — **אמיתיים ×2** | **אדום-שגוי על draft:** `33079660207` (27/08) — «skipped is not a pass» על PR שה-draft שלו מנע מהשער לרוץ (workflow.md rule 21) | 11s | planted `process.env.ZZ_ADVERSARIAL_…` → **exit 1**, שם המשתנה בפלט; בקרה: exit 0 | **KEEP-PER-PR** — 2 תפיסות אמיתיות + הודגם |
| **Backend mypy (strict, warn-only)** | — | `continue-on-error: true` **וגם** `\|\| true` על ה-step | 26s | אין קלט שיכול להפיל: שתי השכבות ממירות כל exit ל-success **לפני** שהאגרגטור רואה | **CANNOT-FAIL** — MEH-1868 (מדוד שם). 26s runner לכל PR בשביל פלט שאיש לא קורא |
| **Frontend Knip (warn-only)** | — | `33507326147`: ה-job **נכשל** (ERESOLVE), בלוק ה-gate דיווח `success` | 26s | אותה בנייה | **CANNOT-FAIL** — MEH-1868; **וגם נמדד**: כשל job נמחק לפני `needs.*.result` |
| **Frontend tsc strict (warn-only)** | — | אותה ריצה, אותו מחיקה | 33s | אותה בנייה | **CANNOT-FAIL** — MEH-1868 |
| **Frontend unit tests (vitest)** | `33307121620` (30/08, `meh-2199`): `ChipScrollRowKeyboard.test.jsx:84` — **אמיתי** | הודעת ה-squash של #3201 טענה «vitest ירוק» כשהוא היה `cancelled` (§2 בכרטיס) — **שקר של המדווח, לא של השער**; האגרגטור ממפה cancelled ל-SUPERSEDED (MEH-1907) | **6m22s** (6:01·5:33·5:31·4:53) | לא נדרש — תפיסה אמיתית | **KEEP-PER-PR**. השני ביוקר. שלושת ה-guards המרכזיים (`LabelScopeContract` · `NoEmojiInComponents` · `backend-contract-parity`) רצים **רק** כחלק ממנו — אף workflow לא נוקב בהם, ולכן כשלם נראה כ-`R_VITEST=failure` ותו לא |
| **Linear mention guard (rule 29, warn-only)** | — | **PR #2465**: 3 מזהים חשופים בגוף, ה-job דיווח `success` (workflow.md rule 29, מדוד) | ~5s | `check-linear-mentions.sh` **כן** מבחין (הורץ הלילה על שני גופי PR: exit 1 ואז 0) — ה-job מוחק את זה ב-`\|\| true` ואינו ב-`needs:` | **CANNOT-FAIL** — הסקריפט טוב, ה-job לא. הנזק שהוא מונע (auto-link) קורה ב-`opened`, לפני שכל CI רץ — ולכן גם שער חוסם לא יעזור כאן; הבדיקה המקומית לפני פתיחה היא הכלי |
| **Backend dependency audit (pip-audit, ה-leg ב-pr-checks)** | לא נצפה; **רץ פעם אחת ב-22** (מגודר על `deps`) | — | — | **לא נבנה** — דורש pin פגיע + DB advisories; לא הוכרע | **אין ורדיקט — השורה נשארת פתוחה.** ורדיקט CANNOT-FAIL שגוי ימחק שער אמיתי; «לא יודעת» זול יותר |

### 2.2 `deploy.yml`

| check | (a) | (b) | (c) | adversarial | **דלי** |
| -- | -- | -- | -- | -- | -- |
| **Frontend lint (RTL + Next.js rules)** | כלל ESLint אמיתי — **לא נצפה**; רק ERESOLVE על dependabot (`33507325865`) | **השם מבטיח RTL; ה-job לא יכול להאדים על RTL.** planted `className="ml-4 text-left"` → `✖ 2 problems (0 errors, 2 warnings)` → **exit 0**. `eslint.config.mjs:72` — `no-restricted-syntax` הוא `"warn"`; `package.json:9` — `"lint": "eslint ."` בלי `--max-warnings`; `deploy.yml:146` — `npm run lint` כמות שהוא | 1m55s | ↑ נמדד | **CANNOT-FAIL על החצי שבשמו** (RTL). החצי השני — `no-undef: "error"` ושגיאות parse — כן מפיל. אכיפת ה-RTL האמיתית: ה-hook `check-rtl.sh` (סשן CC בלבד) + `lint-ratchet` (warn-only, MEH-1868). ⇒ עריכה מה-web UI או PR חיצוני עוברת עם `ml-4` |
| **API contract audit (static)** | לא נצפה (59/0 בחלון) | — | 10s | planted `api.get("/zz-no-such-route")` בטסט → **`Orphan frontend (404 risk): 1`, exit 1**; בקרה: 0/0 | **KEEP-PER-PR** — מבחין (הודגם), 10 שניות. תקדים אמיתי מחוץ לחלון: MEH-1315 (testing.md) |

### 2.3 `e2e.yml`

| check | (a) | (b) | (c) | adversarial | **דלי** |
| -- | -- | -- | -- | -- | -- |
| **Playwright E2E (Vercel preview)** | `33510108748` (01/09, `meh-2238`): `31 failed / 286 passed` — **אותם 4 קבצים יציבים מ-26/08** (MEH-2168), לא ה-diff | **אדום על כל PR מאז 26/08 בלי קשר ל-diff** ⇒ שלושה merges ב-26/08 על «CI ירוק» שלא מדד (MEH-2168 §26/08); **skip-green:** כל commit לא-frontend מדווח `success` בלי להריץ spec אחד (שש ברצף ב-31/08). ואינו ב-required set | **11–17m** (10:51 · ~17:00) | הסוויטה עצמה: A′ של MEH-2168 הורץ הלילה — 6/8 ב-`33-` הם באגי spec, לא מוצר | **MOVE-TO-MERGE-GATE** — **תפיסות מוכחות בעבר** (MEH-1528: 6 אדומים על כל PR; MEH-215) והוא **הכי יקר**; והיום, בעודו אדום-קבוע, כל ריצת PR = 15 דקות runner ואפס מידע, והצבע מאמן להתעלם. עד ש-MEH-2168 chunks 2–4 יירקו: להריץ על push ל-`staging` (כבר רץ) + label לפי בקשה (`docs/ci/vrt-label-trigger.patch.md` הוא התבנית). **לא** «למחוק» — לשנות מתי |
| **Playwright E2E (WebKit — shadow)** | — | `continue-on-error` + לא ב-`needs:` של `e2e-gate` (`:566`) — **במכוון** (MEH-1788 step A) | **15m16s** | — | **CANNOT-FAIL** כשער, **ובכוונה**. אבל 15 דקות runner לכל PR בשביל job שאיש לא קורא = MOVE-TO-MERGE-GATE במונחי עלות. ההכרעה היא של MEH-1788 (promotion) — לא כאן |
| **QA report comment** (step בתוך 18) | — | **inert**: `e2e.yml:306` לא קורא ל-`qa-report-verdict.cjs` — **MEH-2196** (מדוד 30/08) | — | — | **CANNOT-FAIL** — מוסכם עם MEH-2196, לא נפתח מחדש |
| **E2E coverage floor** (step) | — | exit 1 כש-`EXECUTED==0` — מנגנון אמיתי נגד «ירוק כי כלום לא רץ» (MEH-1604) | — | לא נבנה | חלק מ-18; נרשם כי הוא הדוגמה הנגדית — step שכן מודד |

### 2.4 workflows עצמאיים

| check | (a) | (b) | (c) | **דלי** |
| -- | -- | -- | -- | -- |
| **Adversarial review (calibration)** | 56/60 success, 0 failure, 4 cancelled | `continue-on-error: true` — כשל לא היה מאדים ממילא | 2m27s | **CANNOT-FAIL** כשער — **במכוון** (calibration, MEH-569). הערך שלו הוא התגובה, לא הצבע. לא מומלץ לשנות לפני שה-tally של MEH-569 קיים |
| **parity** (i18n ICU) | `33400272940` (31/08, `meh-2185`): `[HE-MISSING] … missing required branches ['two']` — **7 כשלים אמיתיים ב-31/08** | — | 16s | **KEEP-PER-PR** — תפיסות מוכחות, 16 שניות, ה-self-test שלו **נאכף ב-CI** (must exit 1) |
| **pip-audit / npm audit** (dependency-audit) | 10 כשלים — **כולם** ERESOLVE על ענף `eslint-plugin-unicorn-73` | — | 41s | **KEEP-PER-PR** — `pip-audit --strict` הוא ה-gate שתפס 31 פגיעויות ב-MEH-1585 (מחוץ לחלון); בחלון רק תשתית |
| **Skills supply chain audit** | 30/30 success; **אין ריצה אחרי 16/08** (מגודר paths — לא נגעו) | — | 19s | **KEEP-PER-PR** — ה-self-test מול fixture זדוני **חייב** לצאת 1 ו-CI מאשר זאת (skills.md Layer 4). שער שמוכיח את עצמו בכל ריצה |

---

## 3 · רשימת ה-CANNOT-FAIL — עם שחזור לכל אחד

| # | מה | השחזור | כרטיס |
| -- | -- | -- | -- |
| 1 | Backend mypy (warn-only) | `pr-checks.yml:531-555`: `continue-on-error: true` + `mypy … \|\| true` — כל exit → success; האגרגטור בודק `check` (skip ∨ success) | MEH-1868 |
| 2 | Frontend Knip (warn-only) | אותן שתי שכבות; **נמדד** `33507326147`: job failure, gate env `success` | MEH-1868 |
| 3 | Frontend tsc strict (warn-only) | אותן שתי שכבות, אותה ריצה | MEH-1868 |
| 4 | Linear mention guard | `\|\| true` + לא ב-`needs:`; **נמדד** PR #2465 | rule 29 |
| 5 | Frontend lint — **חצי ה-RTL** | planted `ml-4 text-left` → 0 errors / 2 warnings / exit 0; `no-restricted-syntax: "warn"`, אין `--max-warnings` | **חדש — אין כרטיס** |
| 6 | qa-artifacts size cap — **על `frontend/qa-artifacts/`** | pathspec מעוגן לשורש; 14.8MB עברו | MEH-2184 |
| 7 | Playwright WebKit shadow | `continue-on-error` + מחוץ ל-`needs:` | MEH-1788 (בכוונה) |
| 8 | QA report comment | `e2e.yml:306` לא קורא ל-verdict | MEH-2196 |
| 9 | Adversarial review | `continue-on-error` | MEH-569 (בכוונה) |
| 10 | 4 guards בתוך Repo guards: `docs-ordering` · `israel-clock` · `vrt-baseline-sync` · `openapi-codegen` B/C | exit 0 תמיד / מדולגים ב-CI (אין venv/orval) | MEH-1868 (מחלקה), MEH-2103 (docs-ordering, בכוונה) |
| 11 | Branch name gate — **כשער merge** | ה-job כן נכשל, אבל באף אגרגטור ולא ב-ruleset ⇒ אדום שלו אינו חוסם | **חדש — אין כרטיס** |

**#5 ו-#11 הם שני הממצאים החדשים של האודיט.** השאר מולבנים מול כרטיסים קיימים (§4).

---

## 4 · ליבון שבעת המופעים מ-§2 בכרטיס

| מופע | הכרטיס | האודיט |
| -- | -- | -- |
| QA reporter inert (`e2e.yml:306`) | MEH-2196 | **מסכים** — §3 #8 |
| ארבעה שערים ב-warn-only | MEH-1868 | **מסכים ומרחיב**: mypy/knip/tsc (§3 #1-3) + 4 guards בתוך Repo guards (#10). **ונמדד** מה שהכרטיס הסיק: כשל job של Knip נמחק לפני שהאגרגטור רואה |
| VRT `maxDiffPixelRatio: 0.02` | MEH-1765 | **מסכים**; לא נמדד מחדש — הריצה היחידה שנקראה (`33510108748`) נפלה על `map.png` ב-**ratio 0.08**, כלומר מעל הסף, ולכן אינה ראיה לאף כיוון על הסף עצמו |
| ארבע assertions שאיבדו יכולת להיכשל | MEH-1930 | **מסכים, ומוסיף מקרה חמישי**: `33-admin-producers-tab.spec.ts:105` — `REAL_STATUS_CLASSES` נוקב `bg-green` ל-approved בעוד הקוד מרנדר `bg-primary` מאז 07/05; הטסט ירוק כי הוא בודק רק «לא `bg-gray-100`» (A′ של MEH-2168, הלילה) |
| האגרגטור ממפה `cancelled` ל-FAIL | MEH-1907 | **מסכים; חלקית כבר תוקן** — `ci-gate` נוקב SUPERSEDED (`is_cancelled`) בריצות מ-01/09; `deploy-gate` ו-`e2e-gate` עדיין לא (`docs/ci/pr-checks-cancelled-not-failure.patch.md`) |
| #3201 squash טען vitest ירוק כשהיה cancelled | — | **מסכים**; זה כשל של **הדיווח** (מי שכתב את ה-squash), לא של השער — אבל הוא הראיה הטובה ביותר שאגרגטור שקורא `cancelled` כ-superseded צריך גם **להדפיס** זאת, לא רק להתעלם |
| `parity` אדום מ-10:02, שני PRs מוזגו | MEH-2235 | **מסכים** — ומכליל: **כל שער מחוץ ל-required set הוא MOVE-TO-MERGE-GATE במונחי אפקט**, כי הוא לא יכול לחסום. זה נכון ל-`parity` (i18n), `E2E gate `, Branch name gate, dependency-audit, skills-audit. ההבדל בין «מודד» ל«חוסם» הוא ruleset 15240090 — של ספיר |

---

## 5 · הצעות — פרוזה בלבד, אפס diff (`.github/**` = deny)

1. **Frontend lint ↔ RTL (§3 #5).** או `"lint": "eslint . --max-warnings 0"` על ה-`no-restricted-syntax` בלבד (להעלות את הכלל ל-`"error"` הוא שינוי אחד ב-`eslint.config.mjs:72`, מחוץ ל-`.github/`) — ואז ה-ratchet של MEH-1868 (`lint-ratchet.mjs`) הוא הצורה הנכונה: **baseline קפוא + איסור גידול**, לא אפס מיידי, כי יש warnings קיימים. **או** לשנות את שם ה-check כך שלא יבטיח מה שאינו בודק. אחד מהשניים; המצב היום הוא שם שמשקר.
2. **Branch name gate (§3 #11).** להוסיף ל-`needs:` של `ci-gate` כ-`check_ran`. שורה אחת ב-`pr-checks.yml`. עד אז ההגנה היא ה-hook, שרץ רק בסשן CC.
3. **AI artifact scan.** להריץ את 2a/2b כ-step בסוף ה-build job, אחרי `npm run build`, במקום job נפרד עם build שני. חוסך ~67s runner לכל PR עם frontend; ה-assertion זהה (הודגם מקומית שהיא מבחינה).
4. **builder-model-guard — פטור לקומיטים שאינם של CC.** 2/7 כשלים בחלון היו על regen של ה-VRT bot ועל עריכת web-UI. הכלל היום: dependabot בלבד. להרחיב ל-`github-actions[bot]` (ה-VRT bot) — שינוי ב-`scripts/checks/builder-model-guard.sh`, **לא** ב-`.github/`, ולכן CC יכולה. עריכת web-UI של ספיר — הכרעה שלה אם היא רוצה trailer ידני או פטור לפי author.
5. **Playwright E2E — עד שהסוויטה ירוקה.** לא למחוק. להשאיר על push ל-`staging`, ולהפעיל על PR לפי label (התבנית של `vrt-label-trigger.patch.md`). ברגע ש-MEH-2168 מנקה את 4 הקבצים — לחזור ל-per-PR **ולהכניס ל-required set** (`e2e-gate.patch.md` מוכן; זה מה שהופך «ירוק» ל«חוסם»).
6. **מה לא לגעת בו:** mypy/knip/tsc — ה-ratchet של MEH-1868 הוא התשובה, לא הסרה ולא הפיכה ל-blocking בבת אחת; Adversarial review ו-WebKit — warn-only **בכוונה**, עם כרטיס שמחזיק את ההחלטה.

---

## 6 · מה לא הוכרע — ו«לא יודעת» נכתב במפורש

- **pip-audit (ה-leg ב-pr-checks)** — לא נצפה כשל, לא נבנה קלט. פתוח.
- **Frontend build** — כשל `npm run build` אמיתי לא נצפה בחלון; לא נבנה. «כנראה מבחין» אינו ורדיקט, ולכן KEEP נשען על הפונקציה (compile gate) ולא על ראיה מהחלון.
- **02–14/08 ו-16–27/08** — לא נמנו (§0). כל «לא נצפה» מוגבל לזה.
- **משכים** — wall-clock. `gh api …/timing` היה נותן דקות חיוב; לא זמין.

---

## 7 · סיכום מספרי (נגזר מהטבלאות, לא מוצהר)

| דלי | checks |
| -- | -- |
| **KEEP-PER-PR** | 14: Branch name gate · DNM gate · Repo guards · qa-artifacts cap (חצי) · Frontend build · AI artifact scan · pytest · ruff · Env drift · vitest · API contract static · parity · dependency-audit · skills-audit |
| **MOVE-TO-MERGE-GATE** | 1: Playwright E2E (זמנית, עד ירוק; ואז required) |
| **CANNOT-FAIL** | 9 שורות ב-§3 (+2 «בכוונה»: WebKit, Adversarial review) |
| **פתוח** | 1: pip-audit leg |

**שני ממצאים חדשים:** (1) «Frontend lint (RTL + Next.js rules)» אינו יכול להאדים על RTL; (2) «Branch name gate» אינו יכול לחסום merge. שניהם ניתנים לתיקון בשורה אחת כל אחד, ושניהם הכרעת ספיר.

---

_מקורות: `.github/workflows/*.yml` @ `origin/staging` `c31180fe`; GitHub MCP `actions_list`/`get_job_logs` (חלונות ב-§0); adversarial inputs הורצו מקומית 01/09 לילה, drain יט'. הכרטיסים המצוטטים לא נערכו._
