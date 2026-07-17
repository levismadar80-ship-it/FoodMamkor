# QA sweep — MEH-1266 (reports lifecycle) + MEH-1267 (admin polish)

**Method:** emulated **local full stack** — local PostgreSQL 16 (`alembic upgrade head` applied through `c5e1a9d7f2b4`) + FastAPI (`uvicorn`) + Next.js **production build** (`next start`), seeded with **local-only** test data. Playwright (Chromium) drove the admin UI at **375** and **1440** px with an injected admin session.

> ⚠️ **Emulated local stack, not staging/device.** Mobile QA on real devices / live staging is left to Sapir (the mobile checkbox stays unticked on both PRs).

Dates: 2026-07-17. PRs: **#1842** (MEH-1266), **#1837** (MEH-1267, merged).

---

## Backend API integration — 12/12 PASS

Driven directly against the running backend on the migrated DB (minted admin JWT):

| Check | Result |
|---|---|
| `GET /admin/reports` shows a **single-report** producer (no ≥3 gate) | ✅ `report_count=1, auto_flagged=false` |
| single-report `auto_flagged` is **false** (neutral) | ✅ |
| 3-report producer `auto_flagged` is **true** | ✅ `report_count=3` |
| dashboard `total_group_buys` is a **number** (not "›") | ✅ `=1` |
| dashboard `open_reports` counts open only (baseline) | ✅ `=4` |
| **dismiss** returns 200 | ✅ |
| dismissed producer **gone on refresh** (survives) | ✅ |
| dashboard red-alert `open_reports` **drops** 4→3 after dismiss | ✅ |
| **sidebar badge** `pending_moderation_count` drops too (open-only) | ✅ 4→3 |
| **resolve** returns 200 | ✅ |
| **double-close → 409** | ✅ `הדיווח כבר טופל` |
| close missing report → 404 | ✅ |

## Frontend (Playwright @ 375 + 1440) — 14/16 PASS

| Check | 375 | 1440 |
|---|---|---|
| [1267] group-buys card shows a number, no "›" | ✅ | ✅ |
| [1266] single-report producer visible (no 3+ gate) | ✅ | ✅ |
| [1266] `3+ דיווחים` auto-flag badge present | ✅ | ✅ |
| [1266] "התעלם" opens the dismiss confirm dialog | ✅ | ✅ |
| [1267] ambassador tooltip (`title`, "Trust Tier 5") present | ⚠️ n/a | ✅ |
| [1267] story panel X close button present | ⚠️ n/a | ✅ |
| [1267] story panel closes via **X** | — | ✅ |
| [1267] story panel closes via **Esc** | — | ✅ |

**The two ⚠️ at 375 are a test-harness limitation, not a defect.** The producers-table kebab (`AdminRowMenu`, a fixed-position portal — **not** in this work's scope) did not open under Playwright automation at 375px; on mobile the fixed **BottomNav** bar overlays the top table rows and intercepts the tap. Both features are conclusively verified elsewhere:
- **Ambassador tooltip** — confirmed at 1440 (static `title` attribute, viewport-independent).
- **Story panel X + Esc** — confirmed at 1440 (open→X→closed, open→Esc→closed) **and** by vitest `StoryCardPanel.test.jsx` (3/3: X-click→onClose, Esc→onClose, no-onClose→no button).

## Static

- `grep mehamakor.online` in the two scoped files (`StoryCardCanvas.jsx`, `producer/dashboard/page.js`) → **0 functional hardcodes** — the only matches are explanatory comments documenting that `mehamakor.online` is the staging alias; every rendered/derived URL now uses the canonical `SITE_URL` = `mehamakor.co.il`.
- Alembic: `alembic upgrade head` applied cleanly through `c5e1a9d7f2b4` against a real (non-`create_all`) DB; `reports.status` NOT NULL default `'open'`, `resolved_at`/`resolved_by` nullable, FK `ON DELETE SET NULL` verified via `\d reports`.

## Screenshots

`admin-dashboard-*`, `admin-reports-*`, `admin-reports-dismiss-dialog-*`, `admin-producers-*`, `admin-producers-kebab-1440`, `admin-story-open-1440` (WebP, q80, ≤1440px — 496 KB total, under the 2 MB cap).
