# MEH-692 — Auto-close drift forensics: which Phase δ PR closed MEH-686

**Date:** 2026-06-06 · **Status:** Resolved · **Effort:** investigation + docs
**Method:** GitHub MCP `pull_request_read` on PRs #831–#835 + `git log` over `origin/staging`.

---

## TL;DR

The premature auto-close of epic **MEH-686** (`2026-05-24T13:32:04Z`) was **not**
caused by any PR using `Closes MEH-686` as its closing trailer. **All five PR
bodies correctly used `Refs MEH-686 Phase δ/ε step N`.** The Refs discipline was
followed.

The trigger was the **literal substring `Closes MEH-686.`** appearing *inside the
explanatory prose* of four of the PR bodies — in the "Note on CHANGELOG entry"
paragraph that was written to *warn* about a different (cosmetic) false-close
mechanism. Linear's GitHub magic-word parser is **context-blind**: it scans the
whole PR description for `Closes MEH-XXX` and matched the string inside the very
note that was cautioning about false closes.

**Decisive trigger: PR #834** (merged `2026-05-24T13:32:02Z`; epic auto-closed
`13:32:04Z` — a 2-second correlation). PRs #832/#833/#835 carried the same latent
string and most likely fired earlier closes that were manually re-opened mid-session
(consistent with MEH-692's note: *"epic re-opened via Linear:save_issue mid-session"*).

---

## Evidence — per-PR scan

| PR | Title trailer | Body uses `Closes MEH-686` directive? | Body *contains the literal string* `Closes MEH-686.`? | Merged at (UTC) |
|---|---|---|---|---|
| **#831** | `Refs MEH-686 Phase ε` | No — body says `Not "Closes" — Phase ε is partial` | **No** (has `Not "Closes"`, not the exact `Closes MEH-686` phrase) | 2026-05-24T06:52:02Z |
| **#832** | `Refs MEH-686 Phase δ step 15` | No | **Yes** — in "Note on CHANGELOG entry" | 2026-05-24T09:28:13Z |
| **#833** | `Refs MEH-686 Phase δ step 17` | No | **Yes** — in "Note on CHANGELOG entry" | 2026-05-24T12:19:13Z |
| **#834** | `Refs MEH-686 Phase δ step 16` | No | **Yes** — in "Note on CHANGELOG entry" | **2026-05-24T13:32:02Z** |
| **#835** | `Refs MEH-686 Phase δ step 19` | No | **Yes** — in "Note on CHANGELOG entry" | 2026-05-24T14:39:22Z |

**Epic MEH-686 auto-closed at `2026-05-24T13:32:04Z`** (per MEH-692 description) =
**PR #834 merge + 2 seconds.**

### The offending paragraph (verbatim from #832/#833/#834/#835 bodies)

> git-cliff template at `.git-cliff.toml:9` hardcodes `Closes {{ commit.scope }}.`
> as a literal template line, regardless of the commit's Refs/Closes trailer. The
> generated CHANGELOG entry for this PR will display **"Closes MEH-686."** as
> cosmetic text — pre-existing template behavior on every entry since MEH-497
> (PR #564). Linear auto-close keys off PR body, not CHANGELOG, so this PR does
> **not** close MEH-686.

The sentence *"will display 'Closes MEH-686.' as cosmetic text"* contains a real,
parseable `Closes MEH-686.` — inside the PR **body**, which is exactly the surface
that paragraph (correctly) names as the one Linear parses. Self-fulfilling.

---

## Surface analysis — what Linear actually parses

| Surface | Content for these PRs | Parsed by Linear? | Verdict |
|---|---|---|---|
| Commit message (squash) | `Refs MEH-686 …` (clean) | Yes | ✅ No `Closes` — `git log origin/staging --grep='Closes MEH-686' -i` returns **0 rows** |
| git-cliff CHANGELOG line | `Closes MEH-686.` (cosmetic, from `commit.scope`) | **No** (Linear doesn't read CHANGELOG content) | ✅ Red herring — the note's own premise |
| **PR description / body** | `Refs` trailer **+ literal `Closes MEH-686.` in prose** | **Yes** | ❌ **Root cause** |

`git log --grep='Closes MEH-686'` over the full `origin/staging` history returning
zero rows corroborates that the **squash commit messages were clean** — the parsed
surface was the PR description, not the commit.

---

## Root cause

1. The team correctly internalized the cached memory rule (*"GitHub-Linear `Closes
   MEH-XXX` parsing is unconditional — use `Refs`/`Part of`, never `Closes` with a
   qualifier"*) and applied it to the **trailer**.
2. The gap: the rule was understood as governing the *closing trailer*, but Linear's
   parser matches the substring **anywhere in the body** — including quoted, escaped-
   by-quotation-marks, or explanatory text. A PR author wrote a helpful note *about*
   the auto-close mechanism and, in doing so, embedded the trigger string itself.

This is the **second known instance** (per MEH-692: *"MEH-686 Session 3 also had
this happen"*) — same class, different mechanism (prose embedding vs trailer).

---

## Prevention — do Rule 26/27 (MEH-405) already cover it?

**No.** Cross-checked the workflow rules:

- **Rule 26** (*verify PR scope before migration/close-without-merge*) — about not
  abandoning code PRs mistaken as docs-only. Unrelated.
- **Rule 27** (*search Linear before opening a new issue*) — about duplicate-issue
  prevention. Unrelated.
- **Rule 23** (MEH-571/579, */goal merge gate for UI work*) — acknowledges that
  `Closes MEH-XX` auto-closes the Linear issue on PR merge, but only in the context
  of `/goal` racing human QA. It does **not** warn about the substring being matched
  inside prose.
- The cached memory rule governs the **trailer**, not arbitrary body text.

**Gap confirmed.** A new prevention note is warranted (proposed below; not auto-applied
— routed for Sapir review per `/retro` discipline).

### Proposed prevention note (for `.claude/rules/workflow.md`)

> **Never write the literal string `Closes/Fixes/Resolves MEH-XXX` anywhere in a PR
> body except as the one intentional closing trailer — not even quoted inside
> explanatory prose, and not even when the surrounding sentence is *warning* about
> auto-close. Linear's GitHub magic-word parser is context-blind and matches the
> substring across the entire description.** To reference the mechanism in prose,
> avoid the exact pair: write "the auto-close keyword", or split the token
> (`Close​s MEH-686`), or reference it as `Closes <issue>` with a placeholder.
> Backticks/quotation marks do **not** neutralize it.
>
> _Source: MEH-692 (2026-06-06). PR #834 auto-closed epic MEH-686 because its
> "Note on CHANGELOG entry" paragraph contained the literal `Closes MEH-686.`
> while explaining a separate cosmetic git-cliff false-close. 2nd known instance._

---

## Definition of Done — status

- [x] Offending PR identified — **#834** (decisive; #832/#833/#835 carried the same latent string)
- [x] Root cause documented — literal `Closes MEH-686.` embedded in PR-body prose; Linear parses the body, not just the trailer
- [x] Prompt/rule update proposed (above) — routed for Sapir review, not auto-applied
- [x] HANDOFF entry (this batch's HANDOFF update)
- [x] Root cause is process/copy behavior, not a code bug → captured as a workflow-rule gap

Closes MEH-692
