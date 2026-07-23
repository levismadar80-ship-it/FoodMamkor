# MEH-1435 — compact delivery-cities self-QA

**Data limitation (explicit):** the CC sandbox cannot reach a live preview
producer seeded with ≥12 city-only delivery areas (Railway/backend egress is
blocked — see CLAUDE.md "Known Bug Patterns"). These captures are a **faithful
markup replica** of `DeliveryBlock.jsx`'s new compact branch (MEH-1435): same
`flex flex-wrap items-center gap-x-2 gap-y-1`, same middot separator, same
Hebrew-sorted 18-city dataset, same `הצג עוד N ערים` / `הצג פחות` toggle with
Phosphor CaretDown/CaretUp, same brand tokens (primary `#2e6853`, text
`#1C1A17`, fg-muted `#5c584f`). Behavior itself is covered by unit tests in
`frontend/__tests__/DeliveryBlock.test.jsx` (sort order, ≤15 no-toggle, >15
preview+expand/collapse, aria-expanded).

| File | Viewport | State |
|---|---|---|
| `compact-375-collapsed.webp` | 375px | preview 15 + "הצג עוד 3 ערים" |
| `compact-375-expanded.webp` | 375px | all 18 + "הצג פחות" |
| `compact-1440-collapsed.webp` | 1440px | preview 15 (fewer rows) |
| `compact-1440-expanded.webp` | 1440px | all 18 |

**Verified:** no horizontal overflow at 375 or 1440 (`scrollWidth <= clientWidth`
asserted in-script); flex-wrap reflows by width; middots muted; toggle green.
