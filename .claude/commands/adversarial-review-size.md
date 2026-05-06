Run adversarial review specialized for code-size drift on central components.

Use this variant when the diff touches any file listed in
`.claude/central-components.json` (13 files: `MapClient.jsx`, `MapComponent.jsx`,
`producers/page.jsx`, `app/page.js`, `app/layout.js`, `language-context.js`,
`ProducerCard.jsx`, `Header.jsx`, `BottomNav.jsx`, `Footer.jsx`, `main.py`,
`auth.py`, `config.py`).

The base `/adversarial-review` FINDER doesn't reliably catch the MEH-407 class:
4 god-files accumulated 40+ logic-risk issues before the reactive refactor.
Round 1 shipped: `main.py` 220→50, `ProducerDetail.jsx` 900→181, `MapClient.jsx`
885→310. Round 2 queued post-launch: `app/page.js` (~960 LOC, MEH-437),
`backend/app/routers/producers.py` (~600 LOC w/ 16+ params, MEH-438). Even
post-split, `MapPage` inner function in `MapClient.jsx` is still 233 LOC and
hits the existing `max-lines-per-function: 50` warn ceiling. HANDOFF lesson:
**pre/post baseline is non-negotiable** — pytest counts + `npm run build` +
RTL/z-index grep counts before any structural change.

Existing lint thresholds (warn mode, `frontend/eslint.config.mjs` +
`backend/pyproject.toml [tool.ruff.lint.pylint]`):

- `max-lines: 250` (file), `max-lines-per-function: 50`, `max-params: 2`,
  `complexity: 10`, `max-depth: 4` (frontend)
- `max-args=5` (PLR0913), `max-statements=50` (PLR0915), `max-branches=12`
  (PLR0912), `max-complexity=10` (C901) (backend)

This variant blocks at 2× the warn ceiling, leaving a tolerated 50→100 zone.

---

## FINDER — code-size patterns

1. **Net-positive LOC delta on a central-component file** — `wc -l` on the
   pre vs post version of any path in `.claude/central-components.json`.
   BLOCK unless the PR body contains `MEH-407` or another active refactor
   ticket ID with explicit "net-positive justified by [reason]".
2. **New or extended function > 100 LOC / > 100 statements** — 2× the
   existing warn threshold (`max-lines-per-function: 50` / PLR0915
   `max-statements=50`). Catches god-functions even in already-split files
   (e.g. `MapPage` 233 LOC).
3. **Class definition > 7 distinct methods or > 200 LOC** — god-class smell;
   no codebase rule today, picked from MEH-407's "7+ distinct
   responsibilities by visual inspection" criterion.
4. **Nesting depth > 4 levels in a central component** — overshoots ESLint
   `max-depth: 4` (warn). On a central component the warn becomes a BLOCK
   candidate; outside, leave to lint.
5. **New top-level `useState` on a god-component** — state proliferation is
   the MEH-407 lead indicator. Any net-new top-level hook in a file already
   in `.claude/central-components.json` triggers a WARN.
6. **New imports on a central-component file** — signals new responsibilities
   absorbed into a god-file. Diff's `+import` lines on any path in
   `.claude/central-components.json` triggers a WARN.

---

## ADVERSARY — rejection criteria

- Does the PR body cite an active refactor MEH-* ticket (e.g. MEH-407 Round 2,
  MEH-437, MEH-438, MEH-440) AND explicitly justify the net-positive
  ("extracting hook from `MapPage`, +40 lines new file, +0 net to receiving
  shell")? Reject pattern #1.
- Is the delta only comment lines (e.g. `// rtl-ok` annotations from
  MEH-365/426, `# noqa: BLE001 — fail-open by design` from MEH-325)? Reject
  pattern #1.
- Is the delta a documented split — extracting hooks/components per MEH-407 —
  where net-positive in the *receiving* file is a deliberate consolidation?
  Reject pattern #1 with cite.
- Is the long function auto-generated (Alembic revision, OpenAPI client,
  protobuf stub)? Reject pattern #2 — Alembic versions are sequential SQL ops,
  not logic; `pyproject.toml` already exempts `alembic/versions/**` from
  PLR0915/PLR0912.
- Did the new `useState` replace a `useReducer` or context simplification
  (state count went *down* logically even if hook count went up by one)?
  Reject pattern #5.

---

## REFEREE — verdict tiering

- **BLOCK** — Pattern #1 (net-positive on central without justification),
  Pattern #2 (function > 100 LOC / 100 statements). Both are MEH-407's hard
  signals; both shipped real god-file pain.
- **WARN** — Patterns #3 (god-class), #4 (nesting > 4 in central component),
  #5 (new top-level useState in god-component), #6 (new imports on central).
  Promote to BLOCK only if **3+ WARNs cluster on the same file** (the
  god-file accretion pattern: state + imports + nesting all rising at once).
- **INFO** — Match against MEH-407 Round 2 known-queued work (`app/page.js`
  → MEH-437, `routers/producers.py` → MEH-438, `routers/auth.py` → MEH-440,
  `frontend/components/ProducerDetail.jsx` already done, etc.). Cite the
  ticket; no action — already tracked.

Output: numbered list of real BLOCKs first, then WARNs, then INFO refs. Each
entry: `<file>:<line> — <pattern #> — <one-line evidence>`.
