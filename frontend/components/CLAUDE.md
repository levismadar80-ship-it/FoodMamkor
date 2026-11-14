# Directory: `frontend/components/`

## Purpose
Reusable React components for the Next.js 14 App Router frontend.
Hebrew RTL (`dir="rtl"` is set at the layout root). JavaScript with
JSDoc — no TypeScript.

## Canonical pattern
`frontend/components/Footer.jsx:1-40` — file-header docstring documenting
MEH-XX history, structure top→bottom, scope guarantees, and any
intentional a11y/contrast deviation with rationale. Mirror this header
shape on any new non-trivial component. For sticky/scroll-aware
behavior see `frontend/components/Header.jsx`.

## Shared components — look here before writing one
Search before you create: a button, field, dialog, message, heading, toggle,
avatar, loading state or "back" link already has ONE owner below. Build from it
(`className` for layout only); never copy its classes into a new file. Import
by path (`@/components/ui/Dialog`), not from the `ui/index.js` barrel: an
export nobody imports there fails the Knip dead-code ratchet.
The last column is the guard that pins the owner or its look; some cover only
part (noted in the row) — read the guard's header. Full rules: `docs/DESIGN.md`.
`ComponentCatalogGuard.test.js` fails when a `ui/` file is missing from this table.

| Need | Owner | Guard |
|---|---|---|
| Filled / outlined / destructive action | `ui/Button.jsx` | `ButtonPrimitiveGuard`, `ActionShapeGuard` (pill shape) |
| Text field: labelled (`md`), compact (`size="sm"`/`"xs"`), in a row (`inline`) | `ui/Input.jsx` | `HandWrittenRatchet` (no new raw text field), `FieldLookGuard` (look) |
| Current / repeat password with the eye toggle (a NEW password with the strength list: `PasswordInput.jsx`) | `ui/PasswordField.jsx` | `HandWrittenRatchet` |
| Dropdown · multi-line text, same label + error wiring | `ui/Select.jsx`, `ui/Textarea.jsx` | `FieldLookGuard` (look) |
| Field look + label shell behind those three (don't use directly in a page) | `ui/field.jsx` | — |
| Centred modal (focus trap: `hooks/useDialogFocus.js`) | `ui/Dialog.jsx` | `DialogContractGuard` |
| Error / «נשמר» message inside a page or form | `ui/InlineMessage.jsx` | `InlineMessageGuard` |
| Transient toast (`showToast.*`) | `lib/toast.js`, `Toaster.jsx` | — |
| A section's h2 | `ui/SectionHeading.jsx` | `HomeSectionHeadingGuard` (home page only) |
| On/off toggle | `ui/Switch.jsx` | `SwitchGuard` |
| Person's photo or initial | `ui/Avatar.jsx` | `AvatarGuard` |
| "Back to X" link (dashboard) | `ui/BackLink.jsx` | `BackLinkGuard` |
| «הצגת עוד» on a list that grows in place | `ui/ShowMore.jsx` | `ShowMoreGuard` |
| Card rating «★ 4.8 (12)» | `ui/RatingCompact.jsx` | `RatingCompactGuard` |
| Fact line with its icon (business page) | `ui/FactLine.jsx` | `FactLineIconGuard` |
| Empty list / no results | `ui/EmptyState.jsx` | — |
| Rich click-opened bubble · sheet on phone | `ui/Popover.jsx` | — |
| Short hover/tap explainer (not the older `InfoTooltip.jsx`) | `ui/Tooltip.jsx` | `HandWrittenRatchet` |
| Icon button on a photo (heart, share) | `ui/overlay-icon-button.js` | — |
| Styled text link · pill · h1–h4 · card shell | `ui/Link.jsx`, `ui/Badge.jsx`, `ui/Heading.jsx`, `ui/Card.jsx` | `CardRadiusGuard` (radius only) |
| Loading bar / box · spinner in a button | `Skeleton.jsx` (`SkeletonBlock`), `ButtonSpinner.jsx` | `LoadingGuard` |
| Copy a link | `lib/clipboard.js` | `ClipboardGuard` |
| Masthead of an entity page | `EntityCover.jsx` | `EntityRegistryGuard` (imports only) |
| Head of a «מה קורה» hub tab | `HubShell.jsx` | `HubShellGuard` |
| Print a date | `lib/format-date.js` | `DateFormatGuard` |
| «→ חזרה» to the previous page · location trail | `HistoryBackLink.jsx` · `Breadcrumb.jsx` | — |
| Horizontal chip row | `ChipScrollRow.jsx` | — |
| City / address field | `CitySearch.jsx` · `AddressSearch.jsx` | ESLint `no-restricted-syntax` |
| Image with branded fallback | `ImageWithFallback.jsx` | — |

`Link`, `Badge`, `Heading`, `Card` have no product call sites yet (only
`app/[locale]/dev/components`, the dev-only gallery). Prefer them over new
copies, but check the look against the page you are matching.

**When none fits:** extend the owner with a prop before writing a sibling. A
genuinely new primitive goes in `ui/` with the `Module / Purpose / Does NOT`
header, a row here, and a guard when a hand-written copy would be easy to write.

## Conventions specific to this dir
- **Imports**: `useAuth` from `@/lib/auth-context`, `useLanguage` from
  `@/lib/language-context`, `api` from `@/lib/api`. Translations via
  `useTranslations` from `next-intl` (only for files already migrated;
  see Gotchas).
- **Icons**: `@phosphor-icons/react` exclusively — never Heroicons or
  lucide.
- **RTL**: never use `left-*` / `right-*` / `ml-*` / `mr-*` /
  `pl-*` / `pr-*`. Use logical equivalents (`start-*`, `end-*`, `ms-*`,
  `me-*`, `ps-*`, `pe-*`). Exceptions are documented in
  `.claude/rules/rtl.md` (eye-toggle inside `dir="ltr"`, horizontal
  center idiom, map controls).
- **Cloudinary**: image URLs flow through `lib/cloudinary.js` —
  `f_auto,q_auto` injected centrally (`.claude/rules/frontend.md`).
- **Toasts** (MEH-685): `showToast.success | error | info(message, { icon?,
  duration?, action? })` from `@/lib/toast`. Default icon per type is rendered
  by `Toaster.jsx`; pass `icon` to override (bespoke surfaces). There is no
  bare `showToast(message, type)` — the positional form was removed.

## Gotchas
- **Central components require `/adversarial-review`** even on a green
  build — e.g. `MapClient.jsx`, `ProducerCard.jsx`
  listed in `.claude/central-components.json` (workflow rule 20).
- **i18n migration mid-flight** (MEH-366): `lib/language-context.js` is
  the legacy homegrown provider; the codebase is migrating to
  `next-intl`. Some components use `useTranslations`, others still call
  `useLanguage().t(...)`. Match the pattern of the file you're editing
  — do not bulk-rewrite.
- **Zod before consuming an API response** (workflow rule 19) — `safeParse()`
  via `lib/schemas.js` or `lib/api-schemas.js` (which re-exports it). Covers
  the home grid, `/map` and `/favorites`, and each routes failure to its own
  error state — the `showToast.info(error.issues[0].message)` form is
  **request-side only** (`LocationsEditor.jsx:105`). Full rule:
  [.claude/rules/frontend.md](../../.claude/rules/frontend.md).
- **RTL hook + allowlist** (`.claude/hooks/check-rtl.sh`): physical
  classes are blocked unless within ±1 line of an `rtl-ok` marker, or
  the file is path-exempted in `.claude/hooks/rtl-allowlist.txt`.

## Cross-refs
- `.claude/central-components.json` — review-frequency tier list.
- `.claude/rules/rtl.md` + `.claude/rules/frontend.md` — full rules.
- `frontend/lib/auth-context.js`, `frontend/lib/api.js`,
  `frontend/messages/he.json` (translation keys).
