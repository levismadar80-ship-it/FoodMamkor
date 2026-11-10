# Implicit state machines — read-only audit (2026-11-09)

**Scope:** `backend/app/{models,routers,services}` + the frontend that renders those
states. **Method:** code reading only — every claim carries `file:line`. **No code
changed, no Linear card opened.** Time-boxed to 45 minutes, so §9 lists what was *not*
covered.

> **A note on what "implicit" means here, because it decides what counts as a finding.**
> A state machine is *implicit* when the set of legal states and the set of legal
> transitions exist only as the union of the write sites — not as an enum, a CHECK, a
> transition table, or a single guarded mutator. Three of the nine machines below are
> actually **explicit** and are reported as such (`rescue_orders`, `registrations`,
> `outbound_messages`): naming them is the control for this audit, because an audit that
> finds every machine guilty is not discriminating.

> **Status as of 10/11/2026 (added when the file was committed; the audit text below is unchanged).**
> Fixed and merged to staging: §1.1 (SLA clock from the resubmission) → #4251 · §2.1 (admin
> group-buy transitions: the owner table + a row lock) → #4250 · §3.1 (rescue «נמסר» / «לא
> הגיע» lock and re-read like a cancel) → #4249 · §4.1 + §4.2 (a cancelled experience always
> shows «מבוטלת»; the admin chip shows the admin decision) → #4252 · §7.1 (WhatsApp messages
> stuck in `accepted` > 1 day are listed) → #4256. Stale comments §1.2 + §4.3 → MEH-2870.
> Deferred past launch, one row each: §1.3, §2.2, §2.3, §5.1, §5.2, §6.1, §9 → MEH-2871.
> §8 → MEH-796 (router still unmounted). Not acted on by design: §3.2 (the audit itself
> recommends no change) and §4.4 (a completeness note; MEH-2784 already warns waiting
> businesses). The `psql` queries are in §10 (§0 points to them as §8 — the sections were
> renumbered after it was written); they were not run (CC cannot reach the staging DB).

---

## 0. What could NOT be verified, stated up front

**No staging row counts in this document.** §3 asks for real rows in
schema-legal-but-impossible states. I could not query staging:

- `*.up.railway.app` egress is blocked from the CC sandbox and
  `staging.mehamakor.online` answers `302 → vercel.com/sso-api` (CLAUDE.md § Known Bug
  Patterns, MEH-2090). Re-confirmed here only by reading that rule, **not** re-measured.
- The Railway MCP server is attached in this session, but its surface is
  services/variables/domains/logs/metrics — **it exposes no SQL tool**, so it cannot
  answer a row-count question.
- The Postgres MCP is standalone-CC only (CLAUDE.md § Workflow + execution rules).

So **every "impossible state" below is a statement about what the schema and the write
sites permit, never a claim that such a row exists.** The distinction matters: a
permitted-but-absent state is a latent defect, a permitted-and-present state is an
incident. §8 lists the exact `psql` one-liners Sapir can run from her terminal to turn
each one into the other, or to close it.

---

## 1. `producers.status` — business approval (the spine)

### States

One string column, **no DB CHECK**, five values by convention:
`draft | pending | approved | rejected | inactive` (`models/models.py:157`).

It does **not** stand alone. The effective state of a business is that column crossed
with seven satellites, each of which some reader consults:

| Column | file:line | Who reads it as state |
|---|---|---|
| `status` | `models.py:157` | everything |
| `phone_verified` | `models.py:508` | approve gate (`admin.py:294`), submit gate |
| `submitted_for_review_at` | `models.py:189` | SLA badge + queue sort (`admin.py:453`, `:561`) |
| `resubmission_count` / `resubmitted_at` | `models.py:534-535` | resubmit cap (`producer_me.py:1818`) |
| `requested_changes` / `changes_requested_at` | `models.py:548-549` | "pending but ball-in-owner's-court" |
| `rejection_reason` / `rejection_reason_code` | `models.py:531-533` | rejected-banner copy |
| `verified_at` / `declared_at` | `models.py:395`, `:382` | trust tier (computed, not stored) |
| `kind` | `models.py:167` | `is_business()` — excludes organizers |

**Verdict: the best-governed machine in the repo, and still implicit.** There is no
transition table; the legal moves are the union of five handlers. What makes it work is
that each handler carries its own guard *and* its guards were extracted into shared
owners — `_apply_approval_state` (`admin.py:185`), `_assert_approvable` (`admin.py:232`),
`submission_missing_items` (`services/submission_gate.py`). That extraction is the thing
that keeps the retry path in `_persist_approval` (`admin.py:340`) from approving a row
the main path would have refused.

### Transitions — every write point

