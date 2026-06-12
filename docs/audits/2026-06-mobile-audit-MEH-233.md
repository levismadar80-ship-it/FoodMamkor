# MEH-233 — Mobile Responsiveness Audit (Audit 7/7)

> **AUDIT-ONLY.** Playwright + screenshots + findings. **No layout fixes** — each
> CRITICAL/HIGH below should be triaged by Sapir into a per-route sub-MEH.

- **Date:** 2026-06-08
- **Branch:** `feature/meh-233-audit-mobile`
- **Spec:** `frontend/e2e/mobile-audit/mobile-audit.spec.ts`
- **Config:** `frontend/playwright.mobile-audit.config.ts`
- **Viewports:** iPhone SE 375×667 · Galaxy 360×640 · iPhone 14 390×844
- **Target:** LOCAL production build (`npm run build && npm run start`), Chromium 141.

## ⚠️ Environment caveat — no backend

The sandbox cannot run the backend (Postgres + API), so API-driven content
(producer grids, `/producer/[id]`, `/events`, `/favorites`, admin tables) rendered as
**loading / empty / error states**. External CDNs (fonts, Cloudinary, Unsplash, Google
Maps/GSI) were blocked at the network layer. **Therefore:**

- **Structural checks are valid** — overflow, nav cut-off, header/footer overlap,
  tap-target size, modal fit, `overflow:hidden` clipping all measure real rendered DOM.
- **Content-density overflow is a KNOWN BLIND SPOT** — long Hebrew product names, dense
  card grids, and real images may introduce overflow not visible here. A follow-up run
  against a seeded staging/preview env is recommended to close this gap.
- Routes that returned non-200 or rendered empty are flagged per-route below.

## Severity summary

| Severity | Count |
|---|---|
| 🔴 CRITICAL | 9 |
| 🟠 HIGH | 33 |
| 🟡 MEDIUM | 0 |
| ⚪ LOW | 0 |
| **Total findings** | **42** |

Checks (Phase C): 1 horizontal-overflow · 2 unintentional-truncation · 3 tap-target<44px ·
4 clipped-by-overflow · 5 modal-exceeds-viewport · 6 header/footer-overlap · 7 nav-cut-off.

## Top 10 CRITICAL

| # | Route | Viewport | Check | Detail | Screenshot |
|---|---|---|---|---|---|
| 1 | `/` | iphone-se | Clipped by overflow:hidden | 4 element(s) clip horizontal content: p.text-sm.font-medium "איפה את? נמצא עסקים קרובים אלי" (content 213px > box 151px) \| div.bg-primary.overflow-hidden "🌿 ל | [img](screenshots/MEH-233/home__iphone-se.png) |
| 2 | `/` | galaxy | Clipped by overflow:hidden | 4 element(s) clip horizontal content: p.text-sm.font-medium "איפה את? נמצא עסקים קרובים אלי" (content 213px > box 136px) \| div.bg-primary.overflow-hidden "🌿 ל | [img](screenshots/MEH-233/home__galaxy.png) |
| 3 | `/` | iphone-14 | Clipped by overflow:hidden | 4 element(s) clip horizontal content: p.text-sm.font-medium "איפה את? נמצא עסקים קרובים אלי" (content 213px > box 166px) \| div.bg-primary.overflow-hidden "🌿 ל | [img](screenshots/MEH-233/home__iphone-14.png) |
| 4 | `/about` | iphone-se | Clipped by overflow:hidden | 2 element(s) clip horizontal content: section.relative.text-white "פעם היית צריכה לדעת את מי לשאו" (content 395px > box 375px) \| section.relative.w-full "“אוכל | [img](screenshots/MEH-233/about__iphone-se.png) |
| 5 | `/about` | galaxy | Clipped by overflow:hidden | 2 element(s) clip horizontal content: section.relative.text-white "פעם היית צריכה לדעת את מי לשאו" (content 380px > box 360px) \| section.relative.w-full "“אוכל | [img](screenshots/MEH-233/about__galaxy.png) |
| 6 | `/about` | iphone-14 | Clipped by overflow:hidden | 2 element(s) clip horizontal content: section.relative.text-white "פעם היית צריכה לדעת את מי לשאו" (content 411px > box 390px) \| section.relative.w-full "“אוכל | [img](screenshots/MEH-233/about__iphone-14.png) |
| 7 | `/events` | iphone-se | Clipped by overflow:hidden | 1 element(s) clip horizontal content: section.relative.text-white "אירועים בחוות ואצל בתי עסקמה ק" (content 395px > box 375px) | [img](screenshots/MEH-233/events__iphone-se.png) |
| 8 | `/events` | galaxy | Clipped by overflow:hidden | 1 element(s) clip horizontal content: section.relative.text-white "אירועים בחוות ואצל בתי עסקמה ק" (content 379px > box 360px) | [img](screenshots/MEH-233/events__galaxy.png) |
| 9 | `/events` | iphone-14 | Clipped by overflow:hidden | 1 element(s) clip horizontal content: section.relative.text-white "אירועים בחוות ואצל בתי עסקמה ק" (content 411px > box 390px) | [img](screenshots/MEH-233/events__iphone-14.png) |

