# MEH-1461 — "נק' איסוף" → consumer language "איסוף עצמי" + 2-chip quick-row LOCK

`map-chrome-airsuf-atzmi-375.webp` — mobile 375px, RTL. Harness of the `/map`
top chrome (the CC sandbox can't SSR-populate `/map` — Leaflet + producers come
from the Railway backend, which is egress-blocked; this renders the chrome
structure + design tokens. Live `/map` + FilterSheet mobile QA is Sapir's on the
Vercel preview).

**Phase 0 finding — CASE 2.** The "נק' איסוף" element from Sapir's screenshot is
the **pickup-points map-layer toggle** in `MapPane.jsx` (MEH-1412 / MEH-1388
chunk 3) — a client-side `showSecondaryLayer` visibility toggle, **not** a
producer filter: it is not in `map-chips.js`, not in `useMapFilters` chipState,
and not counted in the FilterSheet badge. Per the pre-approved decision gate that
is CASE 2 (a pin-layer / kind label, not a filter) → **rename the consumer-facing
label to "איסוף עצמי", no structural move**.

What the screenshot shows:
- **Quick-chip row = exactly 2 chips**: [רישוי מאומת] [משלוח] (+ the "סינון"
  button). No pickup chip — the row never had one; the LOCK comment now guards it.
- **Pickup-layer button = "איסוף עצמי"** (was the data-model jargon "נקודות
  איסוף" / "נק' איסוף"). No "נק' איסוף" text on any `/map` surface.

Files: `messages/he.json` + `messages/en.json` (`map.pane.pickup_layer` label +
aria) + `lib/map-chips.js` (LOCK comment above `QUICK_CHIP_KEYS`). No backend, no
schema, no new filter, no FilterSheet relocation, no MapProducerCard (🔒 MEH-1243).