| From → To | Site | Guarded? |
|---|---|---|
| ∅ → `draft` | `auth.py:571`, `auth.py:781`, `producer_queries.py:662`, `admin.py:657` | n/a (creation) |
| `draft` → `pending` | `producer_me.py:1942` (`POST /producers/me/submit-for-review`) | ✅ draft-only 409 + `submission_missing_items` 422 |
| `rejected` → `pending` | `producer_me.py:1856` (`POST .../request-review`) | ✅ `FOR UPDATE`, cap, gate |
| `pending`/`rejected` → `approved` | `admin.py:199` via `_apply_approval_state` | ✅ draft 409 + photo/licence/phone gates, re-asserted on retry |
| `pending`/`approved` → `rejected` | `admin.py:1457` | ✅ draft 409, preset validated before mutation |
| `approved` ⇄ `inactive` | `admin.py:1056` | ✅ `_TOGGLEABLE_STATUSES` (MEH-769) |
| `pending` → `pending` + feedback | `admin.py` `request_producer_changes` | ✅ |
| any → any via admin PUT | **refused** — `admin.py:916-921` (MEH-2502) | ✅ 422 |

### Findings

**1.1 — The SLA clock is never reset on resubmission. `pre-launch`.**
`producer_me.py:1856-1858` writes `status="pending"`, `resubmission_count`, and
`resubmitted_at` — but **not** `submitted_for_review_at`. `_attach_aging`
(`admin.py:453-456`) measures `business_days_waiting` from
`submitted_for_review_at or created_at`, and the queue sort (`admin.py:561`) uses the
same COALESCE. So a business submitted on day 1, rejected on day 2, and resubmitted on
day 40 reports **~28 business days waiting** and sorts to the head of the queue as the
oldest row. The number looks measured and is wrong by the whole rejection interval.

`resubmitted_at` exists and is exactly the missing input; nothing reads it for aging.
Two owners for "when did the clock start", and the reader consults the wrong one.

> This is the shape `.claude/rules/testing.md` calls *"a count in a log line reads as
> verification and is none"* — `_attach_aging`'s own docstring warns that a route
> returning rows without it "would serialise a silent `0` … a number that looks measured
> and is not". The same sentence applies to the number it does produce on a resubmit.

**Fix idea:** `admin.py:456` → `producer.resubmitted_at or producer.submitted_for_review_at or producer.created_at`
(and the matching `func.coalesce` at `:561`, same order). Pin it with the clock frozen at
the window edge per `testing.md` § Clock-dependent tests.

**1.2 — Two code comments record a residual risk that MEH-2502 closed. `post-launch`.**
Both `admin.py:1222-1226` and `producer_claim.py:87-89` state that an admin `PUT` can
push a listing back to `draft` because "admin_update_producer applies the payload as-is".
It cannot: `admin.py:916-921` refuses any payload containing `status` with a 422. The
claim-flow comment goes further and calls the resulting claimable-live-listing an
accepted residual risk — so a future session reading it is told a hole is open *and*
that someone decided to live with it. Both sentences are now false.

`.claude/rules/file-preservation.md` §6 is explicit that correcting a document requires
proving the document wrong first; here the grep **does** land (`grep -n "payload as-is"`),
so this is the editable case, not the MEH-1801 case.

**Fix idea:** two comment edits naming MEH-2502. Precedent card shape: MEH-2637 (stale
`models.py:353` comment, `GREEN · one line`).

**1.3 — `inactive` → `approved` re-publishes without re-running the approval gates. `post-launch`.**
`toggle_producer_status` (`admin.py:1056`) deliberately skips `_assert_approvable` — the
MEH-769 comment argues the business is "already-decided". But an owner can clear her
photos through `PUT /producers/me` while suspended, and the un-suspend then puts a
photo-less business back on the public map, which is precisely what the MEH-799 gate at
`admin.py:264` exists to prevent. Low likelihood, named here because the gate's own
docstring claims approval is the one place it runs.

**Fix idea:** call `_assert_approvable` on the `inactive → approved` arm only (the
`approved → inactive` arm must stay ungated — you must always be able to suspend).

---

## 2. `group_buys.status` — group buy

### States

`open | funded | cancelled | fulfilled`, one column, **no CHECK** (`models.py:2355`),
plus a one-way latch `funded_notified_at` (`models.py:2363`) that exists because the
status column legitimately flaps.

The latch is worth copying elsewhere: `status` is allowed to oscillate `open ⇄ funded`,
so the notification cannot be keyed on it. `models.py:2360-2362` carries a `DO NOT` on
clearing it. This is the correct answer to "a status that flaps cannot own a once-only
side effect", and it is the only place in the repo that solves it.

### Transitions

| From → To | Site | Guarded? |
|---|---|---|
| ∅ → `open` | `group_buys.py:396` | ✅ approved + `kind='producer'` + price + deadline |
| `open` → `funded` | `group_buys.py:295` (a join crosses `min_participants`) | ✅ `FOR UPDATE`, fresh count |
| `funded` → `open` | `group_buys.py:340` (a leave drops below min) | ✅ `FOR UPDATE` |
| `funded` → `open` | `group_buy_delist.py:102` (account deletion) | ✅ `FOR UPDATE(of=GroupBuy)` |
| `open`/`funded` → `cancelled`, `funded` → `fulfilled` | `group_buys.py:516` | ✅ `OWNER_TRANSITIONS` table + `expected_status` CAS + `FOR UPDATE` |
| `open`/`funded` → `cancelled` | `group_buy_delist.py:61` (business delisted) | ✅ `FOR UPDATE` |
| **any → any** | **`group_buys.py:563`** | ❌ **nothing** |

