# Wave 5 — PR-C4b inventory

> Pre-implementation inventory for MEH-475 PR-C4b (~600 user-facing
> strings remaining across server pages, legal, recipe, and the i18n
> sweep tail). Numbers from
> `python .claude/scripts/i18n-scan.py` (MEH-477 deterministic scanner)
> run on staging at `d08fdf8` (post-MEH-630 merge).
>
> **No code in this document.** Inventory → plan → execute in
> subsequent PRs.

## Status (last updated 2026-05-20)

- **Chunk 1 — Recipe server-page metadata** — ✅ **MERGED** in PR #736 at
  `a35a4da`. First production use of `getTranslations` + `generateMetadata`
  + `t()` interpolation. `<RecipeJsonLd>` untouched (data-sourced).
- **Chunk 2 — Accessibility (35 strings → 26 keys)** — ✅ **MERGED** in
  PR #738 at `58c5472`. New `accessibility.*` top-level namespace +
  first production use of `t.rich()` for JSX-fragmented bodies.
- **Chunk 3 — Privacy + Terms (147 strings → 102 keys)** — ✅ **MERGED**
  in PR #740 at `280cdb5`. New `privacy.*` + `terms.*` top-level
  namespaces. MEH-630 operator section preserved verbatim (double-geresh ״ +
  single-geresh ׳ + en-dash – byte-identical).
- **Chunk 4 — For-businesses FAQ + FAQPage JSON-LD (31 strings → 29 keys)** —
  ✅ **MERGED** in PR #741 at `807ff2e`. New `about_business.*`
  top-level namespace. **First production pattern for JSON-LD consuming
  translation keys**: `buildFaqJsonLd(t)` builds the schema from the
  same translation keys the visible `<details>` rendering uses;
  `**bold**` markdown preserved in source, stripped before schema
  emission.
- **Chunk 5 — Guides (3 files + index, ~300 strings)** — 🔜 **DEFERRED**
  to a fresh session. Pattern well understood (BLOCKS-array → per-position
  translation keys), but volume + EN prose-translation quality bar
  exceeds single-session runtime budget. Files: `guides/page.js` (17),
  `business-story/page.js` (~83), `product-photography/page.js` (~92),
  `customer-messages/page.js` (~91).

Cumulative ICU key parity after chunks 1-4: **1922 / 1922** (HE / EN).

---

## 1. Per-file complexity catalog

Files ordered lowest → highest risk (scanner string count + pattern novelty +
SEO impact + legal sensitivity).

