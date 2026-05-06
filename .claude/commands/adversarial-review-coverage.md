Run adversarial review specialized for test-coverage gaps on consumers.

Use this variant when the diff extracts a helper, modifies a component in
`.claude/central-components.json`, adds a new API endpoint, adds a new schema
field consumed by frontend, or introduces a new React component.

The base `/adversarial-review` FINDER doesn't reliably catch the PR #43 class:
PR #43 (`fix/whatsapp-phone-normalize`) extracted `normalizePhone(producer.phone)`
into a helper, deleted the local `const phone = producer.phone;` binding, and
shipped. The helper had unit tests; the consumer JSX still referenced the bare
`phone` identifier in a `tel:` anchor further down `ProducerCard.jsx`. Production
threw `ReferenceError: phone is not defined` on every render across `/`, `/map`,
`/neighbor`. Hotfix: commit `828e9b1` (PR #51). Author's post-mortem flagged
`eslint no-undef` as the would-have-caught rule; this variant's #1 pattern is
the prompt-side equivalent.

Tests live at `frontend/__tests__/<Component>.test.jsx` (Vitest) for
components/utilities and `frontend/e2e/` (Playwright) for flows. Backend API
integration tests: `tests/test_api.py`.

---

## FINDER — coverage-gap patterns

1. **Bare identifier after helper extract** — Diff deletes a `const X = ...`
   binding while introducing a helper call. Grep the entire file (and component
   tree if shared) for remaining `{X}` / `${X}` / `X.` references that the
   helper call didn't replace. Canonical: PR #43 / commit `828e9b1`.
2. **Helper extracted, consumer not re-tested** — Diff adds a new file under
   `frontend/lib/` with a unit test, but the consumer component's existing
   `frontend/__tests__/<Consumer>.test.jsx` is untouched. The unit test proves
   the helper, not the integration.
3. **New API endpoint without integration test** — New route in
   `backend/app/routers/` without a matching case in `tests/test_api.py`.
4. **New schema field without serialization test** — New `*Out` field
   referenced by frontend code without a test asserting the field shape.
   (Often overlaps with the `-types` variant; if `-types` ran clean, this is a
   no-op.)
5. **New React component without render test** — New file under
   `frontend/components/` or `frontend/app/.../*.jsx` without a matching
   `frontend/__tests__/<Name>.test.jsx`.
6. **Central component edited without test diff** — File listed in
   `.claude/central-components.json` modified, and no corresponding
   `frontend/__tests__/<Name>.test.jsx` (or `tests/test_api.py` case) appears
   in the diff. Central components carry logic risk > syntax risk
   (testing.md rule 20).

---

## ADVERSARY — rejection criteria

- Is the consumer marked trivially-untested in code (e.g. inline comment
  `// intentionally untested — pure layout`)? Reject pattern #5.
- Does Playwright integration coverage exist for this surface
  (`frontend/e2e/flows/*.spec.ts` matches the consumer's user-visible name)?
  Reject patterns #2, #5.
- Was the helper inlined back into a single consumer (no extraction —
  same-file refactor)? Reject patterns #1, #2 — no integration risk.
- Was a test added in a sibling file (helper's own `*.test.js`) AND the
  consumer's call-site is mechanically equivalent (same arity, same return
  shape)? Reject pattern #2 only — pattern #1 still applies if any binding
  was deleted from the consumer.
- Is the component dev-only / Storybook / admin-debug surface? Reject pattern
  #5 (still warn on patterns #1 and #6).

---

## REFEREE — verdict tiering

- **BLOCK** — Pattern #1 (bare identifier after extract — PR #43 class) and
  #6 (central component edited without test diff). Pattern #1 = regression
  rule 1 (grep before delete) violation. Pattern #6 = workflow rule 20
  surface (central components carry logic risk > syntax risk).
- **WARN** — Pattern #2 (helper extracted, consumer not re-tested), #3 (new
  endpoint without `tests/test_api.py` case), #5 (new component without
  render test). Promote to BLOCK if the surface is production-facing
  (homepage, /map, /producers, /register, auth).
- **INFO** — Pattern #4 (schema-field serialization gap). Cite-only here;
  the `-types` variant's drift checks plus ADR-006 R2 own this surface.

Output: numbered list of real BLOCKs first, then WARNs, then INFO refs. Each
entry: `<file>:<line> — <pattern #> — <one-line evidence>`.
