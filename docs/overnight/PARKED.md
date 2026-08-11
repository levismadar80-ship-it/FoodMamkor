# Overnight sweep v2 — dead-letter queue

> A parked task is one that hit the 30-minute timebox, a second failed attempt
> on the same problem, or a PERMANENT failure class (no_stall_architecture §3/§5).
> Parking is per-task; the sweep continues.

Session: 2026-08-07 → 08.

---

## Parked: **none**

**No task was parked tonight, and no circuit breaker opened.** Nothing hit the
timebox, no problem took a second failed attempt, and no failure signature
repeated across tasks.

That is a real outcome and not a claim of a clean sweep — the sweep was short on
*eligible* work, not on obstacles. See PROGRESS.md: four of the eight seed items
were already finished before the session started, so the queue drained by
already-being-done rather than by being worked.

## One near-park, recorded because it was close

Recovering the producer path for the CLS dispatch took three attempts:

1. `grep` over `HANDOFF.md` / `CHANGELOG.md` — no hit.
2. `curl` against live staging to read an id off `/producers` — **blocked**, and
   the block is worth writing down: `staging.mehamakor.online` sits behind
   **Vercel SSO** from the CC sandbox (`302` → `vercel.com/sso-api`). This is a
   *different* barrier from the documented `*.up.railway.app` egress deny in
   CLAUDE.md, and it is not currently recorded anywhere in `.claude/rules/`.
3. Workflow run metadata via `list_workflow_runs` — inputs are **not** carried in
   the run object.

The fourth attempt worked: the harness logs `path=` at startup
(`qa-meh1853-cls.mjs:689`), so the prior run's job log has it verbatim. Recorded
because the next session will hit the same wall, and because attempt 2's finding
is reusable.

**Timebox status at resolution:** ~6 minutes on that sub-task, well inside the 30.
Had attempt 4 failed, the park was already drafted: merge the instrument, hand
Sapir the one-line dispatch, and let the reading happen in the morning.

---

## Circuit breaker

No signature reached the 3-park threshold. Nothing quarantined. No half-open
probe needed.

---

## PARKED (added at end of night): merging PR #2678 — the docs-only backfill

**Task:** merge the docs-only session log. **Status: parked after 2 attempts, per
the max-2 rule. The PR is open, pushed, and complete — only the merge is blocked.**

**The block:**

```
PUT /repos/.../pulls/2678/merge -> 405 Repository rule violations found
2 of 2 required status checks are expected.
```

**Why that is strange, and why I stopped instead of working around it** — both
required contexts report `success` on the head SHA (`2082286c`):

| check | id | conclusion |
|---|---|---|
| `CI gate (required)` | 93010793341 | **success** |
| `Deploy gate (required)` | 93010760760 | **success** |

`E2E gate` is also `success` (Playwright correctly `skipped` on a docs-only diff).
So the ruleset is reporting as `Expected` two contexts that have in fact
completed successfully.

