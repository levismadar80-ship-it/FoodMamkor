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
| assist: instagram | `DescriptionCard` | `instagram_label` — username framing (MEH-1608) | ✓ `instagram_hint` | ✓ `instagram_placeholder` — bare handle (was a hardcoded literal URL, the exact shape that broke the public link) | — | ok |
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
| `producer_license` | `LicenseCard` | ✓ `field_label` | ~ `required_hint` when a category demands it | — (regulated number, no example) | ✓ `where` (MEH-1597) — kept on file only, never shown publicly | ok |
| `is_vegan` / `is_vegetarian` / gluten facility | `DietaryScopeCard` | ✓ (questions) | ✓ `helper` + `scope_helper` (MEH-1597) | — (radio) | ✓ `scope_helper` — the search filters they drive | ok |
| product `name` | `ProductsSection` | ✓ `name_label` | — | ✓ `name_placeholder` | ✓ card-level `where` (MEH-1597) | ok |
| product `description` | `ProductsSection` | ✓ `description_label` | — | ✓ `description_placeholder` | ✓ card-level `where` | ok |
| `price_min` | `ProductsSection` | ✓ `price_min_label` | ✓ `price_hint` | ✓ `price_min_placeholder` (MEH-1597) | ✓ card-level `where` | ok |
| `price_max` | `ProductsSection` | ✓ + optional suffix | ✓ `price_hint` | ✓ `price_max_placeholder` (MEH-1597) | ✓ card-level `where` | ok |
| product image | `ProductsSection` | ✓ `image_label` | — | — (file) | ✓ card-level `where` | ok |
| `instagram` | `ContactChannelsCard` | ✓ | — | ✓ `instagram_placeholder` — bare handle (MEH-1597) | ✓ card-level `subtitle` | ok |
| `website` | `ContactChannelsCard` | ✓ | — | ✓ `website_placeholder` | ✓ card-level | ok |
| `whatsapp_group` | `ContactChannelsCard` | ✓ | — | ✓ `whatsapp_group_placeholder` | ✓ card-level | ok |
| `contact_email` | `ContactChannelsCard` | ✓ | — | ✓ `email_placeholder` | ✓ card-level | ok |
| `facebook` | `ContactChannelsCard` | ✓ | — | ✓ `facebook_placeholder` | ✓ card-level | ok |

### Gaps

**None open.** The twelve rows below were the audit's remaining gaps; MEH-1597
closed all of them in one batch. They are kept here as the record of what was
missing and what closed it — the live verdicts are in the standard-met table
above.

| Field | Card | What was missing | Closed by |
|---|---|---|---|
| `producer_license` | `LicenseCard` | no "where" line — never said whether the number is shown publicly | ✓ `where` — states it is kept on file only and never shown. Deliberately silent on the ✓ badge: filling the number does not grant it (admin-granted after document review, ADR-022), and the earlier framing of this row conflated the two |
| `is_vegan` / `is_vegetarian` / gluten facility | `DietaryScopeCard` | `helper` gave the mechanism (answers are cross-checked), never the payoff | ✓ `scope_helper` — names the search filters the answers drive and that they read as the owner's own declaration |
| product `name` | `ProductsSection` | no "where" | ✓ card-level `where` |
| product `description` | `ProductsSection` | no "where" | ✓ card-level `where` |
| `price_min` | `ProductsSection` | no placeholder, no "where" | ✓ `price_min_placeholder` + card-level `where` |
| `price_max` | `ProductsSection` | no placeholder, no "where" | ✓ `price_max_placeholder` + card-level `where` |
| product image | `ProductsSection` | no "where" | ✓ card-level `where` |
| `instagram` | `ContactChannelsCard` | no placeholder | ✓ `instagram_placeholder` — a **bare handle**, not a URL: `ContactCard.jsx:105-106` composes the URL itself, so a URL here would render a doubled, dead link. Since MEH-1608 the server also normalizes URL/@ input to a bare handle on every producer write schema (`_normalize_instagram`, schemas.py) |
| `website` | `ContactChannelsCard` | no placeholder | ✓ `website_placeholder` — full URL, matching `_url_scheme_validator` |
| `whatsapp_group` | `ContactChannelsCard` | no placeholder | ✓ `whatsapp_group_placeholder` — the `https://chat.whatsapp.com/…` shape its validator requires |
| `contact_email` | `ContactChannelsCard` | no placeholder | ✓ `email_placeholder` |
| `facebook` | `ContactChannelsCard` | no placeholder | ✓ `facebook_placeholder` — full URL, matching `_url_scheme_validator` |

