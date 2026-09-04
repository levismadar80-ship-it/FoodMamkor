# WebKit (Safari engine) QA from a Claude Code sandbox

**Status:** available in the sandbox behind `PW_WEBKIT=1`, and **in CI as a
non-voting shadow job**. Step B landed on 2026-08-03 (`323a1258`): `e2e-webkit`
(`.github/workflows/e2e.yml:432`) installs webkit and runs it under the same flag.

**It carries no vote.** `continue-on-error: true` (`:438`) means a webkit failure
never reds the run, and the job is absent from `e2e-gate`'s `needs:` (`:566`), so
the required check literally cannot see it. Promotion to blocking is a separate
decision (MEH-1788) and has not been taken.

_This section read **"Not in CI — that is MEH-1788 step B"** for three weeks after
step B landed; corrected under MEH-2187 from the live workflow file. The same stale
claim sat in `playwright.config.ts` and was corrected in the same pass._

Two things therefore still hold, and they are what the rest of this page is for:

1. **Every "mobile QA" claim from a run that did not set the flag is a Chromium
   claim** — that includes the blocking `e2e` job, which does not set it.
2. **Playwright WebKit is not iOS Safari** (no ITP, no PWA storage partitioning, no
   real safe-area, momentum or input-zoom behaviour), so **Sapir's real-device pass
   stays required** — `.claude/rules/workflow.md` rule 23, carve-out (e), which is
   the canonical statement of all of this.

---

## Why this file exists

The capability worked once already — 31/07, 10/10 including against live staging —
and then evaporated, because it lived in a scratchpad and `git diff origin/staging`
was empty. It was rebuilt from scratch on 02/08 to write this page. The procedure
below is non-obvious in three separate places, and getting any one of them wrong
produces a failure that looks like something else.

---

## Install (once per sandbox)

```bash
cd frontend                       # NOT the repo root — see trap 1
npx playwright install-deps webkit   # mandatory — see trap 2
npx playwright install webkit
```

Expected tail: `WebKit 26.5 (playwright webkit v2336) downloaded to /opt/pw-browsers/webkit-2336`.

### Trap 1 — run it from `frontend/`, never the repo root

`@playwright/test` is pinned in `frontend/package.json` (1.62.0 as of writing) and
wants **webkit-2336**. Run the install from the repo root and the *global* CLI
resolves instead, which pulls **webkit-2215** — a version skew that surfaces later
as a launch failure rather than an install error.

> Verified on 02/08: running from `frontend/` produced `webkit-2336`, matching the
> pinned `@playwright/test`. The webkit-2215 outcome is carried from MEH-1788's
> 31/07 finding and was **not** re-reproduced here — no reason to break a working
> install to re-confirm it.

### Trap 2 — `install-deps` is not optional

WebKit needs roughly twenty shared libraries that the sandbox image does not ship —
`libwoff2dec`, `libgstallocators`, `libhyphen` and friends. **The binary downloads
fine without them and then fails to launch**, so the missing step shows up as a
runtime error, not an install error. Run `install-deps webkit` first.

### Trap 3 — network allowlist

Two domains were added to the environment's Network access (Limited mode) on 31/07:

| Domain | Needed for |
|---|---|
| `playwright.download.prss.microsoft.com` | downloading the webkit binary |
| `staging.mehamakor.online` | running specs against live staging |

Without the first, the install 403s at the proxy.

---

## Running

```bash
cd frontend

# local next start
PW_WEBKIT=1 npx playwright test e2e/flows/<spec> --project=webkit-iphone13

# live staging
TEST_URL=https://staging.mehamakor.online PW_WEBKIT=1 \
  npx playwright test e2e/flows/<spec> --project=webkit-iphone13
```

### Trap 4 — staging needs the bypass secret

`VERCEL_AUTOMATION_BYPASS_SECRET` must be set (it already is in this environment).
`playwright.config.ts` forwards it as `x-vercel-protection-bypass` for non-local
targets. Without it **every request 302s to `vercel.com/sso-api`** and the run fails
in a way that looks like the site being broken rather than the auth wall.

### Trap 5 — the Chromium half of the pair is broken in this sandbox, and its install fails *silently*

The mobile standard is **webkit AND chromium**, so a working webkit is only half of
it. Measured 29/08 (MEH-2218): the pre-installed Chromium does **not** satisfy the
pinned `@playwright/test`.

```
browserType.launch: Executable doesn't exist at
  /opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
```

The image ships `chromium-1194` / `chromium_headless_shell-1194`; the pinned
Playwright wants **-1234**. And `npx playwright install chromium` does **not** fix
it — the download fails at the proxy:

```
Error: Download failure, code=1
```

**The fix is not to download.** Point Playwright at the Chromium that is already
there — this is what the environment's own guidance prescribes for a version-pinned
project:

