# Decision rules

How a decision is put in front of Sapir. One rule, and the reason it has to be
a rule.

---

## Every option gets its strongest argument, not just the recommendation

**When a decision is brought to Sapir, each option is presented with the best
case that can honestly be made FOR it — including the options not being
recommended.** The recommendation comes after, and it is allowed to be short.

The failure this prevents is not dishonesty. It is the ordinary shape of a
write-up: the preferred option gets a paragraph of reasoning and the others get
a clause. The clause is usually true. It is just never the strongest version of
the case, because nobody built that version — and a reader cannot supply what
was never written. The decision then looks obvious when it was not, and the
person who has to live with it has been handed a conclusion wearing the clothes
of an analysis.

### What this looks like

```
אפשרות א — <שם>
  בעד: <the strongest case for א>
  נגד: <the real cost>

אפשרות ב — <שם>
  בעד: <the strongest case for ב, written as if ב were the recommendation>
  נגד: <the real cost>

המלצה: א, כי <one or two sentences>.
```

Not this:

```
ממליץ על א, כי <three paragraphs>. אפשרות ב פחות טובה כי <one clause>.
```

### The test, before sending

**Could someone who prefers option ב read this and feel their reason was
stated?** If the answer is "they would have to argue for themselves", the case
for ב has not been written yet. The test is deliberately about the reader and
not about the author's intent: an author always believes they were fair.

A second check, cheaper and almost as good: read only the «בעד» lines, with the
option names hidden. If the recommended one is obvious from the writing rather
than from the substance, the others are underwritten.

### What it does NOT mean

- **Not false balance.** When an option really is much worse, say so plainly in
  its «נגד». The requirement is that its «בעד» be the strongest TRUE thing, not
  that it be flattering. An option with no honest case is reported as having
  none — and that sentence is itself useful.
- **Not more length.** Two lines per option beats a page. Cutting the
  recommendation's three paragraphs down to one usually pays for the others.
- **Not every choice.** This is for decisions that reach Sapir — architecture,
  copy, pricing, a locked decision, anything with a `decision-first` or
  `needs-sapir` label. A routine judgment call inside a task is made, not
  presented (workflow.md: ambiguity → make the routine call, check in only
  where readings diverge materially).
- **Not a licence to defer.** Still make a recommendation. "Both have merit" is
  not a decision aid; it is the work left undone.

### Where it already applies

`.claude/rules/workflow.md` rule 4 asks for 2–5 targeted questions on an
ambiguous spec, and rule 22 sends copy to Sapir verbatim. Both decide WHEN she
is asked. This decides WHAT she is shown when she is.

Rule 34 is the companion on the other side: when a premise a decision rested on
turns out to be false, the card's DESCRIPTION is corrected, not just commented
on. An option argued from a refuted premise is worse than one not argued at all.

### Why a rule and not a habit

The failure is invisible from the inside. A recommendation written in good
faith reads as balanced to its author every time, because the author holds the
counter-arguments in their head and discounts them there — the discounting
never reaches the page. No reviewer can catch it either: a missing argument
leaves no trace to review. Only a rule that says "write the other case, in
full, before you send" produces the page that would otherwise not exist.

There is no guard for this, and there should not be one: no grep can tell a
strong argument from a weak one. It is in `.claude/rules/` rather than in a
hook for exactly that reason — see the compliance note in
[meta-patterns.md](./meta-patterns.md).
