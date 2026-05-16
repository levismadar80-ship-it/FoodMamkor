# Synthetic monitoring — UptimeRobot

> Defense-in-depth alongside Sentry. Sentry catches exceptions in code that ran; synthetic monitoring catches the case where code did not run at all (host down, DNS dead, certificate expired, free-tier dyno cold-stalled). Pair both.

This file is a setup runbook for Smadar. Claude Code does not own the UptimeRobot dashboard — the setup is manual UI clicks, documented here so the steps are reproducible if the account is ever reset.

---

## 1. Overview — what synthetic monitoring catches

| Failure mode | Sentry | UptimeRobot |
|---|---|---|
| `TypeError` in React render | ✅ caught | — |
| 500 from a route handler | ✅ caught | ✅ (if endpoint is monitored) |
| Container OOM-killed, no process | ❌ no SDK alive to send | ✅ (5-min interval probe) |
| Railway dyno cold start > 8s | ❌ event lost on slow boot | ✅ (response-time alert) |
| Vercel build broken, prod stale | ❌ runtime is fine | ✅ (depends what's monitored) |
| TLS certificate expired | ❌ HTTPS fails before any SDK | ✅ (cert-expiry alert) |
| DNS misconfigured | ❌ requests never reach us | ✅ (probe fails) |

Sentry is necessary; it is not sufficient. The 3am-Railway-cold-start scenario in MEH-563's body is the canonical case — without a synthetic probe nobody learns of the outage until a user complains.

Vendor-neutral: UptimeRobot is the recommended starting point (free tier covers our needs). Alternatives if requirements grow:
- **Better Stack** — richer free tier, status-page included, incident management.
- **Checkly** — browser-level probes (executes JS), better for SPA-style flows.
- **Pingdom / Datadog Synthetic** — enterprise; overkill at this stage.

---

## 2. UptimeRobot account setup

1. Open <https://uptimerobot.com> → **Register Free**. Sign up with the Mehamakor ops email.
2. Verify the email; log in.
3. **Free tier limits (verify current at signup — vendor can change):**
   - 50 monitors
   - 5-minute minimum check interval
   - Email alert channel included; SMS/Slack/PagerDuty require paid plan
   - 90-day uptime history
4. Under **My Settings → Alert Contacts**, confirm the ops email is the default contact. Add a second backup contact (Sapir or a personal email) so a single-mailbox outage does not silence the channel.

---

## 3. Three monitors to create

All three live on the free tier. Total checks/day: `3 × (1440/5) = 864` — orders of magnitude under any documented free-tier quota.

| # | Name | URL | Type | Interval | Expected | Why |
|---|---|---|---|---|---|---|
| 1 | `backend-health` | `https://foodmamkor-production.up.railway.app/health` | HTTPS | 5 min | HTTP 200 | FastAPI health endpoint; cheapest possible probe, no DB read |
| 2 | `backend-producers` | `https://foodmamkor-production.up.railway.app/producers?page_size=1` | HTTPS | 5 min | HTTP 200, response body contains `"producers"` | Smoke-test that DB is reachable and query path works |
| 3 | `frontend-home` | `https://mehamakor.online/` | HTTPS | 5 min | HTTP 200 | Vercel frontend reachable; catches CDN / deploy / DNS issues |

For monitor 2, use UptimeRobot's **Keyword** monitor type so a 200 with an empty/error JSON body still alerts. The keyword field: `producers`.

For all three, enable **SSL certificate expiry monitoring** (UptimeRobot ticks this by default for HTTPS — confirm under monitor settings). Alert threshold: 14 days before expiry.

Do **not** monitor `/login` directly with a synthetic probe (the issue body suggested it). A GET `/login` is a frontend route, redundant with monitor 3; a POST `/auth/login` requires real credentials and is the wrong shape for a synthetic probe. If we ever need a login-path probe, use Checkly with a scripted browser flow — out of scope for free-tier UptimeRobot.

---

## 4. Alert routing

**Today (free tier):**
- All three monitors → email the ops contact (and the backup contact).
- Alert when: down detected, recovered, SSL within 14 days of expiry.

**Future (only if pager fatigue is the bottleneck):**
- Slack: requires UptimeRobot paid tier OR a tiny Cloud Function that receives UptimeRobot webhooks and posts to Slack. Defer until launch traffic justifies it.
- SMS: paid tier; do not add until at least one missed-email incident proves email alone is insufficient.

**Anti-pattern:** routing all three monitors to the same channel with the same severity. Monitor 1 (`/health`) is the canonical "site down" — keep that as page-worthy. Monitors 2 and 3 are secondary; if those alert but monitor 1 is green, the issue is partial (DB-only or frontend-only), not a full outage.

---

## 5. Status page (optional)

UptimeRobot's free tier ships a public status page per account. To enable:

1. **Dashboard → Public Status Pages → Add Public Status Page**.
2. Name: `מהמקור — סטטוס`.
3. Add all three monitors.
4. Custom domain: optional (paid). Default URL: `https://stats.uptimerobot.com/<id>`.
5. Link it from the site footer once launch traffic exists — pre-launch, keep private.

Decision: **defer publishing** until 30 days of stable monitoring history exist. A status page showing daily 503s erodes trust faster than no status page.

---

## 6. Runbook — when an alert fires

Cap each branch at 5 steps per `<constraints>` in MEH-563.

### Alert: monitor 1 (`backend-health`) DOWN
1. Open <https://railway.app/dashboard> → mehamakor project → **believable-tenderness**.
2. Check deploy logs for the last 10 minutes — look for OOM, crash loop, or failed deploy.
3. If logs show OOM or crash loop: redeploy the previous green commit (Settings → Deployments → ⋯ → Redeploy).
4. If logs are clean but health still 503: check Railway status page (<https://status.railway.com>) — could be platform-wide.
5. If platform is healthy and our service is broken: open a SEV-1 in Linear (see `docs/BUG_SEVERITY.md`), tag Smadar.

### Alert: monitor 2 (`backend-producers`) DOWN, monitor 1 GREEN
1. DB-side problem (Railway Postgres or query path). Health endpoint does not touch the DB; producers does.
2. `railway logs -s postgres` (from Smadar's terminal — Claude Code is denied this; see `.claude/rules/security.md`).
3. Check Railway Postgres metrics for connection saturation, disk-full, lock contention.
4. If DB is healthy: the query itself is broken — open Linear ticket with the failing URL.
5. Severity: SEV-2 (subset of routes broken, login still works) per `docs/BUG_SEVERITY.md`.

### Alert: monitor 3 (`frontend-home`) DOWN, monitors 1 + 2 GREEN
1. Frontend-only. Backend is fine.
2. Vercel dashboard → mehamakor.online → check most recent deployment status.
3. If most recent deploy failed: roll back via Vercel UI to the last green deployment.
4. If deploys are green but the site is 5xx: check Vercel status (<https://www.vercel-status.com>).
5. Severity: SEV-1 (site visibly down) per `docs/BUG_SEVERITY.md`.

### Alert: SSL certificate expiring (any monitor)
1. Production cert is auto-renewed by Vercel (frontend) and Railway (backend). A 14-day alert means auto-renewal failed.
2. Vercel: check **Settings → Domains → Certificate Status**; click Renew if stuck.
3. Railway: certs are platform-managed; open a Railway support ticket if Renew is unavailable in dashboard.
4. Do not edit DNS during an active alert — verify auto-renew first.
5. Severity: SEV-2 until 3 days before expiry; SEV-1 inside 3 days.

---

## Cross-references

- `.claude/rules/observability.md` — dashboard-receipt protocol for **events that did fire**; this doc handles the **events that didn't fire** case.
- `docs/BUG_SEVERITY.md` — SEV-1..SEV-4 SLAs referenced in §6.
- `docs/SECURITY.md` — TRAP 9 baseline + cert / TLS handling.
- `.claude/rules/security.md` — deny-list for production commands (the runbook above only references commands Smadar runs from her own terminal).
