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
| `MEH-841 — comparison moved home→/about + layout A + copy refresh (supersedes MEH-525)` (chunk 3 — `/about`, 04/09) | 4 rows, all CONVERT-PW · **3 converted** (rows 1, 2, 4 → 3 `test(` blocks) · **1 residual** — row 3 (the HOME teaser «ההבדל / מה שמשתנה בדרך / גלו את ההבדל» → `/about` + «אין יותר טבלת סופר\|מהמקור בהום») and the `/en/` half of row 4: both live on `/`, chunk 7's route (home needs the producer fixture for a representative render), and `HomeStaticBlocks.jsx` `HomeComparisonTeaser` carries no testid — deferred to chunk 7, not dropped · **doc-vs-code drift found, not fixed:** row 4 expects a HE-mirror on `/en/about` («הטקסט עדיין בעברית, TODO i18n EN»); `en.json` `about.comparison.*` is real English copy today and the strip renders LTR with the dots on the left — the spec asserts the live English state and says so in a comment; the checklist wording is stale (the matrix's own note on that row already said «re-verify spec before automating») · row 1's «eyebrow ההבדל + heading» is now the chapter mark `about.chapter.2.label` + a lead paragraph (MEH-2211 promoted the pull-quote to the chapter h2) — asserted as rendered · 1 attribute-only testid (`about-comparison`) + 2 on the Close row links | `frontend/e2e/flows/manual/about.spec.ts` | green ×3 locally after the fix (desktop + mobile, 42/42 each run — 21 `test(` blocks × 2 projects; 48.1s · 48.3s · 38.2s) · shown failing first (MEH-1619): group-A row count broken to `length - 1` → exactly that test red on both projects, `Expected: 8 / Received: 9`, nothing else moved; restored, then the three greens |
| `MEH-534 — /about/process "תהליך הקבלה" (S11 Direction D)` (chunk 3 — `/about/process`, 04/09) | 12 rows, all CONVERT-PW · **11 converted** (rows 1–9, 11, 12 → 11 `test(` blocks) · **1 COVERED** — row 10 (footer «תהליך הקבלה» → `/about/process`) by `frontend/__tests__/FooterNavGroups.test.jsx:62` (the business group's href list is exactly `["/join", "/about/process", "/about/for-businesses"]`); no PW duplicate written · **doc-vs-code drift found, not fixed (4):** row 6 says 8 group-A categories — the page renders **9** (MEH-927 split בשר/דגים; the spec's count is derived from `he.json` `process.matrix.catA`, and this is the assertion the red control broke: `Expected: 8 / Received: 9`); row 7 says 8 group-B — renders **7** (MEH-927 removed the herbal row; derived from `catB`); row 11 quotes «כך אנחנו מכירות כל בית עסק» — the key `process.crosslink_from_about` reads «כך אנחנו **בודקות** כל בית עסק» (rendered twice on /about: the MEH-1840 verification teaser + the Close row); row 5 calls the absence kicker gold — it renders `text-primary-dark` (colour not asserted) · row 1's `/he/about/process` is driven as `/about/process` (the `/he/` prefix 307s) · "gold" / "background-alt" are asserted as computed-style EQUALITIES against sibling tokens (em ↔ eyebrow colour, band ↔ matrix band fill ≠ hero fill), never as literal hex · row 12's focus ring: programmatic `focus()` DID paint the `focus-visible` ring in headless Chromium (box-shadow ≠ none, ≠ unfocused) · 13 attribute-only testids in `AboutProcessClient.jsx` | `frontend/e2e/flows/manual/about.spec.ts` | green ×3 locally after the fix (desktop + mobile, 42/42 each run — 21 `test(` blocks × 2 projects; 48.1s · 48.3s · 38.2s) · shown failing first (MEH-1619): group-A row count broken to `length - 1` → exactly that test red on both projects, `Expected: 8 / Received: 9`, nothing else moved; restored, then the three greens |
| `MEH-1289 — דף /about/why-local "למה מקומי?" (17/07)` (chunk 3 — `/about/why-local`, 04/09) | 7 items, **no matrix rows** (the section post-dates the 13/07 triage — see the coverage note atop `manual-testing-matrix.md`); converted under the chunk brief's «plain, cheap presence/link assertions on these routes» clause: **7 converted** (items 1–7 → 7 `test(` blocks; item 5's footer half is COVERED by `FooterNavGroups.test.jsx:61` — the discover group's href list — and its `/about` cross-link half is asserted) · **doc-vs-code drift found, not fixed:** item 1 says five H2s + «איפה מתחילים» (= 6); the page renders **7** — MEH-1810 added the «מה שמשתנה בדרך» closing block (`why-local/page.js` `CHANGES_LINES`); the h2 order is stated as copy KEYS in the spec, the strings and count derive from `he.json` · typography halves of items 1 (Frank Ruhl / DM-Sans) NOT asserted — next/font hashes family names, a computed-style check would pin a build artefact; "green" IS asserted as h2 colour == CTA fill (same `primary` token) · the two external URLs are literals in the page and in the spec · 3 attribute-only testids in `why-local/page.js` | `frontend/e2e/flows/manual/about.spec.ts` | green ×3 locally after the fix (desktop + mobile, 42/42 each run — 21 `test(` blocks × 2 projects; 48.1s · 48.3s · 38.2s) · shown failing first (MEH-1619): group-A row count broken to `length - 1` → exactly that test red on both projects, `Expected: 8 / Received: 9`, nothing else moved; restored, then the three greens |
| `MEH-1227 — פורטרט המייסדת ב-/about נקרא כתמונה בקורא-מסך (08/08)` (chunk 3 — listed under `/about`, 04/09) | 5 items, no matrix rows · **0 converted — STALE, reported:** the founder portrait every row describes is gone from `/about` (MEH-1130 «face-not-focal»; `AboutClient.jsx:44-47`); items 1–3 (announced as a named image / no double announcement / still named when the image fails) are the property `frontend/__tests__/AboutPortraitAriaRole.test.jsx` now guards on the market photograph that replaced it (repointed, not deleted — its own header explains why), plus the axe net at `e2e/flows/12-axe-a11y.spec.ts:181` (`/about`); item 4 (pixel-identical before/after at 390/1440) is VRT-shaped; item 5 (`/en` name «Photo of Sapir…») has no live element to answer to. Rows left untouched in `MANUAL_TESTING.md` for the STALE-deletion pass | — | not converted (STALE; component-level guard cited) |

_Chunk 3 note (04/09): the placeholder row was replaced, as chunk 2's branch did; chunks 1 and 2 land their own rows via their PRs. **Both generators (`tier-manual-testing.py`, `page-map-manual-testing.py`) were NOT re-run on this branch** — same reasoning as chunks 1–2; whichever chunk merges last re-runs both after syncing `staging`._

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