**One documented deviation from standard item 3.** The five ContactChannels
placeholders carry no `לדוגמה:` prefix, unlike every other placeholder in the
dashboard. Measured at 375px: with the prefix, `whatsapp_group` needed 330px of
a 277px usable width and `facebook` 320px — both clipped. The
`https://chat.whatsapp.com/` host alone is 26 of roughly 36 available
characters, so the prefix cannot coexist with the shape the validator demands.
All five inputs are also `dir="ltr"`, where a Hebrew prefix reorders under bidi.
Without the prefix all five clear their width (47–163px of headroom). Reverting
this needs either a shorter host or a wider field, not a copy tweak.

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

---

## Confusion matrix (MEH-1827)

A different question from the audit above. That one asked *"does this field have
guidance"*, one field at a time. This one asks **"which fields get mistaken for
each other"** — pairs and clusters that share semantic space with no clear
boundary between them. A field can score `ok` above and still sit at risk `H`
here: `order_window` has a helper, a "where" line *and* a WhatsThis (MEH-1773),
and the founder still could not tell it from the availability card. That is the
finding this section exists to record.

**Method.** Read-only. The row set is exactly `_PRODUCER_WRITABLE_FIELDS`
(`backend/app/routers/producer_me.py:261-332`) — every field an owner can write
through `PUT /producers/me`. Nothing here was changed; a field that looks like
it needs a fix gets a recommendation cell, not a PR.

**Columns.** `layer` is one of schedule · exception · override · scope ·
pricing · other. `edited-at` is where the owner actually types the value —
**"אין עורך בדשבורד"** means the field is writable through the API but has no
control anywhere in `/producer/dashboard`. `displayed-at` is the public
surface; **"לא ידוע"** means no renderer was found, not that none exists.
`WT` = a `<WhatsThis>` is mounted on that field's card (5 exist repo-wide;
3 land on fields in this table).

### The 44 rows

