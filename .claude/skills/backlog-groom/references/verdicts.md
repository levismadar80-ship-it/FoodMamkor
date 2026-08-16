# The five verdicts — full definitions

Exactly one per card. If two seem to apply, the card usually needs splitting, not a
second verdict; say so in the report rather than writing two.

---

## 1 · STALE-DONE — the work already landed

**Close the card (state `Done`) and record concrete evidence:** a commit SHA, a PR
number, or a `file:line` that shows the thing existing. **No citation → do not close.**
"It looks done" is how a live card gets buried.

**The work is often not attributable to this card's number.** One card's setup landed
under a different ticket entirely; a grep for the card's own identifier would have
found nothing and the card would have stayed open forever. Search for the *thing*, not
the ticket:

```
git grep -n "<function or file the card names>" origin/staging
git log --all --oneline -i --grep="<feature words>"
```

**Where to write the evidence:** normally a comment. On an **archived-but-active** card
`save_comment` fails with *"Could not find referenced Issue"* while `save_issue` works —
put the evidence in the description instead.

---

## 2 · STALE-PREMISE — the code moved and a claim is now false

Prepend a dated note at the **top** of the description:

```
## ⚠️ עדכון groom <DD/MM/YYYY> — <what changed>
```

State what is false, what is true now, and the evidence. **Never delete or rewrite the
original text** — the wrong claim is part of the record, and the next reader needs to
see what was believed.

Close **only** if nothing actionable remains. A false premise usually leaves the work
intact; see `lessons.md` on separating framing from task list.

### The sub-case that dominates in practice

**A stale blocker reference.** The card says "blocked by MEH-X" and MEH-X is Done.
Nothing about the work is stale — one line is. Fix that line, keep the verdict narrow,
and say in the report that the card is now unblocked.

---

## 3 · DUPLICATE / OVERLAP

Cross-link both cards, then close the weaker one naming the survivor.

**Order matters mechanically:** set `duplicateOf` **first**, then the state. A
`save_issue` call combining a `patch` with an invalid state transition **fails
atomically** — the patch is discarded silently along with the state change.

Duplicates are rarely visible from the two cards alone. The pair that surfaced on the
first run diverged because a "tail of the work" card described a slice its successor
covered entirely, and the tell was a checkpoint file in `docs/` that neither card
linked.

---

## 4 · VALID — the card stands. Hygiene only.

Change nothing about the content. Fix only:

- **(a) Labels are exclusive.** `needs-sapir` XOR `cc-queue`. Both together is a
  labeling bug — see the label semantics below.
- **(b) A post-launch card carries the `post-launch` label.** A marker in the title
  (`[post-launch]`, `deferred`, `signal-gated`, `v2`) filters nothing; only the label
  does. This is a real and recurring gap, not a hypothetical one.
- **(c) Priority contradictions are FLAGGED, never fixed.** An `Urgent` card sitting in
  `Backlog` is a contradiction — either it starts or it is not Urgent — and that is a
  human's call.
- **(d) A card with no Definition of Done gets one**, derived from its own content,
  under a `## DoD (groom <DD/MM>)` heading. If the content does not support one, flag
  it instead of inventing acceptance criteria.

---

## 5 · SAPIR-DECISION — genuinely hers

Add `needs-sapir` and prepend **one line**, phrased as a question:

```
**שאלה לספיר:** <the single question, answerable without opening anything else>
```

She reads a question, not a card. A paragraph is not a question.

### What actually qualifies (amended 2026-08-09)

**`needs-sapir` means ACCESS or a genuine PRODUCT DECISION:**

- **Access** — a console (Railway, Vercel, Sentry, Cloudinary), credentials, secrets,
  GitHub repository settings, production data, an external account, money.
- **Decision** — brand or copy not already locked in `BRAND.md` or an ADR, a legal
  question, a metric whose meaning changes for users, an architectural fork.

**It does NOT mean QA.** The 2026-08-08 ruling moved manual QA to CC. A card labelled
`needs-sapir` **only** because it asks for testing is **mislabeled**: say so in a dated
note, name which half is CC's, and leave the label for a human to remove.

### `cc-queue` + `needs-sapir` together is a labeling bug

It means the card has a CC half and a Sapir half that nobody separated. **Do the CC
half, leave a one-line question for hers.** Do not remove either label — record the
split in a note and let the human resolve the labels.

### Pre-2026-08-08 WAIT markers

A `WAIT` / hold that is a **decision-hold** is superseded by the full-autonomy ruling —
note the supersession so the next reader is not blocked by a dead hold. A hold that is
an **access-hold** still stands.
