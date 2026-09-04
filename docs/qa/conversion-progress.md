# MEH-1171 — Conversion progress (checkpoint file)

> Updated after EVERY converted section (checkpoint-and-continue, per ticket).
> **Conversion has not started ON `staging` — but it is NOT unstarted.** A body of converted work exists,
> unmerged, on `origin/feature/meh-1171-manual-testing-conversion` @ `3390c612`. See § Prior work below
> BEFORE writing a single spec; starting from zero here rewrites ~90 existing tests.
>
> Nothing blocks the conversion. Both preconditions cleared 05/08; what remains is queue order, not a gate
> (MEH-1249: after MEH-1909 — which closed 16/08 — and launch-blocking items).

## Status: ▶️ READY — both preconditions cleared, conversion may begin

Unblocked by Sapir's ruling of **05/08** (recorded in full on MEH-1249): option **(ב)** — a
fresh branch off `staging` plus a copy of the 17 net-new files, rather than reviving the
1,295-commit-behind `feature/meh-1171-manual-testing-conversion`. The ruling's wording:
*"הכרטיס משוחרר לריצה"*. Its first caveat — `scripts/local-backend.sh` ships first, in its
own PR, with a proven run — is satisfied (see below).

Branch to cut: `feature/meh-1249-manual-testing-conversion` off `staging`. Do **not** carry
`HANDOFF.md` across (rule 31 — `changelog-branch-guard` reds a code branch that touches it).

- [x] Phase 0 report + full triage matrix (`docs/qa/manual-testing-matrix.md`, 1,068 rows)
- [x] **Sapir approves matrix (incl. STALE deletions)** — DONE 05/08, ruling on MEH-1249
- [x] `scripts/local-backend.sh` (uvicorn + ephemeral Postgres + alembic upgrade head + seed) — DONE, merged in PR #2621 (`cc8c72b1`, on `staging`)
- [ ] Conversion, section by section (CONVERT-PW → `frontend/e2e/flows/manual/`, CONVERT-PYTEST → `tests/test_manual_*.py`)
- [ ] MANUAL_TESTING.md rewrite: pointer stubs (MEH-671 pattern) + unified Tier-3 checklist + STALE sections deleted
- [ ] New suite green ×2 consecutive runs (anti-flake), output pasted here
- [ ] FINDINGS handed to Ticket B

## Per-section log

_(populated during conversion; one line per section: section name · items converted · spec file · run result)_

| Section | Items | Target file | Status |
|---|---|---|---|
| `MEH-995 — /join: דף הצטרפות כבית עסק` (chunk 2 — `/join`, 04/09) | 8 rows, all CONVERT-PW · **7 converted** (items 1–6, 8 → 7 `test(` blocks, one per item) · **1 COVERED** — item 7 (footer «הוסיפו את העסק שלכם» → `/join`) by `frontend/__tests__/FooterNavGroups.test.jsx:62` (the business group's href list is exactly `["/join", "/about/process", "/about/for-businesses"]`); the footer nav link carries no testid, so no PW duplicate was written | `frontend/e2e/flows/manual/join.spec.ts` | green ×2 locally (desktop + mobile, 14/14 each run) · shown failing first (MEH-1619) — see the commit trailers · **3 attribute-only testids added** (`join-hero`, `join-step-numeral` in `app/[locale]/join/page.js`; `about-business-showcase` in `app/[locale]/about/for-businesses/page.js`), no copy / structure / logic change · **doc-vs-code drift found, not fixed:** item 4 says «6 מרכיבים» but the page renders **5** — `verified` is absent from the item list under MEH-1285 (legal-gated — comment at `for-businesses/page.js:238-239`); the spec asserts the live 5 and says so in a comment, so restoring `verified` will red the spec and is the moment to bump the row to 6 · the one literal Hebrew list in the spec (`HERO_FEES_VOCAB`) is a deny-list for item 1's «אין פרימיום/עמלות ב-hero», not expected copy · pointer lines replaced items 1–6 and 8 in `MANUAL_TESTING.md`; item 7 left as-is. **Both generators (`tier-manual-testing.py`, `page-map-manual-testing.py`) were NOT re-run on this branch** — same reasoning as chunk 1; whichever chunk merges last re-runs both after syncing `staging` |

## Prior work — 13 specs + 15 pytest tests exist unmerged. Read this before starting.

_Added 01/09 (MEH-1249, drain יד'). This file used to say "Conversion has NOT started" with a one-row
`not started` table. That is true of `staging` and false of the repository, and the difference is ~90 tests._

`origin/feature/meh-1171-manual-testing-conversion` @ `3390c612` is still on origin, unchanged, and is now
**2,613 commits behind `staging`** (the MEH-1249 description says 1,295 — measured 01/09). Sapir's 05/08
ruling is option **(ב)**: cut a fresh branch off `staging` and COPY these files across, do not revive the
branch. The growing gap strengthens that ruling rather than weakening it.

Counted directly from the blob, not from prose — `frontend/e2e/flows/manual/`:

| Spec | `test(` blocks |
|---|---|
| `content-pages.spec.ts` | 13 |
| `legal-pages.spec.ts` | 8 |
| `producer-detail-state.spec.ts` | 8 |
| `smart-search.spec.ts` | 8 |
| `producer-detail-cta.spec.ts` | 7 |
| `about-process-detail.spec.ts` | 5 |
| `map-near-me.spec.ts` | 5 |
| `city-search.spec.ts` | 4 |
| `home-filter-chips.spec.ts` | 4 |
| `map-legend.spec.ts` | 4 |
| `admin-pages-load.spec.ts` | 3 |
| `admin-status-labels.spec.ts` | 3 |
| `register-wizard-upgrade.spec.ts` | 3 |
| **13 specs** | **75** |

Plus `tests/test_manual_backend.py` — 15 `def test_`, 194 lines. The copy of THIS file on that branch carries
a 14-row per-section log with a `✅ green ×2` claim per section, and a "Runtime notes for the next checkpoint"
block worth reading before the first run.

**Two things that claim is NOT.** The `green ×2` lines are a previous session's report, not a run you have
observed — re-run before trusting any of them. And a viability probe on 01/09 found all 30 distinct
`getByTestId` values those specs use still resolve in `frontend/app` + `frontend/components` on `staging`
(the one apparent miss, `category-chip-1`, is built dynamically at `frontend/components/CategorySelector.jsx:249`
— a false positive of the probe, which was run with a fake-id control). **That says the locator layer survived
2,613 commits. It does not say the specs pass:** copy strings, routes and backend shapes can all move without
touching a testid.

**Do not carry `HANDOFF.md` across** — rule 31; `changelog-branch-guard` reds a code branch that touches it.
