# MEH-1463 — signature card clarity (eyebrow + fallback description/price)

`signature-card-375.webp` — mobile 375px, RTL. Component-markup harness of the
`hasSignature` highlight card in `ProducerSections.jsx` (the CC sandbox cannot
reach the live backend that feeds `/producer/[id]`, so this renders the exact
card DOM + design tokens rather than the live route; final mobile QA is Sapir's
on the Vercel preview per the standard flow).

- **State A** — `starting_price_label` empty (Sapir's 22/07 bug): the card now
  shows the accent eyebrow **"המוצר המוביל"**, plus the description and price of
  the matched (deduped-out) grid product — the info the dedup previously erased.
  Numeric price `25₪` is `dir="ltr"` bidi-isolated.
- **State B** — `starting_price_label` present: keeps priority, rendered exactly
  as before (no regression), no product-price fallback.
