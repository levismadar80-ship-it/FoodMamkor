# Rulings pending — 2026-09-02 (drain כב', session `01UJNNqp…`)

> One line per ruling. Every "measured" figure was produced in drains כא'/כב' and is cited on the card named in the row. **Nothing here is decided** — the last two columns say who decides and what CC would recommend if asked. A ruling that needed a paragraph was split into two rows.
>
> Tier key: 🟢 LOW-RISK (tests / copy / tooling / single-file) · 🟡 YELLOW (multi-file, behaviour) · 🔴 RED (Alembic · auth · security · money · legal). Who: **ORCH** = orchestrator rules (LOW-RISK product/tooling/copy) · **SAPIR** = Alembic, auth, security, money, legal, consoles.

| # | card | question (yes/no or a/b) | options | CC recommendation — measured reason | tier | who |
|---|---|---|---|---|---|---|
| 1 | MEH-2189 | Keep the desktop `web.whatsapp.com` optimisation? | **a** fix the mechanism (hook + explicit `desktop` opt, 7 files) · **b** drop it, `wa.me` always (1 line) | **b.** Measured ×20 on staging: `matchMedia` desktop 20/20 but the href swaps in **7/20** and never after +1.5 s — `getWhatsAppHref` (`lib/utils.js:17-25`) runs at render, so SSR/CSR mismatch is structural and React never repairs the attribute. The optimisation exists 35% of the time today; **a** buys determinism at 7 files, **b** at 1 line and a revisit of the MEH-152 interstitial note (`utils.js:9-10`). | 🟡 (a) / 🟢 (b) | ORCH |
| 2 | MEH-2233 | Which LCP lever first? | **1** next-intl `messages=` per route · **2** split the zod chunk · **3** drop Latin font faces | **1.** `layout.js:235` ships the whole `he.json` (323,510 B) inline — 306 KB of a 435 KB HTML on `/`; blocking JS is worth ~2.8 s of a 5.8–6.5 s LCP (control run), and lever 1 is the only one on all five pages. 2 and 3 after. | 🟡 | ORCH |
| 3 | MEH-1286 | Build «חדשים אצלנו» on `created_at DESC` + `status='approved'`? | **yes** (no schema) · **no**, add `approved_at` first (Alembic) | **yes.** `grep approved_at backend/app/models/models.py` → 0; the card's own prompt names `created_at` as the fallback and forbids Alembic. Placement default (after «מומלצים») already stands per the 09/08 groom. | 🟢 | ORCH |
| 4 | MEH-1892 | Let `/en` render LTR end-to-end by removing the unconditional `html { direction: rtl }`? | **yes** (scope `globals.css:168-169` to `html[dir="rtl"]`) · **no**, per-component `dir="ltr"` | **yes.** `layout.js:201-204` already emits `<html dir="ltr">` on `/en`; the CSS overrides it (measured computed `rtl` on `/en`, `rtl`/`rtl` on `/` as control). One line; blast radius = all of `/en` (toggle-only, `localeDetection: false`). Needs one screenshot pass of `/en` after. | 🟡 | ORCH |
| 5 | MEH-1944 §3 | Diet pages cap at 24 with no disclosure — add «מוצג 24 מתוך N» + link? | **a** disclosure + link to filtered `/producers` · **b** document 24 as intended | **a.** `labels.md` §Indicators makes truncation without disclosure a defect; `page.js:37 PER_PAGE = 24`. Copy is Hebrew → rule 22 applies to the string. | 🟢 | ORCH (copy) |
| 6 | MEH-2242 | Should `_delivery_day_condition` also require `offers_delivery = true`, like `_delivery_city_condition`? | **yes** · **no** (keep v1 literal semantics) | **yes.** Measured on seeded data: `?delivery_city=חיפה&delivery_days=שלישי` → 3, **2 of them `offers_delivery=false`**; the city predicate already hides them. One file + fail→pass pytest. Nationwide/day-less exclusions untouched. | 🟢 | ORCH |
| 7 | MEH-2079 | Retention windows: 13 months raw + daily roll-up (`producer_page_views`, `producer_whatsapp_clicks`) and 30 days (`alert_log`)? | **13m/30d** · **12m** · **24m** | **13m + 30d.** Only code readers: dashboard 30 d (`producer_me.py:1020-1023`), alert cap 24 h (`alerts.py:184-189`); 13 = year-over-year + one month. Row counts: **needs SQL** — not posted; two read-only blocks are on the card. Whatever number lands goes into the privacy policy (a commitment). | 🔴 legal | SAPIR |
| 8 | MEH-1897 | Close on the audit half and re-open the declarations half as a follow-up of MEH-1748? | **a** close + follow-up card · **b** keep frozen on this card | **a.** Audit landed (#3271, 42 fields, zero live stripping bugs); 44/46 declarations come from codegen anyway. A frozen half on an open card is what audits re-inherit as work. | 🟢 | ORCH |
| 9 | MEH-1980 rider | License scan: new narrow card or drop? | **a** new card (`npm ls --json` + `pip-licenses`, ~30 min) · **b** drop | **a.** MEH-1961 is Done + archived (11/08) with no license text; the rider never ran and an archived card cannot carry it. | 🟢 | ORCH |
| 10 | MEH-1748 | Open Phase 2 (call-site replacement) now? | **yes** · **not yet** | **not yet.** Phase 1 already costs a 67 KB gz / 284 KB raw chunk on every page (`3fnwmcx9kfs72.js`, 1,112 `zod` refs — MEH-2233 finding 2), and the `variant: 'mini'` decided 14/08 is unverified. Step before Phase 2: confirm mini variant or measure the chunk. | 🔴 HIGH-RISK per card | SAPIR |
| 11 | MEH-2168 ch3 | Chunk 3 = `32:205` + `37-outreach ×4` + `30:394`, tests-only? | **yes** · **narrower** | **yes, and `03:35` is NOT in it.** `32:205`: marker div exists with the right opts but is 0-height because GSI answers 403 «origin not allowed» for `localhost:3000` — assert attached + opts, not visible. `37 ×4`: same GSI 403 in `assertNoConsoleErrors` → filter that origin. `30:394`: **reproduces locally** (new tab lands on `/login`, token null) — stub scope, measured in ch3. `03:35` (`/lehem-vezman` contactable per API, absent from `/producers` grid) is real behaviour → bug card, STOP (e). | 🟢 | ORCH (already GO) |
| 12 | MEH-1736 | Close with the measured evidence (0/14 slug closes since 01/09, `Closes` 5/5)? | **yes** · **wait for a reopen-of-Done measurement** | **yes.** Proposal + evidence posted on the card 11:59Z; the reopen direction stays a one-line note in rule 29. | 🟢 | ORCH (already ruled: propose) |

## Data fix — staging producer `xcv` carries the retired status `pending_whatsapp` (Railway → Postgres → Query)

```sql
-- 1. see it (expect exactly one row; MEH-2124's "zero rows ever" premise is false on staging)
SELECT id, slug, status, created_at FROM producers WHERE status = 'pending_whatsapp';

-- 2. fix it
UPDATE producers SET status = 'draft' WHERE slug = 'xcv' AND status = 'pending_whatsapp';
```

**Target = `draft`, not `pending`.** `pending_whatsapp` meant "registered, phone never OTP-verified"; that flow is gone (MEH-2124), so the business is an unverified registration. `draft` is the fail-closed start state (`models.py:132-140`): invisible until the owner submits. `pending` would mint an admin-queue row for a business nobody verified. `status` is a free String (no enum, no CHECK), so this is data-only. **SAPIR** — production DB URL is deny-listed for CC; run the same two statements on production if step 1 returns a row there.

## Seed commands — Railway → backend service → Console (`WORKDIR /app`)

```bash
# 1. flagship demo business + dietary demos + group-buys/experiences (MEH-1706 chunk B; also lights the diet landing pages)
python -m scripts.seed_demo_business --refresh
# 2. cities table from data.gov.il (MEH-2241 chunk 0 — CitySearch has a 102-entry static fallback today)
python -m scripts.seed_cities
```

`--refresh` **deletes and recreates** the flagship demo (`ruach-hasadeh`) and its seed users — expected. `seed_demo_producers --confirm` already ran on 01/09 (8 of 8). Both scripts refuse production (`_assert_not_production`), so on production they are a separate decision.

## The `.github/**` patches — CC-deny (MEH-671), apply-order by value

| # | file | what stays broken without it |
|---|---|---|
| 1 | `docs/ci/meh-1706-seed-coverage-gate.patch.md` | a new feature surface can ship with zero seeded rows — the coverage contract (`check_seed_coverage.py`) is enforced by nothing |
| 2 | `docs/ci/meh-2196-qa-three-state.patch.md` (**both** steps) | the QA bot says FAIL on runs where nothing ran, and step 2 alone says PASS on 26 failures |
| 3 | `docs/ci/meh-1868-mypy-ratchet.patch.md` | mypy reports success regardless of result (`pr-checks.yml:537` + `:554 \|\| true`); 20 frozen errors are invisible |
| 4 | `docs/ci/meh-1868-knip-ratchet.patch.md` | dead code never blocks; 46 findings frozen, no ratchet |
| 5 | `docs/ci/meh-1980-coverage-ratchet.patch.md` | frontend coverage can drop below 66.77% silently |
| 6 | `docs/ci/meh-2184-qa-artifacts-pathspec.patch.md` | `frontend/qa-artifacts/` is outside the 2 MB size cap |
| 7 | `docs/ci/meh-1754-next-public-api-url.patch.md` | CI builds without `NEXT_PUBLIC_API_URL`; the env-fail-fast code half (branch `feature/meh-1754-env-fail-fast` @ `5b339fc3`, PR #2831 closed stale) cannot land until this expand step is in |

*Drain-Session: 01UJNNqp-drain-kb*
