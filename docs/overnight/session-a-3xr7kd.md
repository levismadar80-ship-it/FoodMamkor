# Session log — parallel-drain **LANE A** (`backend/**` + `tests/**`), id `a-3xr7kd`, 12/08 ערב

Resume segment. Predecessors read before re-deriving anything (ORDERS §5): `session-a-k4m2vn.md`
(morning), `session-a-w7q3rf.md` (afternoon exit), `LANES.md`, `ORDERS.md`.

---

## In-flight ledger

| PR | Card | pushed | gate state | next revisit trigger |
|---|---|---|---|---|
| [#2839](https://github.com/levismadar80-ship-it/FoodMamkor/pull/2839) | MEH-1906 | 20:36Z (`6275a1f3`), re-synced 20:41Z (`7e90dea4`) | first pass: `Deploy gate` ✅ · `Repo guards` ✅ · `Branch name gate` ✅ · `Env drift` ✅ · `DO-NOT-MERGE gate` ✅. Staging moved 2 commits mid-flight → merged `origin/staging` (rule 25) and the gates restarted | different-model review returning |

**This log rides PR #2839 rather than its own carrier PR.** LANES.md §5 asks for a docs-only PR
behind its own card; #2839 *is* docs-only and its branch name supplies a legal ticket id, so the
mechanism is satisfied and only the "own card" half is stretched. The reason is the in-flight cap of
1 set for this drain — opening a second PR to carry one markdown file would breach it. Stated here
rather than left for a reader to notice.

---

## ✅ MEH-1906 — by-slug Phase 0 · PR #2839

Claimed at intent time: the card was **Backlog, unlabelled, no branch on `origin`** — verified by
`git ls-remote` over the full head list in one window, not by a paginated guess. Labelled
`cc-queue` and moved to In Progress before the first edit.

**The card had grown well past its title.** It opens as a 429-volume measurement, but the 12/08
fold of MEH-2030 added a second, larger question — a `RecursionError` on
`/producers/by-slug/{slug}`, reported by Sentry at `backend/app/middleware.py:142`, with the card
naming `log.debug` at `:141` as an explicitly **unverified** hypothesis. That is the half that was
costing CI on unrelated PRs, so that is the half I measured.

### The result is three refutations, and the first one matters most

| # | Hypothesis | Verdict | How |
|---|---|---|---|
| 1 | `log.debug` at `:141` self-logs ⇒ recursion | **refuted** | branch forced, control shows it entered 3/3, all 200 |
| 2 | handler stack depth near the ceiling | **refuted** | sync `def` ⇒ threadpool ⇒ depth 7–10 of 1000; async side 17–22 |
| 3 | sentry span wrappers accumulate per boot | **refuted** | `_enable_span_for_middleware` carries an explicit already-patched guard |

**Hypothesis 1 was one session away from becoming a prescribed fix on a frame that is not the
cause** — the exact MEH-1771 → MEH-1792 chain. The `:141` branch only runs when the scope-bind
throws, so no ordinary request touches it; forcing it needed `configure_scope` replaced with a
raiser, Sentry initialised, `ENV=staging` for the JSON renderer, **and `LOG_LEVEL=DEBUG`** — without
the last one `log.debug` is swallowed by the filtering bound logger and the experiment "passes"
having run nothing.

### Three control failures, all mine, all recorded rather than tidied

This is the part worth carrying, because in every case **the instrument was right and my
expectation was wrong** — which is the only way to find out that the instrument works.

1. **Depth probe:** control asserted `_nest(10)` costs `+10`. It costs **`+11`** (ten recursive
   calls = eleven frames). Fixed the expectation, not the control. "Adjust the control until it
   passes" is precisely the move that turns a control into decoration.
2. **Handler probe returned `None`** — the route decorator captures the endpoint at *import* time,
   so replacing the module attribute afterwards records nothing. `None` reads exactly like a clean
   run. Re-pointed at a callee (`attach_badge_fields`, `producers.py:303`).
3. **Wrapper-accumulation probe:** first version walked `__wrapped__`, which sentry never sets, so
   it reported `1` **unconditionally**. Rewritten to walk closure cells, whose control then expected
   1/2/3 and failed at 1-after-2. The correct answer is **1/1/1**, and what produced it was
   **reading the vendor source**, not another experiment — ORDERS §3.0 instance nine, live.

### Infrastructure, for the next Lane A session

- Local Postgres 16 works, and the prior session's note is right that the **whole scratchpad path
  chain** needs `chmod 755`. Two additions: `pg_ctl -l` needs a log path **postgres can write**
  (a subdirectory `chown`ed to postgres is the cheap fix), and `chmod 777` in a compound command
  trips the bash safety hook — split the commands and use 755.
- `ENV=staging` makes `startup.py:394` **hard-fail** without `RESEND_API_KEY`. Set a dummy or the
  app never boots and every result is void.
- `mw._sentry_sdk is not None` is **not** a discriminator for "Sentry is on" — sentry-sdk is a hard
  dependency, so it is true in both modes. Use `sentry_sdk.is_initialized()`.

---

## ✅ MEH-1876 — verified merged, handed to Sapir

Not a build: an anti-stale check that resolved a card. PR #2790 **merged 12/08 12:44:05Z**, and the
change is live on `origin/staging` (read from the files: `producers.py:64-71`,
`producers/page.jsx:26/38/66`). The only outstanding DoD item is the two-direction staging
measurement, which needs authenticated Railway writes — gate 2.

Commented the exact commands on the card, added `not-cc`, removed `cc-queue`. **The label change is
the point:** while it read `cc-queue` the card was selected by every sweep and returned the same
conclusion each time — ORDERS §5's staleness cost, paid repeatedly.

---

## Cards examined and skipped, with the reason

Recorded so the next sweep does not re-derive these.

| Card | Why not |
|---|---|
| MEH-2021 | still blocked by its own text (*"לא לפני MEH-2020"*). **Re-checked, not taken on trust:** MEH-2020 is Backlog, `needs-sapir`, undecided |
| MEH-1986 | PR #2778 open and pushed minutes before the sweep — live foreign lane |
| MEH-1806 | PR #2781 open behind a DO-NOT-MERGE marker |
| MEH-1991 | Leaflet double-init on `/` — **frontend, Lane B** (the prompt flagged it as a candidate; verified and left) |
| MEH-2029 | Lane B owns the `next/font/local` fix; PR #2838 already open |
| MEH-2015 | frontend + `he.json`; complete map already on the card from the afternoon segment |
| MEH-1981 | frontend copy + legal drafts for a lawyer — B3 gate 3 (brand/legal ruling) |
| MEH-1978 | dashboard widget, Lane B |
| MEH-1976 · 1754 · 1511 · 1625 · 1868 · 1980 · 1764 | `needs-sapir` — B1 hard exclude |
| MEH-1974 · 217 · 215 | Lane C (VRT / e2e tooling) |

---

## Lane-boundary call — stated, not assumed

`docs/audits/by-slug-request-volume.md` is under `docs/**`, which LANES.md assigns to Lane C. Written
here because the card names it as its single `<file_locations> NEW:` and it is the product of a
backend investigation, not docs work. Declared in the PR body, same as the morning segment declared
`tests/`.

`docs/CHANGELOG.md` and `HANDOFF.md` untouched — Lane C's, and rule 31 keeps them off a code branch
regardless.

---

## CHANGELOG material for Lane C to backfill

- **12/08 — MEH-1906 Phase 0: שלוש הפרכות, והחשובה שבהן היא של הכרטיס עצמו.** ההשערה שנרשמה בכרטיס
  לשורש ה-`RecursionError` — `log.debug` ב-`middleware.py:141` כ-logging filter שמלוגג את עצמו —
  **נבדקה ישירות ונשללה**: הענף נכפה (עם `LOG_LEVEL=DEBUG`, שבלעדיו הוא נבלע), נלקח 3/3 לפי מונה
  בקרה, וכל הבקשות חזרו 200. נשללו גם מיצוי מחסנית (ה-handler סינכרוני ⇒ threadpool ⇒ עומק 7–10
  מתוך 1000) והצטברות עטיפות span של sentry (יש שומר `not_yet_patched` מפורש ב-SDK).
  **שורש התקלה נותר לא ידוע — עמדה גרועה יותר ממה שהכרטיס שיקף, והמסמך אומר זאת.** לוגי production
  לא נגישים מה-sandbox, ולכן טבלת האפשרויות אינה ממליצה על אף אפשרות. **שלוש בקרות נכשלו מול
  הציפייה שלי ולא מול המכשיר**, כולל probe שהחזיר `1` ללא תנאי כי הלך אחרי `__wrapped__` שסנטרי
  לעולם אינו מציב — נרשמו במסמך במקום להיות מנוקות.
