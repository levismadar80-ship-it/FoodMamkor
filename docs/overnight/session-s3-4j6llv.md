# Continuous sweep — session 3 (`s3-4j6llv`) — 2026-08-08

0 merged, 1 PR awaiting Sapir, 1 parked, 0 quarantined, 0 claimed-elsewhere, staging GREEN at `4d590d67` (untouched by me).

_In progress — updated as the sweep runs._

---

## MERGED

None. Neither item reaching a landing state this session was mine to merge:
MEH-1921 touches a central component in a HIGH-RISK domain; MEH-1862 never
produced code.

---

## PRs AWAITING SAPIR

### PR [#2686](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2686) — MEH-1921, registration `offers_delivery`

**What to check:** that deriving `offers_delivery` from delivery areas on the
four CREATE paths — but deliberately **not** on the EDIT paths — is the split
you want. Everything else in the PR follows from that one call.

- Branch `feature/meh-1921-registration-offers-delivery`, non-draft so the gates
  produce real evidence rather than a draft's skip-signal.
- Full backend suite `2396 passed, 371 skipped, 1 xfailed`; `ruff` clean; no
  frontend file touched so `npm run build` was not run.
- Four behavioural tests, each shown failing by construction against the
  unfixed code, plus one labelled control that passes in both worlds.

**Three things in it that were not in the ticket:**

1. `auth.py` has **two** registration branches (`:552` upgrade, `:675`
   new-email), each building its own rows. The ticket named one.
2. The **admin CSV importer** had the identical defect and is the sharpest
   case — its rows are created `status="approved"`, so they are live
   immediately, and sheet column K writes the legacy `has_delivery` column that
   no delivery predicate consults (MEH-1849).
3. A CVE finding unrelated to the diff — see PIPELINE HEALTH.

---

## STATUS-SYNCED

- **MEH-1921** → In Progress, labelled `cc-queue`, PR attached.
- **MEH-1774** and **MEH-1088** confirmed **Done** live (05/08 and 03/08). Both
  are still described as "In Progress" inside MEH-1862's dependency section —
  a stale claim in a card description, exactly the class the anti-stale gate
  exists for. Not edited (they are not my cards to rewrite); recorded here and
  in the MEH-1862 comment.

---

## PARKED

### MEH-1862 — attribute-chip inventory threshold on `/producers`

**Signature:** `decision-gated / card-STOP-fired`. Attempts: 1 (Phase 0 only, as
the card instructs). No branch, no code.

Phase 0 was delivered in full as a Linear comment. **Two of the card's own STOP
conditions fired**, so the card's instruction to stop before code was honoured:

1. **The chips are already gated**, which the card's `<confidence_calibration>`
   names as an explicit stop. Not by MEH-1088 Part A (that is the category
   axis) but by two mechanisms the card predates: `OPEN_NOW_CHIP_MIN = 5`
   (MEH-1881, `producer-filters.js:63`) and `DIET_CHIP_MIN = 5` (MEH-1934,
   `:73-96`) — both already implementing the exact absent-not-disabled pattern
   the card asks for. A third, `RATING_SORT_THRESHOLD` (MEH-1864), gates the
   sort axis the same way.
2. **The AC contradicts a written decision that landed the day before.**
   `producer-filters.js:70-72`, from MEH-1934: *"existing ones are never
   retro-gated."* The AC "count < 15: attribute chips row NOT rendered" **is**
   retro-gating by definition, and at today's catalog size its observable
   effect is that the entire attribute row disappears from `/producers` —
   while the `>= 15` branch (the sheet, the badge, the groups: most of the
   work) would never render at all.

Both positions are internally coherent; choosing between them is a product
call. Three questions were put to Sapir on the card.

**Free finding while there:** the approved-producer count the card asks Phase 0
to locate needs no new fetch and no `/api/stats`. `page.jsx:23-37` sends only
`limit`/`offset`, so `X-Total-Count` is always the unfiltered approved total and
already arrives as `initialTotal`. It also happens to be immune to the
circularity MEH-1881 had to guard against.

---

## CIRCUIT EVENTS

None. No signature reached 3 parks.

---

## CLAIMS

**Claimed by me:** `feature/meh-1921-registration-offers-delivery` (claimed with
an empty commit before any work, per the ownership protocol).

**Skipped as claimed:** none — no `feature/meh-*` branch existed on origin for
any seed item at session start.

---

## FOREIGN ACTIVITY

Facts only, nothing touched:

- Open PRs authored by `sapirschnapp`: #2685, #2683, #2682, #2681, #2680, #2677,
  #2665, #2628. All on the skip list or outside my lane.
- Open PRs authored by `levismadar80-ship-it`: #2661, #2614, #2607.
- Dependabot: #2547, #2129, #2127, #2126, #2125.
- #2480 is the Release #2 `staging→main` PR — Sapir's merge authority.

---

## OPENED ISSUES

None. Both findings extended existing cards rather than opening new ones
(rule 27): the CVE went to **MEH-1585**, the `delivery_fee` write-side gap was
recorded on **MEH-1921** and pointed at **MEH-1942**.

---

## PIPELINE HEALTH

**A live CVE, found by hand because the gate that should catch it cannot
block.** `joserfc==1.7.0` — the library signing and verifying every access and
refresh token — is affected by **CVE-2026-62995** (JWT malleability via trailing
`==` padding; fixed in **1.7.2**). **The remedy is already open as Dependabot PR
#2127** (`joserfc → 1.7.4`), sitting unmerged since 05/08. Exploitability here
is *assessed* low — revocation rides on `token_version` and a fingerprint
binding, not a raw-token denylist — but that is an assessment, not a test.
Checked and clear: `starlette==1.3.1` is not affected by BadHost
(CVE-2026-48710, fixed in 1.0.1). Full detail on **MEH-1585**, which is exactly
the "pip-audit detects but cannot block" card.

**The lint hook's 3-strike block fired on `auth.py`** — the MEH-763 / exec §8
class. Cause was mundane and real: moving three `DeliveryArea(...)`
constructions into a helper left the import unused, and each sequential edit
scored a strike before the import could be removed. Fixed by `ruff --fix` on the
actual F401, not by working around the hook. Worth noting because the remedy in
exec §8 ("remove the usage before the import") does not help for this direction
— either order leaves one transient error.

**Environment note for the next session:** Postgres is not running in a fresh
container and the test databases do not exist. `pg_ctlcluster 16 main start`,
then create both `mehamakor` and `mehamakor_test` (the suite wants the `_test`
one). Tests must run from the **repo root** with `backend/.venv/bin/python -m
pytest` — `uv run` from `backend/` cannot import the `tests` package.

**MEH-1603 metric (parks caused by stale-base / expected-checks): 0.** Neither
park this session came from a merge-mechanics cause, so this run contributes no
evidence either way about the update-branch setting Sapir enabled.
