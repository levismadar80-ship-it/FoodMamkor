# MEH-1183 — category-card bridge photos: self-QA

**Route-mocked structural QA.** `images.unsplash.com` is egress-policy-denied
from the CC sandbox (403 CONNECT — documented sandbox limitation, MEH-360
class), and `next/image` optimizes server-side, so the **real** Unsplash
photos cannot load here. These screenshots were captured against
`next start` / `next dev` with the `/_next/image` optimizer route mocked to
serve three synthetic luminance-test images (dark-bottom / light-bottom /
busy) rotated deterministically across the cards. They prove **layout,
hero split, RTL, zero-CLS, focus border, and the glyph fallback** — NOT the
real-photo appearance or pairing.

| file | what it shows |
|---|---|
| `cards-1440.webp` | desktop 2-hero + 8-small grid, RTL, numeral+name over photo |
| `cards-375.webp` | mobile: 2 full-width heroes + 2×N small, same layout |
| `cards-1440-focus.webp` | focus/selected → green `border-primary` ring visible over the photo |
| `fallback-1440.webp` | `image` removed from card 01 → meat line-art glyph renders on the warm-white panel (fallback path intact); `svgCount=2` also confirmed the drinks Leaf below the fold |

## ⚠ Legibility finding (STOP condition (c) — for Sapir on the preview)

The design is flat with **no scrim** (per spec — the deleted PREMIUM_DESIGN
65% green overlay is deliberately not reintroduced). The synthetic
**dark-bottom** test image lands on card **02 (ירקות)**: the dark
`text-text` name + gold numeral over the dark lower photo region are
**nearly illegible** — visible in `cards-1440.webp` and `cards-375.webp`.
This is the exact failure mode STOP condition (c) guards against.

Because the **real** photos are unreachable in-sandbox, real-photo
legibility CANNOT be cleared here. **Verify on the Vercel preview** (which
loads the real photos): if any real photo has a dark lower region, the
numeral/name will disappear. Per spec I did **not** add an overlay to
"fix" it — the fix (re-crop / swap photo / an approved legibility
treatment) is Sapir's call.
