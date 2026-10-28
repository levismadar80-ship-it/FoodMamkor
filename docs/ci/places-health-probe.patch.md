# `uptime.yml` — add the Google Places key probe, hourly (MEH-2482)

> **Status: ⏳ NOT APPLIED — written 28/10/2026.** `.github/workflows/**` is
> CC-deny for the filesystem tools (`.claude/settings.json`, MEH-671); Sapir
> pastes the block below, or CC lands it through the Contents API per the
> tool × path note in `.claude/rules/security.md` once she says so.

## 1 · Why

On ~15/10/2026 the Google Cloud free trial behind the Places key ended. From
that moment every address lookup on the site answered **403
PERMISSION_DENIED**, no business could obtain coordinates, and «שליחה לבדיקה»
stayed locked for every new registration. Nobody knew until 28/10, when a
manual end-to-end registration on staging hit it. The frontend's only trace was
a `console.warn`; the backend's rating line is fail-quiet by design (MEH-1490).

`GET /api/health/places` (MEH-2482, `backend/app/routers/health.py`) now makes
the real Places call with the real server key and answers **503** with Google's
status word when it fails. This patch makes the existing uptime probe ask it
once an hour, so the next failure becomes a GitHub issue within the hour — the
same issue mechanism MEH-2202 already runs, no new account, no new secret.

Hourly, not every 10 minutes: each probe is one billable Autocomplete request
(~720/month at hourly; the free allowance covers it, 4,300/month at 10-minute
cadence would not be free forever). The `uptime.yml` schedule is `*/10`, so the
step gates itself on the minute being `0x`.

## 2 · The diff — `.github/workflows/uptime.yml`

Replace the `Probe both endpoints` step with:

```yaml
      - name: Probe both endpoints (+ the Places key, hourly)
        id: probe
        shell: bash
        env:
          PLACES_URL: https://mehamakor.co.il/api/health/places
        run: |
          set -uo pipefail
          fail=0
          urls=("$HOME_URL" "$READY_URL")
          # MEH-2482: one billable Google call per hour, on the :0x tick only.
          if [ "$(date -u +%M | cut -c1)" = "0" ]; then urls+=("$PLACES_URL"); fi
          for url in "${urls[@]}"; do
            code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 --retry 2 --retry-delay 5 "$url" || echo 000)
            echo "$url -> HTTP $code"
            if [ "$code" != "200" ]; then fail=1; fi
          done
          echo "fail=$fail" >> "$GITHUB_OUTPUT"
```

Everything else in the file — the ×2-consecutive issue logic, the label, the
recovery comment — stays byte-identical. A Places failure opens the same
`uptime: mehamakor.co.il probe failing` issue; the run log names the URL.

## 3 · Smoke run after applying

1. `workflow_dispatch` once at a `:0x` minute (or temporarily drop the minute
   gate for one run) and read the log line for `/api/health/places`.
2. While Google is still down (28/10) the expected line is `HTTP 503` and
   `FAIL: 1`; after billing is restored, `HTTP 200`.
3. The endpoint can also be read by hand:
   `curl -s https://mehamakor.co.il/api/health/places` →
   `{"status":"ok"}` or `{"status":"error","http":403,"code":"PERMISSION_DENIED"}`.

## 4 · Related

- MEH-1495 — the billing card (the cause). Gets a due date for the next check.
- Sentry: the endpoint also sends `capture_message` with fingerprint
  `["places-health", <code>]`, so the default "new issue" alert emails on the
  first failure even before this workflow is applied.
- `docs/DEPLOYMENT.md` § Google Cloud billing — where to look and what breaks.
