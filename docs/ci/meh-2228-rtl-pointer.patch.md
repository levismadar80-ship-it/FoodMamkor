# MEH-2228 — `.claude/rules/rtl.md` z-token section → pointer at the enforced contract

**Staged for Sapir.** `.claude/rules/**` is CC-deny for the session that shipped
`scripts/checks/z-index-tokens.sh`, so the doc change the card asks for
("rtl.md's table points at [the token scale] rather than duplicating it") is
written here as an exact old/new pair and not applied.

## What the card asked, and why it cannot be done literally

Acceptance criterion 4 says the table becomes a pointer. Acceptance criterion 5
says `frontend/__tests__/ZTokenLedgerSync.test.js` stays green and untouched —
and that test **parses the table's rows out of rtl.md** (`ledgerRows()` at
`ZTokenLedgerSync.test.js:56-62`, regex `^\|\s*\`z-\[(\d+)\]\`\s*\|\s*(\d+)\s*\|`)
and asserts set-equality and per-row counts against the code. Remove the rows
and that test reds in the "ledger parser found no table rows" control.

So the two criteria collide, and the resolution below keeps the **rows** (they
are the ledger test's subject) and turns the **prose that claims the table is
the enforcement** into a pointer at what now actually enforces:
`scripts/checks/z-index-tokens.sh` + `scripts/checks/z-index-baseline.txt`,
under the required *Repo guards* job. Sapir's call whether to go further and
retire the ledger test in a separate ticket; this patch does not presume it.

## The edit — one paragraph, `rtl.md:121-125`

**OLD** (verbatim, the paragraph under `### The full live table (MEH-2093 chunk C)`):

```
**Every `z-[N]` that appears in a className under `frontend/app` +
`frontend/components`.** The chain above is the mental model; this is the
inventory. `frontend/__tests__/ZTokenLedgerSync.test.js` fails if code and this
table disagree in either direction, so the "mirrors it" claim below is now
mechanically true rather than aspirational.
```

**NEW:**

```
**Every `z-[N]` that appears in a className under `frontend/app` +
`frontend/components`.** The chain above is the mental model; this is the
inventory. It is **documentation of a machine-checked contract, not the
contract**: the gate is `scripts/checks/z-index-tokens.sh` (MEH-2228), which
freezes every literal z-index in `frontend/` — Tailwind `z-[N]`, CSS `z-index:
N`, inline `zIndex: N` — occurrence by occurrence in
`scripts/checks/z-index-baseline.txt` and reds the required *Repo guards* job on
any literal not in that file, or any baseline line that no longer matches (the
file can only shrink). A new z value therefore needs `--update-baseline` **and
a reason in the PR body** before it can land; this table then records it.
`frontend/__tests__/ZTokenLedgerSync.test.js` keeps the rows below in sync with
the code in both directions, so "mirrors it" stays mechanically true — but a
table that is in sync is not evidence a value is right for its context
(MEH-2148: MiniMap's `z-[1000]` was recorded correctly for months while painting
over a CTA), which is why the gate sits in front of it.
```

## What the patch deliberately does NOT touch

- The table rows (`rtl.md:129-150`) — the ledger test reads them.
- The chain block (`rtl.md:111-117`) — it is the mental model, not a claim of
  enforcement.
- The "Code is the source of truth; this ledger mirrors it — update the table
  when a component's z-index changes" paragraph (`rtl.md:214-230`) — still
  true; the ledger test enforces exactly that sentence.

## Verify after applying

```
cd frontend && npx vitest run __tests__/ZTokenLedgerSync.test.js   # still green — rows untouched
bash scripts/checks/z-index-tokens.sh                              # unaffected — reads frontend/, not rtl.md
```
