# Screenshot capture checklist — May 2026 (MEH-594, Sub 1/4)

> **Status:** empty directory — captures pending Smadar.
> **Why empty:** sandbox can't reach `*.vercel.app` / `mehamakor.online` (MEH-360); no headless browser in the container. STOP condition (a) of MEH-594 fires.

## What to capture (14 files)

Naming convention: `{page}-{viewport}.png` — lowercase-kebab-case per the MEH-594 spec.

```
homepage-mobile.png       — 375 × full page
homepage-desktop.png      — 1024 × full page
map-mobile.png            — 375 × first viewport (map + bottom sheet visible)
map-desktop.png           — 1024 × split view (map + right pane)
producer-id-mobile.png    — 375 × first viewport of a real producer page
producer-id-desktop.png   — 1024 × first viewport, same producer
producers-mobile.png      — 375 × first viewport of /producers (grid + chips)
producers-desktop.png     — 1024 × first viewport
register-producer-mobile.png      — 375 × Step 2 (where MEH-530 license field shows)
register-producer-desktop.png     — 1024 × Step 2
about-mobile.png          — 375 × hero + first values card
about-desktop.png         — 1024 × hero + values grid
settings-mobile.png       — 375 × tab strip + first tab content (profile)
settings-desktop.png      — 1024 × profile tab
```

## How to capture

**Mobile (375 px):**
- Chrome DevTools → Toggle device toolbar → iPhone SE (375 × 667) → reload → full-page screenshot via DevTools "Capture full size screenshot" command.

**Desktop (1024 px):**
- Resize browser to 1024 px width (or DevTools responsive mode → 1024 × 768) → full-page screenshot.

Save into this directory. Reference in the audit doc updates are not needed — the audit cites this README + the file names.

## What's in this PR vs what's pending

- ✅ This README (capture instructions).
- ⏸️ The 14 PNG files (pending).

The audit doc (`docs/audits/2026-05-homepage-discovery-audit.md`) is complete without the screenshots; visual verification is additive evidence, not a blocker for Sub 2 / Sub 3 to start.
