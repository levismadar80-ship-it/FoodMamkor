# Lessons from the first run (2026-08-09, 126 cards, 7 chunks)

Counts are in `docs/overnight/session-s8-r9k3mt.md`. This file is only what changed
the method.

## 1 · A stale dependency line is not a stale premise

The dominant finding, by a wide margin — around a quarter of cards. The card's work is
entirely valid; one line in its "blocked by" table names a ticket that has since
shipped. One card called its blocker *In Progress* while that blocker had been Done for
three weeks.

**So:** check every referenced ticket's current state as a routine step, and keep the
verdict narrow. Correcting the line is the whole fix.

## 2 · Framing and task list go stale independently

One card's urgency framing died when an unrelated ticket unmounted the subsystem it
described — while every item on its to-do list stayed valid and unstarted. Judge the
two separately. "The reason this was urgent is gone" and "the work is done" are
different findings, and only the second closes a card.

## 3 · Work lands under other tickets

Two of the first three closures were implemented by tickets with different numbers.
Searching by identifier alone would have left both open indefinitely. Search for the
thing.

## 4 · Sub-issues can be deleted, not just finished

An epic's four sub-issues were unreachable by id, UUID and search — not archived, not
Done. That is a distinct case from "shipped elsewhere" and it has no verdict of its own;
report it explicitly rather than inferring completion from absence.

## 5 · Archived-but-active is a real state

Cards carry a non-null `archivedAt` while sitting in Backlog and being worked. On those,
`save_comment` fails with *"Could not find referenced Issue"* while `save_issue`
(including combined `patch` + `labels`) succeeds. Put evidence in the description.

## 6 · Title markers filter nothing

Cards had carried `post-launch` in their titles for months with no label. Every queue
query filters on labels. A marker a human can read and a query cannot is not a filter.

## 7 · A card can be born stale

One card was written and its premise was already false at the moment of writing —
"no existing card (checked)" referred to a search of the tracker, not of the code. The
thing it proposed to build existed, mature, with several tickets' worth of history.

**So:** the anti-stale gate applies to cards created today, not only to old ones.

## 8 · Ticket-close is an artifact that can be un-ratified

One card went Done on a merged PR, then bounced back to Backlog the same day when a
second PR found the shipped change unsafe. A closure is a claim about a moment, and
moments pass — the same staleness class the testing rules document for baselines and
cached artifacts.
