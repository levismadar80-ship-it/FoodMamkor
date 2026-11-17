# System map and state machines — keep them true

Two documents describe the system as it runs:
[docs/SYSTEM_MAP.md](../../docs/SYSTEM_MAP.md) (components, what talks to
what, where data lives, what gives first under load) and
[docs/STATE_MACHINES.md](../../docs/STATE_MACHINES.md) (every status, who moves
it, where).

A PR updates them in the same diff when it does any of these:

| The PR… | Update |
|---|---|
| adds, renames or removes a status value or a status column | STATE_MACHINES: the section, and the «Every status column» table |
| adds a transition, or a new way out of a state (a new route, job or admin action that writes a status) | STATE_MACHINES: the transition table of that machine |
| adds an external service, a webhook, a scheduled job or a new store (a cache, a queue, a bucket, browser storage that holds user data) | SYSTEM_MAP: the diagram, «What talks to what», «Where each kind of data lives» |
| moves data from one store to another (e.g. the token from localStorage to a cookie) | SYSTEM_MAP: «Where each kind of data lives» |
| changes a limit that decides what breaks first (pool size, a plan, a replica count, caching of public pages) | SYSTEM_MAP: «What gives first under load» |

What is checked, and what is not:

- `tests/test_state_machines_doc_sync.py` fails when a status column in the
  models has no row in STATE_MACHINES, or a row names a column that is gone.
- Nothing checks transitions, services or stores. The fresh reviewer (rule 5a)
  is asked which docs describe the diff; these two are on that list.

A machine that is explicit in code (a transition table, a CHECK constraint) is
described by pointing at it, not by copying it.