### Findings

**2.1 — `PATCH /admin/group-buys/{id}/status` is an unguarded free-for-all. `pre-launch`.**
`group_buys.py:546-566`: validates only membership in
`{"open","funded","cancelled","fulfilled"}`, then `gb.status = status; db.commit()`. No
row lock, no transition table, no notification, no `funded_notified_at` interaction.
Concretely reachable bad states:

- `cancelled → open` — participants were already emailed "the business cancelled"
  (`group_buys.py:525`), the group is live again, and no one is told. `cancel_commit`
  (`:319`) will now accept leaves on it again.
- `open → funded` with zero commits — the public card renders the funded badge
  (`GroupBuysClient.jsx:33`, `GroupBuyDetailClient.jsx:254`) and the group-buy price
  unlocks, on a group nobody joined. `funded_notified_at` is still NULL, so the latch is
  armed and the *next* real join fires the "we reached the goal!" mail — attributing a
  threshold crossing that the admin typed.
- No `with_for_update()`, so it races a concurrent join that is holding the lock
  (`:244`) and expects to be the only writer.

The owner route 40 lines above has a transition table, a compare-and-set and a lock. The
admin route has none of the three.

**Fix idea:** give the admin route the same `with_for_update()` and an
`ADMIN_TRANSITIONS` table (a superset of `OWNER_TRANSITIONS`, explicitly listing the
reopen arms Sapir actually wants); on any arm that lands in `funded`, decide the
`funded_notified_at` question in one place rather than leaving it latent.

**2.2 — `cancel_commit`'s remaining-count is correct only because `autoflush=False`. `post-launch`.**
`group_buys.py:338`: `remaining = len(gb.commits) - 1`, run after `db.delete(commit)` and
`db.refresh(gb)`. The `-1` is right **only** while the pending DELETE has not been
flushed — i.e. only because `SessionLocal` is built with `autoflush=False`
(`database.py:107`). Flip that one kwarg (or add a `db.flush()` above) and the deleted
row leaves the reloaded collection, the `-1` double-subtracts, and a group buy at exactly
`min_participants` reverts to `open` one member early.

The robust form of the same computation is 50 lines away in
`group_buy_delist.py:92-101`: an explicit `func.count()` with
`GroupBuyCommit.user_id != user.id`. Two expressions of one rule; one of them depends on
a session-wide setting that reads as unrelated.

**Fix idea:** replace `len(gb.commits) - 1` with the `func.count()` form already used in
`group_buy_delist.py`, and drop the now-pointless `db.refresh(gb)`.

**2.3 — Nothing ever closes a group buy whose deadline passed. `post-launch` (known).**
Acknowledged at `group_buys.py:443-444` and worked around for the `open` tab only
(`:123-127` filters `deadline >= now`). The `funded` tab has **no** such filter, so a
funded group buy whose pickup date is months gone stays on the public `funded` list
forever, with no transition out except the owner pressing «נמסר». `fulfilled` is
therefore the only state that is reached exclusively by hand.

---

## 3. `rescue_offers.status` × `rescue_orders.status` — rescue bags

### States — **this one is explicit, and it is the model to copy**

Both columns carry **DB CHECK constraints** against named constant tuples
(`models.py:2904-2907`, `:3003-3006`), plus real invariant CHECKs:
`0 <= qty_left <= qty_total` (`:2912`), `qty_donated <= qty_total` (`:2920`),
`pickup_end > pickup_start` (`:2916`), `pickup_code ~ '^[0-9]{4}$'` (`:3014`).

The model docstring states the discipline outright (`models.py:2893-2896`): *"`status`
carries only active | cancelled. Sold out is `qty_left == 0` and finished is `pickup_end`
in the past, so neither earns a status value; a second owner for a derivable fact is the
MEH-271 smell."* That is the correct rule, written down, in the right place.

Order states: `reserved | handed | no_show | cancelled`, with `handed_at` / `handed_by` /
`cancelled_at` as the audit trail.

### Transitions

| From → To | Site | Lock? |
|---|---|---|
| ∅ → `active` (offer) | `rescue.py:422` | n/a |
| `active` → `cancelled` (offer) | `rescue.py:573` | ✅ `_offer_for_update` |
| ∅ → `reserved` (order) | `rescue.py:285` | ✅ offer locked, `qty_left` decremented under it |
| `reserved` → `handed` | `rescue.py:901` | ❌ **order row not locked** |
| `reserved` → `no_show` | `rescue.py:939` | ❌ **order row not locked**; also bumps `User.rescue_no_show_count` unlocked |
| `reserved` → `cancelled` (buyer) | `rescue.py:989` | ✅ offer-then-order, status **re-read under the lock** (MEH-2737) |
| `reserved` → `cancelled` (bulk, offer pulled) | `rescue.py:581` | ✅ under offer lock |

### Findings

