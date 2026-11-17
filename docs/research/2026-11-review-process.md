**התשובה:** הריוויו שלנו כבר רב-שלבי (FINDER → ADVERSARY → REFEREE + ריוויואר טרי + `/security-review` בתחומים רגישים), אבל **אין שום בדיקת אבטחה שחוסמת מיזוג מעבר ל-pip-audit**. הכי משתלם להוסיף: **CodeQL (חינם בריפו ציבורי) כבדיקה חוסמת**. ריוויו מרובה סוכנים עם הצבעה — רק ל-PR-ים מסוג RED, כי הוא מכפיל את צריכת המכסה.

# תהליך ריוויו: מה יש, מה בחוץ, מה להוסיף

> **דוח מחקר בלבד.** לא שונו workflow, כללים או הגדרות. ההחלטות של ספיר. נכתב 17/11/2026 מול `origin/staging` (`e43e137`).
> שינוי ב-`.github/**` חסום ל-CC ממילא (`.claude/rules/security.md`); כל המלצה כאן שנוגעת שם היא patch שספיר מחילה.

---

## 1. מה יש היום (נבדק)

| שכבה | מה | חוסם מיזוג? | ראיה |
|---|---|---|---|
| CI | ‏~20 jobs: build, pytest (shards), vitest, mypy, tsc, knip, lint, env-drift, ‏Repo guards (68 סקריפטים) | כן, דרך `CI gate` + `Deploy gate` | `.github/workflows/pr-checks.yml:53-1081`; ‏`.claude/rules/testing.md` (MEH-716) |
| תלויות | pip-audit ב-PR (רק כשמניפסט השתנה) | כן | `pr-checks.yml:1058-1078, 1210-1218` |
| תלויות | npm audit + pip-audit שבועי | לא | `.github/workflows/dependency-audit.yml:5-6` |
| ריוויו AI ב-CI | Claude (Sonnet) עם `continue-on-error`, **כבוי מ-8/11** | לא | `.github/workflows/claude-review.yml:46-56, 154`; ‏`workflow.md` |
| ריוויו מקומי | `/adversarial-review`: FINDER → ADVERSARY → REFEREE, ‏+4 וריאנטים | בכלל (rule 5a), לא מכנית | `.claude/commands/adversarial-review.md:1-20` |
| ריוויואר טרי | subagent חדש על ה-diff וה-acceptance criteria; תקרת 3 סבבים | בכלל | `.claude/rules/testing.md` כלל 5a |
| אבטחה | `/security-review` ל-auth / upload / routers, ‏+ חיפוש CVE | בכלל | `.claude/rules/security.md` |
| כותרות אבטחה חיות | אחרי פריסה | לא | `post-deploy-checks.yml:127-128` |
| **CodeQL / Semgrep / סריקת סודות ב-CI** | **אין** | — | grep `codeql\|semgrep\|gitleaks` ב-`.github` → 0 |
| CODEOWNERS | בעלים אחד, מגן על `.github/` ו-`.claude/` | אם מוגדר ב-ruleset | `.github/CODEOWNERS:3-7` |

## 2. מה בחוץ

