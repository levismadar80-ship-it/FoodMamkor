# Directory: `frontend/components/`

## Purpose
Reusable React components for the Next.js 16 App Router frontend.
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
A raw `<button>`, `<select>`, `<textarea>`, checkbox, radio, `<h1>`–`<h3>` or `<a>`
outside `ui/` is an ESLint warning (`design-system/no-html-*`, local plugin
`eslint-rules/design-system.mjs`, MEH-3829), and so is a field named only by its
placeholder or read-only / always-disabled. With the jsx-a11y recommended set,
their totals are gated by `npm run lint:ratchet`: they may only go down.

| Need | Owner | Guard |
|---|---|---|
| Filled / outlined / destructive action | `ui/Button.jsx` | `ButtonPrimitiveGuard`, `ActionShapeGuard` (pill shape) |
| Text field: labelled (`md`), compact (`size="sm"`/`"xs"`), in a row (`inline`) | `ui/Input.jsx` | `HandWrittenRatchet` (no new raw text field), `FieldLookGuard` (look) |
| Current / repeat password with the eye toggle (a NEW password with the strength list: `PasswordInput.jsx`) | `ui/PasswordField.jsx` | `HandWrittenRatchet` |
| Dropdown · multi-line text, same label + error wiring | `ui/Select.jsx`, `ui/Textarea.jsx` | `FieldLookGuard` (look) |
| Field look + label shell behind those three (don't use directly in a page) | `ui/field.jsx` | — |
| Centred modal (focus trap: `hooks/useDialogFocus.js`) | `ui/Dialog.jsx` | `DialogContractGuard` |
| Error / «נשמר» message inside a page or form | `ui/InlineMessage.jsx` | `InlineMessageGuard` |
| Green «this is a preview» strip with the eye, above a page shown as someone else sees it | `ui/PreviewBanner.jsx` | — |
| Transient toast (`showToast.*`) | `lib/toast.js`, `Toaster.jsx` | — |
| A section's h2 | `ui/SectionHeading.jsx` | `HomeSectionHeadingGuard` (home page only) |
| On/off toggle | `ui/Switch.jsx` | `SwitchGuard` |
| A button that is only an icon (close «×», kebab ⋮, +/−): `label` required, 44px hit area via `.tap-area`, the look stays the caller's `className` | `ui/IconButton.jsx` | ESLint `design-system/no-html-button` (ratchet) |
| Days of the week as chips, Sunday first, on the shared mask (a product's days, a bag routine's days) | `ui/WeekdayChips.jsx` | — |
| Checkbox with its label — the whole row is the 44px hit area (32px from md) | `ui/Checkbox.jsx` | ESLint `design-system/no-html-checkbox` (ratchet) |
| Person's photo or initial — the signed-in person, and an owner's / host's initial on public pages (`tone="soft"`); `decorative` inside a control already named for the person | `ui/Avatar.jsx` | `AvatarGuard` |
| "Back to X" link (dashboard) | `ui/BackLink.jsx` | `BackLinkGuard` |
| 44×44 hit area on a small control without moving the layout (`::before`) | `.tap-area` in `app/globals.css` | `TapArea44` |
| «הצגת עוד» on a list that grows in place | `ui/ShowMore.jsx` | `ShowMoreGuard` |
| Card rating «★ 4.8 (12)» | `ui/RatingCompact.jsx` | `RatingCompactGuard` |
| Old / regular price, struck through, beside the paid one | `ui/StruckPrice.jsx` | `StruckPriceOneOwnerGuard` |
| Fact line with its icon (business page) | `ui/FactLine.jsx` | `FactLineIconGuard` |
| Time-limited offer card (group buy, surprise bag): title + where, price + struck price, gold saving, beige status band | `ui/OfferCard.jsx` | `OfferCardOneOwnerGuard` |
| Progress in the logo's seeds (group-buy joins, bags left today); `label={null}` when the count is written beside it | `ui/SeedProgressMark.jsx` | — |
| Empty list / no results | `ui/EmptyState.jsx` | — |
| Rich click-opened bubble · sheet on phone | `ui/Popover.jsx` | — |
| Short hover/tap explainer (not the older `InfoTooltip.jsx`) | `ui/Tooltip.jsx` | `HandWrittenRatchet` |
| A form field's label with a «?» that opens its explanation inline under it (dashboard forms, MEH-3740) | `FieldHelpLabel.jsx` | — |
| «fill this form from text» box over a dashboard form (one engine, `form` = the field map) | `FormFillBox.jsx` | — |
| Icon button on a photo (heart, share) | `ui/overlay-icon-button.js` | — |
| «להמשיך עם Google» — our own Google button, every Google sign-in (MEH-3690) | `ui/GoogleButton.jsx` | — |
| «הוספה ליומן» for one timed slot (order / bag / group-buy pickup) | `ui/AddToCalendarButton.jsx` | — |
| «לתשלום» to the business's own prepay link (new tab, host printed under it) — a bag and a group buy (MEH-3895) | `ui/PrepayButton.jsx` (the pill look comes from `buttonLook` in `ui/Button.jsx`) | `Prepay` |
| A clock time on a 24-hour clock (hour + minute selects; `<input type="time">` shows AM/PM on an English iPhone) — every time field, `optional` for one she may leave blank | `ui/TimeOfDaySelect.jsx` | eslint `design-system/no-html-time` (MEH-3955) |
| A date and a 24-hour time in one field (the value of a `datetime-local`) | `ui/DateTimeField.jsx` | eslint `design-system/no-html-time` |
| Styled text link · pill · h1–h4 · card shell | `ui/Link.jsx`, `ui/Badge.jsx`, `ui/Heading.jsx`, `ui/Card.jsx` | `CardRadiusGuard` (radius only) |
| Loading bar / box · spinner in a button | `Skeleton.jsx` (`SkeletonBlock`), `ButtonSpinner.jsx` | `LoadingGuard` |
| Copy a link | `lib/clipboard.js` | `ClipboardGuard` |
| Masthead of an entity page | `EntityCover.jsx` | `EntityRegistryGuard` (imports only) |
| A page's contact channels (primary button + named circles) — business and organizer pages | `app/[locale]/producer/[id]/components/ContactCard.jsx` (no ready-made questions in it — MEH-3460) | `ContactCardOneOwnerGuard` (look), `ContactChannelsOneOwner` (hrefs) |
| Head of a «מה קורה» hub tab | `HubShell.jsx` | `HubShellGuard` |
| «שאלות נפוצות» under a hub list, with FAQPage JSON-LD | `HubFaq.jsx` (questions per list: `lib/hub-faq.js`) | `HubFaq` |
| A link to that «שאלות נפוצות», above the list or on an offer page | `HubFaqLink.jsx` | `HubFaqLink` |
| Print a date | `lib/format-date.js` | `DateFormatGuard` |
| «→ חזרה» to the previous page · location trail | `HistoryBackLink.jsx` · `Breadcrumb.jsx` | — |
| Horizontal chip row | `ChipScrollRow.jsx` | — |
| City / address field | `CitySearch.jsx` · `AddressSearch.jsx` | ESLint `no-restricted-syntax` |
| Several cities as chips (delivery areas, region chips, paste a whole list — MEH-3867) | `CitiesAutocomplete.jsx` (+ `cities-paste.js`) | `CitiesAutocompletePaste` |
| Image with branded fallback | `ImageWithFallback.jsx` | — |
| Landing for an email «unsubscribe» link (POST on mount, retry, token stripped) | `EmailLinkUnsubscribe.jsx` | `EmailLinkUnsubscribe` |
| Admin panel that mints + copies a signed 14-day link for a draft | `admin/AdminLinkPanel.jsx` | `AdminClaimLink` (+ `scripts/checks/clone-ratchet.sh` for copies) |
| AI suggestion button + editable preview that hands text to a field (product description, review reply) | `AiTextSuggest.jsx` | — |
| Offer page blocks, one look for a group buy and a rescue bag: pickup time under the title · «איפה ומתי» with the map · allergens · how it works (MEH-3597, MEH-3610) | `offer-detail/PickupLine.jsx` · `offer-detail/WhereSection.jsx` · `offer-detail/AllergenSection.jsx` · `offer-detail/HowSteps.jsx` | `GroupBuyBagParity` |

`Link`, `Badge`, `Heading`, `Card` have no product call sites yet (only
`app/[locale]/dev/components`, the dev-only gallery). Prefer them over new
copies, but check the look against the page you are matching.

**When none fits:** extend the owner with a prop before writing a sibling.
Copying 8+ lines from another file fails `scripts/checks/clone-ratchet.sh` (MEH-3464). A
genuinely new primitive goes in `ui/` with the `Module / Purpose / Does NOT`
header, a row here, and a guard when a hand-written copy would be easy to write.

**Rule of two (MEH-3612).** When a second feature needs to show a concept another
feature already shows (allergens, a pickup time, a price with the regular price
struck through), move that display to `ui/` with a row here **in the same PR**,
and make both features use it. Don't copy it and don't write it again in your own
words. `clone-ratchet` catches only near-verbatim copies, so a rewrite in different
words passes it. Industry practice is to extract on the third use; here a feature's
display is usually written inside its own file, where nobody searching `ui/` finds
it, so two uses is the trigger. Known copies to fold the next time one of them is
touched (21/11):
- Allergens: `public/ProductFacts.jsx:38` (reads `lib/allergens.js`) and
  `offer-detail/AllergenSection.jsx:42` (its own `allergen_${code}` lookup).
- Price with the regular price struck through: `rescue/BagRow.jsx:125`,
  `HomeWhatsOn.jsx:533`, `app/[locale]/map/components/MapRescueRow.jsx`, and
  the group-buy pages
  (`app/[locale]/group-buys/[id]/GroupBuyDetailClient.jsx:293`,
  `app/[locale]/group-buys/GroupBuysClient.jsx:105`).
- Pickup time line: `rescue/BagRow.jsx:80`, `rescue/RescueSection.jsx:163` and
  `app/[locale]/map/components/MapRescueRow.jsx`.

**Say what you checked.** A PR that adds a file under `frontend/components`,
`frontend/lib`, `frontend/hooks` or `backend/app/services` carries
`Reuse: <what it reused or extended>` or `Reuse: none fit — <what was searched>`
(this table, `docs/CODE_INDEX.md`). `scripts/checks/reuse-line-guard.sh` warns
when the line is missing.

## Conventions specific to this dir
- **Imports**: `useAuth` from `@/lib/auth-context`, `api` from `@/lib/api`.
  Translations via `useTranslations` / `useLocale` from `next-intl` — the
  only i18n mechanism (see Gotchas).
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
- **One i18n mechanism** (MEH-3139): `next-intl` only. The old
  `lib/language-context.js` (`useLanguage()`) and `lib/i18n-key-map.js` are
  deleted; `OneI18nMechanismGuard.test.js` fails if either comes back.
- **Zod before consuming an API response** (workflow rule 19) — `safeParse()`
  via `lib/schemas.js` (producer feeds, request side) or `lib/api-responses.js`
  (every other response, taken from the generated `lib/generated/api.zod.js`
  — never a hand-written field list, MEH-1748). Covers
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
