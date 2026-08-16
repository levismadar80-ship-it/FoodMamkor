# Contributing to Mehamakor

תיעוד workflow conventions לעבודה על מהמקור.

## PR Description Convention

Every PR must include `Closes MEH-XX` in the description body.
This triggers Linear's auto-close on merge.

Example PR body:

  ## Summary
  Brief description of what changed.

  ## Verification
  - [ ] build green
  - [ ] preview URL: https://...

  Closes MEH-XX

Without this line, the Linear issue must be closed manually.

### Why this matters

> **⚠️ Corrected 2026-08-13 (MEH-2042). This section used to say the integration
> auto-closes when the branch name contains `meh-XX` **AND** the body contains
> `Closes MEH-XX`. That `AND` is measured false in BOTH directions** — it
> understated the trigger and overstated the safeguard, which is the worse half.

**What is actually measured**, across ten merges on 08–13/08 with every PR body
read from the GitHub API (full table + timestamps:
[`.claude/rules/workflow.md`](../.claude/rules/workflow.md) rule 29b):

| What the PR body carried | Card closed on merge |
|---|---|
| **nothing at all** — no identifier, no keyword | **3 / 3** ✅ |
| a closing magic word (`Closes` / `Fixes` / `Resolves`) | **4 / 4** ✅ |
| `Refs MEH-XX` | **1 / 3** — inconsistent, cause unknown |

Two consequences, and the first is the one the old `AND` hid:

1. **The branch name alone is enough to close a card.** `Closes MEH-XX` is not a
   second required condition — it is one of several sufficient ones. Since
   `Branch name gate` *requires* `^(feature|levismadar80)/meh-[0-9]+…`, **every
   legal feature-branch name carries some card's identifier**, so every feature
   merge is capable of closing something. There is no such thing as an inert
   branch slug for a feature branch: the gate rejects a name without one.

   _(One exemption, and it is not a loophole: the gate's `if:` skips
   `staging → main` release PRs, whose head branch is `staging`. That branch
   carries no identifier at all, so there is nothing for the integration to
   match — a branch with **no** slug, not an inert one.)_
2. **Nor is the branch name reliable on its own.** #2813 merged from
   `feature/meh-1980-coverage-ratchet` and MEH-1980 **stayed in Backlog** — never
   `Done` at any point. So a card whose work landed can silently keep an
   unfinished status.

### The rule that follows

**Write the trailer that states your intent** — `Closes MEH-XX` when the
Definition of Done is met, `Refs MEH-XX` when it is not — and then **verify,
because neither is predictable**:

> After every merge, look up **every** MEH identifier appearing in the branch
> name, and check **both** directions: a card closed that should not have been
> (reopen it, with a reason — and re-read the status afterwards, since a reopen
> has been undone by the integration five seconds later), and a card **not**
> closed that should have been.

Do not settle the `Refs` inconsistency by merging another PR to watch what
happens — three experiments have already returned two contradictory answers. The
remaining question lives in Linear's per-branch automation settings, not in this
repo.

## Branch Naming

See CLAUDE.md "Branch strategy" section.
Convention: `feature/meh-XX-slug` off staging.
