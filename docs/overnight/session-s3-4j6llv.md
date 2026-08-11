# Continuous sweep — session 3 (`s3-4j6llv`) — 2026-08-08

**As of 11:40Z 08/08:** 1 merging (auto-merge armed by Sapir; every required gate green
except Backend tests, still running), 0 awaiting Sapir, 1 parked, 0 quarantined,
0 claimed-elsewhere, staging GREEN at `caadb1c6`.

_The count above is an as-of, not a final tally — #2686 lands on its own once pytest
completes, and a reader after that point should count it as merged. Stating the as-of
because this file's own PIPELINE HEALTH section is about artifacts that kept their
authority after losing their currency._

> **Mid-run authority change.** The sweep prompt was superseded partway through this
> session by Sapir's 08/08 ruling — *"תמזג לבד ותבדוק את עצמך על כל המשימות"*. Everything
> before that point was executed under the old "HIGH-RISK → PR, no merge" rule; everything
> after under self-merge + the mandatory self-check bundle. Where those differ, this log
> says which regime applied.

---

## MERGED / MERGING

### PR [#2686](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2686) — MEH-1921, registration `offers_delivery`

Auto-merge was armed on it by Sapir at 10:4x; required gates on head `71c2aa07`: **Deploy
gate ✅ · E2E gate ✅ · Repo guards ✅ · Backend lint ✅ · Backend mypy ✅ · API contract ✅**,
Backend tests still running at time of writing. It lands without further intervention.

**What it fixes.** Every path that *creates* a producer from a payload wrote `DeliveryArea`
rows and never touched `Producer.offers_delivery`, leaving it at `default=False`
(`models.py:253`). MEH-1848 had already conjoined that flag into both delivery predicates
(`producer_listing.py:243,276`), so the row the owner had just created was exactly the one
the filters exclude — she types her delivery cities in and the site answers "does not
deliver".

**Five sites, not the one the ticket named:**

| Path | Kind | Note |
|---|---|---|
| `auth.py:557` upgrade branch | create | ticket named this region |
| `auth.py:675` new-email branch | create | second branch, own rows — ticket named one |
| `create_producer_with_relations` (`POST /producers`) | create | found by the sibling scan |
| `producer_import.import_rows` (admin CSV) | create | **`status="approved"`, live immediately** |
| `admin_create_producer` (`admin.py:211`) | create | **found by the different-model reviewer** |
| `producer_me.py:97,145` · `admin.py:286` | edit | untouched, deliberately |

**The finding worth carrying forward: classify by CALLER, not by call site.**
`admin.py`'s `_apply_delivery_cities` is invoked from the PUT route (`:286`, edit) *and*
the create route (`:211`). Reading the helper as "an edit path" is locally true and globally
wrong — it hid a whole create route that produces `status="approved"` rows. Two same-model
review passes signed the diff off without seeing it; a different-model checker found it by
hitting the endpoint. That is the maker≠checker requirement earning its keep on its first use.

Admin-create is also the only create path whose schema carries `offers_delivery`, so it
derives **only when the field is unstated** — `model_fields_set`, not a falsy check, since
"omitted" and "explicitly false" both arrive as `False`.

**Self-check bundle:** full backend suite `2399 passed / 371 skipped / 1 xfailed`;
`npm run build` green; `npm run lint` **0 errors**; `npx vitest run` `2493 passed`;
`ruff check` + `ruff format --check` clean; import-cycle verified. Seven tests, five of them
shown failing by construction, including two *isolating* runs (revert only the importer fix
→ `1 failed, 4 passed`; revert only the admin fix → `1 failed, 6 passed`) so no site rides
on another's fix. Two tests are labelled non-evidence: the no-areas control, and the
admin explicit-`false` carve-out that pins the mechanism rather than the outcome.

**Staging moved mid-flight** and brought in `tests/test_meh1939_register_dual_write.py` —
tests over the *same* write paths. Re-ran that plus `test_meh1940_*`, `test_api.py`,
`test_offers_delivery_conjunct.py` and this PR's file against the merged tree: `294 passed`.

**No UI evidence, and none claimed.** No rendered surface changes; the PR does not say
"נבדק בנייד" (MEH-1769).

---

## PARKED

### MEH-1862 — attribute-chip inventory threshold on `/producers`

**Signature:** `card-STOP-fired / contradicts-newer-decision`. Attempts: 1 (Phase 0 only,
as the card instructs). No branch, no code.

Parked under the **old** authority. Under the new ruling the decision is mine to make with
written rationale — **it is the first thing to pick up next**, and the Phase 0 comment on
the card already contains everything needed to decide. Not decided this session: the
authority change arrived while #2686 was mid-flight and I chose to finish the landing
sequence rather than open a second front. Flagging that as a deliberate ordering choice,
not an oversight.

Phase 0 delivered in full as a Linear comment. **Two of the card's own STOP conditions
fired:**

1. **The chips are already gated** — which the card's `<confidence_calibration>` names as
   an explicit stop. Not by MEH-1088 Part A (that is the category axis) but by two
   mechanisms the card predates: `OPEN_NOW_CHIP_MIN = 5` (MEH-1881,
   `producer-filters.js:63`) and `DIET_CHIP_MIN = 5` (MEH-1934, `:73-96`), both already
   implementing the exact absent-not-disabled pattern the card asks for. A third,
   `RATING_SORT_THRESHOLD` (MEH-1864), gates the sort axis the same way.
2. **The AC contradicts a written decision that landed the day before.**
   `producer-filters.js:70-72`, from MEH-1934: *"existing ones are never retro-gated."*
   The AC "count < 15: attribute chips row NOT rendered" **is** retro-gating by definition,
   and at today's catalog size its observable effect is that the whole attribute row
   disappears from `/producers`, while the `>= 15` branch — the sheet, the badge, the
   groups, i.e. most of the work — would never render at all.

