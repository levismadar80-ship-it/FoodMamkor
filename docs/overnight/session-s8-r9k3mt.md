# Sweep session log — s8-r9k3mt (2026-08-09, continuous drain)

> As-of: 2026-08-09T11:3xZ. Every claim measured at that time; re-derive before acting.

**MEH-1960 groom: 7 chunks dispatched (126 cards) · 2 quick lanes shipped ·
MEH-1925 answered with a measurement · MEH-1905 Phase 0 closed.**

---

## 1 · MEH-1960 — the Backlog Hygiene Sweep

Method: chunks of 18, oldest-updated first, each chunk a background agent with the
card's five-verdict protocol, read-only on the shared tree, every verdict carrying a
`file:line` / SHA / PR. Sapir's 09/08 amendments were folded into the later chunks'
briefs (needs-sapir means ACCESS or a genuine product DECISION — never QA; the
`cc-queue + needs-sapir` pair is a labeling bug; pre-08/08 WAIT markers that are
decision-holds are superseded).

### Verdict counts

| Chunk | Cards | VALID | STALE-DONE | STALE-PREMISE | DUPLICATE | SAPIR-DECISION |
|---|---|---|---|---|---|---|
| 1 | 18 | 13 | 1 | 2 | 0 | 1 |
| 2 | 18 | 14 | 0 | 2 | 1 | 1 |
| 3 | 18 | 13 | 1 | 1 | 0 | 3 |
| 4 | 18 | 14 | 0 | 3 | 0 | 1 |
| **1–4 total** | **72** | **54** | **2** | **8** | **1** | **6** |
| 5–7 | 54 | *(in flight at write time — see §1.4)* | | | | |

**Closed with evidence (2):**

- **MEH-807** (home hero cold/gray) — `HomeHero.jsx` already renders the Cloudinary
  hero; `38231c5c` / PR #1055 merged **three days before the card was filed**. Parent
  session spot-checked the commit and corrected the agent's file path
  (`app/[locale]/home/HomeHero.jsx`, not `components/`) — the substance held.
- **MEH-323** (TypeScript hybrid setup) — `tsconfig.json` + `@types/*` landed under a
  **different ticket**, MEH-562 `c65d52ba`. Grep-by-ticket-number alone would have
  missed it.

**Merged as duplicate (1):** MEH-1213 → MEH-1249. The "tail of the conversion" card
described a slice of work its successor covers entirely; the tell was
`docs/qa/conversion-progress.md` on staging still reading *"Conversion has NOT
started"* — visible only by reading the checkpoint file, not either card.

### The eight STALE-PREMISE findings, and what they share

Six of the eight are **stale dependency lines, not stale premises**: the card's own
"blocked by" table named a ticket that has since shipped (MEH-1399←MEH-1396;
MEH-1416←MEH-1405; MEH-1207←MEH-1146, which the card called *In Progress* while it
had been Done since 16/07). The work stayed valid; only the blocker did not.

Two are structural:

- **MEH-174** (the Cowork epic) — all four sub-issues its DoD depends on are
  **unreachable**: not archived, not Done, simply absent by id, UUID and search. That
  is a distinct case from "shipped elsewhere" and the protocol had no slot for it.
- **MEH-796** (decommission `home_products`) — its *urgency framing* died when
  MEH-1406 unmounted the router for unrelated brand/security reasons, while its
  *task list* (3 tables, models, schemas) is untouched and still valid. A card's
  framing and its work can go stale independently.

### needs-sapir questions raised by the groom (chunks 1–4)

1. **MEH-972** — סריקת חתימה אמיתית + אישור mockup סבב-2?
2. **MEH-552** — MEH-551 (החוסם) לא קיים ב-Linear: נמחק בכוונה או דריפט?
3. **MEH-1184** — מתי פגישת עו"ד לרישיון תמונות + gap-scan תיקון 13?
4. **MEH-1491** — מאשרת את שני הנוסחים (meta_description + step4_text + התאום האנגלי)?
5. **MEH-125** — עוברת על ה-checklist בעצמך, או יש תאריך יעד לתעד?
6. **MEH-1189** — "חוות הגליל" עדיין מסווגת שגוי (אומת בשני מסמכי יולי): לתקן בפאנל
   האדמין? והאם `seed_demo_producers.py --reset` הורץ אי-פעם מול prod?

