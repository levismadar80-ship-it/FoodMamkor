# Session log — sweep lane `sd-4hmwor`, 10/08 midday

**Resumed** on a `claude/*` harness branch with nothing in flight. Ran the ORDERS §5
anti-stale ritual before touching anything; it paid twice within the first twenty
minutes, both times on cards that had moved *that same hour*.

---

## Landed

| PR | Card | What |
|---|---|---|
| **#2764** | MEH-1590 (partial) | Two e2e specs that reported the suite red for reasons that were not bugs. Both required gates green, different-model review **APPROVE**. |

## Opened

| Card | Why |
|---|---|
| **MEH-1999** | Stale citation + a non-existent Hebrew string in an `07-gps-button.spec.ts` comment. Found by the adversarial reviewer, **outside** the diff under review, so filed rather than folded in. |

---

## 1 · The anti-stale gate paid twice, on the same morning

Both hits were cards that changed state *while the session was running*:

- **MEH-1974** (Urgent, `cc-queue`) was my intended second task. `get_issue` returned
  **Done, `completedAt` 12:32Z** — closed minutes earlier. Had I trusted the queue
  listing from 12:27Z I would have started re-doing finished VRT work.
- **MEH-1590** and **MEH-1974** had both been relabelled `not-cc` → `cc-queue` at
  **12:21–12:25Z**, i.e. the queue I read was four minutes old and already different
  from the one the prompt implied.

The cheap tell keeps being the same one: **read the card, not the list.**

## 2 · MEH-1590 — the measurement changed what the card said, in both directions

The card's §2 said "6 red specs, 31 skipped" as of 31/07. Measured on the freshest
run that *actually executed* (`31387507043`, staging, 12:19Z):

| Job | executed | failed | flaky | skipped |
|---|---|---|---|---|
| WebKit iPhone 13 (shadow) | 88 | 7 | 3 | 15 |
| desktop + mobile | 217 | 7 | 1 | 29 |

**The duration tell (ORDERS) separated signal from mask perfectly again:** across the
last 30 `e2e.yml` runs, every `success` lasted **20–60s** (the job skipped) and every
real execution lasted **480–600s** and failed. Not one exception.

**Two of the 14 failures were decidable from the repo alone**, and they turned out to
share one cause: *adding a third Playwright project falsified an assumption that had
only ever been true for two.*

- `07-gps-button` guarded with `test.skip(project.name === "mobile")` — an **exclusion
  list of one name**. `webkit-iphone13` is a 390px phone whose name is not "mobile",
  so the guard stopped firing; the button it looks for is `hidden lg:flex`
  (`MapPane.jsx:160`, `lg` = 1024px) and is legitimately absent there. **The app was
  fine; the spec was mis-scoped.** 12 of the suite's 13 project guards already use the
  positive `!==` form — this was the lone outlier.
- `02-search-producer` was the **sibling half of a fix that landed one line up**. An
  earlier session measured the hero hydration window, retired the racing
  `toHaveCount(1)` guard, and applied `.first()` to the input on line 24 — and left
  the submit button on line 33 a bare locator. It kept resolving to 2 elements.

**What I did not do, deliberately:** the other 12 failures depend on the staging
backend (auth provisioning, `/producers`) or on the Cloudinary-401 incident. The card
records a live blocker — staging backend non-2xx on `GET /producers` — which I could
not verify from here (the host is proxy-denied), so it is written up as **inherited,
not confirmed**. Guessing at those specs is exactly the "plausible cause" failure this
repo has already paid for.

## 3 · Two probes refused to run, and that is the honest part of the evidence

Neither fix was reproduced locally, and the reasons are worth recording because the
next session will hit them:

1. `global-setup` provisions auth against an unreachable backend — **the sandbox has
   the three `DEMO_*_PASSWORD` vars set**, so provisioning fires by default. Unsetting
   them (`env -u …`) is the way past it.
2. Playwright/browser version mismatch after `npm ci`, and `/opt/pw-browsers` carries
   **chromium only** — no webkit. `playwright install` is forbidden.
3. Even with a browser it would not have helped: a runtime `test.skip()` is evaluated
   **after** fixture setup, so a local run cannot discriminate skipped-from-ran. The
   `mobile` project failed on browser launch rather than reporting "skipped", which is
   the direct proof.