**ריוויו מרובה סוכנים**
- **Claude Code Review** (מנוהל): כמה סוכנים במקביל, שלב אימות שזורק ממצאים שלא מחזיקים, דירוג. **Team/Enterprise בלבד**, ‏GitHub בלבד, **לא חוסם** (ה-check לא נכשל), חיוב לפי טוקנים — ‏$15–25 לריוויו לפי דיווחי ההשקה ([docs](https://code.claude.com/docs/en/code-review) · [Help Net Security](https://www.helpnetsecurity.com/?p=360979)).
- **Cursor Bugbot** — הגרסה המוקדמת הריצה 8 מעברים עם סדר diff אקראי, וזרקה באג שנמצא רק במעבר אחד: **הצבעת רוב מפורשת**; שיעור תיקון עלה מ-52% ליותר מ-70% ([Cursor blog](https://cursor.com/blog/building-bugbot)).
- **מחקר:** קונצנזוס של כמה מודלים העלה דיוק ב-10–12% ו**הוריד false positives, אבל פספס יותר** חולשות; סף גבוה יותר = יותר דיוק, פחות כיסוי ([arXiv 2512.12536](https://arxiv.org/html/2512.12536)). איחוד (union) של 4 סוכנים: כיסוי 82.7% אבל 85% false positives ([arXiv 2602.17875](https://arxiv.org/html/2602.17875v1)).
- **`/code-review` מקומי** (כינוי `/review`) — כל תוכנית, נספר על המכסה; ‏effort low מחזיר רק ממצאים בטוחים ([docs](https://code.claude.com/docs/en/code-review-local)).

**אבטחה שחוסמת מיזוג**
- ‏Rulesets: ‏«Require status checks» ו-«Require code scanning results» לפי חומרה; בריפו ציבורי זמינים בחינם ([GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)).
- בריפו **ציבורי**: CodeQL, ‏dependency review, סריקת סודות ו-push protection — חינם. בריפו **פרטי** בתוכנית Free/Pro: CodeQL חסום ([GitHub security features](https://docs.github.com/en/code-security/getting-started/github-security-features)).
- ‏`anthropics/claude-code-security-review` — Action, ריוויו אחד (לא מרובה), דורש API key, **לא מוגן מפני prompt injection** לפי ה-README; חסימה לא מתועדת ([repo](https://github.com/anthropics/claude-code-security-review)).
- Semgrep CE — חינם, קובץ-בודד בלבד ([Semgrep](https://docs.semgrep.dev/faq/comparisons/opengrep-1)).

**מכסה**
- Claude ו-Claude Code חולקים את אותן מגבלות (חלון 5 שעות + שבועי); עם `ANTHROPIC_API_KEY` החיוב עובר לתעריף API ([Help Center](https://support.claude.com/en/articles/11145838)). אין מספרי טוקנים רשמיים.
- ב-Actions: ‏`ANTHROPIC_API_KEY` (API) או `CLAUDE_CODE_OAUTH_TOKEN` (המנוי); בריפו ציבורי דקות Actions חינם ([docs](https://code.claude.com/docs/en/github-actions)).

## 3. אפשרויות

**א — CodeQL כבדיקה חוסמת (default setup, ‏Python + JS)**
- בעד: חינם כל עוד הריפו ציבורי; דטרמיניסטי — אותו קוד, אותה תשובה; תופס מחלקות (injection, ‏path traversal) ש-LLM מפספס לפעמים. זו הבדיקה הסטנדרטית בתעשייה.
- נגד: הריפו ציבורי **זמנית** (MEH-2891); בפרטי + Free זה נעלם. ‏false positives בהתחלה; ‏~5–10 דקות לכל PR.

**ב — ריוויו מרובה סוכנים עם הצבעה, רק ל-RED** (3 ריוויוארים טריים, ממצא עולה רק אם 2 מתוך 3 מצאו)
- בעד: פחות רעש מהריוויואר היחיד (הדפוס של Bugbot והמחקר); נבנה מ-subagents שכבר בשימוש, בלי ספק חדש.
- נגד: פי 3 מכסה לכל PR כזה; ההצבעה מורידה כיסוי — באג שרק אחד ראה נזרק. ב-RED כיסוי חשוב יותר מרעש.

**ג — Claude Code Review המנוהל**
- בעד: הכי עמוק, עם שלב אימות מובנה, בלי לתחזק כלום.
- נגד: דורש Team/Enterprise; ‏$15–25 ל-PR; לא חוסם; עם ~10 PR-ים ביום זה מאות דולרים בחודש.

**ד — סריקת סודות + push protection**
- בעד: חינם בציבורי; חוסם סוד לפני שנכנס להיסטוריה (MEH-2890 כבר סרק ידנית).
- נגד: אותה תלות בריפו ציבורי.

**ה — להחזיר את `claude-review.yml` (כבוי)**
- בעד: כבר בנוי ומכויל חלקית.
- נגד: כבוי בהחלטה עד MEH-569; כפילות לריוויואר הטרי.

## 4. המלצה ועלות במכסה

| # | מה | עלות | מכסה | מתי |
|---|---|---|---|---|
| 1 | **א + ד**: CodeQL default setup + secret scanning + push protection, ו-«Require code scanning results» (High+) ב-ruleset של staging | חינם (ציבורי); ~15 דק' הגדרה של ספיר בהגדרות GitHub | 0 | עכשיו, לפני שהריפו חוזר לפרטי — ואז להחליט |
| 2 | **ב** רק ל-RED: 3 ריוויוארים, ממצא עולה ב-2/3, **ובנוסף** כל ממצא אבטחה של אחד בלבד עולה כ«לבדוק» | ~חצי יום לכתוב פקודה | ~×3 מהריוויואר היחיד. בהערכה (לא נמדד): ריוויואר Sonnet על diff בינוני ≈ 50–150K טוקנים → ×3 ≈ 150–450K ל-PR RED. עם ~2 PR-ים RED ביום — חלק קטן מהמכסה השבועית, אבל לא זניח | אחרי ההשקה |
| 3 | `/code-review` עם effort low כשלב לפני הריוויואר הטרי | 0 | נמוך | אופציונלי |
| — | **ג**, **ה** | — | — | לא עכשיו |

**החלטה שלך שקשורה:** אם הריפו חוזר לפרטי (MEH-2891), ‏1 עולה כסף (GitHub Code Security) — אז צריך לבחור בין לשלם, Semgrep CE, או להישאר בלי.

## מקורות

- [Claude Code — Code Review](https://code.claude.com/docs/en/code-review) · [code-review-local](https://code.claude.com/docs/en/code-review-local) · [GitHub Actions](https://code.claude.com/docs/en/github-actions)
- [Help Net Security — Claude Code Review](https://www.helpnetsecurity.com/?p=360979)
- [Cursor — Building Bugbot](https://cursor.com/blog/building-bugbot)
- [arXiv 2512.12536](https://arxiv.org/html/2512.12536) · [arXiv 2602.17875](https://arxiv.org/html/2602.17875v1)
- [GitHub — rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) · [GitHub security features](https://docs.github.com/en/code-security/getting-started/github-security-features)
- [anthropics/claude-code-security-review](https://github.com/anthropics/claude-code-security-review)
- [Semgrep CE](https://docs.semgrep.dev/faq/comparisons/opengrep-1)
- [Claude Help — usage limits](https://support.claude.com/en/articles/11145838)
