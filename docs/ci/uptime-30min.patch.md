# Patch — `uptime.yml`: probe every 30 minutes instead of every 10 (MEH-2888)

> **Status: ⏳ NOT APPLIED — written 10/11/2026.** `.github/workflows/**` is
> CC-deny, so CC prepared and checked this patch and Sapir commits it (GitHub
> web editor, one line). See [§6](#6--how-to-apply-sapir-github-web-editor).

## 1 · What it changes (`.github/workflows/uptime.yml`)

| line | today | after |
|---|---|---|
| 9 — the schedule | `cron: "*/10 * * * *"` | `cron: "*/30 * * * *"` |
| 4 — header comment | `…runner every 10 minutes and…` | `…runner every 30 minutes and…` (comment only, so the file doesn't describe the old cadence) |

Nothing else changes. The probed URLs, the exact-`200` rule, the curl retries,
the ×2-consecutive issue logic, the label and the recovery comment all stay
byte-identical.

## 2 · Why: Actions run volume, not money

- **Minutes stopped being the problem on 10/11.** The repo went public that
  day. Standard GitHub-hosted runners are free and unlimited on public
  repositories
  ([GitHub docs](https://docs.github.com/en/billing/concepts/product-billing/github-actions)).
  `docs/audits/2026-11-quota-inventory.md` §1.11 was written for the private
  repo. Its line "`uptime.yml` alone ≈ 4,320 billed min/month, more than the
  whole Free allowance" no longer costs anything.
- **The volume is still there.** `*/10` is **144 runs/day**, out of roughly
  1,000 workflow runs/day in total (inventory §1.11: 973 on 07/11, 1,097 on
  08/11). Those runs crowd the Actions tab and the run list that CC and Sapir
  read to find real CI. After the patch it's **48 runs/day**.
- **Noisy comments.** While an outage issue is open, every failing tick adds a
  `still failing at …` comment, which means 6 an hour. A 4-hour outage writes
  about 22 comments. At `*/30` it writes about 6.
- **Side cost on the site (inventory §1.1).** Every tick also renders the
  production home page on Vercel (SSR, ~140 ms CPU) and runs one DB
  `SELECT 1` through `/api/health/readiness` on Railway. That goes from 144 to
  48 of each per day.

## 3 · Effect on detection time: exactly what changes

The workflow calls no script; all of its logic is the two inline steps in
`uptime.yml:31-103`. Traced from that code, with **P** = the probe interval:

1. **Tick k fails** (first failure). There is no open issue, and the newest
   closed one is not `first-failure-pending`, so the workflow **creates** an
   issue with body `first-failure-pending` and **closes it right away** with
   the comment "waiting for the next tick before alerting" (`:91-94`).
2. **Tick k+1 fails too.** It finds that closed issue with the pending marker,
   rewrites the body to `OUTAGE OPENED …` and **reopens** it (`:86-90`). That
   reopen is the alert.
3. **Tick k+1 passes instead.** It rewrites the body to `single failure,
   recovered…` (`:99-101`), so the marker is cleared and no alert goes out.
4. **Open issue + failing tick** → one `still failing` comment per tick
   (`:84-85`). **Open issue + passing tick** → the issue is closed with
   `recovered at …` (`:97-98`).

So the alert needs **two consecutive failing ticks**, and the "wait one tick"
rule does scale with P. Your question was whether a 30-minute cron means 60
minutes to alert. In the worst case, yes:

| | today (P = 10 min) | after (P = 30 min) |
|---|---|---|
| Outage start → first failing tick | 0–10 min | 0–30 min |
| First failing tick → alert (reopen) | +10 min | +30 min |
| **Outage start → alert** | **~10–20 min** (worst case 20) | **~30–60 min** (worst case 60) |
| Shortest outage that **always** alerts (covers 2 ticks) | 20 min | 60 min |
| Outage that **can never** alert (covers ≤ 1 tick) | < 10 min | < 30 min |
| Recovery → `recovered` close | ≤ 10 min | ≤ 30 min |
| `still failing` comments per hour while open | 6 | 2 |

Add to every row: scheduler delay, plus up to ~2½ min of probe time. Each URL
gets `--max-time 20 --retry 2 --retry-delay 5`, so up to ~70 s per URL and two
URLs in series.

### Other interplay found in the file and next to it

- **Scheduler delay and dropped ticks hit harder.** GitHub says `schedule` runs
  can be delayed under high load, that the start of every hour is a high-load
  time, and that some queued jobs may be dropped
  ([Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)).
  `*/30` fires at `:00` and `:30`, so half its ticks land on the busiest
  minute. A dropped tick pushes "the next tick" out by another P. The pending
  marker survives the gap, so the alert still fires, but the worst case
  becomes **90 min** instead of 30 min today. The alternative cron
  `"7,37 * * * *"` stays off the top of the hour. It isn't in this patch (see
  the next bullet).
- **The unapplied Places probe (`docs/ci/places-health-probe.patch.md`)** gates
  itself on `date -u +%M | cut -c1` = `0`, meaning a run that starts in minutes
  `:00-:09`. With `*/30` only the `:00` tick passes the gate, so it is still
  hourly, still ~720 Google calls/month, and unaffected. Its hunk replaces the
  probe step and doesn't touch lines 4 or 9, so **the two patches apply in
  either order**. One catch: a `:00` tick delayed by ≥ 10 min skips that
  hour's Places check. That was also true at `*/10`. With `"7,37 * * * *"` the
  margin shrinks to 3 min, which is why this patch keeps `*/30`. The Places
  doc's line "The `uptime.yml` schedule is `*/10`" goes stale once this lands.
- **Concurrency and timeout.** `cancel-in-progress: false` and
  `timeout-minutes: 5`. Runs never overlapped at 10 min and can't at 30.
  Nothing changes.
- **60-day auto-disable.** On a public repo, scheduled workflows are disabled
  after 60 days with no repository activity (same GitHub page). That's new
  since 10/11, but the repo merges daily, so it isn't a practical risk.
- **Sentry is now the faster signal.** Sentry uptime monitor `8093256`
  (measured 10/11 via the Sentry API: `GET
  https://mehamakor.co.il/api/producers?limit=1`, interval 300 s,
  `downtimeThreshold: 3`, `recoveryThreshold: 1`, timeout 10 s) raises an issue
  after 3 consecutive failures, about 15 min of downtime
  ([Sentry docs](https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/)).
  That covers the backend + DB path. It does **not** cover the SSR home page
  (`/`) or `/api/health/readiness`; only `uptime.yml` checks those.
- **Possible early email (not verified).** Step 1 *creates* an issue. A repo
  watcher subscribed to Issues may be emailed on that creation, before the
  reopen. The design treats the reopen as the alert.

## 4 · Verification (CC, 10/11)

- `.github/workflows/uptime.yml` in this worktree is identical to
  `origin/staging` at `9fc2b004f` (`git diff --quiet origin/staging -- …` → 0).
- I built the diff with `diff -u` on a copy outside `.github`
  (`…/scratchpad/uptime-check/a.yml`), then ran `git apply --check -v` with the
  patch aimed at `a.yml` → `Checking patch a.yml...` OK.
- The same diff with the real path, run as `git apply --check -v` in a
  staging-based worktree → `Checking patch .github/workflows/uptime.yml...` OK.
  `--check` writes nothing.
- I applied it to the scratch copy: the result is byte-identical to the
  intended file (`cmp`). It parses as YAML, and the parsed cron is
  `*/30 * * * *`.
- **Negative control:** `git apply --check` on the already-patched copy fails
  (`patch does not apply`, exit 1). So the OK result above means something:
  the check can say no.

## 5 · The patch

```diff
--- a/.github/workflows/uptime.yml
+++ b/.github/workflows/uptime.yml
@@ -1,12 +1,12 @@
 name: Uptime probe
 
 # MEH-2202: external, Sentry-independent liveness + readiness probe. Runs on a
-# GitHub-hosted runner every 10 minutes and turns two consecutive failures into
+# GitHub-hosted runner every 30 minutes and turns two consecutive failures into
 # a GitHub issue (label `uptime`), closed again on recovery. No account, no
 # money, no repo secret. Manual dispatch kept for a smoke run after applying.
 on:
   schedule:
-    - cron: "*/10 * * * *"
+    - cron: "*/30 * * * *"
   workflow_dispatch:
 
 permissions:
```

## 6 · How to apply (Sapir, GitHub web editor)

1. Open
   `https://github.com/levismadar80-ship-it/FoodMamkor/edit/staging/.github/workflows/uptime.yml`.
2. **Line 9:** change `"*/10 * * * *"` to `"*/30 * * * *"`. **Line 4**
   (optional, comment only): change `every 10 minutes` to `every 30 minutes`.
3. «Commit changes…» → **Create a new branch**
   `feature/meh-2888-uptime-30min` → Propose changes → open the PR into
   `staging` with `Closes MEH-2888` at the end of the body. `staging` doesn't
   accept direct pushes.
4. Reply on the PR. CC checks the PR diff byte for byte against §5 before it
   merges.

## 7 · After applying

- Actions → «Uptime probe» shows ticks at `:00` / `:30` (give or take
  scheduler delay) and no `:10`/`:20`/`:40`/`:50` runs.
- Optional smoke: `workflow_dispatch` once and look for two `-> HTTP 200`
  lines.
- Follow-up docs, in a separate docs-only PR after the merge (rule 31b): the
  "every 10 min" lines in `docs/audits/2026-11-quota-inventory.md` (§1.1 row
  "What the code generates", §1.11, §1.12), §5 of
  `docs/ci/meh-2202-uptime-workflow.patch.md` ("earliest alert ~20 minutes"),
  and line 25 of `docs/ci/places-health-probe.patch.md`.

## 8 · Free external monitors: replace or complement?

Researched 10/11. The vendor pages for UptimeRobot and Better Stack couldn't be
fetched from this session (WebFetch allowlist, MEH-397), so those rows rest on
search results. **3P** marks a third-party comparison page, which is weaker
than the vendor's own docs. Where nothing was found, the cell says so.

| | UptimeRobot Free | Better Stack Free | Sentry Uptime (org is on Developer) |
|---|---|---|---|
| Min interval | 5 min ([pricing](https://uptimerobot.com/pricing/)) | 3 min ([docs](https://betterstack.com/docs/uptime/check-frequency/)) | 1 min (options 1/5/10/20/30/60 min, [docs](https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/)). Ours runs at 5 min. |
| Monitors | 50 ([pricing](https://uptimerobot.com/pricing/)) | 10 (3P: [productcompass](https://www.productcompass.pm/p/free-uptime-monitoring)) | **1** on Developer ([pricing](https://sentry.io/pricing)), **already used by `8093256`**. Extra monitors are billed from a pay-as-you-go budget, and Developer has none (inventory §1.3). |
| Locations | 4 regions (NA/EU/Asia/AU). On Free the region is auto-assigned; choosing regions or using several per monitor is paid ([help](https://help.uptimerobot.com/en/articles/11358522-understanding-uptimerobot-locations-and-multi-location-feature)) | 10+ locations overall ([betterstack](https://betterstack.com/uptime-robot-alternative)). How many on Free: **not found** | Multiple regions, round-robin, each failed check from a different region (docs). Measured on `8093256`: US West (Oregon), US East (Virginia), US East (South Carolina). |
| Alert channels | Email + mobile push. Slack and webhooks reported as paid-only (3P: [notifier](https://notifier.so/guides/uptimerobot-pricing-2026/), [dev.to](https://dev.to/r0tten0x/uptimerobot-free-plan-in-2026-the-limits-thatll-actually-bite-you-445g)) | Email + Slack (3P: productcompass). Webhook on Free: sources conflict, **not confirmed** | Email on Developer. Slack and third-party integrations are listed under Team ([pricing](https://sentry.io/pricing)), so Developer support is **not confirmed**. All 5 of our alert rules are email (inventory §1.3). |
| Creates a Linear issue? | No native integration **found**. Webhook/Zapier only, and webhooks are paid. | Yes, a native Linear integration exists ([docs](https://betterstack.com/docs/uptime/integrations/linear/)). Whether Free includes it: **not found** | Yes, the alert action "Notify Integration → Linear" ([docs](https://docs.sentry.io/integrations/issue-tracking/linear/)). Whether Developer includes it: **not confirmed** (see above). |
| Commercial use on Free | Sources conflict: a 12/2024 ToS made Free non-commercial; a 2026 source says the 06/2026 ToS allows commercial use ([notifier](https://notifier.so/guides/uptimerobot-pricing-2026/)). **Verify the live ToS.** | No restriction found | n/a, paid org features |

**What `uptime.yml` does that none of them does out of the box:**
- **One alert covers two URLs.** `/` (the SSR home page through Vercel) and
  `/api/health/readiness` (DB `SELECT 1` + `db_init_status`) feed one AND
  check, so either failing counts. Externals need a monitor per URL, and
  Sentry Free has none left.
- **A GitHub issue in this repo is the outage record.** One issue per outage,
  opened on the 2nd consecutive failure, a `still failing` comment per tick
  with the run URL, closed with `recovered at …`. No vendor above opens GitHub
  issues on its free tier. (Sentry's GitHub integration can open issues; plan
  availability wasn't checked.)
- **It requires exactly HTTP `200` and follows no redirects** (curl without
  `-L`). Sentry follows up to 9 redirects and accepts any 2xx (docs).
  UptimeRobot's and Better Stack's defaults: **not found**.
- **No account, no secret, config reviewed in a PR, independent of Sentry.**
  That was the reason for ADDENDUM-11 in `meh-2202-uptime-workflow.patch.md`.

What the externals do that `uptime.yml` doesn't: shorter intervals that don't
depend on GitHub's scheduler, checks from several regions, and (Better Stack,
maybe Sentry) a Linear issue.

### Recommendation

1. **Apply this patch.** Sentry `8093256` already gives backend + DB
   detection in about 15 min, so `uptime.yml` at `*/30` becomes the
   Sentry-independent backstop for `/` and readiness, with alerts in 30–60 min.
2. **To get `/` and readiness back to ≤ 10–15 min for free, add UptimeRobot
   Free:** 2 monitors at 5 min, email/push alerts. Read its live ToS first.
   Its free alerts can't reach Slack, a webhook or Linear.
3. **If a Linear issue on outage is the goal**, connect Sentry's Linear
   integration to the existing `8093256` alert (check that Developer allows
   it). Better Stack is the fallback if it doesn't. Don't spend Sentry's single
   free monitor on a second URL.