**3.1 — `mark_handed` / `mark_no_show` skip the lock that `cancel_order` was given. `pre-launch` (gated by the flag).**
`rescue.py:989-1005` learned the lesson explicitly: its comment says the pre-lock status
check "ran on a row read before any lock: two cancels of one order … both saw `reserved`
there", so it locks the offer, then `db.refresh(order, with_for_update=True)`, then
**re-reads the status**. `mark_handed` (`:888-901`) and `mark_no_show` (`:924-939`) do the
unlocked read the comment is about.

Schema-legal states this produces, none of them blocked by a CHECK:

- `status='handed'` **with `cancelled_at IS NOT NULL`** — the buyer cancelled (restoring
  `qty_left`), the business tapped «נמסר» in the same second; the UPDATE serialises on the
  Postgres row lock but neither side re-reads, so last-writer-wins on `status` while both
  trails persist. A handed bag that also records its own cancellation, **plus a phantom
  bag back in stock** (`qty_left` was incremented for a bag that left the counter).
- `status='no_show'` with `cancelled_at IS NOT NULL`, same mechanism.
- `User.rescue_no_show_count` lost update: two no-shows for one buyer, read-modify-write
  with no lock (`rescue.py:941-944`). The comment correctly notes the *gate* reads a
  windowed count from the orders, so this is a display/metrics counter — which is why
  this is the minor half of the finding and not the major one.

**Fix idea:** both handlers take `_offer_for_update` + `db.refresh(order, with_for_update=True)`
+ a post-lock status re-read, copying `cancel_order:995-1001` verbatim. The `-1`-style
counter bump wants `UPDATE … SET rescue_no_show_count = rescue_no_show_count + 1`.

**3.2 — "the business cancelled" vs "I cancelled" is derived, not stored. `post-launch`.**
Both paths write the same `(status='cancelled', cancelled_at=…)`. The buyer's page
distinguishes them only by `offer.status == 'cancelled'` (`rescue.py:566`, and
`list_my_reservations`). Correct today, and fragile for the same reason as every other
derived-from-a-sibling fact in this audit: it stops being true the moment an offer can be
cancelled for a second reason. Flagged, not recommended for change — the alternative is a
column, and the rescue model's own docstring argues against columns for derivable facts.

---

## 4. `experiences` — the worst case: three independent state owners

### States

**Three columns, no CHECK on any of them, 32 nominal combinations:**

| Column | file:line | Values |
|---|---|---|
| `status` | `models.py:1904` | `pending \| approved \| rejected \| changes_requested` |
| `moderation_status` | `models.py:1907` | `APPROVED \| FLAGGED \| REJECTED \| NULL` |
| `is_active` | `models.py:1920` | bool, NOT NULL, default true |

`status` is the admin's decision; `moderation_status` is Claude's verdict; `is_active` is
the host's reversible cancel. Only `(approved, *, true)` with a future date and an
approved host business reaches the public feed
(`experiences.py:201-240`). **Nothing constrains the other 31.**

This is the one machine where the schema permits states the product has no meaning for —
`(status='rejected', moderation_status='APPROVED', is_active=true)` is representable, and
is in fact what an admin reject of a Claude-approved submission produces.

### Transitions

| From → To | Site | Side effects |
|---|---|---|
| ∅ → `(pending, verdict, true)` | `experiences.py:459-462` | admin email; `REJECTED` verdict → 400, nothing persisted |
| content edit on `approved`/`rejected`/`changes_requested` → `(pending, fresh verdict, is_active unchanged)` | `experiences.py:588-608` | ✅ IndexNow (`:622`) |
| `is_active` flip only | `experiences.py:560` (no re-moderation — `_NON_CONTENT_FIELDS`, `:567`) | ✅ IndexNow |
| → `approved` | `admin_experiences.py:88` | ✅ IndexNow, host email |
| → `changes_requested` | `admin_experiences.py:128` | ✅ IndexNow if was live, host email |
| → `rejected` | `admin_experiences.py:164` | ✅ IndexNow if was live, host email |

### Findings

**4.1 — Approving an experience does not reactivate it, and neither surface says so. `pre-launch`.**
`admin_experiences.py:86-90` writes `status`, `admin_feedback`, `rejection_reason` — never
`is_active`. Combined with the dashboard's branching, this is a trap:

1. Host cancels an approved experience → `is_active = False` (`experiences.py:560`).
2. Host edits the text → `status` resets to `pending` (`experiences.py:589`); `is_active`
   stays `False`.
3. **Dashboard now hides both affordances**: the reactivate button is gated on
   `ex.status === "approved" && !past`
   (`producer/dashboard/experiences/page.js:260`), and so is the «מבוטלת» badge
   (`:220` — `cancelled = !past && ex.status === "approved" && !ex.is_active`). The host
   sees a plain «ממתינה» card with no hint that it is switched off.
4. Admin sees a normal `pending` card in the queue (`admin_experiences.py` list carries no
   `is_active` signal), approves it, and `notify_host_approved` (`:97`) emails "your
   experience is approved".
