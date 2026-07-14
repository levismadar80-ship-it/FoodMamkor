# MEH-1210 — remove price from producer discovery cards: self-QA

Route-mocked Playwright self-QA against a local `next start` (a small mock
backend on `:8000` served producer fixtures — a deliberate mix of `price_range`
/ `starting_price_label` set vs null, and long vs short descriptions so the
equal-row-height check is meaningful). Fixtures **do** carry prices in the DB
payload (`₪40-80`, `מ-25/בקבוק`, `מ-35₪`, `₪50`, `מ-₪18`, `₪30-45`) — the point
is that none of them render on the two discovery cards. `starting_price_label` /
`price_range` stay in the API payload (backend untouched).

Every run measured card heights per grid row and scanned each card's rendered
text for any price token (`₪`, and on the map also `מ-25`/`מ-35`/`בקבוק`).

| screenshot | route @width | cards | heights equal / row | price rendered |
|---|---|---|---|---|
| `producers-375.webp` | /producers @375 | 8 | ✅ (rows of 2: 294/272px) | none |
| `producers-1440.webp` | /producers @1440 | 8 | ✅ (rows of 4: 401/381px, mixed content) | none |
| `home-375.webp` | / @375 ("בתי עסק מומלצים") | 12 | ✅ (rows of 2) | none |
| `home-1440.webp` | / @1440 | 12 | ✅ (rows of 4: 333px) | none |
| `favorites-375.webp` | /favorites @375 | 6 | ✅ (1-col @mobile: 449px) | none |
| `map-375.webp` | /map @375 (mobile sheet) | 16 meta-lines | n/a (fixed 128px template) | none |
| `map-list-1440.webp` | /map @1440 (list pane) | 16 meta-lines | n/a | none |

## Key evidence

- **MEH-1142 not regressed.** On `/producers` @1440 the four cards in each row
  are pixel-identical in height (401px, then 381px) despite very different
  content — one card has a rating + two badges + a long description, another has
  only a city. Equal heights come from grid `align-items:stretch` + `h-full` on
  the `<article>`, which never depended on the removed price footer.
- **Map cards are city-only.** The `/map` list meta-lines read exactly
  `["רחובות","תל אביב","ירושלים","חיפה","צפת","מטולה","עכו","בית שאן"]` — the
  producers that in the DB carry `₪40-80` / `מ-25/בקבוק` / `מ-35₪` show **no
  price segment**. `map-list-1440.webp` shows this clearly (mobile PEEK sheet
  hides the list below the fold, so the desktop list pane is included for a
  visible card view).
- **Zero `₪` in rendered HTML** (the shekel signs that remain in the page source
  are inside the RSC data payload `<script>` — data, not UI).

Sandbox note: Cloudinary/Unsplash image egress is blocked, so the card photos
fall back to the `Leaf` + brand-name placeholder — layout/height are unaffected
(the image box keeps its fixed aspect ratio).