Two attempts, then stop (ORDERS 2-attempt rule). **The failing-by-construction evidence
is the CI run itself** — the previous assertions demonstrably failed there — and the
confirming half runs on the PR, since the diff touches `frontend/**` and therefore
triggers both E2E jobs.

## 4 · The review earned its keep on a number I had not checked

Different model (Sonnet; diff was Opus), read-only, isolated worktree. Verdict
**APPROVE**, no MUST-FIX or SHOULD-FIX. It re-derived every claim from
`git show <sha>:<path>` rather than its worktree — and explicitly flagged that its own
checkout carried a *different* `playwright.config.ts`, which it correctly treated as a
red herring instead of a finding.

It caught a real NIT: the PR body cited `config:182`; the `name:` field is on `:183`.
I verified that myself before accepting it, then fixed it **in the PR body** — no
commit, no CI restart, since the error was never in the code.

**I had already caught the same class in my own work before pushing:** my comment
claimed "11 of 12" project guards used the positive form. Recounting gave **12 of 13**.
An unverified count inside a comment is precisely the artifact this repo punishes, and
I nearly shipped one *while fixing a stale citation two lines above it*.

## 5 · ORDERS §6 carries a false claim — reported, not edited

> "**No Sentry or Vercel MCP tools exist** in harness sessions. Do not plan around them."

**Both are live in this session, measured:**

- `mcp__Sentry__find_organizations` → org **`df7d71a2ad7a`** — the exact org MEH-1511
  cites as verified on 23/07.
- `mcp__Vercel__list_teams` → **`team_QOQUotEaO2TFqPyPnNI3aFyz`**.

This matters beyond tidiness. **MEH-1511's stop condition (a) is "Vercel or Sentry MCP
not connected → STOP"**, and its whole amendment rests on post-merge detection being
the compensating control for dropping the human pre-merge gate. A session that trusted
ORDERS §6 would have stopped the card on a false premise — and any session doing
post-merge verification has been told these tools do not exist.

**Not edited here** (findings are not self-authorised work, and this branch is a session
log). Flagged for Sapir; it wants a one-line correction to ORDERS §6 with an as-of date.

**Second, weaker observation on the same file:** the TEMPORARY Vercel-quota note says
every deployment returns the rate-limit string. This PR's deployment reported
**`Ignored`** (`Canceled by Ignored Build Step`) — the *configured* no-preview state,
not the quota error. That is **not** enough to falsify the note (an ignored build is not
a successful one), so it stays until someone observes a real success. Recorded so the
next reader does not re-derive it.

---

## In-flight ledger

| PR | Card | pushed | gate state | next revisit |
|---|---|---|---|---|
| **#2764** | MEH-1590 (partial) | 10/08 12:41Z | **both required gates `success`**, jobs ran (not skipped). Review APPROVE. Auto-merge armed | on E2E completion / merge |
| this log | — | — | docs-only, separate branch (rule 31) | — |

**Note on the auto-merge:** it was enabled on #2764 by another actor, **not by me**, at
a moment when my adversarial review had not yet returned — which ORDERS §4.1 forbids
("auto-merge is armed only for PRs whose review has already cleared"). The review has
since returned APPROVE, so the end state is compliant and I left it armed. Worth
knowing that something in this repo arms auto-merge on PRs it did not open.

## Handed off, explicitly

**MEH-1511 — claimed, Phase 0 done, NOT built.** Branch
`feature/meh-1511-qa-gate-rule-23` is pushed to `origin` and is a live claim; a session
picking it up should either adopt it (past the 2-hour orphan threshold) or leave it.

Phase 0 results, so the next session does not repeat them:

- **Stop condition (a) does NOT fire** — both MCPs verified live above. This was the
  card's blocking question and it is now answered.
- The card's §7 records the *real* prior blocker: the harness auto-mode classifier
  refused the write to `.claude/rules/workflow.md` on 08/08. **Untested this session.**
  If it fires again, stop condition (d) says surface it, do not route around.
- Rule 23's current text and ADR-016's tier definitions were read; ADR-016 is 94 lines
  and its §amendment (2026-07-12) is the style to mirror.
- The card names branch `feature/meh-1511-rule23-self-qa-substitution`; **my claim
  branch has a different slug** (both contain `meh-1511`, so `git ls-remote | grep`
  still finds it).

## Not done, and named

- **MEH-1590's remaining ~12 failures** — backend-gated, see §2.
- **MEH-1999** — filed, unlabelled, unclaimed.
- **ORDERS §6 correction** — reported above, deliberately not edited.