5. It does not appear in the feed. It is recoverable — step 4 restores
   `status='approved'`, so the badge and the button come back — but only if the host goes
   looking after being told it was published.

So the user-visible defect is the **false approval notification** plus the two-step blind
window, not permanent loss.

**Fix idea:** cheapest correct version is one line in the dashboard — drop
`ex.status === "approved" &&` from the `cancelled` predicate at
`experiences/page.js:220`, so a deactivated experience always shows «מבוטלת». Server-side
alternative (needs Sapir's ruling, not CC's): have approve set `is_active = True`, or
surface `is_active` on the admin queue row.

**4.2 — `moderation_status` is rendered as if it were the admin's decision. `pre-launch` — already filed as MEH-2840.**
Confirmed independently here: `/admin/experiences` shows a green «מאושר» chip driven by
Claude's `moderation_status` on rows whose admin `status` is `rejected`. The root cause is
exactly §4's two-owners structure. **Do not open a new card** — MEH-2840 (Backlog,
`GREEN · one file`) is this finding, and it is the right place for it.

**4.3 — The model docstring contradicts the write gate. `post-launch`.**
`models.py:1864` says *"Host — any logged-in user (consumer / producer / admin)"*.
MEH-2246 changed `submit_experience` to `Depends(require_verified_producer)`
(`experiences.py:406`), and `_publicly_visible_query` INNER-JOINs `Producer`
(`experiences.py:205`), so a consumer-hosted experience could never be public anyway. The
docstring now describes a rule the code refuses. Same class as §1.2 and MEH-2637.

**4.4 — An approved experience under a non-approved business is a silent orphan. `post-launch`.**
`require_verified_producer` does not require `status='approved'`, so a `pending` business
can submit, and an admin can approve the experience. `_publicly_visible_query`'s
`is_business()` then hides it until the *business* is approved. The host's dashboard says
«מאושרת»; the public feed has nothing. Deliberate per `experiences.py:178-183`, and
MEH-2784 already added a pre-form notice for waiting businesses — so this is a
completeness note, not a new bug: the admin queue still gives no signal that approving
this row publishes nothing.

---

## 5. `producer_recipes` — `published` × `moderation_status`

### States

`moderation_status` (`pending | approved | rejected | needs_revision`, **WITH a DB
CHECK**, `models.py:2606-2609`) × `published` (bool NOT NULL, `models.py:2634`). Public
requires both: `published=True AND moderation_status='approved'`
(`producer_recipes.py:397`, `:424`; matching partial index at `models.py:2598-2603`).

**Verdict: coherent by construction, not by constraint.** `published` is not in
`ProducerRecipeUpdate` (`schemas.py:4108-4120`), so the owner cannot write it; every
write pairs the two columns in one commit:

| Site | Writes |
|---|---|
| `producer_recipes.py:157-159` | `(pending, published=False)` |
| `producer_recipes.py:295-296` | `(pending, published=False)` — content edit unpublishes |
| `admin_recipes.py:138-140` | `(approved, published=True)` |
| `admin_recipes.py:219-221` | `(needs_revision, published=False)` |
| `admin_recipes.py:254-256` | `(rejected, published=False)` |

`(published=True, moderation_status='rejected')` is schema-legal and unreachable — a
latent state held off only by five call sites agreeing. **IndexNow is complete here**: all
three admin arms route through `_ping_recipe` (`admin_recipes.py:90`, called at `:192`,
`:230`, `:265`) and both owner arms through `_public_urls` (`producer_recipes.py:227`,
used at `:337`, `:356`).

### Findings

**5.1 — The one-line hardening available. `post-launch`.**
A CHECK — `NOT published OR moderation_status = 'approved'` — would turn the five-site
agreement into an invariant. Expand-only, no backfill (no existing row violates it, by
§5's own table). Needs Sapir's OK as an Alembic revision (workflow rule 38).

**5.2 — No owner unpublish. `post-launch`.**
The owner's only way to take a live recipe down is a content edit (which unpublishes as a
side effect, `producer_recipes.py:295`) or delete. The dashboard renders
`r.published ? t("published") : t("not_published")` (`recipes/page.js:183`) as read-only
text with no control. Experiences got a reversible cancel (`is_active`, MEH-1419); recipes
did not. Product gap, not a defect.

---

## 6. `producer_reviews` — moderation + a denormalized aggregate

### States

`is_hidden` (bool) × `ai_moderation_status` (`APPROVED | FLAGGED | NULL`, **with a CHECK**,
`models.py:2025-2028`) × `edited_after_hidden_at` (nullable). `REJECTED` is never stored —
it is a 422, which is why the CHECK lists only two values and needs no `IS NULL OR`
(the comment at `:2024` says so, and it is right: a CHECK passes on NULL).

**The real state here is not on the review at all.** It is
`producers.avg_rating` + `producers.reviews_count` (`models.py:495-496`) — a denormalized
projection of "all non-hidden reviews", maintained by hand.

### Transitions and aggregate coverage — all six sites covered

