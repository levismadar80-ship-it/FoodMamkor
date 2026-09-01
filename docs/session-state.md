# Session state — 2026-09-01 night, drain יח' (session `0113JYkWvGYY…`)

**One line:** the MEH-2189 smoke spec ran against real data for the first time —
**11 passed, 1 failed** — and both sandbox blockers that had made that impossible
turned out to be already-documented and clearable without touching repo config.

---

## The headline: 8 demo pages are LIVE, and the spec finally had something to measure

Sapir seeded staging tonight (`Inserted 8 of 8`, then `Inserted 0 of 8` on a second
`--confirm` — idempotency proven). Independently verified before running anything:

| probe | result |
|---|---|
| all 8 archetype slugs, `GET /api/producers/by-slug/<slug>` | **`200` ×8** |
| control: `zzz-no-such-producer` | **`404`** |

The control matters: without it a `200` proves only that something answered.

### The run

```
target: https://staging.mehamakor.online   (project: desktop)
[MEH-2189 fixture gate] seeded=true (GET /api/producers/by-slug/sdot-zahav -> 200)

  11 passed (1.3m)
   1 failed — beacon :: whatsapp-click fires on wa.me items and on nothing else
```

**All eight matrix rows passed, including the edge.** `maadaniyat-ben-shemen`
(phone-primary, `phone=NULL`) renders **no CTA** — not a dead `tel:` link. That was
the card's STOP condition (e) and **it did not fire**. `breakpoints` and
`contact sheet` passed too.

---

## The one failure is a spec gap, not a product bug — and it was classified, not guessed

It failed on the test's **own CONTROL step**: no *visible* `question-link` with a
`wa.me` href on `sdot-zahav`. Measured against the live HTML:

```
sdot-zahav:  question-link ×2 · wa.me ×9 · primary-cta ×2
<button aria-expanded="false" data-testid="quick-answer-toggle" …>
```

The chips **exist and are correct** — `<a href="https://wa.me/…" data-testid="question-link">`
— but sit behind a disclosure that is **collapsed by default**. The spec clicks
without opening it. That is a **test-bug** under MEH-1249's own test-bug/app-bug
distinction, and it is the CLAUDE.md 5-state rule exactly: **open/closed for every reveal.**

> ### 🔴 And a second finding: one of the 11 "passes" is green for two reasons
>
> `MEH-2154 :: non-whatsapp-primary pages carry zero wa.me links in the question chips`
> passed. But `beit-habad-sivan` (email-primary) has **`question-link ×0`** — there
> are no chips at all. The assertion passes because nothing is there, not because
> what is there is right. **That is `testing.md`'s "green with two possible causes",
> and it is currently counted as one of the 11.**
>
> Whether an email-primary page *should* carry channel-aware `mailto:` chips is a
> product question. **Not decided here.**

**Zero component changes. Zero spec changes.** Both fixes deserve a focused pass.

---

## Both sandbox blockers cleared — documented, and with no repo config touched

| blocker | fix |
|---|---|
| pinned `@playwright/test` resolves `chromium_headless_shell-1234`; image carries **1194** (the MEH-2168 A′ blocker) | `executablePath` → `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` |
| every `page.goto` → **`net::ERR_CONNECTION_RESET`** | `--ssl-version-max=tls1.2` (`testing.md`, MEH-938/942, re-confirmed MEH-2118) |

**The discriminator that proved it was the browser and not staging:** the spec's
fixture gate uses Playwright's *request* context (Node, not Chromium) and reported
`seeded=true (200)` **in the same run** where every browser navigation reset.

Both overrides lived in a scratch file that was **not committed**.

> **Contact sheet — a correction worth carrying.** The 16 `.webp` in
> `frontend/qa-artifacts/meh-2189/` were **already tracked**; they landed in #3115
> itself (`1144a656`). The spec writes **PNG only** (`:266`), so tonight's run
> produced 16 fresh PNGs (2.5 MB) which were discarded per MEH-1156.
> **The merged sheet therefore predates the seed and cannot depict the seeded
> pages.** No new sheet was produced this window.

---

## STEP 0 lied to me, and the control said `ok` while it did

STEP 0 was first run from a local base branch **two commits behind** its remote.
The **old** script executed, printed **three fewer rows** than exist, and reported
`currency: ok` — truthfully, because the *remote ref* was current. The **working
tree** was not.

```
first   0 OPEN ·  8 parked · 1 satisfied · 6 skipped · 1 unstarted   ← stale script
true    0 OPEN · 11 parked · 1 satisfied · 6 skipped · 2 unstarted
```

Named in `scripts/wake-when.sh`'s header (#3265). No code fix: a script cannot ask
whether it is itself the newest version without trusting the tree it was read from.

---

## Per-item verdicts

| item | verdict |
|---|---|
| **T0** MEH-2189 chunk C | ✅ **run** — 11/12, both findings on the card, only the spec DoD line ticked |
| **T10** retire MEH-1976 SKIP row | ✅ **#3265** — post-launch card, row was noise; tally 6→5 derived |
| **T11 / T4** wake-when OPEN | ✅ **empty** — 0 OPEN |
| **T1** MEH-2192 | ⏸️ **refuted twice** (drains 17 + 18): `llms.txt` ✓ · `buildOrganizationNode` with `description`+`sameAs` ✓ · `about.updated_at` ✓. Nothing to ship. |
| **T4/T2** MEH-2080 | 📊 **measured, parked**: `User` has **no** DOB/age column; `UserRegister` + `ProducerRegister` collect none. Both carry `terms_accepted: bool = False`, and `schemas.py:737-748` records that ToS consent **reaches no column at all** — that is the natural carrier and it is already half-built. Threshold = Sapir's ruling; a column = Alembic = not tonight. |
| **T2** MEH-1754 · **T3** MEH-2079 · **T5–T9** | ⏸️ **not reached** |

---

## For Sapir, over coffee — her rulings queue, in priority order

1. **MEH-2189** — the contact sheet on staging predates your seed. Do you want a
   fresh one, and do you want the mobile pass now that 8 pages are live?
2. **MEH-2189 / MEH-2154** — should an email-primary page carry channel-aware
   `mailto:` question chips, or none? A passing test currently depends on the answer.
3. **MEH-2080** — the minimum-age threshold, and whether it rides `terms_accepted`.
4. **MEH-2219** ch2 vs ADR-003 (unchanged from drain טז').
5. Apply `docs/ci/meh-2184-qa-artifacts-pathspec.patch.md`.

## Guards

18 ran, **0 fail**, 3 warned — all pre-existing on clean `origin/staging`.
