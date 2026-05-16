# Wave 5 i18n Inventory — MEH-475 Discovery

**Date:** 2026-05-16
**Branch:** `feature/meh-475-discovery`
**Source scan:** `python3 .claude/scripts/i18n-scan.py --format json`
**Raw JSON snapshot:** `docs/wave-5-scan.json` (committed with this doc)
**Totals:** 2557 string findings across 139 files

> **Caveat (added per adversarial review):** 2557 = raw scanner hits
> including ±5% EOL-comment false positives and multi-line literals
> counted per occurrence. MEH-475 spec's "~700 strings" refers to
> distinct user-facing translation keys, not regex hits. Use these
> counts for relative bucketing, not absolute translation-effort sizing.

> **Snapshot regenerate rule:** This file reflects staging at parent SHA
> `ff8bde9` (commit before `0fd839d`). Re-run
> `python3 .claude/scripts/i18n-scan.py --format json` at PR-A/B/C
> branch creation; **do not edit `docs/wave-5-scan.json` in place** —
> regenerate it.

## Confirmed scanner path

`.claude/scripts/i18n-scan.py` — deterministic Python scanner (MEH-477).
Use exactly: `python3 .claude/scripts/i18n-scan.py --format json`.
Run from repo root.

Self-test: `python3 .claude/scripts/i18n-scan.py --self-test` (T1–T3 fixtures).
Regression-gate: `--diff <baseline.json>` (exit 1 on Δ > 0).

## Bucket totals

| Bucket | Files | Strings |
|---|---:|---:|
| Admin (`frontend/app/[locale]/admin/**` + admin components) | 22 | 640 |
| Long-tail (everything else not yet wired) | 106 | 1857 |
| Wired-remaining — sub-bucket (a) skip-okay non-UI | 3 | 6 |
| Wired-remaining — sub-bucket (b) needs owner decision | 8 | 54 |
| **Total** | **139** | **2557** |