| # | field | DB column | layer | edited-at (file:line) | displayed-at (public) | confusion partners | risk | recommendation | WT |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `name` | `producers.name` | other | אין עורך בדשבורד — נכתב בהרשמה בלבד, `register/producer/RegisterProducerClient.jsx:532` | `ProducerHeader.jsx:165` | `contact_name` | M | שם העסק מול שם בעלת העסק — שני "שם". אין מסלול שינוי-שם עצמאי; להוסיף או לומר במפורש למי לפנות | ✗ |
| 2 | `contact_name` | `producers.contact_name` | other | `cards.jsx:928` (OwnerStoryCard) | `OwnerCard.jsx:31` | `name`, `owner_bio` | M | הלייבל כבר מפריד; לשמור את הניגוד "העסק / בעלת העסק" מפורש בשני הכרטיסים | ✗ |
| 3 | `description` | `producers.description` | other | `cards.jsx:707` (DescriptionCard) | `ProducerSections.jsx:141` | `short_description` | M | שני שדות תיאור שנבדלים רק באורך ובמשטח — לציין את שני המשטחים בשני השדות | ✗ |
| 4 | `short_description` | `producers.short_description` | other | `cards.jsx:711` | `ProducerHeader.jsx:175` · `ProducerCard.jsx:206` | `description`, `top_product_name` | M | `ProducerCard.jsx:206` נופל חזרה ל-`top_product_name` כשזה ריק — שני שדות מזינים תא אחד בכרטיס | ✗ |
| 5 | `city` | `producers.city` | scope | `cards.jsx:473` (LocationCard) | `ProducerHeader.jsx:222` | `address`, `LocationPoint.city`, `delivery_area_cities` | H | **שלושה "עיר" נפרדים** — עיר העסק · עיר של נקודת מיקום · עיר משלוח. כל לייבל חייב לומר איזה מהם | ✗ |
| 6 | `address` | `producers.address` | scope | אין עורך בדשבורד — הרשמה בלבד (`RegisterProducerClient.jsx:542`); LocationCard שומר lat/lng/city בלבד (`cards.jsx:505-508`) | אין (פרטי, MEH-829) | `city`, `LocationPoint.address` | M | כתיב-בלבד דרך ה-API בלי עורך. או לחשוף עורך, או להוציא מ-`_PRODUCER_WRITABLE_FIELDS` | ✗ |
| 7 | `lat` | `producers.lat` | scope | `cards.jsx:472` (LocationCard) | `ProducerSections.jsx:519` (מפה) | `lng`, `LocationPoint.lat` | L | נגזר מבחירת כתובת, לא מוקלד — תקין | ✗ |
| 8 | `lng` | `producers.lng` | scope | `cards.jsx:473` | `ProducerSections.jsx:520` | `lat`, `LocationPoint.lng` | L | כנ"ל | ✗ |
| 9 | `phone` | `producers.phone` | other | `page.js:1205` (ContactChannelsCard) | `ContactCard.jsx:314` | `LocationPoint.phone`, `whatsapp_group` | M | טלפון העסק מול טלפון פר-נקודה — לומר בלייבל של LocationsEditor שזה גובר/משלים | ✗ |
| 10 | `instagram` | `producers.instagram` | other | `page.js:1205` | `ContactCard.jsx:108` | `website`, `facebook` | L | handle בלבד; מנורמל בשרת (`_normalize_instagram`) | ✗ |
| 11 | `website` | `producers.website` | other | `page.js:1205` | `ContactCard.jsx:114` | `external_order_form` | M | שני שדות URL — "אתר" מול "טופס הזמנות". ה-WhatsThis יושב רק על השני | ✗ |
| 12 | `whatsapp_group` | `producers.whatsapp_group` | other | `page.js:1215` | `ContactCard.jsx:125` | `phone` (ערוץ וואטסאפ), `primary_contact_method` | M | "וואטסאפ" מופיע כערוץ אישי וכקבוצה — הלייבל חייב לומר "קבוצה" | ✗ |
| 13 | `primary_contact_method` | `producers.primary_contact_method` | other | `page.js:1205` | `PrimaryContactButton.jsx:22` | כל שדות הערוצים | M | בורר שמצביע על שדה אחר — ה-WhatsThis הקיים מכסה | ✓ |
| 14 | `contact_email` | `producers.contact_email` | other | `page.js:1216` | `ContactCard.jsx:118` | `users.email` (אימייל התחברות) | M | אימייל ציבורי מול אימייל חשבון — הלייבל לא אומר שזה לא אימייל ההתחברות | ✗ |
| 15 | `facebook` | `producers.facebook` | other | `page.js:1205` | `ContactCard.jsx:120` | `instagram`, `website` | L | תקין | ✗ |
| 16 | `external_order_form` | `producers.external_order_form` | other | `page.js:1218` | `ContactCard.jsx:121` | `website`, `order_window` | M | "טופס הזמנות" מול "חלון הזמנות" — שתי מילות "הזמנות" שונות לגמרי (קישור מול לו"ז) | ✓ |
| 17 | `slug` | `producers.slug` | other | אין עורך בדשבורד — לקריאה בלבד ב-`dashboard/page.js:25` (VanityLinkCard) | כתובת `/p/<slug>` | `name` | L | כתיב דרך ה-API, קריאה-בלבד ב-UI. פער מכוון או שכחה — להכריע | ✗ |
| 18 | `top_product_name` | `producers.top_product_name` | pricing | `cards.jsx:1129` (PricingCard) | `ProducerSections.jsx:110` | `starting_price_label`, `price_range`, `Product.name` | H | **טקסט חופשי שחייב להתאים בדיוק לשם מוצר** כדי להתקשר אליו (`ProducerSections.jsx:112` משווה מחרוזות) — להחליף בבורר מתוך המוצרים הקיימים (תקן פריט 4) | ✗ |
| 19 | `starting_price_label` | `producers.starting_price_label` | pricing | אין עורך בדשבורד | `ProducerSections.jsx:129` | `price_range`, `Product.price_min` | M | כתיב-בלבד בלי עורך, וחופף ל-`price_range`. שני שדות מחיר-פתיחה חופשיים | ✗ |
| 20 | `price_range` | `producers.price_range` | pricing | `cards.jsx:1130` (PricingCard) | `ProducerSections.jsx:241` | `starting_price_label`, `Product.price_range` | H | טווח ברמת העסק מול טווח ברמת המוצר — שם זהה, מקור אחר | ✗ |
| 21 | `owner_bio` | `producers.owner_bio` | other | `cards.jsx:922` | `OwnerCard.jsx:35` | `description` | M | "סיפור בעלת העסק" מול "תיאור העסק" — שניהם טקסט חופשי ארוך | ✗ |
| 22 | `owner_photo_url` | `producers.owner_photo_url` | other | `cards.jsx:935` | `OwnerCard.jsx:36` | `images` | M | תמונת בעלת העסק מול גלריית העסק — שני מעלי-תמונה | ✗ |
| 23 | `grass_fed` | `producers.grass_fed` | scope | אין עורך בדשבורד — אדמין בלבד (`admin/ProducerForm.jsx`) | צ'יפ פילטר ב-`/map` (`FilterSheet.jsx:33`) | `organic_certified`, צירי התזונה | M | תכונה שמסננת חיפוש ושבעלת העסק לא יכולה להצהיר עליה בעצמה | ✗ |
| 24 | `organic_certified` | `producers.organic_certified` | scope | אין עורך בדשבורד — אדמין בלבד | ה-badge **הוסר** (`badges.js:73`, MEH-1259); נשאר בר-סינון | `grass_fed`, `kosher` | M | כתיב + סינון בלי badge ובלי עורך — שריד. להכריע אם נשאר | ✗ |
| 25 | `vegan_scope` | `producers.vegan_scope` | scope | `DietaryScopeCard.jsx:55` | לא ידוע (לא נמצא רינדור ישיר; לפי `scope_helper` מזין פילטרי חיפוש) | `vegetarian_scope`, דגלי הטבעונות ברמת המוצר | H | **הצהרה ברמת העסק מול פילטר any-product** (MEH-293) — שני מנגנונים לאותה מילה. חוזה ה-scope: `.claude/rules/labels.md` | ✗ |
| 26 | `vegetarian_scope` | `producers.vegetarian_scope` | scope | `DietaryScopeCard.jsx:56` | לא ידוע | `vegan_scope`, דגלי המוצר | H | כנ"ל | ✗ |
| 27 | `gluten_free_facility` | `producers.gluten_free_facility` | scope | `DietaryScopeCard.jsx:57` | `ProducerHeader.jsx:274,282` | `lactose_free_facility`, דגל הגלוטן במוצר | H | ציר מתקן (dedicated/shared) מול דגל מוצר — היחיד מהארבעה שמרונדר | ✗ |
| 28 | `lactose_free_facility` | `producers.lactose_free_facility` | scope | אין עורך בדשבורד — DietaryScopeCard מכסה vegan/vegetarian/gluten בלבד | לא ידוע | `gluten_free_facility` | H | **ציר המתקן היחיד בלי עורך ובלי רינדור** — כתיב דרך ה-API (`schemas.py:1355`) ותו לא. להשלים או להסיר | ✗ |
| 29 | `has_delivery` | `producers.has_delivery` | scope | אין עורך בדשבורד | — | `offers_delivery`, `delivery_areas`, `delivery_nationwide` | H | **הפילטר הציבורי לא קורא את העמודה.** `producer_listing.py:382` בודק `Producer.delivery_areas.any()` ולא את `has_delivery`. עמודה מתה שנראית חיה. אותה שורה בדיוק היא הפער של MEH-1822 (עסק ארצי לא נתפס) | ✗ |
| 30 | `pickup_points` | `producers.pickup_points` | scope | אין עורך בדשבורד | `ProducerSections.jsx:412,418` | `LocationPoint.kind="pickup"` (LocationsEditor) | H | **בוליאני וטבלה מובנית תובעים את אותו מושג** "נקודות איסוף". בעלת עסק שמוסיפה נקודה ב-LocationsEditor לא מדליקה את הבוליאני | ✗ |
| 31 | `has_physical_location` | `producers.has_physical_location` | scope | `cards.jsx:1622` (DeliveryCard) | `ProducerSections.jsx:46` · `ProducerCard.jsx:382` | `offers_delivery` (CHECK ב-`models.py:388`), `city`, `lat` | M | זוג בוליאנים עם CHECK — ה-`scope_helper` מסביר; תקין | ✗ |
| 32 | `offers_delivery` | `producers.offers_delivery` | scope | `cards.jsx:1622` | `ProducerSections.jsx:410` | `has_delivery`, `delivery_nationwide` | H | **שני בוליאנים למושג אחד** — `offers_delivery` (NOT NULL, ב-CHECK) הוא האמיתי; `has_delivery` (שורה 29) שריד | ✗ |
| 33 | `delivery_nationwide` | `producers.delivery_nationwide` | scope | `cards.jsx:1622` | `ProducerSections.jsx:415` | `delivery_excluded_cities`, `delivery_area_cities` | M | XOR מול רשימת ערים, נאכף ב-CHECK — הכרטיס מסביר | ✗ |
| 34 | `delivery_excluded_cities` | `producers.delivery_excluded_cities` | scope | `cards.jsx:1630` | `ProducerSections.jsx:416` | `delivery_nationwide`, `delivery_area_cities` | M | רשימת ערים שמשמעה ההפוכה מרשימת הערים שלידה — הלייבל מצב-מפורש (MEH-1540) מכסה | ✗ |
| 35 | `opening_hours` | `producers.opening_hours` | **schedule** | `cards.jsx:1221` (HoursCard → HoursEditor) | `ProducerSections.jsx:512` | `order_window`, `availability_state`, `LocationPoint.hours` | H | **אשכול הזמן** — ראו למטה. בנוסף: `LocationPoint.hours` הוא טקסט חופשי בזמן שזה עורך מובנה | ✗ |
| 36 | `order_window` | `producers.order_window` | **schedule** | `OrderWindowEditor.jsx:37`, ממוסגר ב-`edit/page.js:1013` | `ProducerHeader.jsx:120` · `OrderWindowStrip.jsx` | `opening_hours`, `availability_state`, `external_order_form` | H | **אשכול הזמן** — יש לו helper, "איפה", ו-WhatsThis, והבלבול נשאר. הבעיה מבנית, לא copy (MEH-1830) | ✓ |
| 37 | `kosher` | `producers.kosher` | scope | `cards.jsx:1467` (KashrutCard) | `ProducerHeader.jsx:266` — **מאומת בלבד** | `producer_license_number`, `organic_certified` | M | טקסט חופשי שמוצג רק אחרי אימות אדמין (MEH-986) — הכרטיס אומר זאת | ✗ |
| 38 | `producer_license_number` | `producers.producer_license_number` | other | `cards.jsx:1240` (LicenseCard) | לעולם לא מוצג (נשמר בתיק, MEH-1597) | תעודת כשרות, badge "מאומת" (`badges.js:54`) | M | מילוי המספר **לא** מעניק את ה-✓ (אדמין מעניק, ADR-022) — ה-`where` כבר מפריד | ✗ |
| 39 | `is_available_today` | `producers.is_available_today` | **override** | אין עורך בדשבורד — נכתב בכפל ע"י endpoint הזמינות (`models.py:202-209`; Phase 4 יפיל אותו) | `ProducerCard.jsx:39,461` (מצב שישי) | `availability_state`, `order_window`, `opening_hours` | H | **שני מסלולי כתיבה למושג אחד** — ה-UI כותב `availability_state`, וה-PUT עדיין מקבל את העמודה הישנה ישירות. `PUT /producers/me {is_available_today}` יכול לסתור את ה-enum | ✗ |
| 40 | `images` | `producers.images` | other | `cards.jsx:231` (ImagesCard) | `ProducerDetail.jsx:102` · `ProducerCard.jsx:172` | `owner_photo_url`, `Product.image` | M | שלושה מעלי-תמונה נפרדים בדשבורד | ✗ |
| 41 | `custom_questions` | `producers.custom_questions` | other | `page.js:1105` (CustomQuestionsCard) | `ContactCard.jsx:255` → `WhatsAppQuestionChips` | — | L | תקין — `context_line` מציין את המשטח | ✗ |
| 42 | `established_year` | `producers.established_year` | other | `cards.jsx:933` (OwnerStoryCard) | `ProducerHeader.jsx:241` | — | L | תקין | ✗ |
| 43 | `delivery_fee` | `producers.delivery_fee` | **pricing** | `cards.jsx:1635` (DeliveryCard) | `DeliveryBlock.jsx:357` | `delivery_areas.delivery_fee` (דריסה פר-עיר), `free_delivery_above` | H | **אשכול המשלוחים** — ראו למטה. ברירת מחדל עסקית מול ערך פר-עיר, אותו שם | ✗ |
| 44 | `free_delivery_above` | `producers.free_delivery_above` | **pricing** | `cards.jsx:1636` | `DeliveryBlock.jsx:385` | `delivery_fee`, `delivery_areas.min_order` | M | "מעל X חינם" מול "מינימום הזמנה X" — שני סכומי-סף על אותה עסקה | ✗ |

**Row count: 44. `len(_PRODUCER_WRITABLE_FIELDS)` = 44.**

### Adjunct fields — related, deliberately NOT counted above

These share the clusters but are **not** in `_PRODUCER_WRITABLE_FIELDS`, so they
are excluded from the count assertion. They are listed because the confusion is
between a counted field and one of these as often as between two counted ones.

| field | where it lives | why it is not a row | its partner in the table |
|---|---|---|---|
| `availability_state` | `producers.availability_state` (`models.py:210`); written by `POST /producers/me/availability-state`, edited at `dashboard/page.js:552` | separate endpoint, not the PUT whitelist | `order_window` (36), `opening_hours` (35), `is_available_today` (39) |
| `vacation_until` | `producers.vacation_until`; same endpoint | כנ"ל | `availability_state` |
| `delivery_area_cities` | popped before the whitelist (`producer_me.py:335`) | handled by `_sync_delivery_areas`, not `setattr` | `delivery_nationwide` (33), `city` (5) |
| `delivery_areas` | popped at `producer_me.py:339`; rows in a child table | כנ"ל | `delivery_fee` (43), `pickup_points` (30) |
| `category_ids` | popped at `producer_me.py:334` | child table | — |

### Seed cluster 1 — זמן (the founder-reported one)

Three concepts, three editors, **two different pages**, and only one of the
three is a `_PRODUCER_WRITABLE_FIELDS` neighbour of the others:

| concept | field | layer | edited at |
|---|---|---|---|
| מתי העסק פתוח פיזית | `opening_hours` | schedule | `edit/page.js:994` — HoursCard |
| מתי מקבלים הזמנות (לו"ז שבועי קבוע) | `order_window` | schedule | `edit/page.js:1013` — OrderWindowEditor |
| חריג זמני שגובר על הלו"ז | `availability_state` *(adjunct)* | override | **`dashboard/page.js:552`** — עמוד אחר |
| שריד של הקודם | `is_available_today` | override | אין עורך; כתיבה כפולה |

**Risk H, and copy has already been tried.** MEH-1773 added a `WhatsThis` to
both `order_window` (`edit/page.js:1030`) and `availability_state`
(`dashboard/page.js:563`), each naming the half the other does not — and the
founder still could not tell them apart on 02/08. The two comments in the code
even acknowledge the split explicitly ("its twin sits on the availability card").

The structural reading: the *override* is on the hub page while both *schedules*
are on the edit tab, so an owner never sees the three together and has no
surface on which the distinction could be drawn. Recommendation is co-location
(MEH-1830) plus renaming the override to a state rather than an abstract noun —
`is_available_today` (row 39) should go with Phase 4 rather than stay writable
alongside the enum that replaced it.

### Seed cluster 2 — משלוחים

Three layers, and the confusion runs *across* them rather than within:

| layer | fields | the boundary problem |
|---|---|---|
| scope — לאן | `offers_delivery` · `has_delivery` · `delivery_nationwide` · `delivery_excluded_cities` · `delivery_area_cities` *(adjunct)* | **two booleans for "does this business deliver"** (rows 29, 32), and the public `?has_delivery=` filter reads *neither* — it tests for `delivery_areas` rows (`producer_listing.py:382`) |
| rows — פר עיר | `delivery_areas` *(adjunct)* — city · min_order · delivery_day · delivery_fee | carries its **own** `delivery_fee`, same name as the business-level one |
| pricing — כמה | `delivery_fee` (43) · `free_delivery_above` (44) | business default vs per-city override; inheritance is real logic, not a label problem |

`pickup_points` (row 30) sits at the edge of this cluster and duplicates
`LocationPoint.kind="pickup"`.

**The single highest-value finding in this section is row 29**, because it is
the only one where the confusion has already produced a measurable public bug:
`producer_listing.py:382` is the same line
[docs/audits/2026-08-business-shape-matrix.md](./2026-08-business-shape-matrix.md)
identifies as the reason a nationwide business is missed by the "משלוחים"
filter. A dead scope column and a filter that ignores it are the same defect
seen from two directions.

### What the matrix says

**Guidance is not the binding constraint any more.** Of the 44 fields, the ones
at risk `H` mostly *have* labels, helpers and "where" lines — `order_window` has
all three plus a WhatsThis. What they lack is a boundary: another field claims
the same words (`הזמנות` in rows 16 and 36; `עיר` in row 5; `נקודות איסוף` in
row 30), or the same concept has two owners (rows 29/32, rows 30, row 39).
MEH-1539's standard fixes a field in isolation; nothing in it detects a pair.

**Ten of the 44 are writable with no editor anywhere in the dashboard** —
rows 1, 6, 17, 19, 23, 24, 28, 29, 30, 39. Each is a silent invitation to
drift: the API accepts a value that no UI can produce and, in the case of row
29, that no reader consults. This is the "two parallel mechanisms" smell from
`.claude/rules/workflow.md` § Architectural smell detection, and each one should
resolve to a single owner — expose an editor, or remove the write path.

**Three fields render nowhere findable** — rows 25, 26, 28 (`vegan_scope`,
`vegetarian_scope`, `lactose_free_facility`). Marked `לא ידוע` rather than
"unused": the diet scopes are documented as filter inputs, and absence of a
grep hit is not absence of a surface (CLAUDE.md § "evidence of PRESENCE, never
of ABSENCE"). Confirming them needs a run against the live filter, not another
read.

### Limits

Read-only, single pass, no execution. `displayed-at` was established by grep
over `frontend/app/[locale]/producer/[id]/`, `frontend/components/` and
`frontend/lib/badges.js`; a surface reached through an indirection those
patterns miss would read as `לא ידוע` here. Risk letters are a judgement, not a
measurement — the ordering within a tier is not meaningful, and a reviewer may
reasonably move any single field one tier. Line numbers are as of the commit
this section landed on; they drift.