### 1.4 · Chunks 5–10 — ran, and their per-chunk tables are NOT claimable

54+ cards (MEH-1681…MEH-1908 by updated-at). Their briefs carried the 09/08
amendments plus the three chunk-specific rulings: MEH-225 and MEH-130/125 are
**Sapir planning cards the groom flags, never builds**; MEH-1736 + MEH-1949 +
MEH-1615 are **one root family** (branch-name auto-link vs the branch-name gate)
folded into a single fix.

> **These chunks completed and their verdicts were applied to Linear, but the
> per-chunk verdict tables were never transcribed into this log and the agent
> outputs did not survive the session's context boundary.** So the counts in the
> table above cover **chunks 1–4 only (72 cards)** and that is the number this
> log can support. The later chunks' effect is real but is now legible only from
> Linear itself — the card descriptions, labels and states they wrote — not from
> a report anyone can read here.
>
> **That is a process failure, not a rounding error**, and it is the same class
> the rules file names for artifacts: a result whose provenance is unrecoverable
> cannot be ratified, only re-derived. The fix is mechanical and belongs in the
> next groom: **write each chunk's verdict row to this log as the chunk returns**,
> not at the end of the sweep. A count held only in an agent's return value is one
> compaction away from not existing.

### 1.5 · The sweep is NOT complete — measured 2026-08-09T12:5xZ

A fresh three-state `list_issues` over team Mehamakor returns:

| State | Cards |
|---|---|
| In Progress | 12 |
| Todo | 20 |
| Backlog | ~190 |

Applying the Lane A / Lane B filters from `.claude/rules/workflow.md`
(Lane A = `In Progress` **and** `cc-queue`; Lane B = `Todo`/`Backlog` minus
`not-cc` · `post-launch` · `needs-sapir` · `blocked-needs-sapir`, minus the B2
title markers `HIGH-RISK` · `RED` · `decision-first` · `SIGNAL-GATED` · `[מגירה]` ·
`ספיר מריצה` · `ידני`):

- **Lane A — 4 open:** MEH-1952, MEH-1960, MEH-999, MEH-1911.
- **Lane B, `Todo` — 13 eligible:** MEH-1249, 1953, 1954, 1956, 1957, 1958, 1959,
  1961, 1962, 1963, 1965, 1966, 1967.
- **Lane B, `Backlog` — dozens more** (the orchestrator's standing figure of ~78
  total eligible is consistent with this sweep; this log does not re-derive it
  card-by-card).

**So the drain goal's completion condition — "a fresh sweep shows zero eligible
unclaimed cards" — is NOT met, and nothing in this session should be read as
claiming it is.** The evidence for that is the sweep itself, printed above.

---

## 2 · Built and shipped

### MEH-1951 — vitest zero-test guard · **PR #2715 MERGED**

`npx vitest run` returned exit 0 twice on 08/08 without running a test. The wrapper
runs vitest's entry with `process.execPath`, propagates real reds untouched, and
audits only the green path: no `Tests N passed` with N>0 → exit 1.

Two adversarial rounds, both different-model, both in isolated worktrees, and the
second one **found a merge-blocker the first missed**: an `eslint-disable` for a rule
this config has switched off, which `reportUnusedDisableDirectives:"error"` turns into
a hard lint failure on the Deploy gate. Also fixed from that round: `fileURLToPath`
(the raw `pathname` percent-encodes spaces and is `/C:/…` on Windows), and spawning
node against `vitest.mjs` rather than the `.bin` shim — on Windows that shim is a
`.cmd`/`.ps1` pair `CreateProcess` cannot exec, which would have hard-failed the DoD
skill **on the machine it is run from**.

