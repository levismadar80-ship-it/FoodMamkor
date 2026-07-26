# `Playwright E2E` — enable authenticated coverage (MEH-999)

`.github/workflows/**` is **CC-deny (MEH-671)**, so Claude Code cannot apply
this. Same shape as [`ui-pattern-guard.patch.md`](./ui-pattern-guard.patch.md)
and [`e2e-gate.patch.md`](./e2e-gate.patch.md).

**This patch is optional.** Nothing is broken without it — MEH-999 already made
the authed specs *skip with a reason* instead of failing. Applying it converts
a documented coverage gap into real coverage.

---

## The gap

The E2E job runs `next start` on the runner and points Playwright at
`http://localhost:3000` (`e2e.yml:158`). `global-setup.ts:72-80` deliberately
skips QA auth provisioning for a localhost target when no `DEMO_*_PASSWORD` is
set, and the job exports none (`e2e.yml:28` — "Required secrets: none"). So
`e2e/.auth/*.json` is never written and every authenticated spec skips:

| Spec | Coverage currently NOT running on PRs |
|---|---|
| `flows/25-role-reachability.spec.ts` | admin reaches `/admin`; producer denied `/admin` but reaches its own dashboard; consumer denied both |
| `flows/21-account-menu-auth.spec.ts` | producer + consumer UserMenu contents/order, mobile AccountSheet |

**Nothing else stands in the way.** The runner's `next start` proxies `/api/*`
to the live Railway staging backend (`e2e.yml:121,133`), and the demo accounts
are seeded there (`backend/scripts/seed_demo_business.py:204,208,217` —
`demo-owner@`/`demo-consumer@`/`demo-admin@example.com`). Only the three
passwords are missing from the job env. No backend service, DB or seed step is
needed in CI.

---

## The patch

Add three env vars to the **"Run E2E tests"** step (`e2e.yml:150-159`):

```yaml
      - name: Run E2E tests
        id: e2e-run
        run: npx playwright test --fail-on-flaky-tests
        working-directory: frontend
        env:
          PLAYWRIGHT_BASE_URL: http://localhost:3000
          CI: "true"
          # MEH-999: unlock the authenticated specs. global-setup.ts provisions
          # e2e/.auth/{producer,consumer,admin}.json by logging in through the
          # /api proxy to the Railway staging backend, where these accounts are
          # seeded (backend/scripts/seed_demo_business.py). Without them the
          # authed specs skip — see docs/ci/e2e-auth-fixtures.patch.md.
          DEMO_OWNER_PASSWORD: ${{ secrets.DEMO_OWNER_PASSWORD }}
          DEMO_CONSUMER_PASSWORD: ${{ secrets.DEMO_CONSUMER_PASSWORD }}
          DEMO_ADMIN_PASSWORD: ${{ secrets.DEMO_ADMIN_PASSWORD }}
```

Also update the header comment at `e2e.yml:28` — "Required secrets: none" stops
being true.

### Prerequisites — check both before applying

1. **The three repo secrets must exist** (Settings → Secrets and variables →
   Actions). The same names are already used by the Railway staging backend and
   were introduced for MEH-1528. *Not verified from here — CC cannot list repo
   secrets.* If a secret is absent it resolves to an empty string, `global-setup`
   treats the role as unprovisioned, and the specs simply keep skipping (they do
   **not** start failing) — so a wrong guess here is safe, just ineffective.
2. **The staging accounts must be in sync.** `global-setup.ts:125` points at
   `--sync-users` for exactly this. If the passwords are set but login returns
   non-200, `global-setup` **throws** and the whole E2E job goes red — that is
   deliberate (fail loud, never a silent skip), but it means applying this patch
   against an unseeded staging turns the job red until the seed is re-run.

### Rollback

Delete the three `DEMO_*` lines. The specs return to skipping with their
documented reason; nothing else depends on them.

---

## Not covered by this patch

The other E2E failures on `staging` are unrelated to auth and are **not**
addressed here:

- `visual/parity.spec.ts` — `map` (desktop) and `home` (mobile) VRT drift.
  Baselines are runner-generated; regenerate via
  `.github/workflows/vrt-update.yml` (`workflow_dispatch`).
- `e2e.yml`'s paths-filter still does not skip docs-only PRs (the
  `predicate-quantifier: some` + negation bug documented in
  `.claude/rules/testing.md` and `docs/ci/e2e-gate.patch.md`). Fixing that is a
  precondition for making E2E a required gate — unchanged by this patch.
