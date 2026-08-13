# Session log — sweep lane `se-2xk7m`, 11/08 midday

**Resumed** on a `claude/*` harness branch with nothing in flight. Ran the ORDERS §5
anti-stale ritual first. The finding that shaped the whole session: **every Urgent card
is currently blocked or excluded**, so the highest-value work was not a new card at all
— it was two complete PRs from prior sessions that had been sitting `behind` for over a
day with nobody finishing them.

---

## Landed

| PR | Card | What |
|---|---|---|
| **#2767** | MEH-2002 | Deleted the expired Vercel-quota section from ORDERS under its own falsification test; replaced §6's false "no Sentry/Vercel MCP tools" line with two measured tool calls. Both required gates green, guards ran. |

## Blocked, deliberately

| PR | Card | State |
|---|---|---|
| **#2747** | MEH-215 chunk C | **Converted to DRAFT — must not merge.** Its E2E suite finally ran for real and failed on its own specs. See §8. |

## Opened

| Card | Why |
|---|---|
| **MEH-2002** | The two expired ORDERS claims. Handed off explicitly by `sd-4hmwor`; conditions re-verified before editing, not inherited. |
| **MEH-2003** | This log. |

---

## 1 · The Urgent lane is entirely blocked, and that is the honest headline

A fresh `list_issues` sweep of both lanes returned **zero workable Urgent cards**:

| Card | Why not workable |
|---|---|
| MEH-1925 | Cloudinary console — gate 2, Sapir's credentials |
| MEH-1974 | **Its own execution order forbids the work now.** The card says regenerating VRT baselines while Cloudinary 401s would ratify the broken state (the MEH-1552 candidate-baseline trap), and names two preconditions. One is MEH-1925, which is Sapir's. |
| MEH-1585 | `blocked-needs-sapir` |
| MEH-1736 | title carries `decision-first` → B2 |
| MEH-1907 | title carries `[RED]` → B2 |
| MEH-1905 | `needs-sapir` — Railway/Sentry consoles |

**MEH-1974 is worth a second look by whoever comes next**, because it is `cc-queue`,
Urgent, and *looks* takeable. It is not: the blocker is written into the card by an
earlier session as a deliberate ordering constraint, not as a status. Reading the label
and skipping the body would have produced exactly the merge that card exists to prevent.

## 2 · Adopting an orphan PR is not "just merge it" — the sync surfaced a real block

#2747 had been idle since 09/08 21:18Z. Adoption comment first (ORDERS §2), then sync.
The sync is where the work actually was:

**`scripts/checks/secrets-scan-guard.sh` landed on `staging` after the branch was
written**, and the merge made it fire on two fixture literals in the new spec. `Repo
guards` is an always-required leg of `CI gate`, so this was a genuine block. Fixed the
way the guard's own message prescribes — make the placeholder obvious — rather than by
widening its pattern, which is the ORDERS §1.7 shape (attack the intent, never the
control).

> **The methodological catch worth carrying forward.** Re-running the guard after
> editing reported the **identical FAIL, same line numbers**. The obvious reading is
> "my fix didn't work". The real reason: the guard reads `git diff origin/staging...HEAD`
> — **committed** state only — so it was still measuring the pre-fix tree. One commit
> later it printed `OK`. A probe that reads committed state while you are testing an
> uncommitted change will confidently report the old answer, and nothing in its output
> says so. This is §3.0 wearing a slightly different hat: *what would this have printed
> if it were measuring the wrong thing — and is that different from what it just printed?*

Second-order benefit: the pre-fix `exit 1` and post-fix `exit 0` are, together, the
discrimination proof that the guard actually catches the thing it exists to catch.

## 3 · The different-model review earned its cost on a documentation defect

Sonnet, read-only, isolated worktree; the diff was Opus. Zero MUST-FIX, and it verified
every `getByTestId` against component source and every locked-copy literal against
`he.json` with no mismatches.

Its one substantive finding was **not in the code**: the branch shipped a new rule
stating `networkidle` is *"forbidden in anything under `e2e/flows/**` or
`e2e/visual/**`"* — unqualified — while the same diff **deliberately keeps** a bounded,
caught call at `e2e/visual/parity.spec.ts:246`, inside one of those two paths. The sweep
table below the rule called that occurrence "converted, not removed"; the **bolded
sentence did not**, and the bolded sentence is what a reader quotes.

The concrete failure that invites is specific: someone writes the grep guard this rule
practically asks for, it matches `:246`, and either a deliberate bound gets "fixed" or
the guard encodes the wrong predicate. Fixed by banning the **unbounded** form, naming
the sanctioned bounded-and-caught one, and pointing at the exemplar.

