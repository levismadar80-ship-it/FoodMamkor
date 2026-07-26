# Dashboard field-guidance audit

Read-only audit of every input field an owner can edit in the producer
dashboard (`/producer/dashboard/edit`), scoring each one against the guidance
standard below. Produced under MEH-1539 T4, after T1 (delivery), T2 (pricing)
and T3 (categories) landed — so those three cards read as `ok` here by design;
everything else is untouched observation.

**Scope:** `frontend/app/[locale]/producer/dashboard/edit/page.js` and every card
it mounts. Fields the owner cannot edit (analytics, availability, phone
verification) are out of scope — this is about *data entry*, not controls.

---

## The standard

Every new dashboard field gets, at minimum:

1. **A clear label** — what the field is, in the owner's words, not the DB
   column's. `"מספר רישיון יצרן (משרד הבריאות)"`, not `"רישיון"`.
2. **A "where it appears" line** — the surface the value shows up on, stated
   once per card (a card-level line covers all its fields) or per field where
   they differ. An owner should never have to save-and-check to find out.
3. **An example placeholder** — a real value, prefixed so it reads as an
   example (`"למשל: לחם מחמצת כוסמין"`), never a bare literal that gets typed
   in verbatim. Skip only where the input is not free text (checkbox, toggle,
   file, radio).
4. **Prefer select-from-existing over free text.** A picker with real options
   beats an open string: it teaches the vocabulary, prevents typos, and keeps
   the data joinable. The categories card is the worked example — MEH-1539 T3
   replaced a flat checkbox grid with the register `CategorySelector`, which
   carries per-category descriptions, search, and the ≤3 cap the backend
   already enforced silently.

A field missing (2) or (3) where it applies is `missing-guidance` below.
`partial` means one of the two is present and the other is not.

---

## The audit

`✓` = present · `—` = not applicable · `✗` = missing.
"Where" = a line naming the public surface the value appears on.

### Cards that meet the standard