| # | File | LOC | Strings | Type | Hooks | New patterns introduced | SEO risk | Brand-LOCK |
|---|------|-----|---------|------|-------|-------------------------|----------|------------|
| 1 | `frontend/app/[locale]/[slug]/recipes/[recipe_id]/page.jsx` | 98 | **2** | server | none → `getTranslations` | `getTranslations` + `generateMetadata` first production use | low — dynamic page, not in sitemap.js, API-dependent; JSON-LD via `<RecipeJsonLd>` component (no translatable strings inside) | 2 UI-text "מהמקור" hits in metadata template (L50, L55) |
| 2 | `frontend/app/[locale]/accessibility/page.js` | 139 | **35** | server | none → `useTranslations` | none new — same SECTIONS-array shape as MEH-630 | low — not in sitemap.js, no JSON-LD; legal-compliance page (IS 5568) | 2 UI-text "מהמקור" hits (L13 SECTIONS body, L75 contact) + 1 metadata "מהמקור" (L2) |
| 3 | `frontend/app/[locale]/privacy/page.js` (post-MEH-630) | 274 | **82** | server | none → `useTranslations` | none new — SECTIONS array | **legal sensitivity**; not in sitemap.js, no JSON-LD; PR-C4b would add `generateMetadata` for SERP title translation | 4 UI-text "מהמקור" hits + 2 metadata; MEH-630 operator section ships verbatim ("שנף טופז 325120939") and must NOT be paraphrased through translation |
| 4 | `frontend/app/[locale]/terms/page.js` (post-MEH-630) | 229 | **65** | server | none → `useTranslations` | none new — SECTIONS array | **legal sensitivity**; not in sitemap.js, no JSON-LD; same `generateMetadata` consideration as privacy | 3 UI-text "מהמקור" + "Mehamakor" hits + 2 metadata; same MEH-630 verbatim constraint |
| 5 | `frontend/app/[locale]/about/for-businesses/page.js` | 227 | **31** | server | none → `useTranslations` | **JSON-LD with translated strings** (`buildFaqJsonLd()` strips `**` markers off `item.a` — translation needs to preserve `**bold**` source); `renderInline()` markdown-in-data; multi-paragraph `\n\n` `renderAnswer()` | **highest active SEO risk** — only file in PR-C4b that emits JSON-LD (`FAQPage`), shipped 2026-05-14; breaking schema mid-translation forfeits Rich Results | 4 UI-text "מהמקור" + 2 metadata + 1 `@meha_makor` handle |
| 6 | `frontend/app/[locale]/about/for-businesses/guides/page.js` | 166 | **17** | server | none → `useTranslations` | none new — GUIDES array + static metadata + `BRAND_NAME` constant (already extracted) | low — not in sitemap.js, no JSON-LD | 3 UI-text "מהמקור" + 2 metadata via `BRAND_NAME` |
| 7 | `frontend/app/[locale]/about/for-businesses/guides/product-photography/page.js` | 271 | **92** | server | none → `useTranslations` | **BLOCKS array** (mixed `p`, `h3`, `ol`, `ul`, `hr` block types) + `**bold**` markdown inside data + `GuideArticle` wrapper renders the array | low — not in sitemap.js, no JSON-LD; SEO orphan despite article-grade content | 3 UI-text "מהמקור" hits in BLOCKS + metadata via `BRAND_NAME` |
| 8 | `frontend/app/[locale]/about/for-businesses/guides/customer-messages/page.js` | 271 | **91** | server | none → `useTranslations` | **`blockquote` block type** (5 copy-paste templates as quoted text — formatting is part of the message) | low — not in sitemap.js, no JSON-LD | metadata via `BRAND_NAME` only (clean body — guide does not name the platform inside its templates) |
| 9 | `frontend/app/[locale]/about/for-businesses/guides/business-story/page.js` | 201 | **83** | server | none → `useTranslations` | **`callout` block type** (before/after storytelling) | low — not in sitemap.js, no JSON-LD | 2 UI-text "מהמקור" hits in BLOCKS + metadata via `BRAND_NAME` |

**Subtotal:** 498 strings in 9 files.

### Sweep tail

`python .claude/scripts/i18n-scan.py` on the full frontend tree reports
**1,040 residual hardcoded strings across 42 files**. Subtracting the
498 in the 9 above leaves **~542 strings in 33 other files** that
PR-C4b's sweep step needs to address (or defer).

Top 10 files in the sweep tail (outside the 9 above):

| Rank | File | Strings |
|------|------|---------|
| 1 | `frontend/app/[locale]/producer/dashboard/page.js` | 106 |
| 2 | `frontend/app/[locale]/settings/page.jsx` | 105 |
| 3 | `frontend/components/HomeProductForm.jsx` | 89 |
| 4 | `frontend/app/[locale]/producer/dashboard/events/new/page.js` | 33 |
| 5 | `frontend/components/ChatWidget.jsx` | 28 |
| 6 | `frontend/app/[locale]/neighbor/NeighborClient.jsx` | 25 |
| 7 | `frontend/components/HomeProductCard.jsx` | 20 |
| 8 | `frontend/components/AlertPrefsPanel.jsx` | 15 |
| 9 | `frontend/app/[locale]/events/EventsClient.jsx` | 13 |
| 10 | `frontend/app/[locale]/messages/page.js` | 11 |

The top 3 sweep-tail files (200+ strings on `producer/dashboard` +
`settings` alone) likely deserve their own chunk and should NOT be
folded into a sweep PR — they're per-feature surfaces, not residual.
See chunk-split proposal below.

---

## 2. Architectural pattern catalog

Five patterns PR-C4b introduces or expands. For each: lowest-risk
introduction site + the adversarial-review check that must pass before
adoption.

### 2.1 `getTranslations` from `"next-intl/server"`

- **Prior art:** 1 site only — `frontend/app/[locale]/map/page.js:2,47`
  (PR-C2, sr-only nav text on the SSR map page). No other production
  surface uses it.
- **Lowest-risk introduction site:** **File #1 — recipe detail page** (2
  strings, isolated to metadata, no body strings).
