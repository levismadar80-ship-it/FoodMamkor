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

### 1.4 · Chunks 5–7 — dispatched, results pending at write time

54 cards (MEH-1681…MEH-1908 by updated-at). Their briefs carry the 09/08 amendments
plus the three chunk-specific rulings: MEH-225 and MEH-130/125 are **Sapir planning
cards the groom flags, never builds**; MEH-1736 + MEH-1949 + MEH-1615 are **one root
family** (branch-name auto-link vs the branch-name gate) folded into a single fix.

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