| Field | Card | Label | Helper | Placeholder | Where | Verdict |
|---|---|---|---|---|---|---|
| gallery images | `ImagesCard` | `add_cta` (lists formats) | `tips`, `zone_full` | — | ✓ `subtitle` — gallery on the business page | ok |
| `category_ids` | `CategoriesCard` | `forms.category_selector.label` | ✓ `cap_hint` + per-category descriptions | ✓ `search_placeholder` | ✓ `subtitle` — search + map | ok |
| `description` | `DescriptionCard` | `desc_label` | — | ✓ `desc_placeholder` | ✓ `desc_where` | ok |
| `tagline` | `DescriptionCard` | `tagline_label` | — | ✓ `tagline_placeholder` | ✓ `tagline_where` — card in search/lists | ok |
| assist: sell / area / special | `DescriptionCard` | `q_*_label` | — | ✓ `q_*_placeholder` | — (input to the generator, never published) | ok |
| assist: instagram | `DescriptionCard` | `instagram_label` | ✓ `instagram_hint` | ✓ literal URL | — | ok |
| `top_product_name` | `PricingCard` | `field_top_product` | ✓ `scope_helper` | ✓ `top_product_placeholder` | ✓ `scope_helper` — highlighted card atop the product list | ok |
| `price_range` | `PricingCard` | `field_price_range` | ✓ `price_hint` | ✓ `price_range_placeholder` | ✓ `scope_helper` | ok |
| owner name | `OwnerStoryCard` | `contact_label` | — | ✓ `contact_placeholder` | ✓ `intro` + placeholder text | ok |
| owner photo | `OwnerStoryCard` | `photo_label` | — | — | ✓ `intro` — "מאחורי העסק" card | ok |
| `owner_bio` | `OwnerStoryCard` | `bio_label` | — | ✓ `bio_placeholder` | ✓ `bio_where` | ok |
| kashrut type | `KashrutCard` | `select_label` | — | ✓ `select_placeholder` | ✓ `intro` — badge on the business page | ok |
| kashrut certificate | `KashrutCard` | `upload_label` (format + size) | ✓ `filter_hint` — unlocks the כשר filter | — | ✓ `intro` | ok |
| address | `LocationCard` | `heading` | ✓ `current_prefix` | — | ✓ `subtitle` — position on the map | ok |
| `has_physical_location` | `DeliveryCard` | ✓ | ✓ `scope_helper` | — | ✓ `scope_helper` (MEH-1540) | ok |
| `offers_delivery` | `DeliveryCard` | ✓ | ✓ `scope_helper` | — | ✓ | ok |
| `delivery_nationwide` | `DeliveryCard` | ✓ | ✓ | — | ✓ | ok |
| delivery cities | `DeliveryCard` | `delivery_cities_label` | ✓ `scope_helper` | — | ✓ | ok |
| excluded cities | `DeliveryCard` | `delivery_excluded_label` (mode-explicit, MEH-1540) | ✓ `delivery_excluded_hint` | — | ✓ | ok |
| opening hours (7 rows) | `HoursCard` → `HoursEditor` | `from_label` / `to_label` + per-day aria | ✓ `preset`, `invalid_range`, `unparseable` | — | ✓ `subtitle` | ok |
| `phone` | `ContactChannelsCard` | `field_phone` | ✓ `phone_field_helper` | ✗ | ✓ `subtitle` | ok |
| `external_order_form` | `ContactChannelsCard` | `field_external_order` | ✓ `WhatsThis order_form` | ✗ | ✓ `subtitle` | ok |
| primary channel | `ContactChannelsCard` | `primary_legend` | ✓ `WhatsThis` + `hint_empty` | — | ✓ `subtitle` — the big button | ok |
| custom questions ×5 | `CustomQuestionsCard` | numbered rows | ✓ `tooltip` + `guidance` | ✓ `placeholder_1..5` | ✓ `context_line` | ok |
| diet chips ×4 | `ProductsSection` | `diet_*` | ✓ `diet_helper` | — | ✓ `diet_helper` — search + map filters | ok |
| `kind` | `LocationsEditor` | ✓ `kind_label` | ✓ `kind_helper` — one line per option (סניף / נקודת איסוף / דוכן שוק) | — (select) | ✓ `intro` (MEH-1563) | ok |
| `precision` | `LocationsEditor` | ✓ `precision_label` | ✓ `precision_helper` — names what the customer sees per option | — (select) | ✓ `intro` | ok |
| `label` | `LocationsEditor` | ✓ `label_label` | ✓ `label_hint` — "השם שהלקוחות יראו לצד הנקודה" | ✓ `label_placeholder` | ✓ `intro` | ok |
| `city` | `LocationsEditor` | ✓ | ✓ `place_hint_exact` / `place_hint_approximate` — precision-aware, switches live with the select (MEH-1579) | ✓ `city_placeholder` | ✓ the same precision-aware hint + `intro` | ok |
| `address` | `LocationsEditor` | ✓ | ✓ `place_hint_exact` / `place_hint_approximate` — names that משוער hides the full address (MEH-1579) | ✓ `address_placeholder` | ✓ the same precision-aware hint + `intro` | ok |
| `phone` | `LocationsEditor` | ✓ | — | ✓ `phone_placeholder` | ✓ `intro` | ok |
| `lat` / `lng` | `LocationsEditor` | ✓ | ✓ `coords_hint` — optional escape hatch, behind the collapsed `coords_summary` disclosure | — (numeric escape hatch) | ✓ `intro` | ok |
| `hours` | `LocationsEditor` | ✓ `hours_label` | — still free text, while `HoursCard` next door is a structured editor (unchanged by MEH-1563) | ✓ `hours_placeholder` | ✓ `intro` | ok |

### Gaps

