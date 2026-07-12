# MEH-1142 — self-QA screenshots (card grid heights + method-hint removal)

Rendered from a **static harness** (`ProducerCard` v4 markup + the two fixed
grid wrappers) compiled against the project's real Tailwind config
(`tailwind.config.js` + `tailwind.tokens.json` + `app/globals.css`), via
Playwright/Chromium. The CC sandbox has no backend and Railway egress is
blocked (see `CLAUDE.md` "Known Bug Patterns"), so the live app can't be
driven with real producer data from here — real-app mobile QA is deferred to
the reviewer on the Vercel preview.

The harness uses cards of deliberately **varying content length** (short/long
names, with/without rating, with/without price, with/without description) so
any height drift would be visible if the fix were absent.

| File | Viewport | What it proves |
|---|---|---|
| `home-desktop-1280-equal-heights.png` | 1280 (4-col) | all cards in a row equal height (measured `[428,428,428,428]`); footer price pinned to bottom; **no method-hint icon** |
| `home-mobile-375-equal-heights.png` | 375 (2-col) | each row internally equal (`[341,341]`,`[319,319]`) |
| `favorites-desktop-1280-panel-open-no-overflow.png` | 1280 (3-col) | AlertPrefsPanel open on one card → panel renders fully below, **no overflow/clipping**; sibling cards stay equal (`621`); panel card's article yields via `flex-1` (`459`) |
| `favorites-mobile-375-panel-open.png` | 375 (1-col) | same edge-case on mobile |
