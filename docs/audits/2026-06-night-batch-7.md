# Overnight batch #7 — 2026-06-06 (night)

Autonomous batch: 6 documented-deferred items from HANDOFF / memory. Sequential,
each branch off fresh `origin/staging`. No human input — no-ops and blockers
logged here, not paused on. Per meta-pattern #1, every premise was verified
against staging with `file:line` evidence before acting; **4 of 6 items were
already complete on staging** (intervening sessions cleared them), so those were
surfaced as no-ops rather than fabricating empty changes.

Sibling sessions running tonight (conflict-guard, untouched): WhatsApp delivery
(PR #991), test-expansion (PR #975), MEH-764 docs (PR #993).

---

## Ledger

| # | Item | Branch | PR | Result |
|---|---|---|---|---|
| 1 | events/new EN category labels | `feature/events-new-en-categories` | **#996** (draft) | ✅ **Shipped** — real fix |
| 2 | robots.txt `/en` lift | — | — | ⊘ **No-op** — nothing to lift; EN already crawlable |
| 3 | Wave 6 metadata tail | `feature/wave6-metadata-tail` | **#998** (draft) | ✅ **Shipped** — 4 routes (scope corrected) |
| 4 | auth routes `robots:noindex` | — | — | ⊘ **No-op** — all 8 already split + noindex |
| 5 | PR #934 recovery | — | — | ⊘ **No-op** — #934 actually merged; content in staging |
| 6 | MEH-475 S2 SecurityTab i18n | — | — | ⊘ **No-op** — already shipped (#766/767/768) |

Net: **2 PRs opened** (both draft), **0 BLOCKED**, **4 already-done no-ops**.

---

## Task 1 — events/new EN category labels ✅ (PR #996)

**Problem (confirmed):** `app/[locale]/producer/dashboard/events/new/page.js:13`
held a flat `CATEGORIES = ["סדנה", …]` array rendered raw in `<option>`, so the
`/en` category dropdown showed Hebrew text.

**Fix:** mirrored `EventsClient.jsx`'s `CATEGORY_KEYS` + `labelKey` → `t()`
indirection. Wire-format Hebrew constants stay as `<option value>` (PR-C2
convention); labels resolve via `events.categories` (which already carries
`workshop/tour/market/harvest/tasting/other` in both locales → **0 new keys**,
0 JSON parity risk). vitest 423 ✓; build ✓; route keeps ● SSG. Refs MEH-475.

---

## Task 2 — robots.txt `/en` lift ⊘ NO-OP

**Premise (false):** "lift the `/en` disallow … single-line change."

**Evidence:** `frontend/public/robots.txt` (the served file — no dynamic
`app/robots.js` exists) contains **no `Disallow: /en` line**. EN is already
crawlable. Corroborated by `docs/audits/2026-06-full-audit.md:508` —
"robots.txt does **not** disallow `/en/` (verified)".

**Gate verification (still performed):** per-page hreflang **is** live — 30
routes consume `buildAlternates` from `lib/i18n-seo.js`, including the global
`app/[locale]/layout.js:153`. Spot-checked `layout.js`, `about/page.js:28`,
`map/page.js:32` — all emit `alternates: buildAlternates(...)`. Gate confirmed;
but the gated action has nothing to act on. **No PR.**

---

## Task 3 — Wave 6 metadata tail ✅ (PR #998)

**Scope correction (meta-pattern #1):** the documented "~64 strings in
sitemap.js + remaining metadata exports" predates the **MEH-476 PR 3b2**
detail-page sweep. Phase 0 found:
- `app/sitemap.js` contains **zero user-facing strings** (pure URL generation;
  already emits per-locale `<xhtml:link>` hreflang) → no change.
- The 5 dynamic detail routes (`producer/[id]`, `[slug]`, `events/[id]`,
  `experiences/[id]`, `group-buys/[id]`) were **already migrated** in 3b2
  (`buildEntityTitle` + `getTranslations` + `OG_LOCALE`) → no change.

**Actual remaining surface = 4 static/list routes / 14 strings**, migrated to
`getTranslations` following the `seo.about` / `seo.map` pattern:

| Route | Fix |
|---|---|
| `events/page.js` | `seo.events.*` + `OG_LOCALE[locale]` |
| `experiences/page.js` | `seo.experiences.*` + hreflang leftover (`{canonical}` → `buildAlternates`) |
| `group-buys/page.js` | `seo.group_buys.*` + hreflang leftover + dropped double-brand |
| `register/producer/page.js` | `seo.register_producer.*` |

New keys: `seo.events` / `experiences` / `group_buys` / `register_producer` in
both locales. Parity **2584 / 2584** (script-verified). `title:{absolute}` with
brand baked per locale → `/en` no longer inherits the layout's Hebrew
`%s | מהמקור` template. vitest 423 ✓; build ✓; all 4 routes keep ● SSG. Refs MEH-475.

---

## Task 4 — auth routes `robots:noindex` ⊘ NO-OP

**Premise (false):** "8 client-component routes … need `robots:{index:false}`
but are `use client` … extract `<Route>Client.jsx`."

**Evidence:** all 8 routes (`login`, `register`, `forgot-password`,
`reset-password`, `verify-email`, `favorites`, `upgrade`, `contact`) are
**already split** — server `page.js` (first line `import { getTranslations }`,
not `"use client"`) exporting `generateMetadata` with
`robots: { index: false, follow: false }`, and the client logic already lives in
`LoginClient.jsx` / `RegisterClient.jsx` / … (all 8 present). The #915 precedent
was applied across all 8 by prior sessions (MEH-641 / 658 / 739). **No PR.**

---

## Task 5 — PR #934 recovery ⊘ NO-OP

**Premise (false):** "PR #934 … closed unexpectedly before merge."

**Evidence:** `pull_request_read` on #934 → `"state":"closed"`,
**`"merged":true`**, `"merged_at":"2026-06-05T13:32:24Z"`,
`"merged_by":"levismadar80-ship-it"`. The content is present in `origin/staging`:
`docs/legal/2026-06-lawyer-brief-licensing-tiers.md:179` —
`## נספח א' — מפת פטורים …` (43-line appendix, matches the PR's 41 insertions,
15 substantive content matches: categories/tiers/license/honey/sources). No
recovery needed. **No PR.**

---

## Task 6 — MEH-475 S2 SecurityTab i18n ⊘ NO-OP (HIGH-RISK — Sapir-authorized)

**Premise (false):** "the last 28 user-facing strings … STRING EXTRACTION ONLY."

**Evidence:** the 3 cards in `app/[locale]/settings/page.jsx` are **already fully
i18n'd** (inline comments literally read "MEH-475 S2-a/S2-b/S2-c"):
- `PasswordChangeCard` (`:380`) → `useTranslations("settings.security.password")`
- `LogoutAllDevicesCard` (`:556`) → `settings.security.logout_all` + `.common`
- `DangerZoneCard` (`:624`) → `settings.security.danger_zone` + `.common`

A scan of lines 380–724 finds the only Hebrew literal inside a code comment — **0
hardcoded rendered strings**. Namespace exists in both locales: `settings.security`
= 32 leaf strings each (parity). All hard invariants the task asked to preserve are
already intact in the shipped code:

| Invariant | Evidence |
|---|---|
| PATCH `/users/me/password` body shape | `:411` `{ current_password, new_password }` |
| 422 `detail.failures` path | `:421-431` array guard |
| `firstFailureMessage` extraction | `:431` `firstFailureMessage(detail.failures, tValidation)` |
| `logoutAllDevices()` + `confirming` state machine | `:557`, `:561`, `:565-576` |
| `deleteAccount()` + `emailMatch` case-insensitive | `:635` `.trim().toLowerCase() === (user.email||"").toLowerCase()` |
| phase state machine (`idle`→`confirm`→`grace`) | `:630`, `:652`, `:678`, `:688` |
| 30-day grace "30" stays a literal digit | `danger_zone.grace_body` HE "30 יום" / EN "30 days" |

S2 shipped in PRs #766/767/768. **No PR.**

---

## Process notes

- **4/6 already-done** strongly suggests the source HANDOFF/memory items were
  stale relative to a fast-moving `staging` (the detail-route metadata sweep,
  the auth-route splits, and the SecurityTab extraction all landed between the
  memory snapshot and this batch). Recommend a HANDOFF cleanup pass to retire the
  closed deferred items so they aren't re-dispatched.
- No file under `map/**`, `.github/workflows/**`, `alembic/**`, `tests/**`,
  `__tests__/**`, `format-date.js`, or the WhatsApp/availability backend was
  touched (conflict-guard honored).
- Both shipped PRs are **draft**; per-PR diff scope was verified before push.
