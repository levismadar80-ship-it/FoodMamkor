# 🔧 Staged patch — `workflow_dispatch` CLS measurement job (MEH-1853)

**Status:** authored by CC, **not applied**. `.github/workflows/**` is CC-deny
(MEH-671), so Sapir applies this. The harness it invokes
(`frontend/e2e/qa-meh1853-cls.mjs`) **is** in the repo and needs no further work.

---

## Why this is a workflow and not a local run

MEH-1853's DoD needs 12 CLS numbers taken **against staging**, plus an observer
control. Measured 03/08, a browser in the CC sandbox cannot reach staging at
all — and the reason is specific rather than "it didn't work":

| proxy | `--ssl-version-max=tls1.2` | cert-tolerant | github | staging |
|---|---|---|---|---|
| ✅ | ✅ | — | tunnel failed | tunnel failed |
| ✅ | ✅ | ✅ | — | tunnel failed |
| ✅ | ✗ | ✗ | `ERR_CERT_AUTHORITY_INVALID` | `ERR_CONNECTION_RESET` |
| ✅ | ✗ | ✅ | **400 — transport works** | **`ERR_CONNECTION_RESET`** |

The TLS-1.2 cap breaks the sandbox proxy's **own** CONNECT tunnel (github fails
too, so it is not a staging problem); without the cap the Vercel edge resets
this Chromium's TLS-1.3 handshake, which is the exact condition the cap exists
for. The last row is the discriminator: github returns 400, meaning CONNECT,
TLS and cert verification all succeeded, while staging still resets. **It is not
a certificate problem, so no cert handling fixes it.** `curl` reaches staging
(302) because it is not subject to the same constraint; CLS needs a browser.

A GitHub Actions runner talks to the Vercel edge **directly** — no proxy, no cap
needed, contradiction gone. This is not a workaround for the blocker; it is an
environment where the blocker does not exist.

**The two rejected alternatives, recorded so they are not re-proposed:**

- **Running it on Sapir's machine** works, but makes the number unrepeatable.
  When someone changes `MiniMap` in two months, *"is this a regression?"* must be
  answerable without her re-running anything. That bottleneck is what the sweep
  exists to remove.
- **Measuring a local build** changes what the numbers attest to. CLS on a local
  build is not the CLS a real visitor meets — fonts, Cloudinary images and edge
  latency all differ. Twelve numbers measuring the wrong thing are worse than
  none, because they look like evidence.

---

## The patch

New file, `.github/workflows/cls-measure.yml`:

```yaml
name: CLS measurement (manual)

# workflow_dispatch ONLY — this is a MEASUREMENT, not a gate. It must never
# become a required check: it hits a live external target, so its red would mean
# "staging was slow" as often as "the code regressed", and a gate that is red for
# two different reasons is not a gate.
on:
  workflow_dispatch:
    inputs:
      path:
        description: "Path to measure (e.g. /producer/<id>)"
        required: true
        type: string
      url:
        description: "Base URL"
        required: false
        default: "https://staging.mehamakor.online"
        type: string
      runs:
        description: "Loads per viewport"
        required: false
        default: "3"
        type: string

jobs:
  measure:
    name: CLS measurement
    runs-on: ubuntu-latest
    timeout-minutes: 20
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - run: npm ci

      # Chromium only — the harness launches chromium explicitly.
      - run: npx playwright install --with-deps chromium

      - name: Measure CLS (control first, then 3 loads x 2 viewports)
        env:
          VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
        run: |
          node e2e/qa-meh1853-cls.mjs \
            --url "${{ inputs.url }}" \
            --path "${{ inputs.path }}" \
            --runs "${{ inputs.runs }}" \
            --out cls-results.json

      # if-no-files-found: error — a silently absent artifact would read as
      # "the run produced nothing to see" rather than "the run failed".
      - name: Upload numbers
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: cls-results
          path: frontend/cls-results.json
          if-no-files-found: error
          retention-days: 30
```

---

## What the harness does, and the one part that is load-bearing

`frontend/e2e/qa-meh1853-cls.mjs`:

1. **Runs the control FIRST.** It forces a known layout shift (injects a 420px
   block at the top of `<body>`) and asserts the observer recorded it. If the
   control fails it writes the control result, emits **no measurements**, and
   exits non-zero.
2. Then takes **3 loads × 2 viewports** (375×812, 1440×900) = 6 samples per
   invocation. Run it once before the fix and once after for the DoD's 12.
3. Reports `installed` per sample and fails the run if any sample's observer
   never installed.

**Why the control is not optional.** Mobile CLS on producer-detail is reported
as `0.0000`. That is a green with two possible causes — *no shift happened* and
*the sampler never installed* — and nothing in the number distinguishes them.
There is direct precedent in this repo for the second: a probe whose observer
threw because `document.documentElement` is `null` inside `addInitScript` died
silently and reported exactly the reassuring answer. This sampler therefore
touches nothing on `documentElement`, records its own construction failure, and
proves itself against a forced shift before any real number is emitted.

**The bypass secret is required, and its absence is a hard refusal rather than a
skip.** Staging sits behind Vercel Deployment Protection: with no
`x-vercel-protection-bypass` header the request 302s to the SSO wall, and the
harness would happily measure *that* page and print numbers that look real.
`VERCEL_AUTOMATION_BYPASS_SECRET` already exists as a repo secret (used by the
MEH-1241 auth-fixture work). Read from env only, never logged.

---

## How to apply

1. Create `.github/workflows/cls-measure.yml` with the YAML above.
2. Confirm `VERCEL_AUTOMATION_BYPASS_SECRET` is still set as a **repository**
   secret (the job declares no `environment:`, so an environment-scoped secret
   resolves to empty).
3. Run it from the Actions tab with `path` = a real producer-detail path
   (e.g. `/producer/<id>` — take a live id from `/producers`).
4. Download the `cls-results` artifact. Expect `desktop-1440` ≈ **0.85** on
   today's code, and **< 0.1** after the `loading:` placeholder lands. Mobile
   must not regress above its current `0.0000`.

**Do not add this to the required-check set.** See the comment at the top of the
YAML — it hits a live external target and would be red for reasons unrelated to
any diff.
