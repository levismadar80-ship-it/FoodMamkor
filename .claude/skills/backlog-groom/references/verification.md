# Verification — how to check a card's claims

The groom's authority comes entirely from checking claims against the repository.
A verdict with no `file:line`, SHA or PR behind it is an opinion.

## Read the branch, never the working tree

A grooming pass usually runs while a session has a feature branch checked out. Reading
files directly would mix unmerged work into the evidence. Always name the ref:

```
git show origin/staging:<path>                  # a file as it really is
git grep -n "<pattern>" origin/staging -- '<glob>'
git ls-tree -r --name-only origin/staging -- <dir>
git log --format='%ci %h %s' -5 origin/staging -- <path>
```

## Prove the clone is not shallow before any provenance claim

```
git rev-parse --is-shallow-repository        # MUST print false
git fetch --unshallow origin                 # if it printed true
```

A shallow clone does not error — it reports the graft commit as though it introduced
every file, so "last changed in X" comes back plausible and wrong.

## Verify the negative

A search that returns nothing is **not** evidence until the same search has been shown
to find something you know exists. Run it once against a known-positive first.

The failure is not hypothetical: a `list_issues` call filtered by `updatedAt` returned
an empty set on the first run while cards updated that same hour existed. It did not
error. It returned a confident, reassuring, wrong answer.

## Dates are an argument

When a card blames code for a failure, compare **when the code last changed** with
**when the failure started**:

```
git log --format='%ci %h' -3 origin/staging -- <the file the card blames>
```

If the code was constant across that boundary, the cause is elsewhere — configuration,
data, or an environment. That single comparison reclassified a "seed bug" as data drift
on the first run.

## Tickets can vanish

`get_issue` on a referenced identifier can return *"Could not find referenced Issue"* —
not archived, not Done, simply gone. Treat that as its own case and **say so**; it is
not evidence that the work shipped, and it is not evidence that it didn't. Where the
work does survive, the code usually says so in a comment naming the old ticket.
