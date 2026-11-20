# One-off QA probes (archive)

Hand-run scripts written to verify one card each (`qa-meh<N>-*.mjs`). No CI job
runs them and Playwright does not match them (`*.spec.ts` only). Kept for their
history and as examples; relative paths were adjusted for this folder
(MEH-3531, 20/11/2026).

A new one-off probe does not go here or in any test glob — use a scratch
directory (workflow rule 42). Two probes still in live use stay in
`frontend/e2e/`: `qa-meh1853-cls.mjs` (cls-measure.yml) and
`qa-meh1619-visual-noop.mjs` (.claude/rules/frontend.md).

Run any of them from `frontend/`: `node e2e/_qa-archive/<file>.mjs`. Paths in
their headers were updated on the move; findings inside them are as of the
card they were written for, not today.
