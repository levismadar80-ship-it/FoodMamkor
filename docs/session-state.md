# Session state — 2026-09-02 morning, drain כ' (session `01Rqretx5os…`, continuation of יט')

**One line:** the brief arrived with a two-night-old STATE; four of its items were already done and were refuted by SHA instead of redone; three PRs landed; CitySearch was measured on the running form.

**Rewritten after every merge. Final rewrite: after #3275 (`42aa161a`).**

---

## Merged this drain — three, all verified single-parent + author on the landed commit

| PR | what | landed as |
|---|---|---|
| #3273 | spec 38, registration delivery axis. MEH-2107 → Done 5 s after, per `Closes` | `6fc1f387` |
| #3258 | docs backfill from the parallel session (01BJjrYtMyb). Three stale HANDOFF lines fixed in place first (rule 31b) | `d913d9af` |
| #3275 | spec 35 beacon-control message (`wa.me` → `WhatsApp`) + 16 seeded WebPs replacing #3115's pre-seed sheet, 689,950 B under the 2,097,152 cap | `42aa161a` |

## Refuted by SHA — rule 28, not redone

| brief item | already done | evidence |
|---|---|---|
| T4 MEH-2168 A′ | drain יט' | card comment 21:08Z 01/09 with trace; CI run 33609674707 reproduces exactly :80/:128/:193 |
| T5 MEH-1754 | #3268 | `b288292b` — patch.md; code half NOT on staging (#2831 closed stale) |
| T5 MEH-2229 | #3267 | `9173a967` |
| T5 MEH-2237 | #3269 | `1bb0a1e4`, card Done |
| T5 MEH-1896 + 1897 | #3271 | `be76ec60`; 1897 description corrected to 42 |
| T5 MEH-2079 / 1892 / 1414 | parked | each on its card with a measurement |

## What a new session must know

1. **STATE on MEH-2227 is the truth layer** — rewritten from live measurement (`list_pull_requests`, `list_issues`, `git log`) at STEP 0 and after every merge. A brief that contradicts it is stale.
2. **MEH-2168 chunk 2 needs a go** — tests-only in spec 33: wait for a real row, approved is `bg-primary`. The A′ block in the card description now says so; the old heading is kept, dated.
3. **CitySearch accepts free text on the running form** (empty → blocked with error, list-selected → advances, free text with zero suggestions and no selection → advances, no error). No enforcement card exists; MEH-213 does not resolve via `get_issue`. Proposal on MEH-2227 at 09:13Z, not opened.
4. **A `Deploy gate` failure that is a `cancelled` run superseded on the same PR is rule 21** — check for a newer run before treating it as red.
5. **The contact sheet under `qa-artifacts/meh-2189/` is tracked.** A stray converter run left 370,094 B of partial WebPs that read as "under cap" without the converter having run; the real run's output plus an unchanged PNG total (15,165,320 B) is the control.
6. **Live-form probes need no local stack:** `createRequire` against `frontend/package.json` for `@playwright/test`, chrome 1194 + `--ssl-version-max=tls1.2` + bypass headers; DETAILS→CATEGORY is client-side, so no business is created.

## For Sapir, over coffee — priority order

1. **MEH-2168 chunk 2 go** (spec 33, tests-only).
2. **MEH-2189** — only the mobile pass and DoD ticking remain.
3. **CitySearch / MEH-213** — open the proposed card or not.
4. **MEH-2237 §5** — two one-liners.
5. **MEH-1754** — apply the patch.md.
6. **MEH-2079** — row-count SQL on staging.
7. **MEH-2056** — unarchive (merged `4f7ecf8c`).
8. Standing: MEH-1938 ch5 · MEH-2219 ch2 · MEH-2080 · MEH-1915 s4 · the five notice lines · `gov.il`.

## Guards

STEP 0: `--self-test` 17/17 · `shallow=false` · `0 OPEN · 11 parked · 1 satisfied · 5 skipped · 2 unstarted · 0 void`.
Zero `--admin`, zero auto-merge, zero `add -A`, zero force-push. `scripts/checks/run-all.sh`: 18 guards, 0 fail, 3 pre-existing warnings.
