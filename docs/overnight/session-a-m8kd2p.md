# Session log — parallel-drain **LANE A** (`backend/**` + `tests/**`), id `a-m8kd2p`, 13/08 בוקר

Resume segment. Predecessors read before re-deriving anything (ORDERS §5): `session-a-3xr7kd.md`
(12/08 ערב, the newest), `session-a-w7q3rf.md`, `session-a-k4m2vn.md`, plus `LANES.md`, `ORDERS.md`,
`PARKED.md`, `PROGRESS.md`.

**Environment note, so the next session does not lose a turn to it:** the prompt named a worktree
`../mm-lane-a`. It does not exist — this is a fresh remote container with a single clone at
`/home/user/FoodMamkor`, and the orders files are at `docs/overnight/`, not one directory up.

---

## In-flight ledger — CLOSED, both rows resolved

| PR | Card | Final state |
|---|---|---|
| [#2845](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2845) | MEH-2027 | **MERGED** — squash `f6ca3b7b`, 08:50Z. Post-merge verified off `origin/staging`. ✅ |
| [#2852](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2852) | MEH-2017 | **MERGED** — squash `ea4e0cdb`, 08:58Z. Post-merge verified off `origin/staging`. ✅ |

**Flip-check after both merges** — every MEH id appearing in a branch name or PR body was re-read,
not predicted: MEH-2027 **Done**, MEH-2017 **Done**, and **MEH-2041 still Backlog / never started**,
which is the required outcome since its id appears in neither branch nor body.

---

## ✅ MEH-2027 — the three admin→producer email bodies enter the copy contract

Claimed at intent time: Backlog, unlabelled, **no branch on `origin`** (full `git ls-remote` window,
111 heads, one read — not a paginated guess), no open PR, no merged commit carrying the id. Labelled
`cc-queue` + In Progress before the first edit.

Extracted the three inline f-strings (`admin.py` approve / reject / request-changes) into pure
module-level builders, plus `_rejection_reason_suffix` as a single owner for the «סיבת הדחייה» tail
that the email body and the admin WhatsApp line both need.

**Four corpus entries for three send sites — a deliberate departure from the DoD wording.** The DoD
says "three bodies in `_CORPUS`". `reject` renders **two different bodies** depending on whether a
reason was typed; a corpus carrying only the with-reason case leaves the body an admin sends by
clicking reject without typing anything **unasserted while the count looks complete**. Recorded on
the card rather than done silently.

**The discrimination proof needed its second half.** Injecting a relative path + masculine imperative
reds 2 assertions. That alone is not evidence. The same break against `staging`'s corpus:
**58 passed, 0 failed** — the previous assertion was blind to it.

**Byte-identity was proven with a control that can fail.** Four cases (both branches of the reason
flag), old side transcribed from `git show origin/staging` rather than from the new functions, plus a
deliberately-wrong case that must FAIL. Four bare `OK`s do not distinguish a passing comparison from
a `check()` that compares nothing.

`len(_CORPUS)` 14 → 18; assertions 58 → 74, derived, never stated.

### The defect that was mine

Deleting the old `NOT COVERED` block made the docstring's `Purpose` — *"every user-facing
transactional email"* — read as **true at the exact moment I had proven it false**. Fixed in
`946b0d9b`: both still-uncovered senders named with their cause, `"every"` scoped to `_CORPUS`.

---

## ✅ MEH-2017 — the approval gates run on the row that is actually written

Blocker check first: the card names PR #2785 as blocking. **Verified merged via the API** (11/08
18:02Z), not taken from the card.

`approve_producer` ran both gates against the object fetched at the top of the handler, then called
`_persist_approval`, which on a slug collision rolls back, **re-reads the row** and commits again —
without re-running either gate. Both gates now live in `_assert_approvable`, called from both paths.

**Same test file in both worlds:** `assert 200 == 422` against `origin/staging` in a separate
worktree; `48 passed` after the fix alongside the existing slug/approval/license suites.

### A control I removed, and why that is not a weakening

The first version asserted `calls["n"] == 2` — that the slug is derived a second time. It began
failing **after** the fix, because the gate correctly aborts the retry at 422 *before* the second
`_mint_slug_if_absent`. It encoded the **old control flow**, not a property of the system.

Because "weaken the control until the test passes" is exactly what that looks like from outside, the
judgement was not left with me: the adversarial reviewer was asked to rule **against** me and, after
tracing the flow itself, returned *"legitimate correction, not a weakening"*.

### Residual, reported not silenced

Two other sites write `status="approved"` without the gate — `admin.py:408` (admin-create,
pre-approved by design) and `:555` (the inactive toggle, which only returns an already-approved row).
**Both verified against `staging` myself** before relaying the reviewer's finding; both pre-existing
and unchanged. Named in the PR so nobody reads "one owner" as "every path to `approved` is gated".

---

## Finding filed, not built — MEH-2041

Running the wrapper-chasing inventory MEH-2027's own card recommends surfaced **two further
user-facing senders outside `_CORPUS`**: `marketing.py:197` (newsletter welcome, **with an HTML
part**) and `pending_nudge.py:223` (pending-producer nudge).

**A different cause, which is why it is a separate card and not an extension:** both call
`send_email(` directly, so MEH-1965's original grep *did* see them — the miss happened when the
corpus was assembled, not when it was searched. Fixing one does not close the other.

Filed **without `cc-queue`** — a finding is not self-authorised work. Flagged on the card that
`pending_nudge`'s copy is **locked** (approved verbatim 31/07), so a red there is a report to Sapir,
never a licence to edit a string.

---

## Instrument failures this segment — five, all caught by controls

Worth carrying in full, because every one produced *plausible* output rather than an error.

1. **`ss -ltn | grep 5432` reported "NOT LISTENING"** while Postgres was up and serving. Cause:
   **`ss` is not installed in this container.** The control (`ss -ltn | wc -l` → `0`, then
   command-not-found) exposed it. A missing binary and a dead server print the same thing through a
   grep.
2. **Two `exit code 0`s that meant nothing.** A backgrounded `pytest … | tail -8` reports the
   *pipeline's* exit code. Killed at 67%, it still notified "completed (exit code 0)" with no `F` in
   the output — indistinguishable from a pass. Write the exit code from the pytest process itself.
3. **A red that was an invocation error.** The first fail-by-construction run failed with
   `database "..." does not exist`. Read as an exit code alone, it would have been quoted as the
   proof. Created the DB, re-ran, got the genuine `assert 200 == 422`.
4. **`pgrep -f` used in a wait loop** — the self-matching trap this repo documents. The loop exited
   instantly instead of waiting.
5. **Elapsed time inferred from turn count.** I twice told the user a CI job had run 40–55 minutes
   and began reasoning about the `actions/checkout` hang class. `date -u` said **9 minutes**. There
   is no clock in a turn; if elapsed time matters, measure it.

### The hazard that was found before it corrupted anything

The adversarial reviewer's worktree ran pytest against **the same `mehamakor_test` database** as my
full-suite run — 4 connections, confirmed in `pg_stat_activity`. `conftest.py` does session-scoped
`drop_all/create_all` plus per-test `TRUNCATE CASCADE`, so two concurrent runs corrupt each other and
**a red or a green from either is void**. Fixed by removing the shared resource rather than ordering
access to it — a dedicated database via `TEST_DATABASE_URL`, the same fix `conftest.py` already
documents for xdist workers.

> **For the next session: if you spawn a reviewer that may run pytest, give it its own
> `TEST_DATABASE_URL` in the prompt.** The collision is completely silent, and it degrades both runs.

### One near-miss that was not an instrument failure but a judgement failure

The rule-29 guard flagged a ticket id inside my test's assertion message. My **first** fix edited the
*pasted pytest output in the PR body* so it no longer matched what the test prints. That is
falsifying an evidence quote to satisfy a guard — strictly worse than the guard firing. Corrected by
changing the assertion message itself and re-capturing the real output.

---

## Merge mechanics, because the shape recurs

- **Staging churned roughly every ten minutes** across this segment. Each sync restarts a ~22-minute
  `Backend tests`, so a manual merge loses the race almost every time. What worked: **occupy the
  arming slot with `SQUASH` auto-merge**, then sync on each `behind`, and let GitHub merge in the
  first clean window. Both PRs landed that way.
- **`405 … 2 of 2 required status checks are expected`** appeared once on a manual merge attempt.
  That is the documented behind-base wording under strict policy — remedy is sync, never
  investigation.
- **Vercel was red on every head**, in two different states which must not be conflated: `Ignored`
  early (no `[preview]` token, the configured default) and then `build-rate-limit` (the daily account
  quota, which **no commit fixes**). Non-required either way.
- **The CI calibration reviewer posted nothing on any head of either PR** — verified with
  `get_reviews` (zero) and `get_comments`, not inferred from the check colour. That is the documented
  intermittent no-op: not an approval, not a blocker.
- **#2852 was opened from the Claude Code UI**, not by me, with an auto-generated body that carried
  **bare identifiers for two already-Done cards** and a DoD checklist leaving boxes unchecked that had
  in fact been run. Body replaced with the verified account, and the replacement says why. Checked
  afterwards: neither Done card flipped.
- **Both PRs touched `admin.py`.** After #2845 merged, #2852's sync was verified to carry **both**
  changes (`grep -c` on the pushed head) rather than assumed clean — the stale-ref revert trap.

---

## Cards examined and skipped, with the reason

| Card | Why not |
|---|---|
| MEH-1959 | `cc-queue`, but its own prompt says **"Frontend only — FastAPI headers are a separate card"** → Lane B |
| MEH-1906 | STOP in the title; Phase 0 closed by the predecessor segment (PR #2839) |
| MEH-1806 | PR #2781 open behind a DO-NOT-MERGE marker — blocked-on-Sapir list |
| MEH-2029 | Lane B owns the font fix; PR #2838 open (merged during this segment) |
| MEH-2037 | live foreign branch on `origin` → another lane. Merged as #2837 during this segment |
| MEH-2023 | whole-session dispatch card — rule 28, never taken wholesale |
| MEH-2015 · 2034 · 2032 · 1991 · 1977 · 1978 | frontend → Lane B |
| MEH-2021 | blocked by its own text on MEH-2020, still `needs-sapir` / undecided |
| MEH-1976 · 1754 · 1511 · 1625 · 1868 · 1980 · 1943 · 1949 · 1904 · 1244 | `needs-sapir` / `not-cc` — B1 hard exclude |
| MEH-215 · 217 · 1249 · 1974 | Lane C (e2e / VRT tooling) |
| MEH-1981 | legal drafts for a lawyer — B3 gate 3 |
| MEH-1925 | Cloudinary console — gate 2, Sapir's |

**PARKED.md holds no Lane A backend card that is now unblocked** — the parked set is Lane C tooling,
frontend, or Sapir-gated.

### Still-live Lane A candidate for the next session

**MEH-2007** — check-then-act race on the review-ready admin ping (`producer_me.py`, snapshot `:317`
→ fire `:518`). Unclaimed as of this segment. It needs a **design decision** (row lock vs
notification dedup) which ORDERS §1 puts with the session, and a concurrency test demonstrated red
first. The card's own body already corrected its line range once — re-measure `file:line` at work
time rather than trusting it.

---

## Lane-boundary calls — stated, not assumed

Only `backend/**` and `tests/**` touched by the two code PRs. `docs/CHANGELOG.md` and `HANDOFF.md`
untouched — Lane C's, and rule 31 keeps them off a code branch regardless. This log lands in its own
docs-only PR behind carrier card MEH-2050.

---

## CHANGELOG material for Lane C to backfill

- **13/08 — MEH-2027: שלושת מיילי האדמין→בעלת-העסק נכנסו לחוזה הקופי, וההוכחה נזקקה לחצי השני.**
  שלושת הגופים חולצו ל-builders טהורים; זהות בייט-בייט הוכחה בארבעה מקרים מול המקור ב-`origin/staging`,
  **עם בקרה שנכשלת בכוונה** — בלעדיה ארבעה `OK` אינם מבחינים בין השוואה שעברה לבין בדיקה שלא השוותה
  כלום. **הוכחת ה-discrimination הורצה בשני הכיוונים:** השבירה מאדימה 2 assertions בקורפוס החדש,
  **ואותה שבירה מול הקורפוס של `staging` מחזירה 58 passed**. נכנסו **ארבע** רשומות לשלושה אתרי שליחה,
  כי `reject` מרנדר שני גופים שונים ורק אחד מהם היה נבדק.
- **13/08 — MEH-2017: שערי האישור רצים על השורה שנכתבת בפועל.** מסלול ה-retry ב-`_persist_approval`
  קרא מחדש את השורה ולא הריץ שוב אף שער — כלומר הוא היה **המקום היחיד בקוד שיכול לאשר עסק ממתין בלי
  לעבור בשער**. שני השערים אוחדו ל-`_assert_approvable` הנקרא משני המסלולים; המסלול הראשי ללא שינוי
  התנהגותי (מחרוזות אומתו בייט-בייט ב-`repr()`). **בקרה אחת הוסרה במכוון** — `calls["n"] == 2` תיארה
  את זרימת הבקרה הישנה והחלה להיכשל דווקא אחרי התיקון; ההכרעה נמסרה ל-reviewer שנתבקש לפסוק נגדי.
- **המחלקה שחזרה חמש פעמים במקטע אחד: מכשור שמחזיר תשובה סבירה במקום שגיאה.** `ss` שאינו מותקן
  ונקרא כ"אין מאזין" · שני `exit 0` מ-pipeline שנהרג · אדום שהוא שגיאת הפעלה (`database does not
  exist`) · `pgrep -f` שתופס את עצמו · וזמן שחלף שהוסק ממספר תורות במקום מ-`date`. כולם נתפסו ע"י
  בקרה, אף אחד לא ע"י אינטואיציה.
