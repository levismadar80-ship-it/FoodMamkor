# WebKit (Safari engine) QA from a Claude Code sandbox

**Status:** available in the sandbox behind `PW_WEBKIT=1`. **Not in CI** — that is
MEH-1788 step B, which needs `.github/workflows/**` (CC-deny, MEH-671).

Until step B lands, **every "mobile QA" claim from CI, or from a session that did
not set the flag, is a Chromium claim.** The two `webkit-*` projects in
`playwright.config.ts` are the only Safari-engine coverage that exists anywhere in
this repo.

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