| Write | Site | Recompute |
|---|---|---|
| create / upsert-edit | `reviews.py:538` | ✅ |
| edit via race branch | `reviews.py:577` | ✅ |
| hide | `reviews.py:708` | ✅ (+ `FOR UPDATE` + `seen` CAS → 409) |
| unhide | `reviews.py:731` | ✅ (+ `FOR UPDATE`) |
| delete (owner/admin) | `reviews.py:581` | ✅ |
| user account deletion (DB cascade) | `user_deletion.py:112-121` | ✅ — explicitly compensates for the cascade the ORM cannot see |

**Verdict: the aggregate is fully covered.** `user_deletion.py:52-53` names the hazard
out loud — the columns are "maintained ONLY in reviews.py … so without a [recompute] the
cascade would leave them counting deleted rows". That is the only place in this audit
where a cascade-vs-denormalization gap was *found already closed*.

### Finding

**6.1 — The aggregate is written in a second transaction, unlocked. `post-launch`.**
`_recompute_producer_rating` (`reviews.py:195-213`) ends with its own `db.commit()`, and
every caller invokes it **after** the status commit. Two consequences, both narrow:
(a) if the second commit fails, the review change is durable and the aggregate is stale
with no retry; (b) two concurrent review writes can interleave SELECT-then-UPDATE on the
unlocked producer row, so the loser's count can be one stale. Self-healing on the next
write, which is why this is `post-launch` and not higher.

**Fix idea:** fold the recompute into the same transaction as its trigger (drop the inner
`commit`, let the caller commit once) and add `with_for_update()` on the producer fetch at
`:208`.

---

## 7. `outbound_messages.status` — the WhatsApp ledger

### States

`accepted | delivered | failed | window_expired`, one column, **no CHECK** — app-enforced
by convention (`models.py:2718-2720`, which says so).

**Verdict: the best-engineered transition in the repo.** The reconcile is a single guarded
SQL UPDATE: `WHERE meta_message_id = :wamid AND status = 'accepted'`
(`whatsapp_webhook.py:588-594`). Terminal states are therefore never overwritten, and
Meta's at-least-once redelivery becomes a 0-row no-op **at the SQL level** rather than in
Python. `meta_message_id` is UNIQUE (`models.py:2721`) for the same reason. `read` folds
into `delivered`, `sent` is dropped, unknown names are logged and skipped
(`_build_status_update`, `:612-641`).

### Finding

**7.1 — `accepted` has no exit by timeout, and the admin surface treats it as healthy. `pre-launch`.**
`accepted` means *Meta's Graph API returned 200*. It becomes terminal only if a status
webhook arrives. If none ever does — webhook misconfigured, HMAC mismatch rejecting the
batch, Meta dropping the receipt, the app down during the retry window — the row stays
`accepted` **forever**, and:

- The admin failure digest filters `status IN ('failed','window_expired')`
  (`admin_whatsapp.py:65`, same predicate re-used at `admin_extra.py:889`). A permanently
  stuck `accepted` is in neither set.
- Nothing anywhere else reads `accepted`: the only other occurrence in the codebase is
  the reconcile guard itself (`whatsapp_webhook.py:591`). Verified by grep over
  `backend/app/`.

So "nothing in the failed list" has two causes — nothing failed, or the whole receipt
pipeline is dark — and the surface renders both as the reassuring one. That is verbatim
the pattern `.claude/rules/testing.md` names: *"A probe whose null output is also its
reassuring output is not evidence"*, and *"a green that has two possible causes is not a
signal"*. The ledger was built to make delivery observable; this is the one hole through
which it stops being.

**Fix idea:** add `accepted AND created_at < now() - interval '1 day'` as a third bucket on
the same admin screen (a `STUCK_STATUSES` constant beside `UNDELIVERED_STATUSES` in
`services/whatsapp.py`, so the list and the admin-home count keep sharing one predicate,
as they already do). No schema change, no new state value — the age *is* the signal, which
matches the rescue model's rule against columns for derivable facts.

**Possible fold-in:** MEH-2122 («כשל OTP שקט בשלוש שכבות», Backlog, chunks B/C/D
post-launch) is the same silent-WhatsApp-failure family. Worth checking whether this is
its chunk D rather than a new card.

---

## 8. `home_products` — five visibility owners, and a decommission card

### States

**Five independent owners of "can the public see this":** `is_active`
(`models.py:1668`), `is_hidden` (`:1669`), `moderation_status`
(`APPROVED|FLAGGED|REJECTED`, `:1684`), `available_until` (`:1667`), `expiry_date`
(`:1674`). No CHECK on any. The public list filters **two** of the five:

```python
# home_products.py:177-180
q = db.query(HomeProduct).filter(
    HomeProduct.is_active.is_(True),
    HomeProduct.is_hidden.is_(False),
)
```

### ⚠️ First: the router is NOT mounted. None of §8 is reachable today.

`app.include_router(home_products.router)` is **commented out** at
`router_registry.py:100`, disabled under MEH-1406 per a brand LOCK (licensed businesses
only), with a two-step re-enable note above it at `:66-80`. So every finding below
describes code that no request can reach. They are recorded as **input to MEH-796's risk
section** — reasons not to re-mount — and explicitly **not** as live defects. The first
draft of this section called 8.1 "a live moderation bypass for as long as the router is
mounted"; that was wrong, and checking `router_registry.py` is what caught it.