```js
chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })   // → chromium-1194/chrome-linux/chrome
```

> **The install failure is invisible if you pipe it.** `npx playwright install
> chromium 2>&1 | tail -6` exits **0** — the pipeline reports `tail`'s status, not
> the installer's — so a wrapper (or a background-task notification) says
> "completed, exit code 0" over a failed download. This is the repo's own
> "green with two causes" rule wearing a shell-plumbing costume. Check for the
> binary on disk, not the exit code.

### Trap 6 — Chromium against staging needs the TLS-1.2 cap; WebKit does not

With `executablePath` fixed, Chromium then fails differently:

```
page.goto: net::ERR_CONNECTION_RESET at https://staging.mehamakor.online/he
```

That is the sandbox TLS trap already documented in
[`.claude/rules/testing.md`](../../.claude/rules/testing.md) → *"Driving Playwright
against staging from the CC sandbox"*: the sandbox Chromium offers a TLS-1.3
ClientHello that the Vercel edge drops. Cap it:

```js
chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--ssl-version-max=tls1.2'],       // sandbox-only; CI runners do not need it
})
```

**WebKit is unaffected** — it completed the handshake and returned 200 with no cap.
So a run where webkit works and chromium resets is *not* evidence that staging is
down; it is this trap, on one engine only.

### The measured control for the whole pair

Both engines, live staging, one run (29/08):

```
webkit-iPhone14: http=200 title="מהמקור — בתי עסק מקומיים בתחום המזו" bodyBox=390x6629
chromium-375   : http=200 title="מהמקור — בתי עסק מקומיים בתחום המזו" bodyBox=375x6595
```

Non-zero boxes on both. **Run this control before trusting any mobile QA result** —
each of traps 5 and 6 produces a failure that reads as "the page is broken".

> **`devices['iPhone 14']` is 390×844, not 375×812.** MEH-2221's mobile standard
> stated 375×812 for that device; 375×812 is the iPhone SE / 13-mini profile. The
> card was corrected 29/08. Cover both widths deliberately — 390 from the device
> profile, 375 from an explicit Chromium viewport — rather than assuming one name
> gives you the other number.

---

## The two projects

| Project | Viewport | DPR | What it is for |
|---|---|---|---|
| `webkit-iphone13` | 390×664 | 3 | Real iPhone 13 metrics — the device class this audience carries |
| `webkit-pixel5-viewport` | 393×727 | 2.75 | Same viewport as the Chromium `mobile` project |

The second one is the **controlled comparison**. When a spec passes on `mobile` and
fails on `webkit-pixel5-viewport`, the viewport is held constant, so the engine is
the only variable left. Without it, an engine difference and a layout difference are
indistinguishable.

Both are gated on `PW_WEBKIT === "1"`. Without the flag the projects array is
byte-identical to before they were added — measured, not assumed:

```
$ npx playwright test --list            → [desktop] [mobile]          (0 webkit)
$ PW_WEBKIT=1 npx playwright test --list → [desktop] [mobile] [webkit-iphone13] [webkit-pixel5-viewport]
```

---

## Scope limits — read before citing a green run

**WebKit is not iOS Safari.** It closes engine divergence: date parsing, storage
semantics, CSS/layout, hydration order. It does **not** close ITP, storage
partitioning in a PWA, real `env(safe-area-inset-*)`, momentum scroll, or input
zoom. Exception (ה) in MEH-1511 — a human pass on a real iOS device for
storage / hydration / sticky+safe-area / date-parsing / touch-scroll work —
**remains necessary**, and this capability does not retire it.

The bug that started this thread (a draft banner appearing on a first visit) was
found on a real iOS device and did not reproduce under a green Chromium run.

**Not applied to `e2e/visual/**`** — and this needed an explicit `testIgnore`, not
just an intention. A new Playwright project inherits **every** spec in `testDir` by
default, so the first version of this config silently pulled the whole VRT set in:

```
without the flag       224 tests
with the flag (before) 448 tests   ← webkit had inherited every VRT spec
with the flag (after)  408 tests   ← 184 webkit specs, zero of them visual/
```

Had that shipped, running the suite with the flag would have minted a fresh webkit
baseline for every VRT shot. A bot-authored baseline freezes whatever state the code
was in, bug included (MEH-1552 / MEH-1765) — so the failure mode is not a red suite,
it is a **silently ratified** one. If you ever add a third webkit project, carry the
`testIgnore` with it.

---

## Cross-refs

- `frontend/playwright.config.ts` — the gated projects
- MEH-1788 — the coverage-gap decision and step B
- MEH-1511 — rule 23's exception (ה), the human iOS gate
- `docs/qa/manual-testing-matrix.md` — the 27 DEVICE-ONLY rows
