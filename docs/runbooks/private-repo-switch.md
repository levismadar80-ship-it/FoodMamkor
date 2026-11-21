# Runbook — מעבר הריפו לפרטי (MEH-3568)

מה קורה כש-`levismadar80-ship-it/FoodMamkor` עובר מציבורי לפרטי, מה צריך לבדוק
לפני, ואיך מנסים בלי סיכון. נכתב 21/11/2026, כשהריפו עדיין ציבורי (חשבון
משתמש, לא ארגון). **כל טענה כאן נכונה ל-21/11 — למדוד שוב לפני שסומכים עליה.**

---

## בקצרה

| | אחרי המעבר | מה צריך |
|---|---|---|
| ה-runner במחשב | ממשיך. כל ה-jobs עוברים אליו לבד | המחשב דולק, ה-runner מריץ Docker (Linux / WSL2) |
| clone / pull / push מקומי | ממשיך | Git Credential Manager מחובר לחשבון עם גישה |
| Railway | ממשיך | האפליקציה של Railway ב-GitHub ניגשת לריפו |
| Claude (סשנים בענן, Remote Control) | ממשיך | ה-GitHub App של Claude מותקנת על הריפו (היא כבר) |
| Dependabot | ממשיך | — |
| k6 (`scripts/load-test.js`) | ממשיך — רץ מקומית, לא ב-CI | — |
| **הגנת `staging` / `main` (ruleset 15240090)** | **נשבר בתוכנית Free** | GitHub Pro לחשבון |
| **Vercel previews ו-E2E על PR** | **נשבר בתוכנית Hobby** | Vercel Pro, או להשאיר ציבורי |
| אחסון artifacts | עלול להתמלא | לבדוק אחרי שבוע |

---

## מה ממשיך לעבוד

- **ה-runner.** כל `runs-on` ב-`.github/workflows/` כתוב
  `(vars.CI_MODE == 'private' || github.event.repository.private) && 'self-hosted' || 'ubuntu-latest'`
 . ריפו פרטי ⇒ כל ה-jobs על ה-runner, ו-self-hosted לא צורך דקות
  Actions. רישום ה-runner קשור לריפו, לא לנראות שלו — אין צורך לרשום מחדש.
  ההתנהגות במצב פרטי (E2E רק עם `run-e2e`, shard אחד ל-pytest/vitest, WebKit
  שבועי) מתוארת ב-[DEPLOYMENT.md](../DEPLOYMENT.md) «Two CI modes».
- **PRs מ-fork.** בריפו פרטי אין forks זרים, וזה דווקא מקטין סיכון ל-runner
  במחשב. `staging-health.yml` (`pull_request_target`) ו-`vrt-update.yml` (בדיקת
  `head.repo.full_name`) לא משתנים.
- **`GITHUB_TOKEN`.** ה-`permissions:` המוצהרים ב-workflows לא תלויים בנראות.
- **Railway, Claude, Dependabot** — כולם GitHub Apps עם התקנה על הריפו; הנראות
  לא מבטלת התקנה.

## מה נשבר או בסיכון

1. **הגנת branches.** לפי GitHub, rulesets ו-protected branches זמינים
   **בריפו ציבורי בלבד** בתוכנית Free, ובפרטי רק ב-Pro / Team / Enterprise
   ([about rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets),
   [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)).
   בלי זה `protect-staging` לא אוכף את `CI gate` + `Deploy gate`, ו-push ישיר
   ל-`staging` / `main` עובר. **זה הסיכון הכי גדול.** לא בדקתי איזו תוכנית יש
   לחשבון — זה בהגדרות החיוב שלו.
2. **Vercel Hobby + ריפו פרטי.** Vercel בונה commit מריפו פרטי רק אם ה-author
   שלו הוא בעל חשבון ה-Hobby
   ([troubleshoot project collaboration](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)).
   ה-commits של Claude נכתבים כ-`Claude <noreply@anthropic.com>` (נמדד על
   `feature/meh-3026-license-not-a-blocker`), וגם של Dependabot — ה-preview
   שלהם ייחסם. E2E על PR רץ מול ה-preview, אז גם הוא. merge ל-staging/main
   (squash בשם `levismadar80-ship-it`) כנראה ייבנה, **אם** חשבון Vercel מחובר
   לאותו משתמש GitHub — לא אומת.