- **Adversarial review checks:**
  - Build green on a server component using `await getTranslations()`
    with the new namespace.
  - SSR render of the page returns translated `<title>` in the HTML
    response (verify via `curl -A "Googlebot" $PREVIEW_URL/he/<slug>/recipes/<id>`
    and look for the localized title in the response body).
  - Confirm no `"use client"` directive accidentally added.
  - Confirm next-intl version `^4.11.0` exposes `getTranslations`
    (verified — it does).

### 2.2 `generateMetadata` with `t()`

- **Prior art:** 4 `generateMetadata` exports exist
  (`[slug]/page.js:30`, `producers/page.jsx:35`,
  `producer/[id]/page.js:15`, `[slug]/recipes/[recipe_id]/page.jsx:43`).
  **None use `getTranslations()` today** — all hardcode Hebrew or build
  titles from API data.
- **Lowest-risk introduction site:** **File #1 — recipe detail page**.
  Same call site already calls `getProducerAndRecipe()` and constructs
  a title template; wiring `getTranslations()` in alongside is one
  additional `await` and a key lookup.
- **Adversarial review checks:**
  - SERP appearance: `view-source:` the page on the Vercel preview and
    confirm `<title>` is set from the translation, not hardcoded.
  - Open Graph: `og:title` follows the same key (or shares the
    template).
  - 404 path: when `producer || !recipe` is falsy, the early-return
    branch (`return { title: t("recipe.detail.notFound") }`) still
    returns valid metadata.

### 2.3 JSON-LD with translated strings (`buildFaqJsonLd`)

- **Prior art:** 3 JSON-LD helpers exist —
  `buildJsonLd(producer)` (`lib/seo.js:94-206`) for `FoodEstablishment`,
  `buildFaqJsonLd()` inlined in `for-businesses/page.js:82-95` for
  `FAQPage`, and `buildRecipeSchema()` in
  `components/public/RecipeJsonLd.jsx:38-62` for `Recipe`. **All three
  use either hardcoded Hebrew or API-sourced dynamic data — zero
  current callers pass translated strings.**
- **Lowest-risk introduction site:** `for-businesses/page.js` — but
  only AFTER body strings are extracted to `useTranslations()` and
  the FAQ Q&A pairs live in `messages/he.json`. The JSON-LD then
  re-derives schema fields from the same translation keys (no separate
  copy).
- **Critical pitfall:** `buildFaqJsonLd()` currently calls
  `item.a.replace(/\*\*/g, "")` to strip bold markers from the answer
  before emitting schema. After i18n, translation values must preserve
  `**bold**` markers as plaintext (or schema generation must move
  upstream of the markdown strip). Recommend a unit test that
  round-trips a sample translated answer through `buildFaqJsonLd` and
  asserts no `**` leaks into the schema `text` field.
- **Adversarial review checks:**
  - `curl $PREVIEW_URL/he/about/for-businesses | grep -A 1 'application/ld+json'`
    — schema JSON must be syntactically valid (`jq .` parses).
  - Google Rich Results Test on the preview URL must show FAQPage
    items with the translated answers.
  - SERP impact: PR-C4a guides + the deployed FAQ page have been live
    since 2026-05-14; Search Console schema-error count must remain at
    0 post-deploy. Watch for 7 days before declaring the migration
    done.

### 2.4 `renderInline()` markdown-in-data with `**bold**`

- **Prior art:** Defined inline in `for-businesses/page.js:98-106`.
  Handles `**bold**` only. Used by `renderAnswer()` for FAQ paragraphs.
- **Lowest-risk introduction site:** No introduction needed —
  `renderInline` already works on any string, translated or not. The
  risk is in the **translation values**: if `messages/he.json` /
  `messages/en.json` keys lose their `**` markers in translation
  review, the bold formatting silently disappears.
- **Adversarial review checks:**
  - Snapshot test of the FAQ page rendering — pick one answer with
    `**bold**` text, assert the rendered HTML contains a `<strong>`
    tag with the bold word.
  - Translation-key linter (new tooling?) — flag any key whose HE
    value contains `**` but whose EN value doesn't (or vice versa).
    Out of scope for PR-C4b; tracking as a follow-up.

### 2.5 Multi-paragraph `\n\n` split in `renderAnswer()`

