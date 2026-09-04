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
| `Legal pages (אפריל 2026)` (chunk 4 — `/privacy` · `/terms` · `/accessibility` + the site-wide Footer/CookieBanner, 04/09; tagged `MT:LEGAL:<n>` because the section has no ticket id) | 14 rows · **6 converted** (rows 1, 2, 8, 9, 10, 11 → 6 `test(` blocks — every CONVERT-PW row with `destructive = no` that lives on a route this chunk owns) · **3 COVERED, cited not duplicated** — row 5 `tests/test_api.py:1183` (`test_submit_contact_saves_to_db`), row 7 `tests/test_api.py:1349` + `:1336` (fail-open), row 12 by `frontend/e2e/flows/18-producer-register-wizard.spec.ts:151-156` + `frontend/__tests__/RegisterProducerClient.test.jsx:356-366` (the no-declarations submit) · **1 DEVICE-ONLY** — row 4 (live inbox) · **1 CONVERT-PYTEST** — row 6 (the `5/hour` limiter, `marketing.py:170`; not a PW row) · **2 residual** — row 3 (`/contact` submit → success block: matrix `destructive = yes`, a real POST writes `contact_messages` + sends mail; the success-state UI would need the MEH-1968 three-condition mock exception argued in the spec — left for a decision, not silently dropped) and row 13 (DirectoryDisclaimer above the report button — `/producer/[id]` is chunk 8's route and is SSR-fetched from the backend at `producer/[id]/page.js:39`, so it cannot render in the sandbox; mount order is `ProducerSections.jsx:758` disclaimer → `:781` ReportButton) · **1 STALE, reported** — row 14 (the «מהמטבח של השכן» grid): the `/neighbor` route and its grid were removed (MEH-598 → MEH-793; `next.config.js:166-167` redirects `/neighbor/*` → `/`) and the phrase is a BRAND.md lock violation; row left untouched in `MANUAL_TESTING.md` for the STALE-deletion pass · **doc-vs-code drift found, not fixed (3):** row 9 says 4 footer links (מדיניות / תנאי / נגישות / קשר) — the copyright bar renders **5** (`nav.footer.login` «כניסה לחשבון» is first, `Footer.jsx` utility list) and «קשר» resolves to `/about#contact` (MEH-1312), not `/contact`; the spec states the 5 keys + hrefs and reads the labels from `he.json`, and the red control broke exactly this count (`Expected: 4 / Received: 5`); row 12 says «כפתור disabled» — the STORY submit is `disabled={loading}` only (`RegisterProducerClient.jsx:2072`) and an unchecked consent is a click → `role="alert"` (`:2058-2069`), which is what the cited spec 18 asserts; row 3 quotes «תודה! נחזור אליך בקרוב 🌿» — the live copy is `contact.success_title` «תודה! קיבלנו את הפנייה.» + `success_message` «נחזור אלייך תוך 3 ימי עסקים» with a Phosphor leaf, no emoji (Emoji LOCK) · row 11's «analytics לא נטען» is asserted through the storage contract both loaders read (`ClarityScript.jsx:11`, `lib/analytics.js:44` gate on `cookieConsent === "all"`) plus a request-recorder control; the DOM/network half is stated in the spec as non-discriminating on a build without `NEXT_PUBLIC_CLARITY_PROJECT_ID` (`layout.js:267`) · no `/en/` row exists in the section, so no EN twin is asserted · the page map's line number for this heading (1903) had already drifted to **1912** on `staging` by 04/09 — the generator was NOT re-run here, per the chunk brief · 7 attribute-only testids: `privacy-page`, `terms-page`, `accessibility-page` (the three `page.js` roots), `footer-utility-links` (`Footer.jsx`), `cookie-banner` / `cookie-accept-all` / `cookie-essential-only` (`CookieBanner.jsx`) | `frontend/e2e/flows/manual/legal.spec.ts` | green ×3 locally (desktop + mobile, 12/12 each run — 6 `test(` blocks × 2 projects; 14.9s · 14.7s · 15.1s) · shown failing first (MEH-1619): the footer utility-link count broken to `length - 1` → exactly that test red on both projects, `Expected: 4 / Received: 5`, nothing else moved (10 passed alongside the 2 reds); restored, then the three greens |

_Chunk 4 note (04/09): the placeholder row was replaced, as chunks 2 and 3's branches did; chunks 1–3 land their own rows via their PRs and whichever merges last reconciles this table. **Both generators (`tier-manual-testing.py`, `page-map-manual-testing.py`) were NOT re-run on this branch** — same reasoning as chunks 1–3; whichever chunk merges last re-runs both after syncing `staging`._

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
