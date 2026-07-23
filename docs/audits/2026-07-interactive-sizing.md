# Interactive sizing audit — 2026-07 (MEH-1103)

Repo-wide census of interactive elements (`<button>`, `<Link>`, `<a>`,
`role="button"`) carrying sub-14px text (`text-xs`, `text-[<14px]`, inline
`fontSize`) or sub-44px tap targets on viewport-pinned controls, measured
against the **"Interactive sizing minimums"** section of
[docs/DESIGN.md](../DESIGN.md) (landed in PR-0 of this sweep, #1581).

Method: `grep -rnE "(<button|<Link|<a |role=\"button\")"` × `text-xs|text-[10-13px]|fontSize`
over `frontend/app` + `frontend/components`, plus manual inspection of every
viewport-pinned control (Header, BottomNav, HolidayBanner, CookieBanner,
ChatWidget, map controls). Line numbers anchored at staging `8cbc3dc4`
(post PR-0…PR-4 merges).

## Fixed in this sweep (PR-0…PR-5)

| file:line | was | now | PR |
|---|---|---|---|
| `components/Header.jsx:381,:407` | NavLink + LoginAccount `text-sm` | `text-base` | #1592 |
| `components/Header.jsx:255-258,:267` | pill `py-0.5`, end-cap `px-4` | `py-1.5`, `px-6` (~58px pill) | #1592 |
| `components/ui/Button.jsx:48` | `md: text-sm` | `md: text-base` | #1594 |
| `components/Footer.jsx:227 area` | utility links inline `11px`, no reach floor | `text-[13px]` + `min-h-[44px]` | #1595 |
| `components/Footer.jsx:140 area` | nav links inline `13px` style | `text-[13px]` class (size unchanged) | #1595 |
| `components/HolidayBanner.jsx` CTA | `text-xs py-1.5` | `text-sm py-2` | PR-5 |
| `components/HolidayBanner.jsx` dismiss | `p-1` + 16px glyph (~24px target) | `min-h/min-w-[44px]` + flex centering | PR-5 |
| `components/ReviewsSection.jsx` action buttons (reply save/cancel, reply add/edit, write-CTA, submit/cancel) | ~34-38px rows; reply add/edit `text-[13px]` | `min-h-[44px]`; reply add/edit also `text-sm` (14px floor) | PR-5 |
| `components/PhoneVerifyCard.jsx` send + confirm | `py-2` (~38px) | `min-h-[44px]` | PR-5 |
| `components/HeroSearch.jsx:451` | suggestion section label `uppercase tracking-wider` | removed (kept `text-[11px] font-semibold`; non-interactive label) — Refs MEH-1073 T10 | PR-5 |

## Findings — remaining (report only)

| file:line | element | current | proposed | owner ticket |
|---|---|---|---|---|
| `components/ProducersClient.jsx:390,:401,:415,:430` | filter removal chips | `text-xs py-1` (~30px) | `text-sm` + `min-h-[44px]`, or per new chip spec | **MEH-1081 (in flight — do not touch)** |
| `components/ProducersClient.jsx:439` | "clear all" link-button | `text-xs` | `text-sm min-h-[44px]` | MEH-1081 (same surface) |
| `components/ReviewsSection.jsx:469,:480` | pagination prev/next arrows | `p-2` + 18px glyph (~34px) | `min-h/min-w-[44px]` + flex centering | — |
| `components/ReviewsSection.jsx:49` | star-picker buttons | bare button, star glyph only | 44px hit area per star (`min-h/min-w-[44px]`) | — |
| `app/[locale]/login/LoginClient.jsx:245` | "שכחת סיסמה?" link | `text-xs` | `text-sm` (min 14px floor) | — |
| `app/[locale]/settings/page.jsx:458` | forgot-password link | `text-xs` | `text-sm` | — |
| `app/[locale]/reset-password/ResetPasswordClient.jsx:160` | forgot-password link | `text-xs` | `text-sm` | — |
| `app/[locale]/map/components/MapPane.jsx:185` | "show all" button | `text-[13px]` | `text-sm` + `min-h-[44px]` | — |
| `components/WhatsAppQuestionChips.jsx:39` | question chips `<a>` | inline `fontSize: 12px` (tap 44px OK via `minBlockSize`) | `text-sm` class, drop inline style | — |
| `components/ChatWidget.jsx:269` | suggestion buttons | `text-xs px-3 py-2` | `text-sm` + `min-h-[44px]` | — |
| `components/CookieBanner.jsx:86,:93` | consent buttons | `text-xs` (tap 44px OK) | `text-sm` (type floor only) | — |
| `components/Footer.jsx:134-146` | column-2 nav links | 13px, `gap-2` rows (~20px row height) | `min-h-[44px]` rows (footer grows ~7 rows × 24px) — needs design call | — |
| `components/BottomNav.jsx:180` | compact-mode tabs | `min-h-[40px]` when compact (MEH-1014) | documented deviation — 40px < 44px floor in compact scroll state; revisit or codify as exception | MEH-1014 (decision) |
| `app/[locale]/admin/**` (~20 files, e.g. `AdminProducersTable.jsx:159-173`, `admin/page.js:163`, `admin/content/page.js:174`) | table row actions, toolbar buttons | pervasive `text-xs` interactive controls | batch pass: `text-sm` + `min-h-[44px]` on primary actions; admin-only surface, desktop-first — lower priority | propose one batch ticket |

## Documented exceptions (no action — per DESIGN.md)

- `components/BottomNav.jsx:187` labels `text-[10.5px]` — iOS tab convention; the tab itself is ≥44px (44 relaxing to 40 in compact mode — see finding above).
- `.leaflet-control-attribution` 10px — MEH-919 lock (legally required fine print).
- Inline body-text links — WCAG 2.5.8 inline exception.
- `components/HeroSearch.jsx:451` suggestion Section label — `text-[11px]`
  **non-interactive** group caption (the type floor applies to interactive
  text); PR-5 only removed its `uppercase tracking-wider` (MEH-867 rule).
- `app/[locale]/dev/components/page.jsx` — dev-only gallery (production-gated `notFound()`), renders all Button sizes by design.

## Sweep-adjacent notes

- `docs/FEATURES.md`, `docs/E2E-LOCATORS.md`, `docs/MANUAL_TESTING.md` still
  carry active-voice `/neighbor` (home cooks) sections describing the MEH-598
  hidden surface — PR-4 (#1596) cleaned the design-review checklist only; a
  docs sweep for the (c)-group references is unticketed.
- VRT parity baselines were regenerated on this branch (parity.spec.ts touch →
  `vrt-update.yml`) because PR-3's footer change merged without a baseline
  refresh; baselines here are generated from post-sweep staging.