> **TRIAGE (MEH-233, 2026-06-10):** of the 9 CRITICAL above, only the `/` **LocationBanner** `<p>` ("איפה את?…", `components/LocationBanner.jsx`) is a real clip — fixed by dropping `truncate` so the Hebrew wraps. **FALSE POSITIVES — intentional bleed, do NOT re-flag:** the home **HomeMarquee** (`HomeStaticBlocks.jsx` — `whitespace-nowrap` scrolling ticker), the **2× home ParallaxQuote** and the **/events kenburns hero** (`ParallaxQuote.jsx` / `EventsClient.jsx` — `kenburns-* absolute inset:-5%` decorative image deliberately oversized 5%/side and clipped by `overflow-hidden`). The **/about** rows (#4–6) are **STALE** — that hero was redesigned by MEH-135 (merged after this snapshot); current /about shows 0 CRITICAL.

## Findings by route

### `/` — HTTP 200

Screenshots: [iPhone SE (375×667)](screenshots/MEH-233/home__iphone-se.png) · [Galaxy (360×640)](screenshots/MEH-233/home__galaxy.png) · [iPhone 14 (390×844)](screenshots/MEH-233/home__iphone-14.png)

| Severity | Viewport | Check | Detail |
|---|---|---|---|
| 🔴 CRITICAL | iphone-se | Clipped by overflow:hidden | 4 element(s) clip horizontal content: p.text-sm.font-medium "איפה את? נמצא עסקים קרובים אלי" (content 213px > box 151px) \| div.bg-primary.overflow-hidden "🌿 ללא מעובד🥩 ממרעה🧀 אורגני�" (content 208 |
| 🔴 CRITICAL | galaxy | Clipped by overflow:hidden | 4 element(s) clip horizontal content: p.text-sm.font-medium "איפה את? נמצא עסקים קרובים אלי" (content 213px > box 136px) \| div.bg-primary.overflow-hidden "🌿 ללא מעובד🥩 ממרעה🧀 אורגני�" (content 207 |
| 🔴 CRITICAL | iphone-14 | Clipped by overflow:hidden | 4 element(s) clip horizontal content: p.text-sm.font-medium "איפה את? נמצא עסקים קרובים אלי" (content 213px > box 166px) \| div.bg-primary.overflow-hidden "🌿 ללא מעובד🥩 ממרעה🧀 אורגני�" (content 209 |
| 🟠 HIGH | iphone-se | Tap target < 44px | 33 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input#hero-search-input.flex-1.min-w-0 (230×24) \| button.bg-action-primary.hover:bg-action-primary-hover "גלו עסקי |
| 🟠 HIGH | galaxy | Tap target < 44px | 33 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input#hero-search-input.flex-1.min-w-0 (217×24) \| button.bg-action-primary.hover:bg-action-primary-hover "גלו עסקי |
| 🟠 HIGH | iphone-14 | Tap target < 44px | 33 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input#hero-search-input.flex-1.min-w-0 (243×24) \| button.bg-action-primary.hover:bg-action-primary-hover "גלו עסקי |

### `/map` — HTTP 200

Screenshots: [iPhone SE (375×667)](screenshots/MEH-233/map__iphone-se.png) · [Galaxy (360×640)](screenshots/MEH-233/map__galaxy.png) · [iPhone 14 (390×844)](screenshots/MEH-233/map__iphone-14.png)

| Severity | Viewport | Check | Detail |
|---|---|---|---|
| 🟠 HIGH | iphone-se | Tap target < 44px | 25 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input#map-city-search-mobile.flex-1.min-w-0 (253×24) \| button.cursor-pointer.shrink-0 (40×40) \| button.inline-fle |
| 🟠 HIGH | galaxy | Tap target < 44px | 25 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input#map-city-search-mobile.flex-1.min-w-0 (238×24) \| button.cursor-pointer.shrink-0 (40×40) \| button.inline-fle |
| 🟠 HIGH | iphone-14 | Tap target < 44px | 25 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input#map-city-search-mobile.flex-1.min-w-0 (268×24) \| button.cursor-pointer.shrink-0 (40×40) \| button.inline-fle |

### `/login` — HTTP 200

Screenshots: [iPhone SE (375×667)](screenshots/MEH-233/login__iphone-se.png) · [Galaxy (360×640)](screenshots/MEH-233/login__galaxy.png) · [iPhone 14 (390×844)](screenshots/MEH-233/login__iphone-14.png)

| Severity | Viewport | Check | Detail |
|---|---|---|---|
| 🟠 HIGH | iphone-se | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |
| 🟠 HIGH | galaxy | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |
| 🟠 HIGH | iphone-14 | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |

### `/register` — HTTP 200

Screenshots: [iPhone SE (375×667)](screenshots/MEH-233/register__iphone-se.png) · [Galaxy (360×640)](screenshots/MEH-233/register__galaxy.png) · [iPhone 14 (390×844)](screenshots/MEH-233/register__iphone-14.png)

| Severity | Viewport | Check | Detail |
|---|---|---|---|
| 🟠 HIGH | iphone-se | Tap target < 44px | 24 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input#register-name.w-full.border (277×42) \| input#register-email.w-full.border (277×42) \| input#pw-password.w-fu |
| 🟠 HIGH | galaxy | Tap target < 44px | 24 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input#register-name.w-full.border (262×42) \| input#register-email.w-full.border (262×42) \| input#pw-password.w-fu |
| 🟠 HIGH | iphone-14 | Tap target < 44px | 24 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input#register-name.w-full.border (292×42) \| input#register-email.w-full.border (292×42) \| input#pw-password.w-fu |

### `/register/producer` — HTTP 200

Screenshots: [iPhone SE (375×667)](screenshots/MEH-233/register-producer__iphone-se.png) · [Galaxy (360×640)](screenshots/MEH-233/register-producer__galaxy.png) · [iPhone 14 (390×844)](screenshots/MEH-233/register-producer__iphone-14.png)

| Severity | Viewport | Check | Detail |
|---|---|---|---|
| 🟠 HIGH | iphone-se | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input.w-full.border (279×42) \| input.w-full.border (279×42) \| input.w-full.border (279×42) \| a.inline-flex.items |
| 🟠 HIGH | galaxy | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input.w-full.border (264×42) \| input.w-full.border (264×42) \| input.w-full.border (264×42) \| a.inline-flex.items |
| 🟠 HIGH | iphone-14 | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| input.w-full.border (294×42) \| input.w-full.border (294×42) \| input.w-full.border (294×42) \| a.inline-flex.items |

### `/producer/1` — HTTP 200

Screenshots: [iPhone SE (375×667)](screenshots/MEH-233/producer-detail__iphone-se.png) · [Galaxy (360×640)](screenshots/MEH-233/producer-detail__galaxy.png) · [iPhone 14 (390×844)](screenshots/MEH-233/producer-detail__iphone-14.png)

| Severity | Viewport | Check | Detail |
|---|---|---|---|
| 🟠 HIGH | iphone-se | Tap target < 44px | 15 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| a.inline-flex.items-center "@meha_makor" (138×24) \| a.hover:text-white.transition "גלה עסקים" (59×15) \| a.hover:t |
| 🟠 HIGH | galaxy | Tap target < 44px | 15 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| a.inline-flex.items-center "@meha_makor" (138×24) \| a.hover:text-white.transition "גלה עסקים" (59×15) \| a.hover:t |
| 🟠 HIGH | iphone-14 | Tap target < 44px | 15 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| a.inline-flex.items-center "@meha_makor" (138×24) \| a.hover:text-white.transition "גלה עסקים" (59×15) \| a.hover:t |

### `/favorites` — HTTP 200

Screenshots: [iPhone SE (375×667)](screenshots/MEH-233/favorites__iphone-se.png) · [Galaxy (360×640)](screenshots/MEH-233/favorites__galaxy.png) · [iPhone 14 (390×844)](screenshots/MEH-233/favorites__iphone-14.png)

| Severity | Viewport | Check | Detail |
|---|---|---|---|
| 🟠 HIGH | iphone-se | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |
| 🟠 HIGH | galaxy | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |
| 🟠 HIGH | iphone-14 | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |

### `/settings` — HTTP 200

Screenshots: [iPhone SE (375×667)](screenshots/MEH-233/settings__iphone-se.png) · [Galaxy (360×640)](screenshots/MEH-233/settings__galaxy.png) · [iPhone 14 (390×844)](screenshots/MEH-233/settings__iphone-14.png)

| Severity | Viewport | Check | Detail |
|---|---|---|---|
| 🟠 HIGH | iphone-se | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |
| 🟠 HIGH | galaxy | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |
| 🟠 HIGH | iphone-14 | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |

### `/admin` — HTTP 200

Screenshots: [iPhone SE (375×667)](screenshots/MEH-233/admin__iphone-se.png) · [Galaxy (360×640)](screenshots/MEH-233/admin__galaxy.png) · [iPhone 14 (390×844)](screenshots/MEH-233/admin__iphone-14.png)

| Severity | Viewport | Check | Detail |
|---|---|---|---|
| 🟠 HIGH | iphone-se | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |
| 🟠 HIGH | galaxy | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |
| 🟠 HIGH | iphone-14 | Tap target < 44px | 18 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| button.absolute.right-3 (28×28) \| a.text-xs.text-fg-muted "שכחת סיסמה?" (76×14) \| a.text-primary.hover:underline  |

### `/events` — HTTP 200

Screenshots: [iPhone SE (375×667)](screenshots/MEH-233/events__iphone-se.png) · [Galaxy (360×640)](screenshots/MEH-233/events__galaxy.png) · [iPhone 14 (390×844)](screenshots/MEH-233/events__iphone-14.png)

| Severity | Viewport | Check | Detail |
|---|---|---|---|
| 🔴 CRITICAL | iphone-se | Clipped by overflow:hidden | 1 element(s) clip horizontal content: section.relative.text-white "אירועים בחוות ואצל בתי עסקמה ק" (content 395px > box 375px) |
| 🔴 CRITICAL | galaxy | Clipped by overflow:hidden | 1 element(s) clip horizontal content: section.relative.text-white "אירועים בחוות ואצל בתי עסקמה ק" (content 379px > box 360px) |
| 🔴 CRITICAL | iphone-14 | Clipped by overflow:hidden | 1 element(s) clip horizontal content: section.relative.text-white "אירועים בחוות ואצל בתי עסקמה ק" (content 411px > box 390px) |
| 🟠 HIGH | iphone-se | Tap target < 44px | 27 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| a.hover:text-primary.transition "בית" (21×20) \| a.ms-auto.text-sm "הוסיפו אירוע ←" (80×40) \| button.px-4.py-2 "רש |
| 🟠 HIGH | galaxy | Tap target < 44px | 27 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| a.hover:text-primary.transition "בית" (21×20) \| a.ms-auto.text-sm "הוסיפו אירוע ←" (75×40) \| button.px-4.py-2 "רש |
| 🟠 HIGH | iphone-14 | Tap target < 44px | 27 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| a.hover:text-primary.transition "בית" (21×20) \| a.ms-auto.text-sm "הוסיפו אירוע ←" (84×40) \| button.px-4.py-2 "רש |

### `/about` — HTTP 200

Screenshots: [iPhone SE (375×667)](screenshots/MEH-233/about__iphone-se.png) · [Galaxy (360×640)](screenshots/MEH-233/about__galaxy.png) · [iPhone 14 (390×844)](screenshots/MEH-233/about__iphone-14.png)

| Severity | Viewport | Check | Detail |
|---|---|---|---|
| 🔴 CRITICAL | iphone-se | Clipped by overflow:hidden | 2 element(s) clip horizontal content: section.relative.text-white "פעם היית צריכה לדעת את מי לשאו" (content 395px > box 375px) \| section.relative.w-full "“אוכל טוב — לא שומרים לעצמנו”" (content 394px |
| 🔴 CRITICAL | galaxy | Clipped by overflow:hidden | 2 element(s) clip horizontal content: section.relative.text-white "פעם היית צריכה לדעת את מי לשאו" (content 380px > box 360px) \| section.relative.w-full "“אוכל טוב — לא שומרים לעצמנו”" (content 378px |
| 🔴 CRITICAL | iphone-14 | Clipped by overflow:hidden | 2 element(s) clip horizontal content: section.relative.text-white "פעם היית צריכה לדעת את מי לשאו" (content 411px > box 390px) \| section.relative.w-full "“אוכל טוב — לא שומרים לעצמנו”" (content 410px |
| 🟠 HIGH | iphone-se | Tap target < 44px | 16 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| a.inline-flex.items-center "יש לך סיפור? ספרי לנו" (148×24) \| a.inline-flex.items-center "@meha_makor" (138×24) \| |
| 🟠 HIGH | galaxy | Tap target < 44px | 16 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| a.inline-flex.items-center "יש לך סיפור? ספרי לנו" (148×24) \| a.inline-flex.items-center "@meha_makor" (138×24) \| |
| 🟠 HIGH | iphone-14 | Tap target < 44px | 16 interactive element(s) below 44×44px. Samples: a.shrink-0.inline-flex (106×40) \| a.inline-flex.items-center "יש לך סיפור? ספרי לנו" (148×24) \| a.inline-flex.items-center "@meha_makor" (138×24) \| |

## Method

Each route was loaded per viewport; after a 2.5s settle the full page was screenshotted
and 7 checks ran against the live DOM (`getBoundingClientRect` + `getComputedStyle`).
Heuristic notes: check 2 ignores CSS `text-overflow:ellipsis`/`-webkit-line-clamp`
(intentional); check 3 counts every visible interactive element under 44px (icon-only
buttons included — triage may downgrade); check 6 only fires when a fixed/sticky bar's
band overlaps `<main>`'s top/bottom edge. Severity follows the MEH-233 Phase-C mapping.