**What this card did NOT close, stated in the PR body rather than buried:** the two
call sites that actually use `npx vitest` — `pr-checks.yml:593` (a leg of the blocking
CI gate) and the `settings.json:155` Stop hook — are both CC-deny and remain unguarded.
The two sites converted were already calling the local binary. The false-green class is
still live on the merge gate itself.

### MEH-1950 — cookie banner ↔ nav clearance · **PR #2714 open, auto-merge armed**

The banner's 80px offset lived one file from a 72px pill; the 8px gap was a
coincidence of two numbers. BottomNav now publishes its measured expanded clearance
as `--bottom-nav-clearance`; the banner derives `var + 8px` with a fallback that
reproduces today's geometry exactly where no pill renders.

The reviewer's F1 is the finding worth carrying: my first version tracked the pill's
**live** height, so the MEH-1014 scroll-minimize (56→48) sild the fixed banner 8px on
every scroll direction change — a new behaviour, uncovered, while the harness proved a
96px pill that **cannot occur**. Publishes are now frozen while compact and debounced;
the harness gained that cell and measures `bannerΔ=0.0px`.

Harness 12/12 PASS on two devices. The control earned its place twice: it caught a
blind selector (it had grabbed the Header's nav) before any number was read, and then
caught a race between the height transition and the debounce (400ms sampled before the
publish; widened to 900ms **on measurement**, not on a guess).

---

## 3 · MEH-1925 — Cloudinary. The blocking question is answered.

**`disabled customer`** — the account is disabled. Three independent Admin API
endpoints (Usage, Resources, Tags) return that identical error through the newly
authorized connector.

It discriminates cleanly: a **rotated key** would fail authentication, not return a
structured account-level error; **restricted media types / delivery ACL** would leave
the Admin API working. **Credits exhausted** is not ruled out *as the cause of the
disablement* — but it cannot be read, because Usage itself is behind the same wall.

**Consequence for onboarding, which is what the card asked:** uploads go to the same
account, so **producer image upload is blocked**, not merely display.

**Not obtainable from here:** the literal delivery status code. The sandbox proxy
blocks `res.cloudinary.com` — CONNECT opens, nothing returns (`curl exit 56`,
`HTTP 000`). Stated rather than simulated.

**Left for Sapir (one line):** Console → Account/Billing on `dfzpscjks` — credits/billing
or suspension? Reactivate. No API path exists for it.

---

## 4 · MEH-1905 — Phase 0 closed, one finding changes the shape of it

Probe claim **verified unchanged** (`railway.json:8` = `/health`; `health.py:154`
hardcodes `ok`). §6.3's misleading log line **already landed** (PR #2628).

**Why I did not flip the alias to a real readiness read, though it looks code-side:**
`/health` returning 503 has the *same* blast radius as changing `railway.json` —
Railway probes that exact path. The card's own §6.1 sequences it: fix the `db_init`
cause first, move the probe second.

**New finding — the staging `db_init` failure is data drift, not a code bug.**
`seed_data.py` last changed **31/07** (`7e8ccb65`); the FK violations start **02/08**.
The code is constant across the boundary, so the missing `categories.id=1` row is the
defect — the same family as MEH-1606's orphan category, which chunk 4's groom
cross-linked from the opposite direction, independently.

**Sentry — the code trace yields two candidates that one query separates.**
`sentry.py:45` reads `os.getenv("ENV", "development")`. So either the DSN is unset in
production (no events at all), **or** the DSN is set and `ENV` is not — in which case
the events exist, tagged `environment: development`, and a dashboard filtered to
`production` shows zero. The default is `development`, not `production`. One
unfiltered 90-day search tells Sapir which.

---

## In-flight ledger

| PR | MEH-XX | pushed | gate state | next revisit |
|---|---|---|---|---|
| #2715 | MEH-1951 | 11:2xZ | **MERGED** 11:24Z · card Done (real `Closes`) | closed |
| #2714 | MEH-1950 | 11:30Z (staging sync) | auto-merge armed; both reviews cleared | merge notification |
| — | MEH-1969 | — | card opened (ANSI strip follow-up — the fix exists on the 1951 branch, pushed after auto-merge fired) | queued |
| #2720 | MEH-1955 | 12:0xZ | **MERGED** — `Disallow: /register` prefix-blocked `/register/producer`, which the sitemap submits at priority 0.7 | closed |
| #2721 | MEH-160 | 12:1xZ | **DRAFT, blocked** — reviewer FAIL, 4 blockers (see §6) | Sapir / next stretch |
| #2722 | — | 12:2xZ | **MERGED** — PARKED.md entry for MEH-160 | closed |
| #2723 | MEH-1964 | 12:5xZ | open, non-draft; different-model review in flight | CI + reviewer |

---

## 6 · MEH-160 — located, wired, and then blocked by its own review

`viewer_ip_hash` was being **written and never read**: every analytics counter
used `func.count(model.id)`, so one visitor refreshing ten times counted ten
times. The reader now exists (`producer_me.py`, `WindowFilter.distinct_col` →
`COUNT(DISTINCT (day, hash))` on the ruled **24h** grain) with 8 passing tests,
including the two that discriminate: the grain test (a 7-day window must not
collapse to one count per visitor) and the NULL test (rows with no hash each
count once — a naive `COUNT(DISTINCT)` collapses them all to one).

**PR #2721 is a draft on purpose.** The independent review returned FAIL with four
blockers, two of which need a ruling rather than code:

1. `tests/test_analytics.py:305` fails against the new counting — the CI red.
2. `weekly_trend` compares a **raw** `prev_7d_views` against a **deduped**
   `last_7d`, so flat traffic reads as "down". Mixing the two grains in one ratio
   is wrong in either direction; which one wins is a product call.
3. `conversion_rate` can exceed 100% (returns 200% behind `clampPercent`) once the
   denominator dedupes and the numerator does not.
4. `profile_views_tooltip` states the **inverse** of the code in both locales, and
   the MEH-1557 guard that was supposed to catch exactly this is one-directional.

Also found, not blocking: `top_cities` stays raw, so a card can read `total: 1`
beside `חיפה: 3`; and the code comment claiming the two paths "agree by
construction" is false.

## 7 · MEH-1964 — the Header had no signup entry at all

`grep -rn 'href="/register"'` over `frontend/` returned **one** hit before this
change: `LoginClient.jsx:354`. A visitor who had never registered had to open a
login page she could not use. PR #2723 adds a quiet `הרשמה` link beside `כניסה` —
deliberately a link and not a pill, because MEH-907 removed the header CTA pill on
purpose and that decision stands.

Both new assertions were shown failing by construction, and the second
construction is the one worth recording: swapping `startsWith("/register")` for
`=== "/register"` reds **only** the `/register/producer` test — the plain
`/register` assertion still passes. A suite carrying only the obvious case would
have signed off on the wizard bug.

**Known limitation stated rather than widened:** the link is desktop-only
(`hidden md:`), matching `LoginAccount`, so on mobile the only path to consumer
registration is still `/login`. The ruling scoped this to the Header.

---

## 5 · Two process findings worth more than the tickets

**Auto-merge armed is a declaration that the current head is final.** #2715's third
review round arrived *after* the gate closed, so a verified fix sits on a branch and
not in staging. It is now MEH-1969 rather than lost — but the ordering is the lesson:
arm auto-merge only when no review is still outstanding.

**A `git checkout --` inside a compound command silently reverted an uncommitted fix**
— my own hand, in a chain whose earlier `cd` had failed so only the tail ran. This is
the s3 incident's shape (ORDERS §3.2) with the roles swapped: there a reviewer's
`stash` ate the subject, here my own cleanup did. Caught by grepping the file for the
marker I had just added, which is the cheap check that should follow any recovery
command in a chain.
