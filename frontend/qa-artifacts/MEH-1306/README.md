# MEH-1306 — owner section-edit loop: self-QA

Route-mocked Playwright run against a local `next start :3005` + a mock backend
on `:8000` (MEH-1210 pattern). Fixture producer id 42 (`מאפיית דנה`) with
description / 2 products / 1 image / coords; `/producers/me` serves the SAME
business with an **empty** description so the edit tab shows the MEH-1306
empty-state placeholder. Owner session = `localStorage.token` + mocked
`/auth/me` → `{role: "producer", producer_id: 42}`.

**25/25 assertions passed** (sandbox Chromium via `/opt/pw-browsers/chromium`).

| screenshot | what it shows |
|---|---|
| `owner-375.webp` | Owner @375: pencils on gallery / products / location (bio + contact pencils asserted in DOM — FadeIn sections render at opacity-0 in fullPage captures, pre-existing MEH-788 artifact) |
| `owner-1440.webp` | Owner @1440: pencils on bio/images/products/location; contact pencil hidden (`lg:hidden` inline wrapper — the sidebar card is already visible) |
| `nonowner-375.webp` / `nonowner-1440.webp` | Non-owner: **0** `section-edit-*` nodes in DOM (asserted), section ids still present |
| `edit-bio-expanded-375.webp` | Pencil click → `/producer/dashboard/edit#bio`, card auto-EXPANDED (applyHash), view-link + new empty-state placeholder visible |
| `viewlink-landing-375.webp` | Edit-tab view-link → `/producer/42#section-bio` lands with אודות + pencil right under the sticky chrome |
| `viewlink-products-landing-375.webp` | Products view-link → `#section-products` in viewport |

## Key evidence

- **Tap target**: `section-edit-bio` boundingBox `44×44` (asserted ≥44px).
- **Empty-state copy**: textarea placeholder === the locked MEH-1306 string
  (asserted verbatim).
- **Deep-link landing fix**: the first run FAILED landing assertions —
  `ProducerDetail` mounts with no `initialProducer`, so the native hash scroll
  fired before `#section-*` existed. The `useEffect` re-apply (mirror of
  edit/page.js `applyHash`) added in `ProducerDetail.jsx` turned both landing
  cases green (`y=134` / `y=150` in an 812px viewport).

Sandbox notes: Cloudinary/OSM-tile/Google-Fonts egress blocked → leaf
placeholders + blank map tiles; cookie banner overlays some captures. Neither
affects the asserted DOM/geometry.
