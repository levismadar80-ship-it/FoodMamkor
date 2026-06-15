# i18n Hardcoded-String Audit — 2026-06-13

**Scope:** `frontend/components/**` + `frontend/app/**` (`.js/.jsx/.ts/.tsx`).
**Goal:** find Hebrew strings rendered to the user that do **not** flow through
the next-intl layer (`useTranslations` / `getTranslations` / `t()` / `messages/*.json`).
**Type:** REPORT ONLY — no extraction, no edits.

**Detection:** Hebrew literals (U+0590–U+05FF) that are NOT the key argument of a
`t(...)` call and NOT inside `messages/he.json` / `en.json`.

## Headline

- **42 user-facing hardcoded strings across 10 files.**
- **Top offender: `components/ChatWidget.jsx` — 21 strings, zero `useTranslations`.**
  It's mounted in `app/[locale]/layout.js`, so it renders on **every page** and is
  completely inaccessible to the `/en` locale.
- **Second structural risk: `app/[locale]/layout.js` `BASE_METADATA`** — 7 Hebrew
  strings built at module level (before `generateMetadata` runs) that spread into
  every page's `<head>` as the SEO fallback.

### What was correctly SKIPPED (not flagged)
- Hebrew in code comments / JSDoc / `console.*` (not user-facing) — inventoried separately below.
- **Wire-format API values** that are intentionally Hebrew (backend enums): e.g.
  `ProducersClient.jsx` search `q` values, `admin/ProducerForm.jsx` `KOSHER_OPTIONS`
  `<option value>` (labels resolve via `KOSHER_LABEL_KEYS` + `t()`), events category keys,
  `RegisterProducerClient.jsx` `FARMER_DECLARATION_CATEGORIES` (matched against backend seed names).
- Hebrew that IS the argument to `t(...)` (the value living in he.json).
- `app/[locale]/dev/components/page.jsx` — `notFound()`-gated in production (storybook fixtures).

---

## Full findings (by file)

### 1. `components/ChatWidget.jsx` — 21 (TOP OFFENDER, global mount, no `useTranslations`)
| line | string | suggested key |
|---|---|---|
| 26 | `היי 🌿 אני כאן לעזור! …` (opening message) | `chat_widget.opening_message` |
| 41 | `איך נרשמים כבעלת עסק?` | `chat_widget.prompt_register` |
| 42 | `איך מוצאים עסקים קרובים אליי?` | `chat_widget.prompt_nearby` |
| 43 | `מה זה מהמקור?` | `chat_widget.prompt_what_is` |
| 44 | `האם האתר בחינם?` | `chat_widget.prompt_free` |
| 45 | `איך יוצרים קשר עם בית עסק?` | `chat_widget.prompt_contact` |
| 46 | `כמה זמן לוקח האישור של העסק?` | `chat_widget.prompt_approval_time` |
| 69 | `נרשמות דרך טופס פשוט בן 3 שלבים …` (answer) | `chat_widget.answer_register` |
| 71 | `יש שתי דרכים קלות: …` (answer) | `chat_widget.answer_nearby` |
| 160 | `לא הצלחתי להבין את השאלה …` | `chat_widget.fallback_reply` |
| 164 | `שלחת הרבה הודעות בזמן קצר …` (429) | `chat_widget.error_rate_limit` |
| 166 | `משהו השתבש 🌱 נסי שוב בעוד רגע` | `chat_widget.error_generic` |
| 204 | aria `סגרי את הצ׳אט` / `שאלי אותנו` | `chat_widget.aria_close` / `.aria_open` |
| 208 | `שאלה? שאלי אותי` (pill) | `chat_widget.pill_text` |
| 218 | aria `עוזרת מהמקור` | `chat_widget.aria_dialog` |
| 224 | `שאלי אותנו` (header) | `chat_widget.header_title` |
| 230 | aria `סגרי את חלון העוזרת` | `chat_widget.aria_close_panel` |
| 240 | aria `שיחה עם העוזרת` | `chat_widget.aria_log` |
| 280 | sr-only `הקלידי שאלה` | `chat_widget.input_label` |
| 284 | placeholder `הקלידי שאלה...` | `chat_widget.input_placeholder` |
| 292 | aria `שלחי שאלה` | `chat_widget.aria_send` |

