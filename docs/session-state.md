# Session state — 2026-09-01 night → 02/09, drain יט' (session `01Rqretx5os…`)

**One line:** a locally seeded stack ran inside a drain for the first time, reproduced
`33-admin-producers-tab` numerically, and turned two briefed hypotheses into two measured
root causes on two different cards.

**Rewritten after every merge. Final rewrite: after all five code/audit PRs landed — the last was #3271 (`be76ec60`).**

---

## Merged — five, in landing order

| PR | what | landed as |
|---|---|---|
| #3268 | `docs/ci/meh-1754-next-public-api-url.patch.md` — the item-5 workflow block, and the record that #2831 was closed stale on 28/08 so **neither half** of item 5 is on staging | `b288292b` |
| #3267 | MEH-2229 — availability write rolled back from memory, failed re-sync reported. 3 vitest cases: case 1 red on the old handler, case 2 the control, green on both | `9173a967` |
| #3270 | spec 35, device-dependent WhatsApp href — 24/24 on staging, both projects | `64ed80fc` |
| #3269 | `docs/audits/2026-08-ci-signal-audit.md` — 23 checks, two that cannot fail on what their name promises | `1bb0a1e4` |
| #3271 | `docs/audits/undeclared-contract-fields.md` — the baseline is 42, and zero live stripping bugs | `be76ec60` |

Every one verified after the fact: **one parent** (a real squash, not a merge commit), author `sapirschnapp`, message template `<title> (#N)`.

## Open

| PR | what | note |
|---|---|---|
| #3273 | spec 38, registration delivery axis (8/8 local, mutation check on both halves) | tests-only, `Closes MEH-2107`. **Sapir merges** — the card says no auto-merge, so it was left unmerged and auto-merge was NOT armed |
| this one | CHANGELOG + HANDOFF + this file | docs-only. Its `Describes-PRs` trailer lists the five that landed; #3273 is deliberately absent, and nothing here claims it merged (rule 31b) |

## What a new session must know

1. **A locally seeded healthy stack is ~15 minutes and it works.** `service postgresql start` + `ALTER USER postgres PASSWORD 'postgres'` (the runbook assumes it) → `SKIP_UVICORN=1 bash scripts/local-backend.sh` → `seed_demo_business.py` + `seed_demo_producers --confirm` with local `DEMO_*_PASSWORD` → uvicorn → `NEXT_PUBLIC_API_URL=http://localhost:8000 npm run build` → `npm run start`. Playwright then provisions `admin.json` against it. This is what made MEH-2168 A′ measurable.
2. **Two instruments reported red before a single test ran, and both were thrown away rather than reported.** The pinned Playwright resolves `chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`; the image carries `chromium_headless_shell-1194/chrome-linux/headless_shell` — a **directory-layout** problem, not a version one. Symlinks under `/opt/pw-browsers` fix it; never run `playwright install`. And against staging **only the full chrome binary honours `--ssl-version-max=tls1.2`** — the headless shell resets regardless. `frontend/pw-staging.scratch.config.ts` is untracked and must stay so.
3. **MEH-2168 A′ is (b), the test body, in all three — hypothesis (a) is refuted** by a `beforeEach` that passed 14/14. `:80`/`:193` race `EmptyRow` (no loading flag at `use-admin-producers.js:39`; the trace shows `GET /api/admin/producers` still pending at the assertion). `:128` demands `bg-green` for approved, which has been `bg-primary` since 07/05. `:105` is green for two reasons. Next chunk is tests-only in spec 33, awaiting go.
4. **MEH-2189: the "closed disclosure" was a misreading of SSR HTML.** `getWhatsAppHref` emits `web.whatsapp.com/send` on fine-pointer desktops, SSR is always `wa.me`, and the swap lands in about **1 of 4 loads** — a hydration mismatch React does not patch. The spec accepts either form. The partial swap is a product observation reported on the card, not fixed.
5. **MEH-1754 item 5 has two halves and neither is on staging** — #2831 closed stale 28/08, `env.client.js:27` still `.optional()`. Card description corrected (rule 34). Workflow half first, then the code half re-cut from `5b339fc3`.
6. **Merge rule measured tonight:** the ruleset refuses a merge when the base moved since the head's checks reported ("2 of 2 required status checks are expected"). Update the branch, wait, merge.
7. **Vercel's daily deployment quota is exhausted** (`api-deployments-free-per-day`, over 100). It shows as a red status on every open PR, resets on its own, and no commit clears it.

## Parked with a measurement, not a promise

MEH-1892 (the one-line fix **is** option 3 — all of `/en` to LTR, a product ruling) · MEH-1414 (Phase 0 on the card; central component; the `MapClient.jsx:523-529` prohibition and `__MAP_CENTER__` being a hardcoded literal that would lie about a restored view) · MEH-2079 (all three tables carry an indexed time column, so a purge is one `DELETE`; row counts are **not measurable from the sandbox** — the SQL is on the card) · MEH-1896 (option ג plan on the card, discrimination proven before the baseline is filled, STOP).

## For Sapir, over coffee — priority order

1. **MEH-2189 / `lib/utils.js`** — the desktop `web.whatsapp.com` optimisation applies in ~¼ of loads. Fix or accept?
2. **MEH-2168 chunk 2 go** — spec 33 fixes are tests-only: wait for a real row, and approved is `bg-primary`.
3. **MEH-2237 §5** — two one-liners: the RTL lint rule to a ratchet, and Branch name gate into `ci-gate`.
4. **MEH-1754** — apply the patch.md; the code half is re-cut after it.
5. **MEH-2079** — run the row-count SQL on staging; pick windows (48h / 13mo / 13mo + roll-up proposed).
6. **MEH-2189 contact sheet** — 16 fresh PNGs exist untracked; commit them (webp, under 2 MB)?
7. Standing: MEH-2219 ch2 vs ADR-003 · the MEH-2184 patch · the MEH-2080 threshold · `gov.il` on the allowlist.

## Guards

STEP 0: `--self-test` 17/17 · `shallow=false` · `currency: ok` · `0 OPEN · 11 parked · 1 satisfied · 5 skipped · 2 unstarted · 0 void`.
`scripts/checks/run-all.sh`: 18 guards ran, 0 fail, 3 warned (all pre-existing on a clean tree).
