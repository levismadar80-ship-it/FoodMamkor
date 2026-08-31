# MEH-2203 — axe-core audit, five core routes

**Report only. Nothing was fixed, no ticket was opened.** The proposed follow-up list at
the end is for Sapir to approve or reject.

Run 2026-08-30 against **deployed staging**, `@axe-core/playwright` 4.13.0, tags
`wcag2a wcag2aa wcag21a wcag21aa`. Harness: `frontend/qa-meh2203-axe.mjs`.

---

## Headline

**10 rows measured, 0 void. One violation class, on one route, at both viewports:
`color-contrast` (serious), 7 nodes — and all 7 are the same element repeated across
7 cards.** Everything else is clean.

| viewport | route | http | violations | axe passes | impact |
|---|---|---|---|---|---|
| mobile-375 | `/he` | 200 | **0** | 32 | — |
| mobile-375 | `/he/producers` | 200 | **1** | 32 | serious ×1 |
| mobile-375 | `/he/map` | 200 | **0** | 30 | — |
| mobile-375 | `/he/teva-pure` | 200 | **0** | 30 | — |
| mobile-375 | `/he/register/producer` | 200 | **0** | 27 | — |
| desktop-1440 | `/he` | 200 | **0** | 32 | — |
| desktop-1440 | `/he/producers` | 200 | **1** | 31 | serious ×1 |
| desktop-1440 | `/he/map` | 200 | **0** | 31 | — |
| desktop-1440 | `/he/teva-pure` | 200 | **0** | 30 | — |
| desktop-1440 | `/he/register/producer` | 200 | **0** | 27 | — |

---

## Read the zeros only because the controls held

A `violations: 0` line has **three** possible causes — the page is clean, the page never
rendered, or axe never ran. Two of those are failures that print as the reassuring
answer. So every row carries two controls, and a row failing either is printed `VOID`,
never `0`:

- **Control A — the page actually rendered.** `http == 200`, no `משהו השתבש` error
  boundary, non-zero `body` box. Without this the run photographs an error page and
  reports it clean — the #2786 failure.
- **Control B — axe actually analysed.** `results.passes.length > 0`. An axe run that
  analysed nothing returns `violations: []` **and** `passes: []`, which is
  indistinguishable from a perfect page at the call site.

**Both held on all 10 rows** (`passes` 27–32 per row, column above). That is what makes
the eight zeros evidence rather than silence.

---

## The one violation

**`color-contrast` · serious · 7 nodes · `/he/producers`, both viewports**

```
Element has insufficient color contrast of 3.74
  foreground: #54846f   background: #eaf3de
  font: 12.0pt (16px), bold
  Expected contrast ratio of 4.5:1
```

- **Element:** `<span class="font-headline-md text-base font-bold text-primary/80">מהמקור</span>`
- **Owner file:** `frontend/components/ProducerCard.jsx:338`
- **Context:** the wordmark inside the **no-image placeholder** — the `bg-green-50` panel
  introduced by MEH-1400 to stop "cream on cream" reading as an empty hole.
- **Why 7:** the `/producers` grid showed 7 cards without an image. It is **one element
  repeated**, not seven distinct defects. Fixing the one span clears all 7 nodes.

**Why it fails by a small margin, precisely:** `text-primary/80` renders `#2E6853` at 80%
over `#eaf3de`, giving `#54846f` → **3.74:1**. At 16px bold the WCAG AA threshold is
**4.5:1**, not 3:1 — the large-text exemption starts at 18.66px bold (14pt). The element
is 12.0pt, so it sits just under the wrong side of the boundary.

**Not a proposed fix, but the shape of the decision:** dropping the `/80` opacity puts
`#2E6853` on `#eaf3de` well above 4.5:1. That is a design-token change on a central
component, so it is a decision, not a cleanup — hence the ticket below rather than an
edit here.

---

## Proposed follow-up tickets — NOT opened, for Sapir to approve

| # | Proposal | Tier | Note |
|---|---|---|---|
| 1 | `ProducerCard` no-image placeholder wordmark fails AA at 3.74:1 — raise to ≥4.5:1 | GREEN, single component | Touches a central component + a design token; the *value* is a design call. Related: MEH-1400 (which introduced this background). |

**That is the entire list.** Nine of ten rows produced nothing to file. I am not padding
it with the info-level items axe did not raise.

---

## Methodology, and one deviation stated plainly

**The card specifies "vs local `next start` + seed". This ran against deployed staging
instead.** The reason is not convenience: there is no backend or seeded database in the
CC sandbox, so a local server renders empty states and error boundaries. axe would have
faithfully audited a surface that does not exist in production and returned a
clean-looking result — precisely the failure Control A exists to catch. Staging is the
deployed surface the accessibility statement actually describes.

**Consequences of the deviation, so the reader can discount correctly:**

- Staging sits behind Vercel Deployment Protection; every request pays a `307→200`
  bypass handshake. This affects **latency only** — axe measures the settled DOM, so the
  contrast and ARIA results are unaffected.
- The sandbox Chromium needs `--ssl-version-max=tls1.2` against the Vercel edge
  (MEH-938/942, re-confirmed MEH-2118), and the repo pins a Playwright whose browser
  build is absent here, so the run uses `executablePath` per the environment's documented
  route. Neither changes what axe sees.
- **Chromium only.** No WebKit — the sandbox carries no WebKit build. Contrast and ARIA
  are engine-independent, but this is not a cross-engine result and is not claimed as one.

**One probe defect, recorded rather than dropped.** The first run reported
`slug=NONE` and skipped the producer-detail row entirely. The catalogue has **17**
producers; the endpoint returns a **bare JSON array** and the parser was reading
`j.items || j.producers || j.results`. A wrong key produced output identical to "no
data". Fixed, re-run, and the row is in the table above — but the first version would
have shipped a 4-route audit described as 5.

---

## Recommendation on the accessibility statement

The statement (`he.json`, "פועלות להתאים לת״י 5568 ברמת AA") is **better supported after
this run than before it**, and the honest wording of what was established is narrow:

> Across five core routes at two viewports, an automated WCAG 2.1 AA scan found one
> serious issue, in one component, on one route.

**What this does NOT establish, and must not be quoted as establishing:**

- **Automated scanning covers roughly a third of WCAG criteria.** axe cannot judge
  focus-order sanity, meaningful alt text, or whether a keyboard path is usable — only
  that the machine-checkable subset holds. MEH-2199 did the keyboard work by hand; that
  is complementary evidence, not the same evidence.
- **One engine, one locale (`/he`), five routes.** Admin surfaces, the dashboard, and
  `/en` were not scanned.
- **No screen-reader pass.** IS 5568 expects NVDA/JAWS/VoiceOver behaviour that no
  automated tool reproduces.

So: the statement can stand, and the single finding should be fixed before it is
*strengthened*. Claiming full AA conformance on this evidence would be the same
over-claim class the label-scope contract exists to prevent.