### 2. `app/[locale]/layout.js` — 7 (`BASE_METADATA`, SEO `<head>` fallback)
| line | string | suggested key |
|---|---|---|
| 29 | `SITE_TITLE = "מהמקור — בתי עסק מקומיים …"` | `seo.site.title` (exists; this const is the static fallback) |
| 31 | `SITE_DESCRIPTION = "בתי עסק מקומיים מתחום המזון …"` | `seo.site.description` |
| 50 | keyword `מוצרים מקומיים` | `seo.site.keywords.*` |
| 52 | keyword `אוכל בריא` | `seo.site.keywords.*` |
| 53 | keyword `אוכל אורגני` | `seo.site.keywords.*` |
| 54 | keyword `בעלי עסק ישראלים` | `seo.site.keywords.*` |
| 56 | keyword `שוק איכרים` | `seo.site.keywords.*` |

### 3. `components/GuideArticle.jsx` — 4 (guide footer, /about/for-businesses/guides/*)
| line | string | suggested key |
|---|---|---|
| 164 | `מדריך לבעלות עסק · קריאה כ-{readMinutes} דקות` | `guide_article.eyebrow` |
| 197 | `ספיר שנפ` (author) | `guide_article.author_name` |
| 200 | `מייסדת · {BRAND_NAME} · mehamakor.co.il` | `guide_article.author_role` |
| 207 | `← חזרה למדריכים` | `guide_article.back_link` |

### 4. `components/StoryCardCanvas.jsx` — 2
| line | string | suggested key |
|---|---|---|
| 174 | `גלי עוד בתי עסק ב mehamakor.online` (fallback when `t("story.canvas.footer_url")` missing) | `story_card_canvas.footer_url_fallback` |
| 215 | inline prefix `מ${producer.city}` (hardcoded `מ` between `t()` calls) | `story_card_canvas.caption_city_prefix` |

### 5. `app/[locale]/producers/page.jsx` — 2 (SEO metadata, `locale==="he"` branches bypass `t()`)
| line | string | suggested key |
|---|---|---|
| 55 | `… — עמוד ${page} | ${brand}` (`עמוד` hardcoded) | `producers.title.page_suffix` |
| 73 | `דפדפי בכל בתי העסק, מגדלים וחוות מקומיות על מהמקור.` | `seo.producers.description` (exists; HE branch bypasses it) |

### 6. `app/[locale]/experiences/new/page.js` — 2 (static `metadata` export, no `generateMetadata`)
| line | string | suggested key |
|---|---|---|
| 4 | `metadata.title = "הגישי חוויה חדשה"` | `seo.experience_new.title` |
| 6 | `metadata.description = "הגישי סדנה, סיור אוכל …"` | `seo.experience_new.description` |

### 7. `components/ui/Button.jsx` — 1 (used app-wide)
| line | string | suggested key |
|---|---|---|
| 68 | `aria-label={loading ? "טוענת…" : undefined}` | `common.aria.loading` |

### 8. `app/[locale]/events/page.js` — 1
| line | string | suggested key |
|---|---|---|
| 42 | Suspense fallback `טוענת אירועים...` | `events.list.suspense_loading` |

### 9. `app/[locale]/experiences/[id]/page.js` — 1
| line | string | suggested key |
|---|---|---|
| 71 | Suspense fallback `טוענת את החוויה...` | `experiences.detail.suspense_loading` |

### 10. `app/[locale]/producer/[id]/lib/producer-format.js` — 1 (low priority)
| line | string | suggested key |
|---|---|---|
| 38 | initials fallback char `"מ"` in `words[0]?.[0] ?? "מ"` | `producer_format.initials_fallback` |

---

## Top-20 highest-impact (user-facing × traffic × `/en` breakage)

