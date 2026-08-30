# ‏מפת egress של סנדבוק CC — מה נגיש, מה חסום, ובאיזה ערוץ

> **‏as-of: 2026-08-26.** כל שורה בקובץ הזה נמדדה בריצה אחת בסשן הזה, עם בקרה
> חיובית שרצה **ראשונה** ושוב בסוף. שום שורה לא הועתקה מ-`CLAUDE.md`, מכרטיס
> קודם או מ-PR קודם — המדידה של 15/08 (PR #2962) הייתה בת 11 יום, ולכן נמדדה
> מחדש ולא הונחה.
>
> **‏מדיניות proxy משתנה בלי הודעה. הקובץ הזה הוא רשומה עם תאריך, לא חוק.**
> לפני שנשענים על שורה כאן — ובמיוחד לפני שמדווחים ל-Sapir ש«אי אפשר להגיע» —
> מריצים מחדש את הסקריפט בסוף הקובץ. שאלו את עצמכם: *נכון נכון ל-מתי, ומה
> השתנה מאז?*

## למה הקובץ הזה קיים

שלושה סשנים שרפו זמן בגילוי חסימות egress אחת-אחת, וסשן אחד כמעט פסל השערה
חיה על סמך probe שמבנית לא יכול היה למצוא את מה שחיפש. המטרה כאן היא שהסשן
הבא **יקרא במקום לגלות מחדש**.

---

## ‏1. שיטה — למה יש בקרה, ולמה היא רצה ראשונה

`curl: (56) CONNECT tunnel failed, response 403` הוא **בדיוק אותו פלט** עבור
ארבעה עולמות שונים: מדיניות proxy, רשת מתה, DNS שבור, ו-proxy שקרס. הפלט לא
מבחין ביניהם.

לכן ה-probe מריץ בקרה חיובית (`api.github.com/rate_limit`) **לפני** כל שאר
ההרצה, ונכשל בקול אם היא שותקת — עם הודעה שאומרת שכל שורת «חסום» בהרצה הזאת
**בטלה** אם הבקרה נפלה. הבקרה רצה שוב בסוף, כדי לתפוס proxy שמת באמצע.

בהרצה שממנה נגזרו כל הטבלאות כאן: הבקרה החזירה **200 בשני הקצוות**. לכן
השליליות למטה הן **ממצא**, לא probe מת.

---

## ‏2. הטבלה — ערוץ `curl` (דרך ה-egress proxy)

הרצה: `2026-08-26T19:37:09Z`. `EXIT` = קוד יציאה של curl.

| host | תוצאה | status | curl exit | הערה |
| -- | -- | -- | -- | -- |
| `api.github.com` | ✅ נגיש | 200 | 0 | **הבקרה** |
| `raw.githubusercontent.com` | ✅ נגיש | 200 | 0 | |
| `registry.npmjs.org` | ✅ נגיש | 200 | 0 | **עוקף את ה-proxy** — ראו §3 |
| `pypi.org/simple/` | ✅ נגיש | 200 | 0 | **עוקף את ה-proxy** — ראו §3 |
| `mehamakor.co.il` | ✅ נגיש | 200 | 0 | פרודקשן, GET בלבד |
| `mehamakor.co.il/api/health/liveness` | ✅ נגיש | 200 | 0 | ה-API של פרודקשן עונה |
| `staging.mehamakor.online` | ⚠️ auth-walled | 302 | 0 | ‏302 ל-`vercel.com/sso-api` — ראו §4 |
| `foodmamkor-staging.up.railway.app` | ⛔ חסום | 000 | 56 | `CONNECT tunnel failed, 403` |
| `railway.app` | ⛔ חסום | 000 | 56 | |
| `backboard.railway.app` | ⛔ חסום | 000 | 56 | |
| `vercel.com` | ⛔ חסום | 000 | 56 | |
| `res.cloudinary.com` | ⛔ חסום | 000 | 56 | |
| `sentry.io` | ⛔ חסום | 000 | 56 | |
| `o0.ingest.sentry.io` | ⛔ חסום | 000 | 56 | |
| `linear.app` | ⛔ חסום | 000 | 56 | ‏אבל ה-MCP עובד — ראו §5 |
| `api.linear.app` | ⛔ חסום | 000 | 56 | ‏אבל ה-MCP עובד — ראו §5 |
| `anthropic.com` | ⛔ חסום | 000 | 56 | ‏`api.anthropic.com` ב-`no_proxy`; ה-apex לא |

**‏10 חסומים · 6 נגישים · 1 auth-walled — סה"כ 17 כתובות.**

### ‏🔴 תיקון ל-`CLAUDE.md:68` — הכותרת `x-deny-reason` אינה קיימת

`CLAUDE.md:68` טוען: *"Egress is blocked by CC's envoy proxy with
`x-deny-reason: host_not_allowed`"*. **הכותרת הזאת לא הופיעה באף תשובה בהרצה
הזאת.** תשובת ה-403 ל-CONNECT נושאת בדיוק שתי כותרות:

```
< HTTP/1.1 403 Forbidden
< X-Content-Type-Options: nosniff
< Connection: close
```

ייתכן שהטענה הייתה נכונה כשנכתבה מול גרסת proxy אחרת; **היא אינה ניתנת
לצפייה היום**, ולכן אין לצטט אותה כסימן זיהוי. הסיבה כן נרשמת — אבל במקום
אחר, ראו מיד.

### איפה הסיבה כן נמצאת

```
curl -sS http://127.0.0.1:41793/__agentproxy/status
```

מחזיר `recentRelayFailures` עם רשומה לכל דחייה:

```json
{ "kind": "connect_rejected",
  "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
  "host": "sentry.io:443" }
```

**‏שימו לב לניסוח של ה-proxy עצמו: "policy denial *or upstream failure*".**
גם ה-proxy אינו מבחין בין השניים. לכן 403 על CONNECT **אינו הוכחה למדיניות**
כשלעצמו — מה שהופך אותו לכזה הוא הבקרה: אותו curl, אותו proxy, אותה שנייה,
שישה hosts עוברים ועשרה נחסמים.

---

## ‏3. שני מסלולים שונים ל«נגיש» — allowlist מול bypass

`registry.npmjs.org` ו-`pypi.org` נגישים **מסיבה אחרת** מ-`api.github.com`:
הם ב-`no_proxy` ולכן **אינם עוברים דרך ה-proxy בכלל**. `api.github.com` כן
עובר, ומותר.

ההבחנה נחוצה כי היא צופה שינוי אחרת: החלטת מדיניות ב-proxy יכולה לסגור את
`api.github.com` ולא תיגע ב-`pypi.org`. הרשימה המלאה של ה-bypass היא הערך של
`no_proxy` (וגם בשדה `noProxy` בפלט ה-status).

---

## ‏4. ‏staging חסום **פעמיים ומשתי סיבות בלתי-תלויות**

`staging.mehamakor.online` **עצמו נגיש** ומחזיר 302 נקי:

```
location: https://vercel.com/sso-api?url=https%3A%2F%2Fstaging.mehamakor.online%2F&nonce=…
```

זו הגנת ה-deployment של Vercel. אבל `vercel.com` — היעד של ההפניה — **חסום
הוא עצמו ב-proxy**. מדוד עם `-L`:

```
curl: (56) CONNECT tunnel failed, response 403
final_status=000  final_url=https://vercel.com/sso-api?...
```

**‏הסרת אחת מהחסימות לא תפתח את staging.** צריך גם bypass ל-SSO וגם ש-
`vercel.com` יותר ב-proxy. זה נמדד — לא הוסק.

> ‏קיים מסלול מתועד לנהיגת Playwright מול staging (כותרות
> `x-vercel-protection-bypass` + `--ssl-version-max=tls1.2`) ב-
> `.claude/rules/testing.md`. הוא פותר את חצי ה-SSO. **הוא לא נבדק בהרצה הזאת**
> ולכן אינו נטען כאן לא לכאן ולא לכאן.

---

## ‏5. שלושה ערוצים נפרדים — וזה המקום שהכי מבלבל

**‏"האם אפשר להגיע ל-X" היא שאלה בלי תשובה עד שאומרים *באיזה כלי*.** שלושה
ערוצים, שלוש מדיניות, והם **אינם מקוננים זה בזה**:

| ערוץ | מי חוסם | ראיה |
| -- | -- | -- |
| `curl` / `fetch` בקוד | ה-egress proxy בלבד | §2 |
| כלי `WebFetch` | **‏קודם** hook של הריפו (MEH-397), **ואז** ה-proxy | להלן |
| כלי MCP (Linear, GitHub, Vercel) | לא ה-proxy הזה — `mcp-proxy.anthropic.com` ב-`no_proxy` | להלן |

### ‏5א. ‏`WebFetch` ו-`curl` נחלקים לשני כיוונים מנוגדים

`.claude/hooks/check-webfetch-allowlist.sh:50-63` מחזיק allowlist משלו,
**שאינו קשור ל-proxy**. התוצאה היא ארבע משבצות, ושתיים מהן מפתיעות:

| host | `curl` | `WebFetch` | הסיבה לפער |
| -- | -- | -- | -- |
| `github.com` | ✅ 200 | ✅ עבר | שניהם מתירים |
| `raw.githubusercontent.com` | ✅ 200 | ⛔ **ה-hook דוחה** | ‏`githubusercontent.com` אינו תת-דומיין של `github.com` |
| `mehamakor.co.il` (פרודקשן) | ✅ 200 | ⛔ **ה-hook דוחה** | ה-allowlist מכיל `mehamakor.online` בלבד |
| `railway.app` | ⛔ 403 | ⛔ **ה-proxy חוסם** | ה-hook דווקא מתיר אותו |

**‏המסקנה התפעולית:** כישלון של `WebFetch` **אינו** ראיה לחסימת egress, וכישלון
של `curl` **אינו** ראיה שה-allowlist דוחה. הודעת השגיאה מבחינה ביניהם — שגיאת
hook פותחת ב-`WebFetch denied: host … not in MEH-397 allowlist`, ואילו חסימת
proxy מחזירה `EGRESS_BLOCKED`. **קראו את ההודעה, אל תסיקו מהכישלון.**

בקרות שהריצו את הטבלה: `github.com/anthropics/claude-code` דרך `WebFetch`
החזיר תוכן אמיתי (`claude-code`) — כלומר `WebFetch` **חי**, ושתי הדחיות למעלה
הן ממצא ולא כלי שבור.

### ‏5ב. ‏🔴 ה-allowlist החי גדול ממה ש-`.claude/rules/skills.md` מתעד

`skills.md:90-95` מתעד **7** hosts. ה-hook החי מתיר **12**:

```
github.com  anthropic.com  claude.com  npmjs.com  pypi.org  mehamakor.online
vercel.com  railway.app  developers.google.com  cloudinary.com  w3.org
developer.mozilla.org
```

חמישה (`claude.com`, `developers.google.com`, `cloudinary.com`, `w3.org`,
`developer.mozilla.org`) אינם בתיעוד. **‏הפער מדווח כאן ולא תוקן** — עריכת
`skills.md` היא שינוי של שכבת ה-guardrail והיא מחוץ לתחום הכרטיס הזה.

### ‏5ג. ‏MCP עובד גם כש-`curl` חסום — וזה לא סתירה

`linear.app` ו-`api.linear.app` מחזירים 403 ב-`curl`, **ובאותו סשן בדיוק** כלי
ה-MCP של Linear החזירו כרטיס מלא. אותו דבר ל-GitHub. תעבורת MCP יוצאת דרך
`mcp-proxy.anthropic.com`, שנמצא ב-`no_proxy`.

**‏לכן: "`curl` ל-`api.linear.app` נכשל" אינו אומר שאי אפשר לקרוא כרטיס.** זו
בדיוק שגיאת המדידה שמייצרת דיווח «חסום» על יכולת שקיימת.

---

## ‏6. מה זה סוגר, ומה זה פותח

### ‏נסגר — לא לנסות שוב, ולא לדווח כ«לא אומת»

| נתיב חקירה | הסיבה |
| -- | -- |
| ‏לוגים / metrics / redeploy של Railway | ‏`*.up.railway.app` + `railway.app` + `backboard.railway.app` חסומים. **‏של Sapir.** |
| ‏dashboard, deployments או quota של Vercel | ‏`vercel.com` חסום. **‏של Sapir.** |
| ‏כל הרצה מול `staging.mehamakor.online` | חסום פעמיים (§4). **‏של Sapir או של CI.** |
| ‏אימות של Sentry ingest מהסנדבוק | ‏`sentry.io` + `o0.ingest.sentry.io` חסומים |
| ‏משיכת נכס מ-`res.cloudinary.com` | חסום |

**‏הניסוח הנכון כשנתקלים באחד מאלה:** *"smoke verification deferred to user
(CC sandbox limitation, see MEH-2090)"*. לעולם לא לסמלץ, לא להסיק מ-staging על
פרודקשן, ולא לדווח «אומת» על סמך קוד שנקרא. **‏סשן שמדווח smoke שלא ביצע מזיק
יותר מסשן שאומר שהוא חסום.**

### ‏נפתח — נגיש, ולכן «לא בדקתי» אינו תירוץ

| נתיב | מה אפשר |
| -- | -- |
| **‏פרודקשן `mehamakor.co.il`** | **GET נגיש**, כולל `/api/*`. זה מה ש-`scripts/checks/smoke_production.py` מנצל. אומת מחדש היום — ‏`CLAUDE.md` צודק בנקודה הזאת. |
| ‏`api.github.com` + `raw.githubusercontent.com` | ‏CI, runs, logs, קבצים גולמיים |
| ‏`pypi.org` · `registry.npmjs.org` | התקנת חבילות עובדת (ועוקפת את ה-proxy) |
| ‏MCP: Linear · GitHub · Vercel | ‏עובדים ללא תלות ב-`curl` (§5ג) |

**‏הכתיבה לפרודקשן אינה נבדקה ואינה נטענת כאן — רק GET נמדד.**

---

## ‏7. שכפול

הסקריפט אינו בריפו במכוון (over-engineering guard: זו טבלה, לא תשתית). להרצה
מחדש, שמרו את הבלוק הזה ל-`/tmp` והריצו אותו:

```bash
CONTROL="https://api.github.com/rate_limit"
# הבקרה ראשונה. אם היא נופלת — כל השאר בטל.
c=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$CONTROL")
[ "$c" = "200" ] || { echo "CONTROL FAILED ($c) — every verdict below is VOID"; exit 1; }
for u in https://foodmamkor-staging.up.railway.app/health https://railway.app \
         https://vercel.com https://mehamakor.co.il/api/health/liveness \
         https://staging.mehamakor.online https://res.cloudinary.com \
         https://sentry.io https://api.linear.app https://api.github.com; do
  printf '%-50s %s (exit %s)\n' "$u" \
    "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$u" 2>/dev/null)" "$?"
done
curl -sS http://127.0.0.1:41793/__agentproxy/status   # recentRelayFailures = הסיבה
```

---

## ‏מקורות

- ‏מדידה: הסשן של 2026-08-26, הרצה `19:37:09Z`, בקרה ירוקה בשני הקצוות.
- ‏PR #2962 (מוזג 16/08) — מיפה מחדש שלושה מתוך ארבעה ציטוטים נורמטיביים
  מ-`MEH-360` (מזהה פנטום) לכרטיס הזה. הרביעי,
  `.github/workflows/e2e.yml:182`, עדיין קורא `MEH-360` — **הקובץ CC-deny,
  והתיקון של Sapir.**
- ‏קבצים נורמטיביים שמצטטים את הכרטיס היום: `CLAUDE.md:68` ·
  `.claude/agents/pr-reviewer.md:66` · `backend/app/sentry.py:16`.
- ‏לוגים היסטוריים (`HANDOFF.md`, `docs/CHANGELOG.md`, audits, qa-artifacts)
  **לא נגעו** — הם רשומה של מה שנכתב אז.