**Free finding while there:** the approved-producer count the card asks Phase 0 to locate
needs no new fetch and no `/api/stats`. `page.jsx:23-37` sends only `limit`/`offset`, so
`X-Total-Count` is always the unfiltered approved total and already arrives as
`initialTotal` — and it is structurally immune to the circularity MEH-1881 had to guard
against.

---

## STATUS-SYNCED

- **MEH-1921** → In Progress, labelled `cc-queue`, PR attached, full write-up commented.
- **MEH-1774** / **MEH-1088** confirmed **Done** live (05/08, 03/08). Both are still
  described as "In Progress" inside MEH-1862's dependency section — a stale claim inside a
  card description, the exact class the anti-stale gate exists for. Not edited; recorded.
- **All four "immediate backlog" PRs were merged without me** — verified live rather than
  assumed: **#2683** (10:17), **#2680** (10:26), **#2677** (10:37), and **#2665**, which is
  now the staging head (`caadb1c6`). So the orphan-adoption candidate the prompt named no
  longer needs adopting, and the copy self-check it called for is moot. Nothing to do on
  that list; it was cleared between the prompt being written and my reaching it.

---

## CIRCUIT EVENTS

None. No signature reached 3 parks.

---

## CLAIMS

**Claimed by me:** `feature/meh-1921-registration-offers-delivery` — claimed with an empty
commit before any work, per the ownership protocol.

**Skipped as claimed:** none. No `feature/meh-*` branch existed on origin for any seed item
at session start.

---

## FOREIGN ACTIVITY

Facts only, nothing touched:

- **#2665** (diet landing pages) merged by another actor and is now the staging head — see
  STATUS-SYNCED. Never adopted, never touched.
- Open PRs by `levismadar80-ship-it`: #2661, #2614, #2607.
- Dependabot: #2547, #2129, **#2127**, #2126, #2125.
- **#2480** is the Release #2 `staging→main` PR — Sapir's single click, gate 1.

---

## OPENED ISSUES

None. Both findings extended existing cards rather than opening new ones (rule 27): the CVE
to **MEH-1585**, the `delivery_fee` write-side gap onto **MEH-1921** pointing at
**MEH-1942**.

---

## PIPELINE HEALTH

**A live CVE, found by hand because the gate that should catch it cannot block.**
`joserfc==1.7.0` — the library signing and verifying every access and refresh token — is
affected by **CVE-2026-62995** (JWT malleability via non-conforming trailing `==` padding;
fixed in **1.7.2**). **The remedy is already open as Dependabot PR #2127**
(`joserfc → 1.7.4`), unmerged since 05/08. Exploitability here is *assessed* low —
revocation rides on `token_version` and a fingerprint binding, not a raw-token denylist —
but that is an assessment, not a test. Checked and clear: `starlette==1.3.1` is **not**
affected by BadHost (CVE-2026-48710, fixed in 1.0.1); `fastapi==0.139.0` is current. Full
detail on **MEH-1585**, which is precisely the "pip-audit detects but cannot block" card.

**`delivery_fee` is broken on BOTH sides, and only one side has a ticket.** #2680's audit
established the read side as a live bug (`DeliveryBlock.jsx:429` coalescing every area to
the producer-level fee because the Zod shape strips the key — so a free-delivery city
displays a charge). While in the write paths I found the twin: **no registration path
persists `DeliveryAreaCreate.delivery_fee` at all**, and never has. Fixing one side alone
yields a half-correct picture. Left for the MEH-1942 round and recorded in the helper
docstring rather than patched in passing.

**The CI adversarial reviewer contributed nothing on this PR.** `failure` on both heads,
~30s, zero comments — the documented intermittency. It is `continue-on-error: true` and
outside `ci-gate`'s `needs:`, so it blocks nothing, and it is the reason the mandated
second review pass was run locally on a different model instead of waited for. Relevant to
**MEH-1844**, whose action (b) — pinning the action to a SHA — is still open on PR #2511.

**`ruff format --check` is a separate gate from `ruff check`, and only the latter runs
locally by habit.** The first push went red on `Backend lint` for formatting alone while
`ruff check` was clean. Local pre-push command should be both:
`ruff check app/ && ruff format --check app/`.

**The lint hook's 3-strike block fired on `auth.py`** — the MEH-763 / exec §8 class. Cause
was real: moving three `DeliveryArea(...)` constructions into a helper left the import
unused, and each sequential edit scored a strike before the import could go. Resolved by
fixing the actual F401, not by circumventing the hook. Worth noting that exec §8's stated
remedy ("remove the usage before the import") does **not** help in this direction — either
order leaves one transient error, so the real fix is a single batched edit.

**Environment notes for the next session in a fresh container:**
- Postgres is not running and the databases do not exist. `pg_ctlcluster 16 main start`,
  set the `postgres` password to `postgres`, then create **both** `mehamakor` and
  `mehamakor_test`.
- Run pytest from the **repo root** via `backend/.venv/bin/python -m pytest`. `uv run` from
  `backend/` cannot import the `tests` package.
- `frontend/node_modules` is absent — `npm ci` first, or lint/vitest/build all fail with
  module-resolution errors that look like code faults.

**MEH-1603 metric (parks caused by stale-base / expected-checks): 0.** Neither park came
from a merge-mechanics cause, so this run contributes no evidence either way about the
update-branch setting. One data point that *is* relevant: the only red gate encountered
was a genuine lint failure, not a registration/timing transient.
