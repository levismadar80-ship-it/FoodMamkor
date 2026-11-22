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
| Vercel preview של commit של Claude | נחסם בתוכנית Hobby | צילומים מ-build מקומי (כבר מותר בכלל 38), או Vercel Pro |
| אחסון artifacts | עלול להתמלא | לבדוק אחרי שבוע |

---

## מה ממשיך לעבוד

- **ה-runner.** כל `runs-on` ב-`.github/workflows/` כתוב
  `(vars.CI_MODE == 'private' || github.event.repository.private) && 'self-hosted' || 'ubuntu-latest'`.
  ריפו פרטי ⇒ כל ה-jobs על ה-runner, ו-self-hosted לא צורך דקות
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
   **החלטת ספיר, 21/11: לוקחת את הסיכון לבינתיים** (בלי Pro). מה שנשאר: הכללים
   (merge ל-staging רק אחרי `CI gate` + `Deploy gate` ירוקים, staging → main רק
   ב-«go merge») נשמרים ע"י הסשנים עצמם, לא ע"י GitHub. ה-checks ממשיכים לרוץ
   ולהופיע על כל PR — רק ש-GitHub לא יחסום merge אדום.
2. **Vercel Hobby + ריפו פרטי.** Vercel בונה commit מריפו פרטי רק אם ה-author
   שלו הוא בעל חשבון ה-Hobby
   ([troubleshoot project collaboration](https://vercel.com/docs/deployments/troubleshoot-project-collaboration)).
   ה-commits של Claude נכתבים כ-`Claude <noreply@anthropic.com>` (נמדד על
   `feature/meh-3026-license-not-a-blocker`), אז ה-preview של commit `[preview]`
   ייחסם. **מה לא נפגע:** ה-E2E רץ מול `next start` מקומי בתוך ה-runner, לא מול
   ה-preview (`e2e.yml:3`, `PLAYWRIGHT_BASE_URL: http://localhost:3000`); ענפי
   `dependabot/*` כבר לא נפרסים (`frontend/vercel.json`); merge ל-staging/main
   נעשה ב-squash בשם `levismadar80-ship-it`, אז הוא ייבנה **אם** חשבון Vercel
   מחובר לאותו משתמש GitHub — לא אומת.
   **מה אפשר לעשות, מהזול ליקר:**
   - (א) לא לעשות כלום: כלל 38 כבר מתיר צילומים מ-build ייצור מקומי כשאין
     preview. מחיר: אין קישור preview לשלוח.
   - (ב) commit ה-`[preview]` נכתב בשם בעלת החשבון: `git commit --author=
     "levismadar80-ship-it <269745446+levismadar80-ship-it@users.noreply.github.com>"`.
     GitHub משייך את כתובת ה-noreply הזאת למשתמש, ולכן Vercel אמור לזהות את
     הבעלים. **לא נוסה** — לבדוק בשלב 2 של הניסיון. ה-trailer
     `Co-Authored-By: Claude` נשאר.
   - (ג) Vercel Pro — הפתרון הבטוח, בתשלום חודשי.
3. **ה-runner חייב Docker על Linux.** חמישה jobs משתמשים ב-`services:`
   (Postgres): `pr-checks.yml:409`, `pr-checks.yml:683`, `e2e.yml:273`,
   `backup-restore-verify.yml:39`, `:133`. service containers עובדים רק על runner
   Linux. runner שמותקן ישירות על Windows יפיל את pytest ו-E2E. לא נמצאה תיקיית
   runner בתיקיית הבית במחשב (21/11) — לא ידוע איפה ואיך הוא מותקן.
4. **המחשב הוא כל ה-CI.** כל ה-jobs רצים בתור על מכונה אחת. cron של uptime
   (כל 30 דק'), ה-nightly וה-WebKit השבועי לא ירוצו כשהמחשב כבוי. איך להשאיר
   אותו זמין — בסעיף «להשאיר את ה-runner דלוק» למטה.
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

## להשאיר את ה-runner דלוק

**מצב ב-21/11 (הוקם באותו יום):** runner בשם `topazschnapp-wsl` (labels
`self-hosted,Linux,X64`), בתוך WSL2 Ubuntu 26.04, כשירות systemd תחת משתמש נפרד
`ghrunner`, עם Docker Engine. ההתקנה: `C:\Users\topaz\runner-setup\setup-in-ubuntu.sh`
(בתוך Ubuntu) ו-`admin-power-and-autostart.ps1` (PowerShell כמנהל). ב-`/etc/wsl.conf`
כבויים `automount` ו-`interop`, כך שה-runner לא רואה את `C:\`.

**כלים שה-workflows מניחים שמותקנים** (ב-`ubuntu-latest` הם מותקנים מראש; כאן לא):
`sudo apt-get install -y jq gh zip unzip postgresql-client` — הותקנו ב-21/11.
בדיקה (בתוך Ubuntu כ-`ghrunner`): `for t in git curl jq gh zip unzip xz file bc python3 psql pg_dump docker; do command -v $t >/dev/null || echo "MISSING $t"; done`.
Python 3.11/3.12 (`setup-python`) ו-Playwright 1.65 תומכים ב-Ubuntu 26.04 (נבדק ב-manifest).

1. **ה-runner כשירות, לא בחלון פתוח.** בתוך WSL2 (Ubuntu) עם Docker:
   `./config.sh --url https://github.com/levismadar80-ship-it/FoodMamkor --token <מה-GitHub>`
   ואז `sudo ./svc.sh install && sudo ./svc.sh start`
   ([docs](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/configuring-the-self-hosted-application-as-a-service)).
   השירות עולה לבד אחרי restart, בלי להתחבר.
2. **WSL לא נכבה.** WSL מכבה את ה-VM כשאין בו תהליכים. ב-`/etc/wsl.conf`:
   `[boot]` + `systemd=true` (כדי שהשירות ירוץ), וב-`%UserProfile%\.wslconfig`:
   `[wsl2]` + `vmIdleTimeout=-1`. ב-Task Scheduler: משימה «At startup» שמריצה
   `wsl.exe -d Ubuntu --exec sleep infinity` בחלון מוסתר, בלי מגבלת זמן.
   **לא `/bin/true`:** נמדד ב-21/11 ש-WSL מכבה את Ubuntu שניות אחרי שהתהליך
   האחרון שהופעל מ-Windows נסגר, גם כשה-runner רץ בפנים ו-`vmIdleTimeout=-1`.
3. **Windows לא נרדם.** Settings → System → Power: Sleep = Never כשמחובר לחשמל;
   מכסה סגור (לפטופ) = Do nothing. Windows Update → Active hours, כדי ש-restart
   לא ייפול באמצע ריצה.
4. **לדעת כשהוא נפל.** GitHub מסמן runner כבוי `Offline`, אבל לא שולח התראה.
   job שמחכה ל-runner נשאר `Queued` עד 24 שעות ואז נכשל. ה-uptime probe עצמו רץ
   על ה-runner, אז הוא לא יגלה את זה. בדיקה ידנית: PR שתקוע ב-«Waiting for a
   runner» = המחשב כבוי.

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
4. PR ניסיון: commit `[preview]` של Claude (צפוי להיחסם), ואחריו commit `[preview]`
   עם `--author` של הבעלים (אפשרות ב׳) — האם נבנה? ה-E2E רץ על ה-runner?
5. merge ל-staging: Vercel ו-Railway פורסים.
6. סשן Claude חדש: clone ו-push עובדים.
7. **חזרה:** Change visibility → Public. הכל חוזר, חוץ מכוכבים ו-watchers.
