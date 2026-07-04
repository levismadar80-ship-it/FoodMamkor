# Mehamakor (מהמקור) — design system conventions

Mehamakor is a **Hebrew, right-to-left** marketplace for neighborhood food
producers. Warm, editorial, trust-forward. Build every screen `dir="rtl"`,
in Hebrew, on the tokens and components below — never invent parallel styling.

## Setup — wrap the app in the provider

Components read i18n (next-intl) and Next navigation/theme context. Wrap your
tree once in the library's `DSProvider` (it supplies Hebrew messages, router
stubs, and `dir="rtl"`); without it any component using `useTranslations` or
`next/navigation` throws.

```jsx
const { DSProvider, Button, Card, Heading, Badge } = window.MehamakorDS;

<DSProvider>
  <Card>
    <div className="p-5 flex flex-col gap-3">
      <Heading level={2} variant="editorial">מאפיית לחם מחמצת</Heading>
      <p className="text-fg-muted">נאפה טרי כל בוקר משכונת המושבה.</p>
      <div className="flex gap-2">
        <Badge variant="primary">מאומת</Badge>
        <Badge variant="muted">אורגני</Badge>
      </div>
      <Button variant="primary" size="lg">צפייה בעסק</Button>
    </div>
  </Card>
</DSProvider>
```

## Styling idiom — Tailwind utilities with the brand token vocabulary

Style with Tailwind utility classes. Use the **named brand tokens** below, not
raw hex — they carry the palette and type scale. (Library components already
carry their own styling; you only need these for your own layout/glue.)

| Role | Classes |
|---|---|
| Brand green | `bg-primary` `text-primary` `bg-action-primary` `hover:bg-primary-dark` (#2e6853) |
| Gold accent | `text-accent` `bg-accent` (#896714 — repo canon per docs/DESIGN.md + MEH-917 AA; the export's #8b6914 is stale) |
| Surfaces | `bg-background` (cream page) · `bg-surface` (white) · `bg-surface-card` (#fffefb) |
| Ink | `text-text` (near-black body) · `text-fg-muted` / `text-muted` (secondary) · `text-background` (cream-on-green) |
| Lines/fills | `border-border` · `bg-green-50` · `text-green-700` |
| Serif headings | `font-headline-display` `font-headline-lg` `font-headline-md` (Frank Ruhl Libre) |
| Body / labels | `font-body-lg` `font-body-md` `font-label-md` (DM Sans / Heebo) |
| Type scale | `text-headline-display` `text-headline-lg` `text-headline-md` `text-body-lg` |
| Motion / focus | `duration-fast` `duration-base` `ease-quart` `focus-ring` |

Conventions: actions are **pill-shaped** (`rounded-full`); buttons keep a ≥44px
touch target; RTL means logical spacing (`ps-*`/`pe-*`, `ms-*`/`me-*`) — avoid
physical `left/right`.

## Where the truth lives

- The full stylesheet (tokens, fonts, every component rule) is `_ds/<folder>/styles.css`
  and its `@import` of `_ds_bundle.css` — read it before introducing any new color or size.
- Each component ships `<Name>.d.ts` (its prop contract) and `<Name>.prompt.md` (usage) under
  `components/<group>/<Name>/`. Prefer composing real components (`Button`, `Card`, `Badge`,
  `Heading`, `Input`, `Link`, `EmptyState`, `StarRating`, `TrustBadge`, `Pagination`, …) over
  re-building primitives.

# MehamakorDS (mehamakor-frontend@1.0.0)

This design system is the published mehamakor-frontend React library, bundled as a single
browser global. All 91 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.MehamakorDS`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.MehamakorDS.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { AccountSheet } = window.MehamakorDS;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<AccountSheet />);
```

Wrap the tree in the provider — most components read theme/i18n from context:

```jsx
<DSProvider>{children}</DSProvider>
```

## Tokens

62 CSS custom properties from mehamakor-frontend. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (8): `--tw-border-spacing-x`, `--tw-border-spacing-y`, `--tw-ring-offset-color`, …
- **spacing** (2): `--tw-ring-inset`, `--tw-space-y-reverse`
- **shadow** (4): `--tw-ring-offset-shadow`, `--tw-ring-shadow`, `--tw-shadow`, …
- **other** (48): `--tw-translate-x`, `--tw-translate-y`, `--tw-rotate`, …

## Components

### general
- `AccountSheet`
- `AddressSearch`
- `AlertPrefsPanel`
- `AppleAuthButton`
- `AvailabilityBadge`
- `Badge`
- `BadgeRow`
- `BottomNav`
- `Breadcrumb`
- `Button`
- `ButtonSpinner`
- `CalendarView`
- `Card`
- `CategoryRequestModal`
- `CategorySelector`
- `CategoryTag`
- `ChatWidget`
- `ChatWidgetLazy`
- `ChipScrollRow`
- `CitiesAutocomplete`
- `CitySearch`
- `ClarityScript`
- `CookieBanner`
- `CustomCursor`
- `DeliveryBlock`
- `DirectoryDisclaimer`
- `EmptyState`
- `ExperienceCard`
- `FadeInSection`
- `FavoriteButton`
- `FollowButton`
- `Footer`
- `FooterSlot`
- `FridayDeliveryStrip`
- `GoogleAuthButton`
- `GuideArticle`
- `Header`
- `Heading`
- `HeroSearch`
- `HolidayBanner`
- `HomepageMiniMapSkeleton`
- `ImageGallery`
- `ImageWithFallback`
- `InfoTooltip`
- `Input`
- `InstallPrompt`
- `KashrutBadgeStrip`
- `LanguageToggle`
- `Lightbox`
- `Link`
- `LocationBanner`
- `LocationModal`
- `LoginPromptModal`
- `MapBottomSheet`
- `MapProducerCard`
- `OnboardingTip`
- `OpeningHours`
- `Pagination`
- `ParallaxQuote`
- `PasswordInput`
- `PasswordStrength`
- `PhoneVerifyCard`
- `Popover`
- `PrimaryContactButton`
- `ProducerCard`
- `ProducerOAuthButtons`
- `ProducersClient`
- `ProfileCompletenessCard`
- `RecipeForm`
- `RecipeStatusBadge`
- `ReportButton`
- `ReviewsSection`
- `ShareButton`
- `SkeletonCard`
- `SkeletonLine`
- `SkeletonProducerGrid`
- `SmoothScrollProvider`
- `StarRating`
- `StarSelector`
- `StoryCardCanvas`
- `Toaster`
- `Tooltip`
- `TrustBadge`
- `VerifyBanner`
- `WhatsAppButton`
- `WhatsAppQuestionChips`
- `WhatsAppShareButton`

### admin
- `ProducerForm`

### public
- `RecipeCard`
- `RecipeDetail`
- `RecipeJsonLd`
