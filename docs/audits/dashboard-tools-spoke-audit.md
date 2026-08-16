# Dashboard "כלים" tab — spoke audit (MEH-1632, Phase 0)

Read-only mapping of the 5 tools-tab cards, run against a local `next start`
production build (Next 16.2.10) with a throwaway mock of the backend, so every
row below is a **measured** outcome rather than a code read.

Harness: `next build && next start` on `:3000`, a stub API on `:8000` answering
`/auth/me`, `/producers/me/dashboard`, the four `*/mine` list routes and
`GET /producers/{id}`. The stub's only variable is the producer's moderation
`status`, which is what isolates the 404 below. Screenshots (375 + 1440, one per
spoke): `qa-artifacts/MEH-1632/`.

---

## 1. Card → target → live result

Producer under test is `status: "pending"` — the state every business is in
between registration and admin approval.

| # | Card | `href` (source) | Route file | Live result |
|---|---|---|---|---|
| 1 | ניהול אירועים | `/producer/dashboard/events` (`tools/page.js:72`) | `events/page.js` | **200** · dashboard tab bar persists |
| 2 | ניהול חוויות | `/producer/dashboard/experiences` (`tools/page.js:81`) | `experiences/page.js` | **200** · tab bar persists |
| 3 | קבוצות רכש | `/producer/dashboard/group-buys` (`tools/page.js:92`) | `group-buys/page.js` | **200** · tab bar persists |
| 4 | מתכונים | `/producer/dashboard/recipes` (`tools/page.js:101`) | `recipes/page.js` | **200** · tab bar persists |
| 5 | ביקורות | `` `/producer/${producer.id}#reviews` `` (`tools/page.js:114`) | `producer/[id]/page.js` | **404** · unbranded English Next default 404; tab bar gone |

Measured identically at 375 px and 1440 px (10/10 rows agree).

## 2. 404 root cause

Not a missing route — the route exists and renders. The 404 is issued at the
**edge, before the page runs**, and it is conditional on moderation status:

1. `middleware.js:67-69` — any `/producer/<second-segment>` path (except
   `dashboard`) is existence-checked against `GET {API}/producers/{id}`.
2. `middleware.js:42` — that check is an **unauthenticated** `fetch`. It cannot
   be otherwise: the JWT lives in `localStorage` and is attached by the axios
   interceptor (`lib/api.js:15-22`), so it never exists at the edge.
3. `producers.py:265-271` (MEH-254) — a producer whose `status != "approved"`
   404s for every viewer that is not the owner or an admin. To an anonymous
   edge fetch, the owner *is* an anonymous viewer.
4. `middleware.js:71-76` — the 404 is turned into a rewrite to
   `/__mm_not_found__` with `status: 404`, which is a real HTTP 404.

**A/B proof.** Same build, same URL, same session; only `producer.status`
differs in the stub:

| `producer.status` | `GET :8000/producers/{id}` (what the edge sees) | `GET :3000/producer/{id}` |
|---|---|---|
| `pending` | 404 | **404** |
| `approved` | 200 | 200 |

## 3. Sibling instances (Bug Protocol step 2)

The defect is in the by-id owner link, not in the tools tab. Three owner-facing
call sites build the same URL and inherit the same 404:

| Call site | Surface | In MEH-1632 scope? |
|---|---|---|
| `tools/page.js:114` | ביקורות card | yes |
| `producer/dashboard/layout.js:136` | persistent "צפייה בדף" link | yes |
| `components/Header.jsx:510` | account menu → "הפרופיל שלי" | **no** — central component |

`layout.js:129-134` carries a comment asserting the owner exception keeps this
link working. That was true of the API before MEH-1398 added the edge check; it
is not true of the rendered page now. The comment is stale, not wrong-at-writing.

The other 15 `/producer/${id}` builders (`ProducerCard.jsx:177`,
`HeroSearch.jsx:194`, `sitemap.js:77`, …) are consumer surfaces that only ever
hold approved producers, so they are unaffected.

## 4. Flicker — what was and was not reproduced

**Not reproduced for spokes 1–4.** Three independent probes, at 375 px and
1440 px:

- **Document identity.** A `window` global and a DOM marker written on the tab
  bar both survive every one of the four transitions → client-side navigation,
  the document is never replaced.
- **Per-frame sampling.** ~160 `requestAnimationFrame` samples per transition:
  `framesWithoutTabBar: 0`, zero frames where body text collapses below 25 % of
  its starting length. No blank frame at either viewport.