**8.1 — The AI gate is create-only; `PUT` bypasses it entirely.**
`create_home_product` 400s on a `REJECTED` verdict (`home_products.py:228-237`).
`update_home_product` (`:275-320`) is a bare `setattr` loop with **no re-moderation at
all** — so a clean listing can be edited to arbitrary content in one extra request and
stays `APPROVED` and live. Compare the two siblings, which both re-run Claude on content
change: `experiences.py:588-608` and `producer_recipes.py:294-310`. This is the only
AI-moderated surface open to consumers rather than vetted businesses.

**8.2 — `FLAGGED` publishes immediately; the two sibling surfaces do not.**
`home_products.py:265` persists the verdict and the list never filters on it, so a
`FLAGGED` listing is public *and* queued for admin (`admin_extra.py:827`). Experiences and
recipes both park `FLAGGED` as `pending` and publish nothing. Three AI-moderated content
types, three different postures for the same verdict, none of them wrong in isolation.

**8.3 — `is_active=False` and `is_hidden=True` are both terminal with no recovery path.**
`DELETE /home-products/{id}` sets `is_active=False` (`:334`). The 3-negative-ratings
auto-hide sets `is_hidden=True` (`:161`). Neither column is in `HomeProductUpdate`
(`schemas.py:3533-3554`) — correct, it stops an owner un-hiding her own penalised
listing — but there is **no reactivate route and no admin unhide route either**. Verified
by enumerating every route in the file (`grep -n "@router\." backend/app/routers/home_products.py`
→ 10 routes, none of them restore either flag) and every home-product route in
`admin.py` / `admin_extra.py` (→ two read-only list queries, `admin.py:1739`,
`admin_extra.py:930`). A listing hidden by three bad ratings is gone permanently, by
accident rather than by decision. Also: neither `available_until` nor `expiry_date` is
filtered, so an expired listing stays on the public list indefinitely.

> **Do not fix any of §8. MEH-796 owns it.**
> **MEH-796 — "Decommission home_products subsystem (Expand-Contract) — router + admin +
> 3 tables + rating job + cascade"** (Backlog, labeled `Bug`) slates this subsystem for
> removal, and the router is already unmounted (above). Hardening unreachable code that is
> scheduled for deletion is the wrong direction twice over. What §8 is good for: 8.1 is the
> strongest single argument against ever re-mounting this router without a re-moderating
> `PUT`, and belongs in MEH-796's description so the decommission is not reversed by
> someone who only reads `router_registry.py:66-80`.

---

## 9. Explicit (non-)machines — the control, and what was not covered

### Explicit and clean, reported so the audit discriminates

- **`registrations.status`** (`registered | cancelled`) — DB CHECK (`models.py:1958-1961`),
  plus a structural CHECK that exactly one of `event_id`/`experience_id` is set (`:1953`).
  `cancel_registration` locks (`registrations.py:375`), is idempotent via
  `was_active` (`:377`), and suppresses the owner email for a past item (`:383`).
  Capacity is computed as `participants_count + registered_counts(...)`
  (`registrations.py:226`) — a deliberate two-source split (host's own WhatsApp tally +
  on-site rows), documented at `schemas.py:4016-4019`, not a drift.
  *One small inconsistency:* the clamp at `experiences.py:565-572` caps
  `participants_count` at `max_participants` **without** subtracting `taken`, while the
  gate at `registrations.py:227` compares the sum — so a host can clamp her way to
  `occupied > max_participants`. `post-launch`, one line.
- **`events`** — has **no** moderation machine at all: a single `is_active` bool
  (`models.py:1802`). An approved business publishes events directly. Asymmetric with
  experiences (community-sourced, moderated), and the asymmetry is the ADR-036 producer
  /organizer distinction, not an oversight.
- **`users`** — `role` (string) + `is_producer` (bool) + `producer_id` (FK) is a
  three-owner fact, and the one dangerous write is **already closed**:
  `admin_extra.py:185-189` refuses `role="producer"` with a 422, because
  `require_producer` gates on `role` alone and a manual bump would mint an orphan
  (`role=producer, producer_id=NULL`). The only writers are the two atomic register paths
  (`auth.py:627-628`, `auth.py:830-832`) and the claim (`producer_claim.py:249-250`), each
  setting all three in one commit.

### Not covered — the time box, stated rather than implied

`kashrut_badge_requests` (incl. the `revoked` sibling-cascade at `admin_kashrut.py:210`),
`category_requests`, `producer_name_change_requests`, `outreach_leads.status`
(`models.py:930`), `reports.status` (`models.py:1725`), `producer_review_checks`,
`availability_state` × `vacation_until` (`vacation_state.py`), `alert_log` /
`favorite_alerts` host-confirm latches, `inbound_messages.bot_replied_at`, and the
`admin_checklist_items.active` flag. Each is a status column with write points I did not
read; absence from this document is not a clean bill.