- **Prior art:** `for-businesses/page.js:108-114`. Splits answer text
  on `\n\n` and wraps each paragraph in `<p>`.
- **Lowest-risk introduction site:** Same as 2.4 — the helper works on
  any string. Risk is in translation: if HE keeps `\n\n` and EN
  collapses to `\n`, the EN renders as one paragraph.
- **Adversarial review check:** Round-trip a translated multi-paragraph
  answer through `renderAnswer` and assert the paragraph count matches
  HE.

---

## 3. SEO risk assessment per file

Cross-checked against `frontend/public/robots.txt` and
`frontend/app/sitemap.js`.

| File | robots-status | In sitemap.js | JSON-LD | Schema type | Active in Search Console? |
|------|---------------|---------------|---------|-------------|---------------------------|
| recipes/[recipe_id]/page.jsx | Allow | Dynamic — via API try/catch at sitemap.js:53-65 | Yes (component `<RecipeJsonLd>`) | `Recipe` (`inLanguage: "he-IL"` hardcoded) | likely — dynamic indexing depends on backend `/api/sitemap-recipes` health |
| accessibility/page.js | Allow | Not listed | No | — | low — no schema |
| privacy/page.js | Allow | Not listed | No | — | low — no schema; SERP title only |
| terms/page.js | Allow | Listed (sitemap.js:9-18 hardcoded `/terms`) | No | — | yes — Google sees it |
| about/for-businesses/page.js | Allow | Not listed | **Yes** | `FAQPage` (`@id: ${SITE_URL}/about/for-businesses#faq`) | **yes — shipped 2026-05-14, fresh Rich Results submission** |
| about/for-businesses/guides/page.js | Allow | Not listed | No | — | low — no schema |
| about/for-businesses/guides/product-photography/page.js | Allow | Not listed | No | — | low — article-grade content but no `Article` JSON-LD (eligible follow-up) |
| about/for-businesses/guides/customer-messages/page.js | Allow | Not listed | No | — | low |
| about/for-businesses/guides/business-story/page.js | Allow | Not listed | No | — | low |

### Recipe page — dynamic indexing

`sitemap.js:53-65` fetches `/api/sitemap-recipes` and returns an empty
list on failure. **If the backend returns an empty list at build time,
zero recipe URLs ship in the sitemap for that deploy.** The page
itself still resolves (server-rendered on demand), but Google won't
discover new recipes. PR-C4b must not change this behavior — extracting
2 strings to `t()` is purely a metadata layer change.

### FAQPage SERP impact

`for-businesses/page.js` is the only file in PR-C4b that emits Rich
Results-eligible JSON-LD. Translating its Q&A through `t()` while
preserving the `**bold**` markdown markers requires:

1. Body strings extracted to keys
2. `buildFaqJsonLd()` re-derives schema from the same keys (NOT from a
   separate hardcoded copy)
3. Markdown-strip happens AFTER translation resolution

Any sequencing error here (e.g., schema fed by stale hardcoded copy
after the body has been translated) causes schema/body drift — Google
will see one answer in JSON-LD and another in the visible HTML, which
can fail validation.

### Legal-page SERP implications (privacy + terms)

