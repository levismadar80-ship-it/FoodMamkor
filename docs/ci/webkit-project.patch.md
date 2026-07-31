# WebKit E2E project — workflow + config patch (MEH-1793)

`.github/workflows/**` is CC-deny (**MEH-671**), so Claude Code cannot apply
this. This doc is the exact change for **Sapir** to apply to
`.github/workflows/e2e.yml`, plus the `playwright.config.ts` block that goes
with it.

Same shape as [`docs/ci/e2e-concurrency.patch.md`](./e2e-concurrency.patch.md).

> ## ⚠️ The trap — both lines, one diff
>
> **Changing the engine list (`e2e.yml:129`) without the cache key
> (`e2e.yml:122`) is a silent no-op on every warm-cache runner.**
>
> The install step is gated on `if: steps.playwright-cache.outputs.cache-hit
> != 'true'` (`e2e.yml:131`). The literal string `chromium` inside the cache
> key is **decoration — it does not vary with the engine list**. So a runner
> that hits the existing cache skips the install entirely, `webkit` is never
> downloaded, and the run dies at launch with
> `browserType.launch: Executable doesn't exist at …/webkit-*/pw_run.sh`.
>
> It fails *after* build, *after* server start, several minutes in, and the
> error names a missing binary rather than a missing install step — so it reads
> as a broken runner rather than an incomplete patch. **Apply both lines
> together or neither.**

---

## Why

MEH-1788 Phase 0 established, with evidence:

- **0 webkit projects** in any Playwright config —
  `playwright.config.ts:102-115` defines exactly two, both Chromium
  (`desktop` :104-106, `mobile` :107-114, the latter pinning
  `browserName: "chromium"` at :112). `playwright.mobile-audit.config.ts:60`
  hardcodes chromium. All **40** ad-hoc `frontend/e2e/qa-meh*.mjs` harnesses
  `import { chromium }`; none import webkit.
- **0 / 198** committed QA-artifact directories carry WebKit evidence (198 of
  224 ticket dirs hold a mobile-width or mobile-named capture; every one is
  Chromium).
- **CI can install it — it has simply never been asked to.** `git log -S"install
  --with-deps webkit" --all` returns empty across **2,752** commits.

> Counts re-derived at `800b30ed`, not carried over from the MEH-1788 Phase 0
> brief — three of them had already drifted (39→40 harnesses, 197→198
> artifacts, 2,739→2,752 commits) in the hours between. Nothing here rests on
> a figure measured against a different tree.