- **Latency injection.** Delaying the client-router RSC payload by 800 ms does
  not surface `app/[locale]/loading.js` either. That boundary is already mounted
  when navigating within `[locale]`, so React's transition keeps the old UI
  visible instead of showing the fallback. The "shared parent skeleton replaces
  the dashboard" hypothesis is **disproven**, not merely unobserved.

**Reproduced, but it is the same bug as §2.** The ביקורות card is the only
transition that genuinely replaces the screen: it leaves the dashboard subtree,
so the tab bar unmounts by design — and on a pending business it lands on the
bare English 404 above. That is the one "flash/remount" this audit can
demonstrate.

**One measured defect that is adjacent but distinct.** On a *hard* load of any
dashboard route, `layout.js:78` (`if (authLoading || isUnauthenticated) return
null`) renders nothing at all while `GET /auth/me` is in flight. With a 700 ms
round trip the dashboard shell is absent for ~47–52 frames (≈780–870 ms) on
`/tools`, `/events` and `/recipes` alike. This is a blank-then-pop on entry, not
a spoke transition, so it does not explain the report — recorded because it was
measured, and because it would read as a flash to anyone entering the dashboard
cold on mobile.

**Honest limit.** The report says every spoke flashes. Four of them do not, on
this harness. Two differences from Sapir's environment are not modelled here and
could each produce a flash the harness cannot: real staging latency on the
`*/mine` list calls, and Vercel edge middleware running on every RSC request.
Confirming or dismissing those needs a capture from the live surface.

## 5. Design matrix (data only — no unification in scope)

| Spoke | Page title | Back-to-tools | Empty state | Primary button | Container | Hardcoded colors | RTL physical | Emoji |
|---|---|---|---|---|---|---|---|---|
| events | `h1` `font-headline-lg text-3xl` | `<BackLink>` → `/tools` | `<EmptyState>` icon+title+sub+CTA | `bg-primary text-white px-4 py-2 min-h-[44px] rounded-[8px]` | `max-w-3xl px-4 py-10` | `bg-green-50` `bg-yellow-100` `bg-yellow-50` `bg-red-50` | 0 | 0 |
| experiences | `h1` `font-headline-lg text-3xl` | `<BackLink>` → `/tools` | `<EmptyState>` icon+title+sub+CTA | `bg-primary text-white px-4 py-2 min-h-[44px] rounded-[8px]` | `max-w-3xl px-4 py-10` | + `bg-gray-100` `bg-red-100` (6 total) | 0 | 0 |
| group-buys | `h1` `font-headline-md text-2xl` | `<BackLink>` → `/tools` | `<EmptyState>`, CTA self-hidden while unapproved | `bg-primary text-white px-4 py-2 rounded-[10px]` (form: `px-6 py-2.5`) | `max-w-3xl px-4 py-10` | `bg-blue-50` `bg-gray-100` `bg-green-50` + 1 hex | 0 | 0 |
| recipes | `h1` `font-headline-md text-2xl` | `<BackLink>` → `/tools` | `<EmptyState>` icon+title+sub+CTA | `bg-primary text-white px-4 py-2 rounded-[10px]` | `max-w-3xl px-4 py-10` | `bg-green-50` `bg-red-50` | 0 | 0 |
| reviews | none — public producer page, no dashboard `h1` | none | n/a (public page) | n/a | `max-w-5xl px-4 py-12` on the launcher; target page unrelated | n/a | 0 | 0 |

Counted across **all** dashboard spokes, not first instance:

| Pattern | Count | Files |
|---|---|---|
| `import Link from "next/link"` (not `@/i18n/navigation`) | 8 | `tools`, `events`, `events/new`, `experiences`, `group-buys`, `recipes`, `recipes/[id]/edit`, `dashboard/page.js` |
| `useRouter` from `next/navigation` (not `@/i18n/navigation`) | 12 | every spoke + `edit`, `insights`, `followers`, the 3 `[id]/edit` pages |
| Physical RTL classes (`ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`) | **0** | — |
| Emoji in UI strings | **0** | — |
| Raw hex colors | 1 | `group-buys/page.js` |

The locale-unaware `Link`/`useRouter` imports are a real inconsistency (the
dashboard layout itself uses `@/i18n/navigation`, `layout.js:27`) and they drop
the `/en` prefix on navigation — but they are **not** the flicker: every one of
those links was measured doing a clean client-side transition on the default
locale.

---

## Verdict

The 404 and the one demonstrable screen-replace are the same defect, and its
root cause is `middleware.js` — a site-wide routing component outside this
ticket's declared scope, with a third instance in `Header.jsx` (central). Fixing
it inside the tools tab would mask one of three symptoms. Escalated rather than
patched; see the PR body for the two candidate fixes.