| Field | Card | Label | Helper | Placeholder | Where | Verdict |
|---|---|---|---|---|---|---|
| `producer_license` | `LicenseCard` | ✓ `field_label` | ~ `required_hint` **only when a category demands it** | ✗ | ✗ — never says whether the number is shown publicly or used for the ✓ badge | missing-guidance |
| `is_vegan` / `is_vegetarian` / gluten facility | `DietaryScopeCard` | ✓ (questions) | ~ `helper` says answers are cross-checked | — | ✗ — no line on which filters/badges the answers drive | missing-guidance |
| product `name` | `ProductsSection` | ✓ `name_label` | ✗ | ✓ `name_placeholder` | ✗ | partial |
| product `description` | `ProductsSection` | ✓ | ✗ | ✓ `description_placeholder` | ✗ | partial |
| `price_min` | `ProductsSection` | ✓ | ✓ `price_hint` | ✗ | ✗ | partial |
| `price_max` | `ProductsSection` | ✓ + optional suffix | ✓ `price_hint` | ✗ | ✗ | partial |
| product image | `ProductsSection` | ✓ `image_label` | ✗ | — | ✗ | missing-guidance |
| `instagram` | `ContactChannelsCard` | ✓ (label carries the format) | ✗ | ✗ | ✓ card-level | partial |
| `website` | `ContactChannelsCard` | ✓ | ✗ | ✗ | ✓ card-level | partial |
| `whatsapp_group` | `ContactChannelsCard` | ✓ | ✗ | ✗ | ✓ card-level | partial |
| `contact_email` | `ContactChannelsCard` | ✓ | ✗ | ✗ | ✓ card-level | partial |
| `facebook` | `ContactChannelsCard` | ✓ | ✗ | ✗ | ✓ card-level | partial |

---

## What the gaps say

**`LocationsEditor` was the worst surface, by a distance — closed by MEH-1563.**
At audit time 9 of its 9 form fields were label-only, and it was the only card
with no card-level intro at all: nothing told an owner what a "תווית" was, what
changed when they picked `משוער` over `מדויק`, or where any of it rendered. Two
of its fields (`lat` / `lng`) asked for raw coordinates with no explanation.
MEH-1563 added the card intro (what a location point is + that it renders on the
business page and the map with tap-to-navigate), per-option helpers on `kind` and
`precision`, hints + example placeholders on the free-text fields, and moved
`lat` / `lng` behind a collapsed "קואורדינטות ידניות" disclosure (the MEH-1242
PR2 pattern). Its rows now sit in the standard-met table above. **Not** changed:
`hours` is still free text rather than the structured `HoursEditor` next door —
that is a data-model question, not a guidance gap, and needs its own ticket.

**`ProductsSection` has good placeholders and no "where" line anywhere.** The
diet chips are the exception — `diet_helper` names the filters they drive, and
it is the pattern the rest of the card should copy.

**`ContactChannelsCard` is card-level-only.** The subtitle covers where the
channels appear, which is legitimate under the standard, but 5 of the 7 URL
fields have no placeholder — and these are exactly the fields where owners
paste the wrong thing (a profile handle into a URL field, a personal number
into the group link).

**Two cards explain the mechanism but not the payoff.** `LicenseCard` and
`DietaryScopeCard` both tell the owner what will be *done* with the value
(a category requires it; the answers get cross-checked) without telling them
what they *get* — the verification badge, the diet filters. That is the
"where it appears" line in a different disguise.

---

## Method + limits

Enumerated by reading every card mounted in `edit/page.js` (`ImagesCard`,
`CategoriesCard`, `DescriptionCard`, `ProductsSection`, `PricingCard`,
`OwnerStoryCard`, `LicenseCard`, `KashrutCard`, `DietaryScopeCard`,
`LocationCard`, `DeliveryCard`, `HoursCard`, `ContactChannelsCard`,
`CustomQuestionsCard`) plus `LocationsEditor` and `HoursEditor`, and
cross-reading their i18n namespaces in `frontend/messages/he.json`.

Verdicts are a judgement against the standard above, not a measurement — a
reviewer may reasonably disagree on any `partial`. Nothing here was changed:
this document is the audit only, and each gap needs its own ticket.