The install capability is proven *by construction*, not by direct observation:
`frontend/package-lock.json` last changed in `aaedad62` (2026-07-29 09:06:22Z);
the cache declares **no `restore-keys`**, so only an exact-key match hits; and
run [30634964457](https://github.com/levismadar80-ship-it/FoodMamkor/actions/runs/30634964457)
(31/07 13:35) reported a **hit** on the key carrying that lock's hash. That
entry can only have been written by a job that missed and ran
`npx playwright install --with-deps chromium` to completion on a GitHub-hosted
runner — i.e. a real download from `playwright.download.prss.microsoft.com`,
the same host that serves every engine.

The CC sandbox cannot do this: that host returns
`403 request rejected: host not permitted` through the egress proxy
(reproduced 2026-07-31T14:05:57Z). That asymmetry is the whole reason the
coverage has to live in CI.

---

## Step 1 — `e2e.yml`, both lines

### 1a. Cache key — `e2e.yml:122`

```yaml
# BEFORE
          key: playwright-${{ runner.os }}-chromium-${{ hashFiles('frontend/package-lock.json') }}
```

```yaml
# AFTER
          key: playwright-${{ runner.os }}-chromium-webkit-${{ hashFiles('frontend/package-lock.json') }}
```

### 1b. Engine list — `e2e.yml:128-129`

```yaml
# BEFORE
      - name: Install Playwright (Chromium only)
        run: npx playwright install --with-deps chromium
```

```yaml
# AFTER
      - name: Install Playwright (Chromium + WebKit)
        run: npx playwright install --with-deps chromium webkit
```

The step *name* change is cosmetic but worth making: "Chromium only" becomes a
false label the moment 1b lands, and a stale label in a workflow is how the
next reader forms a wrong belief for free.

`e2e.yml:131` (`if: steps.playwright-cache.outputs.cache-hit != 'true'`) is
**unchanged** — it is correct as written. The bug was never that gate; it was
the key not varying with what the gate guards.

### `vrt-update.yml` is deliberately NOT changed

`vrt-update.yml:98` carries the **byte-identical cache key** and `:105` the
identical install line. Leave both alone. VRT baselines are Chromium-generated
and must stay that way (see Step 2), so that workflow genuinely wants
chromium-only.

The two workflows share one cache namespace today. After this patch they no
longer do — `e2e.yml` writes to the `-chromium-webkit-` key, `vrt-update.yml`
keeps hitting `-chromium-`. **Nothing breaks:** each gets the entry it wants,
and the only cost is that the two no longer warm each other's cache. No action
needed.

---

## Step 2 — `playwright.config.ts`, the new project

**This block is a proposal in a document, not a change in the repo.** CC was
scoped to one new file (MEH-1793) and did not edit `playwright.config.ts`.
Apply it in the same PR as Step 1 — a webkit project without the binary, or the
binary without a project, are both useless halves.

Insert after the `mobile` project (currently ends `playwright.config.ts:114`):

```ts
    // MEH-1793 — Safari-engine coverage. Scoped to e2e/flows/** ONLY:
    // per-project testMatch overrides the top-level one (:35), which would
    // otherwise pull in e2e/visual/** too. See "Why visual is excluded".
    {
      name: "webkit-mobile",
      testMatch: ["e2e/flows/**/*.spec.ts"],
      use: {
        ...devices["iPhone 13"],
        // Explicit, mirroring the `mobile` project's pin at :112. The device
        // descriptor already defaults to webkit; stating it means a future
        // device swap cannot silently change the engine.
        browserName: "webkit",
      },
    },
```

> **⚠️ `devices["iPhone 13"]` is unverified — check it before you trust it.**
> `frontend/package.json:40` pins `@playwright/test: ^1.62.0`, but
> `node_modules` is absent in the CC sandbox and the browser CDN is blocked, so
> **CC could not confirm that key exists in the installed device registry.** An
> unknown key yields `undefined` and spreads to nothing — the project would
> silently run at Playwright's *default desktop* viewport with no error, which
> is the worst outcome: green, and measuring the wrong thing.
>
> Confirm with `npx playwright devices | grep -i "iPhone 13"` before applying,
> or sidestep the registry entirely by specifying the geometry directly:
>
> ```ts
>       use: {
>         browserName: "webkit",
>         viewport: { width: 390, height: 844 },
>         deviceScaleFactor: 3,
>         isMobile: true,
>         hasTouch: true,
>       },
> ```
>
> The explicit form is the safer default for a hand-applied patch — it has no
> dependency on a registry key whose presence nobody has checked.

### Why `e2e/visual/**` is excluded — not an optimisation, a correctness rule

**VRT baselines are per-project.** Playwright names snapshots
`<name>-<project>-<platform>.png` — the existing set is
`register-mobile-linux.png`, `home-mobile-linux.png`, and so on
(`frontend/e2e/visual/parity.spec.ts-snapshots/`). A `webkit-mobile` project
running `parity.spec.ts` would find **no baseline for itself** and generate a
fresh set on first run.

That is precisely the candidate-baseline exposure this repo has been bitten by
twice:

- **MEH-1552** — a bot-generated baseline froze a *broken* state and it merged.
  `.claude/rules/testing.md` records the rule: a new VRT baseline is a
  **candidate, not truth**, and must be opened and reviewed by eye before merge.
- **MEH-1765** — `maxDiffPixelRatio: 0.02` (`playwright.config.ts:61`) is a
  ~6,688 px budget on the mobile project, large enough to swallow a complete
  copy change. A green VRT is not evidence the frame is unchanged.

Adding a whole new engine's baseline set — where *every* image is legitimately
different from the Chromium one, so nothing looks anomalous — would mean
ratifying **8 unreviewed frames** in a single commit (the mobile-project half
of the current 17-file baseline set: `about`, `home`, `login`, `map`,
`producer-detail`, `producer-detail-minimal`,
`producer-detail-disclosure-open`, `register`), with no way to tell an engine
difference from a bug. **Don't.** If WebKit VRT is ever wanted, it is its own
ticket with its own eye pass.

Excluding visual also keeps `webkit-mobile` at **28 specs** (`e2e/flows/`),
not 31.

### Verify the scoping took

`testMatch` at project level is documented to override the config-level value,
but **CC could not execute Playwright to confirm it** (`node_modules` absent in
the sandbox, and the browser download is blocked). First run after applying,
check the report: the `webkit-mobile` project must show **28 specs, not 31**.
If it shows 31, the override did not apply and `e2e/visual/**` is being run on
webkit — stop and fix before letting any baseline be written.

---

## Cost

| | |
|---|---|
| Cache size | **+150–250 MB** (webkit build + its deps) |
| Cache-miss runs | **+3–5 min** for the extra download/apt |
| Wall-clock, scoped to flows | **estimate, not measured** — the current suite runs 189 executed specs in **4.5 min** (run 30634964457). A third project over 28 flows specs adds well under a doubling |
| Wall-clock, **unscoped** | **~2×** — this is the number the scoping in Step 2 exists to avoid |
| Job timeout headroom | `e2e.yml:86` is `timeout-minutes: 15` against a 4.5-min baseline. Should be ample; watch the first few runs |

---

## Risk — this can land red-tolerant

**The E2E gate is not a required check today.** It exists as a job
(`e2e.yml:406-440`) but nothing in the `protect-staging` ruleset gates on it —
the two required contexts are `CI gate` and `Deploy gate`
(`.claude/rules/testing.md`, MEH-716).

Evidence: PR
[#2431](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2431) **merged
at 13:40:32Z** while its E2E job was still running (finished 13:40:42Z), and
the `E2E gate` job then reported `failure` at 13:40:53Z. The merge was
unaffected.

So a new webkit project that turns up failures **cannot block anyone**. It can
land, surface real Safari-engine bugs, and earn promotion later via the
aggregator route in [`docs/ci/e2e-gate.patch.md`](./e2e-gate.patch.md).

Related, and worth knowing before you read the first webkit run: the suite is
**already red on Chromium** — 6 failures as of run 30634964457 (VRT `login` +
`register` × desktop/mobile, GSI console-clean × 2), 31 skipped. Those are
pre-existing and unrelated. Do not read them as webkit fallout.

---

## ❓ Unverified — do not assume this one

**Whether `--with-deps webkit` succeeds on the current `ubuntu-latest` image:
I don't know.**

WebKit's Linux dependency set (`libwoff2`, `libopus`, GStreamer,
`libharfbuzz-icu`, `libenchant`, `libsecret`, `libhyphen`, `libwebp`) is
materially larger than Chromium's and is installed via `apt` inside
`--with-deps`. It is the standard, documented path and it normally works — but:

- it has **never been run in this repo** (`git log -S`, 2,752 commits: empty);
- the CC sandbox cannot test it (CDN 403, above);
- GitHub rotates the `ubuntu-latest` image, and apt-layer breakage on WebKit is
  a real historical failure mode.

**This is the one item that must be settled by running it, not by reasoning
about it.** If the install step fails, read the apt output before changing
anything else — it will name the missing package, and the fix is usually
pinning `ubuntu-24.04` explicitly rather than tracking `ubuntu-latest`.

A second, smaller unknown: the authenticated specs provision `storageState` via
`globalSetup` (`playwright.config.ts:32`). Cookie-jar JSON is engine-portable
in principle, but MEH-1590 §3 documents a live `__Secure-Fgp` interaction over
plain HTTP on `localhost` that already affects authed specs. Whether WebKit
handles that cookie prefix identically to Chromium is **not verified**. If
authed flows fail on webkit only, look there first.

---

## What this buys — and what it does not

**Playwright `webkit` is not iOS Safari.** It is a WebKit build running on
Linux. Keep the distinction, because the gap is where MEH-1769 lives.

| Closes | Does **not** close |
|---|---|
| Date parsing (`new Date("YYYY-MM-DD HH:mm")` → `Invalid Date` on WebKit) | ITP (Intelligent Tracking Prevention) storage eviction |
| Storage API semantics (`localStorage` availability/throwing) | Home-Screen PWA storage partitioning |
| CSS / layout engine divergence | Real `env(safe-area-inset-*)` values |
| Hydration ordering differences | Momentum scroll, touch dispatch feel |
| | iOS input-zoom-on-focus (`docs/DEPLOYMENT.md:597`) |

The right-hand column is *iOS-platform* behaviour, not *engine* behaviour. No
Linux WebKit build reaches it, and no amount of CI does either — it needs a
real device.

### The MEH-1511 carve-out still stands after this patch

MEH-1511 (Backlog) will amend workflow rule 23 so automated self-QA can replace
the human mobile-QA gate. **Its carve-out list today is (a)–(d)** — central
components, new Hebrew strings, auth/payment/checkout surfaces, and merge-block
markers. **There is no (e).**

MEH-1788 recommends adding one: UI touching **storage, hydration, sticky /
safe-area insets, or date handling** stays *manual on a real device* and is not
substitutable by self-QA. **Applying this patch does not satisfy that
carve-out and must not be read as retiring it** — per the table above, webkit
closes the engine half and leaves the iOS-platform half entirely open.

Note also that MEH-1511's proposed substitution checklist specifies
"screenshots at 375 and 1440", which is a **Chromium-only** evidence bundle. If
that rule is written before the carve-out is added, a Chromium screenshot pair
inherits the authority of a mobile QA pass for exactly the bug class that
Chromium cannot see.

---

## Rollback

Revert all three edits together — the config block and both workflow lines.
Partial rollback reproduces the trap in mirror image (a webkit project with no
webkit binary).

1. **`playwright.config.ts`** — delete the `webkit-mobile` project block.
2. **`e2e.yml:128-129`** — restore:
   ```yaml
         - name: Install Playwright (Chromium only)
           run: npx playwright install --with-deps chromium
   ```
3. **`e2e.yml:122`** — restore the key, dropping `-webkit`:
   ```yaml
             key: playwright-${{ runner.os }}-chromium-${{ hashFiles('frontend/package-lock.json') }}
   ```

**Cache-key restoration is the step people forget.** Reverting only the engine
list leaves runs keyed on `-chromium-webkit-`, which still resolves to a cache
holding both browsers — harmless, but it quietly keeps paying the +150–250 MB
and makes the key a lie. Restore the key.

After restoring it, the old `-chromium-` entry may already have been evicted
(GitHub evicts caches unused for 7 days, and at the 10 GB repo ceiling). If so,
the next run does one fresh chromium install, ~3–5 min. **That is expected, not
a failure** — do not diagnose it as one.

No ruleset change is involved in either direction, since the E2E gate is not a
required context.

---

## How to verify after applying

1. **Push and watch the install step.** It must *run*, not report `skipped` —
   the key changed, so the first run is a guaranteed cache miss. A `skipped`
   here means Step 1a did not land.
2. **Read the apt output** for the `--with-deps webkit` layer (the ❓ above).
3. **Check the project spec count** — `webkit-mobile` = **28 specs**, not 31
   (Step 2 verification).
4. **Check the viewport actually applied** — the report's `webkit-mobile`
   entries must show a **390-wide** viewport. A desktop-width viewport means
   `devices["iPhone 13"]` resolved to `undefined` (Step 2 warning) and the
   project is silently testing the wrong geometry.
5. **Confirm no new PNGs.** `git status` after the run must show **zero** new
   files under `frontend/e2e/visual/parity.spec.ts-snapshots/`. Any
   `*-webkit-mobile-linux.png` appearing means visual specs ran on webkit —
   delete them and fix the `testMatch` before merging.
6. **Second run should hit the cache** and skip the install, confirming the new
   key saves correctly.

---

## Line numbers

Verified against `origin/staging` at **`800b30ed`** (2026-07-31). All line
numbers below were re-checked against the working tree at that commit and are
current — none had moved since the MEH-1788 Phase 0 brief.

If the files move later, anchor on the literal strings rather than the numbers:
`key: playwright-` and `npx playwright install` each occur **exactly once** in
`e2e.yml`.

| Anchor | Line |
|---|---|
| `key: playwright-${{ runner.os }}-chromium-…` | `e2e.yml:122` |
| `- name: Install Playwright (Chromium only)` | `e2e.yml:128` |
| `run: npx playwright install --with-deps chromium` | `e2e.yml:129` |
| `if: steps.playwright-cache.outputs.cache-hit != 'true'` (unchanged) | `e2e.yml:131` |
| `timeout-minutes: 15` (orientation) | `e2e.yml:86` |
| `e2e-gate` aggregator job (unchanged, not required) | `e2e.yml:406-440` |
| top-level `testMatch` the project override supersedes | `playwright.config.ts:35` |
| `projects: [` | `playwright.config.ts:102` |
| `mobile` project — insert after it | `playwright.config.ts:107-114` |
| `browserName: "chromium"` pin being mirrored | `playwright.config.ts:112` |
| `maxDiffPixelRatio: 0.02` (MEH-1765 context) | `playwright.config.ts:61` |
| **`vrt-update.yml` — identical pair, deliberately unchanged** | `vrt-update.yml:98`, `:105`, `:107` |
