# MEH-1146 Chunk B — header + section reorder + sections — Playwright self-QA

Local `next start` prod build, `/api/**` mocked (sandbox has no backend — MEH-360).
Chromium `/opt/pw-browsers/chromium-1194`, 375×800 + 1280×900, 0 page errors.

## Automated assertions (all PASS)

```
primaryCounts: 375@{0,.5,1}=1, 1280@{0,.5,1}=1   → one primary per viewport, PAGE-WIDE
section order (top offsets): about 511 < products 639 < delivery 1182 < minimap 1936
delivery CTA: data-tone="tertiary", btn-whatsapp absent   → demoted
delivery: min_order rows (100₪/150₪) + "איסוף עצמי" pickup line rendered
signature product "גבינת עזים" rendered at products top
```

- **Page-wide one-primary now holds** — the Chunk A deferral is resolved:
  `DeliveryBlock`'s WhatsApp CTA is demoted to tertiary (neutral outline,
  `tone="tertiary"`), so it no longer competes with the contact card's single
  green primary at any scroll position.
- **Section order** = about → products → (recipes → events) → delivery →
  reviews → similar → **location (OpeningHours + Leaflet MiniMap, LAST)** →
  disclaimer → report.
- **Two-tier header**: identity line (name + verified badges) / logistics
  line (`city · category · status` on one row). Signature product moved out
  of the header to the products top. Breadcrumb only (the "→ חזרה" button
  removed).
- **Delivery** (fix 4): per-city `city · מינימום {price} · day` rows from
  `delivery_areas` via `formatPrice`. **Pickup** (fix 6): "איסוף עצמי" only
  when `pickup_points`. **Location** (fix 1): Leaflet MiniMap +
  "פתיחה במפות Google" (never a Google embed).
- **Reviews** (fixes 5+7): count in the heading + 4.8 avg summary; the single
  MEH-1139 empty box (no second box reintroduced).

## Not-verified / omitted

- **Product unit label** — `ProductOut` (backend `schemas.py:391`) exposes
  name/price_min/price_max/price_range/image_url but **no `unit` field**. Per
  confidence-calibration, the unit label is omitted (field does not exist).
  Hybrid cards = image-or-leaf placeholder + name + `formatPrice` price.

## Screenshot
- `desktop-full.png` — full-page 1280 render (sticky header/sidebar captured
  at scrolled position).
