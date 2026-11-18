# Secrets scan — 17/11/2026

**Result: no live secret was found. No key needs rotating.** One key needs a
check in Google Cloud's console (below). Values are never written here: every
finding is named by file, line, rule and length.

The previous full-history scan (10/11, gitleaks) reached the same result; this
one re-runs it after a week of merges and adds the built bundle.

## What was scanned

| Surface | Scope | How |
|---|---|---|
| Git history | all refs, 6,961 commits, every added line | 20 regex rules: AWS, Anthropic, OpenAI, Resend, GitHub, Google API key and OAuth secret, Slack, Stripe, Twilio, private keys, JWTs, DB URLs with a password, Cloudinary URLs, Sentry, PostHog personal, Vercel, Linear and Meta tokens, and `secret/password/token/api_key = "<24+ chars>"` |
| Git history, by value | the same | the **values** of the 16 secret environment variables of this session (demo passwords, the Vercel bypass secret, GitHub tokens) were searched for in the full history: none present |
| Files ever committed | all refs | names matching `.env`, `.pem`, `.key`, `.p12`, `credentials*.json`, `service-account*`: only the three `.env.example` files |
| Built client bundle | `frontend/.next/static`, 211 files, 7.6 MB (production build of staging at `6a7be26`) | the same rules, the names of 15 server-only secrets, and the 16 values above. Control: the scanner found `accounts.google.com` in 5 files and the site's own strings in 56, so it was reading the bundle |
| `NEXT_PUBLIC_*` | every name read in `frontend/` | classified below |

## Findings in history — all test fixtures, examples or local defaults

| File:line | Rule | What it is | Risk |
|---|---|---|---|
| `tests/test_producer_owner_invite.py:1967` | JWT | payload is `{"example": …}`, 11-character signature: hand-made, signed by no key | none |
| `frontend/scripts/qa-meh2324-claim-page.mjs:23` | JWT | payload `{"sub": …}` only, 12-character signature (a real HS256 signature is 43) | none |
| `scripts/checks/secrets-scan-guard.sh` | AWS key, GitHub token | the guard's own self-test fixtures (the AWS key there is AWS's published documentation example) | none |
| `tests/test_whatsapp_optout.py`, `tests/test_meh_509_pr2c_webhook.py`, `tests/test_verify_email.py`, `tests/test_forgot_password.py`, `tests/test_meh3104_email_change_hardening.py`, `frontend/__tests__/claimToken.test.js`, `frontend/__tests__/AnalyticsTokenScrub.test.js`, `frontend/e2e/flows/30-login-journey-c.spec.ts` | `token/secret/password = "…"` | test placeholders (several carry an explicit placeholder marker since #4486) | none |
| 33 lines, e.g. `backend/.env.example`, `docker-compose.yml`, `tests/conftest.py`, `.github/workflows/e2e.yml` | DB URL with password | every one is `postgres:…@localhost`, `@db` or `USER:…@HOST`: local development defaults | none |
| `docs/audits/raw/perf/lh-*.json` (9 matches) | Meta token (`EAA…`) | base64 image data inside Lighthouse reports, not tokens | none |

## `NEXT_PUBLIC_*` — public by design

Anything named `NEXT_PUBLIC_` is compiled into the JavaScript every visitor
downloads. None of these is a secret; the right question is whether each is
restricted where it is used.

| Name | What it is | Exposure is |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_APPLE_CLIENT_ID`, `NEXT_PUBLIC_APPLE_REDIRECT_URI` | OAuth client identifiers | public by design; the secret half lives only on the server |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENV` | where browser errors are sent | public by design; it can only submit events |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_CLARITY_PROJECT_ID` | analytics project identifiers | public by design; write-only ingestion keys |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Places key for address autocomplete (`frontend/lib/places.js:60`) | public by design, **but billable**: it must be restricted to the site's HTTP referrers and to the Places API in Google Cloud. Not checkable from the repo |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPPORT_PHONE`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_RESCUE_BAGS_ENABLED` | addresses, a public phone and email, a feature flag | public |

Server-only secrets read in `frontend/`: `EDGE_PROXY_SECRET` (`middleware.js`,
runs on the server) and `VERCEL_AUTOMATION_BYPASS_SECRET` (E2E and QA scripts
only). Neither name nor value is in the client bundle.

## To do

- **Check the Google Maps browser key's restrictions** in Google Cloud
  (application restriction: HTTP referrers `mehamakor.co.il/*` and the staging
  and preview hosts; API restriction: Places API only). Owner: Sapir; needs the
  console.
- Nothing to rotate.

## How to re-run

The scan scripts are not committed (they run from a session's scratch
directory). `scripts/checks/secrets-scan-guard.sh` already blocks new secrets in
every PR; this document covers what that guard cannot see — history and the
built bundle.