**The generalisable bit:** a rule shipped in the same PR as the code it governs is the
easiest thing in the diff to under-review, because it reads as "just docs" — and it is
the artifact with the longest half-life.

## 4 · The CI reviewer posted a review that was inverted end-to-end

`claude[bot]` raised one Must Fix, one Should Consider and one Minor on #2747. **All
three describe artifacts as deleted / reverted / removed that the PR adds.** Measured
against the tree, not argued:

| Its claim | Measured |
|---|---|
| `parity.spec.ts` "reverts to the unbounded form" | `:246` carries `{ timeout: 5_000 }` — added by this PR |
| "the deleted rule at `testing.md` § networkidle" | added by this PR, `+18/−0`; absent from `staging` before |
| `30-login-journey-c.spec.ts` "(deleted)" | new file, 17,710 bytes; MEH-328 assertion at `:330` |
| `data-testid="login-error"` removed | present at `LoginClient.jsx:333`, added by this PR |

The diff is **+579 / −5**. The internal tell is that its Must Fix **cites the rule text
as justification while calling that same rule deleted** — both cannot hold, since the
reasoning it quotes exists only in this diff. Most likely base/head compared in the
wrong order.

Answered once with `file:line` evidence and not re-litigated (the reviewer runs per-head
with no memory). **Recorded here because ORDERS' current guidance is that the reviewer's
specific local findings are "usually right — verify, then adopt", with a 0-for-2 record
only on *convention* claims. This is a third failure mode neither bucket covers: findings
that are locally specific, cite real `file:line`s, and are systematically inverted.**
Worth a line in ORDERS if it recurs; one instance is not a pattern, so it is reported
rather than codified.

## 5 · A non-deterministic CI build failure — measured, cause NOT claimed

The E2E job on `8c7a50de0` went red without running a single spec. It failed at **Build
frontend**:

```
Error: Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
  [next]/internal/font/google/heebo_fbf7b5ef.module.css
  ./app/[locale]/layout.js
```

Corroborating that nothing ran: `playwright-report` upload logged `No files were found`,
`/tmp/next-start.log` did not exist, and the QA comment's own `outcome` variable is the
literal string `skipped` while it printed **"FAIL"**. Job duration **62 s** against a
480–600 s real-run signature.

**Four builds of byte-identical source; exactly one failed:**

| Build | Result |
|---|---|
| `e2e.yml` Chromium job, `8c7a50de0` | **FAILED** — font module |
| `e2e.yml` WebKit shadow job, same commit, +2 min | success, suite ran |
| `pr-checks.yml` `Frontend build (Next.js)`, same commit | **success** |
| local `npm ci` + `npm run build`, same post-bump lockfile | **exit 0**, zero occurrences |

**No cause is asserted.** The shape suggests a `next/font/google` fetch or a stale
turbopack cache on one runner — the failing job's `Install Playwright (Chromium only)`
reported `skipped` (cache hit) where WebKit installed fresh — but that is unproven, and
a plausible-sounding mechanism written into a log becomes a ticket and then a prescribed
fix nobody re-derives (Bug Protocol §6 corollary). **It ships as an unexplained
observation with the measurement attached.** If it recurs on a head where nothing else
changed, it stops being environmental.

Also worth separating: the reds on `c6e56715` and `a85f47dc` were **not** this. Their
jobs report `conclusion: cancelled` within seconds of the next push — supersession, which
the aggregator maps to FAIL. Two different failure shapes on one PR within ten minutes,
and only one of them is real.

## 6 · Two ORDERS claims retired, both re-verified before editing

Handed off by `sd-4hmwor` and left undone there. **Neither was taken on trust:**

