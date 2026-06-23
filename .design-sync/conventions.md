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
| Gold accent | `text-accent` `bg-accent` (#8b6914) |
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
