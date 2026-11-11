---
name: backlog-groom
description: Groom the Mehamakor Linear backlog — verify each card against the code, assign exactly one verdict, fix labels, and route what is genuinely Sapir's to her. Use when asked to groom, triage, or sweep the backlog, when a weekly grooming pass is due, or when a queue's seed list needs its anti-stale check. Grooming only — this skill does not build, does not open work tickets, and does not classify incoming requests.
---

# Backlog groom

Verify every open card against the repository, give it **exactly one verdict**, and
leave the queue in a state where "unlabelled" means "CC may take it".

The method is not "read the card and decide". It is **read the card, then check its
claims against `git`, and decide from what the code says**. Most cards are neither
stale nor healthy — they are correct work carrying one wrong sentence.

## Scope — one skill, one verb

Grooming only. Not queue management, not opening tickets, not classifying incoming
requests. Those are separate skills if they are ever needed.

## Steps

1. **Take a chunk of 15–20 cards, oldest-`updatedAt` first.** Never groom the whole
   backlog in one pass — the verdicts stop being evidence-backed around card 20.
2. **Read the FULL description of each card.** Not the title, not the first section.
   The contradiction is usually in the middle.
3. **Run the anti-stale gate.** For every factual claim the card makes, check it:
   `git show origin/staging:<path>`, `git grep <pattern> origin/staging`,
   `git log --all -i --grep=<MEH-id>`. Never read the working tree — it may sit on a
   feature branch. Details and commands: `references/verification.md`.
4. **Check every ticket the card names as a blocker.** Roughly a quarter of cards
   cite a dependency that has since landed. This is the single most common finding.
5. **Assign exactly one verdict** from the five in `references/verdicts.md`.
6. **Apply the write** that verdict calls for — and nothing else. Hygiene fixes never
   ride along with a content change.
7. **Report the chunk**: verdict counts, the needs-sapir question list, mislabeled
   cards, and anything that could not be verified. Unverified is a result; guessing
   is not.

## The five verdicts

| # | Verdict | Write |
|---|---|---|
| 1 | **STALE-DONE** — the work already landed | Close, with a commit SHA / PR / `file:line`. No citation, no close. |
| 2 | **STALE-PREMISE** — the code moved, a claim is false | Prepend a dated note. Never delete. Close only if nothing actionable remains. |
| 3 | **DUPLICATE** — another card covers it | Cross-link both, close the weaker naming the survivor. |
| 4 | **VALID** — the card stands | Hygiene only. |
| 5 | **SAPIR-DECISION** — genuinely hers | `needs-sapir` + a ONE-LINE question at the top. |

Full definitions, the hygiene checklist, and the label semantics: `references/verdicts.md`.

## Rules that do not bend

- **Never close a card labelled `needs-sapir`, `not-cc`, or `blocked-needs-sapir`.**
- **Never delete description content.** Additions and strikethrough only, always dated.
- **Never change a priority.** Flag the contradiction (an Urgent card sitting in
  Backlog is one) and let a human resolve it.
- **Never add or remove `cc-queue`.** That label is a claim signal owned by whoever
  is working the queue, not by the groom.
- **A post-launch card is not stale for being old.** Age is not a verdict.
- **Verify the negative.** A search returning nothing is only evidence once the same
  search has been shown to find something you know exists.

## Age thresholds

Untouched **30+ days** → verify against the code. Untouched **90+ days** → force a
close / keep / merge decision, with evidence either way. A card nobody can justify
keeping is noise that makes every other card harder to find.

## What the first run taught

Seven chunks, 126 cards, 2026-08-09. The lessons that changed the method are in
`references/lessons.md` — read it before the first chunk. The two that matter most:

- **A stale *dependency line* is not a stale *premise*.** Six of the first eight
  STALE-PREMISE findings were cards whose work was entirely valid and whose
  "blocked by" line named a ticket that had shipped.
- **A card's framing and its task list go stale independently.** One card's urgency
  died when an unrelated ticket unmounted the subsystem, while every item on its
  to-do list stayed true.