| # | file:line | string | namespace |
|---|---|---|---|
| 1 | `ChatWidget.jsx:26` | `היי 🌿 אני כאן לעזור!…` | `chat_widget` — shown on **every page** |
| 2 | `ChatWidget.jsx:204` | aria `סגרי את הצ׳אט`/`שאלי אותנו` | `chat_widget` — global button a11y name |
| 3 | `ChatWidget.jsx:224` | `שאלי אותנו` (header) | `chat_widget` |
| 4 | `ChatWidget.jsx:284` | placeholder `הקלידי שאלה...` | `chat_widget` |
| 5 | `ChatWidget.jsx:160` | `לא הצלחתי להבין…` | `chat_widget` — failure reply |
| 6 | `ChatWidget.jsx:164` | `שלחת הרבה הודעות…` (429) | `chat_widget` |
| 7 | `ChatWidget.jsx:208` | `שאלה? שאלי אותי` (pill) | `chat_widget` |
| 8 | `ChatWidget.jsx:41–46` | 6 suggested-prompt strings | `chat_widget` |
| 9 | `ChatWidget.jsx:69,71` | hardcoded FAQ answers | `chat_widget` |
| 10 | `layout.js:29` | `SITE_TITLE` | `seo.site` — `<title>`/og:title fallback |
| 11 | `layout.js:31` | `SITE_DESCRIPTION` | `seo.site` — meta description fallback |
| 12 | `ui/Button.jsx:68` | aria `טוענת…` | `common.aria` — every loading button |
| 13 | `producers/page.jsx:73` | `דפדפי בכל בתי העסק…` | `seo.producers` — index meta description |
| 14 | `producers/page.jsx:55` | `— עמוד ${page}` | `producers` — paginated tab/snippet |
| 15 | `experiences/new/page.js:4` | `הגישי חוויה חדשה` | `seo.experience_new` |
| 16 | `experiences/new/page.js:6` | `הגישי סדנה…` | `seo.experience_new` |
| 17 | `events/page.js:42` | `טוענת אירועים...` | `events.list` — SSR Suspense fallback |
| 18 | `experiences/[id]/page.js:71` | `טוענת את החוויה...` | `experiences.detail` |
| 19 | `GuideArticle.jsx:164` | `מדריך לבעלות עסק · קריאה כ-{n} דקות` | `guide_article` |
| 20 | `GuideArticle.jsx:207` | `← חזרה למדריכים` | `guide_article` |

---

## Comments / low-priority (NOT user-facing — inventory, not action items)

Hebrew appearing only in `//`/`/* */`/JSDoc/`console.*` — surfaced for completeness:

- `components/ButtonSpinner.jsx:15,18,24–25` · `components/StoryCardCanvas.jsx:9,13` ·
  `components/WhatsAppQuestionChips.jsx:15,18` (`[עיר]` template substitution, not direct render) ·
  `components/Breadcrumb.jsx:11–12` · `components/SmartSearch.jsx:11` · `components/FollowButton.jsx:15` ·
  `components/CategoryIcons.jsx:41–106` · `components/DeliveryBlock.jsx:11–13` ·
  `components/AvailabilityBadge.jsx:10–12` · `components/ProducerCard.jsx:154` ·
  `components/BadgeRow.jsx:12,98` · `components/ParallaxQuote.jsx:18` ·
  `components/ui/{Button,Badge,Heading,Input,Card,Link}.jsx` (JSDoc examples) ·
  `app/[locale]/admin/producers/AdminProducersTable.jsx:30–31` ·
  `app/[locale]/map/state/useProducersFeed.js:30` + `useMapSync.js:220` (`console.*`) ·
  `app/[locale]/settings/page.jsx:169,364,621,727` (section dividers) ·
  `app/[locale]/about/process/AboutProcessClient.jsx:60–61,166` ·
  `app/[locale]/home/HomeStaticBlocks.jsx:288,292,322,368` · `app/[locale]/layout.js:127`.

Edge cases noted (intentional / arguable, left for human call):
- `components/AccountSheet.jsx:156` — `עב / EN` language-toggle indicator (`dir="ltr" aria-hidden`); bilingual decoration, arguably correct as-is.

---

## Recommended extraction order (follow-up tickets, NOT this PR)

1. **ChatWidget.jsx** — single highest ROI; add `useTranslations`, move all 21 strings to a new `chat_widget` namespace in he.json/en.json. Biggest `/en` gap closer.
2. **layout.js `BASE_METADATA` + the two static-`metadata`/`locale==="he"` SEO bypasses** (`producers/page.jsx`, `experiences/new/page.js`) — route through the existing `seo.*` keys so `/en` crawlers get English `<head>`.
3. **Shared a11y strings** (`ui/Button.jsx` loading aria) → `common.aria.*` (touches every page).
4. **Suspense fallbacks** (events / experiences) and **GuideArticle** footer — lower traffic, batch together.
5. `StoryCardCanvas` / `producer-format` single-char Hebrew fallbacks — lowest priority.

_Generated by the overnight i18n scan (Batch #2, Task 3). Methodology: Hebrew-literal grep + per-file classification (render vs comment vs wire-format vs t()-wrapped)._
