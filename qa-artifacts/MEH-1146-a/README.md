# MEH-1146 Chunk A — editorial contact card — Playwright self-QA

Driven from the CC sandbox against a local `next start` prod build with the
`/api/**` surface mocked (sandbox can't reach Vercel/Railway — MEH-360).
Chromium `/opt/pw-browsers/chromium-1194`, viewports 375×800 (mobile/tablet)
and 1280×900 (desktop), 0 page errors in every run.

## "At most one primary contact action per viewport"

Counting the contact hierarchy (`primary-contact-button` inline + sidebar,
`sticky-primary-cta`), swept across scroll fractions:

```
mobile-375  : s0=1 s0.25=1 s0.5=1 s0.75=1 s1=1
desktop-1280: s0=1 s0.5=1 s1=1
```

Never more than one. Mobile shows the inline card CTA near the top and the
sticky bar once the whole card scrolls out; desktop shows only the sticky
sidebar card CTA (inline mount `lg:hidden`, sidebar `hidden lg:block`, sticky
bar `lg:hidden`).

### Sticky-bar hide fix
`StickyContactBar` previously hid via `translateY(100%)`, which only shifts the
bar down by its own height and parks it inside the `bottom-16` gap (formerly
concealed only by BottomNav's z-1000 occlusion). Changed to
`translateY(calc(100% + 4rem))` so it clears the viewport entirely.

## Known second primary — deferred to Chunk B
`DeliveryBlock`'s green `WhatsApp` order button (`btn-whatsapp`,
`data-testid="whatsapp-cta"`) is a second primary-styled action that
co-appears with the contact CTA (desktop sidebar is always sticky-visible;
mobile mid-scroll alongside the sticky bar). Demoting it means editing the
delivery section, which is Chunk B's editorial rebuild — deferred there per
the orchestrator's decision.

## Screenshots
- `mobile-375-top.png`, `mobile-375-scrolled.png` — inline card + sticky bar
- `desktop-1280-top.png` — full sidebar card (status line, one CTA, 3 quiet
  question links led by "אפשר משלוח ל-{city}?", quiet icon row, share)
- `mobile-375-s*.png`, `desktop-1280-s*.png` — scroll sweep frames
