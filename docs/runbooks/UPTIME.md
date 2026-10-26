# Runbook — uptime alert (MEH-2202)

> **Audience:** Sapir, when GitHub opens an `uptime:` issue.
> **Moved here from `HANDOFF.md` on 2026-10-26 (MEH-2345).** It is a standing procedure, not session state, so it does not belong in a file that is archived every week.

**כשמגיעה התראה על issue חדש בכותרת `uptime: mehamakor.co.il probe failing` — לבדוק Railway logs לפני כל דבר אחר.**

| שלב | מה |
| -- | -- |
| 1 | ‏Railway → השירות → **Logs**. ‏boot loop / traceback / `alembic` תקוע = התשובה, ואין טעם לחפש במקום אחר |
| 2 | ‏`https://mehamakor.co.il/api/health/readiness` — `ready` מול `db_init_failed`. ‏readiness בודק DB, liveness לא |
| 3 | ‏Vercel → Deployments — רק אם `/` נפל וה-readiness דווקא ירוק (אז זה ה-frontend, לא ה-backend) |
| 4 | ‏ה-issue **נסגר מעצמו** בריצה הראשונה ששני ה-probes חוזרים 200. אין מה לסגור ביד |

**המנגנון:** `.github/workflows/uptime.yml` — GitHub-hosted runner, cron כל 10 דק', **שני** probes (`/` ו-`/api/health/readiness`). issue נפתח רק אחרי **שני כשלים רצופים**, כדי ששיהוק בודד לא יצלצל. בלי חשבון חיצוני, בלי כסף, בלי secret. ההתראה מגיעה דרך **Repo → Watch → Custom → Issues** — בלי ההגדרה הזו ה-issue נפתח לחדר ריק.

