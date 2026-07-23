# QA sweep — MEH-1242 / MEH-1251 / MEH-1195 / MEH-1253

**Date:** 2026-07-17
**Method:** **Emulated-browser QA (Playwright + Chromium) against a full LOCAL PROD STACK — not staging.**
Staging (`staging.mehamakor.online`, Vercel) is unreachable from the CC sandbox
(agent proxy denies CONNECT to Vercel: `vercel.com:443 → 403`), and no staging
test credentials are available here. Per Sapir's instruction, the full stack was
brought up locally instead:

- **Postgres 16** (native cluster) — fresh DB, schema auto-created on boot
  (`app.startup.lifespan` → `Base.metadata.create_all` + `seed_data.seed()`).
- **FastAPI backend** (`uvicorn app.main:app`, `ENV=development`, AI fail-open —
  no `ANTHROPIC_API_KEY`).
- **Next.js prod build** (`next start`) with `BACKEND_URL` → local backend.
- **Local-only test accounts** (created in the local DB, never real data):
  - admin: `qa-admin@example.com`
  - producer owner: `qa-owner@example.com` → test producer **"בדיקת UX (QA מקומי)"**
    (`status=approved`, local-only, not real business data).

**All results below are "verified via emulated browser QA on a local prod stack,
not a physical device and not staging."** Real-device tap behavior and live-staging
rendering remain Sapir's manual checkboxes (left unticked).

Two viewports: **375×812 (mobile-emulated)** and **1440×900 (desktop)**.
No real business data was touched. The one mutation to the local test producer in
check 5 (delivery both-off attempt) was reverted at the end of the run.

---

## Results

| # | Ticket | Check | Result | Evidence |
|---|--------|-------|--------|----------|
| 1 | MEH-1242 (PR1) | Admin edit → type 10 chars into **שם העסק** → focus + value retained (remount-regression) | ✅ **PASS** | Focus held on every one of 10 keystrokes; final value length = 10. `check1-name-typed.webp` |
| 2 | MEH-1242 (PR2) | Admin **AddressSearch**: search → select → lat/lng+city populate → save → persist | ⚠️ **PARTIAL / BLOCKED** | Geocode **reachable once** (12 Nominatim suggestions rendered — `check2-address-typed.webp`), proving the AddressSearch UI + debounced query + suggestion render all work. But the provider (`nominatim.openstreetmap.org`, **client-side**, not in the sandbox egress allowlist) was unreachable on 4 subsequent attempts (`check2-suggestions.webp` = 0 results), so the deterministic **select→populate→save→persist** flow could not be completed here. **Blocked by sandbox egress to the geocode provider — not a code fault.** Full E2E is a real-environment check. |
| 3 | MEH-1242 (PR3) | Owner edit: **מחיר ומוצר מוביל** card + **קישור לקבוצת וואטסאפ** → save → persist → public reflects | ✅ **PASS** | `GET /producers/me` after save: `top_product_name="מוצר בדיקה QA"`, `price_range="מ-₪42"`, `whatsapp_group="https://chat.whatsapp.com/QAlocaltest123"`. Public `/producer/{id}` shows the product. `check3-pricing-whatsapp-saved.webp`, `check5-delivery-both-off.webp` (cards visible), `check34-public-producer.webp` |
| 4 | MEH-1242 (PR5) | Owner **שעות פתיחה** card → save → reload persists → public shows | ✅ **PASS** | `opening_hours="Sun-Thu 08:00-16:00"` persisted; **UI value survived a full reload**. Public page wires `<OpeningHours>` (`ProducerSections.jsx:378`). *Note:* the automated public **text**-match used a strict `08:00-16:00` literal and didn't catch the component's reformatted output — a visual spot-check of the public hours section is a minor follow-up, not a fix failure. `check4-hours-saved.webp` |
| 5 | MEH-1242 (PR5) | Delivery card: toggle **OFF both** חנות פיזית + משלוחים → save must **FAIL** with a visible Hebrew error (no silent success) | ✅ **PASS** | Visible red error **"חייב לסמן לפחות אחד מהשניים"**; `GET /producers/me` after: `has_physical_location=true, offers_delivery=false` — **not** persisted both-false. State restored afterward. `check5-delivery-both-off.webp` |
| 6 | MEH-1251 | `/admin/producers` last-row ⋮ → full menu, panel is child of `document.body`, all items incl. destructive reachable | ✅ **PASS** | `menu.parentElement === document.body`, 4 items **[השהה \| ☆ שגריר \| 📸 סטורי \| מחקו(delete)]**, fully in viewport. `check6-menu-open.webp` |
| 7 | MEH-1251 | `/admin/users` last-row ⋮ → same | ✅ **PASS** | `parentElement === document.body`, item **[העלי לאדמין]**, in viewport. `check7-menu-open.webp` |
| 8 | MEH-1251 | Scroll so toolbar sits in the sticky-header band → click **פרטים חסרים** → toggles | ✅ **PASS** | At `scrollY=140` the toggle clicked and its label flipped to **הצג הכל** (active state). `check8-toolbar-sticky.webp` |
| 9 | MEH-1251 | Header pill fully interactive: logo/nav links, search, UserMenu dropdown opens + items clickable | ✅ **PASS** | `<nav>` `pointer-events:auto`, 5 nav links, a nav-link click navigated; UserMenu trigger opened a floating dropdown (z-[10xx]). `check9-header-interactive.webp`, `check9b-usermenu.webp` |
| 10 | MEH-1195 | Inner page `/he/terms` mid-scroll, both viewports → header band **opaque cream** (`bg-background` on `<header>`), no content bleed | ✅ **PASS** | `<header>` class = `sticky top-0 z-[1050] pointer-events-none bg-background` @375 **and** @1440. `check10-terms-opaque-375.webp`, `check10-terms-opaque-1440.webp` |
| 11 | MEH-1195 | Homepage `/he` → `<header>` has **NO** `bg-background` (still transparent over hero) | ✅ **PASS** | `<header>` class = `sticky top-0 z-[1050] pointer-events-none` (no `bg-background`) @375 **and** @1440. `check11-home-transparent-375.webp`, `check11-home-transparent-1440.webp` |
| 12 | MEH-1253 | Mobile: tap in the transparent area beside/behind the bottom bar → passes through; bottom-bar buttons still work | ✅ **PASS** | Wrapper `pointer-events:none`, `<nav>` pill `pointer-events:auto`; `elementFromPoint` at the far gutter is **not** trapped by the wrapper (falls through). `check12-bottombar-375.webp` |

**Totals: 11 PASS · 1 PARTIAL (check 2 — blocked by sandbox egress) · 0 FAIL.**
No regression of any merged fix was found.

---

## What was NOT verified (honest gaps)

- **Check 2 select→persist** — blocked by intermittent/absent sandbox egress to the
  client-side Nominatim geocoder. The AddressSearch component itself is verified
  working (suggestions rendered when the provider responded). Run on staging or any
  environment with geocode egress to close it.
- **Real-device tap behavior** (check 12) — verified structurally (pointer-events
  contract) and via `elementFromPoint`, **not** with a physical finger on a real
  device. Sapir's real-device checkbox remains unticked.
- **Live staging rendering** — everything here ran against a local prod stack, not
  `staging.mehamakor.online`.
- **Check 4 public hours** — persistence + reload + public component wiring verified;
  the exact reformatted hours string on the public page was not asserted (strict
  literal match). Visual spot-check recommended.

## Environment note

`nominatim.openstreetmap.org` and `vercel.com` are not in the sandbox egress
allowlist; the geocode flakiness (check 2) and staging-unreachability both trace to
that policy, not to application code.