3. **ה-runner חייב Docker על Linux.** חמישה jobs משתמשים ב-`services:`
   (Postgres): `pr-checks.yml:409`, `pr-checks.yml:683`, `e2e.yml:273`,
   `backup-restore-verify.yml:39`, `:133`. service containers עובדים רק על runner
   Linux. runner שמותקן ישירות על Windows יפיל את pytest ו-E2E. לא נמצאה תיקיית
   runner בתיקיית הבית במחשב (21/11) — לא ידוע איפה ואיך הוא מותקן.
4. **המחשב הוא כל ה-CI.** כל ה-jobs רצים בתור על מכונה אחת. cron של uptime
   (כל 30 דק'), ה-nightly וה-WebKit השבועי לא ירוצו כשהמחשב כבוי.
5. **אחסון artifacts.** ריפו פרטי ב-Free מקבל מכסת אחסון מוגבלת (500MB לפי
   דף התמחור — לא נבדק כאן), והיא נספרת גם עם runner עצמי. יש 10 `upload-artifact`
   עם retention של 1–30 יום. כשהמכסה מלאה, ה-upload נכשל.
6. **cron והמשתנה `github.event.repository.private`.** לא אומת שהשדה קיים
   ב-payload של `schedule`. אם לא — ה-cron ירוץ על `ubuntu-latest` ויצרוך דקות.
   הגנה: משתנה הריפו `CI_MODE=private` (כבר מוגדר בקוד). זה משתנה
   Actions חדש ב-Settings — צריך את אישור ספיר.
7. **פיצ'רים חינמיים שהולכים.** secret scanning / push protection בריפו פרטי
   דורשים GitHub Advanced Security. שום workflow לא משתמש ב-CodeQL או
   `dependency-review-action`, אז שום דבר לא ייכשל — רק ההגנה תיעלם.
8. **קישורים ציבוריים.** קישורי `github.com/.../blob/...` ב-
   `docs/media-archive.md` וב-`docs/audits/2026-06-mobile-audit-MEH-233.md` לא
   ייפתחו למי שלא מחובר. אין badges ואין `raw.githubusercontent.com` בקוד.
9. **כוכבים.** GitHub מוחק stars ו-watchers כשריפו הופך לפרטי, וזה לא חוזר
   כשמחזירים לציבורי.

---

## מה ספיר עושה לפני

1. GitHub → Settings → Billing: איזו תוכנית יש ל-`levismadar80-ship-it`. Free ⇒
   בלי Pro ההגנה על staging/main נעלמת.
2. Vercel → Settings → Billing: Hobby או Pro, ואיזה משתמש GitHub מחובר.
3. GitHub → Settings → Actions → Runners: ה-runner `Idle`, ומערכת ההפעלה שלו
   Linux (או WSL2 עם Docker).

## ניסיון בטוח, בשני שלבים

**שלב 1 — בלי לשנות נראות (אפס סיכון).**
1. Settings → Secrets and variables → Actions → Variables: `CI_MODE` = `private`.
   כל ה-jobs עוברים ל-runner, והריפו נשאר ציבורי.
2. PR ניסיון קטן (docs) עם הלייבל `run-e2e`. לבדוק: כל ה-jobs נאספו על ה-runner,
   pytest עם Postgres עבר, E2E רץ, `CI gate` ו-`Deploy gate` ירוקים.
3. להשאיר יום אחד ולבדוק שה-nightly וה-uptime רצו.
4. **חזרה:** למחוק את המשתנה. הכל חוזר ל-`ubuntu-latest`.

**שלב 2 — הריפו פרטי (רק אם שלב 1 עבר וסעיפים 1–2 למעלה סגורים).**
1. Settings → General → Danger Zone → Change visibility → Private, בשעה שקטה.
2. מהמחשב: `git pull` ו-`git push` לענף ניסיון.
3. push ישיר ל-`staging` חייב להידחות. אם עבר — ההגנה לא נאכפת, לחזור לציבורי.
4. PR ניסיון עם commit של Claude: ה-preview של Vercel נבנה? ה-E2E רץ?
5. merge ל-staging: Vercel ו-Railway פורסים.
6. סשן Claude חדש: clone ו-push עובדים.
7. **חזרה:** Change visibility → Public. הכל חוזר, חוץ מכוכבים ו-watchers.