Adversarial review (PR #711) re-derived the wired set after the initial
grep `--since=2026-04-25 --grep="MEH-47[1-4]"` missed Wave 1 (`f7ea62e`)
and Wave 2 PR-A (`8ce1c6c` + Q7 fixes `652afdd`, `8257116`, `6ec3126`).
7 files / 50 strings moved from Long-tail → Wired-remaining (b).

## Already-wired (Wave 1–4) — confirmation

Wired files derived from full `git log --grep="MEH-47[1-4]"` (no
`--since` clamp — initial discovery's `--since=2026-04-25` filter
silently dropped Wave 1 + Wave 2 PR-A commits and was caught in
adversarial review):

**Wave 1 (`f7ea62e`) + Wave 2 (`8ce1c6c`, `652afdd`, `8257116`, `6ec3126`):**

- `frontend/app/[locale]/home/HomeCategoryGrid.jsx` (0 residual)
- `frontend/app/[locale]/home/HomeHero.jsx` (0 residual)
- `frontend/app/[locale]/home/HomeProducersGrid.jsx` (0 residual)
- `frontend/app/[locale]/home/HomeStaticBlocks.jsx` (8 residual)
- `frontend/app/[locale]/page.js` (3 residual)
- `frontend/components/BottomNav.jsx` (0 residual)
- `frontend/components/DirectoryDisclaimer.jsx` (3 residual)
- `frontend/components/Footer.jsx` (1 residual)
- `frontend/components/Header.jsx` (0 residual)
- `frontend/components/HomeProductCard.jsx` (20 residual ⚠️ also has forbidden-phrase hit — see Forbidden-string section)
- `frontend/components/ShareButton.jsx` (5 residual)
- `frontend/components/StoryCardCanvas.jsx` (10 residual)

**Wave 3 (`c1165ab`):**

- `frontend/app/[locale]/map/MapClient.jsx` (0 residual)
- `frontend/app/[locale]/map/components/CityPickerModal.jsx` (4 residual)
- `frontend/app/[locale]/map/components/DesktopMiniPopup.jsx` (0 residual)
- `frontend/app/[locale]/map/components/FilterChipsBar.jsx` (0 residual)
- `frontend/app/[locale]/map/components/MapCardList.jsx` (0 residual)
- `frontend/app/[locale]/map/components/MapPane.jsx` (0 residual)
- `frontend/app/[locale]/map/components/MobileSheetSelectedCard.jsx` (0 residual)
- `frontend/app/[locale]/map/page.js` (4 residual)
- `frontend/app/[locale]/map/state/useMapSync.js` (1 residual)
- `frontend/app/[locale]/map/state/useProducersFeed.js` (1 residual)
- `frontend/app/[locale]/producer/[id]/ProducerDetail.jsx` (0 residual)
- `frontend/app/[locale]/producer/[id]/components/ActionRow.jsx` (0 residual)
- `frontend/app/[locale]/producer/[id]/components/ContactSidebar.jsx` (0 residual)
- `frontend/app/[locale]/producer/[id]/components/ProducerHeader.jsx` (0 residual)
- `frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx` (0 residual)
- `frontend/app/[locale]/producer/[id]/components/StickyContactBar.jsx` (0 residual)
- `frontend/components/ProducerCard.jsx` (0 residual)

**Wave 4 (`ff8bde9`):**

- `frontend/app/[locale]/login/page.js` (0 residual)
- `frontend/components/AppleAuthButton.jsx` (0 residual)
- `frontend/components/GoogleAuthButton.jsx` (0 residual)
- `frontend/components/ProducerOAuthButtons.jsx` (0 residual)

### Wired-remaining — sub-bucket (a) skip-okay non-UI (6 strings / 3 files)

Pure-data constants or developer-only strings. No translation key needed.

```
frontend/app/[locale]/map/components/CityPickerModal.jsx:23  "תל אביב"           (city data constant)
frontend/app/[locale]/map/components/CityPickerModal.jsx:24  "ירושלים"            (city data constant)
frontend/app/[locale]/map/components/CityPickerModal.jsx:25  "חיפה"              (city data constant)
frontend/app/[locale]/map/components/CityPickerModal.jsx:26  "באר שבע"           (city data constant)
frontend/app/[locale]/map/state/useMapSync.js:220            "[חפשי באזור זה] …"  (console.warn breadcrumb)
frontend/app/[locale]/map/state/useProducersFeed.js:31       "[חפשי באזור זה] …"  (console.warn breadcrumb)
```

Note (per adversarial review): the CityPickerModal city names are UI
dropdown labels — "translate vs transliterate proper nouns on `/en/`"
is a Smadar call. Defaulted to skip-okay here because they're driven
by a static array that future locale work can swap via the
category/city dataset. If Smadar wants them translated, move to (b).

### Wired-remaining — sub-bucket (b) needs owner decision (54 strings / 8 files)

Residuals on already-wired files OR user-facing SEO metadata. Each
needs a deliberate owner call before PR-A/B/C touches them — they
should NOT be re-wired by the long-tail PRs without a green light,
because either the existing translation keys cover them (false
positive) or the wiring deliberately omitted them (intent).

```
frontend/app/[locale]/map/page.js:9              metadata.title (SEO)
frontend/app/[locale]/map/page.js:11             metadata.description (SEO)
frontend/app/[locale]/map/page.js:13             openGraph.title (SEO)
frontend/app/[locale]/map/page.js:14             openGraph.description (SEO)
frontend/app/[locale]/page.js                    (3 residuals)
frontend/app/[locale]/home/HomeStaticBlocks.jsx  (8 residuals)
frontend/components/HomeProductCard.jsx          (20 residuals ⚠️ overlaps forbidden phrase)
frontend/components/StoryCardCanvas.jsx          (10 residuals)
frontend/components/ShareButton.jsx              (5 residuals)
frontend/components/DirectoryDisclaimer.jsx      (3 residuals)
frontend/components/Footer.jsx                   (1 residual)
```

`HomeProductCard.jsx` carries the `"מהמטבח של השכן"` forbidden phrase
even though Wave 1+2 wired the file — meaning the phrase landed in a
translation key as-is, or pre-dates the locked voice rule. Treat
separately: forbidden-phrase ruling first, then re-wire if needed.

## Admin bucket (PR-A scope) — 640 strings, 22 files

```
113  frontend/app/[locale]/admin/help/page.jsx
 70  frontend/app/[locale]/admin/outreach/page.jsx
 63  frontend/components/admin/ProducerForm.jsx
 42  frontend/app/[locale]/admin/settings/page.js
 41  frontend/app/[locale]/admin/page.js
 38  frontend/app/[locale]/admin/experiences/page.js
 36  frontend/app/[locale]/admin/kashrut/page.js
 36  frontend/app/[locale]/admin/producers/AdminProducersTable.jsx
 32  frontend/app/[locale]/admin/users/page.js
 22  frontend/app/[locale]/admin/category-requests/page.js
 22  frontend/app/[locale]/admin/content/page.js
 21  frontend/app/[locale]/admin/reviews/page.jsx
 20  frontend/app/[locale]/admin/reports/page.js
 17  frontend/app/[locale]/admin/layout.js
 15  frontend/app/[locale]/admin/analytics/page.js
 14  frontend/app/[locale]/admin/group-buys/page.js
 13  frontend/app/[locale]/admin/producers/AdminProducersToolbar.jsx
 12  frontend/app/[locale]/admin/producers/AdminProducersImportPreview.jsx
  4  frontend/app/[locale]/admin/producers/[id]/edit/page.js
  3  frontend/app/[locale]/admin/producers/new/page.js
  3  frontend/app/[locale]/admin/producers/page.js
  3  frontend/app/[locale]/admin/producers/use-admin-producers.js
```

## Long-tail bucket (PR-B/C scope) — 1857 strings, 106 files

(7 files / 50 strings previously listed here moved to Wired-remaining
sub-bucket (b) after adversarial review: `HomeProductCard.jsx` ×20,
`StoryCardCanvas.jsx` ×10, `HomeStaticBlocks.jsx` ×8, `ShareButton.jsx`
×5, `DirectoryDisclaimer.jsx` ×3, `app/[locale]/page.js` ×3,
`Footer.jsx` ×1.)

```
106  frontend/app/[locale]/producer/dashboard/page.js
105  frontend/app/[locale]/settings/page.jsx
 92  frontend/app/[locale]/about/for-businesses/guides/product-photography/page.js
 91  frontend/app/[locale]/about/for-businesses/guides/customer-messages/page.js
 89  frontend/components/HomeProductForm.jsx
 83  frontend/app/[locale]/about/for-businesses/guides/business-story/page.js
 78  frontend/app/[locale]/privacy/page.js
 67  frontend/app/[locale]/register/producer/page.js
 61  frontend/app/[locale]/terms/page.js
 57  frontend/app/[locale]/about/AboutClient.jsx
 47  frontend/app/[locale]/experiences/new/NewExperienceClient.jsx
 46  frontend/app/[locale]/events/EventsClient.jsx
 39  frontend/components/ProducersClient.jsx
 35  frontend/app/[locale]/accessibility/page.js
 34  frontend/app/[locale]/register/page.js
 33  frontend/app/[locale]/producer/dashboard/events/new/page.js
 31  frontend/app/[locale]/about/for-businesses/page.js
 31  frontend/app/[locale]/producer/dashboard/group-buys/page.js
 29  frontend/app/[locale]/group-buys/[id]/GroupBuyDetailClient.jsx
 28  frontend/components/ChatWidget.jsx
 26  frontend/app/[locale]/experiences/ExperiencesClient.jsx
 26  frontend/components/ReviewsSection.jsx
 25  frontend/app/[locale]/neighbor/NeighborClient.jsx
 24  frontend/app/[locale]/upgrade/page.js
 21  frontend/app/[locale]/reset-password/page.js
 20  frontend/app/[locale]/experiences/[id]/ExperienceDetailClient.jsx
 20  frontend/components/ProducerReviews.jsx
 19  frontend/app/[locale]/contact/page.js
 18  frontend/components/KashrutBadgeStrip.jsx
 18  frontend/components/RecipeForm.jsx
 17  frontend/app/[locale]/about/for-businesses/guides/page.js
 17  frontend/app/[locale]/group-buys/GroupBuysClient.jsx
 17  frontend/app/[locale]/search/page.jsx
 16  frontend/app/[locale]/producer/dashboard/recipes/page.js
 15  frontend/components/AlertPrefsPanel.jsx
 15  frontend/components/LocationModal.jsx
 14  frontend/components/OpeningHours.jsx
 14  frontend/components/public/RecipeDetail.jsx
 12  frontend/components/CalendarView.jsx
 12  frontend/components/CategoryRequestModal.jsx
 11  frontend/app/[locale]/events/[id]/page.js
 11  frontend/app/[locale]/messages/page.js
 11  frontend/app/[locale]/producer/dashboard/followers/page.js
 10  frontend/app/[locale]/favorites/page.js
 10  frontend/app/[locale]/verify-email/page.js
  9  frontend/app/[locale]/forgot-password/page.js
  9  frontend/app/[locale]/layout.js
  9  frontend/app/[locale]/rate/[token]/page.js
  9  frontend/components/HeroSearch.jsx
  9  frontend/components/ReportButton.jsx
  8  frontend/components/CategorySelector.jsx
  8  frontend/components/Pagination.jsx
  8  frontend/components/PasswordInput.jsx
  8  frontend/components/TrustBadge.jsx
  7  frontend/components/AvailabilityBadge.jsx
  7  frontend/components/InstallPrompt.jsx
  7  frontend/components/SmartSearch.jsx
  6  frontend/app/[locale]/error.js
  6  frontend/components/FavoriteButton.jsx
  6  frontend/components/HomepageMiniMap.jsx
  5  frontend/app/[locale]/events/page.js
  5  frontend/app/[locale]/producer/dashboard/recipes/[id]/edit/page.js
  5  frontend/components/CookieBanner.jsx
  5  frontend/components/ImageGallery.jsx
  5  frontend/components/Lightbox.jsx
  5  frontend/components/LoginPromptModal.jsx
  5  frontend/components/PasswordStrength.jsx
  4  frontend/app/[locale]/about/page.js
  4  frontend/app/[locale]/experiences/page.js
  4  frontend/app/[locale]/group-buys/page.js
  4  frontend/app/[locale]/not-found.js
  4  frontend/app/[locale]/producer/[id]/lib/producer-format.js
  4  frontend/app/[locale]/producer/[id]/not-found.js
  4  frontend/components/ExperienceCard.jsx
  4  frontend/components/GuideArticle.jsx
  4  frontend/components/HomepageMiniMapSkeleton.jsx
  4  frontend/components/MapComponent.jsx
  4  frontend/components/MapProducerCard.jsx
  4  frontend/components/RecipeStatusBadge.jsx
  4  frontend/components/WhatsAppQuestionChips.jsx
  3  frontend/app/[locale]/experiences/[id]/page.js
  3  frontend/app/[locale]/producers/page.jsx
  3  frontend/components/DeliveryBlock.jsx
  3  frontend/components/FollowButton.jsx
  3  frontend/components/FridayDeliveryStrip.jsx
  3  frontend/components/HolidayBanner.jsx
  3  frontend/components/LocationBanner.jsx
  3  frontend/components/MiniMap.jsx
  3  frontend/components/WhatsAppShareButton.jsx
  2  frontend/app/[locale]/[slug]/recipes/[recipe_id]/page.jsx
  2  frontend/app/[locale]/experiences/new/page.js
  2  frontend/components/ChipScrollRow.jsx
  2  frontend/components/CitiesAutocomplete.jsx
  2  frontend/components/CitySearch.jsx
  2  frontend/components/MapBottomSheet.jsx
  2  frontend/components/OnboardingTip.jsx
  2  frontend/components/WhatsAppButton.jsx
  2  frontend/components/public/RecipeCard.jsx
  1  frontend/components/AddressSearch.jsx
  1  frontend/components/BadgeRow.jsx
  1  frontend/components/Breadcrumb.jsx
  1  frontend/components/InfoTooltip.jsx
  1  frontend/components/ParallaxQuote.jsx
  1  frontend/components/Skeleton.jsx
  1  frontend/components/StarRating.jsx
  1  frontend/components/StarSelector.jsx
```

## Forbidden-string scan

Three locked-out phrases per branding decisions (CLAUDE.md voice — no
"שכנות" / "אוכל ביתי" framing; always "בית עסק / בעלת עסק").

| Phrase | Hits |
|---|---:|
| `שכנות מבשלות מהבית` | 0 |
| `אוכל ביתי` | 1 |
| `מהמטבח של השכן` | 7 |

### Locations (8 total)

```
frontend/app/[locale]/neighbor/NeighborClient.jsx:90   "אוכל ביתי"
frontend/app/[locale]/neighbor/NeighborClient.jsx:121  "מהמטבח של השכן"
frontend/app/[locale]/neighbor/NeighborClient.jsx:132  "מהמטבח של השכן"
frontend/app/[locale]/neighbor/NeighborClient.jsx:197  "מהמטבח של השכן"
frontend/app/[locale]/producer/dashboard/page.js:498   "מהמטבח של השכן"
frontend/components/ChatWidget.jsx:47                  "מהמטבח של השכן"
frontend/components/ChatWidget.jsx:75                  "מהמטבח של השכן"
frontend/components/HomeProductCard.jsx:55             "מהמטבח של השכן"
```

**Required action before Wave 5 wiring:** raise these with Smadar for
copy decision. Do NOT translate-in-place — they must be rewritten to
the locked voice (e.g. `home_product.title`, `home_product.cta`) before
they land in `frontend/messages/he.json`.

Sibling-grep coverage: all 4 files appear in the long-tail bucket, so
each will be picked up by PR-B or PR-C regardless of phrase ruling.

## PR-A/B/C suggested split

Not binding — Smadar to confirm scope per Rule 4 (numbered-plan-first)
before any wiring begins.

- **PR-A — admin**: 640 strings / 22 files. Internal surface, low
  customer-impact, fewer copy-tone landmines. Good warm-up.
- **PR-B — high-density consumer + producer dashboard**: top ~15
  files of long-tail (≥40 strings each), ~1000 strings combined. Pause
  before `neighbor/NeighborClient.jsx` and `ChatWidget.jsx` until the
  forbidden-phrase ruling lands.
- **PR-C — tail**: remaining ~100 files, ~900 strings combined.
  Mostly small touch-ups (≤20 strings each), but heavy file count → CI
  pressure. Consider splitting again if PR-B runs hot.

Each PR: numbered plan + `go` before code (per Rule 4 + Rule 5),
`/adversarial-review` after CI green (per Rule 20), Vercel preview URL
in PR body (per Rule 9), `/adversarial-review` REFEREE clean before
merge to staging.

## Files committed by this discovery

- `docs/wave-5-inventory.md` — this file
- `docs/wave-5-scan.json` — raw scanner output (2557 entries, sorted)
