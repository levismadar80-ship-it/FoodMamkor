# Session log — parallel-drain **LANE B** (`frontend/**`), id `b-k4m2vt`, 12/08

**Lane paths:** `frontend/**` excluding `frontend/e2e/**`, `frontend/__tests__/**` and VRT
baselines. Never `backend/**`, `.github/**`, `docs/CHANGELOG.md`, `HANDOFF.md`.
Hint list: MEH-2014, 2012, 2015, 1990, 1978, 1977, 1965.

> **This file exists so Lane C can backfill `docs/CHANGELOG.md` and `HANDOFF.md`** —
> LANES.md §2 makes C their single writer, and rule 31 keeps them off any code branch.
> The **Landed / open** section below is the backfill source.

---

## In-flight ledger

| PR | Card | pushed | gate state | next revisit trigger |
|---|---|---|---|---|
| [#2808](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2808) | MEH-2014 (PR 2) | 13:58Z (`2493a56c`) | `CI gate` ✅ · `Deploy gate` ✅ · `E2E gate` ❌ on 4 pre-existing baselines | **auto-merge armed by a parallel actor; I disarmed it** — see below |
| [#2810](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2810) | — (this log) | 14:02Z | docs-only | — |
| [#2814](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2814) | MEH-2012 | 14:36Z | opened, CI starting | first CI result |

**Nothing merged, deliberately** — see *Why nothing merged* below.

### 🛑 Auto-merge was armed on #2808 by another actor. I disarmed it.

Armed with **`mergeMethod: merge`**, not `squash`. Two problems, and the second is
the one that mattered:

1. `merge` discards the crafted squash message — reasoning, `Builder-Model:` trailer
   and `Closes MEH-2014` all end up buried in branch history. Rule 21 documents this
   exact shape (#2787, then #2781 and two others found armed the same way).
2. **It would have merged over a red `E2E gate`, silently.** `E2E gate` is not in the
   `protect-staging` required set — only `CI gate` and `Deploy gate` are, and both were
   green — so auto-merge had nothing left to wait for.

I think the E2E red is *not* a reason to block (four producer-detail VRT baselines,
byte-identical to the set `staging` itself fails). But "a human decided to merge anyway"
and "it merged because the gate that would have caught it isn't required" are different
things, and only the first is a decision.

Disarming ADDS a constraint, so rule 32's parallel-actor case makes it mine to do
unasked; re-arming does not, so I left it off. **If the merge is wanted, re-arm with
`squash`** — and note that changing the method needs a `disable` → `enable` round-trip,
because `enable_auto_merge` on an already-armed PR is a silent no-op that reports success
while keeping the old method. **Worth checking the other open PRs for the same thing.**

---

## Landed / open

### 🟡 MEH-2014 PR 2 — a picked city is a sort origin · PR #2808 · OPEN

PR 1 (#2802) was already merged when this session started; it made `"מרחק"` ask for GPS
instead of sitting greyed out. Its **denial copy promised a manual alternative that did
not exist** — *"אפשר לבחור עיר כדי למיין לפי מרחק"*. PR 2 builds it.

**The decision the card never made, resolved before any code:** the ticket specifies a
city origin but not how a city name becomes a lat/lng, and **the frontend had no answer**
— `data/cities.js` is names only and `GET /cities` returns bare strings, even though the
backend `cities` table *does* carry seeded `lat`/`lng` (`models.py:44-45`,
`scripts/seed_cities.py:73`). Chose **geocode via `lib/places.js`** (the existing provider
abstraction; CSP already allows both hosts at `next.config.js:102`). Rejected: a centroid
of producers in the city (`/map`'s city control filters by `delivery_city` — businesses
that *deliver to* a city are not *in* it), and exposing `lat`/`lng` from `GET /cities`
(cleanest data, but a **backend** change — Lane A's).

**Design note worth carrying:** the two origins are mutually exclusive **by construction**
— one storage key with a `source` discriminator, so a write replaces and nothing has to be
coordinated across the five call sites that write there. A companion "which city" key would
have been a second owner of one fact (Smell #1) and would go stale the first time a GPS
writer forgot it.

`getUserLocation()` still returns exactly `{lat, lng}`; the richer record is a **sibling
reader over the same parser**, so ~10 existing assertions and every distance-label consumer
were untouched.

**Evidence:** 11 unit cases, **8 of 10 red** against the pre-PR-2 tree (control run kept the
`messages/*.json` additions so failures were behavioural, not missing-key — verified every
failure was an `AssertionError`). Browser QA **56 checks, 0 failed, 0 page errors** at
**390×844 · Pixel 5 · 1440×900**, RTL asserted, horizontal overflow **measured**.

### 🔴 The (0, 0) bug — found by the CI reviewer's finding, not by my own review

The `Adversarial review (calibration)` job flagged that `geocodeCity`'s body was never
executed by any test (the unit suite mocks the whole `@/lib/places` module). Writing the
direct test immediately turned one red — and it was a **real defect, not just coverage**:

`normalizeNominatim` yields `lat: null` for a row without coordinates, and **`Number(null)`
is `0`, not `NaN`**. So `Number.isFinite` accepted null as a valid origin at **(0, 0)** —
the Gulf of Guinea — and every producer would have sorted by its distance from there, under
a label naming the city the user picked. Silent: no error, no empty state.

Fixed in `df3d1ba8` with an explicit `== null` guard before the coercion.

**The process point, which is the part worth keeping:** my own same-model adversarial pass
found a different real issue (a stale-geocode race) and missed this one entirely. The
different-model CI reviewer is what caught it — ORDERS §3.2 earning its keep on a live diff
rather than in principle.

### 🟡 MEH-2012 — the experience image is uploaded, not pasted · PR #2814 · OPEN

`ExperienceForm` was the LAST surface still asking a business owner for a raw Cloudinary
URL, while every other producer surface already posts to `/upload/image`. Mirrors
`EventForm`'s widget with two deliberate departures: the failure renders **inline on the
field** (this is the MEH-1809 inline-per-field form, not a toast form), and the
**endpoint's own Hebrew `detail`** is preferred over ours when it sends one — the
free-plan 3-image cap is a real actionable sentence.

**🔴 The trap, found by reading `upload.py` before writing the widget.** The form's
`validateExperienceForm` ran `new URL(image_url)`. `/upload/image` answers with a
**relative** path when Cloudinary is unconfigured — `/placeholder-image.png?name=…`
(`upload.py:115`) — and `new URL()` **throws** on a relative path. Had that guard outlived
the field it validated, the form would have rejected the server's own successful response
on every environment without Cloudinary credentials, telling the owner to "start with
https://" about a field she cannot type into. Removing it was **required**, not cleanup,
and the QA harness asserts that path against the real page rather than arguing it.

**One AC is deliberately NOT covered, and the test says so** instead of faking it:
*"previous image_url preserved"* is unreachable in this UI — the field is a ternary
(preview-with-remove OR uploader), so a second upload cannot begin until the first image
is removed, by which point there is no previous image. `EventForm` has the identical
shape. Worth a decision: either the AC is wrong, or both forms need a "replace" affordance.

Evidence: 9 unit cases, **8 of 9 red** against the old component; browser QA **69 checks,
0 failed, 0 page errors** at 390×844 · Pixel 5 · 1440×900. A pre-existing test asserting
the old URL boundary was **deleted, not relaxed**, and replaced with one asserting the new
contract.

### ⏸️ MEH-2015 — NOT STARTED

Eligible and unblocked now that MEH-2013 merged (#2797), which was its stated dependency.
Note chunk A's audit table is a deliverable Sapir reads **before** chunk B may run.

---

## Findings worth carrying, beyond the cards

### 🔴 The origin change is site-wide, and only `/map` says so

`ProducerCard` reads the same store, so after a city origin is set on `/map`, the distance
labels on **home and `/favorites`** measure from that city — and those surfaces render a
bare magnitude with **no origin named**, because only `/map` got the label. (MEH-1307
removed the `ממך` suffix, so a label is just a number.)

Not fixed: the fix belongs on the shared `ProducerCard` and would widen a `/map` PR into
home + favorites. **Reported on the card, no ticket opened** — findings are not
self-authorised work.

### `GET /cities` should expose the coordinates it already stores

The `cities` table carries seeded data.gov.il `lat`/`lng` that no endpoint serves. Exposing
them would remove a third-party network call from the sort path and replace provider ranking
with official coordinates. **Lane A's**, and worth a card.

### Two probe defects, both of which read as product bugs

Recorded because this repo keeps paying for exactly this class:

1. **Playwright resolves routes in *reverse* registration order.** A `**/*` catch-all
   registered after the geocoder mocks shadowed them and called `route.continue()` into a
   blocked network. Symptom: "no origin stored" — indistinguishable from a broken feature.
2. **`clearPermissions()` returns Chromium to *prompt*, not *denied*.** `getCurrentPosition`
   then hangs to its 8 s timeout and reports code 3 (a toast) instead of code 1 (the modal).
   A genuinely withheld context is the only way to drive the denial path.

### A test that asserted a path the product does not have

My first draft of the gps→city switch drove it through the sort `<select>`. It failed — and
the *test* was wrong, not the code: with an origin already stored, PR 1's trigger
deliberately does not re-prompt. The real path is the map's crosshair. Worth noting because
the failure looked exactly like a feature bug for a minute.

---

## Lane-boundary calls made this session — stated, not assumed

- **`frontend/__tests__/**` and `frontend/e2e/**` are outside my declared lane**, but every
  card's DoD requires a vitest file and ORDERS §3.3 requires the QA harness. Raised it and
  was told to write them; did. Files added: `__tests__/MapManualOrigin.test.jsx`,
  `__tests__/places.test.js` (extended), `e2e/qa-meh2014-map-manual-origin.mjs`.
- **`lib/user-location.js` and `lib/places.js` are outside PR 2's stated `<file_locations>`**
  — both named in the PR body with reasons, neither slipped in. The origin discriminator has
  to live with the store; the geocoder belongs beside the provider dispatch it reuses.
- **No worktree.** The lane brief names `../mm-lane-b`; this container runs one session with
  no parallel lane, and a second checkout costs a full `npm install` against a fixed disk
  allowance. Worked in the primary checkout. Flagging rather than silently diverging.
- **`docs/CHANGELOG.md` / `HANDOFF.md` never touched** — hence this file.

---

## Why nothing merged

ORDERS §1.1 grants merge authority, but §3 makes the self-check bundle the thing that
replaced Sapir's eyes, and **the bundle is not complete**:

- E2E is red on `feature/meh-2014-map-manual-origin`, and — this is the honest part — the
  14 failures are **not all** explained away. Producer-detail, WhatsApp, lightbox,
  producer-locations and delivery-checker specs all failed while that run's own
  `next-start.log` shows the staging backend answering **500 for every
  `/producers/by-slug/*`**; `staging` itself was red in the same window
  (`31599329688`, `31597872248`, `31594732601`), as were `meh-1868` and `meh-1876`.
- But `parity › home` (mobile) is **not** explained by the 500s, and it is the one surface
  this PR could theoretically reach (`ProducerCard` reads the store I changed). The push at
  13:58Z re-runs against current staging; if `home` stays red while the producer specs
  recover, it is mine.
- `parity › producer-detail-two-channel-revealed` fails on staging too — pre-existing VRT
  drift, neither mine nor the backend's.

**Merging on a base that is red for reasons I have only partly characterised is exactly what
the bundle exists to prevent.** Left for Sapir.

---

## Next

1. **MEH-2015 chunk A** — the remaining Lane B card, unblocked by MEH-2013 (#2797).
2. Decide the `mergeMethod` question on #2808 (re-arm with `squash`, or merge by hand).
3. Decide the unreachable-AC question on MEH-2012: either the "previous image preserved" AC
   is wrong, or `ExperienceForm` **and** `EventForm` both need a replace-without-removing
   affordance.

## Resolved during the session — recorded so it is not re-investigated

**`parity › home` (mobile) recovered.** It was the one E2E failure the staging backend
outage did not obviously explain, and I said I would own it if it stayed red. On head
`2493a56c` it passed, and the failure set dropped 14 → 4 — the four being *exactly* the
producer-detail VRT specs that `staging` itself fails at the same line numbers
(run `31599329688`). Not "staging is also red"; the identical set.

**One residue, named rather than dropped:** `24-producer-locations › cluster badges never
exceed the unique-producer count` reported **flaky** (passed on retry) on that run. It is a
`/map` clustering assertion, so it is in MEH-2014's neighbourhood — but it was absent from
the previous run's failures and nothing in the diff touches clustering. Unexplained
observation, not attributed to the harness.

**`MapNearestSortTrigger.test.jsx` is intermittently flaky under full-suite parallelism.**
It failed once in a 306-file run and passed in isolation (9/9) and in two later full runs.
Not caused by either PR here — measured on a branch that contains neither change.