**One difference from PR #2676, which merged minutes earlier with no trouble:**
#2678 is **docs-only**, so every named job under both aggregators `skipped`. That
is the documented and intended path (`testing.md` → "Required status checks +
docs-only merge", MEH-716) — a skipped leg is supposed to let the aggregator
report `success`, which it did. The aggregators are green; the *ruleset* is not
accepting them. I could not close that gap from the evidence available.

**What I did NOT do, deliberately:** no no-op commit to re-trigger the gates, no
edit to PR metadata, no `force`. Rule 30 — a blocking gate is a STOP, and
"re-trigger until it goes through" is precisely the neutralisation that rule
forbids. Waiting once and retrying once is the sanctioned remedy and it is what I
did; it did not clear.

**Failure class:** ~~PERMANENT for this session — it needs a ruleset inspection
(GitHub settings), which is Sapir's surface. Not transient, so no further retry.~~

> ## ❌ CORRECTED 2026-08-08 — that diagnosis was WRONG. It was TRANSIENT.
>
> **PR #2678 merged on night 2** (`e1c3af52`) with no ruleset change, no settings
> change, and nothing done by Sapir. The remedy was simply **waiting longer for the
> required gates to register.**
>
> What night 2 measured: immediately after pushing, `CI gate (required)` read
> `status: queued` on the head SHA, and the merge API answered with the identical
> *"2 of 2 required status checks are expected"*. After the gates completed
> `success`, the very next merge attempt succeeded. That is the documented
> transient — `.claude/rules/testing.md`, *"Transient 'waiting for status /
> expected' right after push = the required gates are still registering"* — and it
> was in the rules the whole time.
>
> **Why the night-1 call still looked defensible, and why that is the lesson.** On
> night 1 both gates *did* read `success` when I queried them, which is what made
> me rule out the transient. But a check-run reporting `success` and the **ruleset**
> having ingested it are two different facts, and I treated the first as evidence of
> the second. The correct next step was another wait, not a classification.
>
> **The concrete cost of getting it wrong:** it wrote "needs a ruleset inspection —
> Sapir's surface" into the repo, pointing a human at a GitHub setting that was
> never broken. A confident wrong cause in a log becomes someone's wasted hour. The
> park itself cost nothing; **the diagnosis attached to it did.**
>
> **What to keep:** refusing the no-op re-trigger commit (below) was still right,
> and is unaffected by this correction. The error was in the label, not the
> restraint.

**Cost of leaving it was none, and it was collected on night 2.** The branch stayed
pushed with the PR open, and the whole log merged intact once the gates settled.

**Not a circuit-breaker event** — one signature, one task, and it resolved on its
own terms.

---

# Session s4-r5tl1v (2026-08-08 evening)

## PARKED: MEH-1941 — flip `backed: true` on the two diet pages

> ## ✅ RESOLVED 2026-08-08 — unparked and shipped. Do not re-take this card.
>
> Measured at 21:12Z (session s5): **MEH-1941 is `Done`**, `completedAt`
> `2026-08-08T20:28:16Z`, closed by **PR #2701** — *"fix(diet): open
> no-added-sugar and low-carb — the backend filters landed"*.
>
> The park below diagnosed itself correctly: failure class **resource**, *"it will
> succeed on a fresh session with no changes to anything"*. It did, roughly two
> hours later. The entry is kept rather than deleted because the analysis under it
> — especially the correction to the card's prediction about the second test — is
> what made the follow-up session cheap.
>
> **The one item that did NOT resolve itself:** the orphan branch
> `feature/meh-1941-flip-diet-backed` (one empty claim commit, no PR). It could not
> be deleted from a CC session because `check-branch-name.sh` parses the delete
> argument as a branch name. **Still Sapir's, still one line, still not urgent.**

**Not blocked by anything in the ticket.** Parked on **session context budget**: I
claimed it, verified its preconditions, and then did not have the room left to
implement it to the standard the card asks for (test surgery + a
failing-by-construction run + full suites + a different-model review). Stopping
there beats a rushed job on a test whose whole purpose is to stay discriminating.

**Failure class: NOT transient, NOT permanent — resource.** It will succeed on a
fresh session with no changes to anything. Nothing needs fixing first.

### What was verified (so the next session does not redo it)

Both blocking preconditions are **met**, checked against `origin/staging` rather
than assumed:

- **1935 (frontend):** `frontend/lib/diet-pages.js` exists, `backed: false` at both
  entries — `no-added-sugar` `:64`, `low-carb` `:71`, exactly as the card says.
- **1934 (schema):** `backend/alembic/versions/20260807_1200_a2f7d4c8e153_meh1934_product_no_added_sugar_low_carb.py`,
  plus `no_added_sugar` references in `models.py`, `schemas.py`,
  `routers/producers.py`, `producer_contract_snapshot.json`.

### ⚠️ The card's prediction about its second test is wrong

It says `DietLandingPage.test.jsx:170-173` *"does not fail, but loses its subject"*.
**It will fail.** That test mocks a passing count (`listing(DIET_PAGE_MIN * 10)`) and
asserts `meta("no-added-sugar")` **rejects**; once the slug is backed both gates
pass, nothing rejects, and `.rejects` goes red. The prescribed remedy (a synthetic
unbacked fixture) is still right — the symptom description is not, and someone
following it will think they broke something.

### The route that avoids mocking the config module

`vi.mock("@/lib/diet-pages")` forces a reimplementation of `getDietPage` inside the
mock — a **copy**, which is what `.claude/rules/testing.md` warns against. Not
needed: the page resolves through the real functions
(`page.js:95-96` → `getDietPage()` → `isDietPageBacked()`), `DIET_PAGES` is a mutable
array, and `BACKED_DIET_PAGES` is computed once at import. So `push` a synthetic
`backed: false` row onto `DIET_PAGES` **inside the single `it`** with a `pop()` in
`finally`: the real lookup finds it, the real gate rejects it, `BACKED_DIET_PAGES`
is unaffected, and the exact-slug-list assertion at `:124` never sees it.

Still unchecked: the loop at `:380` (sitemap exclusion), step 4 of the card's prompt.

### Claim state — and one thing I could not do

The card is **Backlog, no `cc-queue`** — genuinely unclaimed.

**The branch `feature/meh-1941-flip-diet-backed` could NOT be deleted from this
session**, and I said on the card that it had been before catching myself; corrected
there. `check-branch-name.sh` (rule 3 / MEH-1141) blocks both delete forms because
it parses the delete argument as a branch name:

```
git push origin --delete <branch>              → Blocked: push branch '--delete'
git push origin +:refs/heads/<branch>          → Blocked: push branch 'refs/heads/…'
git push origin :<branch>                      → not blocked, but "remote end hung up"
```

I did not work around the hook (rule 32). The branch holds **one empty claim commit**
and no PR, so nothing is lost; it is adoptable under ORDERS §2 after ~21:19Z, or the
next session can simply cut a differently-named branch off `origin/staging`.
**Left for Sapir: delete the orphan branch.** One line, not urgent.

## Circuit breaker

No signature reached the 3-park threshold. Nothing quarantined.

---

# Session s5-k2m9xp (2026-08-08 night)

## PARKED: MEH-999 · MEH-215 · MEH-217 · MEH-1897 — all four on one credential gate

**Failure class: PERMANENT for this session — ORDERS §1.2 gate 2 (credentials
Sapir holds).** Not transient, not resource. No retry will clear it and none was
attempted after the second confirmation.

**The block, verbatim, reproduced ~20 minutes apart:**

```
mcp__Linear__get_issue MEH-999
  -> MCP server "Linear" requires re-authorization (token expired)
```

The Linear OAuth token expired **mid-session** — the first three `get_issue` calls
of the run succeeded, so this is an expiry during the sweep and not a session that
started without access. A non-interactive session cannot run the OAuth flow.

**Why the cards were not built anyway.** The seed list in the prompt names all
four, and their titles are known. That is not enough: ORDERS §5 states any queue
list in a prompt is *"a HINT, never state"*, and workflow.md's Lane B eligibility
gate is **derived from the card's own description**, which could not be read.
Building from a one-line title is guessing at requirements — rule 4's explicit
anti-pattern — and the B3 gate (unresolved questions to Sapir? denied action
required? brand ruling needed?) is unanswerable without the body. **Skipping was
the rule-compliant outcome, not caution.**

**Nothing was claimed.** No `cc-queue` label was applied (Linear was down, so the
audit trail ORDERS §5 requires could not be written), no branch was cut for any of
the four, and `git ls-remote` confirms none exists.

**To unpark:** re-authorize Linear via the claude.ai connector settings. Every one
of the four is then immediately workable — no repository state blocks them.

## Circuit breaker

One signature (`Linear token expired`) across four cards. **This is one blocker
counted once, not four parks toward the 3-park threshold** — the threshold exists
to catch a repeating *failure mode*, and four cards sharing a single credential
gate is one fact about the environment. Nothing quarantined.

---

# Session s6-t7w2nq (2026-08-09 morning)

## PARKED: MEH-217 — admin panel suite. **Structural, not a blocker in the code.**

> ## ❌ CORRECTED 2026-08-09 (session s7) — the premise below is FALSE. The secret IS wired.
>
> **Measured from the file, not remembered:**
>
> ```
> .github/workflows/e2e.yml:231-233   (step "Run E2E tests")
>   DEMO_OWNER_PASSWORD / DEMO_CONSUMER_PASSWORD / DEMO_ADMIN_PASSWORD
> ```
>
> The park's load-bearing sentence — *"The default `e2e.yml` job is exactly that
> shape (… **no `DEMO_*` secret exported**)"* — is wrong. Sapir applied
> `docs/ci/e2e-auth-fixtures.patch.md` in `21ccecc` on **26/07**, and
> `frontend/e2e/CLAUDE.md` says so outright: *"Authenticated coverage runs on
> every PR"*, citing run `30220096957`, which wrote the `admin` storageState and
> executed all 6 `25-role-reachability` tests. So an admin spec **runs** in CI;
> it does not skip, and no `e2e.yml` edit is needed.
>
> **How the error was made, because it is the reusable part.** The park read
> `global-setup.ts:72-80` — correctly — and concluded the localhost target means
> no fixture. It never asked the second question: *does the job supply the
> password anyway?* "The secret does not exist" and "I did not look where it
> lives" produce identical evidence. That is the same class as s6's own three
> retractions, made one day later, in a park written by the session that wrote
> them.
>
> **The blocker inverted rather than vanished — CI yes, LOCAL no.** The CC
> sandbox has no backend (Railway egress denied, MEH-360; a local Postgres was
> blocked by the sandbox on 09/08), so the specs are CI-valid but cannot be shown
> green before push. **Corrected failure class: `resource` (local evidence), NOT
> `permanent`, NOT a credential gate.** Nothing needs Sapir.
>
> **To unpark:** a session that can reach a seeded target — `TEST_URL=<staging |
> preview>` with `DEMO_ADMIN_PASSWORD` + `VERCEL_AUTOMATION_BYPASS_SECRET` (row 3
> of the table in `frontend/e2e/CLAUDE.md`) — or a sandbox where a local stack
> comes up. Full chunk plan is on the card.
>
> **What survives from the park below, unaffected:** the §1A finding (already
> covered by `flows/25` — do not rewrite), and the ruling that 2F and 3C
> delete/promote stay out of CI.

**Failure class: ~~PERMANENT for CC — ORDERS §1.2 gate 2 + MEH-671~~ → see the
correction above.** Not transient, not resource. No retry clears it and none was
attempted.

**Nothing in the repository blocks writing the specs.** What blocks *delivering
the card's DoD* is that the specs could only ever `skip` in CI:

`global-setup.ts:72-80` deliberately does not provision `e2e/.auth/*.json` when
the target is localhost and no `DEMO_*_PASSWORD` is set. The default `e2e.yml`
job is exactly that shape (`PLAYWRIGHT_BASE_URL=http://localhost:3000`, no
`DEMO_*` secret exported). Every admin spec therefore reports `skipped`, and a
skipped leg **passes** the aggregator.

The card's DoD asks for *"green locally **and registered in CI**"*. The second
half needs either a repository secret or an `e2e.yml` edit — **both Sapir's**
(secrets are gate 2; `.github/workflows/**` is CC-deny, MEH-671). Shipping six
tabs of always-skipping specs would manufacture the exact "green with two
possible causes" that `testing.md` documents at length, so it was not done.

**Also established, and it removes work rather than adding it:** §1A
(access control, all three roles + the guest round-trip) is **already covered in
full** by `e2e/flows/25-role-reachability.spec.ts`. Re-verified independently
against the live code — all 7 admin routes redirect anonymously with the return
path preserved; a logged-in non-admin gets `data-testid="access-denied"` with
**zero `/api/admin` calls**. Do not rewrite that chunk.

**To unpark:** Sapir decides between (a) wire `DEMO_ADMIN_PASSWORD` into the E2E
job, or (b) restate the DoD as local-only. A chunk breakdown for either path is
on the card, including the two sub-sections that should stay out of CI entirely
(§2F delete, §3C promote/delete — the card's own reasoning, never reversed by the
08/08 ruling).

**Not claimed.** No `cc-queue` label, no branch, no code.

## PARKED: MEH-215 — registration journey suite. **Resource.**

**Failure class: NOT transient, NOT permanent — resource (session context).** It
will succeed on a fresh session with no changes to anything, and unlike MEH-217
it needs **no credential fixture**: the whole wizard was walked today with none.

**Not claimed.** No `cc-queue`, no branch (`git ls-remote` confirms), no PR.

**The handoff is in `session-s6-t7w2nq.md` §6** and is the reason this park is
cheap: the five step headings verbatim, the twelve field **`id`s** (they are
`id`, not `name` — a `[name=...]` locator silently matches nothing), the
`aria-pressed` category convention, the empty-submit alert string, and the fact
that the final advance button is `הצטרפו ←` and not `הבא ←` so a `הבא`-only
regex stalls without failing. Journey A is writable from that list alone.

**Still open and worth settling first:** `covered-by-stub` has no defined form
(ORDERS §1.5 records that `grep` found no existing pattern in any `*.md`). Settle
it before assertions start carrying it, or it will drift into three spellings.

## Circuit breaker

No signature reached the 3-park threshold. Two parks, two different failure
classes, nothing quarantined.

---

# Session s7-q4n8vz (2026-08-09 midday)

## PARKED: MEH-217 — re-parked with a **corrected** failure class.

**Failure class: `resource` (local evidence), NOT permanent, NOT a credential
gate.** See the correction block on the s6 entry above: `DEMO_ADMIN_PASSWORD` has
been exported into the E2E job since `21ccecc` (26/07), so admin specs **run** in
CI and no `e2e.yml` edit or new secret is needed. Nothing here is Sapir's.

**What actually stopped the work:** this sandbox cannot produce a green local
run. There is no backend — `*.up.railway.app` egress is denied (MEH-360) and a
local Postgres start was blocked by the sandbox on 09/08 (s6 managed one the day
before, so this is a per-session property, not a standing one — retry, don't
assume). ORDERS §3 wants pasted evidence, and six tabs of specs that were never
executed is the "green with two possible causes" this card has already paid for
once.

**Not claimed beyond a label.** `cc-queue` applied while investigating, no
branch, no code (`git ls-remote` confirms). Chunk plan, run recipe and the
CI-exclusion ruling for 2F / 3C are posted as a comment on the card.

## NOT parked, and worth stating: MEH-215 is only 1/4 done

Journey A shipped. **B (Google OAuth), C (login / forgot-password) and D
(favorites) are unwritten** — stopped on session context, not on any blocker.
C and D need a session, so they carry the same local-evidence constraint as
MEH-217; B additionally needs the mocked-OAuth-callback convention, which is
still undefined.

**The s6 handoff in `session-s6-t7w2nq.md` §6 does not apply to journey A** — it
documents the **producer** wizard (`/register/producer`, 5 steps), and journey A
is the **consumer** form at `/register` (one page, 3 fields). Both are real; they
are different surfaces. That handoff is still exactly what a producer-journey
card needs, so it should not be read as spent.

## Circuit breaker

No signature reached the 3-park threshold. One park, one failure class, nothing
quarantined.

---

# Session s8-r9k3mt (2026-08-09, continuous drain)

## ~~PARKED: MEH-160 — view dedupe~~ · **UNPARKED AND FINISHED 09/08 (s9). PR #2721.**

> **Resolved.** All seven readers of `producer_page_views` now dedupe through one
> expression in `services/analytics.py`; the CI red is closed; both Sapir-gated
> questions are drafted on the card with the lexicon-safe default implemented, so
> neither blocks. A different-model review found one more partial conversion — the
> admin reader deduped cross-producer while its comment claimed otherwise — fixed
> with `scope_col` plus the test that pins it. Full account: `session-s9-v3xq8w.md`.
>
> The park entry below is kept verbatim as the record of what was known at park time.

### Original park entry (09/08, s8)


**Failure class: NOT transient, NOT permanent — scope.** The mechanism works and is
verified; what is unfinished is its blast radius. A fresh session finishes it from
the PR comment alone.

**The finding that defines the park, and it is mine:** `producer_page_views` feeds
**six** dashboard metrics. I deduped **three** (`profile_views`, `search_appearances`,
`views_by_day`) and left three raw — and all six render on the same screen. The
reviewer (different model, isolated worktree, pinned `e1250a34`, everything executed
against real Postgres) found four blockers:

1. `test_analytics.py:305` fails — `_seed_view` defaults to one shared hash, so two
   same-day search rows dedupe to 1. **This is the CI red.**
2. `weekly_trend` compares deduped `last_7d` against raw `prev_7d_views` → reads
   **"down" on perfectly flat traffic**. Permanent regression.
3. `conversion_rate` = raw clicks ÷ deduped views → **200%**, hidden by MEH-1118's
   `clampPercent`, so the API contract is wrong while the screen looks right.
4. `profile_views_tooltip` in both locales now states the **inverse** of the code
   ("including repeat visits"), and the MEH-1557 guard is one-directional so it
   stays green.

**Two need decisions, not patches:** (3) is a contract choice — dedupe the numerator
or rename to "clicks per unique viewer" and stop clamping; (4) is approved copy in
two locales plus inverting the guard.

**What is already proven and must not be re-derived:** the SQL composes correctly on
PG15 (the `FILTER` keeping `(day, NULL)` out of the tuple arm is load-bearing and
measured); the two-directional discrimination claim **holds** under independent
rebuild of both rival implementations (old impl 5 failed, naive `COUNT(DISTINCT)` 2
failed, shipped 8 passed); `search_appearances ≤ profile_views` is preserved; and the
rotating-salt hazard is **moot** under the day grain.

**The lesson worth more than the ticket:** I ran the two obvious analytics test files,
saw them pass, and treated that as coverage — an hour after writing on MEH-1952 that
running the probe that cannot fail is the error to avoid. The full suite was the only
probe that could have caught finding 1, and I ran it only after CI did.

## Not parked, resolved this session

- **MEH-1952** — ×10 full-suite matrix: `EventExperienceAddress` **0/10**. A different
  file, `CityProfileBridge.test.jsx`, failed **1/10** with the same signature. Reported
  on the card with both options (re-point vs close-and-open); neither taken — that is
  Sapir's call.
- **MEH-1925** — answered (`disabled customer` on three endpoints); Console is hers.
- **MEH-1905** — Phase 0 closed; the staging `db_init` failure is **data drift, not
  code** (seed unchanged 31/07, violations from 02/08), and Sentry's silence reduces to
  one unfiltered dashboard query (`ENV` defaults to `development`, not `production`).

## Circuit breaker

No signature reached the 3-park threshold. Nothing quarantined.

---

# PARKED 2026-08-11 (lane `se-2xk7m`) — PR #2747, MEH-215 chunk C

**Task:** merge the adopted orphan PR for journey C. **Status: parked in DRAFT after
the 2-attempt rule. The PR is complete and must NOT merge** — its own new specs are red
in CI.

## The block

The suite ran for real for the first time (run `31492087550`, 4.7 min, 233 executed):

```
1 failed   [mobile]  30-login-journey-c.spec.ts:286  C2 — session survives a new tab
1 flaky    [desktop] 30-login-journey-c.spec.ts:209  C2 — correct credentials … redirect
231 passed, 29 skipped
```

**Every non-passing test is in the file this PR adds.** No unrelated spec is red, so the
standing environmental explanation (Cloudinary / MEH-1948) does not cover it.

## Ruled out — measured, not assumed

| Hypothesis | Verdict |
|---|---|
| Route stubs don't match in CI (`**/api/auth/login` vs a Railway URL) | **Dead.** `lib/api.js` sets `baseURL: "/api"`; the browser always requests same-origin and Next rewrites server-side. `page.route` intercepts before that, identically in both environments. |
| `login()` awaits something unstubbed | **Dead.** `auth-context.js:128-131` calls exactly `/auth/login` then `/auth/me`, both stubbed. |
| The specs are wrong | **Dead.** 18/18 green locally, `--repeat-each=3`, both projects, 40.4s. |
| A flake a re-run clears | **Dead, and load-bearing.** Mobile `:286` failed on its **retry** too (`1 failed`, not `2 flaky`). Do not re-run expecting green. |

## One run withdrawn, on the record

The first local attempt reported **18/18 failed** — including a test that passes in CI.
That was a harness defect: `@playwright/test 1.62.1` expects chromium build **1234**, the
sandbox ships **1194**, and no browser launched. **Withdrawn in full.** A local result
redder than CI is a probe defect, and `playwright install` is forbidden — the way through
is `executablePath` at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## What remains — hypothesis, NOT a finding

Both failures are the same assertion (`expectPath(page, "/")` after a successful login)
and the desktop message is `Expected "/" Received "/login"` after 20s — **the URL never
moved.** Locally `NEXT_PUBLIC_API_URL` points at a dead port so `/` renders instantly;
in CI it points at a live backend and `/` server-renders. `router.push` does not commit
until the RSC payload lands. Two candidates, unseparated:

1. the redirect target fails to render in CI, so the navigation never commits;
2. `LoginClient.jsx:103` (`push`) races the effect at `:90` (`replace`).

**If (2), the defect is product-side on the login path** — which would mean the spec did
its job on its first real run, and the fix is out of scope for a tests-only PR.

Not separable from the sandbox: `*.up.railway.app` is proxy-denied and the 39 MB
`playwright-report` sits behind authenticated blob storage.

## The cheap discriminating step

Download `playwright-report` from run `31492087550` (artifact `9101679729`, expires
18/08) and read the `:286` trace for **whether `localStorage.token` was set at timeout**.
Set ⇒ login worked, the navigation is the defect. Absent ⇒ both hypotheses are wrong.

**Do not lengthen the poll timeout.** If the navigation never commits, a bigger number
buys a slower red; if it commits late, the number hides a home-render regression. That is
the papering-over this same branch adds a rule against.

## Circuit breaker

One park, one signature. Nothing quarantined; the 3-park threshold is not reached.