- **The Vercel quota section** deleted under the test it wrote for itself. Three heads
  across two days returned `Building` → `Ignored`, never the rate-limit string. The
  mechanical half was already in ORDERS §3.2 (measured on #2603): the quota gate runs
  *before* the ignore step, so reaching `ignoreCommand` at all means the quota was
  available. Cost of leaving it: it instructed sessions not to verify against staging and
  to queue rechecks for a condition that had already passed.
- **§6's "No Sentry or Vercel MCP tools exist"** replaced with two live calls —
  `mcp__Sentry__find_organizations` → `df7d71a2ad7a`, `mcp__Vercel__list_teams` →
  `team_QOQUotEaO2TFqPyPnNI3aFyz`. Deliberately called rather than inferred from the
  deferred-tool roster: a listing shows a name, a call shows the tool works. That line
  is load-bearing — the rule-23 self-QA card's stop condition (a) fires on exactly this
  premise.

The deletion ran behind seven boundary assertions (separator, blank, header, last
blockquote line, separator, blank, next heading) so a drifted file would abort the cut
rather than silently remove the wrong span.

## 7 · Deliberately not taken

- **#2661** (MEH-1911, pytest-xdist) — edits `.github/workflows/pr-checks.yml`, CC-deny.
  CC could merge it but could never repair it, and it changes how pytest runs for **every
  future PR**. Two prior sessions declined for that reason; re-deciding it unprompted
  would be re-litigating a settled call.
- **#2742** (MEH-1832) — title carries `[HIGH-RISK]` → B2 exclusion.
- **The `e2e/CLAUDE.md` "flows stay unmocked" contradiction** — raised by the reviewer,
  real, and already flagged to Sapir by chunk A. Re-deciding it inside a chunk-C PR is the
  scope creep the card warns about. Named on the PR so it is visible on a PR surface and
  not only inside a block comment.

## Open for Sapir

- **MEH-1925** (Cloudinary 401) still gates MEH-1974. Nothing in this session touched it,
  and it is the single blocker holding the Urgent lane closed.
- **The inverted CI review** in §4 — if `claude-review` is comparing base/head in the
  wrong order, that is a defect in the reviewer, and MEH-1844 is where its per-head
  behaviour is already being tracked.

## 8 · The E2E suite finally ran — and every failure in it was ours

This is the finding that mattered most, and it arrived last. On `57288e5c4` the build
succeeded and the suite executed for **4.7 minutes** (against the 62-second
build-failure signature of the earlier reds):

```
1 failed   [mobile]  30-login-journey-c.spec.ts:286  C2 — session survives a new tab
1 flaky    [desktop] 30-login-journey-c.spec.ts:209  C2 — correct credentials … redirect
29 skipped, 231 passed
executed=233 (expected=231 unexpected=1 flaky=1 skipped=29 specs=262)
```

**Of 233 executed tests, every non-passing one is in the file this PR adds.** Not one
unrelated spec is red — so the environmental explanation that covers most E2E reds on
this repo does not cover these. ORDERS is explicit about that case: a failing spec that
covers the surface you changed is yours.

The flake's message is readable — `Expected "/" Received "/login"`, a 20 s poll timeout
at `expectPath` (`:97`) called from `:219`: the post-login redirect had not landed. Both
non-passing tests are C2 and probably share a cause. **Not diagnosed further, and not
guessed at from a stack trace.**

**Three things worth carrying:**

1. **`E2E gate` is not required, so nothing mechanical stopped this merging.** What
   stopped it was reading the per-spec result. Had the PR merged, a flaky spec would
   have entered the shared suite — the exact MEH-1792 precedent where a spec merged
   flaky "poisoned the E2E signal on an unrelated PR."
2. **Something outside this session re-armed auto-merge on #2747 twice** (attributed to
   `levismadar80-ship-it`), after I disabled it. With a known-bad spec in the diff,
   "disable it again when it reappears" is not a control. The PR was converted to
   **draft**, which reds the required gate and holds regardless of who arms what — and
   which the fixing session can reverse itself. A `DO-NOT-MERGE` marker was deliberately
   *not* used: it would strand the PR behind a clearance only Sapir can give, which is a
   heavier block than the situation needs.
3. **The PR body reports this spec 16/16 green locally.** Green-local / red-CI is the
   precise class the branch's own new rule is about. The rule named `networkidle` as the
   mechanism; these failures survive its removal, so **the class is wider than the one
   call that was fixed.** That is the most useful thing this session learned and it is
   not yet written into any rule — one instance, so reported rather than codified.

## In-flight ledger

| PR | Card | pushed | gate state | next revisit |
|---|---|---|---|---|
| **#2747** | MEH-215 chunk C | 11/08 12:37Z (`57288e5c4`) | **DRAFT — blocked on its own two C2 failures (§8). Do not merge or un-draft until they are fixed with a measured failure rate.** | fix, then re-gate |
| **#2767** | MEH-2002 | — | **MERGED**, verified off `origin/staging` | resolved |
| this log | MEH-2003 | — | docs-only, separate branch (rule 31) | — |

**On merging #2747:** its branch name will flip MEH-215 to Done even though it is chunk C
of 4. That is predicted in the PR's own body and is a known consequence of the
branch-name gate × rule 29 conflict (MEH-1736). **The card must be restored to In Progress
immediately after merge, and the restore verified by re-reading it** — not assumed.
