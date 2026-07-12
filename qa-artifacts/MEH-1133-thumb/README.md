# MEH-1133 — MapProducerCard thumbnail letterbox (Sapir 12/07 QA, item E)

Local Playwright vs stubbed `/producers`, 390×844, `he-IL`. Because the sandbox
blocks external Cloudinary egress, wide/normal sources were served from local
`/public` assets (`optimizeCloudinary` passes non-Cloudinary URLs through
unchanged), which exercises the same `onLoad` aspect path.

`after-logo-letterboxed.png` — the first card ("מהמקור לוגו") uses a wide logo
(aspect 2.65): it now renders **object-contain** (fully letterboxed on the green-50
box, whole wordmark visible) instead of cropped to "NEHA MEK".

Measured (`getComputedStyle(img).objectFit` + applied class):

| source | intrinsic aspect | result |
|---|---|---|
| logo (`/logo.png`, 2.64) | ≥ 2.0 | `object-contain` — letterboxed |
| photo (`/og-image.png`, 1.95) | < 2.0 | `object-cover` — full-bleed (unchanged) |
| imageless | — | Leaf fallback on green-50 box (untouched, MEH-1133 finding) |

Threshold `LOGO_ASPECT_MIN = 2.0` keeps normal landscape photos (≤16:9 ≈ 1.78)
full-bleed while letterboxing wide logos. Regression covered by 3 unit tests in
`__tests__/MapProducerCard.test.jsx`.
