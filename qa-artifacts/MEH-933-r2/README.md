# MEH-933 R2 — /map mobile sticky-bar + near-me pill (Sapir 12/07 QA round 2)

Local Playwright vs **stubbed `/producers`** (MEH-1010 precedent), Chromium @ 390×844,
`isMobile`, `he-IL`. Full sweep also run at 360 / 375 (geometry identical).

| File | State | What it shows |
|---|---|---|
| `before-390-overlap-and-deadgap.png` | before | The two bugs: ~64px dead cream gap between the header and the city-search input, and the category chips + סינון button + zoom control overlapping the gray map canvas (hardcoded `pt-[174px]` vs a real 171px bar). |
| `after-390-peek.png` | after, PEEK | Dead gap gone (city-search sits right under the header); solid cream bar, map starts cleanly below it — no chip/zoom/pill overlap. |
| `after-390-half-pill-rides-edge.png` | after, HALF snap | "קרוב אליי" pill rides 12px above the sheet's HALF edge (measured: sheet.top 464, pill.bottom 452) — card WhatsApp button + "פרופיל מלא" fully clear. |

Measured geometry (390px):
- header 0→82 · shell starts 82 (below header, flow) · bar top-0 = 82, h 171 · map canvas starts 82+171=253 = bar bottom (no gap, no overlap).
- PEEK: `--map-sheet-h` = 14vh, pill.bottom = calc(14vh+12px) = 130.16px, 12px above the 726 edge.
- HALF: `--map-sheet-h` = 45vh, pill.bottom = 391.8px = 12px above the 464 edge.
- `--map-sheet-anim` = 300ms at rest / 0ms during drag → pill `bottom` animates in lockstep with the sheet (no teleport-over-cards on a button collapse).
