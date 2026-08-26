# ADR-033: One choke point for every analytics write, enforced by an AST test

**Status:** Accepted
**Date:** 2026-08-23
**Deciders:** Sapir Levi
**Source:** MEH-2160, closing the class opened by MEH-2156 · MEH-2158 · MEH-2159

## Context

Three tickets landed in a row against `producer_page_views`,
`producer_whatsapp_clicks` and `contact_clicks`. They read as three separate
bugs. They were one:

| rule | was enforced on | was missing from |
|---|---|---|
| `is_bot_user_agent` | page views | both click writers |
| `get_real_client_ip` (trusted proxy) | the rate limiter | **both** analytics writers |
| `is_internal_viewer` (owner/admin skip) | the 3 writers that existed that day | the 4th, written the next week |
| referrer allowlist | page views | — |

Every rule was correct. Every rule was enforced at exactly the site where its
bug had been found, and nowhere else. Nothing in the system stopped the next
contributor from writing `db.add(ProducerPageView(...))` and inheriting none
of them — which is precisely what had happened, three times.

The same argument had already been made in this codebase about the **readers**
of these tables. `unique_views_count`'s docstring records it verbatim:

> *the first shape of this fix deduped three of the table's readers and left
> three raw, and all six render on one dashboard screen*

That was fixed by extracting one function. The **writers** never got the same
treatment.

This is `workflow.md`'s *Smell #1* — two or more parallel paths owning the same
state, each able to succeed while the others drift — and its prescribed remedy:
one authority, the others deleted rather than disabled.

## Decision

**1. `record_analytics_event()` in `backend/app/services/analytics.py` is the
only place an analytics row is written.** It owns every exclusion rule, in a
fixed and documented order:

1. bot user-agent → skip
2. internal viewer (owner / admin) → skip
3. real client IP via the trusted-proxy resolver, then hashed
4. referrer allowlist (page views only)
5. `INSERT` + commit, fail-open with rollback

**2. A test enforces it.** `tests/test_analytics_chokepoint.py` walks the AST of
every file under `backend/app/` and fails on any `db.add()` of a guarded model
outside the choke point. Its message names the file, the line, and the call to
write instead.

**3. The gates the choke point closes are closed for everyone.** The bot filter
and the fail-open write now apply to the click writers too, not only to page
views. That is the point of the ticket, not a side effect — see *Consequences*.

## Why AST and not a regex

Not a style preference. The ticket's own Phase 0 discovery step used a regex:

```
grep -rn "db.add(ProducerPageView\|db.add(ProducerWhatsAppClick\|db.add(ContactClick" backend/app/
```

It returned **zero** matches against a tree containing exactly **three** write
sites. All three were invisible to it:

```
producers.py:540   db.add(\n    ProducerWhatsAppClick(...    <- line split
producers.py:585   db.add(\n    ContactClick(...             <- line split
analytics.py:284   row = ProducerPageView(...); db.add(row)  <- bound to a name
```

Taken at face value, that grep says the premise is refuted and there is nothing
to do. A regex also fails in the opposite direction: it counts model names
inside comments, strings and docstrings — including the ones in the guard file
itself.

**A guard whose instrument cannot see the code it guards is a green light of
unknown wiring.** Hence the tree walk, and hence the self-tests below it.

## The scanner's own self-tests, and why one of them reads a real file

`TestScannerDiscriminates` runs first. If the scanner cannot tell a violation
from clean code, nothing it reports afterwards is worth reading. Seven cases
cover the direct form, the multi-line form, the via-variable form, the
annotated-assignment form, a model name in a comment, an out-of-scope model,
and a read rather than a write.

Six are synthetic. The seventh —
`test_scanner_finds_the_real_choke_point` — reads `services/analytics.py` off
disk and asserts the scanner finds all three models there.

**That case earned its place immediately.** It failed on the first run, for a
real defect the six synthetic cases all passed: the scanner resolved a variable
to the *first* model assigned to it, while the choke point assigns `row` in
three sibling branches. Against the real file it reported one model instead of
three.

This is the repo's own recorded lesson applied in advance: an `ast` probe once
passed four synthetic fixtures and then returned `revision = None` for all 14
real migration files, because every fixture used `ast.Assign` while every real
file used `ast.AnnAssign`. Synthetic cases prove a probe works on shapes you
invented; only a real file proves it recognises the shape the repo uses.

## Consequences

**Two behaviour changes, both deliberate, both stated rather than absorbed:**

- **The bot filter now applies to the click writers.** Previously only page
  views were filtered. For real traffic this is a no-op — bots do not run JS,
  and both click endpoints are reachable only from browser beacons — but a
  direct POST carrying a crawler UA is now skipped where it previously wrote.
  Closing this gap is item one of the table above.
- **Click writes are now fail-open.** Previously a database error inside
  `record_whatsapp_click` propagated as a 500; it is now logged, rolled back and
  swallowed. This matches the page-view writer and the fire-and-forget contract
  every caller already has — none reads the response — but it is a change on the
  error path, and it trades a visible failure for a logged one.

**What is explicitly NOT in scope:** `HomeProductWhatsAppClick`. It has a live
writer (`routers/home_products.py:350`) and belongs to the home-products
subsystem, which is being decommissioned under its own ticket. The guard's
`GUARDED_MODELS` set excludes it deliberately; adding it would red a file this
refactor never touched.

**What this does not buy:** the guard checks one relationship — that these three
models are instantiated-and-added only in one file. It cannot tell a correct
call to the choke point from a wrong one, and it does not stop a writer that
bypasses `db.add` entirely (raw SQL, `bulk_save_objects`, a new model). Those
are real gaps, and they are named here rather than left for a reader to discover
by being wrong.

## Alternatives considered

- **A pre-commit hook instead of a test.** Rejected: hooks are skippable
  (`--no-verify`) and do not run in CI. A test under the required `Backend tests`
  job cannot be skipped.
- **A CI workflow step.** Rejected: `.github/workflows/**` is CC-deny, so it
  would need Sapir to apply a patch. A pytest file needs nobody.
- **Documenting the rule in `.claude/rules/`.** Rejected on this codebase's own
  evidence — the rules already said to propagate these checks, and they were not
  propagated three times running. *Smell #2*: a "remember to also update X" note
  is a docs patch over a missing enforcement mechanism.
- **Widening the guard to every model with a `producer_id`.** Rejected as
  over-engineering; the ticket's guard is explicit about scope.

## Cross-references

- `backend/app/services/analytics.py` — `record_analytics_event`, the order of
  operations, and `EventContext`
- `tests/test_analytics_chokepoint.py` — the enforcement and its self-tests
- `.claude/rules/workflow.md` § *Architectural smell detection* — Smell #1 and #2
- `.claude/rules/testing.md` § *Every new guard test must be shown failing* — the
  discrimination requirement this guard was demonstrated against
