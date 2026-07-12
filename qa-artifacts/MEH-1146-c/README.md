# MEH-1146 Chunk C — discovery loop + polish — Playwright self-QA

Local `next start` prod build, `/api/**` mocked (sandbox has no backend — MEH-360).
Chromium `/opt/pw-browsers/chromium-1194`, 375×800 + 1280×900, 0 page errors.

## Automated assertions (all PASS)

```
loop shown at nearby=6:  true   (heading "עוד בתי עסק באזור")
loop hidden at nearby=3: true   (< MIN_NEARBY_BUSINESSES = 4)
one primary per viewport: 375@{0,.5,1}=1, 1280@{0,.5,1}=1
```

- **Discovery loop** ("עוד בתי עסק באזור") — frontend-only, reuses
  `GET /producers?city=…&exclude=…&limit=12` (verified support:
  `producers.py:49` — `city`/`exclude`/`limit` params) via `useProducerData`.
  Renders same-city businesses (excluding the current one) as ProducerCards,
  **only when ≥ `MIN_NEARBY_BUSINESSES = 4`** (documented const in
  `ProducerSections.jsx`), otherwise the section hides entirely.
- **Report link stays at the page end, below the loop** — verified
  deterministically in `ProducerSectionsOrder.test.jsx` (`ReportButton`
  returns null for anonymous users, so it is absent in the sandbox QA; the
  DOM-order assertion in the unit test covers it).
- **One primary per viewport still holds** — the loop's ProducerCards carry no
  competing primary CTA.

## docs/DESIGN.md
Added **§ Action hierarchy**: "Exactly one primary-styled action per viewport;
new page actions enter as tertiary by default and may be promoted only by
explicit design decision" (with the MEH-1146 producer-detail exemplar).

## Coexistence note
The category-based "עסקים דומים" (similar, MEH-102, gate ≥3, mid-page) and the
new city-based "עוד בתי עסק באזור" (gate ≥4, page-end) are intentionally
distinct dimensions (same-category recommendations vs same-area discovery),
both reusing the same producers-list API. Flagged for the reviewer in case
consolidation is preferred.

## Screenshot
- `desktop-loop-shown.png` — full-page 1280 with the discovery loop (6 cards)
  below location, contact card single primary.