Privacy/terms `<title>` strings ("מדיניות פרטיות | מהמקור" / "תנאי
שימוש | מהמקור") are what Google shows for these URLs today. Adding
`generateMetadata` with `getTranslations` to translate the title:

- Improves EN-locale SERP appearance once `/en/privacy` and `/en/terms`
  are unblocked from robots.txt.
- Risks SERP-title flap during the rollout if the HE key value drifts
  from the current hardcoded string. Mitigation: keep the HE value
  byte-identical to the current string in the first PR; refine wording
  in a follow-up only after Search Console confirms no ranking shift.

---

## 4. Proposed PR-C4b chunk split

**5 chunks** in this order. Lowest-risk first; new patterns introduced
in the smallest possible file. Each chunk = one PR off staging tip,
WAIT-gate after every push.

### Chunk 1 — Recipe server-page (2 strings, ~30 LOC)

- **File:** `[slug]/recipes/[recipe_id]/page.jsx`
- **Pattern introduced:** `getTranslations` from `"next-intl/server"` +
  `generateMetadata` + `t()` for the first time in a production
  metadata export.
- **New namespace:** `recipe.detail.*` (sub of existing `recipes.*`,
  scoped to this single page surface).
- **Risk:** lowest possible — 2 strings, no body changes, no JSON-LD
  strings.
- **STOP-trigger flag for the user:** the file renders `<RecipeJsonLd>`
  (L86). The literal Phase 0 STOP check ("file contains JSON-LD")
  triggers, even though the JSON-LD component has no hardcoded
  translatable strings. See PART 2 of this session's note for the
  decision request.

### Chunk 2 — Accessibility legal page (35 strings)

- **File:** `accessibility/page.js`
- **Pattern introduced:** `useTranslations` in a SECTIONS-array
  pattern (same shape as MEH-630, but body now keyed).
- **New namespace:** `legal.accessibility.*`.
- **Risk:** low — no JSON-LD, no markdown-in-data, IS 5568 compliance
  copy that's been live since pre-MEH-475.
- **Why before privacy/terms:** smaller string count (35 vs 65/82),
  same architectural pattern, lower legal-review burden — a clean dry
  run for the legal-page i18n template.

### Chunk 3 — Privacy + terms (147 strings combined)

- **Files:** `privacy/page.js` + `terms/page.js`
- **Pattern introduced:** `generateMetadata` with `t()` for legal
  pages (a second use site after Chunk 1, now with body-string
  extraction layered on).
- **New namespaces:** `legal.privacy.*` + `legal.terms.*`.
- **Risk:** **MEDIUM** — legal sensitivity. Specific guardrails:
  - HE values MUST be byte-identical to the current strings for a
    first pass — no rewording, no smoothing.
  - The MEH-630 operator section ("שנף טופז 325120939") ships
    verbatim — translation review must not paraphrase legal IDs.
  - One PR, NOT two — these two pages share the operator section and
    cross-link, so splitting risks a half-translated state where one
    page references a section heading that has been re-keyed in the
    other.
- **Why combined with terms:** identical SECTIONS shape, near-identical
  operator section (PR #728), and they're cross-linked. Translating
  one but not the other ships an inconsistent legal surface.

### Chunk 4 — For-businesses FAQ + JSON-LD (31 strings)

- **File:** `about/for-businesses/page.js`
- **Pattern introduced:** JSON-LD with translated strings — the
  highest-novelty pattern in PR-C4b. Requires sequencing:
  body keys first, then `buildFaqJsonLd()` re-pointed to the same
  keys, then `**bold**` strip happens after translation resolution.
- **New namespace:** `marketing.for_businesses.*`.
- **Risk:** **HIGH** — active Search Console FAQPage submission since
  2026-05-14. Schema break = lost Rich Results until Google re-crawls
  (typically days, sometimes weeks).
- **Gating:** Chunks 1–3 must merge first to prove the
  `getTranslations`/`useTranslations` + `generateMetadata` patterns
  are stable in production before adding the JSON-LD layer.

### Chunk 5 — Guides (3 files, 283 strings combined) + sweep tail

- **Files:** `guides/page.js` + `business-story/` + `customer-messages/`
  + `product-photography/`
- **Pattern introduced:** `BLOCKS` array shape with mixed block types
  (`p`, `h3`, `ol`, `ul`, `hr`, `blockquote`, `callout`) — the largest
  single per-file body extraction in PR-C4b.
- **New namespaces:** `marketing.guides.*` + per-guide sub-namespaces.
- **Risk:** medium — high string count + `**bold**` preservation
  burden across 3 guides, but no JSON-LD and no legal sensitivity.
- **Sweep tail policy:** sweep ONLY files with ≤ 30 strings in the
  Top-10 tail (i.e. ranks 4-10: ~125 strings combined). Files at
  ranks 1-3 (`producer/dashboard` 106, `settings/page.jsx` 105,
  `HomeProductForm.jsx` 89) are per-feature surfaces and get their
  own future ticket — folding them into a sweep PR is the same
  anti-pattern that made PR-C4a chunks 3 and 4 oversized.

### Why not a single mega-PR or full per-file split

- **Single mega-PR (498 strings):** too big to review, too many novel
  patterns introduced at once, schema-break recovery would block
  unrelated work.
- **Full per-file split (9 PRs):** PRs #2-#9 inherit Chunk 1's
  `getTranslations` proof, but the legal-page sub-PR (privacy + terms
  combined) is intentionally a single PR to avoid the cross-link
  inconsistency described in Chunk 3.

---

## 5. STOP criteria specific to PR-C4b

### 5.1 Defer legal pages beyond C4b to a separate wave

Trigger if any of:

- Smadar requests a wording rewrite to privacy/terms during translation
  review — that's a legal-copy change, not an i18n change, and belongs
  in its own ticket.
- The MEH-630 operator section's verbatim constraint conflicts with
  the EN authoring (e.g., EN translation review wants to omit the
  עוסק פטור number from English copy) — defer legal-page EN authoring
  to a separate wave, ship only HE keys in this PR.
- Search Console flags any schema or indexing error on `/terms` or
  `/privacy` between Chunks 1-3 and Chunk 3 — stop, investigate, do
  not bundle the i18n migration with a SERP regression debug session.

### 5.2 Abort JSON-LD wiring mid-chunk (Chunk 4)

Trigger if any of:

- `buildFaqJsonLd()` output drifts from rendered body (manual diff:
  every `mainEntity[].acceptedAnswer.text` must match the
  visible-after-strip text from the same Q&A pair). Drift = stop +
  fix sequencing before push.
- Google Rich Results Test fails on the Vercel preview after Chunk 4
  push — revert before merge, regardless of CI status.
- Search Console reports a schema error on the staging deploy within
  24h of merge — back out Chunk 4, return body to hardcoded HE,
  re-plan.

### 5.3 Break guides (Chunk 5) into single-file PRs

Trigger if:

- Any one guide's translation exceeds 100 keys (currently 92, 91, 83
  — close to the threshold). The 100-key per-guide ceiling is a
  reviewability proxy.
- `**bold**` preservation fails on snapshot test for ANY guide — split
  that guide into its own PR for focused review, keep the other
  guides in the bundled PR.
- A guide's BLOCKS array introduces a new block type not yet seen in
  Chunks 1-4 (e.g., custom `<aside>` block). That guide gets its own
  PR for the pattern review.

---

## 6. Brand-LOCK grep across all 9 files

Probe results (from `Explore` agent, sources cited inline).

### UI-text hits (must move to translation keys)

| File | Line | Context | Verdict |
|------|------|---------|---------|
| accessibility/page.js | 13 | `&quot;מהמקור&quot; מחויבת לאפשר גלישה` (commitment SECTION) | move to `legal.accessibility.commitment.body` |
| accessibility/page.js | 75 | `צוות מהמקור` (contact SECTION) | move to `legal.accessibility.contact.body` |
| privacy/page.js | 18 | `השם המסחרי: מהמקור / Mehamakor.` (MEH-630 operator section, SECTIONS[0]) | move verbatim to `legal.privacy.operator.tradeName` |
| privacy/page.js | 38 | `&quot;מהמקור&quot; ... היא פלטפורמת דירקטורי` (who SECTION) | move to `legal.privacy.who.body` |
| privacy/page.js | 71 | `סקציית &quot;מהמטבח של השכן&quot;` (data SECTION) | move to `legal.privacy.data.body` (note: "מהמטבח של השכן" is a feature name, not brand — preserve) |
| privacy/page.js | 131 | `אנו **לא מוכרות** את המידע שלך` (third-parties SECTION) | move to `legal.privacy.third_parties.body` (preserve `**bold**`) |
| terms/page.js | 18 | `השם המסחרי: מהמקור / Mehamakor.` (MEH-630 operator section) | move verbatim to `legal.terms.operator.tradeName` |
| terms/page.js | 38 | `&quot;מהמקור&quot; ... היא פלטפורמת **דירקטורי בלבד**` (service SECTION) | move to `legal.terms.service.body` (preserve `**bold**`) |
| terms/page.js | 60 | `מהמקור **אינה בודקת, מאמתת** רישיונות` (licensing SECTION) | move to `legal.terms.licensing.body` |
| about/for-businesses/page.js | 33 | "מהמקור" in `CATEGORIES[].a` answer | move to FAQ Q&A key, preserve `**bold**` |
| about/for-businesses/page.js | 55 | "אני ספיר... בניתי את מהמקור" | move to FAQ Q&A key |
| about/for-businesses/page.js | 70 | "מהמקור עובד גם כשאת לא חושבת..." | move to FAQ Q&A key |
| about/for-businesses/page.js | 209 | `@meha_makor` (footer link text) | move to footer key |
| guides/page.js | 96 | "...בעלת עסק חדשה במהמקור" (intro `p` tag) | move to `marketing.guides.intro` |
| product-photography/page.js | 40 | "בעמוד הפרופיל שלכם במהמקור" (BLOCKS[0].text) | move to BLOCKS key, preserve `**bold**` |
| product-photography/page.js | 174 | `מהמקור הוא לא "אסתטיקה של אינסטגרם"` (BLOCKS[].text) | move to BLOCKS key |
| product-photography/page.js | 215 | "הסגנון של מהמקור: **כמו תמונה...**" | move to BLOCKS key, preserve `**bold**` |
| business-story/page.js | 39 | "לקוח/ה חדש/ה שמגיע/ה לעמוד שלכם דרך מהמקור" | move to BLOCKS key |
| business-story/page.js | 43 | "באתרי אוכל אחרים... במהמקור זה אחרת..." | move to BLOCKS key |

### Metadata hits (must be translated via `generateMetadata` + `t()`)

| File | Line | Field | Verdict |
|------|------|-------|---------|
| recipes/[recipe_id]/page.jsx | 50 | `metadata.title` 404 fallback | move to `recipe.detail.notFound` |
| recipes/[recipe_id]/page.jsx | 55 | `metadata.title` success template | move to `recipe.detail.titleTemplate` (ICU interpolation: `{recipeTitle}`, `{producerName}`) |
| accessibility/page.js | 2 | `metadata.title` | move to `legal.accessibility.metaTitle` |
| privacy/page.js | 2 | `metadata.title` | move to `legal.privacy.metaTitle` |
| privacy/page.js | 4 | `metadata.description` | move to `legal.privacy.metaDescription` |
| terms/page.js | 2 | `metadata.title` | move to `legal.terms.metaTitle` |
| terms/page.js | 4 | `metadata.description` | move to `legal.terms.metaDescription` |
| about/for-businesses/page.js | 5, 9 | `metadata.title` + `openGraph.title` | move to `marketing.for_businesses.metaTitle` |
| guides/page.js | 16, 18, 22 | `metadata.title` + `metadata.description` + `openGraph.description` | move to `marketing.guides.metaTitle` + `marketing.guides.metaDescription` |
| product-photography/page.js | 22-24 | same | per-guide `marketing.guides.product_photography.meta*` |
| customer-messages/page.js | 22-24 | same | per-guide `marketing.guides.customer_messages.meta*` |
| business-story/page.js | 22-24 | same | per-guide `marketing.guides.business_story.meta*` |

### Constant-extracted hits (no action needed)

Guide pages already use a `BRAND_NAME` constant for metadata title
construction. PR-C4b should keep this convention (constant remains;
the metadata template moves to a translation key that interpolates
`{brandName}` ICU-style) so the brand string remains a single source
of truth.

### JSDoc / comment-only hits

None blocking — the JSDoc header on `recipes/[recipe_id]/page.jsx`
(lines 1-14) names internal modules but contains no brand-locked
strings.

---

## Open question for PART 2 (Chunk 1)

Phase 0 STOP-trigger #6 says "Confirm no JSON-LD or markdown in this
file (if any found → STOP, this isn't the safest first chunk)".

`[slug]/recipes/[recipe_id]/page.jsx` renders `<RecipeJsonLd>` (L86) —
JSON-LD is present in the file's render tree. **However**, the
component itself sources every schema field from API data
(`recipe.title`, `recipe.ingredients`, etc.) with zero hardcoded
translatable strings. The 2 strings being extracted are in
`generateMetadata` only and never enter the JSON-LD path.

**Two interpretations:**

1. **Literal:** file contains JSON-LD → STOP, pick a different first
   file. The only sub-5-string candidates in the sweep would need to
   be re-derived (no other obvious 2-3-string server pages exist
   without metadata work).
2. **Spirit:** STOP trigger exists to prevent wading into JSON-LD
   translation work; here the JSON-LD has no translation surface, so
   the 2-string metadata extraction is unimpacted.

Recommend option 2 — but defer to Smadar's call before pushing Chunk 1.

---

_Inventory complete. Subsequent PRs to execute one chunk at a time
per Section 4 above._