---

## 10. Staging verification — the queries I could not run

Read-only, one per finding. Run from Git Bash against staging (CC cannot reach it — §0).
A zero count closes the finding; a non-zero count promotes it to an incident.

```sql
-- 1.1  resubmitted businesses whose SLA badge is measured from the first submission
SELECT count(*) FROM producers
 WHERE resubmission_count > 0 AND resubmitted_at IS NOT NULL
   AND submitted_for_review_at IS NOT NULL
   AND resubmitted_at > submitted_for_review_at + interval '2 days';

-- 2.1  funded with too few commits, or cancelled-then-reopened
SELECT g.id, g.status, g.min_participants, count(c.id) AS commits, g.funded_notified_at
  FROM group_buys g LEFT JOIN group_buy_commits c ON c.group_buy_id = g.id
 GROUP BY g.id HAVING g.status IN ('funded','fulfilled') AND count(c.id) < g.min_participants;

-- 3.1  orders carrying two outcomes at once, and stock that came back for a handed bag
SELECT count(*) FROM rescue_orders WHERE status IN ('handed','no_show') AND cancelled_at IS NOT NULL;
SELECT count(*) FROM rescue_offers WHERE qty_left > qty_total - (
  SELECT coalesce(sum(qty),0) FROM rescue_orders o
   WHERE o.offer_id = rescue_offers.id AND o.status IN ('reserved','handed'));

-- 4.1  experiences an admin approved that are switched off (the false-approval set)
SELECT count(*) FROM experiences WHERE status = 'approved' AND is_active = false;
-- 4.2 / MEH-2840  admin decision and Claude verdict disagreeing
SELECT status, moderation_status, count(*) FROM experiences GROUP BY 1,2 ORDER BY 3 DESC;

-- 5.1  would the proposed CHECK pass today?
SELECT count(*) FROM producer_recipes WHERE published AND moderation_status <> 'approved';

-- 6.1  is any producer's denormalized aggregate stale?
SELECT p.id, p.reviews_count, count(r.id) FROM producers p
  LEFT JOIN producer_reviews r ON r.producer_id = p.id AND r.is_hidden = false
 GROUP BY p.id, p.reviews_count HAVING p.reviews_count <> count(r.id);

-- 7.1  the one that matters most: is the receipt pipeline dark?
SELECT status, count(*), min(created_at), max(created_at) FROM outbound_messages GROUP BY 1;
SELECT count(*) FROM outbound_messages
 WHERE status = 'accepted' AND created_at < now() - interval '1 day';

-- 8.x  input to MEH-796 only — the router is unmounted (router_registry.py:100)
SELECT moderation_status, is_active, is_hidden, count(*) FROM home_products GROUP BY 1,2,3;
SELECT count(*) FROM home_products WHERE is_hidden AND is_active;   -- unrecoverable set
```

---

## 11. Cross-cutting patterns

1. **The repo already knows the right answers; they are just not applied uniformly.**
   `funded_notified_at` solves once-only-under-a-flapping-status (§2). `rescue_*`'s CHECK
   constraints make lost races fail transactions (§3). `_reconcile_status`'s SQL-level
   guard makes replay a no-op (§7). `OWNER_TRANSITIONS` is a real transition table (§2).
   Every one of those is a single-machine local solution; none became the house pattern.
   The highest-leverage findings (2.1, 3.1) are each **a route 40 lines from a sibling that
   already does it right**.
2. **Side effects are the best-covered axis, and that is recent and deliberate.** The
   MEH-2852 IndexNow sweep genuinely closed its surface: all three recipe arms, all three
   experience arms, all four group-buy arms, both producer arms. The audit found **no**
   missing IndexNow hop. Email/WhatsApp notifications are consistently post-commit and
   fail-open. The one notification defect found is a *false positive* send, not a missing
   one (4.1).
3. **A fourth stale-claim instance was this audit's own first draft** (§8), caught only by
   reading `router_registry.py`. Recorded because it is the same failure the next item describes, committed by the auditor: a confident claim about a surface's liveness
   that no grep over the surface itself could have falsified.
4. **Stale comments cluster around closed holes, and they are the cheapest real risk.**
   §1.2 (×2) and §4.3 all describe a gap that a later ticket closed. They do not break
   anything; they teach the next session a false model of the system, which is how a
   closed hole gets re-opened "because the comment said it was accepted".
5. **Where a CHECK exists, the machine is clean; where it does not, the machine is held
   together by agreement between call sites.** Compare §3 and §7's discipline against §4's
   32 unconstrained combinations. The correlation is not causal — `outbound_messages` has
   no CHECK and is the cleanest of all — but a CHECK is what makes correctness survive a
   sixth call site added by someone who has not read the first five.

---

_Audit performed read-only. No code changed; no Linear issue created. Overlap search run
against the Mehamakor team before drafting §12-worthy items: **MEH-2840** already owns
§4.2 and **MEH-796** already owns §8; **MEH-2122** may own §7.1. Everything else is
unfiled as of 2026-11-09._
